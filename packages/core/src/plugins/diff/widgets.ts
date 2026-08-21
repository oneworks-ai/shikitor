import type { LineWidget } from '../line-widgets'
import { cloneDiffLine, createHunkActions } from './dom'
import type { DiffOriginalLines } from './syntax'
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
  oldLines: DiffOriginalLines
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
  // The widget host keeps containers across passes; identical rows skip the
  // re-render so a keystroke elsewhere does not rebuild every removed row.
  const key = [
    input.view,
    row.oldLine ?? '',
    row.oldText ?? '',
    row.oldInline.map(range => `${range.start}-${range.end}`).join(','),
    showActions ? hunk.id : '',
    input.oldLines.lineCount
  ].join('\0')
  if (container.dataset.shikitorDiffRow === key && container.firstChild) return
  container.dataset.shikitorDiffRow = key
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
  const hunks = new Map(input.model.hunks.map(hunk => [hunk.id, hunk]))
  const removedIndexes = new Map<ShikitorDiffRow, number>()
  const hunksWithCurrentRows = new Set<string>()
  for (const hunk of input.model.hunks) {
    let removedIndex = 0
    for (const item of hunk.rows) {
      if (item.newLine !== undefined) hunksWithCurrentRows.add(hunk.id)
      if (item.kind === 'removed' || (input.view === 'unified' && item.kind === 'modified')) {
        removedIndexes.set(item, removedIndex++)
      }
    }
  }
  let lastNewLine = 0
  for (const row of input.model.rows) {
    const renderOldSide = row.kind === 'removed'
      || (input.view === 'unified' && row.kind === 'modified')
    if (!renderOldSide || !row.hunkId) {
      if (row.newLine) lastNewLine = row.newLine
      continue
    }
    const hunk = hunks.get(row.hunkId)!
    const removedIndex = removedIndexes.get(row) ?? 0
    const hasCurrentRow = hunksWithCurrentRows.has(hunk.id)
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
