export interface InlineReplacementMetric {
  atomic?: boolean
  end: number
  sourceEndX: number
  sourceStartX: number
  start: number
  visualWidth: number
}

export interface CollapsedReplacementRange {
  end: number
  interaction?: 'atomic' | 'collapsed'
  start: number
}

export type AtomicReplacementRange = CollapsedReplacementRange & {
  interaction: 'atomic'
}

export function resolveVisibleArrowOffset(
  offset: number,
  direction: 'left' | 'right',
  ranges: readonly CollapsedReplacementRange[],
  maximumOffset: number
) {
  if (direction === 'right') {
    const range = ranges.find(item => offset >= item.start && offset < item.end)
    if (range) {
      const target = range.interaction === 'atomic'
        ? range.end
        : range.end + (range.end < maximumOffset ? 1 : 0)
      return Math.min(maximumOffset, target)
    }
    return Math.min(maximumOffset, offset + 1)
  }

  const range = ranges.find(item => offset > item.start && offset <= item.end)
  if (range) {
    return Math.max(0, range.interaction === 'atomic' ? range.start : range.start - 1)
  }
  return Math.max(0, offset - 1)
}

export function resolveAtomicReplacementBoundary(
  offset: number,
  direction: 'left' | 'right',
  ranges: readonly AtomicReplacementRange[]
) {
  const range = ranges.find(item => offset > item.start && offset < item.end)
  if (!range) return offset
  return direction === 'left' ? range.start : range.end
}

export function normalizeAtomicReplacementSelection(
  anchor: number,
  focus: number,
  ranges: readonly AtomicReplacementRange[]
) {
  if (anchor === focus) {
    const range = ranges.find(item => focus > item.start && focus < item.end)
    if (!range) return { anchor, focus }
    const boundary = focus - range.start < range.end - focus
      ? range.start
      : range.end
    return { anchor: boundary, focus: boundary }
  }
  const forward = focus > anchor
  return {
    anchor: resolveAtomicReplacementBoundary(
      anchor,
      forward ? 'left' : 'right',
      ranges
    ),
    focus: resolveAtomicReplacementBoundary(
      focus,
      forward ? 'right' : 'left',
      ranges
    )
  }
}

export function resolveAtomicDeletionRange(
  offset: number,
  key: 'Backspace' | 'Delete',
  ranges: readonly AtomicReplacementRange[]
) {
  return ranges.find(range => key === 'Backspace'
    ? range.end === offset
    : range.start === offset)
}

export function resolveCollapsedReplacementBoundary(
  offset: number,
  direction: 'left' | 'right',
  ranges: readonly CollapsedReplacementRange[]
) {
  const range = ranges.find(item => offset >= item.start && offset <= item.end)
  if (!range) return offset
  return direction === 'left' ? range.start : range.end
}

export function normalizeCollapsedReplacementSelection(
  anchor: number,
  focus: number,
  direction: 'left' | 'right',
  ranges: readonly CollapsedReplacementRange[],
  normalizeAnchor: boolean
) {
  const normalizedFocus = resolveCollapsedReplacementBoundary(focus, direction, ranges)
  return {
    anchor: normalizeAnchor
      ? resolveCollapsedReplacementBoundary(anchor, direction, ranges)
      : anchor,
    focus: normalizedFocus
  }
}

export function clipVisualRange(start: number, end: number, viewportWidth: number) {
  const left = Math.max(0, start)
  const right = Math.min(viewportWidth, end)
  return right > left ? { left, width: right - left } : undefined
}

export function resolveReplacementScrollLeft(
  inputScrollLeft: number,
  inputScrollWidth: number,
  outputScrollWidth: number,
  viewportWidth: number
) {
  const inputMaximum = Math.max(0, inputScrollWidth - viewportWidth)
  const outputMaximum = Math.max(0, outputScrollWidth - viewportWidth)
  if (inputMaximum === 0 || outputMaximum === 0) return 0
  const ratio = Math.min(1, Math.max(0, inputScrollLeft / inputMaximum))
  return ratio * outputMaximum
}

export function resolveInlineReplacementCursorX(
  sourceX: number,
  offset: number,
  metrics: readonly InlineReplacementMetric[]
) {
  let delta = 0
  for (const metric of metrics) {
    if (offset <= metric.start) break
    const sourceWidth = metric.sourceEndX - metric.sourceStartX
    if (offset < metric.end) {
      if (metric.atomic) {
        const midpoint = metric.start + (metric.end - metric.start) / 2
        return metric.sourceStartX + delta + (offset < midpoint ? 0 : metric.visualWidth)
      }
      const progress = (offset - metric.start) / (metric.end - metric.start)
      return metric.sourceStartX + delta + metric.visualWidth * progress
    }
    delta += metric.visualWidth - sourceWidth
  }
  return sourceX + delta
}

export function resolveVisualCharacterAtX(
  lineLength: number,
  x: number,
  positionAt: (character: number) => number
) {
  let low = 0
  let high = lineLength
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2)
    if (positionAt(middle) <= x) low = middle
    else high = middle - 1
  }
  const currentX = positionAt(low)
  const nextX = low < lineLength ? positionAt(low + 1) : currentX
  return low < lineLength && x - currentX > (nextX - currentX) / 2
    ? low + 1
    : low
}
