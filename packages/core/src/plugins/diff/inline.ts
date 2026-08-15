import { diffChars, diffWordsWithSpace } from 'diff'

import type { ShikitorDiffInlineMode, ShikitorDiffInlineRange } from './types'

export interface InlineDiffResult {
  oldRanges: ShikitorDiffInlineRange[]
  newRanges: ShikitorDiffInlineRange[]
}

export function computeInlineDiff(
  oldText: string,
  newText: string,
  mode: ShikitorDiffInlineMode
): InlineDiffResult {
  if (mode === 'none') return { oldRanges: [], newRanges: [] }
  const changes = mode === 'character'
    ? diffChars(oldText, newText)
    : diffWordsWithSpace(oldText, newText)
  const oldRanges: ShikitorDiffInlineRange[] = []
  const newRanges: ShikitorDiffInlineRange[] = []
  let oldOffset = 0
  let newOffset = 0

  for (const change of changes) {
    const length = change.value.length
    if (change.removed) oldRanges.push({ start: oldOffset, end: oldOffset + length })
    if (change.added) newRanges.push({ start: newOffset, end: newOffset + length })
    if (!change.added) oldOffset += length
    if (!change.removed) newOffset += length
  }
  return { oldRanges, newRanges }
}

