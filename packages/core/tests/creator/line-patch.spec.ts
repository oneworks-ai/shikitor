import { describe, expect, it } from 'vitest'

import { createDocumentLines } from '../../src/creator/controlled/documentLines'
import {
  resolveLinePatch,
  tokenizedLinesEquivalent
} from '../../src/creator/controlled/linePatch'
import type { TokenizedLine } from '../../src/creator/controlled/tokenSnapshot'

function line(source: string, tokens: Array<[string, string]> = []): TokenizedLine {
  let offset = 0
  return {
    source,
    tokenized: true,
    tokens: tokens.map(([content, color]) => {
      const token = { color, content, offset }
      offset += content.length
      return token
    })
  }
}

describe('line patch', () => {
  it('keeps an unchanged document entirely', () => {
    const rendered = ['a', 'b', 'c']
    expect(resolveLinePatch(rendered, createDocumentLines('a\nb\nc'))).toEqual({
      prefix: 3,
      suffix: 0
    })
  })

  it('isolates an edited line between an unchanged head and tail', () => {
    const rendered = ['a', 'b', 'c', 'd']
    expect(resolveLinePatch(rendered, createDocumentLines('a\nB\nc\nd'))).toEqual({
      prefix: 1,
      suffix: 2
    })
  })

  it('reuses the shifted tail when lines are inserted or removed', () => {
    const rendered = ['a', 'b', 'c']
    expect(resolveLinePatch(rendered, createDocumentLines('a\nx\nb\nc'))).toEqual({
      prefix: 1,
      suffix: 2
    })
    expect(resolveLinePatch(rendered, createDocumentLines('a\nc'))).toEqual({
      prefix: 1,
      suffix: 1
    })
    expect(resolveLinePatch(rendered, createDocumentLines('a\nb\nc\nd'))).toEqual({
      prefix: 3,
      suffix: 0
    })
  })

  it('does not let the head and tail overlap on repeated lines', () => {
    const rendered = ['x', 'x']
    expect(resolveLinePatch(rendered, createDocumentLines('x\nx\nx'))).toEqual({
      prefix: 2,
      suffix: 0
    })
    expect(resolveLinePatch([], createDocumentLines('x'))).toEqual({ prefix: 0, suffix: 0 })
  })
})

describe('tokenized line equivalence', () => {
  it('treats identical paint as equivalent regardless of object identity', () => {
    const left = line('const a', [['const', '#f00'], [' a', '#000']])
    const right = line('const a', [['const', '#f00'], [' a', '#000']])
    expect(tokenizedLinesEquivalent(left, right)).toBe(true)
    expect(tokenizedLinesEquivalent(left, left)).toBe(true)
  })

  it('detects changed source, colors or token boundaries', () => {
    const base = line('const a', [['const', '#f00'], [' a', '#000']])
    expect(tokenizedLinesEquivalent(base, line('const b', [['const', '#f00'], [' b', '#000']]))).toBe(false)
    expect(tokenizedLinesEquivalent(base, line('const a', [['const', '#0f0'], [' a', '#000']]))).toBe(false)
    expect(tokenizedLinesEquivalent(base, line('const a', [['const a', '#f00']]))).toBe(false)
    expect(tokenizedLinesEquivalent(base, undefined)).toBe(false)
    expect(tokenizedLinesEquivalent(
      base,
      { source: 'const a', tokenized: false, tokens: [] }
    )).toBe(false)
  })
})
