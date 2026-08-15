import { describe, expect, test } from 'vitest'

import {
  clipVisualRange,
  normalizeAtomicReplacementSelection,
  normalizeCollapsedReplacementSelection,
  resolveAtomicDeletionRange,
  resolveAtomicReplacementBoundary,
  resolveCollapsedReplacementBoundary,
  resolveInlineReplacementCursorX,
  resolveReplacementScrollLeft,
  resolveVisibleArrowOffset,
  resolveVisualCharacterAtX
} from '../../src/plugins/inline-replacements/geometry'
import { currentReplacementElements } from '../../src/plugins/inline-replacements/ranges'
import { resolveSelectionFocus } from '../../src/utils/resolveSelectionFocus'

describe('inline replacement geometry', () => {
  const metrics = [{
    start: 0,
    end: 1,
    sourceStartX: 0,
    sourceEndX: 6.6,
    visualWidth: 11
  }]

  test('moves cursor stops after a wider replacement while preserving offsets', () => {
    expect(resolveInlineReplacementCursorX(0, 0, metrics)).toBe(0)
    expect(resolveInlineReplacementCursorX(6.6, 1, metrics)).toBe(11)
    expect(resolveInlineReplacementCursorX(13.2, 2, metrics)).toBe(17.6)
  })

  test('collapses atomic cursor geometry to the two visible boundaries', () => {
    const atomic = [{ ...metrics[0], atomic: true, end: 19, sourceEndX: 60 }]

    expect(resolveInlineReplacementCursorX(0, 0, atomic)).toBe(0)
    expect(resolveInlineReplacementCursorX(20, 4, atomic)).toBe(0)
    expect(resolveInlineReplacementCursorX(40, 10, atomic)).toBe(11)
    expect(resolveInlineReplacementCursorX(60, 19, atomic)).toBe(11)
  })

  test('maps pointer coordinates through the replacement midpoint', () => {
    const positions = [0, 11, 17.6, 24.2]
    const positionAt = (character: number) => positions[character]

    expect(resolveVisualCharacterAtX(3, 5, positionAt)).toBe(0)
    expect(resolveVisualCharacterAtX(3, 6, positionAt)).toBe(1)
    expect(resolveVisualCharacterAtX(3, 14, positionAt)).toBe(1)
    expect(resolveVisualCharacterAtX(3, 15, positionAt)).toBe(2)
  })

  test('uses the focus edge for forward and backward selections', () => {
    expect(resolveSelectionFocus(0, 1, 'forward')).toBe(1)
    expect(resolveSelectionFocus(0, 1, 'backward')).toBe(0)
  })

  test('clips selection rectangles to the visible editor viewport', () => {
    expect(clipVisualRange(-20, 120, 100)).toEqual({ left: 0, width: 100 })
    expect(clipVisualRange(80, 140, 100)).toEqual({ left: 80, width: 20 })
    expect(clipVisualRange(120, 140, 100)).toBeUndefined()
  })

  test('maps native scrolling onto the rendered replacement width', () => {
    expect(resolveReplacementScrollLeft(95.5, 550, 454, 454)).toBe(0)
    expect(resolveReplacementScrollLeft(50, 200, 150, 100)).toBe(25)
    expect(resolveReplacementScrollLeft(100, 200, 300, 100)).toBe(200)
  })

  test('skips collapsed source syntax between visible caret stops', () => {
    const collapsed = [{ start: 5, end: 19 }]

    expect(resolveVisibleArrowOffset(4, 'right', collapsed, 20)).toBe(5)
    expect(resolveVisibleArrowOffset(5, 'right', collapsed, 20)).toBe(20)
    expect(resolveVisibleArrowOffset(10, 'right', collapsed, 20)).toBe(20)
    expect(resolveVisibleArrowOffset(19, 'right', collapsed, 20)).toBe(20)
    expect(resolveVisibleArrowOffset(20, 'left', collapsed, 20)).toBe(19)
    expect(resolveVisibleArrowOffset(19, 'left', collapsed, 20)).toBe(4)
    expect(resolveVisibleArrowOffset(10, 'left', collapsed, 20)).toBe(4)
    expect(resolveVisibleArrowOffset(5, 'left', collapsed, 20)).toBe(4)
    expect(resolveVisibleArrowOffset(5, 'right', collapsed, 19)).toBe(19)
    expect(resolveCollapsedReplacementBoundary(5, 'right', collapsed)).toBe(19)
    expect(resolveCollapsedReplacementBoundary(19, 'left', collapsed)).toBe(5)
    expect(resolveCollapsedReplacementBoundary(4, 'right', collapsed)).toBe(4)
  })

  test('normalizes modified navigation without partial collapsed selections', () => {
    const collapsed = [{ start: 5, end: 19 }]

    expect(normalizeCollapsedReplacementSelection(5, 7, 'right', collapsed, true))
      .toEqual({ anchor: 19, focus: 19 })
    expect(normalizeCollapsedReplacementSelection(19, 10, 'left', collapsed, true))
      .toEqual({ anchor: 5, focus: 5 })
    expect(normalizeCollapsedReplacementSelection(4, 7, 'right', collapsed, false))
      .toEqual({ anchor: 4, focus: 19 })
    expect(normalizeCollapsedReplacementSelection(20, 20, 'left', collapsed, false))
      .toEqual({ anchor: 20, focus: 20 })
  })

  test('treats atomic replacements as one caret, selection, and deletion unit', () => {
    const atomic = [{ start: 4, end: 23, interaction: 'atomic' as const }]

    expect(resolveVisibleArrowOffset(4, 'right', atomic, 31)).toBe(23)
    expect(resolveVisibleArrowOffset(15, 'right', atomic, 31)).toBe(23)
    expect(resolveVisibleArrowOffset(23, 'left', atomic, 31)).toBe(4)
    expect(resolveAtomicReplacementBoundary(15, 'right', atomic)).toBe(23)
    expect(resolveAtomicReplacementBoundary(15, 'left', atomic)).toBe(4)
    expect(normalizeAtomicReplacementSelection(4, 15, atomic))
      .toEqual({ anchor: 4, focus: 23 })
    expect(normalizeAtomicReplacementSelection(23, 15, atomic))
      .toEqual({ anchor: 23, focus: 4 })
    expect(normalizeAtomicReplacementSelection(8, 8, atomic))
      .toEqual({ anchor: 4, focus: 4 })
    expect(normalizeAtomicReplacementSelection(20, 20, atomic))
      .toEqual({ anchor: 23, focus: 23 })
    expect(resolveAtomicDeletionRange(23, 'Backspace', atomic)).toEqual(atomic[0])
    expect(resolveAtomicDeletionRange(4, 'Delete', atomic)).toEqual(atomic[0])
    expect(resolveAtomicDeletionRange(4, 'Backspace', atomic)).toBeUndefined()
  })

  test('ignores stale replacement DOM after the authoritative source changes', () => {
    const current = {
      dataset: {
        shikitorSourceStart: '4',
        shikitorSourceEnd: '23',
        shikitorSourceText: '[$mem](skill://mem)'
      }
    }
    const output = {
      querySelectorAll: () => [current]
    } as unknown as HTMLElement

    expect(currentReplacementElements(output, 'Run [$mem](skill://mem) now'))
      .toEqual([current])
    expect(currentReplacementElements(output, 'Run X now')).toEqual([])
  })
})
