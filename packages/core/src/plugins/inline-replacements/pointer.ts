import type { Shikitor } from '@shikitor/core'

import type { AtomicReplacementRange } from './geometry'
import { resolveVisualCharacterAtX } from './geometry'

interface PointerPositionOptions {
  atomicReplacementRanges: () => AtomicReplacementRange[]
  event: PointerEvent
  input: HTMLTextAreaElement
  shikitor: Shikitor
  visualScrollLeft: () => number
}

export function resolveInlineReplacementPointerPosition({
  atomicReplacementRanges,
  event,
  input,
  shikitor,
  visualScrollLeft
}: PointerPositionOptions) {
  const rect = input.getBoundingClientRect()
  const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22
  const lineCount = shikitor.value.split('\n').length
  const line = Math.min(
    lineCount,
    Math.max(1, Math.floor((event.clientY - rect.top + input.scrollTop) / lineHeight) + 1)
  )
  const lineText = shikitor.rawTextHelper.line({ line, character: 0 })
  const lineStart = shikitor.rawTextHelper.lineStart({ line, character: 0 })
  const x = Math.max(0, event.clientX - rect.left + visualScrollLeft())
  let offset = lineStart + resolveVisualCharacterAtX(
    lineText.length,
    x,
    index => shikitor._getCursorAbsolutePosition(
      shikitor.rawTextHelper.resolvePosition(lineStart + index)
    ).x
  )
  const atomicRange = atomicReplacementRanges().find(range => {
    const start = shikitor.rawTextHelper.resolvePosition(range.start)
    const end = shikitor.rawTextHelper.resolvePosition(range.end)
    if (start.line !== line || end.line !== line) return false
    const startX = shikitor._getCursorAbsolutePosition(start).x
    const endX = shikitor._getCursorAbsolutePosition(end).x
    return x >= startX && x <= endX
  })
  if (atomicRange) {
    const startX = shikitor._getCursorAbsolutePosition(
      shikitor.rawTextHelper.resolvePosition(atomicRange.start)
    ).x
    const endX = shikitor._getCursorAbsolutePosition(
      shikitor.rawTextHelper.resolvePosition(atomicRange.end)
    ).x
    offset = x < startX + (endX - startX) / 2
      ? atomicRange.start
      : atomicRange.end
  }
  return {
    atomicRange,
    position: shikitor.rawTextHelper.resolvePosition(offset)
  }
}
