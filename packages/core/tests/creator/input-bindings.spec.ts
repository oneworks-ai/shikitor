import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { Context } from '../../src/context'
import {
  inputBindingsControlled,
  resolveShikitorInputHit
} from '../../src/creator/controlled/inputBindingsControlled'
import type { Shikitor } from '../../src/editor'
import { getRawTextHelper } from '../../src/utils/getRawTextHelper'

class FakeElement extends EventTarget {
  readonly dataset: Record<string, string> = {}
  readonly children: FakeElement[] = []
  readonly style = { pointerEvents: '' }
  readonly classNames = new Set<string>()
  parentElement: FakeElement | null = null
  ownerDocument: FakeDocument

  constructor(ownerDocument: FakeDocument, ...classNames: string[]) {
    super()
    this.ownerDocument = ownerDocument
    classNames.forEach(className => this.classNames.add(className))
  }

  append(...elements: FakeElement[]) {
    elements.forEach(element => {
      element.parentElement = this
      this.children.push(element)
    })
  }

  contains(element: FakeElement) {
    for (let current: FakeElement | null = element; current; current = current.parentElement) {
      if (current === this) return true
    }
    return false
  }

  closest<T extends Element = Element>(selector: string): T | null {
    for (let current: FakeElement | null = this; current; current = current.parentElement) {
      if (selector.split(',').some(part => current!.matches(part.trim()))) return current as unknown as T
    }
    return null
  }

  matches(selector: string) {
    if (selector.startsWith('.')) return this.classNames.has(selector.slice(1))
    const dataAttribute = /^\[data-([a-z0-9-]+)\]$/.exec(selector)?.[1]
    if (!dataAttribute) return false
    const dataKey = dataAttribute.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
    return dataKey in this.dataset
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 640, bottom: 440, width: 640, height: 440 }
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null
  defaultView = { Node: class {} }
  elementFromPoint() {
    return null
  }
}

function domEvent(type: string, properties: Record<string, unknown> = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    ...Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, { value }])
    ),
    getModifierState: { value: () => false }
  })
  return event
}

function keyEvent(
  key: string,
  code: string,
  properties: Record<string, unknown> = {}
) {
  return domEvent('keydown', {
    key,
    code,
    location: 0,
    repeat: false,
    isComposing: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...properties
  })
}

function fakeShikitor(root: FakeElement, raw = 'const value = 1') {
  const rawTextHelper = getRawTextHelper(raw)
  return {
    element: root,
    cursor: rawTextHelper.resolvePosition(0),
    selections: [{
      start: rawTextHelper.resolvePosition(0),
      end: rawTextHelper.resolvePosition(0)
    }],
    options: { readOnly: false },
    language: 'typescript',
    rawTextHelper
  } as unknown as Shikitor
}

