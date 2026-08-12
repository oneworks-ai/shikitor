import type { Context, Fiber } from 'cordis'
import { subscribe } from 'valtio/vanilla'

import type { RefObject } from '../../base'
import type { ShikitorSupportPlugin } from '../../editor'
import type { InputShikitorPlugin, ShikitorPlugin } from '../../plugin'

function installPlugin(context: Context, input: InputShikitorPlugin) {
  if (Array.isArray(input)) {
    return context.plugin(input[0], input[1])
  }
  return context.plugin(input as ShikitorPlugin)
}

export function pluginsControlled(
  ref: RefObject<{ plugins?: InputShikitorPlugin[] }>,
  context: Context
) {
  let pluginFibers: Fiber[] = []
  let disposed = false
  let pending = Promise.resolve()
  let installedPlugins: InputShikitorPlugin[] | undefined

  async function disposePlugins() {
    const fibers = pluginFibers.splice(0).reverse()
    await Promise.all(fibers.map(fiber => fiber.dispose()))
  }

  async function reconcile(inputs: InputShikitorPlugin[]) {
    if (disposed) return
    await disposePlugins()
    for (const input of inputs) {
      const fiber = installPlugin(context, input)
      pluginFibers.push(fiber)
      await fiber.await()
    }
  }

  function scheduleReconcile(force = false) {
    const inputs = [...ref.current.plugins ?? []]
    if (
      !force
      && installedPlugins?.length === inputs.length
      && installedPlugins.every((plugin, index) => plugin === inputs[index])
    ) return pending
    installedPlugins = inputs
    pending = pending
      .catch(() => void 0)
      .then(() => reconcile(inputs))
    return pending
  }

  const unsubscribe = subscribe(ref, () => scheduleReconcile())

  return {
    dispose() {
      disposed = true
      unsubscribe()
      void disposePlugins()
    },
    install: () => scheduleReconcile(true),
    shikitorSupportPlugin: <ShikitorSupportPlugin> {
      context,
      async upsertPlugin(plugin, index) {
        const plugins = ref.current.plugins ??= []
        if (index === undefined) {
          const nextIndex = plugins.length
          plugins.push(plugin)
          await scheduleReconcile()
          return nextIndex
        }
        if (index < 0 || index >= plugins.length) {
          throw new Error(`Invalid plugin index: ${index}`)
        }
        plugins.splice(index, 1, plugin)
        await scheduleReconcile()
        return index
      },
      async removePlugin(index) {
        const plugins = ref.current.plugins ??= []
        if (index < 0 || index >= plugins.length) {
          throw new Error(`Plugin not found at index ${index}`)
        }
        plugins.splice(index, 1)
        await scheduleReconcile()
      }
    }
  }
}
