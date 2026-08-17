import type { DecorationItem } from '@shikijs/types'

import type { InlineReplacement } from '../../editor'

export function normalizeDecorations(
  value: string,
  decorations?: DecorationItem[]
): DecorationItem[] | undefined {
  if (!decorations?.length || value.length === 0) return undefined

  const lineStarts = [0]
  for (let offset = 0; offset < value.length; offset++) {
    if (value[offset] === '\n') lineStarts.push(offset + 1)
  }
  const resolveOffset = (position: DecorationItem['start']) => {
    if (typeof position === 'number') return position
    const { line, character } = position
    if (
      !Number.isInteger(line)
      || !Number.isInteger(character)
      || line < 0
      || line >= lineStarts.length
      || character < 0
    ) return undefined
    const lineStart = lineStarts[line]
    const lineEnd = line + 1 < lineStarts.length
      ? lineStarts[line + 1] - 1
      : value.length
    if (character > lineEnd - lineStart) return undefined
    return lineStart + character
  }

  const normalized: DecorationItem[] = []
  for (const decoration of decorations) {
    const start = resolveOffset(decoration.start)
    const end = resolveOffset(decoration.end)
    if (
      start === undefined
      || end === undefined
      || !Number.isInteger(start)
      || !Number.isInteger(end)
      || start < 0
      || end <= start
      || start >= value.length
      || end > value.length
    ) continue

    // Decorations crossing a line break are split into visible line ranges;
    // newline-only spans have no paintable geometry.
    let segmentStart = start
    for (let offset = start; offset < end; offset++) {
      if (value[offset] !== '\n') continue
      if (segmentStart < offset) {
        normalized.push({ ...decoration, start: segmentStart, end: offset })
      }
      segmentStart = offset + 1
    }
    if (segmentStart < end) {
      normalized.push({ ...decoration, start: segmentStart, end })
    }
  }
  return normalized.length ? normalized : undefined
}

export function normalizeInlineReplacementDecorations(
  value: string,
  replacements?: InlineReplacement[]
): DecorationItem[] | undefined {
  if (!replacements?.length) return undefined

  const decorations = replacements.map((replacement, index) => {
    const className = [
      replacement.properties?.class,
      'shikitor-inline-replacement'
    ].filter(Boolean).join(' ')
    const style = [
      replacement.properties?.style,
      `--shikitor-inline-replacement-size:${replacement.inlineSize ?? '1em'}`,
      replacement.blockSize
        ? `--shikitor-inline-replacement-block-size:${replacement.blockSize}`
        : undefined
    ].filter(Boolean).join(';')
    return {
      start: replacement.start,
      end: replacement.end,
      alwaysWrap: true,
      properties: {
        ...replacement.properties,
        class: className,
        style,
        'data-shikitor-inline-replacement': String(index),
        ...(replacement.interaction === 'atomic'
          ? { 'data-shikitor-inline-replacement-interaction': 'atomic' }
          : {})
      }
    } satisfies DecorationItem
  })
  const normalized = normalizeDecorations(value, decorations)
  return normalized?.map(decoration => ({
    ...decoration,
    properties: {
      ...decoration.properties,
      'data-shikitor-source-start': String(decoration.start),
      'data-shikitor-source-end': String(decoration.end),
      'data-shikitor-source-text': value.slice(
        decoration.start as number,
        decoration.end as number
      )
    }
  }))
}
