import type { ResolvedPosition } from '@shikijs/core'

import type { ShikitorContext } from '../../context'
import type { Shikitor } from '../../editor'
import {
  createInputRegistry,
  detectInputPlatform,
  normalizeModifiers,
  type InputDispatchSummary,
  type InputEventType,
  type InputPlatform,
  type NativeShikitorInputEvent,
  type EditorInputTarget,
  type ShikitorInputEvent,
  type ShikitorInputService,
  type PointerKind
} from '../../input'
import type { RawTextHelper } from '../../utils/getRawTextHelper'

export type ShikitorInputHit = Omit<EditorInputTarget, 'point'>

interface ResolveInputHitOptions {
  target: HTMLElement
  input: HTMLTextAreaElement
  rawTextHelper: RawTextHelper
  eventTarget: EventTarget | null
  fallbackPosition?: ResolvedPosition
  clientX?: number
  clientY?: number
}

function resolveLine(element: Element | null) {
  const lineElement = element?.closest<HTMLElement>('[data-line]')
  const line = Number(lineElement?.dataset.line)
  return Number.isInteger(line) && line > 0 ? line : undefined
}

function resolveWidgetLine(element: Element | null) {
  const widget = element?.closest<HTMLElement>('[data-after-line]')
  const line = Number(widget?.dataset.afterLine)
  return Number.isInteger(line) && line > 0 ? line : undefined
}

function resolvePositionAtPoint(
  element: Element | null,
  renderedElement: Element | null,
  target: HTMLElement,
  input: HTMLTextAreaElement,
  rawTextHelper: RawTextHelper,
  clientX?: number,
  clientY?: number
) {
  if (clientX === undefined || clientY === undefined) return undefined

  const document = input.ownerDocument
  const pointDocument = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => {
      offsetNode: Node
      offset: number
    } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  const previousPointerEvents = input.style.pointerEvents
  const previousTargetPointerEvents = target.style.pointerEvents
  let caret: ReturnType<NonNullable<typeof pointDocument.caretPositionFromPoint>> | undefined
  let legacyRange: Range | null | undefined
  try {
    input.style.pointerEvents = 'none'
    target.style.pointerEvents = 'auto'
    caret = pointDocument.caretPositionFromPoint?.(clientX, clientY) ?? undefined
    legacyRange = caret ? undefined : pointDocument.caretRangeFromPoint?.(clientX, clientY)
  } finally {
    input.style.pointerEvents = previousPointerEvents
    target.style.pointerEvents = previousTargetPointerEvents
  }

  const node = caret?.offsetNode ?? legacyRange?.startContainer
  const nodeOffset = caret?.offset ?? legacyRange?.startOffset
  const NodeConstructor = document.defaultView?.Node
  const isNode = !!NodeConstructor && node instanceof NodeConstructor
  const lineElement = isNode
    ? (node!.nodeType === NodeConstructor.ELEMENT_NODE ? node as Element : node!.parentElement)?.closest<HTMLElement>('[data-line]')
    : renderedElement?.closest<HTMLElement>('[data-line]')
  const line = Number(lineElement?.dataset.line)
  if (Number.isInteger(line) && line > 0 && isNode && nodeOffset !== undefined) {
    const range = document.createRange()
    range.selectNodeContents(lineElement!)
    try {
      range.setEnd(node, nodeOffset)
      const character = range.toString().length
      return rawTextHelper.resolvePosition({ line, character })
    } catch {
      // A browser extension or a concurrent syntax render can replace the
      // caret node between hit testing and range resolution. Fall through to
      // stable line/token metadata rather than returning a stale position.
    }
  }

  const metadataElement = renderedElement ?? element
  const tokenPosition = metadataElement instanceof HTMLElement
    ? [...metadataElement.classList]
        .map(className => /^position:(\d+):(\d+)$/.exec(className))
        .find(Boolean)
    : undefined
  if (tokenPosition) {
    return rawTextHelper.resolvePosition({
      line: Number(tokenPosition[1]),
      character: Math.max(0, Number(tokenPosition[2]) - 1)
    })
  }
  const metadataLine = resolveLine(metadataElement)
  if (metadataLine !== undefined) {
    return rawTextHelper.resolvePosition({ line: metadataLine, character: 0 })
  }
  return undefined
}

function resolveRenderedElementAtPoint(
  element: Element | null,
  target: HTMLElement,
  input: HTMLTextAreaElement,
  clientX?: number,
  clientY?: number
) {
  if (clientX === undefined || clientY === undefined) return element
  const previousPointerEvents = input.style.pointerEvents
  const previousTargetPointerEvents = target.style.pointerEvents
  try {
    input.style.pointerEvents = 'none'
    target.style.pointerEvents = 'auto'
    return input.ownerDocument.elementFromPoint?.(clientX, clientY) ?? element
  } finally {
    input.style.pointerEvents = previousPointerEvents
    target.style.pointerEvents = previousTargetPointerEvents
  }
}

