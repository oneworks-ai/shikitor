import { describe, expect, it } from 'vitest'

import {
  buildFoldHiddenIndex,
  buildFoldLineStarts,
  buildFoldWidgetHeightIndex,
  findFoldRanges,
  isFoldLineHidden,
  isFoldSelectAllShortcut,
  normalizeFoldedKeyboardOffset,
  resolveFoldKeyboardSelection,
  resolveFoldLineEnd,
  resolveFoldScrollMetrics,
  resolveFoldVisibleLines,
  resolveFoldVisibleRow,
  resolveFoldVisualKeyboardOffset,
  resolveFoldVisualOffset,
  resolveFoldWidgetHeightBefore,
  shouldUseFoldVisualHorizontalScroll
} from '../../src/plugins/code-folding'
import { getRawTextHelper } from '../../src/utils/getRawTextHelper'

/** Reference implementation of the per-call range scan the index replaces. */
function referenceHidden(
  ranges: readonly { startLine: number; endLine: number }[],
  collapsed: ReadonlySet<number>,
  line: number
) {
  return ranges.some(range =>
    collapsed.has(range.startLine)
    && line > range.startLine
    && line <= range.endLine
  )
}

describe('code folding hidden-line index', () => {
  const ranges = [
    { startLine: 2, endLine: 6 },
    { startLine: 4, endLine: 5 },
    { startLine: 9, endLine: 12 },
    { startLine: 14, endLine: 14 }
  ]

  it('marks the bodies of collapsed ranges hidden and keeps start lines visible', () => {
    const index = buildFoldHiddenIndex(ranges, new Set([2, 9, 14]), 15)

    expect(index.lineCount).toBe(15)
    expect([...index.hidden].slice(1)).toEqual([
      0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0
    ])
    expect(index.visibleLineCount).toBe(8)
    for (let line = 0; line <= 16; line++) {
      expect(isFoldLineHidden(index, line)).toBe(referenceHidden(ranges, new Set([2, 9, 14]), line))
    }
  })

  it('ignores expanded ranges and clamps ranges that run past the document', () => {
    const index = buildFoldHiddenIndex(
      [{ startLine: 1, endLine: 3 }, { startLine: 3, endLine: 40 }],
      new Set([3]),
      5
    )

    expect([...index.hidden].slice(1)).toEqual([0, 0, 0, 1, 1])
    expect(index.visibleLineCount).toBe(3)
    expect(isFoldLineHidden(index, 6)).toBe(false)
    expect(isFoldLineHidden(index, 40)).toBe(false)
    expect(resolveFoldVisibleLines(index)).toEqual([1, 2, 3])
  })

  it('attributes hidden lines to the first collapsed range in list order', () => {
    const overlapping = [
      { startLine: 10, endLine: 20 },
      { startLine: 1, endLine: 4 },
      { startLine: 3, endLine: 12 }
    ]
    const collapsed = new Set([10, 1, 3])
    const index = buildFoldHiddenIndex(overlapping, collapsed, 20)
    const referenceOwner = (line: number) => overlapping.findIndex(range =>
      collapsed.has(range.startLine) && line > range.startLine && line <= range.endLine
    )

    for (let line = 1; line <= 20; line++) {
      expect(index.ownerRangeIndex[line]).toBe(referenceOwner(line))
    }
    expect(index.ownerRangeIndex[2]).toBe(1)
    expect(index.ownerRangeIndex[4]).toBe(1)
    expect(index.ownerRangeIndex[5]).toBe(2)
    expect(index.ownerRangeIndex[11]).toBe(0)
    expect(index.ownerRangeIndex[20]).toBe(0)
    expect(index.ownerRangeIndex[1]).toBe(-1)
  })

  it('maps source lines onto visual rows with prefix sums', () => {
    const collapsed = new Set([2, 9])
    const index = buildFoldHiddenIndex(ranges, collapsed, 15)
    const referenceRow = (line: number) => {
      let row = 0
      for (let sourceLine = 1; sourceLine <= line; sourceLine++) {
        if (!referenceHidden(ranges, collapsed, sourceLine)) row++
      }
      return Math.max(1, row)
    }

    for (let line = 0; line <= 18; line++) {
      expect(resolveFoldVisibleRow(index, line)).toBe(referenceRow(line))
    }
    expect(resolveFoldVisibleRow(index, 1)).toBe(1)
    expect(resolveFoldVisibleRow(index, 2)).toBe(2)
    expect(resolveFoldVisibleRow(index, 6)).toBe(2)
    expect(resolveFoldVisibleRow(index, 7)).toBe(3)
    expect(resolveFoldVisibleRow(index, 13)).toBe(6)
    expect(resolveFoldVisibleRow(index, 0)).toBe(1)
    expect(resolveFoldVisibleRow(index, Number.NaN)).toBe(1)
    expect(resolveFoldVisibleRow(index, 18)).toBe(11)
    expect(resolveFoldVisibleLines(index)).toEqual([1, 2, 7, 8, 9, 13, 14, 15])
  })

  it('lists every line when nothing is collapsed', () => {
    const index = buildFoldHiddenIndex(ranges, new Set(), 4)

    expect(resolveFoldVisibleLines(index)).toEqual([1, 2, 3, 4])
    expect(index.visibleLineCount).toBe(4)
    expect(resolveFoldVisibleRow(index, 4)).toBe(4)
  })
})

