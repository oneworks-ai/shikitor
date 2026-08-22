import { describe, expect, it } from 'vitest'

import {
  createLineWidgetGeometry,
  EMPTY_LINE_WIDGET_GEOMETRY,
  resolveSourceLineAtVisualY,
  resolveSourceLineTop,
  resolveWidgetHeightBeforeLine,
  totalLineWidgetHeight
} from '../../src/plugins/line-widgets'

const LINE_HEIGHT = 22

/** Reference implementation mirroring the original DOM-scanning lookups. */
function referenceHeightBeforeLine(
  entries: ReadonlyArray<{ afterLine: number; height: number }>,
  line: number
) {
  return entries
    .filter(entry => entry.afterLine < line)
    .reduce((height, entry) => height + entry.height, 0)
}

function referenceLineAtVisualY(
  entries: ReadonlyArray<{ afterLine: number; height: number }>,
  visualY: number,
  lineHeight: number,
  lineCount: number
) {
  let line = lineCount
  for (let sourceLine = 1; sourceLine <= lineCount; sourceLine++) {
    const top = (sourceLine - 1) * lineHeight + referenceHeightBeforeLine(entries, sourceLine)
    if (visualY < top + lineHeight) {
      line = sourceLine
      break
    }
  }
  return line
}

describe('line widget geometry', () => {
  it('builds ascending prefix sums regardless of input order', () => {
    const geometry = createLineWidgetGeometry([
      { afterLine: 7, height: 44 },
      { afterLine: 2, height: 22 },
      { afterLine: 7, height: 10 },
      { afterLine: 0, height: 30 }
    ])

    expect(geometry.afterLines).toEqual([0, 2, 7, 7])
    expect(geometry.heightPrefix).toEqual([0, 30, 52, 96, 106])
    expect(totalLineWidgetHeight(geometry)).toBe(106)
    expect(totalLineWidgetHeight(EMPTY_LINE_WIDGET_GEOMETRY)).toBe(0)
  })

  it('sums only the widgets anchored strictly before a line', () => {
    const geometry = createLineWidgetGeometry([
      { afterLine: 0, height: 30 },
      { afterLine: 2, height: 22 },
      { afterLine: 7, height: 44 },
      { afterLine: 7, height: 10 }
    ])

    expect(resolveWidgetHeightBeforeLine(geometry, 0)).toBe(0)
    // A widget before the first line (afterLine 0) counts for line 1.
    expect(resolveWidgetHeightBeforeLine(geometry, 1)).toBe(30)
    expect(resolveWidgetHeightBeforeLine(geometry, 2)).toBe(30)
    // The region after line 2 only pushes lines from 3 down.
    expect(resolveWidgetHeightBeforeLine(geometry, 3)).toBe(52)
    expect(resolveWidgetHeightBeforeLine(geometry, 7)).toBe(52)
    expect(resolveWidgetHeightBeforeLine(geometry, 8)).toBe(106)
    expect(resolveWidgetHeightBeforeLine(geometry, 1000)).toBe(106)
    expect(resolveWidgetHeightBeforeLine(EMPTY_LINE_WIDGET_GEOMETRY, 5)).toBe(0)
  })

  it('positions source lines below the lines and widgets above them', () => {
    const geometry = createLineWidgetGeometry([
      { afterLine: 1, height: 44 },
      { afterLine: 3, height: 22 }
    ])

    expect(resolveSourceLineTop(geometry, 1, LINE_HEIGHT)).toBe(0)
    expect(resolveSourceLineTop(geometry, 2, LINE_HEIGHT)).toBe(22 + 44)
    expect(resolveSourceLineTop(geometry, 3, LINE_HEIGHT)).toBe(44 + 44)
    expect(resolveSourceLineTop(geometry, 4, LINE_HEIGHT)).toBe(66 + 66)
    expect(resolveSourceLineTop(EMPTY_LINE_WIDGET_GEOMETRY, 4, LINE_HEIGHT)).toBe(66)
  })

  it('maps a visual y onto the first source line extending below it', () => {
    const geometry = createLineWidgetGeometry([
      { afterLine: 1, height: 44 },
      { afterLine: 3, height: 22 }
    ])
    const lineCount = 5

    expect(resolveSourceLineAtVisualY(geometry, 0, LINE_HEIGHT, lineCount)).toBe(1)
    expect(resolveSourceLineAtVisualY(geometry, 21.9, LINE_HEIGHT, lineCount)).toBe(1)
    // Pointer inside the widget after line 1 resolves to the next source line.
    expect(resolveSourceLineAtVisualY(geometry, 22, LINE_HEIGHT, lineCount)).toBe(2)
    expect(resolveSourceLineAtVisualY(geometry, 65, LINE_HEIGHT, lineCount)).toBe(2)
    expect(resolveSourceLineAtVisualY(geometry, 66, LINE_HEIGHT, lineCount)).toBe(2)
    expect(resolveSourceLineAtVisualY(geometry, 88, LINE_HEIGHT, lineCount)).toBe(3)
    expect(resolveSourceLineAtVisualY(geometry, 110, LINE_HEIGHT, lineCount)).toBe(4)
    expect(resolveSourceLineAtVisualY(geometry, 131.9, LINE_HEIGHT, lineCount)).toBe(4)
    expect(resolveSourceLineAtVisualY(geometry, 132, LINE_HEIGHT, lineCount)).toBe(4)
    expect(resolveSourceLineAtVisualY(geometry, 154, LINE_HEIGHT, lineCount)).toBe(5)
    // Below the last line clamps to the last line.
    expect(resolveSourceLineAtVisualY(geometry, 10_000, LINE_HEIGHT, lineCount)).toBe(5)
    expect(resolveSourceLineAtVisualY(EMPTY_LINE_WIDGET_GEOMETRY, 50, LINE_HEIGHT, lineCount)).toBe(3)
    expect(resolveSourceLineAtVisualY(EMPTY_LINE_WIDGET_GEOMETRY, 0, LINE_HEIGHT, 0)).toBe(0)
  })

  it('matches the linear DOM-scan reference for random layouts', () => {
    let seed = 42
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    for (let round = 0; round < 200; round++) {
      const lineCount = 1 + Math.floor(random() * 60)
      const entries = Array.from({ length: Math.floor(random() * 8) }, () => ({
        afterLine: Math.floor(random() * (lineCount + 1)),
        height: Math.round(random() * 3) * 22 + (random() < 0.3 ? 0.5 : 0)
      }))
      const lineHeight = random() < 0.5 ? 22 : 18.5
      const geometry = createLineWidgetGeometry(entries)

      for (let line = 0; line <= lineCount + 1; line++) {
        expect(resolveWidgetHeightBeforeLine(geometry, line))
          .toBe(referenceHeightBeforeLine(entries, line))
      }
      const maxY = lineCount * lineHeight + totalLineWidgetHeight(geometry) + 10
      for (let sample = 0; sample < 40; sample++) {
        const visualY = random() * maxY
        expect(resolveSourceLineAtVisualY(geometry, visualY, lineHeight, lineCount))
          .toBe(referenceLineAtVisualY(entries, visualY, lineHeight, lineCount))
      }
      // Exact row boundaries are the sensitive spots for the `<` comparison.
      for (let line = 1; line <= lineCount; line++) {
        const top = resolveSourceLineTop(geometry, line, lineHeight)
        for (const visualY of [top, top + lineHeight, top + lineHeight - 0.001]) {
          expect(resolveSourceLineAtVisualY(geometry, visualY, lineHeight, lineCount))
            .toBe(referenceLineAtVisualY(entries, visualY, lineHeight, lineCount))
        }
      }
    }
  })
})
