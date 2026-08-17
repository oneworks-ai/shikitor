import './hover-popover.scss'

import type { Shikitor, ShikitorInputEvent } from '@shikitor/core'
import { definePlugin } from '@shikitor/core'

export interface HoverPopoverRegion {
  id: string
  start: number
  end: number
  title?: string
  content: string
}

export interface HoverPopoverOptions {
  regions?:
    | readonly HoverPopoverRegion[]
    | ((editor: Shikitor) => readonly HoverPopoverRegion[])
  /** Resolve language-service or other dynamic hover content for a pointer hit. */
  resolve?: (
    event: ShikitorInputEvent,
    editor: Shikitor
  ) => HoverPopoverRegion | undefined | PromiseLike<HoverPopoverRegion | undefined>
  delay?: number
  placement?: 'top' | 'bottom'
  ariaLabel?: string
}

export interface HoverPopoverPoint {
  x: number
  y: number
}

export function resolveHoverPopoverMoveType(window?: { PointerEvent?: unknown }) {
  return window?.PointerEvent ? 'pointermove' as const : 'mousemove' as const
}

export function findHoverPopoverRegion(
  regions: readonly HoverPopoverRegion[],
  offset: number
) {
  return regions.find(region => offset >= region.start && offset < region.end)
}

export function resolveHoverPopoverPosition(
  container: { width: number; height: number },
  popover: { width: number; height: number },
  anchor: HoverPopoverPoint,
  placement: 'top' | 'bottom' = 'bottom',
  padding = 8,
  gap = 8
): HoverPopoverPoint {
  const requestedY = placement === 'top'
    ? anchor.y - popover.height - gap
    : anchor.y + gap
  const flippedY = placement === 'top'
    ? anchor.y + gap
    : anchor.y - popover.height - gap
  const fitsRequested = requestedY >= padding
    && requestedY + popover.height <= container.height - padding
  const y = fitsRequested ? requestedY : flippedY
  return {
    x: Math.max(padding, Math.min(anchor.x, container.width - popover.width - padding)),
    y: Math.max(padding, Math.min(y, container.height - popover.height - padding))
  }
}

export default definePlugin({
  name: 'hover-popover',
  inject: ['shikitor', 'shikitorPointer'],
  apply(ctx, options: HoverPopoverOptions) {
    const editor = ctx.shikitor
    const root = editor.element
    const document = root.ownerDocument
    const window = document.defaultView
    const moveType = resolveHoverPopoverMoveType(window ?? undefined)
    const delay = Math.max(0, options.delay ?? 320)
    const placement = options.placement ?? 'bottom'
    let popover: HTMLDivElement | undefined
    let pendingTimer: number | undefined
    let activeRegionId: string | undefined
    let activeHitKey: string | undefined
    let pendingHitKey: string | undefined
    let requestVersion = 0

    const regions = () => typeof options.regions === 'function'
      ? options.regions(editor)
      : options.regions ?? []

    function clearPending() {
      if (pendingTimer !== undefined) window?.clearTimeout(pendingTimer)
      pendingTimer = undefined
      pendingHitKey = undefined
      requestVersion += 1
    }

    function closePopover() {
      clearPending()
      popover?.remove()
      popover = undefined
      activeRegionId = undefined
      activeHitKey = undefined
    }

    function openPopover(region: HoverPopoverRegion, event: ShikitorInputEvent, hitKey: string) {
      closePopover()
      popover = document.createElement('div')
      popover.className = 'shikitor-hover-popover'
      popover.dataset.shikitorHoverPopover = region.id
      popover.setAttribute('role', 'tooltip')
      popover.setAttribute('aria-label', options.ariaLabel ?? region.title ?? region.content)
      if (region.title) {
        const title = document.createElement('strong')
        title.className = 'shikitor-hover-popover__title'
        title.textContent = region.title
        popover.append(title)
      }
      const content = document.createElement('span')
      content.className = 'shikitor-hover-popover__content'
      content.textContent = region.content
      popover.append(content)
      root.append(popover)

      const point = event.hit.point ?? { editorX: 0, editorY: 0 }
      const position = resolveHoverPopoverPosition(
        { width: root.clientWidth, height: root.clientHeight },
        { width: popover.offsetWidth, height: popover.offsetHeight },
        { x: point.editorX, y: point.editorY },
        placement
      )
      popover.style.left = `${position.x}px`
      popover.style.top = `${position.y}px`
      activeRegionId = region.id
      activeHitKey = hitKey
    }

    function handlePointer(event: ShikitorInputEvent) {
      if (
        event.type === 'pointerleave'
        || event.type === 'mouseleave'
        || event.type === 'pointercancel'
        || event.type === 'pointerdown'
        || event.type === 'wheel'
        || event.hit.zone !== 'content'
        || !event.hit.position
      ) {
        closePopover()
        return
      }
      if (event.type !== moveType) return

      const hitKey = event.hit.token
        ? `${event.hit.token.start.offset}:${event.hit.token.end.offset}`
        : String(event.hit.position.offset)
      const staticRegion = options.resolve
        ? undefined
        : findHoverPopoverRegion(regions(), event.hit.position.offset)
      if (!options.resolve && !staticRegion) {
        closePopover()
        return
      }
      if (
        (staticRegion && activeRegionId === staticRegion.id)
        || activeHitKey === hitKey
        || pendingHitKey === hitKey
      ) return
      closePopover()
      pendingHitKey = hitKey
      const version = requestVersion
      pendingTimer = window?.setTimeout(async () => {
        pendingTimer = undefined
        let region = staticRegion
        try {
          region ??= await options.resolve?.(event, editor)
        } catch {
          region = undefined
        }
        if (version !== requestVersion || pendingHitKey !== hitKey) return
        pendingHitKey = undefined
        if (!region) return
        openPopover(region, event, hitKey)
      }, delay)
    }

    const subscription = ctx.shikitorPointer.subscribe(handlePointer)
    const handleViewportChange = () => closePopover()
    const input = editor.inputElement
    window?.addEventListener('resize', handleViewportChange)
    input?.addEventListener('scroll', handleViewportChange)

    return () => {
      subscription.dispose()
      window?.removeEventListener('resize', handleViewportChange)
      input?.removeEventListener('scroll', handleViewportChange)
      closePopover()
    }
  }
})
