import { getRawTextHelper, type RawTextHelper } from '../../utils/getRawTextHelper'

export interface DentOptions {
  /**
   * Number of spaces to insert when pressing the Tab key.
   */
  tabSize?: number
  /**
   * Whether to insert spaces when pressing the Tab key.
   */
  insertSpaces?: boolean
}

interface ReplacementRangeText {
  replacement: string
  range: [start: number, end: number]
  selection: [start: number, end: number]
  selectionMode?: SelectionMode
}

function updateSelection(
  text: string,
  [start, end]: [start: number, end: number],
  padding: number,
  {
    replacement,
    range,
    selectionMode
  }: Omit<ReplacementRangeText, 'selection'>,
  { line, lineStart }: RawTextHelper
): [number, number] {
  const originalLength = range[1] - range[0]
  const newLength = replacement.length
  const insertCharCount = newLength - originalLength
  const newEndOffset = Math.max(end + insertCharCount, lineStart(start))
  if (start === end) {
    if (newEndOffset < 0) {
      if (start === 0 || text[start - 1] === '\n')
        return [start, start]
      else
        return [0, 0]
    }
    return [newEndOffset, newEndOffset]
  }

  const firstLine = line(start)
  const firstLineForReplacement = line(0, replacement)
  let firstLineInsertCharCount
  if (selectionMode === 'select') {
    firstLineInsertCharCount = firstLineForReplacement.length - firstLine.length
  } else {
    if (insertCharCount < 0) {
      firstLineInsertCharCount = firstLineForReplacement.length - firstLine.length
    } else {
      firstLineInsertCharCount = padding
    }
  }
  return [
    Math.max(start + firstLineInsertCharCount, 0),
    Math.max(newEndOffset, 0)
  ]
}

export function indent(
  text: string,
  selection: [start: number, end?: number],
  options: DentOptions = {},
  rawTextHelper = getRawTextHelper(text)
): ReplacementRangeText {
  const { lineStart, lineEnd, countLeadingSpaces, inferLineLeadingSpaces } = rawTextHelper
  const [start, end = start] = selection
  const {
    tabSize = 2,
    insertSpaces = true
  } = options
  const valueLength = text.length

  const [
    startLineOffset, endLineOffset
  ] = [
    lineStart(start), lineEnd(end)
  ]

  const startAtLineStart = start === 0 || text[start - 1] === '\n'
  const endAtLineEnd = end === valueLength || text[end] === '\n' || text[end] === '\r'
  const selectBothEnds = start !== end && startAtLineStart && endAtLineEnd

  const item = insertSpaces
    ? ' '.repeat(tabSize)
    : '\t'
  const insertStrItemLength = item.length
  if (startAtLineStart && start === end) {
    const leadingSpaces = inferLineLeadingSpaces(start, tabSize) || tabSize
    const tabCount = ~~(leadingSpaces / tabSize)
    const tabCountRemainder = leadingSpaces % tabSize
    const tabCountRemainderSpaces = tabCountRemainder < 1
      ? ''
      : ' '.repeat(tabCountRemainder)
    const replacement = tabCount <= 0
      ? tabCountRemainderSpaces
      : tabCountRemainderSpaces + item.repeat(tabCount)
    const range: [number, number] = [start, end]
    return {
      replacement, range,
      selection: updateSelection(text, [start, end], 0, {
        replacement,
        range
      }, rawTextHelper),
      selectionMode: 'end'
    }
  }

  let replacement: string
  let range: [number, number]
  let selectionMode: SelectionMode
  let padding = insertStrItemLength
  if (selectBothEnds || start !== end) {
    replacement = text
      .slice(startLineOffset, endLineOffset)
      .replaceAll(/^[ \t]*/gm, (leading, offset, str) => {
        if (str[offset] === '\n' || str[offset] === '\r' || offset === endLineOffset) return leading

        const tabCount = 1 + ~~(countLeadingSpaces(0, tabSize, leading) / tabSize)
        return item.repeat(tabCount)
      })
    range = [startLineOffset, endLineOffset]
    selectionMode = 'select'
  } else {
    replacement = '\t'
    range = [start, end]
    selectionMode = 'end'
    if (insertSpaces) {
      padding = tabSize - ((start - startLineOffset) % tabSize)
      replacement = ' '.repeat(padding)
    }
  }

  return {
    replacement, range,
    selection: updateSelection(text, [start, end], padding, {
      replacement,
      range,
      selectionMode
    }, rawTextHelper),
    selectionMode
  }
}

export function outdent(
  text: string,
  selection: [start: number, end?: number],
  options: DentOptions = {},
  rawTextHelper = getRawTextHelper(text)
): ReplacementRangeText {
  const { lineStart, lineEnd, countLeadingSpaces } = rawTextHelper
  const [start, end = start] = selection
  const {
    tabSize = 2,
    insertSpaces = true
  } = options
  const valueLength = text.length
  const item = insertSpaces
    ? ' '.repeat(tabSize)
    : '\t'
  const insertStrItemLength = item.length

  const [
    startLineOffset, endLineOffset
  ] = [
    lineStart(start), lineEnd(end)
  ]

  const startAtLineStart = start === 0 || text[start - 1] === '\n'
  const endAtLineEnd = end === valueLength || text[end] === '\n' || text[end] === '\r'
  const selectBothEnds = start !== end && startAtLineStart && endAtLineEnd

  const selectLinesContent = text.slice(startLineOffset, endLineOffset)
  const replacement = selectLinesContent.replaceAll(/^[ \t]*/gm, (leading) => {
    // TODO https://t.me/c/1066867565/1736194
    const leadingSpaces = countLeadingSpaces(0, tabSize, leading) - tabSize
    const tabCount = ~~(leadingSpaces / tabSize)
    const tabCountRemainder = leadingSpaces % tabSize
    const tabCountRemainderSpaces = tabCountRemainder < 1
      ? ''
      : ' '.repeat(tabCountRemainder)
    if (tabCount <= 0) return tabCountRemainderSpaces

    return item.repeat(tabCount) + tabCountRemainderSpaces
  })
  if (replacement === selectLinesContent) throw new Error('No outdent')

  const range: [number, number] = [startLineOffset, endLineOffset]
  let selectionMode: SelectionMode
  if (selectBothEnds || start !== end) {
    selectionMode = 'select'
  } else {
    selectionMode = 'end'
  }

  return {
    replacement, range,
    selection: updateSelection(text, [start, end], insertStrItemLength, {
      replacement,
      range
    }, rawTextHelper),
    selectionMode
  }
}
