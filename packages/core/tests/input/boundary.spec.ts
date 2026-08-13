import { describe, expect, it, vi } from 'vitest'

import {
  createInputRegistry,
  detectInputPlatform,
  formatAriaKeyShortcut,
  formatBinding,
  matchInputBinding
} from '../../src/input'
import type { InputBinding } from '../../src/input'
import {
  binding,
  compositionEvent,
  keyboardEvent,
  pointerEvent,
  textInputEvent,
  wheelEvent
} from './fixtures'

describe('modifier and platform boundaries', () => {
  it('treats Ctrl+Meta as extra input for an exact unknown-platform Mod binding', () => {
    expect(matchInputBinding(
      binding(
        { type: 'keydown', key: 'k' },
        { modifiers: ['Mod'] }
      ),
      keyboardEvent({
        platform: 'unknown',
        key: 'k',
        code: 'KeyK',
        modifiers: { control: true, meta: true }
      })
    )).toBe(false)
  })

  it('allows AltGraph through exact Control+Alt only after explicit opt-in', () => {
    const event = keyboardEvent({
      key: '@',
      code: 'KeyQ',
      modifiers: { control: true, alt: true, altGraph: true }
    })
    expect(matchInputBinding(binding(
      { type: 'keydown', code: 'KeyQ' },
      {
        modifiers: {
          required: ['Control', 'Alt'],
          allowAltGraph: true
        }
      }
    ), event)).toBe(true)
  })

  it('supports forbidden modifiers independently from exactness', () => {
    const noShift = binding(
      { type: 'keydown', key: 'k' },
      {
        modifiers: {
          forbidden: ['Shift'],
          mode: 'at-least'
        }
      }
    )
    expect(matchInputBinding(noShift, keyboardEvent({ key: 'k', code: 'KeyK' }))).toBe(true)
    expect(matchInputBinding(noShift, keyboardEvent({
      key: 'k',
      code: 'KeyK',
      modifiers: { shift: true }
    }))).toBe(false)
  })

  it('maps Chrome OS client hints to the Linux shortcut family', () => {
    expect(detectInputPlatform(undefined, {
      userAgentDataPlatform: 'Chrome OS'
    })).toBe('linux')
  })
})

describe('keyboard and composition boundaries', () => {
  it('matches keyboard location and explicit repeat/composition allowances', () => {
    expect(matchInputBinding(
      binding({
        type: 'keydown',
        key: 'Enter',
        location: 3,
        repeat: 'allow',
        composing: 'allow'
      }),
      keyboardEvent({
        key: 'Enter',
        code: 'NumpadEnter',
        location: 3,
        repeat: true,
        isComposing: true
      })
    )).toBe(true)
    expect(matchInputBinding(
      binding({ type: 'keydown', key: 'Enter', location: 0 }),
      keyboardEvent({ key: 'Enter', code: 'NumpadEnter', location: 3 })
    )).toBe(false)
  })

  it('matches text input type arrays, data, and composition payloads exactly', () => {
    const insertComposition = textInputEvent({
      inputType: 'insertCompositionText',
      data: '你',
      isComposing: true
    })
    expect(matchInputBinding(binding({
      type: 'beforeinput',
      inputType: ['insertText', 'insertCompositionText'],
      data: '你'
    }), insertComposition)).toBe(true)
    expect(matchInputBinding(binding({
      type: 'beforeinput',
      inputType: 'insertCompositionText',
      data: '好'
    }), insertComposition)).toBe(false)

    expect(matchInputBinding(
      binding({ type: 'compositionupdate', data: '你' }),
      compositionEvent({ data: '你' })
    )).toBe(true)
    expect(matchInputBinding(
      binding({ type: 'compositionupdate', data: '好' }),
      compositionEvent({ data: '你' })
    )).toBe(false)
  })

  it('renders Space accessibly and omits physical-code-only ARIA values', () => {
    const space = binding(
      { type: 'keydown', key: ' ' },
      { modifiers: ['Mod'] }
    )
    expect(formatBinding(space, 'windows')).toBe('Ctrl + Space')
    expect(formatAriaKeyShortcut(space, 'windows')).toBe('Control+Space')
    expect(formatAriaKeyShortcut(binding({
      type: 'keydown',
      code: 'Space'
    }), 'windows')).toBeUndefined()
  })
})

