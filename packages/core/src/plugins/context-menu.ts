import './context-menu.scss'

import type { ShikitorInputEvent } from '@shikitor/core'
import { definePlugin } from '@shikitor/core'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: string
  shortcut?: string
  disabled?: boolean
  onSelect?(event: ShikitorInputEvent): void
}

export interface ContextMenuOptions {
  items:
    | readonly ContextMenuItem[]
    | ((event: ShikitorInputEvent) => readonly ContextMenuItem[])
  ariaLabel?: string
  sources?: readonly ('pointer' | 'keyboard')[]
  target?: readonly (
    | 'content'
    | 'gutter'
    | 'line-number'
    | 'fold-control'
    | 'line-widget'
    | 'gutter-decoration'
  )[]
}

export interface ContextMenuPoint {
  x: number
  y: number
}

export function resolveContextMenuPosition(
  container: { width: number; height: number },
  menu: { width: number; height: number },
  requested: ContextMenuPoint,
  padding = 6
): ContextMenuPoint {
  return {
    x: Math.max(padding, Math.min(requested.x, container.width - menu.width - padding)),
    y: Math.max(padding, Math.min(requested.y, container.height - menu.height - padding))
  }
}

const defaultTargets = [
  'content',
  'gutter',
  'line-number',
  'fold-control',
  'line-widget',
  'gutter-decoration'
] as const

