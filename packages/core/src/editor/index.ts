import type { DecorationItem } from '@shikijs/core'
import type { BundledLanguage, BundledTheme } from 'shiki'

import type { _KeyboardEvent, RefObject, TextRange } from '../base'
import type { ShikitorContext } from '../context'
import type { InputPlatform } from '../input'
import type { InputShikitorPlugin } from '../plugin'
import type { RecursiveReadonly } from '../types'
import type { UpdateDispatcher } from '../utils/callUpdateDispatcher'
import type { RawTextHelper } from '../utils/getRawTextHelper'
import type { Cursor, ResolvedCursor, ResolvedSelection, Selection } from './base'

export * from './base'

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
   */
  currentLineHighlightColor?: string
  /**
   * @default false
   */
  hideSelfCursorUsername?: boolean
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
  decorations?: DecorationItem[]
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
  readonly element: HTMLElement
  value: string

  language?: BundledLanguage
  updateLanguage: UpdateDispatcher<Shikitor['language']>

  options:
    & RecursiveReadonly<Omit<ShikitorOptions, 'plugins'>>
    & { readonly plugins: readonly InputShikitorPlugin[] }
  readonly optionsRef: RefObject<ShikitorOptions>
  updateOptions: UpdateDispatcher<RecursiveReadonly<ShikitorOptions>, [], Promise<void>, Shikitor['options']>

  readonly cursor: ResolvedCursor
  focus: (cursor?: Cursor) => void
  blur: () => void

  readonly selections: readonly ResolvedSelection[]
  readonly selectionsRef: RefObject<ResolvedSelection[]>
  updateSelection: UpdateDispatcher<Selection, [index: number]>

  setRangeText: (range: TextRange, text: string) => Promise<void>

  readonly rawTextHelper: RawTextHelper
}

export interface Shikitor extends ShikitorBase, ShikitorSupportPlugin, ShikitorInternal, Disposable {
}
