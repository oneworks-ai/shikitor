import { createInputRegistry } from '@shikitor/core'
import type {
  InputDispatchSummary,
  InputPlatform,
  ShikitorInputEvent
} from '@shikitor/core'
import { describe, expect, test, vi } from 'vitest'

import {
  compileInputEventBindings,
  createInputEventsRuntime,
  createInputEventsTraceRecorder
} from '../../src/examples/InputEvents/runtime'

const unhandled: InputDispatchSummary = {
  handled: false,
  matchedBindingIds: [],
  preventDefault: false,
  stopPropagation: false,
  stopImmediatePropagation: false
}

function inputEvent(
  type: ShikitorInputEvent['type'],
  platform: InputPlatform = 'windows'
): ShikitorInputEvent {
  const keyboard = type === 'keydown' || type === 'keyup'
    ? {
        key: 's',
        code: 'KeyS',
        location: 0,
        repeat: false,
        isComposing: false
      }
    : undefined
  const pointer = type.startsWith('pointer') || [
    'click',
    'dblclick',
    'auxclick',
    'contextmenu'
  ].includes(type)
    ? {
        pointerType: 'mouse' as const,
        button: 'primary' as const,
        physicalButton: 0,
        buttons: 1,
        clicks: 1,
        source: 'pointer' as const
      }
    : undefined
  const wheel = type === 'wheel'
    ? { deltaX: 0, deltaY: 12, deltaMode: 0 }
    : undefined

  return {
    editor: {} as ShikitorInputEvent['editor'],
    nativeEvent: {} as ShikitorInputEvent['nativeEvent'],
    type,
    platform,
    modifiers: {
      mod: true,
      control: platform !== 'macos',
      meta: platform === 'macos',
      alt: false,
      shift: false,
      altGraph: false
    },
    hit: {
      zone: 'content',
      element: null,
      line: 2,
      position: { offset: 7, line: 2, character: 3 }
    },
    cursor: { offset: 7, line: 2, character: 3 },
    selections: [],
    state: {
      focused: true,
      readOnly: false,
      hasSelection: false,
      language: 'typescript'
    },
    keyboard,
    pointer,
    wheel
  }
}

function applyRuntime(
  runtime: ReturnType<typeof createInputEventsRuntime>,
  platform: InputPlatform = 'windows'
) {
  const service = createInputRegistry({ platform })
  let observe: ((
    event: ShikitorInputEvent,
    summary: InputDispatchSummary
  ) => void) | undefined
  const context = {
    shikitor: {},
    shikitorInput: service,
    on(name: string, listener: typeof observe) {
      if (name === 'shikitor/input') observe = listener
    }
  }
  const plugin = runtime.plugin as unknown as {
    apply(context: typeof context): (() => void) | void
  }
  const dispose = plugin.apply(context)
  return {
    service,
    emit(event: ShikitorInputEvent, summary: InputDispatchSummary) {
      observe?.(event, summary)
    },
    dispose: dispose ?? (() => {})
  }
}

describe('input events binding presets', () => {
  test('compiles serializable cross-platform combinations', () => {
    const bindings = compileInputEventBindings()

    expect(bindings.map(binding => binding.id)).toEqual([
      'mod-primary-click',
      'control-context-menu',
      'command-palette',
      'save-file'
    ])
    expect(bindings[0]).toMatchObject({
      trigger: { type: 'click', button: 'primary' },
      modifiers: ['Mod']
    })
    expect(bindings[1]).toMatchObject({
      trigger: { type: 'contextmenu' },
      modifiers: ['Control']
    })
    expect(() => JSON.stringify(bindings)).not.toThrow()
  })

  test('merges a persisted override without mutating presets', () => {
    const changed = compileInputEventBindings({
      bindings: [{
        id: 'save-file',
        enabled: false,
        modifiers: ['Control', 'Alt'],
        priority: 99
      }]
    })
    const defaults = compileInputEventBindings()

    expect(changed[3]).toMatchObject({
      enabled: false,
      modifiers: ['Control', 'Alt'],
      priority: 99
    })
    expect(defaults[3].enabled).toBeUndefined()
    expect(defaults[3].modifiers).toEqual(['Mod'])
  })
})