describe('code folding widget height index', () => {
  it('sums the widgets anchored strictly before a line', () => {
    const index = buildFoldWidgetHeightIndex([
      { afterLine: 8, height: 40 },
      { afterLine: 2, height: 10 },
      { afterLine: 0, height: 5 },
      { afterLine: 8, height: 4 },
      { afterLine: Number.NaN, height: 100 }
    ])
    const reference = (line: number) => [5, 10, 40, 4]
      .reduce((sum, height, position) => sum + ([0, 2, 8, 8][position] < line ? height : 0), 0)

    expect(index.afterLines).toEqual([0, 2, 8, 8])
    expect(index.cumulativeHeights).toEqual([0, 5, 15, 55, 59])
    for (let line = 0; line <= 12; line++) {
      expect(resolveFoldWidgetHeightBefore(index, line)).toBe(reference(line))
    }
    expect(resolveFoldWidgetHeightBefore(index, 1)).toBe(5)
    expect(resolveFoldWidgetHeightBefore(index, 2)).toBe(5)
    expect(resolveFoldWidgetHeightBefore(index, 3)).toBe(15)
    expect(resolveFoldWidgetHeightBefore(index, 9)).toBe(59)
    expect(resolveFoldWidgetHeightBefore(index, Number.NaN)).toBe(0)
  })

  it('returns zero without widgets', () => {
    const index = buildFoldWidgetHeightIndex([])

    expect(resolveFoldWidgetHeightBefore(index, 1)).toBe(0)
    expect(resolveFoldWidgetHeightBefore(index, 500)).toBe(0)
  })
})

describe('code folding line offsets', () => {
  it('matches the raw text helper for LF and CRLF documents', () => {
    for (const value of [
      'const a = 1\nfunction f() {\n  return a\n}\n',
      'one\r\ntwo\r\n\r\nfour',
      'single line',
      '',
      '\n\n'
    ]) {
      const helper = getRawTextHelper(value)
      const starts = buildFoldLineStarts(value)
      const lineCount = value.split('\n').length

      expect(starts).toHaveLength(lineCount)
      for (let line = 1; line <= lineCount; line++) {
        expect(starts[line - 1]).toBe(helper.lineStart({ line, character: 0 }))
        expect(resolveFoldLineEnd(value, starts[line - 1]))
          .toBe(helper.lineEnd({ line, character: 0 }))
        expect(starts[line - 1] + 3).toBe(helper.resolvePosition({ line, character: 3 }).offset)
      }
    }
  })
})

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
