import type {
  ShikitorDiffCollapseUnchangedOptions,
  ShikitorDiffModel,
  ShikitorDiffRow
} from './types'

export interface ShikitorDiffCollapsedContext {
  count: number
  endLine: number
  label: string
  startLine: number
}

function contextRuns(rows: readonly ShikitorDiffRow[]) {
  const runs: Array<{ start: number; end: number }> = []
  for (let index = 0; index < rows.length;) {
    if (rows[index].kind !== 'context') {
      index++
      continue
    }
    const start = index
    while (index + 1 < rows.length && rows[index + 1].kind === 'context') index++
    runs.push({ start, end: index })
    index++
  }
  return runs
}

export function computeCollapsedContexts(
  model: ShikitorDiffModel,
  options: ShikitorDiffCollapseUnchangedOptions = {}
): ShikitorDiffCollapsedContext[] {
  if (model.identical) return []
  const context = Math.max(0, Math.floor(options.context ?? 2))
  const minimum = Math.max(1, Math.floor(options.minimum ?? 6))
  const label = options.label ?? (count => `${count} unchanged ${count === 1 ? 'line' : 'lines'}`)
  const collapsed: ShikitorDiffCollapsedContext[] = []

  for (const run of contextRuns(model.rows)) {
    const hasChangeBefore = run.start > 0
    const hasChangeAfter = run.end < model.rows.length - 1
    const hiddenStart = run.start + (hasChangeBefore ? context : 0)
    const hiddenEnd = run.end - (hasChangeAfter ? context : 0)
    const count = hiddenEnd - hiddenStart + 1
    if (count < minimum) continue
    const startLine = model.rows[hiddenStart].newLine
    const endLine = model.rows[hiddenEnd].newLine
    if (!startLine || !endLine || endLine < startLine) continue
    collapsed.push({ startLine, endLine, count, label: label(count) })
  }
  return collapsed
}
