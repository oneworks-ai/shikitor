import { LINE_PATCH_EVENT, VIRTUAL_LINE_ATTRIBUTE } from '@shikitor/core'

import { applyInlineRanges, cloneDiffLine, createHunkActions, createPlainLine } from './dom'
import type { DiffOriginalLines } from './syntax'
import type {
  ShikitorDiffHunk,
  ShikitorDiffHunkActionLabels,
  ShikitorDiffInlineRange,
  ShikitorDiffModel,
  ShikitorDiffRow,
  ShikitorDiffView
} from './types'

interface ViewState {
  model: ShikitorDiffModel
  view: ShikitorDiffView
  oldLines: DiffOriginalLines
  actions?: ShikitorDiffHunkActionLabels
  onAction(action: 'accept' | 'reject', hunk: ShikitorDiffHunk): void
}

interface VisualRow {
  /** Current-side line element when the row is a fold placeholder row. */
  foldLine?: HTMLElement
  row: ShikitorDiffRow
}

const DEFAULT_LINE_HEIGHT = 22
const ORIGINAL_OVERSCAN = 8

function originalLineCount(model: ShikitorDiffModel) {
  for (let index = model.rows.length - 1; index >= 0; index--) {
    const line = model.rows[index].oldLine
    if (line !== undefined) return line
  }
  return 1
}

function markerFor(row: ShikitorDiffRow, side: 'new' | 'old') {
  if (row.kind === 'context') return ''
  if (row.kind === 'modified') return '~'
  return side === 'new' ? '+' : '−'
}

function rowKey(row: ShikitorDiffRow | undefined) {
  return row ? `${row.kind}|${row.hunkId ?? ''}|${inlineKey(row.newInline)}` : ''
}

function inlineKey(ranges: readonly ShikitorDiffInlineRange[]) {
  if (!ranges.length) return ''
  let key = ''
  for (const range of ranges) key += `${range.start}-${range.end},`
  return key
}

/**
 * Rows of the original column that are visible on the current side. A
 * current line hidden by code folding hides its original row; a line that
 * carries a line-presentation fold shows one placeholder row instead.
 */
export function resolveVisualRows(
  rows: readonly ShikitorDiffRow[],
  currentLine: (line: number) => { hidden: boolean; foldLine: boolean } | undefined
): Array<{ index: number; fold: boolean }> {
  const visual: Array<{ index: number; fold: boolean }> = []
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    const state = row.newLine ? currentLine(row.newLine) : undefined
    if (state?.hidden) continue
    visual.push({ index, fold: state?.foldLine === true })
  }
  return visual
}

export function resolveOriginalWindow(
  scrollTop: number,
  clientHeight: number,
  lineHeight: number,
  rowCount: number,
  overscan = ORIGINAL_OVERSCAN
) {
  const height = lineHeight > 0 ? lineHeight : DEFAULT_LINE_HEIGHT
  const first = Math.max(0, Math.floor(scrollTop / height) - overscan)
  const last = Math.min(
    rowCount,
    Math.ceil((scrollTop + Math.max(0, clientHeight)) / height) + overscan
  )
  return { first, last: Math.max(first, last) }
}

function lineStructureChanged(records: MutationRecord[]) {
  for (const record of records) {
    if (record.type === 'attributes') return true
    for (const node of [...record.addedNodes, ...record.removedNodes]) {
      if (!(node instanceof Element)) continue
      // Cloned baseline lines inside widgets and the original column keep
      // the line class but never carry data-line; only real lines count.
      if (
        node.matches('.shikitor-output-line[data-line], .shikitor-gutter-line[data-line]')
        || node.querySelector('.shikitor-output-line[data-line], .shikitor-gutter-line[data-line]')
      ) return true
    }
  }
  return false
}

