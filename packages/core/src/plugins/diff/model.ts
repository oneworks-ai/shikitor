import { diffArrays } from 'diff'

import { computeInlineDiff } from './inline'
import type {
  ShikitorDiffComputeOptions,
  ShikitorDiffHunk,
  ShikitorDiffModel,
  ShikitorDiffRow
} from './types'

export function splitDiffLines(value: string) {
  return value.split('\n')
}

function changedRows(
  oldLines: string[],
  newLines: string[],
  oldStart: number,
  newStart: number,
  options: ShikitorDiffComputeOptions
) {
  const rows: ShikitorDiffRow[] = []
  const paired = Math.min(oldLines.length, newLines.length)
  const mode = options.inline ?? 'word'
  for (let index = 0; index < paired; index++) {
    const inline = computeInlineDiff(oldLines[index], newLines[index], mode)
    rows.push({
      kind: 'modified',
      oldLine: oldStart + index,
      newLine: newStart + index,
      oldText: oldLines[index],
      newText: newLines[index],
      oldInline: inline.oldRanges,
      newInline: inline.newRanges
    })
  }
  for (let index = paired; index < oldLines.length; index++) {
    rows.push({
      kind: 'removed',
      oldLine: oldStart + index,
      oldText: oldLines[index],
      oldInline: [{ start: 0, end: oldLines[index].length }],
      newInline: []
    })
  }
  for (let index = paired; index < newLines.length; index++) {
    rows.push({
      kind: 'added',
      newLine: newStart + index,
      newText: newLines[index],
      oldInline: [],
      newInline: [{ start: 0, end: newLines[index].length }]
    })
  }
  return rows
}

function fallbackChanges(original: string[], current: string[]) {
  return [
    { value: original, added: false, removed: true, count: original.length },
    { value: current, added: true, removed: false, count: current.length }
  ]
}

export function computeDiffModel(
  original: string,
  current: string,
  options: ShikitorDiffComputeOptions = {}
): ShikitorDiffModel {
  const oldSource = splitDiffLines(original)
  const newSource = splitDiffLines(current)
  const computed = diffArrays(oldSource, newSource, {
    timeout: options.timeout ?? 500,
    ...(options.maxEditLength === undefined ? {} : { maxEditLength: options.maxEditLength })
  })
  const changes = computed ?? fallbackChanges(oldSource, newSource)
  const rows: ShikitorDiffRow[] = []
  const hunks: ShikitorDiffHunk[] = []
  let oldLine = 1
  let newLine = 1

  for (let index = 0; index < changes.length;) {
    const change = changes[index]
    if (!change.added && !change.removed) {
      for (const text of change.value) {
        rows.push({
          kind: 'context', oldLine, newLine, oldText: text, newText: text,
          oldInline: [], newInline: []
        })
        oldLine++
        newLine++
      }
      index++
      continue
    }
    const oldLines = change.removed ? change.value : []
    const next = changes[index + 1]
    const newLines = change.added
      ? change.value
      : next?.added ? next.value : []
    const consumed = change.removed && next?.added ? 2 : 1
    const hunkRows = changedRows(oldLines, newLines, oldLine, newLine, options)
    const id = `hunk-${hunks.length + 1}-${oldLine}-${newLine}`
    hunkRows.forEach(row => { row.hunkId = id })
    const hunk: ShikitorDiffHunk = {
      id,
      oldStart: oldLine,
      oldEnd: oldLine + oldLines.length,
      newStart: newLine,
      newEnd: newLine + newLines.length,
      oldLines: [...oldLines],
      newLines: [...newLines],
      rows: hunkRows
    }
    rows.push(...hunkRows)
    hunks.push(hunk)
    oldLine += oldLines.length
    newLine += newLines.length
    index += consumed
  }
  const additions = rows.filter(row => row.kind === 'added' || row.kind === 'modified').length
  const deletions = rows.filter(row => row.kind === 'removed' || row.kind === 'modified').length
  return {
    original,
    current,
    rows,
    hunks,
    stats: { additions, deletions, hunks: hunks.length },
    identical: hunks.length === 0,
    truncated: computed === undefined
  }
}

/**
 * Locate a single-line replacement between two texts: the same number of
 * lines, exactly one of them different. Returns the one-based line, or
 * undefined for any other kind of change.
 */
export function findSingleLineEdit(previous: string, next: string): number | undefined {
  if (previous === next) return undefined
  let prefix = 0
  const limit = Math.min(previous.length, next.length)
  while (prefix < limit && previous.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix++
  let suffix = 0
  while (
    suffix < limit - prefix
    && previous.charCodeAt(previous.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)
  ) suffix++
  const previousMiddle = previous.slice(prefix, previous.length - suffix)
  const nextMiddle = next.slice(prefix, next.length - suffix)
  if (previousMiddle.includes('\n') || nextMiddle.includes('\n')) return undefined
  let line = 1
  for (let index = 0; index < prefix; index++) {
    if (previous.charCodeAt(index) === 10) line++
  }
  return line
}

/**
 * Update a diff model for an edit confined to one current-side line that is
 * already part of a change (an added or modified row). The row structure,
 * hunk boundaries and statistics are unchanged, so only that row's text and
 * inline ranges are recomputed; the result is what a full recomputation
 * would produce for this case. Returns undefined when the edit touches a
 * context line or spans lines, in which case the full diff must run.
 */
export function updateDiffModelForLineEdit(
  previous: ShikitorDiffModel,
  current: string,
  options: ShikitorDiffComputeOptions = {}
): ShikitorDiffModel | undefined {
  if (previous.truncated) return undefined
  const line = findSingleLineEdit(previous.current, current)
  if (line === undefined) return undefined
  const rowIndex = previous.rows.findIndex(row => row.newLine === line)
  const row = previous.rows[rowIndex]
  if (!row || row.hunkId === undefined || (row.kind !== 'added' && row.kind !== 'modified')) {
    return undefined
  }
  const hunkIndex = previous.hunks.findIndex(hunk => hunk.id === row.hunkId)
  const hunk = previous.hunks[hunkIndex]
  if (!hunk) return undefined
  const newText = splitDiffLines(current)[line - 1]
  if (newText === undefined) return undefined
  const inline = row.kind === 'modified'
    ? computeInlineDiff(row.oldText ?? '', newText, options.inline ?? 'word')
    : { oldRanges: [], newRanges: [{ start: 0, end: newText.length }] }
  const nextRow: ShikitorDiffRow = {
    ...row,
    newText,
    oldInline: inline.oldRanges,
    newInline: inline.newRanges
  }
  const rows = previous.rows.slice()
  rows[rowIndex] = nextRow
  const hunkRowIndex = hunk.rows.indexOf(row)
  if (hunkRowIndex < 0) return undefined
  const hunkRows = hunk.rows.slice()
  hunkRows[hunkRowIndex] = nextRow
  const newLines = hunk.newLines.slice()
  newLines[line - hunk.newStart] = newText
  const nextHunk: ShikitorDiffHunk = { ...hunk, newLines, rows: hunkRows }
  const hunks = previous.hunks.slice()
  hunks[hunkIndex] = nextHunk
  return { ...previous, current, hunks, rows }
}
