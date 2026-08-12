import type { InputShikitorPlugin } from '@shikitor/core'
import type { ModuleNamespace } from 'vite/types/hot.d.ts'

const bundledPluginModules = import.meta.glob([
  './*.ts',
  './*/index.ts',
  '../../../packages/core/src/plugins/*.ts',
  '../../../packages/core/src/plugins/*/index.ts'
], {
  eager: true
}) as Record<string, {
  default: InputShikitorPlugin
}>

function getId(path: string) {
  return path
    .replace(/^\.\//, '')
    .replace(/^\.\.\/\.\.\/\.\.\/packages\/core\/src\/plugins\//, '')
    .replace(/^\/@fs\/.*?\/plugins\//, '')
    .replace(/(\/index)?(.jsx?|.tsx?)$/, '')
}
export const bundledPluginsInfo = Object
  .entries(bundledPluginModules)
  .map(([path, module]) => {
    const name = getId(path)
    return { id: name, name, module }
  })

type Listener = (mods: (ModuleNamespace | undefined)[], paths?: string[]) => void
const listeners: Set<Listener> = new Set()
if (import.meta.hot) {
  import.meta.hot.accept([
    './*.ts',
    './*/index.ts',
    '../../../packages/core/src/plugins/*.ts',
    '../../../packages/core/src/plugins/*/index.ts'
  ], (mods, paths) => {
    for (const listener of listeners) listener(mods, paths)
  })
}

export function onPluginChange(lis: (index: number, id: string, module: InputShikitorPlugin) => void) {
  const listener: Listener = (mods, paths = []) => {
    for (const [index, mod] of mods.entries()) {
      if (!mod) continue
      const d = mod.default as InputShikitorPlugin
      if (!d) {
        console.warn('Plugin file must export a default value, skipping', paths[index])
        continue
      }
      lis(index, getId(paths[index] ?? '') ?? '', d)
    }
  }
  listeners.add(listener)
  return () => (listeners.delete(listener), void 0)
}
