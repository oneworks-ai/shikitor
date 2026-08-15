import type { AtomicReplacementRange, CollapsedReplacementRange } from './geometry'

function sourceRange(element: HTMLElement) {
  const start = Number(element.dataset.shikitorSourceStart)
  const end = Number(element.dataset.shikitorSourceEnd)
  return Number.isInteger(start) && Number.isInteger(end) && end > start
    ? { start, end }
    : undefined
}

export function currentReplacementElements(output: HTMLElement, value: string) {
  return [...output.querySelectorAll<HTMLElement>('[data-shikitor-inline-replacement]')]
    .filter(element => {
      const range = sourceRange(element)
      return range
        && element.dataset.shikitorSourceText === value.slice(range.start, range.end)
    })
}

export function atomicReplacementRanges(elements: readonly HTMLElement[]) {
  return elements.flatMap(element => {
    if (element.dataset.shikitorInlineReplacementInteraction !== 'atomic') return []
    const range = sourceRange(element)
    return range
      ? [{ ...range, interaction: 'atomic' as const } satisfies AtomicReplacementRange]
      : []
  })
}

export function collapsedReplacementRanges(elements: readonly HTMLElement[]) {
  return elements.flatMap(element => {
    if (
      element.dataset.shikitorInlineReplacementInteraction === 'atomic'
      || element.getBoundingClientRect().width > 0.5
    ) return []
    const range = sourceRange(element)
    return range ? [range satisfies CollapsedReplacementRange] : []
  })
}
