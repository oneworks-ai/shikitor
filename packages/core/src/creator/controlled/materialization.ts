/**
 * Window of visible rows that should carry real content. Rows are addressed
 * by their position in a visible-row list (hidden lines excluded); `top`
 * returns a row's offset from the scrolled content origin and must be
 * non-decreasing over that list.
 */
export function resolveMaterializationWindow(
  rowCount: number,
  top: (row: number) => number,
  scrollTop: number,
  viewportHeight: number,
  overscan: number
): { first: number; last: number } {
  if (rowCount <= 0) return { first: 0, last: 0 }
  const lower = scrollTop - overscan
  const upper = scrollTop + Math.max(0, viewportHeight) + overscan
  // Last row that starts at or before the lower edge (it may still overlap).
  let low = 0
  let high = rowCount - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (top(middle) <= lower) low = middle
    else high = middle - 1
  }
  const first = low
  // First row that starts at or after the upper edge.
  low = first
  high = rowCount
  while (low < high) {
    const middle = (low + high) >> 1
    if (top(middle) < upper) low = middle + 1
    else high = middle
  }
  return { first, last: Math.max(first, low) }
}

export const MATERIALIZATION_OVERSCAN_LINES = 12
