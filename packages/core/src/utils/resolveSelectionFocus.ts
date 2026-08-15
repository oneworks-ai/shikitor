export function resolveSelectionFocus(
  start: number,
  end: number,
  direction: 'backward' | 'forward' | 'none'
) {
  return direction === 'backward' ? start : end
}