export function resolveShikitorInputHit({
  target,
  input,
  rawTextHelper,
  eventTarget,
  fallbackPosition,
  clientX,
  clientY
}: ResolveInputHitOptions): ShikitorInputHit {
  const element = eventTarget instanceof Element ? eventTarget : null
  if (!element || (!target.contains(element) && element !== input)) {
    return { zone: 'outside', element }
  }

  const foldControl = element.closest<HTMLElement>('[data-fold-line]')
  if (foldControl) {
    const line = Number(foldControl.dataset.foldLine)
    return {
      zone: 'fold-control',
      element: foldControl,
      ...(Number.isInteger(line) && line > 0
        ? { line, position: rawTextHelper.resolvePosition({ line, character: 0 }) }
        : {})
    }
  }

  const scrollbar = element.closest<HTMLElement>('.shikitor-fold-scrollbar')
  if (scrollbar) return { zone: 'scrollbar', element: scrollbar }

  const decoration = element.closest<HTMLElement>(
    '[data-shikitor-gutter-decoration], [data-shikitor-gutter-decoration-slot]'
  )
  if (decoration) {
    const line = resolveLine(decoration)
    return {
      zone: 'gutter-decoration',
      element: decoration,
      ...(line === undefined
        ? {}
        : { line, position: rawTextHelper.resolvePosition({ line, character: 0 }) })
    }
  }

  const widget = element.closest<HTMLElement>('[data-shikitor-line-widget]')
  if (widget) {
    const line = resolveWidgetLine(widget)
    return {
      zone: 'line-widget',
      element: widget,
      ...(line === undefined
        ? {}
        : {
            line,
            position: rawTextHelper.resolvePosition({
              line,
              character: rawTextHelper.line({ line, character: 0 }).length
            })
          })
    }
  }

  const lineNumber = element.closest<HTMLElement>('.shikitor-gutter-line-number')
  if (lineNumber) {
    const line = resolveLine(lineNumber)
    return {
      zone: 'line-number',
      element: lineNumber,
      ...(line === undefined
        ? {}
        : { line, position: rawTextHelper.resolvePosition({ line, character: 0 }) })
    }
  }

  const gutter = element.closest<HTMLElement>('.shikitor-lines, .shikitor-gutter-line')
  if (gutter) {
    const line = resolveLine(gutter)
    return {
      zone: 'gutter',
      element: gutter,
      ...(line === undefined
        ? {}
        : { line, position: rawTextHelper.resolvePosition({ line, character: 0 }) })
    }
  }

  const renderedElement = resolveRenderedElementAtPoint(element, target, input, clientX, clientY)
  const position = resolvePositionAtPoint(
    element,
    renderedElement,
    target,
    input,
    rawTextHelper,
    clientX,
    clientY
  )
  const resolvedPosition = position ?? fallbackPosition
  const resolvedElement = renderedElement && target.contains(renderedElement)
    ? renderedElement
    : element
  return {
    zone: 'content',
    // Pointer-family events originate from the transparent textarea overlay.
    // Expose the rendered node below it so consumers can distinguish an exact
    // decoration/token hit from whitespace that merely resolves to a cursor.
    element: resolvedElement,
    ...(resolvedPosition
      ? {
          line: resolvedPosition.line,
          position: resolvedPosition
        }
      : {})
  }
}

export interface InputBindingsControlledResult {
  service: ShikitorInputService
  dispose(): void
}

function normalizeMouseButton(button: number) {
  if (button === 0) return 'primary' as const
  if (button === 1) return 'auxiliary' as const
  if (button === 2) return 'secondary' as const
  if (button === 3) return 'back' as const
  if (button === 4) return 'forward' as const
  return undefined
}

function normalizePointerKind(pointerType: string | undefined): PointerKind {
  if (pointerType === 'pen' || pointerType === 'touch') return pointerType
  return 'mouse'
}

function readClientPoint(event: Event) {
  const pointer = event as Event & { clientX?: number; clientY?: number }
  return {
    clientX: typeof pointer.clientX === 'number' ? pointer.clientX : undefined,
    clientY: typeof pointer.clientY === 'number' ? pointer.clientY : undefined
  }
}

