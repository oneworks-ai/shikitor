import type { ThemedToken } from '@shikijs/types'

import type { DocumentLines } from './documentLines'
import type { TokenizedLine } from './tokenSnapshot'

export interface LinePatch {
  /** Leading lines whose source is unchanged. */
  prefix: number
  /** Trailing lines whose source is unchanged and can be shifted in place. */
  suffix: number
}

/**
 * Compare the previously rendered line sources with the current document and
 * return the unchanged head and tail so only the middle block needs new DOM.
 * Shifted lines inside the tail keep their elements and only need a new line
 * number.
 */
export function resolveLinePatch(
  rendered: readonly string[],
  document: DocumentLines
): LinePatch {
  const previousCount = rendered.length
  const nextCount = document.lineCount
  const comparable = Math.min(previousCount, nextCount)
  let prefix = 0
  while (prefix < comparable && rendered[prefix] === document.lineAt(prefix)) prefix++
  let suffix = 0
  while (
    suffix < comparable - prefix
    && rendered[previousCount - 1 - suffix] === document.lineAt(nextCount - 1 - suffix)
  ) suffix++
  return { prefix, suffix }
}

function tokenStylesEqual(left: ThemedToken, right: ThemedToken) {
  return left.content === right.content
    && left.color === right.color
    && left.bgColor === right.bgColor
    && left.fontStyle === right.fontStyle
    && (left.htmlStyle === right.htmlStyle || (
      left.htmlStyle !== undefined
      && right.htmlStyle !== undefined
      && JSON.stringify(left.htmlStyle) === JSON.stringify(right.htmlStyle)
    ))
}

/**
 * Whether two tokenized lines paint identically. Incremental tokenization
 * re-creates line objects for the whole block around an edit even when most
 * of them did not change, so renderers compare content before touching DOM.
 */
export function tokenizedLinesEquivalent(
  left: TokenizedLine | undefined,
  right: TokenizedLine | undefined
) {
  if (left === right) return true
  if (!left || !right) return false
  if (left.source !== right.source) return false
  if ((left.tokenized ?? true) !== (right.tokenized ?? true)) return false
  if (left.tokens.length !== right.tokens.length) return false
  for (let index = 0; index < left.tokens.length; index++) {
    if (!tokenStylesEqual(left.tokens[index], right.tokens[index])) return false
  }
  return true
}
