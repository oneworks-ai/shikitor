import type { ShikitorInputCapabilityService } from '@shikitor/core'
import { definePlugin } from '@shikitor/core'

/**
 * Cordis facade for Shikitor's normalized pointer channel.
 *
 * Plugins can consume this service without installing their own DOM listeners.
 * Commands are still registered through the same editor input registry, so
 * priority, target hit-testing and event-consumption policies remain shared.
 */
export interface ShikitorPointerService extends ShikitorInputCapabilityService {}

declare module 'cordis' {
  interface Context {
    shikitorPointer: ShikitorPointerService
  }
}

export default definePlugin({
  name: 'provide-pointer',
  inject: ['shikitor'],
  apply(ctx) {
    const input = ctx.shikitor.input
    ctx.provide('shikitorPointer', {
      platform: input.platform,
      subscribe: listener => input.pointer.subscribe(listener),
      registerAction: action => input.registerAction(action),
      registerBinding: binding => input.registerBinding(binding),
      registerBindings: bindings => input.registerBindings(bindings)
    })
  }
})
