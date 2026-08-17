import type { DecorationItem } from '@shikijs/types'
import type { BundledLanguage, BundledTheme } from 'shiki'

import type { _KeyboardEvent, RefObject, TextRange } from '../base'
import type { ShikitorContext } from '../context'
import type { InputPlatform, ShikitorInputService } from '../input'
import type { InputShikitorPlugin } from '../plugin'
import type { RecursiveReadonly } from '../types'
import type { UpdateDispatcher } from '../utils/callUpdateDispatcher'
import type { RawTextHelper } from '../utils/getRawTextHelper'
import type { Cursor, ResolvedCursor, ResolvedSelection, Selection } from './base'

export * from './base'

export type ShikitorRenderMode = 'all-dom' | 'auto' | 'less-dom'

export interface InlineReplacement {
  /** Source range that remains authoritative for editing and copy. */
  start: DecorationItem['start']
  end: DecorationItem['end']
  /** Visual inline size of the replacement slot. @default 1em */
  inlineSize?: string
  /** Visual block size of the replacement slot. @default inlineSize */
  blockSize?: string
  /**
   * Editing behavior for the source range. `mapped` preserves source-level
   * caret stops; `atomic` exposes only the range boundaries. @default mapped
   */
  interaction?: 'atomic' | 'mapped'
  /** HTML properties applied to the rendered replacement wrapper. */
  properties?: DecorationItem['properties']
}

export interface HighlightLineRange {
  /** One-based first source line, inclusive. */
  start: number
  /** One-based last source line, inclusive. */
  end: number
}

export interface ShikitorHighlight {
  /** CSS color painted behind every configured target. */
  color: string
  /**
   * Full-line targets. Numbers are one-based source lines; ranges are
   * inclusive. A rule may mix isolated lines and ranges.
   */
  lines?: Array<number | HighlightLineRange>
  /** Source ranges painted behind text without changing the raw value. */
  ranges?: TextRange[]
  /** Optional class applied to the full-line marker and range wrapper. */
  className?: string
}

interface ShikitorEvents {
  onChange?: (value: string) => void
  onCursorChange?: (cursor?: ResolvedCursor) => void
  onDispose?: () => void
  onFocused?: () => void
  onBlurred?: () => void
  onSelectionChange?: (selections: readonly ResolvedSelection[]) => void
  onKeydown?: (e: _KeyboardEvent) => void
  onKeyup?: (e: _KeyboardEvent) => void
}

export interface ShikitorOptions extends ShikitorEvents {
  value?: string
  cursor?: Cursor
  language?: BundledLanguage
  lineNumbers?: 'on' | 'off'
  /**
   * @default true
   */
  highlightCurrentLine?: boolean
  /**
   * Background color used to highlight the active line.
   * @default the current theme foreground at 12% opacity
   */
  currentLineHighlightColor?: string
  /**
   * @default false
   */
  hideSelfCursorUsername?: boolean
  /**
   * Focus the editor after creation. Updating this option from `false` to
   * `true` also focuses an editor that is currently blurred. @default false
   */
  autoFocus?: boolean
  placeholder?: string
  /**
   * @default false
   *
   * automatically adjust the height of the textarea
   */
  autoSize?: boolean | {
    /**
     * @default 1
     */
    minRows?: number
    /**
     * @default 5
     */
    maxRows?: number
  }
  readOnly?: boolean
  theme?: BundledTheme
  /**
   * Rendering strategy. `auto` uses native form-control highlights when the
   * browser and active editor features support them, otherwise it falls back
   * to the complete DOM projection. @default auto
   */
  renderMode?: ShikitorRenderMode
  decorations?: DecorationItem[]
  /**
   * Paint full source lines or exact source ranges with custom colors.
   * Later full-line rules win when targets overlap.
   */
  highlights?: ShikitorHighlight[]
  /**
   * Replace source ranges visually without changing the textarea value.
   * Pair this option with the inline-replacements plugin so caret and
   * selection geometry follows the rendered slot instead of the raw glyph.
   */
  inlineReplacements?: InlineReplacement[]
  input?: {
    /**
     * Override the host platform used to resolve cross-platform input
     * modifiers such as `Mod`. This is captured when the editor is created;
     * updating it later does not recreate the input router.
     */
    platform?: InputPlatform
  }
  plugins?: InputShikitorPlugin[]
}

export interface ShikitorInternal {
  /**
   * @internal
   */
  _getCursorAbsolutePosition: (
    this: Shikitor,
    cursor: ResolvedCursor,
    lineOffset?: number
  ) => { x: number; y: number }
}

export interface ShikitorSupportPlugin {
  readonly context: ShikitorContext
  upsertPlugin: (this: Shikitor, plugin: InputShikitorPlugin, index?: number) => Promise<number>
  removePlugin: (this: Shikitor, index: number) => Promise<void>
}

export interface ShikitorBase {
  /** Root element containing Shikitor's rendered layers. */
  readonly element: HTMLElement
  /** Textarea used as the editor input, including a host-owned textarea passed to `create()`. */
  readonly inputElement: HTMLTextAreaElement
  /** Normalized editor input namespace shared by capability plugins. */
  readonly input: ShikitorInputService
  value: string

  language?: BundledLanguage
  updateLanguage: UpdateDispatcher<Shikitor['language']>

  options:
    & RecursiveReadonly<Omit<ShikitorOptions, 'plugins'>>
    & { readonly plugins: readonly InputShikitorPlugin[] }
  readonly optionsRef: RefObject<ShikitorOptions>
  updateOptions: UpdateDispatcher<RecursiveReadonly<ShikitorOptions>, [], Promise<void>, Shikitor['options']>

  readonly cursor: ResolvedCursor
  focus: (cursor?: Cursor, options?: FocusOptions) => void
  blur: () => void

  readonly selections: readonly ResolvedSelection[]
  readonly selectionsRef: RefObject<ResolvedSelection[]>
  updateSelection: UpdateDispatcher<Selection, [index: number]>

  setRangeText: (range: TextRange, text: string) => Promise<void>

  readonly rawTextHelper: RawTextHelper
}

export interface Shikitor extends ShikitorBase, ShikitorSupportPlugin, ShikitorInternal, Disposable {
}
