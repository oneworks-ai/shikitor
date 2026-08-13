import './index.scss'

import type {
  IDisposable,
  LanguageSelector,
  ProviderResult,
  ResolvedTextRange,
  Shikitor
} from '@shikitor/core'
import { definePlugin } from '@shikitor/core'
import type {} from '@shikitor/core/plugins/provide-popup'
import type { Nullable } from '@shikitor/core/types'
import { classnames, icon, isUnset, UNSET } from '@shikitor/core/utils' with {
  'unbundled-reexport': 'on'
}
import { scoped } from '@shikitor/core/utils/valtio'
import { derive } from 'valtio/utils'
import { proxy, ref, snapshot } from 'valtio/vanilla'

const name = 'provide-selection-toolbox'

const uuidSym = Symbol('uuid')

export type ToolInner =
  & {
    title?: string
  }
  & (
    | {
      label?: string
      icon?: string
      type: 'button'
      onClick?: () => void
    }
    | {
      label?: string
      icon?: string
      type: 'toggle'
      activated?: boolean
      onToggle?: () => void
    }
    | {
      type: 'select'
      placeholder?: string
      disabled?: boolean
      activatable?: boolean
      prefixIcon?: string
      noMoreIcon?: boolean
      /**
       * @default 'column'
       */
      direction?: 'row' | 'column'
      options?: readonly {
        label?: string
        icon?: string
        title?: string
        activated?: boolean
        value?: string
      }[]
      onSelect?: (value?: string, index?: number) => void
    }
  )

declare module '@shikitor/core' {
  export type Tool = ToolInner
  export interface ToolList extends IDisposable {
    tools: ToolInner[]
  }
  export interface SelectionToolsProvider {
    provideSelectionTools: (selectionText: string, selection: ResolvedTextRange) => ProviderResult<ToolList>
  }
}

export interface ShikitorSelectionToolsService {
  registerSelectionToolsProvider: (selector: LanguageSelector, provider: import('@shikitor/core').SelectionToolsProvider) => IDisposable
}

declare module 'cordis' {
  interface Context {
    shikitorSelectionTools: ShikitorSelectionToolsService
  }
}

function toolItemTemplate(tool: ToolInner) {
  const { prefix } = toolItemTemplate
  if (tool.type === 'button' || tool.type === 'toggle') {
    return `<div class='${
      classnames(
        prefix,
        {
          [`${prefix}--activated`]: tool.type === 'toggle' && tool.activated
        },
        `${prefix}-button`
      )
    }' data-${prefix}-uuid='${(
      // @ts-expect-error
      tool[uuidSym]
    )}'>
      ${tool.icon ? icon(tool.icon ?? '', `${prefix}__btn`) : ''}
      ${tool.label ? `<div class='${prefix}__label'>${tool.label}</div>` : ''}
    </div>`
  }
  if (tool.type === 'select') {
    const activatedOption = tool.options?.find(option => option.activated)
    const label = activatedOption?.label ?? tool.placeholder
    return `<div class='${
      classnames(
        prefix,
        `${prefix}--select`,
        {
          [`${prefix}--disabled`]: tool.disabled,
          [`${prefix}--activated`]: !!activatedOption
        }
      )
    }' data-${prefix}-uuid='${(
      // @ts-expect-error
      tool[uuidSym]
    )}'>
      ${tool.prefixIcon ? icon(tool.prefixIcon, classnames(`${prefix}__input-prefix`)) : ''}
      ${label ? `<div class='${prefix}__input'>${label}</div>` : ''}
      ${!tool.noMoreIcon ? icon('expand_more', classnames(`${prefix}__input-more`)) : ''}
    </div>`
  }
  return ''
}
toolItemTemplate.prefix = `${'shikitor'}-popup-selection-toolbox-item`

function showSelector(
  shikitor: Shikitor,
  mountPopup: import('@shikitor/core/plugins/provide-popup').ShikitorPopupService['mountPopup'],
  dom: HTMLElement,
  { activatable, direction, options, onClose, onSelect }: ToolInner & { type: 'select' } & { onClose?: () => void }
) {
  const prefix = `${'shikitor'}-popup-selector`
  const rect = dom.getBoundingClientRect()
  const width = direction === 'row' ? undefined : 200
  const height = direction === 'row' ? 28 : 120
  const close = () => {
    popupOptions.remove()
    onClose?.()
  }
  const popupOptions = mountPopup({
    id: 'selector',
    position: 'absolute',
    width,
    height,
    offset: {
      left: rect.left,
      top: rect.top - height
    },
    render(element) {
      const optionsStr = options!.map(option => {
        const { label, icon: i, title, activated, value } = option
        const optionClass = classnames(
          `${prefix}__option`,
          {
            [`${prefix}__option--activated`]: activated
          }
        )
        const displayActivated = activated && direction !== 'row'
        return `<div
          class='${optionClass}'
          ${title ? `title='${title ?? label}'` : ''}
          data-${prefix}-value='${value}'
        >
          ${displayActivated ? icon('check', `${prefix}__option-icon`) : ''}
          ${i ? icon(i, `${prefix}__option-icon`) : ''}
          ${label ? `<span>${label}</span>` : ''}
        </div>`
      }).join('')
      element.innerHTML = `
      <div class='${(classnames(
        `${prefix}__options`,
        {
          [`${prefix}__options--activatable`]: activatable
        },
        `${prefix}__options--direction-${direction ?? 'column'}`
      ))}'>${optionsStr}</div>
      `
      element.addEventListener('mousedown', e => e.preventDefault())
      element.addEventListener('click', e => {
        const optionEle = (e.target as HTMLElement)?.closest(`.${prefix}__option`) as HTMLDivElement | null
        if (optionEle === null) return
        if (optionEle.classList.contains(`${prefix}__option--activated`)) return
        const value = optionEle.getAttribute(`data-${prefix}-value`) as string | undefined
        const index = options!.findIndex(option => option.value === value)
        onSelect?.(value, index)
        close()
      })
    }
  })
  return {
    close
  }
}

