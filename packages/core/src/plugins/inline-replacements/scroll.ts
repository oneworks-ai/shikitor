import type { Shikitor } from '@shikitor/core'

import { resolveReplacementScrollLeft } from './geometry'

interface InlineReplacementScrollOptions {
  container: HTMLElement
  focusOffset: number
  hasActiveReplacement: boolean
  input: HTMLTextAreaElement
  output: HTMLElement
  shikitor: Shikitor
  target: HTMLElement
}

export function syncInlineReplacementScroll({
  container,
  focusOffset,
  hasActiveReplacement,
  input,
  output,
  shikitor,
  target
}: InlineReplacementScrollOptions) {
  if (!hasActiveReplacement) {
    target.style.removeProperty('--shikitor-visual-scroll-l')
    target.style.setProperty('--shikitor-scroll-l', `${input.scrollLeft}px`)
    target.style.setProperty('--shikitor-offset-x', `${-input.scrollLeft}px`)
    output.scrollLeft = input.scrollLeft
    return
  }

  const viewportWidth = container.clientWidth
  const maximum = Math.max(0, output.scrollWidth - viewportWidth)
  let scrollLeft = resolveReplacementScrollLeft(
    input.scrollLeft,
    input.scrollWidth,
    output.scrollWidth,
    viewportWidth
  )
  if (document.activeElement === input && maximum > 0) {
    const focus = shikitor.rawTextHelper.resolvePosition(focusOffset)
    const focusX = shikitor._getCursorAbsolutePosition(focus).x
    if (focusX < scrollLeft) scrollLeft = focusX
    else if (focusX > scrollLeft + viewportWidth) scrollLeft = focusX - viewportWidth
    scrollLeft = Math.min(maximum, Math.max(0, scrollLeft))
  }
  target.style.setProperty('--shikitor-visual-scroll-l', `${scrollLeft}px`)
  target.style.setProperty('--shikitor-scroll-l', `${scrollLeft}px`)
  target.style.setProperty('--shikitor-offset-x', `${-scrollLeft}px`)
  output.scrollLeft = scrollLeft
}
