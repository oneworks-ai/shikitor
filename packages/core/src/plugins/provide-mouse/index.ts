import type { IDisposable, ResolvedTextRange } from '@shikitor/core'
import { definePlugin } from '@shikitor/core'
import type { Awaitable } from '@shikitor/core/types'
import { throttle } from '@shikitor/core/utils' with {
  'unbundled-reexport': 'on'
}

const name = 'provide-mouse'

export interface OnHoverElementContext {
  content: string
  element: Element
  raw: string
}

export interface ShikitorMouseService {
  registerMouseProvider(provider: {}): IDisposable
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
    const shikitor = ctx.shikitor
    const input = shikitor.element.querySelector(
      `:scope > .${'shikitor'}-container > .${'shikitor'}-input`
    ) as HTMLTextAreaElement
    const output = shikitor.element.querySelector(
      `:scope > .${'shikitor'}-container > .${'shikitor'}-output`
    ) as HTMLElement
    let prevOutputHoverElement: Element | null = null
    const onMousemove = throttle(e => {
          input.style.pointerEvents = 'none'
          output.style.pointerEvents = 'auto'
          const outputHoverElement = document.elementFromPoint(e.clientX, e.clientY)
          input.style.pointerEvents = ''
          output.style.pointerEvents = ''
          if (outputHoverElement === prevOutputHoverElement) {
            return
          }
          prevOutputHoverElement = outputHoverElement
          if (outputHoverElement === null) {
            return
          }
          if (
            outputHoverElement.className.includes('shikitor')
            && outputHoverElement.className.includes('output')
          ) {
            return
          }

          if (!outputHoverElement?.className.includes('position')) {
            return
          }

          const offsetStr = /offset:(\d+)/
            .exec(outputHoverElement.className)
            ?.[1]
          if (!offsetStr) {
            return
          }
          const offset = Number(offsetStr)
          if (isNaN(offset)) {
            return
          }
          const [line, start, end] = /position:(\d+):(\d+),(\d+)/
            .exec(outputHoverElement.className)
            ?.slice(1)
            ?.map(Number)
            ?? []
          if (!line || !start || !end || [line, start, end].some(isNaN)) {
            return
          }

          ctx.emit('shikitor/hover', {
            start: { offset, line, character: start },
            end: { offset, line, character: end }
          }, {
            content: input.value.slice(start - 1, end - 1),
            element: outputHoverElement,
            raw: input.value
          })
    }, 50)
    input.addEventListener('mousemove', onMousemove)
    ctx.provide('shikitorMouse', {
      registerMouseProvider() {
        // TODO
        return {}
      }
    })
    return () => input.removeEventListener('mousemove', onMousemove)
  }
})
