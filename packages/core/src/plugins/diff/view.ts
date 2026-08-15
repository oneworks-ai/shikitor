import { applyInlineRanges, cloneDiffLine, createHunkActions, createPlainLine } from './dom'
import type {
  ShikitorDiffHunk,
  ShikitorDiffHunkActionLabels,
  ShikitorDiffModel,
  ShikitorDiffRow,
  ShikitorDiffView
} from './types'

interface ViewState {
  model: ShikitorDiffModel
  view: ShikitorDiffView
  oldLines: readonly HTMLElement[]
  actions?: ShikitorDiffHunkActionLabels
  onAction(action: 'accept' | 'reject', hunk: ShikitorDiffHunk): void
}

function markerFor(row: ShikitorDiffRow, side: 'new' | 'old') {
  if (row.kind === 'context') return ''
  if (row.kind === 'modified') return '~'
  return side === 'new' ? '+' : '−'
}

export class DiffView {
  private current = document.createElement('div')
  private original = document.createElement('div')
  private originalRows = document.createElement('div')
  private frame?: number
  private version = 0
  private state?: ViewState
  private observer: MutationObserver

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
    this.observer = new MutationObserver(() => this.schedule())
    this.observer.observe(output, { childList: true, subtree: true })
    this.observer.observe(gutters, { childList: true, subtree: true })
    input.addEventListener('scroll', this.syncScroll)
  }

  update(state: ViewState) {
    this.state = state
    this.version++
    this.target.dataset.shikitorDiffView = state.view
    this.target.classList.toggle('shikitor--diff-split', state.view === 'split')
    this.target.style.setProperty(
      '--shikitor-diff-old-digits',
      `${Math.max(1, state.model.original.split('\n').length.toString().length)}ch`
    )
    this.schedule()
  }

  private syncScroll = () => {
    this.originalRows.style.transform = `translateY(-${this.input.scrollTop}px)`
    this.originalRows.style.setProperty('--shikitor-diff-scroll-l', `${this.input.scrollLeft}px`)
  }

  private schedule() {
    if (this.frame !== undefined) return
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined
      this.render()
    })
  }

  private currentReady(version: string) {
    const source = this.output.querySelector<HTMLElement>('.shikitor-output-line[data-line]')
    const gutter = this.gutters.querySelector<HTMLElement>('.shikitor-gutter-line[data-line]')
    return source?.dataset.shikitorDiffVersion === version
      && gutter?.dataset.shikitorDiffVersion === version
  }

  private foldingSignature() {
    return [...this.output.querySelectorAll<HTMLElement>('.shikitor-output-line[data-line]')]
      .map(line => [
        line.dataset.line,
        line.hidden ? 'hidden' : line.dataset.foldPresentation ?? 'visible',
        line.querySelector('.shikitor-fold-placeholder')?.textContent ?? ''
      ].join(':'))
      .join('|')
  }

  private cleanCurrent() {
    this.output.querySelectorAll<HTMLElement>('.shikitor-diff-inline').forEach(marker => {
      const parent = marker.parentNode
      marker.replaceWith(document.createTextNode(marker.textContent ?? ''))
      parent?.normalize()
    })
    this.output.querySelectorAll<HTMLElement>('.shikitor-output-line[data-line]').forEach(line => {
      delete line.dataset.diffKind
      delete line.dataset.hunk
    })
    this.gutters.querySelectorAll<HTMLElement>('.shikitor-gutter-line[data-line]').forEach(line => {
      delete line.dataset.diffKind
      delete line.dataset.hunk
      line.querySelectorAll('.shikitor-diff-gutter-marker, .shikitor-diff-hunk-actions')
        .forEach(element => element.remove())
    })
  }

  private decorateCurrent(row: ShikitorDiffRow, version: string) {
    if (!row.newLine) return
    const line = this.output.querySelector<HTMLElement>(`[data-line="${row.newLine}"]`)
    const gutter = this.gutters.querySelector<HTMLElement>(`[data-line="${row.newLine}"]`)
    if (!line || !gutter) return
    line.dataset.diffKind = row.kind
    gutter.dataset.diffKind = row.kind
    if (row.hunkId) line.dataset.hunk = gutter.dataset.hunk = row.hunkId
    const marker = document.createElement('span')
    marker.className = 'shikitor-diff-gutter-marker'
    marker.textContent = markerFor(row, 'new')
    gutter.append(marker)
    applyInlineRanges(line, row.newInline, 'shikitor-diff-inline shikitor-diff-inline--added')
    line.dataset.shikitorDiffVersion = version
    gutter.dataset.shikitorDiffVersion = version
  }

  private createOriginalRow(row: ShikitorDiffRow) {
    const element = document.createElement('div')
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

  private createOriginalFoldRow(currentLine: HTMLElement) {
    const element = document.createElement('div')
    element.className = 'shikitor-diff-original__row shikitor-diff-context-fold'
    const gutter = document.createElement('div')
    gutter.className = 'shikitor-diff-original__gutter'
    const toggle = this.gutters
      .querySelector<HTMLElement>(`[data-line="${currentLine.dataset.line}"]`)
      ?.querySelector<HTMLButtonElement>('.shikitor-fold-toggle')
      ?.cloneNode(true)
    if (toggle) gutter.append(toggle)
    const code = document.createElement('div')
    code.className = 'shikitor-diff-original__code'
    const placeholder = currentLine
      .querySelector<HTMLButtonElement>('.shikitor-fold-placeholder--line')
      ?.cloneNode(true)
    if (placeholder) code.append(placeholder)
    element.append(gutter, code)
    return element
  }

  private renderOriginalRows() {
    return this.state!.model.rows.flatMap(row => {
      const currentLine = row.newLine
        ? this.output.querySelector<HTMLElement>(`[data-line="${row.newLine}"]`)
        : undefined
      if (currentLine?.hidden) return []
      if (currentLine?.dataset.foldPresentation === 'line') {
        return [this.createOriginalFoldRow(currentLine)]
      }
      return [this.createOriginalRow(row)]
    })
  }

  private render() {
    const state = this.state
    if (!state) return
    const version = String(this.version)
    if (!this.currentReady(version)) {
      this.cleanCurrent()
      state.model.rows.forEach(row => this.decorateCurrent(row, version))
      if (state.actions) {
        for (const hunk of state.model.hunks) {
          const row = hunk.rows.find(item => item.newLine)
          if (!row?.newLine) continue
          const gutter = this.gutters.querySelector<HTMLElement>(`[data-line="${row.newLine}"]`)
          gutter?.append(createHunkActions(hunk, state.actions, state.onAction))
        }
      }
      this.output.querySelectorAll<HTMLElement>('.shikitor-output-line[data-line]')
        .forEach(line => { line.dataset.shikitorDiffVersion = version })
      this.gutters.querySelectorAll<HTMLElement>('.shikitor-gutter-line[data-line]')
        .forEach(line => { line.dataset.shikitorDiffVersion = version })
    }
    const folding = this.foldingSignature()
    if (
      this.originalRows.dataset.shikitorDiffVersion !== version
      || this.originalRows.dataset.shikitorDiffFolding !== folding
    ) {
      this.originalRows.replaceChildren(...this.renderOriginalRows())
      this.originalRows.dataset.shikitorDiffVersion = version
      this.originalRows.dataset.shikitorDiffFolding = folding
    }
    this.syncScroll()
  }

  dispose() {
    this.observer.disconnect()
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    this.input.removeEventListener('scroll', this.syncScroll)
    this.current.replaceWith(...this.current.childNodes)
    this.original.remove()
    this.target.classList.remove('shikitor--diff', 'shikitor--diff-split')
    delete this.target.dataset.shikitorDiffView
  }
}
