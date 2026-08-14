import type {
  IDisposable,
  ResolvedTextRange,
  ShikitorInputEvent
} from '@shikitor/core'
import { definePlugin } from '@shikitor/core'
import type { Awaitable } from '@shikitor/core/types'

const name = 'provide-mouse'

export interface OnHoverElementContext {
  content: string
  element: Element
  raw: string
}

export interface ShikitorMouseProvider {
  onHover?(
    range: ResolvedTextRange,
    context: OnHoverElementContext,
    event: ShikitorInputEvent
  ): Awaitable<void>
}

/**
 * Compatibility facade for the original mouse provider API.
 *
 * New plugins should consume `shikitorPointer` or `editor.input.pointer`
 * directly. This adapter intentionally owns no DOM listeners or hit testing.
 */
export interface ShikitorMouseService {
  registerMouseProvider(provider: ShikitorMouseProvider): IDisposable
}

declare module 'cordis' {
  interface Context {
    shikitorMouse: ShikitorMouseService
  }
  interface Events {
    'shikitor/hover'(range: ResolvedTextRange, context: OnHoverElementContext): Awaitable<void>
  }
}

export default definePlugin({
  name,
  inject: ['shikitor'],
  apply(ctx) {
    const editor = ctx.shikitor
    const providers = new Set<ShikitorMouseProvider>()
    const hasPointerEvents = !!editor.element.ownerDocument.defaultView?.PointerEvent
    let previousOffset = -1

    const subscription = editor.input.pointer.subscribe(event => {
      const expectedType = hasPointerEvents ? 'pointermove' : 'mousemove'
      if (
        event.type === 'pointerleave'
        || event.type === 'mouseleave'
        || event.type === 'pointercancel'
      ) {
        previousOffset = -1
        return
      }
      if (
        event.type !== expectedType
        || event.hit.zone !== 'content'
        || !event.hit.position
      ) return
      if (event.hit.position.offset === previousOffset) return
      previousOffset = event.hit.position.offset

      const element = event.hit.element instanceof Element
        ? event.hit.element
        : editor.element
      const range = event.hit.token
        ? { start: event.hit.token.start, end: event.hit.token.end }
        : editor.rawTextHelper.resolveTextRange({
            start: event.hit.position.offset,
            end: Math.min(editor.value.length, event.hit.position.offset + 1)
          })
      const hoverContext = {
        content: editor.value.slice(range.start.offset, range.end.offset),
        element,
        raw: editor.value
      }
      ctx.emit('shikitor/hover', range, hoverContext)
      for (const provider of [...providers]) {
        void provider.onHover?.(range, hoverContext, event)
      }
    })

    ctx.provide('shikitorMouse', {
      registerMouseProvider(provider) {
        providers.add(provider)
        return { dispose: () => providers.delete(provider) }
      }
    })
    return () => {
      subscription.dispose()
      providers.clear()
    }
  }
})
