import type { ShikitorInputCapabilityService } from '@shikitor/core'
import { definePlugin } from '@shikitor/core'

export interface ShikitorKeyboardService extends ShikitorInputCapabilityService {}

declare module 'cordis' {
  interface Context {
    shikitorKeyboard: ShikitorKeyboardService
  }
}

export default definePlugin({
  name: 'provide-keyboard',
  inject: ['shikitor'],
  apply(ctx) {
    const input = ctx.shikitor.input
    ctx.provide('shikitorKeyboard', {
      platform: input.platform,
      subscribe: listener => input.keyboard.subscribe(listener),
      registerAction: action => input.registerAction(action),
      registerBinding: binding => input.registerBinding(binding),
      registerBindings: bindings => input.registerBindings(bindings)
    })
  }
})
