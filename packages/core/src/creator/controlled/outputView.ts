import type { RefObject } from '../../base'
import { cssvar } from '../../base'
import type { ResolvedCursor } from '../../editor'
import { HIGHLIGHTED, OUTPUT_HIGHLIGHTED } from '../classes'
import { resolveVirtualLineRange } from './virtualViewport'

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
  const gutterObserver = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(scheduleGutterRender)

  gutterObserver?.observe(input)
  input.addEventListener('scroll', scheduleGutterRender)

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

  function renderGutter(lineCount: number, useVirtualViewport: boolean) {
    if (!useVirtualViewport) {
      gutterLineCount = 0
      lines.classList.remove('shikitor-lines--compact', 'shikitor-lines--virtual')
      lines.dataset.lineCount = String(lineCount)
      lines.style.setProperty(
        cssvar('line-digit-count'),
        `${lineCount.toString().length}ch`
      )
      const prefix = 'shikitor-gutter-line'
      lines.innerHTML = Array.from({ length: lineCount }).map((_, index) => (
        `<div class="${prefix}" data-line="${index + 1}">`
        + `<div class="${prefix}-number">${index + 1}</div></div>`
      )).join('')
      return
    }
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
  }

  return { dispose, renderGutter, syncCurrentLineHighlight }
}
