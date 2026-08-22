import type { Shikitor } from '@shikitor/core'
import { setCursorGeometry } from '@shikitor/core'

import { resolveSelectionFocus } from '../../utils/resolveSelectionFocus'
import { installCursorGeometryLayer } from '../cursor-geometry-layer'
import type { InlineReplacementMetric } from './geometry'
import {
  normalizeAtomicReplacementSelection,
  resolveInlineReplacementCursorX
} from './geometry'
import { createInlineReplacementKeyboardNavigation } from './keyboard'
import { resolveInlineReplacementPointerPosition } from './pointer'
import {
  atomicReplacementRanges as resolveAtomicReplacementRanges,
  collapsedReplacementRanges as resolveCollapsedReplacementRanges,
  currentReplacementElements
} from './ranges'
import { syncInlineReplacementScroll } from './scroll'
import { createInlineReplacementSelectionRenderer } from './selection'

type CursorGeometryResolver = import('../cursor-geometry-layer').CursorGeometryResolver
interface InlineReplacementVisualElements {
  container: HTMLElement
  input: HTMLTextAreaElement
  output: HTMLElement
  shikitor: Shikitor
  target: HTMLElement
}

export function createInlineReplacementVisuals({
  container,
  input,
  output,
  shikitor,
  target
}: InlineReplacementVisualElements) {
  function replacementElements() {
    return currentReplacementElements(output, shikitor.value)
  }
  function replacementMetrics(
    line: number,
    getSourceCursorPosition: CursorGeometryResolver
  ): InlineReplacementMetric[] {
    return replacementElements().flatMap(element => {
      const start = Number(element.dataset.shikitorSourceStart)
      const end = Number(element.dataset.shikitorSourceEnd)
      if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return []
      const startPosition = shikitor.rawTextHelper.resolvePosition(start)
      const endPosition = shikitor.rawTextHelper.resolvePosition(end)
      if (startPosition.line !== line || endPosition.line !== line) return []
      return [{
        atomic: element.dataset.shikitorInlineReplacementInteraction === 'atomic',
        start,
        end,
        sourceStartX: getSourceCursorPosition(startPosition).x,
        sourceEndX: getSourceCursorPosition(endPosition).x,
        visualWidth: element.getBoundingClientRect().width
      }]
    }).sort((a, b) => a.start - b.start)
  }
  const geometryLayer = installCursorGeometryLayer(
    shikitor,
    (getSourceCursorPosition, cursor, lineOffset) => {
      const sourcePosition = getSourceCursorPosition(cursor, lineOffset)
      return {
        ...sourcePosition,
        x: resolveInlineReplacementCursorX(
          sourcePosition.x,
          cursor.offset,
          replacementMetrics(cursor.line, getSourceCursorPosition)
        )
      }
    }
  )

  function visualScrollLeft() {
    const value = target.style.getPropertyValue('--shikitor-visual-scroll-l')
      || target.style.getPropertyValue('--shikitor-scroll-l')
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : input.scrollLeft
  }
  function hasActiveReplacement() {
    return replacementElements().length > 0
  }
  function atomicReplacementRanges() {
    return resolveAtomicReplacementRanges(replacementElements())
  }
  function collapsedReplacementRanges() {
    return resolveCollapsedReplacementRanges(replacementElements())
  }
  function selectionFocus() {
    return resolveSelectionFocus(
      input.selectionStart,
      input.selectionEnd,
      input.selectionDirection
    )
  }
  function syncVisualScroll() {
    syncInlineReplacementScroll({
      container,
      focusOffset: selectionFocus(),
      hasActiveReplacement: hasActiveReplacement(),
      input,
      output,
      shikitor,
      target
    })
  }
  function renderCursor() {
    const cursor = document.activeElement === input
      ? shikitor.rawTextHelper.resolvePosition(selectionFocus())
      : shikitor.cursor
    const position = shikitor._getCursorAbsolutePosition(cursor, -1)
    setCursorGeometry(target, position)
  }
  function commitSelectionModel(anchor: number, focus: number) {
    shikitor.selectionsRef.current[0] = {
      start: shikitor.rawTextHelper.resolvePosition(Math.min(anchor, focus)),
      end: shikitor.rawTextHelper.resolvePosition(Math.max(anchor, focus))
    }
    shikitor.optionsRef.current.cursor = shikitor.rawTextHelper.resolvePosition(focus)
  }
  const selectionRenderer = createInlineReplacementSelectionRenderer({
    container,
    hasActiveReplacement,
    input,
    shikitor,
    visualScrollLeft
  })
  const renderSelection = selectionRenderer.render
  function applySelection(anchor: number, focus: number) {
    input.setSelectionRange(
      Math.min(anchor, focus),
      Math.max(anchor, focus),
      focus < anchor ? 'backward' : 'forward'
    )
    document.dispatchEvent(new Event('selectionchange'))
    commitSelectionModel(anchor, focus)
    renderCursor()
    renderSelection()
  }
  const keyboardNavigation = createInlineReplacementKeyboardNavigation({
    applySelection,
    atomicReplacementRanges,
    collapsedReplacementRanges,
    input,
    maximumOffset: () => shikitor.value.length
  })
  function pointerPosition(event: PointerEvent) {
    return resolveInlineReplacementPointerPosition({
      atomicReplacementRanges,
      event,
      input,
      shikitor,
      visualScrollLeft
    })
  }
  function normalizeSelection() {
    const backward = input.selectionDirection === 'backward'
    const anchor = backward ? input.selectionEnd : input.selectionStart
    const focus = backward ? input.selectionStart : input.selectionEnd
    const normalized = normalizeAtomicReplacementSelection(
      anchor,
      focus,
      atomicReplacementRanges()
    )
    if (normalized.anchor === anchor && normalized.focus === focus) return false
    applySelection(normalized.anchor, normalized.focus)
    return true
  }
  function render() {
    target.classList.toggle('shikitor--inline-replacement-active', hasActiveReplacement())
    normalizeSelection()
    syncVisualScroll()
    renderCursor()
    renderSelection()
  }
  function dispose() {
    keyboardNavigation.dispose()
    geometryLayer.dispose()
    target.style.removeProperty('--shikitor-visual-scroll-l')
    target.style.setProperty('--shikitor-scroll-l', `${input.scrollLeft}px`)
    target.style.setProperty('--shikitor-offset-x', `${-input.scrollLeft}px`)
    output.scrollLeft = input.scrollLeft
    selectionRenderer.dispose()
    target.classList.remove('shikitor--inline-replacement-active')
  }
  return {
    applySelection,
    applyKeyboardNavigation: keyboardNavigation.handleKeyDown,
    dispose,
    hasActiveReplacement,
    normalizeSelection,
    pointerPosition,
    render,
    renderCursor,
    renderSelection,
    finishKeyboardNavigation: keyboardNavigation.handleKeyUp
  }
}
