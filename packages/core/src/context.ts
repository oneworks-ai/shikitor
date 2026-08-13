import type { Context as CordisContext } from 'cordis'

import type { _KeyboardEvent } from './base'
import type { ResolvedCursor, ResolvedSelection, Shikitor } from './editor'
import type { InputDispatchSummary, ShikitorInputEvent, ShikitorInputService } from './input'

declare module 'cordis' {
  interface Context {
    shikitor: Shikitor
    shikitorInput: ShikitorInputService
  }

  interface Events {
    'shikitor/change'(value: string): void
    'shikitor/cursor-change'(cursor?: ResolvedCursor): void
    'shikitor/selection-change'(selections: readonly ResolvedSelection[]): void
    'shikitor/focus'(): void
    'shikitor/blur'(): void
    'shikitor/keydown'(event: _KeyboardEvent): void
    'shikitor/keyup'(event: _KeyboardEvent): void
    'shikitor/keypress'(event: _KeyboardEvent): void
    'shikitor/input'(event: ShikitorInputEvent, summary: InputDispatchSummary): void
    'shikitor/dispose'(): void
  }
}

export type ShikitorContext = CordisContext

export { Context } from 'cordis'
export type { Fiber, Plugin } from 'cordis'
