import { splitDiffLines } from './model'
import type { ShikitorDiffHunk } from './types'

export interface ShikitorDiffTextEdit {
  start: number
  end: number
  text: string
}

function replaceLines(
  value: string,
  start: number,
  removeCount: number,
  replacement: readonly string[]
) {
  const lines = splitDiffLines(value)
  lines.splice(start - 1, removeCount, ...replacement)
  return lines.join('\n')
}

export function acceptDiffHunk(original: string, hunk: ShikitorDiffHunk) {
  return replaceLines(original, hunk.oldStart, hunk.oldLines.length, hunk.newLines)
}

export function rejectDiffHunk(current: string, hunk: ShikitorDiffHunk) {
  return replaceLines(current, hunk.newStart, hunk.newLines.length, hunk.oldLines)
}

export function createDiffTextEdit(before: string, after: string): ShikitorDiffTextEdit {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  let suffix = 0
  while (
    suffix < before.length - start
    && suffix < after.length - start
    && before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) suffix++
  return {
    start,
    end: before.length - suffix,
    text: after.slice(start, after.length - suffix)
  }
}
