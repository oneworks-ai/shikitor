import { describe, expect, test } from 'vitest'

import {
  hasRangeHighlights,
  normalizeLineHighlights,
  rangeHighlightDecorations,
  resolveLineHighlight
} from '../../src/creator/controlled/highlightNormalizer'

describe('highlight normalization', () => {
  test('supports isolated lines, inclusive ranges, and deterministic overlap', () => {
    const highlights = normalizeLineHighlights([
      { color: ' gold ', lines: [2, { start: 4, end: 6 }, 9] },
      { color: 'blue', lines: [{ start: 5, end: 5 }], className: 'active' },
      { color: '', lines: [1] },
      { color: 'red', lines: [0, { start: 8, end: 7 }] }
    ])

    expect(highlights).toEqual([
      { color: 'gold', start: 2, end: 2, index: 0 },
      { color: 'gold', start: 4, end: 6, index: 0 },
      { color: 'gold', start: 9, end: 9, index: 0 },
      { color: 'blue', start: 5, end: 5, index: 1, className: 'active' }
    ])
    expect(resolveLineHighlight(3, highlights)).toBeUndefined()
    expect(resolveLineHighlight(4, highlights)?.color).toBe('gold')
    expect(resolveLineHighlight(5, highlights)?.color).toBe('blue')
    expect(resolveLineHighlight(9, highlights)?.color).toBe('gold')
  })

  test('converts discontinuous source ranges into Shiki decorations', () => {
    const highlights = [{
      color: 'rgba(59, 130, 246, .2)',
      className: 'search-hit',
      ranges: [
        { start: 1, end: 4 },
        { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } }
      ]
    }]

    expect(hasRangeHighlights(highlights)).toBe(true)
    expect(rangeHighlightDecorations(highlights)).toEqual([
      {
        start: 1,
        end: 4,
        alwaysWrap: true,
        properties: {
          class: 'shikitor-range-highlight search-hit',
          style: '--shikitor-highlight-color:rgba(59, 130, 246, .2)',
          'data-shikitor-range-highlight': '0'
        }
      },
      {
        start: { line: 1, character: 2 },
        end: { line: 1, character: 5 },
        alwaysWrap: true,
        properties: {
          class: 'shikitor-range-highlight search-hit',
          style: '--shikitor-highlight-color:rgba(59, 130, 246, .2)',
          'data-shikitor-range-highlight': '0'
        }
      }
    ])
    expect(hasRangeHighlights([{ color: 'red', lines: [1] }])).toBe(false)
  })
})
