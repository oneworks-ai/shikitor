import type { Shikitor } from '@shikitor/core'

import { clipVisualRange } from './geometry'

interface SelectionRendererOptions {
  container: HTMLElement
  hasActiveReplacement: () => boolean
  input: HTMLTextAreaElement
  shikitor: Shikitor
  visualScrollLeft: () => number
}

export function createInlineReplacementSelectionRenderer({
  container,
  hasActiveReplacement,
  input,
  shikitor,
  visualScrollLeft
}: SelectionRendererOptions) {
  const layer = document.createElement('div')
  layer.className = 'shikitor-inline-replacement-selection'
  container.append(layer)

  function render() {
    layer.replaceChildren()
    const start = Math.min(input.selectionStart, input.selectionEnd)
    const end = Math.max(input.selectionStart, input.selectionEnd)
    if (start === end || document.activeElement !== input || !hasActiveReplacement()) return

    const startPosition = shikitor.rawTextHelper.resolvePosition(start)
    const endPosition = shikitor.rawTextHelper.resolvePosition(end)
    const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22
    const viewportWidth = layer.clientWidth || container.clientWidth
    for (let line = startPosition.line; line <= endPosition.line; line++) {
      const lineStart = shikitor.rawTextHelper.lineStart({ line, character: 0 })
      const lineEnd = shikitor.rawTextHelper.lineEnd({ line, character: 0 })
      const segmentStart = line === startPosition.line ? start : lineStart
      const segmentEnd = line === endPosition.line ? end : lineEnd
      const startGeometry = shikitor._getCursorAbsolutePosition(
        shikitor.rawTextHelper.resolvePosition(segmentStart)
      )
      const endGeometry = shikitor._getCursorAbsolutePosition(
        shikitor.rawTextHelper.resolvePosition(segmentEnd)
      )
      const topGeometry = shikitor._getCursorAbsolutePosition(
        shikitor.rawTextHelper.resolvePosition(lineStart),
        -1
      )
      const visualStart = startGeometry.x - visualScrollLeft()
      const visualEnd = endGeometry.x - visualScrollLeft()
      const clipped = clipVisualRange(visualStart, visualEnd, viewportWidth)
      if (!clipped) continue
      const marker = document.createElement('div')
      marker.className = 'shikitor-inline-replacement-selection__line'
      marker.style.left = `${clipped.left}px`
      marker.style.top = `${topGeometry.y - input.scrollTop}px`
      marker.style.width = `${clipped.width}px`
      marker.style.height = `${lineHeight}px`
      layer.append(marker)
    }
  }

  return { dispose: () => layer.remove(), render }
}
