import { describe, expect, it } from 'vitest'

import { findFoldRanges, resolveFoldScrollMetrics } from '../../src/plugins/code-folding'

describe('code folding ranges', () => {
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
