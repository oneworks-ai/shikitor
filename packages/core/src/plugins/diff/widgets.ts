import type { LineWidget } from '../line-widgets'
import { cloneDiffLine, createHunkActions } from './dom'
import type {
  ShikitorDiffHunk,
  ShikitorDiffHunkActionLabels,
  ShikitorDiffModel,
  ShikitorDiffRow,
  ShikitorDiffView
} from './types'

interface DiffWidgetsInput {
  model: ShikitorDiffModel
  view: ShikitorDiffView
  oldLines: readonly HTMLElement[]
  actions?: ShikitorDiffHunkActionLabels
  onAction(action: 'accept' | 'reject', hunk: ShikitorDiffHunk): void
}

function renderRemovedRow(
  container: HTMLElement,
  row: ShikitorDiffRow,
  hunk: ShikitorDiffHunk,
  input: DiffWidgetsInput,
  showActions: boolean
) {
  const line = document.createElement('div')
  line.className = 'shikitor-diff-removed-row'
  line.dataset.diffView = input.view
  line.dataset.diffKind = 'removed'

  const gutter = document.createElement('div')
  gutter.className = 'shikitor-diff-removed-row__gutter'
  gutter.innerHTML = `<span>${row.oldLine ?? ''}</span><i>−</i>`
  const code = document.createElement('div')
  code.className = 'shikitor-diff-removed-row__code'
  if (input.view === 'unified') code.append(cloneDiffLine(row, input.oldLines))
  if (showActions && input.actions) {
    gutter.append(createHunkActions(hunk, input.actions, input.onAction))
  }
  line.append(gutter, code)
  container.replaceChildren(line)
}

export function createDiffWidgets(input: DiffWidgetsInput) {
  const widgets: LineWidget[] = []
  const mounted = new Map<string, HTMLElement>()
  let lastNewLine = 0
  for (const row of input.model.rows) {
    const renderOldSide = row.kind === 'removed'
      || (input.view === 'unified' && row.kind === 'modified')
    if (!renderOldSide || !row.hunkId) {
      if (row.newLine) lastNewLine = row.newLine
      continue
    }
    const hunk = input.model.hunks.find(item => item.id === row.hunkId)!
    const removedRows = hunk.rows.filter(item => (
      item.kind === 'removed' || (input.view === 'unified' && item.kind === 'modified')
    ))
    const removedIndex = removedRows.indexOf(row)
    const hasCurrentRow = hunk.rows.some(item => item.newLine !== undefined)
    const id = `diff-${row.hunkId}-${row.oldLine}`
    widgets.push({
      id,
      afterLine: row.kind === 'modified' && row.newLine ? row.newLine - 1 : lastNewLine,
      minHeight: 22,
      className: 'shikitor-diff-line-widget',
      render(container) {
        mounted.set(id, container)
        renderRemovedRow(container, row, hunk, input, !hasCurrentRow && removedIndex === 0)
        return () => mounted.delete(id)
      }
    })
    if (row.newLine) lastNewLine = row.newLine
  }
  return {
    widgets,
    refresh() {
      for (const widget of widgets) {
        const container = mounted.get(widget.id)
        if (container) widget.render(container)
      }
    }
  }
}