describe('creator input bindings DOM routing', () => {
  let ownerDocument: FakeDocument

  beforeEach(() => {
    ownerDocument = new FakeDocument()
    vi.stubGlobal('Element', FakeElement)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('classifies stable editor zones and source lines', () => {
    const root = new FakeElement(ownerDocument, 'shikitor')
    const input = new FakeElement(ownerDocument, 'shikitor-input')
    const lines = new FakeElement(ownerDocument, 'shikitor-lines')
    const gutterLine = new FakeElement(ownerDocument, 'shikitor-gutter-line')
    gutterLine.dataset.line = '2'
    const lineNumber = new FakeElement(ownerDocument, 'shikitor-gutter-line-number')
    const fold = new FakeElement(ownerDocument, 'shikitor-fold-toggle')
    fold.dataset.foldLine = '2'
    const widget = new FakeElement(ownerDocument, 'shikitor-line-widget')
    widget.dataset.shikitorLineWidget = 'usages'
    widget.dataset.afterLine = '2'
    const decoration = new FakeElement(ownerDocument, 'shikitor-gutter-decoration')
    decoration.dataset.shikitorGutterDecoration = 'comment'
    const scrollbar = new FakeElement(ownerDocument, 'shikitor-fold-scrollbar')
    root.append(lines, input, widget, scrollbar)
    lines.append(gutterLine)
    gutterLine.append(lineNumber, fold, decoration)

    const rawTextHelper = getRawTextHelper('first\nsecond\nthird')
    const hit = (eventTarget: FakeElement) => resolveShikitorInputHit({
      target: root as unknown as HTMLElement,
      input: input as unknown as HTMLTextAreaElement,
      rawTextHelper,
      eventTarget
    })

    expect(hit(lineNumber)).toMatchObject({ zone: 'line-number', line: 2 })
    expect(hit(fold)).toMatchObject({ zone: 'fold-control', line: 2 })
    expect(hit(widget)).toMatchObject({ zone: 'line-widget', line: 2 })
    expect(hit(decoration)).toMatchObject({ zone: 'gutter-decoration', line: 2 })
    expect(hit(scrollbar)).toMatchObject({ zone: 'scrollbar' })
    expect(hit(new FakeElement(ownerDocument))).toMatchObject({ zone: 'outside' })
  })

  test('dispatches synchronously, applies event policy, and cleans listeners', () => {
    const root = new FakeElement(ownerDocument, 'shikitor')
    const input = new FakeElement(ownerDocument, 'shikitor-input')
    root.append(input)
    ownerDocument.activeElement = input
    const shikitor = fakeShikitor(root)
    const context = new Context() as unknown as Parameters<typeof inputBindingsControlled>[0]['context']
    const routed = vi.fn()
    context.on('shikitor/input', routed)
    const { service, dispose } = inputBindingsControlled({
      target: root as unknown as HTMLElement,
      input: input as unknown as HTMLTextAreaElement,
      context,
      shikitor
    })
    const action = vi.fn(() => true)
    service.registerAction({ id: 'run', run: action })
    service.registerBinding({
      id: 'enter',
      action: 'run',
      trigger: { type: 'keydown', key: 'Enter' },
      target: 'content',
      policy: {
        preventDefault: 'handled',
        stopImmediatePropagation: 'handled'
      }
    })

    const first = keyEvent('Enter', 'Enter')
    input.dispatchEvent(first)
    expect(action).toHaveBeenCalledOnce()
    expect(first.defaultPrevented).toBe(true)
    expect(routed).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'keydown',
        keyboard: expect.objectContaining({ key: 'Enter', code: 'Enter' }),
        hit: expect.objectContaining({ zone: 'content', line: 1 }),
        state: expect.objectContaining({ focused: true, language: 'typescript' })
      }),
      expect.objectContaining({ handled: true, handledBindingId: 'enter' })
    )

    dispose()
    input.dispatchEvent(keyEvent('Enter', 'Enter'))
    expect(action).toHaveBeenCalledOnce()
  })

  test('routes every supported native event once from its stable owner', () => {
    const root = new FakeElement(ownerDocument, 'shikitor')
    const input = new FakeElement(ownerDocument, 'shikitor-input')
    root.append(input)
    const context = new Context() as unknown as Parameters<typeof inputBindingsControlled>[0]['context']
    const routed: string[] = []
    context.on('shikitor/input', event => routed.push(event.type))
    const { dispose } = inputBindingsControlled({
      target: root as unknown as HTMLElement,
      input: input as unknown as HTMLTextAreaElement,
      context,
      shikitor: fakeShikitor(root)
    })
    const rootEvents = [
      'pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'pointerenter',
      'pointerleave', 'mousedown', 'mouseup', 'mousemove', 'mouseenter',
      'mouseleave', 'mouseover', 'mouseout', 'click', 'dblclick', 'auxclick',
      'contextmenu', 'wheel'
    ]
    const inputEvents = [
      'keydown', 'keyup', 'beforeinput', 'input',
      'compositionstart', 'compositionupdate', 'compositionend'
    ]

    rootEvents.forEach(type => root.dispatchEvent(new Event(type, { cancelable: true })))
    inputEvents.forEach(type => input.dispatchEvent(new Event(type, { cancelable: true })))
    expect(routed).toEqual([...rootEvents, ...inputEvents])

    dispose()
    root.dispatchEvent(new Event('click'))
    input.dispatchEvent(new Event('keydown'))
    expect(routed).toHaveLength(rootEvents.length + inputEvents.length)
  })

  test('keeps native mouse compatibility events separate from pointer events', () => {
    const root = new FakeElement(ownerDocument, 'shikitor')
    const input = new FakeElement(ownerDocument, 'shikitor-input')
    root.append(input)
    const context = new Context() as unknown as Parameters<typeof inputBindingsControlled>[0]['context']
    const routed = vi.fn()
    context.on('shikitor/input', routed)
    const { service, dispose } = inputBindingsControlled({
      target: root as unknown as HTMLElement,
      input: input as unknown as HTMLTextAreaElement,
      context,
      shikitor: fakeShikitor(root)
    })
    const mouseAction = vi.fn(() => true)
    const pointerAction = vi.fn(() => true)
    service.registerAction({ id: 'mouse-action', run: mouseAction })
    service.registerAction({ id: 'pointer-action', run: pointerAction })
    service.registerBinding({
      id: 'mouse-down',
      action: 'mouse-action',
      trigger: { type: 'mousedown', button: 'back', physicalButton: 3 }
    })
    service.registerBinding({
      id: 'pointer-down',
      action: 'pointer-action',
      trigger: { type: 'pointerdown', button: 'back', physicalButton: 3 }
    })

    root.dispatchEvent(domEvent('mousedown', {
      button: 3,
      buttons: 8,
      detail: 1
    }))
    expect(mouseAction).toHaveBeenCalledOnce()
    expect(pointerAction).not.toHaveBeenCalled()
    const [routedEvent] = routed.mock.lastCall!
    expect(routedEvent).toEqual(expect.objectContaining({
      type: 'mousedown',
      mouse: expect.objectContaining({
        button: 'back',
        physicalButton: 3,
        buttons: 8,
        clicks: 1
      })
    }))
    expect(routedEvent).not.toHaveProperty('pointer')

    dispose()
  })

  test('distinguishes pointer and keyboard context-menu commands', () => {
    const root = new FakeElement(ownerDocument, 'shikitor')
    const input = new FakeElement(ownerDocument, 'shikitor-input')
    root.append(input)
    const context = new Context() as unknown as Parameters<typeof inputBindingsControlled>[0]['context']
    const sources: string[] = []
    context.on('shikitor/input', event => {
      if (event.type === 'contextmenu') sources.push(event.pointer?.source ?? 'missing')
    })
    const { dispose } = inputBindingsControlled({
      target: root as unknown as HTMLElement,
      input: input as unknown as HTMLTextAreaElement,
      context,
      shikitor: fakeShikitor(root),
      platform: 'macos'
    })

    input.dispatchEvent(keyEvent('ContextMenu', 'ContextMenu'))
    root.dispatchEvent(domEvent('contextmenu', { button: 0, detail: 0 }))
    input.dispatchEvent(keyEvent('F10', 'F10', { shiftKey: true }))
    root.dispatchEvent(domEvent('contextmenu', { button: 0, detail: 0 }))

    root.dispatchEvent(domEvent('pointerdown', {
      button: 0,
      buttons: 1,
      detail: 0,
      pointerType: 'mouse',
      ctrlKey: true
    }))
    root.dispatchEvent(domEvent('contextmenu', {
      button: 0,
      buttons: 0,
      detail: 0,
      ctrlKey: true
    }))
    root.dispatchEvent(domEvent('contextmenu', {
      button: 2,
      buttons: 0,
      detail: 0
    }))
    root.dispatchEvent(domEvent('contextmenu', {
      button: 0,
      buttons: 0,
      detail: 0,
      pointerType: 'mouse'
    }))

    expect(sources).toEqual([
      'keyboard',
      'keyboard',
      'pointer',
      'pointer',
      'pointer'
    ])
    dispose()
  })

  test.each([
    ['macos', { metaKey: true }],
    ['windows', { ctrlKey: true }]
  ] as const)('uses the creation-time %s platform override', (platform, modifiers) => {
    const root = new FakeElement(ownerDocument, 'shikitor')
    const input = new FakeElement(ownerDocument, 'shikitor-input')
    root.append(input)
    const context = new Context() as unknown as Parameters<typeof inputBindingsControlled>[0]['context']
    const { service, dispose } = inputBindingsControlled({
      target: root as unknown as HTMLElement,
      input: input as unknown as HTMLTextAreaElement,
      context,
      shikitor: fakeShikitor(root),
      platform
    })
    const action = vi.fn(() => true)
    service.registerAction({ id: 'open-definition', run: action })
    service.registerBinding({
      id: 'mod-click',
      action: 'open-definition',
      trigger: { type: 'click', button: 'primary' },
      modifiers: ['Mod']
    })

    root.dispatchEvent(domEvent('click', {
      button: 0,
      buttons: 0,
      detail: 1,
      ...modifiers
    }))
    expect(action).toHaveBeenCalledOnce()
    dispose()
  })

  test('routes before an editor-local geometry plugin consumes pointer events', () => {
    const root = new FakeElement(ownerDocument, 'shikitor')
    const input = new FakeElement(ownerDocument, 'shikitor-input')
    root.append(input)
    const context = new Context() as unknown as Parameters<typeof inputBindingsControlled>[0]['context']
    const order: string[] = []
    context.on('shikitor/input', () => order.push('router'))
    const { dispose } = inputBindingsControlled({
      target: root as unknown as HTMLElement,
      input: input as unknown as HTMLTextAreaElement,
      context,
      shikitor: fakeShikitor(root)
    })
    const geometryPlugin = (event: Event) => {
      order.push('geometry')
      event.stopImmediatePropagation()
    }
    root.addEventListener('pointerdown', geometryPlugin, true)

    root.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }))
    expect(order).toEqual(['router', 'geometry'])

    root.removeEventListener('pointerdown', geometryPlugin, true)
    dispose()
  })
})