export class DiffView {
  private current = document.createElement('div')
  private original = document.createElement('div')
  private originalRows = document.createElement('div')
  private frame?: number
  private state?: ViewState
  private observer: MutationObserver
  private appliedOutput = new WeakMap<HTMLElement, string>()
  private appliedGutter = new WeakMap<HTMLElement, string>()
  private visualRows: VisualRow[] = []
  private lineHeight = DEFAULT_LINE_HEIGHT
  private windowKey = ''
  private patchedLines = new Set<HTMLElement>()
  private fullRender = true
  private rowsByLine = new Map<number, ShikitorDiffRow>()
  private actionLines = new Map<number, ShikitorDiffHunk>()
  /** Line maps stay valid until line elements are added or removed. */
  private outputLines = new Map<number, HTMLElement>()
  private gutterLines = new Map<number, HTMLElement>()
  private lineMapsValid = false
  /** Lines whose row or hunk-action key changed in the last model update. */
  private changedLines = new Set<number>()

  constructor(
    private target: HTMLElement,
    private output: HTMLElement,
    private gutters: HTMLElement,
    private input: HTMLTextAreaElement
  ) {
    this.current.className = 'shikitor-diff-current'
    this.original.className = 'shikitor-diff-original'
    this.original.setAttribute('aria-label', 'Original source')
    this.originalRows.className = 'shikitor-diff-original__rows'
    this.original.append(this.originalRows)
    this.current.append(...target.childNodes)
    target.append(this.original, this.current)
    target.classList.add('shikitor--diff')
    this.observer = new MutationObserver(records => {
      if (!lineStructureChanged(records)) return
      this.fullRender = true
      this.lineMapsValid = false
      this.schedule()
    })
    const options: MutationObserverInit = {
      attributeFilter: ['hidden', 'data-fold-presentation'],
      attributes: true,
      childList: true,
      subtree: true
    }
    this.observer.observe(output, options)
    this.observer.observe(gutters, options)
    input.addEventListener('scroll', this.syncScroll)
    output.addEventListener(LINE_PATCH_EVENT, this.onLinePatch)
  }

  /** A line re-rendered in place lost its inline markers; re-key it. */
  private onLinePatch = (event: Event) => {
    const line = event.target
    if (!(line instanceof HTMLElement)) return
    this.appliedOutput.delete(line)
    this.patchedLines.add(line)
    this.schedule()
  }

  update(state: ViewState) {
    const previous = this.state
    const previousRows = this.rowsByLine
    const previousActions = this.actionLines
    this.state = state
    this.rowsByLine = new Map()
    for (const row of state.model.rows) {
      if (row.newLine) this.rowsByLine.set(row.newLine, row)
    }
    this.actionLines = new Map()
    if (state.actions) {
      for (const hunk of state.model.hunks) {
        const row = hunk.rows.find(item => item.newLine)
        if (row?.newLine) this.actionLines.set(row.newLine, hunk)
      }
    }
    if (
      previous
      && previous.view === state.view
      && previous.oldLines === state.oldLines
      && this.lineMapsValid
    ) {
      // Same view and line DOM: only lines whose keys changed are touched.
      const lines = new Set<number>([...previousRows.keys(), ...this.rowsByLine.keys()])
      for (const line of lines) {
        const before = previousRows.get(line)
        const after = this.rowsByLine.get(line)
        if (
          rowKey(before) !== rowKey(after)
          || previousActions.get(line)?.id !== this.actionLines.get(line)?.id
        ) this.changedLines.add(line)
      }
    } else {
      this.fullRender = true
    }
    this.target.dataset.shikitorDiffView = state.view
    this.target.classList.toggle('shikitor--diff-split', state.view === 'split')
    this.target.style.setProperty(
      '--shikitor-diff-old-digits',
      `${Math.max(1, originalLineCount(state.model).toString().length)}ch`
    )
    this.schedule()
  }

  private syncScroll = () => {
    // Scroll offsets force layout; the original column is hidden in unified
    // view, so only split view pays for it.
    if (this.state?.view !== 'split') return
    this.originalRows.style.transform = `translateY(-${this.input.scrollTop}px)`
    this.originalRows.style.setProperty('--shikitor-diff-scroll-l', `${this.input.scrollLeft}px`)
    this.renderOriginalWindow()
  }