export default definePlugin({
  name: 'shikitor-context-menu',
  inject: ['shikitor', 'shikitorPointer', 'shikitorKeyboard'],
  apply(ctx, options: ContextMenuOptions) {
    const editor = ctx.shikitor
    const pointer = ctx.shikitorPointer
    const keyboard = ctx.shikitorKeyboard
    const root = editor.element
    const document = root.ownerDocument
    const window = document.defaultView
    const sources = new Set<'pointer' | 'keyboard'>(
      options.sources ?? ['pointer', 'keyboard']
    )
    let menu: HTMLDivElement | undefined
    let activeEvent: ShikitorInputEvent | undefined

    function restoreEditorFocus() {
      const event = activeEvent
      editor.focus(event?.cursor, { preventScroll: true })
      const selection = event?.selections[0]
      if (selection && selection.start.offset !== selection.end.offset) {
        editor.updateSelection(0, selection)
      }
    }

    function closeMenu({ restoreFocus = false } = {}) {
      menu?.remove()
      menu = undefined
      if (restoreFocus) restoreEditorFocus()
      activeEvent = undefined
    }

    function moveFocus(direction: 1 | -1) {
      if (!menu) return
      const items = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      if (!items.length) return
      const current = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = current < 0
        ? direction > 0 ? 0 : items.length - 1
        : (current + direction + items.length) % items.length
      items[next]?.focus({ preventScroll: true })
    }

    function requestedPoint(event: ShikitorInputEvent): ContextMenuPoint {
      if (event.hit.point) {
        return { x: event.hit.point.editorX, y: event.hit.point.editorY }
      }
      const cursor = editor._getCursorAbsolutePosition(event.cursor)
      const gutter = root.querySelector<HTMLElement>(':scope > .shikitor-lines')
      const input = editor.inputElement
      const lineHeight = Number.parseFloat(
        window?.getComputedStyle(root).getPropertyValue('--line-height') ?? ''
      ) || 22
      return {
        x: (gutter?.clientWidth ?? 0) + cursor.x - (input?.scrollLeft ?? 0),
        y: cursor.y - (input?.scrollTop ?? 0) + lineHeight
      }
    }

    function openMenu(event: ShikitorInputEvent) {
      closeMenu()
      const items = typeof options.items === 'function' ? options.items(event) : options.items
      if (!items.length) return false

      activeEvent = event
      menu = document.createElement('div')
      menu.className = 'shikitor-context-menu'
      menu.dataset.shikitorContextMenu = ''
      menu.setAttribute('role', 'menu')
      menu.setAttribute('aria-label', options.ariaLabel ?? 'Editor context menu')
      menu.tabIndex = -1

      for (const item of items) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'shikitor-context-menu__item'
        button.dataset.contextMenuItem = item.id
        button.setAttribute('role', 'menuitem')
        button.disabled = !!item.disabled

        const icon = document.createElement('span')
        icon.className = 'shikitor-context-menu__icon'
        icon.setAttribute('aria-hidden', 'true')
        icon.textContent = item.icon ?? 'arrow_right'
        button.append(icon)

        const label = document.createElement('span')
        label.textContent = item.label
        button.append(label)

        const shortcut = document.createElement('span')
        shortcut.className = 'shikitor-context-menu__shortcut'
        shortcut.textContent = item.shortcut ?? ''
        button.append(shortcut)

        button.addEventListener('click', () => {
          if (!activeEvent || item.disabled) return
          item.onSelect?.(activeEvent)
          closeMenu({ restoreFocus: true })
        })
        menu.append(button)
      }

      root.append(menu)
      const requested = requestedPoint(event)
      const position = resolveContextMenuPosition(
        { width: root.clientWidth, height: root.clientHeight },
        { width: menu.offsetWidth, height: menu.offsetHeight },
        requested
      )
      menu.style.left = `${position.x}px`
      menu.style.top = `${position.y}px`
      menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
      return true
    }

    const action = pointer.registerAction({
      id: 'shikitor-context-menu.open',
      run: openMenu
    })
    const bindings = [...sources].map(source => (source === 'pointer' ? pointer : keyboard).registerBinding({
      id: `shikitor-context-menu.${source}`,
      action: 'shikitor-context-menu.open',
      trigger: { type: 'contextmenu', source },
      modifiers: { mode: 'at-least', allowAltGraph: true },
      target: options.target ?? defaultTargets,
      priority: 200,
      policy: {
        preventDefault: 'handled',
        stopPropagation: 'handled'
      }
    }))
    if (sources.has('keyboard')) {
      bindings.push(keyboard.registerBinding({
        id: 'shikitor-context-menu.keyboard.shift-f10',
        action: 'shikitor-context-menu.open',
        trigger: { type: 'keydown', key: 'F10' },
        modifiers: { required: ['Shift'], mode: 'exact' },
        target: options.target ?? defaultTargets,
        priority: 201,
        policy: {
          preventDefault: 'handled',
          stopPropagation: 'handled'
        }
      }))
      bindings.push(keyboard.registerBinding({
        id: 'shikitor-context-menu.keyboard.context-menu-key',
        action: 'shikitor-context-menu.open',
        trigger: { type: 'keydown', key: 'ContextMenu' },
        modifiers: { mode: 'exact' },
        target: options.target ?? defaultTargets,
        priority: 201,
        policy: {
          preventDefault: 'handled',
          stopPropagation: 'handled'
        }
      }))
    }

    const handleDocumentPointerDown = (event: Event) => {
      if (menu && !menu.contains(event.target as Node)) closeMenu()
    }
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (!menu) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu({ restoreFocus: true })
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveFocus(1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveFocus(-1)
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        const items = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        items[event.key === 'Home' ? 0 : items.length - 1]?.focus({ preventScroll: true })
      }
    }
    const handleViewportChange = () => closeMenu()
    const outsideEventType = window?.PointerEvent ? 'pointerdown' : 'mousedown'
    document.addEventListener(outsideEventType, handleDocumentPointerDown, true)
    document.addEventListener('keydown', handleDocumentKeyDown, true)
    window?.addEventListener('resize', handleViewportChange)
    root.querySelector('textarea')?.addEventListener('scroll', handleViewportChange)

    return () => {
      action.dispose()
      bindings.forEach(binding => binding.dispose())
      document.removeEventListener(outsideEventType, handleDocumentPointerDown, true)
      document.removeEventListener('keydown', handleDocumentKeyDown, true)
      window?.removeEventListener('resize', handleViewportChange)
      root.querySelector('textarea')?.removeEventListener('scroll', handleViewportChange)
      closeMenu()
    }
  }
})