function normalizeNativeEvent(
  nativeEvent: Event,
  input: HTMLTextAreaElement,
  shikitor: Shikitor,
  platform: ReturnType<typeof detectInputPlatform>,
  hit: ShikitorInputHit,
  contextMenuSource?: 'pointer' | 'keyboard'
) {
  const keyboardEvent = nativeEvent as KeyboardEvent
  const pointerEvent = nativeEvent as PointerEvent
  const wheelEvent = nativeEvent as WheelEvent
  const inputEvent = nativeEvent as InputEvent
  const compositionEvent = nativeEvent as CompositionEvent
  const type = nativeEvent.type as InputEventType
  const { clientX, clientY } = readClientPoint(nativeEvent)
  const selection = shikitor.selections[0]
  const event: ShikitorInputEvent = {
    editor: shikitor,
    nativeEvent: nativeEvent as NativeShikitorInputEvent,
    type,
    platform,
    modifiers: normalizeModifiers(nativeEvent as KeyboardEvent, platform),
    cursor: shikitor.cursor,
    selections: shikitor.selections,
    hit: {
      ...hit,
      point: contextMenuSource === 'keyboard'
        || clientX === undefined
        || clientY === undefined
        ? undefined
        : {
            clientX,
            clientY,
            editorX: clientX - shikitor.element.getBoundingClientRect().left,
            editorY: clientY - shikitor.element.getBoundingClientRect().top
          }
    },
    ...(['keydown', 'keyup'].includes(type)
      ? {
          keyboard: {
            key: keyboardEvent.key,
            code: keyboardEvent.code,
            location: keyboardEvent.location,
            repeat: keyboardEvent.repeat,
            isComposing: keyboardEvent.isComposing
          }
        }
      : {}),
    ...(type.startsWith('pointer')
      ? {
          pointer: {
            pointerId: pointerEvent.pointerId,
            pointerType: pointerEvent.pointerType as PointerKind,
            button: normalizeMouseButton(pointerEvent.button),
            physicalButton: pointerEvent.button,
            buttons: pointerEvent.buttons,
            pressure: pointerEvent.pressure,
            clicks: pointerEvent.detail,
            source: 'pointer'
          }
        }
      : {}),
    ...([
      'mousedown',
      'mouseup',
      'mousemove',
      'mouseenter',
      'mouseleave',
      'mouseover',
      'mouseout'
    ].includes(type)
      ? {
          mouse: {
            button: normalizeMouseButton((nativeEvent as MouseEvent).button),
            physicalButton: (nativeEvent as MouseEvent).button,
            buttons: (nativeEvent as MouseEvent).buttons,
            clicks: (nativeEvent as MouseEvent).detail
          }
        }
      : {}),
    ...(['click', 'dblclick', 'auxclick', 'contextmenu'].includes(type)
      ? {
          pointer: {
            // Click-family events are MouseEvents for compatibility, but
            // modern browsers dispatch PointerEvent instances. Preserve the
            // richer identity when present so pen/touch click bindings remain
            // distinguishable, while legacy MouseEvents keep a mouse fallback.
            pointerId: typeof pointerEvent.pointerId === 'number'
              ? pointerEvent.pointerId
              : undefined,
            pointerType: normalizePointerKind(pointerEvent.pointerType),
            button: normalizeMouseButton((nativeEvent as MouseEvent).button),
            physicalButton: (nativeEvent as MouseEvent).button,
            buttons: (nativeEvent as MouseEvent).buttons,
            pressure: typeof pointerEvent.pressure === 'number'
              ? pointerEvent.pressure
              : undefined,
            clicks: (nativeEvent as MouseEvent).detail,
            source: type === 'contextmenu' ? contextMenuSource : 'pointer'
          }
        }
      : {}),
    ...(type === 'wheel'
      ? {
          wheel: {
            deltaX: wheelEvent.deltaX,
            deltaY: wheelEvent.deltaY,
            deltaMode: wheelEvent.deltaMode
          }
        }
      : {}),
    ...(['beforeinput', 'input'].includes(type)
      ? {
          input: {
            data: inputEvent.data,
            inputType: inputEvent.inputType,
            isComposing: inputEvent.isComposing
          }
        }
      : {}),
    ...(type.startsWith('composition') ? { composition: { data: compositionEvent.data } } : {}),
    state: {
      focused: input.ownerDocument.activeElement === input,
      readOnly: shikitor.options.readOnly === true,
      hasSelection: !!selection && selection.start.offset !== selection.end.offset,
      language: shikitor.language
    }
  }
  return event
}

function applyDispatchPolicy(nativeEvent: Event, summary: InputDispatchSummary) {
  if (summary.preventDefault && nativeEvent.cancelable) nativeEvent.preventDefault()
  if (summary.stopImmediatePropagation) {
    nativeEvent.stopImmediatePropagation()
  } else if (summary.stopPropagation) {
    nativeEvent.stopPropagation()
  }
}

