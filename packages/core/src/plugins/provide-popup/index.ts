import type { IDisposable, ResolvedCursor, ResolvedTextRange } from '@shikitor/core'
import { definePlugin } from '@shikitor/core'
import type { Awaitable, RecursiveReadonly } from '@shikitor/core/types'
import { scoped } from '@shikitor/core/utils/valtio'
import { derive } from 'valtio/utils'

import { mountPopup, popupsControlled } from './popupsControlled'

export type RelativePopupPlacement = 'top' | 'bottom'
// | 'left' | 'right'
// | 'top-left' | 'top-right'
// | 'bottom-left' | 'bottom-right'
// | 'left-top' | 'left-bottom'
// | 'right-top' | 'right-bottom'

export type AbsolutePopupPlacement =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'left-top'
  | 'left-bottom'
  | 'right-top'
  | 'right-bottom'

export interface Popup {
  id: string
  render(element: HTMLDivElement): void
}

export type ResolvedPopup =
  & Popup
  & (
    | RelativePopup & {
      cursors?: RecursiveReadonly<(ResolvedCursor | void)[]>
      selections?: RecursiveReadonly<ResolvedTextRange[]>
    }
    | AbsolutePopup
  )

export interface PopupList extends Partial<IDisposable> {
  popups: Popup[]
}

export type BasePopup = {
  /**
   * The width of the popup.
   * If not provided, the popup will be auto-sized.
   */
  width?: number
  /**
   * The height of the popup.
   * If not provided, the popup will be auto-sized.
   */
  height?: number
  // TODO
  delay?: number | {
    show?: number
    hide?: number
  }
}

type RelativeCursorPopup = {
  target: 'cursor'
  // TODO
  offset?: 'line-start'
}

type RelativeSelectionPopup = {
  target: 'selection'
  // TODO
  offset?:
    | 'selection-start'
    | 'selection-end'
}

export type RelativePopup =
  & BasePopup
  & {
    position: 'relative'
    placement: RelativePopupPlacement
    hiddenOnNoCursor?: boolean
  }
  & (
    | RelativeCursorPopup
    | RelativeSelectionPopup
  )

export type AbsolutePopup = BasePopup & {
  position: 'absolute'
  offset: {
    top?: number
    left?: number
    right?: number
    bottom?: number
  }
  // TODO
  // placement: AbsolutePopupPlacement
}

export type PopupProvider =
  & {
    providePopups(): Awaitable<PopupList>
  }
  & (
    | RelativePopup
    | AbsolutePopup
  )

const name = 'provide-popup'

export interface ShikitorPopupService {
  // TODO support custom mount element: container, body, or passed element
  mountPopup(popup: ResolvedPopup): HTMLDivElement
  registerPopupProvider(provider: PopupProvider): IDisposable
}

declare module 'cordis' {
  interface Context {
    shikitorPopup: ShikitorPopupService
  }
}

export default definePlugin({
  name,
  inject: ['shikitor'],
  apply(ctx) {
    const shikitor = ctx.shikitor
    const { disposeScoped, scopeWatch } = scoped()
    const {
      dispose: disposePopupsControlled,
      popups
    } = popupsControlled(() => shikitor)
    const cursorRef = derive({
      current: get => get(shikitor.optionsRef).current.cursor
    })
    ctx.provide('shikitorPopup', {
      mountPopup: popup => mountPopup(shikitor, popup),
      registerPopupProvider(provider) {
        const { providePopups, ...meta } = provider
        const popupsPromise = Promise.resolve(providePopups())

        let disposed = false
        let providedListDisposed = false
        let pushedFirstPopupRef: ResolvedPopup | undefined
        let pushedPopupsLength = 0
        let popupsProvideDispose: (() => void) | undefined
        const disposeProvidedList = (dispose?: () => void) => {
          if (providedListDisposed) return
          providedListDisposed = true
          dispose?.()
        }
        popupsPromise.then(({ dispose, popups: newPopups }) => {
          popupsProvideDispose = dispose
          if (disposed) {
            disposeProvidedList(dispose)
            return
          }
          const resolvedPopups = newPopups.map(popup => ({
            ...meta,
            ...popup
          })) as ResolvedPopup[]
          popups.push(...resolvedPopups)
          pushedPopupsLength = resolvedPopups.length
          pushedFirstPopupRef = popups[popups.length - pushedPopupsLength]
        })
        const removeNewPopups = () => {
          if (pushedFirstPopupRef === undefined) return
          const firstIndex = popups.indexOf(pushedFirstPopupRef)
          if (firstIndex === -1) return

          popups.splice(firstIndex, pushedPopupsLength)
          pushedFirstPopupRef = undefined
          pushedPopupsLength = 0
        }
        const disposePositionRerender = meta.position === 'relative'
          ? scopeWatch(async get => {
            const cursor = get(cursorRef).current
            if (pushedFirstPopupRef === undefined) return

            const firstIndex = popups.indexOf(pushedFirstPopupRef)
            if (firstIndex === -1) return
            for (let i = firstIndex; i < firstIndex + pushedPopupsLength; i++) {
              const popup = popups[i]
              if (popup.position === 'relative') {
                popup.cursors = cursor === undefined
                  ? []
                  : [shikitor.rawTextHelper.resolvePosition(cursor)]
                popup.selections = shikitor.selections
              }
            }
          })
          : undefined
        return {
          dispose() {
            if (disposed) return
            disposed = true
            if (popupsProvideDispose) {
              disposeProvidedList(popupsProvideDispose)
            } else {
              popupsPromise.then(({ dispose }) => disposeProvidedList(dispose))
            }
            disposePositionRerender?.()
            removeNewPopups()
          }
        }
      }
    })
    return () => {
      disposeScoped()
      disposePopupsControlled()
    }
  }
})
