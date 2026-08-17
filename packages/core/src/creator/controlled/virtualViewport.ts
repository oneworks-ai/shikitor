export interface VirtualLineRange {
  end: number
  lineHeight: number
  start: number
}

const DEFAULT_LINE_HEIGHT = 22
const DEFAULT_OVERSCAN = 6

export function resolveVirtualLineRange(
  input: HTMLTextAreaElement,
  lineCount: number,
  overscan = DEFAULT_OVERSCAN
): VirtualLineRange {
  const computed = getComputedStyle(input)
  const lineHeight = Number.parseFloat(computed.lineHeight) || DEFAULT_LINE_HEIGHT
  const firstVisible = Math.max(0, Math.floor(input.scrollTop / lineHeight))
  const visibleLines = Math.max(1, Math.ceil(input.clientHeight / lineHeight))
  const start = Math.max(0, firstVisible - overscan)
  const end = Math.min(
    lineCount,
    firstVisible + visibleLines + overscan + 1
  )
  return { end, lineHeight, start }
}
