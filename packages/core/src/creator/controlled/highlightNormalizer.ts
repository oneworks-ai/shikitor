import type { DecorationItem } from '@shikijs/types'

import type { ShikitorHighlight } from '../../editor'

export interface NormalizedLineHighlight {
  className?: string
  color: string
  end: number
  index: number
  start: number
}

function validLine(value: number) {
  return Number.isInteger(value) && value > 0
}

export function normalizeLineHighlights(
  highlights?: readonly ShikitorHighlight[]
): NormalizedLineHighlight[] {
  const normalized: NormalizedLineHighlight[] = []
  highlights?.forEach((highlight, index) => {
    const color = highlight.color.trim()
    if (!color) return
    for (const target of highlight.lines ?? []) {
      const start = typeof target === 'number' ? target : target.start
      const end = typeof target === 'number' ? target : target.end
      if (!validLine(start) || !validLine(end) || end < start) continue
      normalized.push({
        className: highlight.className,
        color,
        end,
        index,
        start
      })
    }
  })
  return normalized
}

export function resolveLineHighlight(
  line: number,
  highlights: readonly NormalizedLineHighlight[]
) {
  for (let index = highlights.length - 1; index >= 0; index--) {
    const highlight = highlights[index]
    if (line >= highlight.start && line <= highlight.end) return highlight
  }
}

export function hasRangeHighlights(highlights?: readonly ShikitorHighlight[]) {
  return highlights?.some(highlight => (
    !!highlight.color.trim() && !!highlight.ranges?.length
  )) ?? false
}

export function rangeHighlightDecorations(
  highlights?: readonly ShikitorHighlight[]
): DecorationItem[] | undefined {
  const decorations: DecorationItem[] = []
  highlights?.forEach((highlight, index) => {
    const color = highlight.color.trim()
    if (!color) return
    for (const range of highlight.ranges ?? []) {
      decorations.push({
        start: range.start,
        end: range.end,
        alwaysWrap: true,
        properties: {
          class: [
            'shikitor-range-highlight',
            highlight.className
          ].filter(Boolean).join(' '),
          style: `--shikitor-highlight-color:${color}`,
          'data-shikitor-range-highlight': String(index)
        }
      })
    }
  })
  return decorations.length ? decorations : undefined
}
