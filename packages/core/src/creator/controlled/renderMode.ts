import type { DecorationItem } from '@shikijs/types'
import type { BundledLanguage, BundledTheme } from 'shiki'

import type {
  InlineReplacement,
  ShikitorHighlight,
  ShikitorOptions,
  ShikitorRenderMode
} from '../../editor'
import type { DocumentLines } from './documentLines'
import type { TokenSnapshot } from './tokenSnapshot'
import { hasRangeHighlights } from './highlightNormalizer'
import { canUseLessDom } from './lessDomRenderer'

export interface RenderInput {
  document: DocumentLines
  value: string
  theme: BundledTheme
  language: BundledLanguage
  decorations?: DecorationItem[]
  inlineReplacements?: InlineReplacement[]
  highlights?: ShikitorHighlight[]
  plugins?: ShikitorOptions['plugins']
  renderMode?: ShikitorRenderMode
}

export type RenderOutput =
  | { kind: 'html', value: string }
  | { kind: 'less-dom', value: TokenSnapshot }
  | { kind: 'tokens', value: TokenSnapshot }

export function canVirtualizeAllDom({
  decorations,
  highlights,
  inlineReplacements,
  plugins
}: Pick<RenderInput, 'decorations' | 'highlights' | 'inlineReplacements' | 'plugins'>) {
  return !decorations?.length
    && !hasRangeHighlights(highlights)
    && !inlineReplacements?.length
    && !plugins?.length
}

export function selectRenderMode({
  capable,
  needsProjection,
  requested = 'auto'
}: {
  capable: boolean
  needsProjection: boolean
  requested?: ShikitorRenderMode
}): Exclude<ShikitorRenderMode, 'auto'> {
  return requested !== 'all-dom' && !needsProjection && capable
    ? 'less-dom'
    : 'all-dom'
}

export function resolveRenderMode(
  target: HTMLElement,
  input: HTMLTextAreaElement,
  {
    decorations,
    highlights,
    inlineReplacements,
    plugins,
    renderMode = 'auto'
  }: RenderInput
): Exclude<ShikitorRenderMode, 'auto'> {
  const needsProjection = !canVirtualizeAllDom({
    decorations,
    highlights,
    inlineReplacements,
    plugins
  })
  const capable = canUseLessDom(input)
  target.dataset.shikitorLessDomCapable = String(capable)
  target.dataset.shikitorProjectionRequired = String(needsProjection)
  return selectRenderMode({
    capable,
    needsProjection,
    requested: renderMode
  })
}
