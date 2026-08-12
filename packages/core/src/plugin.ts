import type { Plugin as CordisPlugin } from 'cordis'

export type ShikitorPlugin<Config = any> = CordisPlugin<Config>

export type InputShikitorPlugin =
  | ShikitorPlugin
  | readonly [plugin: ShikitorPlugin, config: unknown]

export function definePlugin<Config>(plugin: CordisPlugin.Object<Config>): CordisPlugin.Object<Config>
export function definePlugin<Config>(plugin: ShikitorPlugin<Config>): ShikitorPlugin<Config>
export function definePlugin<Config>(plugin: ShikitorPlugin<Config>) {
  return plugin
}