  private schedule() {
    if (this.frame !== undefined) return
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined
      this.render()
    })
  }

  private lineMaps() {
    if (this.lineMapsValid) return { gutterLines: this.gutterLines, outputLines: this.outputLines }
    const outputLines = new Map<number, HTMLElement>()
    const gutterLines = new Map<number, HTMLElement>()
    for (const element of this.output.querySelectorAll<HTMLElement>('.shikitor-output-line[data-line]')) {
      outputLines.set(Number(element.dataset.line), element)
    }
    for (const element of this.gutters.querySelectorAll<HTMLElement>('.shikitor-gutter-line[data-line]')) {
      gutterLines.set(Number(element.dataset.line), element)
    }
    this.outputLines = outputLines
    this.gutterLines = gutterLines
    this.lineMapsValid = true
    return { gutterLines, outputLines }
  }

  private cleanOutputLine(line: HTMLElement) {
    for (const marker of line.querySelectorAll<HTMLElement>('.shikitor-diff-inline')) {
      const parent = marker.parentNode
      marker.replaceWith(document.createTextNode(marker.textContent ?? ''))
      parent?.normalize()
    }
    delete line.dataset.diffKind
    delete line.dataset.hunk
  }

  private cleanGutterLine(gutter: HTMLElement) {
    delete gutter.dataset.diffKind
    delete gutter.dataset.hunk
    gutter.querySelectorAll('.shikitor-diff-gutter-marker, .shikitor-diff-hunk-actions')
      .forEach(element => element.remove())
  }

  private decorateOutputLine(line: number, element: HTMLElement) {
    const row = this.rowsByLine.get(line)
    // Placeholder lines carry no text yet; the materialization event re-keys
    // them so inline ranges are applied once content exists.
    const virtual = element.hasAttribute(VIRTUAL_LINE_ATTRIBUTE)
    const key = row
      ? `${row.kind}|${row.hunkId ?? ''}|${virtual ? 'v' : inlineKey(row.newInline)}`
      : ''
    const applied = this.appliedOutput.get(element)
    if (applied === key) return
    if (applied) this.cleanOutputLine(element)
    if (row) {
      element.dataset.diffKind = row.kind
      if (row.hunkId) element.dataset.hunk = row.hunkId
      if (!virtual) {
        applyInlineRanges(element, row.newInline, 'shikitor-diff-inline shikitor-diff-inline--added')
      }
      this.appliedOutput.set(element, key)
    } else {
      this.appliedOutput.delete(element)
    }
  }

  private decorateCurrent(
    outputLines: Map<number, HTMLElement>,
    gutterLines: Map<number, HTMLElement>
  ) {
    for (const [line, element] of outputLines) this.decorateOutputLine(line, element)
    for (const [line, element] of gutterLines) this.decorateGutterLine(line, element)
  }

  private decorateGutterLine(line: number, element: HTMLElement) {
    const state = this.state!
    const row = this.rowsByLine.get(line)
    const hunk = this.actionLines.get(line)
    const key = row
      ? `${row.kind}|${row.hunkId ?? ''}|${hunk ? hunk.id : ''}`
      : ''
    const applied = this.appliedGutter.get(element)
    if (applied === key) return
    if (applied) this.cleanGutterLine(element)
    if (row) {
      element.dataset.diffKind = row.kind
      if (row.hunkId) element.dataset.hunk = row.hunkId
      const marker = document.createElement('span')
      marker.className = 'shikitor-diff-gutter-marker'
      marker.textContent = markerFor(row, 'new')
      element.append(marker)
      if (hunk && state.actions) {
        element.append(createHunkActions(hunk, state.actions, state.onAction))
      }
      this.appliedGutter.set(element, key)
    } else {
      this.appliedGutter.delete(element)
    }
  }

  private createOriginalRow(visual: VisualRow, top: number) {
    const { row } = visual
    const element = document.createElement('div')
    element.style.top = `${top}px`
    if (visual.foldLine) {
      element.className = 'shikitor-diff-original__row shikitor-diff-context-fold'
      const gutter = document.createElement('div')
      gutter.className = 'shikitor-diff-original__gutter'
      const toggle = this.gutters
        .querySelector<HTMLElement>(`[data-line="${visual.foldLine.dataset.line}"]`)
        ?.querySelector<HTMLButtonElement>('.shikitor-fold-toggle')
        ?.cloneNode(true)
      if (toggle) gutter.append(toggle)
      const code = document.createElement('div')
      code.className = 'shikitor-diff-original__code'
      const placeholder = visual.foldLine
        .querySelector<HTMLButtonElement>('.shikitor-fold-placeholder--line')
        ?.cloneNode(true)
      if (placeholder) code.append(placeholder)
      element.append(gutter, code)
      return element
    }
    element.className = 'shikitor-diff-original__row'
    element.dataset.diffKind = row.kind
    const gutter = document.createElement('div')
    gutter.className = 'shikitor-diff-original__gutter'
    gutter.innerHTML = `<span>${row.oldLine ?? ''}</span><i>${markerFor(row, 'old')}</i>`
    const code = document.createElement('div')
    code.className = 'shikitor-diff-original__code'
    const line = row.oldText === undefined
      ? createPlainLine('')
      : cloneDiffLine(row, this.state!.oldLines)
    code.append(line)
    element.append(gutter, code)
    return element
  }

  private renderOriginalWindow(force = false) {
    const rows = this.visualRows
    const { first, last } = resolveOriginalWindow(
      this.input.scrollTop,
      this.input.clientHeight,
      this.lineHeight,
      rows.length
    )
    const key = `${first}:${last}`
    if (!force && key === this.windowKey) return
    this.windowKey = key
    const fragment = document.createDocumentFragment()
    for (let index = first; index < last; index++) {
      fragment.append(this.createOriginalRow(rows[index], index * this.lineHeight))
    }
    this.originalRows.replaceChildren(fragment)
  }

  private render() {
    const state = this.state
    if (!state) return
    if (!this.fullRender) {
      // Only lines whose row changed, or whose content was re-rendered, need
      // decorating again; the line maps are still valid.
      const { gutterLines, outputLines } = this.lineMaps()
      for (const line of this.changedLines) {
        const outputLine = outputLines.get(line)
        if (outputLine) this.decorateOutputLine(line, outputLine)
        const gutterLine = gutterLines.get(line)
        if (gutterLine) this.decorateGutterLine(line, gutterLine)
      }
      for (const element of this.patchedLines) {
        if (!element.isConnected) continue
        this.decorateOutputLine(Number(element.dataset.line), element)
      }
      this.changedLines.clear()
      this.patchedLines.clear()
      if (state.view === 'split') this.renderSplit(outputLines)
      return
    }
    this.fullRender = false
    this.changedLines.clear()
    this.patchedLines.clear()
    const { gutterLines, outputLines } = this.lineMaps()
    this.decorateCurrent(outputLines, gutterLines)
    if (state.view !== 'split') {
      if (this.originalRows.childElementCount) this.originalRows.replaceChildren()
      this.originalRows.style.removeProperty('height')
      this.visualRows = []
      this.windowKey = ''
      return
    }
    this.renderSplit(outputLines)
  }

  private renderSplit(outputLines: Map<number, HTMLElement>) {
    const state = this.state!
    this.lineHeight = Number.parseFloat(getComputedStyle(this.input).lineHeight)
      || DEFAULT_LINE_HEIGHT
    const visible = resolveVisualRows(state.model.rows, line => {
      const element = outputLines.get(line)
      if (!element) return undefined
      return {
        foldLine: element.dataset.foldPresentation === 'line',
        hidden: element.hidden
      }
    })
    this.visualRows = visible.map(({ fold, index }) => ({
      foldLine: fold ? outputLines.get(state.model.rows[index].newLine!) : undefined,
      row: state.model.rows[index]
    }))
    this.originalRows.style.height = `${this.visualRows.length * this.lineHeight}px`
    this.renderOriginalWindow(true)
    this.syncScroll()
  }

  dispose() {
    this.observer.disconnect()
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    this.input.removeEventListener('scroll', this.syncScroll)
    this.output.removeEventListener(LINE_PATCH_EVENT, this.onLinePatch)
    this.current.replaceWith(...this.current.childNodes)
    this.original.remove()
    this.target.classList.remove('shikitor--diff', 'shikitor--diff-split')
    delete this.target.dataset.shikitorDiffView
  }
}
