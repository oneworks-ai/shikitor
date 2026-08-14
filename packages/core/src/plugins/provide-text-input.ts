import type { ShikitorInputCapabilityService } from '@shikitor/core'
import { definePlugin } from '@shikitor/core'

export interface ShikitorTextInputService extends ShikitorInputCapabilityService {}

declare module 'cordis' {
  interface Context {
    shikitorTextInput: ShikitorTextInputService
  }
}

export default definePlugin({
  name: 'provide-text-input',
  inject: ['shikitor'],
  apply(ctx) {
    const input = ctx.shikitor.input
    ctx.provide('shikitorTextInput', {
      platform: input.platform,
      subscribe: listener => input.text.subscribe(listener),
      registerAction: action => input.registerAction(action),
      registerBinding: binding => input.registerBinding(binding),
      registerBindings: bindings => input.registerBindings(bindings)
    })
  }
})
