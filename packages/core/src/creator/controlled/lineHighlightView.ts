import type { ShikitorHighlight } from '../../editor'
import {
  normalizeLineHighlights,
  resolveLineHighlight
} from './highlightNormalizer'

interface VisibleLine {
  element?: HTMLElement
  height: number
  line: number
  top: number
}

interface DecoratedLine {
  classNames: string[]
  element: HTMLElement
}

export function createLineHighlightView({
  target,
  input,
  lines,
  output
}: {
  target: HTMLElement
  input: HTMLTextAreaElement
  lines: HTMLElement
  output: HTMLElement
}) {
  const layer = document.createElement('div')
  layer.className = 'shikitor-line-highlights'
  layer.setAttribute('aria-hidden', 'true')
  target.prepend(layer)

  let frame = 0
  let lineCount = 0
  let highlights = normalizeLineHighlights()
  let decoratedLines: DecoratedLine[] = []

  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(schedule)
  resizeObserver?.observe(input)
  input.addEventListener('scroll', schedule)

  function schedule() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(render)
  }

  function domLines(container: HTMLElement, selector: string) {
    const targetRect = target.getBoundingClientRect()
    return [...container.querySelectorAll<HTMLElement>(selector)]
      .flatMap(element => {
        if (element.hidden) return []
        const line = Number(element.dataset.line)
        const rect = element.getBoundingClientRect()
        if (
          !Number.isInteger(line)
          || line <= 0
          || rect.height <= 0
          || rect.bottom <= targetRect.top
          || rect.top >= targetRect.bottom
        ) return []
        return [{
          element,
          height: rect.height,
          line,
          top: rect.top - targetRect.top
        }]
      })
  }

  function fallbackLines(): VisibleLine[] {
    if (!lineCount) return []
    const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22
    const inputRect = input.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const start = Math.max(1, Math.floor(input.scrollTop / lineHeight) + 1)
    const end = Math.min(
      lineCount,
      Math.ceil((input.scrollTop + input.clientHeight) / lineHeight)
    )
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => {
      const line = start + index
      return {
        height: lineHeight,
        line,
        top: inputRect.top - targetRect.top
          + (line - 1) * lineHeight
          - input.scrollTop
      }
    })
  }

  function visibleLines() {
    const gutterLines = domLines(lines, '.shikitor-gutter-line[data-line]')
    if (gutterLines.length) return gutterLines
    const outputLines = domLines(output, '.shikitor-output-line[data-line]')
    return outputLines.length ? outputLines : fallbackLines()
  }

  function clearDecoratedLines() {
    for (const { element, classNames } of decoratedLines) {
      element.classList.remove('shikitor-line-highlighted')
      element.classList.remove(...classNames)
      element.style.removeProperty('--shikitor-line-highlight-color')
      delete element.dataset.shikitorLineHighlight
    }
    decoratedLines = []
  }

  function decorateDomLines(visibleLines: readonly VisibleLine[]) {
    for (const { element, line } of visibleLines) {
      if (!element) continue
      const highlight = resolveLineHighlight(line, highlights)
      if (!highlight) continue
      const classNames = highlight.className?.split(/\s+/).filter(Boolean) ?? []
      element.classList.add('shikitor-line-highlighted')
      element.classList.add(...classNames)
      element.style.setProperty(
        '--shikitor-line-highlight-color',
        highlight.color
      )
      element.dataset.shikitorLineHighlight = String(highlight.index)
      decoratedLines.push({ element, classNames })
    }
  }

  function render() {
    frame = 0
    clearDecoratedLines()
    if (!highlights.length) {
      // Measuring every line forces layout; skip it when nothing is painted.
      if (layer.childElementCount) layer.replaceChildren()
      return
    }
    const gutterLines = domLines(lines, '.shikitor-gutter-line[data-line]')
    const outputLines = domLines(output, '.shikitor-output-line[data-line]')
    if (outputLines.length) {
      layer.replaceChildren()
      decorateDomLines([...gutterLines, ...outputLines])
      return
    }
    const fragment = document.createDocumentFragment()
    for (const visibleLine of visibleLines()) {
      const highlight = resolveLineHighlight(visibleLine.line, highlights)
      if (!highlight) continue
      const marker = document.createElement('div')
      marker.className = [
        'shikitor-line-highlight',
        highlight.className
      ].filter(Boolean).join(' ')
      marker.dataset.line = String(visibleLine.line)
      marker.dataset.shikitorLineHighlight = String(highlight.index)
      marker.style.top = `${visibleLine.top}px`
      marker.style.height = `${visibleLine.height}px`
      marker.style.backgroundColor = highlight.color
      fragment.append(marker)
    }
    layer.replaceChildren(fragment)
  }

  const mutationObserver = new MutationObserver(schedule)
  mutationObserver.observe(lines, { childList: true, subtree: true })
  mutationObserver.observe(output, { childList: true, subtree: true })

  return {
    dispose() {
      cancelAnimationFrame(frame)
      clearDecoratedLines()
      mutationObserver.disconnect()
      resizeObserver?.disconnect()
      input.removeEventListener('scroll', schedule)
      layer.remove()
      target.classList.remove('shikitor--line-highlights')
    },
    setLineCount(value: number) {
      lineCount = value
      schedule()
    },
    update(value?: readonly ShikitorHighlight[]) {
      highlights = normalizeLineHighlights(value)
      target.classList.toggle('shikitor--line-highlights', highlights.length > 0)
      schedule()
    }
  }
}