export default definePlugin({
  name,
  inject: ['shikitor', 'shikitorPopup'],
  apply(ctx) {
        const shikitor = ctx.shikitor
        const { optionsRef, selectionsRef } = shikitor
        const languageRef = derive({
          current: get => get(optionsRef).current.language
        })
        const firstSelectionRef = derive({
          current: get => get(selectionsRef).current[0]
        })
        const { disposeScoped, scopeWatch } = scoped()
        const elementRef = proxy({ current: ref<HTMLDivElement | typeof UNSET>(UNSET) })
        const toolMap = new Map<string, ToolInner>()
        const toolStore = new Map<string, unknown>()
        const tools = proxy<ToolInner[]>([])
        let visibleTimer: ReturnType<typeof setTimeout> | undefined
        scopeWatch(get => {
          const toolsSnapshot = snapshot(get(tools))
          const element = elementRef.current
          if (isUnset(element)) return
          if (toolsSnapshot.length === 0) {
            element.style.visibility = 'hidden'
            element.innerHTML = ''
            return
          }
          clearTimeout(visibleTimer)
          visibleTimer = setTimeout(() => {
            element.style.visibility = 'visible'
            visibleTimer = undefined
          }, 200)
          element.innerHTML = toolsSnapshot.map(toolItemTemplate).join('')
        })
        scopeWatch(get => {
          const selection = get(firstSelectionRef).current
          if (selection === undefined) return
          if (visibleTimer !== undefined) {
            clearTimeout(visibleTimer)
            visibleTimer = setTimeout(() => {
              if (isUnset(elementRef.current)) return

              elementRef.current.style.visibility = 'hidden'
              visibleTimer = undefined
            })
          }
        })
        ctx.provide('shikitorSelectionTools', {
          registerSelectionToolsProvider(selector, provider) {
            let providerDispose: Nullable<() => void>
            const { provideSelectionTools } = provider
            const sym = Symbol('provideSelectionTools')
            const getRemovedTools = () => {
              const oldToolsIndexes = tools
                .reduce((indexes, tool, index) => {
                  toolMap.delete(
                    // @ts-expect-error
                    tool[uuidSym]
                  )
                  // @ts-expect-error
                  return tool[sym]
                    ? [...indexes, index]
                    : indexes
                }, [] as number[])
              return tools
                .filter((_, index) => !oldToolsIndexes.includes(index))
            }
            const disposeWatcher = scopeWatch(async get => {
              const language = get(languageRef).current
              const selection = get(firstSelectionRef).current
              if (selection === undefined) return
              if (selector !== '*' && selector !== language) return
              providerDispose?.()
              const { start, end } = selection

              const ele = elementRef.current
              if (isUnset(ele)) return

              if (start.offset === end.offset) {
                ele.style.visibility = 'hidden'
                ele.innerHTML = ''
                return
              } else {
                const selectionText = shikitor.value.slice(start.offset, end.offset)
                const { tools: newTools = [], dispose } = await provideSelectionTools(selectionText, selection) ?? {}
                providerDispose = dispose
                tools.length = 0
                tools.push(
                  ...getRemovedTools(),
                  ...newTools.map(tool => {
                    const uuid = Math.random().toString(36).slice(2)
                    toolMap.set(uuid, tool)
                    return {
                      [uuidSym]: uuid,
                      [sym]: true,
                      ...tool
                    }
                  })
                )
              }
            })
            return {
              dispose: () => {
                disposeWatcher()
                providerDispose?.()
                tools.length = 0
                tools.push(...getRemovedTools())
              }
            }
          }
        })
        const disposeSelectionToolboxProvider = ctx.shikitorPopup.registerPopupProvider({
          position: 'relative',
          placement: 'top',
          target: 'selection',
          hiddenOnNoCursor: true,
          providePopups: () => ({
            dispose: () => void 0,
            popups: [{
              id: 'selection-toolbox',
              render(ele) {
                const prefix = toolItemTemplate.prefix
                ele.style.visibility = 'hidden'
                // prevent focus change
                ele.addEventListener('mousedown', e => e.preventDefault())
                ele.addEventListener('click', event => {
                  const target = (
                    event.target as HTMLElement
                  )?.closest(`div.${prefix}`) as HTMLDivElement | null
                  if (target === null) return

                  const uuid = target.dataset[
                    `${prefix}-uuid`
                      // camelcase
                      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
                  ]
                  if (uuid) {
                    event.preventDefault()
                    event.stopPropagation()
                    const tool = toolMap.get(uuid)
                    switch (tool?.type) {
                      case 'toggle':
                        tool.onToggle?.()
                        break
                      case 'button':
                        tool.onClick?.()
                        break
                      case 'select': {
                        if (tool.disabled) return
                        if (tool.options === undefined || tool.options.length === 0) {
                          console.warn('No options provided')
                          return
                        }
                        if (target.dataset['open'] === 'true') {
                          const ctx = toolStore.get(uuid) as { close: () => void }
                          ctx.close()
                        } else {
                          target.dataset['open'] = 'true'
                          toolStore.set(
                            uuid,
                            showSelector(shikitor, ctx.shikitorPopup.mountPopup, target, {
                              ...tool,
                              onClose: () => target.dataset['open'] = 'false'
                            })
                          )
                        }
                        break
                      }
                    }
                  }
                })
                elementRef.current = ref(ele)
              }
            }]
          })
        }).dispose
        return () => {
          disposeSelectionToolboxProvider?.()
          disposeScoped()
        }
  }
})
