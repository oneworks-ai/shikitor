import { describe, expect, it } from 'vitest'

import {
  findFoldRanges,
  isFoldSelectAllShortcut,
  normalizeFoldedKeyboardOffset,
  resolveFoldKeyboardSelection,
  resolveFoldScrollMetrics,
  resolveFoldVisualKeyboardOffset,
  resolveFoldVisualOffset,
  shouldUseFoldVisualHorizontalScroll
} from '../../src/plugins/code-folding'

describe('code folding ranges', () => {
  it('maps pointer positions onto folded suffix source offsets', () => {
    const boundaries = [
      { x: 0, offset: 0 },
      { x: 80, offset: 8 },
      { x: 110, offset: 40 },
      { x: 150, offset: 44 }
    ]

    expect(resolveFoldVisualOffset(boundaries, 104)).toBe(40)
    expect(resolveFoldVisualOffset(boundaries, 143)).toBe(44)
    expect(resolveFoldVisualOffset([], 20)).toBeUndefined()
  })

  it('moves the keyboard caret across a folded placeholder as one visual unit', () => {
    const boundaries = [
      { x: 0, offset: 24 },
      { x: 10, offset: 25 },
      { x: 20, offset: 26 },
      { x: 20, offset: 26 },
      { x: 48, offset: 50 },
      { x: 48, offset: 50 },
      { x: 58, offset: 51 },
      { x: 68, offset: 52 }
    ]

    expect(resolveFoldVisualKeyboardOffset(boundaries, 26, 'forward')).toBe(50)
    expect(resolveFoldVisualKeyboardOffset(boundaries, 50, 'backward')).toBe(26)
    expect(resolveFoldVisualKeyboardOffset(boundaries, 50, 'forward')).toBe(51)
    expect(resolveFoldVisualKeyboardOffset(boundaries, 51, 'backward')).toBe(50)
  })

  it('snaps a hidden programmatic cursor to the requested placeholder edge', () => {
    const boundaries = [
      { x: 0, offset: 26 },
      { x: 28, offset: 50 },
      { x: 38, offset: 51 }
    ]

    expect(resolveFoldVisualKeyboardOffset(boundaries, 34, 'backward')).toBe(26)
    expect(resolveFoldVisualKeyboardOffset(boundaries, 34, 'forward')).toBe(50)
    expect(resolveFoldVisualKeyboardOffset([], 34, 'forward')).toBeUndefined()
  })

  it('keeps modifier navigation endpoints out of hidden folded source', () => {
    const intervals = [
      { start: 26, end: 50 },
      { start: 70, end: 90 }
    ]

    expect(normalizeFoldedKeyboardOffset(intervals, 34, 'backward')).toBe(26)
    expect(normalizeFoldedKeyboardOffset(intervals, 34, 'forward')).toBe(50)
    expect(normalizeFoldedKeyboardOffset(intervals, 26, 'forward')).toBe(26)
    expect(normalizeFoldedKeyboardOffset(intervals, 50, 'backward')).toBe(50)
    expect(normalizeFoldedKeyboardOffset(intervals, 60, 'forward')).toBe(60)
  })

  it('only preserves the selection anchor for shift-modified navigation', () => {
    expect(resolveFoldKeyboardSelection(26, 50, false)).toEqual({
      anchor: 50,
      focus: 50
    })
    expect(resolveFoldKeyboardSelection(26, 50, true)).toEqual({
      anchor: 26,
      focus: 50
    })
  })

  it('recognizes platform select-all without consuming modified variants', () => {
    const shortcut = (overrides: Partial<KeyboardEvent>) => isFoldSelectAllShortcut({
      altKey: false,
      ctrlKey: false,
      key: 'a',
      metaKey: false,
      shiftKey: false,
      ...overrides
    })

    expect(shortcut({ metaKey: true })).toBe(true)
    expect(shortcut({ ctrlKey: true })).toBe(true)
    expect(shortcut({ metaKey: true, key: 'A' })).toBe(true)
    expect(shortcut({ metaKey: true, shiftKey: true })).toBe(false)
    expect(shortcut({ ctrlKey: true, altKey: true })).toBe(false)
    expect(shortcut({ metaKey: true, key: 'ArrowLeft' })).toBe(false)
  })

  it('lets a composed folded line own horizontal scrolling', () => {
    expect(shouldUseFoldVisualHorizontalScroll(true, 1422, 634)).toBe(true)
    expect(shouldUseFoldVisualHorizontalScroll(false, 1422, 634)).toBe(false)
    expect(shouldUseFoldVisualHorizontalScroll(true, 634, 1422)).toBe(false)
  })

  it('classifies multiline imports and preserves their closing suffix', () => {
    const ranges = findFoldRanges(`import {
  definePlugin,
  type Shikitor
} from '@shikitor/core'`)

    expect(ranges).toEqual([expect.objectContaining({
      startLine: 1,
      endLine: 4,
      closeColumn: 0,
      kind: 'import'
    })])
  })

  it('folds consecutive line comments without a synthetic suffix', () => {
    const ranges = findFoldRanges(`// Summary
// Detail one
// Detail two

const ready = true`)

    expect(ranges).toEqual([expect.objectContaining({
      startLine: 1,
      endLine: 3,
      close: '',
      kind: 'line-comment'
    })])
  })

  it('classifies multiline block comments', () => {
    const ranges = findFoldRanges(`/**
 * Summary
 */
const ready = true`)

    expect(ranges).toEqual([expect.objectContaining({
      startLine: 1,
      endLine: 3,
      close: '*/',
      kind: 'block-comment'
    })])
  })

  it('groups multiple imports across blank lines and comments', () => {
    const ranges = findFoldRanges(`import React from 'react'
import {
  type Shikitor
} from '@shikitor/core'

/* Runtime integration */
import { Context } from 'cordis'

const runtime = new Context()`)

    expect(ranges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        startLine: 1,
        endLine: 7,
        kind: 'import-group'
      }),
      expect.objectContaining({
        startLine: 2,
        endLine: 4,
        kind: 'import'
      })
    ]))
  })

  it('splits import groups when executable code appears between them', () => {
    const ranges = findFoldRanges(`import React from 'react'
import type { Shikitor } from '@shikitor/core'

const runtime = createRuntime()

// Optional tooling
import { createLogger } from './logger'
import './editor.css'`)

    expect(ranges.filter(range => range.kind === 'import-group')).toEqual([
      expect.objectContaining({ startLine: 1, endLine: 2 }),
      expect.objectContaining({ startLine: 7, endLine: 8 })
    ])
  })

  it('does not create an import group for a single declaration', () => {
    const ranges = findFoldRanges(`import React from 'react'

const ready = true`)

    expect(ranges.some(range => range.kind === 'import-group')).toBe(false)
  })
})

describe('code folding scroll geometry', () => {
  it('disables vertical scrolling when visible rows fit in the viewport', () => {
    expect(resolveFoldScrollMetrics(198, 440, 120, 436)).toEqual({
      scrollTop: 0,
      maxScrollTop: 0,
      thumbTop: 0,
      thumbHeight: 436
    })
  })

  it('clamps scrolling and maps it to a visual scrollbar thumb', () => {
    expect(resolveFoldScrollMetrics(880, 440, 660, 436)).toEqual({
      scrollTop: 440,
      maxScrollTop: 440,
      thumbTop: 218,
      thumbHeight: 218
    })
  })

  it('keeps a minimum draggable thumb for very long folded documents', () => {
    expect(resolveFoldScrollMetrics(44000, 440, 22000, 436)).toEqual({
      scrollTop: 22000,
      maxScrollTop: 43560,
      thumbTop: 208.08080808080808,
      thumbHeight: 24
    })
  })

  it('maps wide source content onto a horizontal scrollbar', () => {
    expect(resolveFoldScrollMetrics(1284, 606, 339, 592)).toEqual({
      scrollTop: 339,
      maxScrollTop: 678,
      thumbTop: 156.29906542056074,
      thumbHeight: 279.4018691588785
    })
  })
})