export function inputBindingsControlled({
  target,
  input,
  context,
  shikitor,
  platform: platformOverride
}: {
  target: HTMLElement
  input: HTMLTextAreaElement
  context: ShikitorContext
  shikitor: Shikitor
  platform?: InputPlatform
}): InputBindingsControlledResult {
  const platform = detectInputPlatform(platformOverride)
  const service = createInputRegistry({ platform })
  context.provide('shikitorInput', service)

  const contextMenuAssociationWindow = 1_000
  let lastPointerDown: {
    at: number
    target: EventTarget | null
    button: number
    pointerType?: string
  } | undefined
  let lastKeyboardContextMenu: {
    at: number
    target: EventTarget | null
  } | undefined

  const isRelatedTarget = (first: EventTarget | null, second: EventTarget | null) => {
    if (first === second) return true
    const firstNode = first as (EventTarget & { contains?(node: EventTarget): boolean }) | null
    const secondNode = second as (EventTarget & { contains?(node: EventTarget): boolean }) | null
    return !!firstNode?.contains?.(second!) || !!secondNode?.contains?.(first!)
  }

  const resolveContextMenuSource = (nativeEvent: Event): 'pointer' | 'keyboard' => {
    const event = nativeEvent as MouseEvent & { pointerType?: string }
    const finish = (source: 'pointer' | 'keyboard') => {
      lastPointerDown = undefined
      lastKeyboardContextMenu = undefined
      return source
    }
    if (event.button === 2) return finish('pointer')

    const now = Date.now()
    if (
      lastKeyboardContextMenu
      && now - lastKeyboardContextMenu.at <= contextMenuAssociationWindow
      && isRelatedTarget(lastKeyboardContextMenu.target, nativeEvent.target)
    ) return finish('keyboard')

    if (
      lastPointerDown
      && now - lastPointerDown.at <= contextMenuAssociationWindow
      && isRelatedTarget(lastPointerDown.target, nativeEvent.target)
      && (
        lastPointerDown.button === 2
        || (lastPointerDown.button === 0 && event.ctrlKey && platform === 'macos')
      )
    ) return finish('pointer')

    if (event.pointerType) return finish('pointer')
    return finish('keyboard')
  }

  const route = (nativeEvent: Event) => {
    if (nativeEvent.type === 'pointerdown') {
      const event = nativeEvent as PointerEvent
      lastPointerDown = {
        at: Date.now(),
        target: nativeEvent.target,
        button: event.button,
        pointerType: event.pointerType
      }
    } else if (nativeEvent.type === 'keydown') {
      const event = nativeEvent as KeyboardEvent
      if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
        lastKeyboardContextMenu = { at: Date.now(), target: nativeEvent.target }
      }
    }
    const contextMenuSource = nativeEvent.type === 'contextmenu'
      ? resolveContextMenuSource(nativeEvent)
      : undefined
    const point = readClientPoint(nativeEvent)
    const clientX = contextMenuSource === 'keyboard' ? undefined : point.clientX
    const clientY = contextMenuSource === 'keyboard' ? undefined : point.clientY
    const hit = resolveShikitorInputHit({
      target,
      input,
      rawTextHelper: shikitor.rawTextHelper,
      eventTarget: ['pointerleave', 'mouseleave'].includes(nativeEvent.type)
          && nativeEvent.target === target
        ? null
        : nativeEvent.target,
      fallbackPosition: shikitor.cursor,
      clientX,
      clientY
    })
    const event = normalizeNativeEvent(
      nativeEvent,
      input,
      shikitor,
      platform,
      hit,
      contextMenuSource
    )
    const summary = service.dispatch(event)
    applyDispatchPolicy(nativeEvent, summary)
    context.emit('shikitor/input', event, summary)
  }

  const rootEventTypes = [
    'pointerdown',
    'pointerup',
    'pointermove',
    'pointercancel',
    'pointerenter',
    'pointerleave',
    'mousedown',
    'mouseup',
    'mousemove',
    'mouseenter',
    'mouseleave',
    'mouseover',
    'mouseout',
    'click',
    'dblclick',
    'auxclick',
    'contextmenu',
    'wheel'
  ] as const
  const inputEventTypes = [
    'keydown',
    'keyup',
    'beforeinput',
    'input',
    'compositionstart',
    'compositionupdate',
    'compositionend'
  ] as const
  const listenerOptions: AddEventListenerOptions = { capture: true, passive: false }
  const pointerTargets: HTMLElement[] = target.contains(input) ? [target] : [target, input]

  pointerTargets.forEach(element => {
    rootEventTypes.forEach(type => element.addEventListener(type, route, listenerOptions))
  })
  inputEventTypes.forEach(type => input.addEventListener(type, route, listenerOptions))

  return {
    service,
    dispose() {
      pointerTargets.forEach(element => {
        rootEventTypes.forEach(type => element.removeEventListener(type, route, listenerOptions))
      })
      inputEventTypes.forEach(type => input.removeEventListener(type, route, listenerOptions))
      // Cordis owns the registry lifetime for plugins. Mark the optional
      // provider unavailable immediately as well, so consumers cannot keep
      // registering bindings through a disposed editor context.
      context.set('shikitorInput', undefined)
    }
  }
}