describe('input events trace recorder', () => {
  test('throttles motion, preserves handled motion and behaves as a ring buffer', () => {
    let time = 0
    const recorder = createInputEventsTraceRecorder({
      limit: 2,
      motionThrottleMs: 80,
      now: () => time
    })

    expect(recorder.record(inputEvent('pointermove'), unhandled)).toBe(true)
    time = 20
    expect(recorder.record(inputEvent('pointermove'), unhandled)).toBe(false)
    time = 30
    expect(recorder.record(inputEvent('pointermove'), {
      ...unhandled,
      handled: true,
      handledBindingId: 'move',
      handledActionId: 'move-action',
      matchedBindingIds: ['move']
    })).toBe(true)
    time = 100
    expect(recorder.record(inputEvent('keydown'), unhandled)).toBe(true)

    expect(recorder.entries()).toHaveLength(2)
    expect(recorder.entries().map(entry => entry.timestamp)).toEqual([30, 100])
    expect(recorder.entries()[0]).toMatchObject({
      target: { zone: 'content', line: 2 },
      handled: true,
      handledBindingId: 'move'
    })
    expect(JSON.stringify(recorder.entries())).not.toContain('nativeEvent')
  })

  test('trims existing entries when the limit changes', () => {
    const recorder = createInputEventsTraceRecorder({ limit: 4 })
    recorder.record(inputEvent('keydown'), unhandled)
    recorder.record(inputEvent('keyup'), unhandled)
    recorder.record(inputEvent('click'), unhandled)

    recorder.updateOptions({ limit: 1 })
    expect(recorder.entries()).toHaveLength(1)
    expect(recorder.entries()[0].type).toBe('click')
  })
})

describe('input events runtime', () => {
  test('registers actions once, counts dispatches and exposes platform labels', () => {
    const onAction = vi.fn()
    const runtime = createInputEventsRuntime({ onAction })
    const host = applyRuntime(runtime, 'windows')
    const event = inputEvent('keydown', 'windows')

    const summary = host.service.dispatch(event)
    host.emit(event, summary)

    expect(summary).toMatchObject({
      handled: true,
      handledBindingId: 'save-file',
      handledActionId: 'save-file',
      preventDefault: true
    })
    expect(runtime.getSnapshot()).toMatchObject({
      platform: 'windows',
      platformLabel: 'Windows · Mod = Control',
      actionCounts: { 'save-file': 1 },
      lastAction: {
        actionId: 'save-file',
        presetId: 'save-file',
        target: 'content',
        line: 2,
        offset: 7
      }
    })
    const saveView = runtime.getSnapshot().bindings.find(
      binding => binding.id === 'save-file'
    )
    expect(saveView).toMatchObject({
      label: 'Ctrl + s',
      ariaKeyShortcut: 'Control+s'
    })
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(() => JSON.stringify(runtime.getSnapshot())).not.toThrow()

    host.dispose()
    expect(host.service.listBindings()).toEqual([])
  })

  test('updates bindings without reinstalling actions or the plugin', () => {
    const runtime = createInputEventsRuntime()
    const host = applyRuntime(runtime)
    const plugin = runtime.plugin

    runtime.updateConfig({
      bindings: [{ id: 'save-file', enabled: false }],
      traceLimit: 5
    })
    const event = inputEvent('keydown')
    const summary = host.service.dispatch(event)
    host.emit(event, summary)

    expect(runtime.plugin).toBe(plugin)
    expect(summary.handled).toBe(false)
    expect(runtime.getSnapshot().actionCounts['save-file']).toBe(0)
    expect(runtime.getSnapshot().bindings.find(
      binding => binding.id === 'save-file'
    )?.enabled).toBe(false)
  })

  test('lets the binding policy own DOM consumption', () => {
    const runtime = createInputEventsRuntime({
      config: {
        bindings: [{
          id: 'save-file',
          policy: { preventDefault: 'never', stopPropagation: 'never' }
        }]
      }
    })
    const host = applyRuntime(runtime, 'windows')
    const summary = host.service.dispatch(inputEvent('keydown', 'windows'))

    expect(summary).toMatchObject({
      handled: true,
      preventDefault: false,
      stopPropagation: false
    })
    host.dispose()
  })

  test('keeps getSnapshot referentially stable until state changes', () => {
    const runtime = createInputEventsRuntime()
    const initial = runtime.getSnapshot()
    expect(runtime.getSnapshot()).toBe(initial)

    const listener = vi.fn()
    const unsubscribe = runtime.subscribe(listener)
    runtime.clearTrace()

    expect(runtime.getSnapshot()).not.toBe(initial)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    runtime.resetCounts()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
