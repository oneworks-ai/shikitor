import { describe, expect, test } from 'vitest'

import { getRawTextHelper } from '../../src/utils/getRawTextHelper'
import { trimIndent } from '../../src/utils/trimIndent'

describe('rawTextHelper', () => {
  test('getLineEnd', () => {
    const rawTextHelper = getRawTextHelper(trimIndent(`
      a
      bb

      c
    `))
    const { lineEnd } = rawTextHelper
    expect(lineEnd(0)).toBe(1)
    expect(lineEnd(1)).toBe(1)
    expect(lineEnd(2)).toBe(4)
    expect(lineEnd(3)).toBe(4)
    expect(lineEnd(4)).toBe(4)
    expect(lineEnd(5)).toBe(5)
    expect(lineEnd(6)).toBe(7)
    expect(lineEnd(7)).toBe(7)
  })
  test('inferLeadingSpaces', () => {
    const { inferLineLeadingSpaces } = getRawTextHelper('')
    expect(inferLineLeadingSpaces(0, 2, '')).toBe(0)
    expect(inferLineLeadingSpaces(2, 2, '1\n')).toBe(0)
    expect(inferLineLeadingSpaces(3, 2, ' 1\n')).toBe(0)
    expect(inferLineLeadingSpaces(4, 2, '  1\n')).toBe(2)
    expect(inferLineLeadingSpaces(5, 2, '   1\n')).toBe(2)
    expect(inferLineLeadingSpaces(6, 2, '    1\n')).toBe(4)
    expect(inferLineLeadingSpaces(2, 2, '[\n')).toBe(2)
    expect(inferLineLeadingSpaces(3, 2, '[ \n')).toBe(2)
    expect(inferLineLeadingSpaces(3, 2, '[ \n]')).toBe(0)
    expect(inferLineLeadingSpaces(2, 2, '[\n\n]')).toBe(2)
  })
})

describe('rawTextHelper indexed conversions', () => {
  // Deterministic pseudo-random texts so the indexed fast path can be checked
  // against the scanning reference for every offset and position.
  function pseudoRandom(seed: number) {
    let state = seed
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state / 2 ** 32
    }
  }
  const alphabet = ['a', 'b', ' ', '\t', '\n', '\n', '(', ')', '{', '}']
  const samples = ['', '\n', 'a', 'a\n', '\n\n', 'ab\ncd', 'ab\ncd\n', '  x\n\ty\n\nz']
  const random = pseudoRandom(7)
  for (let sample = 0; sample < 24; sample++) {
    const length = Math.floor(random() * 40)
    let text = ''
    for (let index = 0; index < length; index++) {
      text += alphabet[Math.floor(random() * alphabet.length)]
    }
    samples.push(text)
  }

  test('offsets, positions, lines and line starts match the scanning reference', async () => {
    const { scanLine, scanOffset, scanPosition } = await import('../../src/utils/getRawTextHelper')
    for (const text of samples) {
      const helper = getRawTextHelper(text)
      const lineCount = text.split('\n').length
      for (let offset = -2; offset <= text.length + 3; offset++) {
        expect(helper.resolvePosition(offset), `position ${JSON.stringify(text)} @${offset}`)
          .toEqual({ offset, ...scanPosition(offset, text) })
        const { line } = scanPosition(offset, text)
        expect(helper.line(offset), `line ${JSON.stringify(text)} @${offset}`)
          .toBe(scanLine(line, text))
        let start = offset
        while (start > 0 && text[start - 1] !== '\n') start--
        expect(helper.lineStart(offset), `lineStart ${JSON.stringify(text)} @${offset}`).toBe(start)
      }
      for (let line = -1; line <= lineCount + 2; line++) {
        for (const character of [0, 1, 3]) {
          expect(
            helper.resolvePosition({ line, character }).offset,
            `offset ${JSON.stringify(text)} ${line}:${character}`
          ).toBe(scanOffset(line, character, text))
          expect(helper.line({ line, character }), `line ${JSON.stringify(text)} ${line}:${character}`)
            .toBe(scanLine(line, text))
        }
      }
    }
  })

  test('keeps carriage-return semantics and ad-hoc texts on the reference path', async () => {
    const { scanLine } = await import('../../src/utils/getRawTextHelper')
    const text = 'ab\r\ncd\rz\nlast'
    const helper = getRawTextHelper(text)
    for (let offset = 0; offset <= text.length; offset++) {
      const { line } = helper.resolvePosition(offset)
      expect(helper.line(offset)).toBe(scanLine(line, text))
    }
    const other = 'x\ny\nz'
    expect(helper.line({ line: 2, character: 0 }, other)).toBe('y')
    expect(helper.resolvePosition(3, other)).toEqual({ offset: 3, line: 2, character: 1 })
    expect(helper.lineStart(3, other)).toBe(2)
  })
})
