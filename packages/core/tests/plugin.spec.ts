import { describe, expect, test, vi } from 'vitest'

import { Context, definePlugin } from '../src'
import type { Shikitor } from '../src'

describe('Cordis plugin runtime', () => {
  test('injects the editor and disposes plugin effects', async () => {
    const context = new Context()
    const shikitor = {} as Shikitor
    const onChange = vi.fn()
    const onDispose = vi.fn()
    context.provide('shikitor', shikitor)

    const plugin = definePlugin({
      name: 'test-plugin',
      inject: ['shikitor'],
      apply(ctx) {
        expect(ctx.shikitor).toBe(shikitor)
        ctx.on('shikitor/change', onChange)
        return onDispose
      }
    })

    const fiber = await context.plugin(plugin)
    context.emit('shikitor/change', 'first')
    expect(onChange).toHaveBeenCalledWith('first')

    await fiber.dispose()
    context.emit('shikitor/change', 'second')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onDispose).toHaveBeenCalledOnce()
  })

  test('activates plugins when an injected service becomes available', async () => {
    const context = new Context()
    const apply = vi.fn()
    const consumer = definePlugin({
      name: 'consumer',
      inject: ['shikitor'],
      apply
    })

    const fiber = context.plugin(consumer)
    await fiber.await()
    expect(apply).not.toHaveBeenCalled()

    context.provide('shikitor', {} as Shikitor)
    await fiber.await()
    expect(apply).toHaveBeenCalledOnce()
  })
})
