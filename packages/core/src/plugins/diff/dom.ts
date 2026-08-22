import type { DiffOriginalLines } from './syntax'
import type {
  ShikitorDiffHunk,
  ShikitorDiffHunkActionLabels,
  ShikitorDiffInlineRange,
  ShikitorDiffRow
} from './types'

export function applyInlineRanges(
  line: HTMLElement,
  ranges: readonly ShikitorDiffInlineRange[],
  className: string
) {
  if (ranges.length === 0) return
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  const nodes: Array<{ node: Text; start: number; end: number }> = []
  let offset = 0
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    nodes.push({ node, start: offset, end: offset + node.data.length })
    offset += node.data.length
  }
  for (const entry of nodes.reverse()) {
    const intersections = ranges
      .map(range => ({
        start: Math.max(range.start, entry.start),
        end: Math.min(range.end, entry.end)
      }))
      .filter(range => range.end > range.start)
      .sort((a, b) => b.start - a.start)
    for (const intersection of intersections) {
      const localStart = intersection.start - entry.start
      const localEnd = intersection.end - entry.start
      const selected = entry.node.splitText(localStart)
      selected.splitText(localEnd - localStart)
      const marker = document.createElement('span')
      marker.className = className
      marker.textContent = selected.data
      selected.replaceWith(marker)
    }
  }
}

export function createPlainLine(text: string) {
  const line = document.createElement('div')
  line.className = 'shikitor-output-line'
  line.textContent = text || ' '
  return line
}

export function createHunkActions(
  hunk: ShikitorDiffHunk,
  labels: ShikitorDiffHunkActionLabels,
  onAction: (action: 'accept' | 'reject', hunk: ShikitorDiffHunk) => void
) {
  const actions = document.createElement('div')
  actions.className = 'shikitor-diff-hunk-actions'
  actions.dataset.hunk = hunk.id
  for (const action of ['accept', 'reject'] as const) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.action = action
    button.title = labels[action] ?? (action === 'accept' ? 'Accept change' : 'Revert change')
    button.setAttribute('aria-label', button.title)
    button.textContent = action === 'accept' ? '✓' : '↶'
    button.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      onAction(action, hunk)
    })
    actions.append(button)
  }
  return actions
}

export function cloneDiffLine(
  row: ShikitorDiffRow,
  oldLines: DiffOriginalLines
) {
  const line = (row.oldLine ? oldLines.clone(row.oldLine) : undefined)
    ?? createPlainLine(row.oldText ?? '')
  line.removeAttribute('data-line')
  if (row.oldInline.length) {
    applyInlineRanges(line, row.oldInline, 'shikitor-diff-inline shikitor-diff-inline--removed')
  }
  return line
}
