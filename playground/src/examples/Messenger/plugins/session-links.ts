import type { InlineReplacement, ShikitorInputEvent, ShikitorOptions } from '@shikitor/core'
import { definePlugin } from '@shikitor/core'

export interface MessengerSessionLinksOptions {
  onNavigate(roomId: string): void
}

const linkClass = 'messenger-session-link'
const activeLinkClass = 'messenger-session-link--active'
type DecorationItem = NonNullable<ShikitorOptions['decorations']>[number]

export interface MessengerSessionReference {
  icon: string
  roomId: string
}

export function getMessengerSessionLinkDecorations(
  value: string,
  references: Readonly<Record<string, MessengerSessionReference>>
): DecorationItem[] {
  return Array.from(value.matchAll(/#([\w-]+)/g)).flatMap(match => {
    const reference = references[match[1]]
    if (!reference || match.index === undefined) return []
    return [{
      start: match.index + 1,
      end: match.index + match[0].length,
      alwaysWrap: true,
      properties: {
        class: `${linkClass} ${linkClass}--text`,
        'data-room': reference.roomId
      }
    }]
  })
}

export function getMessengerSessionInlineReplacements(
  value: string,
  references: Readonly<Record<string, MessengerSessionReference>>
): InlineReplacement[] {
  return Array.from(value.matchAll(/#([\w-]+)/g)).flatMap(match => {
    const reference = references[match[1]]
    if (!reference || match.index === undefined) return []
    return [{
      start: match.index,
      end: match.index + 1,
      inlineSize: '1em',
      properties: {
        class: `${linkClass} ${linkClass}--marker`,
        'data-room': reference.roomId,
        'data-session-icon': reference.icon
      }
    }]
  })
}

export function getMessengerSessionLink(event: ShikitorInputEvent) {
  if (event.hit.zone !== 'content' || !(event.hit.element instanceof Element)) return
  const link = event.hit.element.closest<HTMLElement>(`.${linkClass}`)
  if (!link?.dataset.room) return
  return link
}

/**
 * Add editor-style session navigation to decorated `#room` references.
 * Navigation is intentionally bound to exact Mod + primary click while the
 * hover affordance follows the same normalized cross-platform modifier.
 */
export default definePlugin({
  name: 'messenger-session-links',
  inject: ['shikitor', 'shikitorPointer', 'shikitorKeyboard'],
  apply(ctx, options: MessengerSessionLinksOptions) {
    const root = ctx.shikitor.element
    const window = root.ownerDocument.defaultView
    let hoveredLink: HTMLElement | undefined
    let modActive = false

    function renderHoverState() {
      hoveredLink?.classList.toggle(activeLinkClass, modActive)
    }

    function setHoveredLink(link?: HTMLElement) {
      if (hoveredLink === link) {
        renderHoverState()
        return
      }
      hoveredLink?.classList.remove(activeLinkClass)
      hoveredLink = link
      renderHoverState()
    }

    function clearHoverState() {
      modActive = false
      setHoveredLink()
    }

    const action = ctx.shikitorPointer.registerAction({
      id: 'messenger-session-links.navigate',
      run(event) {
        const link = getMessengerSessionLink(event)
        const roomId = link?.dataset.room
        if (!roomId) return false
        options.onNavigate(roomId)
        return {
          handled: true,
          preventDefault: true,
          stopPropagation: true
        }
      }
    })
    const binding = ctx.shikitorPointer.registerBinding({
      id: 'messenger-session-links.mod-primary-click',
      action: 'messenger-session-links.navigate',
      trigger: { type: 'click', button: 'primary' },
      modifiers: ['Mod'],
      target: 'content',
      priority: 100
    })
    const pointerSubscription = ctx.shikitorPointer.subscribe(event => {
      if (event.type === 'pointermove' || event.type === 'mousemove') {
        modActive = event.modifiers.mod
        setHoveredLink(getMessengerSessionLink(event))
      } else if (
        event.type === 'pointerleave'
        || event.type === 'mouseleave'
        || event.type === 'pointercancel'
      ) {
        clearHoverState()
      }
    })
    const keyboardSubscription = ctx.shikitorKeyboard.subscribe(event => {
      if (event.type !== 'keydown' && event.type !== 'keyup') return
      modActive = event.modifiers.mod
      renderHoverState()
    })
    window?.addEventListener('blur', clearHoverState)

    return () => {
      action.dispose()
      binding.dispose()
      pointerSubscription.dispose()
      keyboardSubscription.dispose()
      window?.removeEventListener('blur', clearHoverState)
      clearHoverState()
    }
  }
})
