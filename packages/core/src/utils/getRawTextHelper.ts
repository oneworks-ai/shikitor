import type { OffsetOrPosition, ResolvedPosition } from '@shikijs/types'

import type { ResolvedTextRange, TextRange } from '../base'

export interface RawTextHelper {
  value: string
  resolvePosition(oop: OffsetOrPosition, text?: string): ResolvedPosition
  resolveTextRange(tr: TextRange, text?: string): ResolvedTextRange
  at(oop: OffsetOrPosition, text?: string): string
  line(oop: OffsetOrPosition, text?: string): string
  lineStart(oop: OffsetOrPosition, text?: string): number
  lineEnd(oop: OffsetOrPosition, text?: string): number
  countLeadingSpaces(oop: OffsetOrPosition, tabSize: number, text?: string): number
  inferLineLeadingSpaces(oop: OffsetOrPosition, tabSize: number, text?: string): number
}

/** Reference line/offset conversion by scanning; used for ad-hoc text arguments. */
export function scanOffset(line: number, character: number, text: string) {
  const lines = text.split('\n')
  return lines.slice(0, line - 1).reduce((acc, line) => acc + line.length + 1, 0) + character
}

/** Reference offset/position conversion by scanning; used for ad-hoc text arguments. */
export function scanPosition(offset: number, text: string) {
  const lines = text.split('\n')
  let line = 1
  let character = 1
  for (const lineContent of lines) {
    if (offset <= lineContent.length) {
      character = offset
      break
    }
    offset -= lineContent.length + 1
    line++
  }
  return { line, character }
}

/** Reference line extraction by scanning; treats `\r` as a line terminator. */
export function scanLine(line: number, text: string) {
  let lineText = ''
  for (let i = 0, j = 0; i < text.length; i++) {
    if (text[i] === '\n' || text[i] === '\r') {
      if (j === line - 1) {
        break
      }
      j++
    } else if (j === line - 1) {
      lineText += text[i]
    }
  }
  return lineText
}

/** Zero-based offsets at which each line starts. */
export function computeLineStarts(text: string) {
  const starts = [0]
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1)
  }
  return starts
}

/**
 * Helpers over one immutable text. Conversions between offsets and positions
 * use a lazily built line index, because editor plugins resolve geometry for
 * many positions per keystroke and a full scan per call scaled with the
 * document length.
 */
export function getRawTextHelper(originalText: string): RawTextHelper {
  let starts: number[] | undefined
  const hasCarriageReturn = originalText.includes('\r')
  const lineStarts = () => starts ??= computeLineStarts(originalText)

  function getOffset(line: number, character: number, text: string) {
    if (text !== originalText) return scanOffset(line, character, text)
    const index = lineStarts()
    const count = index.length
    const take = line - 1 >= 0
      ? Math.min(line - 1, count)
      : Math.max(0, count + (line - 1))
    const base = take < count ? index[take] : text.length + 1
    return base + character
  }
  function getPosition(offset: number, text: string) {
    if (text !== originalText) return scanPosition(offset, text)
    const index = lineStarts()
    if (offset > text.length) return { line: index.length + 1, character: 1 }
    let low = 0
    let high = index.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (index[middle] <= offset) low = middle
      else high = middle - 1
    }
    return { line: low + 1, character: offset - index[low] }
  }
  const rawTextHelper: RawTextHelper = {
    value: originalText,
    resolvePosition(oop, text = originalText) {
      return {
        offset: typeof oop === 'number'
          ? oop
          : getOffset(oop.line, oop.character, text),
        ...(typeof oop === 'number' ? getPosition(oop, text) : oop)
      }
    },
    resolveTextRange(tr, text = originalText) {
      return {
        start: rawTextHelper.resolvePosition(tr.start, text),
        end: rawTextHelper.resolvePosition(tr.end, text)
      }
    },
    at(oop, text = originalText) {
      return text[typeof oop === 'number' ? oop : getOffset(oop.line, oop.character, text)]
    },
    lineStart(oop, text = originalText) {
      let offset = typeof oop === 'number' ? oop : getOffset(oop.line, oop.character, text)
      if (text === originalText && offset > 0) {
        const index = lineStarts()
        const position = getPosition(Math.min(offset, text.length), text)
        return index[Math.min(position.line, index.length) - 1]
      }
      while (offset > 0 && text[offset - 1] !== '\n') {
        offset--
      }
      return offset
    },
    lineEnd(oop, text = originalText) {
      let offset = typeof oop === 'number' ? oop : getOffset(oop.line, oop.character, text)
      while (offset < text.length && text[offset] !== '\n' && text[offset] !== '\r') {
        offset++
      }
      return offset
    },
    line(oop, text = originalText) {
      const { line } = rawTextHelper.resolvePosition(oop, text)
      if (text !== originalText || hasCarriageReturn) return scanLine(line, text)
      const index = lineStarts()
      if (line < 1 || line > index.length) return ''
      const start = index[line - 1]
      const end = line < index.length ? index[line] - 1 : text.length
      return text.slice(start, end)
    },
    countLeadingSpaces(oop, tabSize, text = originalText) {
      const offset = typeof oop === 'number' ? oop : getOffset(oop.line, oop.character, text)
      let count = 0
      for (let i = offset; i < text.length; i++) {
        if (text[i] === ' ') {
          count++
        } else if (text[i] === '\t') {
          count += tabSize
        } else {
          break
        }
      }
      return count
    },
    inferLineLeadingSpaces(oop, tabSize, text = originalText) {
      const { offset, line } = rawTextHelper.resolvePosition(oop, text)
      const computeLine = line === 0 ? 0 : line - 1
      const lineStart = rawTextHelper.lineStart({ line: computeLine, character: 1 }, text)
      const lineText = rawTextHelper.line({ line: computeLine, character: 1 }, text)
      const leadingSpaces = rawTextHelper.countLeadingSpaces(lineStart, tabSize, text)
      const bracketMapping: Record<string, string> = {
        '(': ')',
        '[': ']',
        '{': '}',
        '<': '>'
      }
      const trimedLineText = lineText.trimEnd()
      const relativeBracket = bracketMapping[trimedLineText[trimedLineText.length - 1]]
      const isIncrease = line !== 0
        && relativeBracket
        && text[offset] !== relativeBracket
      return leadingSpaces - leadingSpaces % tabSize + (isIncrease ? tabSize : 0)
    }
  }
  return rawTextHelper
}
