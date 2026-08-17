import { describe, expect, test, vi } from 'vitest'

import { Context, definePlugin } from '../src'
import type { Shikitor } from '../src'
import { resolveUpdatedPluginInputs } from '../src/creator/controlled/pluginsControlled'

describe('plugin option updates', () => {
  const plugin = definePlugin({ name: 'identity-plugin' })
  const replacement = definePlugin({ name: 'replacement-plugin' })
  const previous = [[plugin, { enabled: true }] as const]
  const previousSnapshot = Object.freeze([
    Object.freeze([plugin, Object.freeze({ enabled: true })])
  ])

  test('keeps live plugin identities when an updater spreads its options snapshot', () => {
    expect(resolveUpdatedPluginInputs(
      previous,
      previousSnapshot,
      previousSnapshot,
      true
    )).toBe(previous)
  })

  test('keeps plugins when a partial options update omits them', () => {
    expect(resolveUpdatedPluginInputs(previous, undefined, previousSnapshot, false)).toBe(previous)
  })

  test('replaces or clears plugins only when the update explicitly requests it', () => {
    const next = [replacement]
    expect(resolveUpdatedPluginInputs(previous, next, previousSnapshot, true)).toEqual(next)
    expect(resolveUpdatedPluginInputs(previous, next, previousSnapshot, true)).not.toBe(next)
    expect(resolveUpdatedPluginInputs(previous, undefined, previousSnapshot, true)).toEqual([])
  })
})

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
