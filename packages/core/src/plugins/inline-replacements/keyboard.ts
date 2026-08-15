import type { AtomicReplacementRange, CollapsedReplacementRange } from './geometry'
import {
  normalizeCollapsedReplacementSelection,
  resolveAtomicDeletionRange,
  resolveAtomicReplacementBoundary,
  resolveCollapsedReplacementBoundary,
  resolveVisibleArrowOffset
} from './geometry'

type ArrowDirection = 'left' | 'right'

interface KeyboardNavigationOptions {
  applySelection: (anchor: number, focus: number) => void
  atomicReplacementRanges: () => AtomicReplacementRange[]
  collapsedReplacementRanges: () => CollapsedReplacementRange[]
  input: HTMLTextAreaElement
  maximumOffset: () => number
}

interface PendingNativeNavigation {
  anchor: number
  direction: ArrowDirection
  focus: number
  key: string
  ranges: CollapsedReplacementRange[]
  atomicRanges: AtomicReplacementRange[]
  shiftKey: boolean
}

export function createInlineReplacementKeyboardNavigation({
  applySelection,
  atomicReplacementRanges,
  collapsedReplacementRanges,
  input,
  maximumOffset
}: KeyboardNavigationOptions) {
  let normalizationFrame: number | undefined
  let pendingNativeNavigation: PendingNativeNavigation | undefined

  function selectionEdges() {
    const backward = input.selectionDirection === 'backward'
    return {
      anchor: backward ? input.selectionEnd : input.selectionStart,
      focus: backward ? input.selectionStart : input.selectionEnd
    }
  }
  function normalizePendingNativeNavigation() {
    if (!pendingNativeNavigation) return
    if (normalizationFrame !== undefined) cancelAnimationFrame(normalizationFrame)
    normalizationFrame = undefined
    const pending = pendingNativeNavigation
    pendingNativeNavigation = undefined
    const current = selectionEdges()
    if (current.anchor === pending.anchor && current.focus === pending.focus) return
    const collapsed = normalizeCollapsedReplacementSelection(
      pending.shiftKey ? pending.anchor : current.focus,
      current.focus,
      pending.direction,
      pending.ranges,
      true
    )
    const normalizedFocus = resolveAtomicReplacementBoundary(
      collapsed.focus,
      pending.direction,
      pending.atomicRanges
    )
    const normalized = pending.shiftKey
      ? { anchor: pending.anchor, focus: normalizedFocus }
      : { anchor: normalizedFocus, focus: normalizedFocus }
    if (normalized.anchor === current.anchor && normalized.focus === current.focus) return
    applySelection(normalized.anchor, normalized.focus)
  }
  function scheduleNativeNormalization(pending: PendingNativeNavigation) {
    normalizePendingNativeNavigation()
    pendingNativeNavigation = pending
    normalizationFrame = requestAnimationFrame(normalizePendingNativeNavigation)
  }
  function handleKeyDown(event: KeyboardEvent) {
    if (event.isComposing) return false

    const atomicRanges = atomicReplacementRanges()
    if (
      (event.key === 'Backspace' || event.key === 'Delete')
      && input.selectionStart === input.selectionEnd
    ) {
      const range = resolveAtomicDeletionRange(
        input.selectionStart,
        event.key,
        atomicRanges
      )
      if (!range) return false
      event.preventDefault()
      event.stopImmediatePropagation()
      input.setRangeText('', range.start, range.end, 'start')
      input.dispatchEvent(new Event('input'))
      return true
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false

    const direction = event.key === 'ArrowLeft' ? 'left' : 'right'
    const ranges = collapsedReplacementRanges()
    const navigationRanges = [...ranges, ...atomicRanges]
      .sort((a, b) => a.start - b.start)
    if (navigationRanges.length === 0) return false
    const { anchor, focus } = selectionEdges()
    if (event.altKey || event.ctrlKey || event.metaKey) {
      scheduleNativeNormalization({
        anchor,
        direction,
        focus,
        key: event.key,
        ranges,
        atomicRanges,
        shiftKey: event.shiftKey
      })
      return false
    }

    const start = input.selectionStart
    const end = input.selectionEnd
    if (!event.shiftKey && start !== end) return false
    const nativeOffset = direction === 'left'
      ? Math.max(0, focus - 1)
      : Math.min(maximumOffset(), focus + 1)
    const targetOffset = resolveVisibleArrowOffset(
      focus,
      direction,
      navigationRanges,
      maximumOffset()
    )
    if (targetOffset === nativeOffset) return false

    event.preventDefault()
    event.stopImmediatePropagation()
    const selectionAnchor = event.shiftKey && start === end
      ? resolveCollapsedReplacementBoundary(anchor, direction, ranges)
      : anchor
    applySelection(event.shiftKey ? selectionAnchor : targetOffset, targetOffset)
    return true
  }
  function handleKeyUp(event: KeyboardEvent) {
    if (pendingNativeNavigation?.key === event.key) normalizePendingNativeNavigation()
  }
  function dispose() {
    if (normalizationFrame !== undefined) cancelAnimationFrame(normalizationFrame)
    normalizationFrame = undefined
    pendingNativeNavigation = undefined
  }

  return { dispose, handleKeyDown, handleKeyUp }
}