describe('pointer and wheel boundaries', () => {
  it('filters physical button, pointer type, and click count together', () => {
    const penBarrelDoubleClick = binding({
      type: 'dblclick',
      button: 'secondary',
      physicalButton: 2,
      pointerType: 'pen',
      clicks: 2
    })
    const matching = pointerEvent({
      type: 'dblclick',
      button: 'secondary',
      physicalButton: 2,
      pointerType: 'pen',
      clicks: 2
    })
    expect(matchInputBinding(penBarrelDoubleClick, matching)).toBe(true)
    expect(matchInputBinding(penBarrelDoubleClick, {
      ...matching,
      pointer: { ...matching.pointer!, pointerType: 'mouse' }
    })).toBe(false)
    expect(matchInputBinding(penBarrelDoubleClick, {
      ...matching,
      pointer: { ...matching.pointer!, clicks: 1 }
    })).toBe(false)
  })

  it('does not assign a direction to a zero-delta wheel event', () => {
    expect(matchInputBinding(
      binding({ type: 'wheel', direction: 'positive' }),
      wheelEvent({ deltaX: 0, deltaY: 0 })
    )).toBe(false)
    expect(matchInputBinding(
      binding({ type: 'wheel' }),
      wheelEvent({ deltaX: 0, deltaY: 0 })
    )).toBe(true)
  })
})

describe('registry boundaries', () => {
  it('does not expose disabled or actionless bindings as dispatch candidates', () => {
    const registry = createInputRegistry()
    const action = vi.fn(() => true)
    registry.registerAction({ id: 'action', run: action })
    registry.registerBinding(binding(
      { type: 'keydown', key: 'k' },
      { id: 'disabled', enabled: false }
    ))
    registry.registerBinding(binding(
      { type: 'keydown', key: 'k' },
      { id: 'missing-action', action: 'missing' }
    ))

    expect(registry.dispatch(keyboardEvent({ key: 'k', code: 'KeyK' }))).toMatchObject({
      handled: false,
      matchedBindingIds: []
    })
    expect(action).not.toHaveBeenCalled()
  })

  it('passes typed binding arguments to the selected action', () => {
    const registry = createInputRegistry()
    const run = vi.fn((_event, args: { destination: string }) => {
      expect(args).toEqual({ destination: 'definition' })
      return true
    })
    registry.registerAction({ id: 'navigate', run })
    registry.registerBinding<{ destination: string }>({
      id: 'mod-click',
      action: 'navigate',
      args: { destination: 'definition' },
      trigger: { type: 'click', button: 'primary' },
      modifiers: ['Mod']
    })

    expect(registry.dispatch(pointerEvent({
      modifiers: { control: true }
    })).handled).toBe(true)
    expect(run).toHaveBeenCalledOnce()
  })

  it('uses registration order as the deterministic final conflict tiebreaker', () => {
    const registry = createInputRegistry()
    const calls: string[] = []
    for (const id of ['first', 'second']) {
      registry.registerAction({
        id,
        run: () => {
          calls.push(id)
          return false
        }
      })
      const inputBinding: InputBinding = {
        id,
        action: id,
        trigger: { type: 'keydown', key: 'k' }
      }
      registry.registerBinding(inputBinding)
    }

    expect(registry.dispatch(keyboardEvent({ key: 'k', code: 'KeyK' })).matchedBindingIds)
      .toEqual(['first', 'second'])
    expect(calls).toEqual(['first', 'second'])
  })
})
