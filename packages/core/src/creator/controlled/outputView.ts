import type { RefObject } from '../../base'
import { cssvar } from '../../base'
import type { ResolvedCursor } from '../../editor'
import { HIGHLIGHTED, OUTPUT_HIGHLIGHTED } from '../classes'
import { createLineHighlightView } from './lineHighlightView'
import { resolveVirtualLineRange } from './virtualViewport'

export function resolveContentOffsetTop(input: HTMLTextAreaElement) {
  return input.parentElement?.offsetTop ?? 0
}

export function createOutputView({
  target,
  input,
  lines,
  output,
  cursorRef
}: {
  target: HTMLElement
  input: HTMLTextAreaElement
  lines: HTMLElement
  output: HTMLElement
  cursorRef: RefObject<ResolvedCursor>
}) {
  let gutterFrame = 0
  let gutterLineCount = 0
  let fullGutterCount = 0
  const lineHighlightView = createLineHighlightView({ target, input, lines, output })
  const gutterObserver = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(() => {
        syncContentOffsetTop()
        scheduleGutterRender()
      })

  gutterObserver?.observe(input)
  input.addEventListener('scroll', scheduleGutterRender)

  function syncContentOffsetTop() {
    target.style.setProperty(
      cssvar('content-offset-top'),
      `${resolveContentOffsetTop(input)}px`
    )
  }

  function scheduleGutterRender() {
    cancelAnimationFrame(gutterFrame)
    gutterFrame = requestAnimationFrame(renderGutterViewport)
  }

  function renderGutterViewport() {
    if (!gutterLineCount) return
    const range = resolveVirtualLineRange(input, gutterLineCount)
    let viewport = lines.querySelector<HTMLElement>('.shikitor-gutter-viewport')
    if (!viewport) {
      viewport = document.createElement('div')
      viewport.className = 'shikitor-gutter-viewport'
      lines.replaceChildren(viewport)
      delete lines.dataset.gutterKind
    }
    const fragment = document.createDocumentFragment()
    for (let index = range.start; index < range.end; index++) {
      const line = document.createElement('div')
      line.className = 'shikitor-gutter-line'
      line.dataset.line = String(index + 1)
      const number = document.createElement('div')
      number.className = 'shikitor-gutter-line-number'
      number.textContent = String(index + 1)
      line.append(number)
      fragment.append(line)
    }
    viewport.replaceChildren(fragment)
    viewport.style.transform = `translateY(${range.start * range.lineHeight - input.scrollTop}px)`
    syncCurrentLineHighlight()
  }

  function createGutterLine(index: number) {
    const line = document.createElement('div')
    line.className = 'shikitor-gutter-line'
    line.dataset.line = String(index + 1)
    const number = document.createElement('div')
    number.className = 'shikitor-gutter-line-number'
    number.textContent = String(index + 1)
    line.append(number)
    return line
  }

  /**
   * Complete gutter for projected editors. Plugins decorate gutter lines and
   * insert spacers between them, so the existing elements are kept and only
   * the line-count delta is appended or removed.
   */
  function renderFullGutter(lineCount: number) {
    if (lines.dataset.gutterKind !== 'full' || fullGutterCount === 0) {
      const fragment = document.createDocumentFragment()
      for (let index = 0; index < lineCount; index++) {
        fragment.append(createGutterLine(index))
      }
      lines.replaceChildren(fragment)
      lines.dataset.gutterKind = 'full'
      fullGutterCount = lineCount
      return
    }
    if (lineCount === fullGutterCount) return
    if (lineCount > fullGutterCount) {
      const fragment = document.createDocumentFragment()
      for (let index = fullGutterCount; index < lineCount; index++) {
        fragment.append(createGutterLine(index))
      }
      lines.append(fragment)
    } else {
      const gutterLines = lines.querySelectorAll<HTMLElement>('.shikitor-gutter-line')
      for (let index = lineCount; index < gutterLines.length; index++) {
        gutterLines[index].remove()
      }
    }
    fullGutterCount = lineCount
  }

  let contentOffsetSynced = false
  function renderGutter(lineCount: number, useVirtualViewport: boolean) {
    lineHighlightView.setLineCount(lineCount)
    // offsetTop forces layout; the resize observer keeps it current after
    // the first render.
    if (!contentOffsetSynced) {
      contentOffsetSynced = true
      syncContentOffsetTop()
    }
    if (!useVirtualViewport) {
      gutterLineCount = 0
      lines.classList.remove('shikitor-lines--compact', 'shikitor-lines--virtual')
      lines.dataset.lineCount = String(lineCount)
      lines.style.setProperty(
        cssvar('line-digit-count'),
        `${lineCount.toString().length}ch`
      )
      renderFullGutter(lineCount)
      return
    }
    fullGutterCount = 0
    gutterLineCount = lineCount
    lines.classList.remove('shikitor-lines--compact')
    lines.classList.add('shikitor-lines--virtual')
    lines.dataset.lineCount = String(lineCount)
    lines.style.setProperty(
      cssvar('line-digit-count'),
      `${lineCount.toString().length}ch`
    )
    renderGutterViewport()
  }

  function syncCurrentLineHighlight() {
    const cursorLine = cursorRef.current.line
    if (target.dataset.shikitorRenderMode === 'less-dom') {
      target.style.setProperty(
        cssvar('current-line-top'),
        `calc(${Math.max(0, cursorLine - 1)} * var(--line-height) - var(${cssvar('scroll-t')}, 0px))`
      )
      return
    }
    target.style.removeProperty(cssvar('current-line-top'))
    const targets = [
      [lines, HIGHLIGHTED],
      [output, OUTPUT_HIGHLIGHTED]
    ] as const
    for (const [container, className] of targets) {
      const oldLine = container.querySelector(`.${className}`)
      const line = cursorLine
        ? container.querySelector<HTMLElement>(`[data-line="${cursorLine}"]`)
        : undefined
      if (oldLine === line) continue
      oldLine?.classList.remove(className)
      line?.classList.add(className)
    }
  }

  function dispose() {
    cancelAnimationFrame(gutterFrame)
    gutterObserver?.disconnect()
    input.removeEventListener('scroll', scheduleGutterRender)
    target.style.removeProperty(cssvar('content-offset-top'))
    lineHighlightView.dispose()
  }

  return {
    dispose,
    renderGutter,
    syncCurrentLineHighlight,
    updateLineHighlights: lineHighlightView.update
  }
}
