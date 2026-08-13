import { describe, expect, it } from 'vitest'

import { formatBinding, matchInputBinding } from '../../src/input'
import type {
  InputModifierState,
  MouseButton,
  MouseInputType,
  ShikitorInputEvent
} from '../../src/input'
import { binding, modifierState, pointerEvent } from './fixtures'

function mouseEvent(options: {
  type?: MouseInputType
  button?: MouseButton
  physicalButton?: number
  buttons?: number
  clicks?: number
  modifiers?: Partial<InputModifierState>
} = {}): ShikitorInputEvent {
  return {
    ...pointerEvent({
      type: 'click',
      modifiers: options.modifiers
    }),
    nativeEvent: {} as MouseEvent,
    type: options.type ?? 'mousedown',
    modifiers: modifierState('windows', options.modifiers),
    pointer: undefined,
    mouse: {
      button: options.button ?? 'primary',
      physicalButton: options.physicalButton ?? 0,
      buttons: options.buttons ?? 1,
      clicks: options.clicks ?? 1
    }
  }
}

describe('native mouse compatibility bindings', () => {
  it('matches every compatibility event by its exact native type', () => {
    const types = [
      'mousedown',
      'mouseup',
      'mousemove',
      'mouseenter',
      'mouseleave',
      'mouseover',
      'mouseout'
    ] as const

    for (const type of types) {
      expect(matchInputBinding(
        binding({ type }),
        mouseEvent({ type })
      )).toBe(true)
      expect(matchInputBinding(
        binding({ type }),
        mouseEvent({ type: type === 'mousedown' ? 'mouseup' : 'mousedown' })
      )).toBe(false)
    }
  })

  it('does not implicitly match pointer or click bindings', () => {
    const nativeMouseDown = mouseEvent({ type: 'mousedown' })
    expect(matchInputBinding(binding({ type: 'pointerdown' }), nativeMouseDown)).toBe(false)
    expect(matchInputBinding(binding({ type: 'click' }), nativeMouseDown)).toBe(false)

    const nativePointerDown = pointerEvent({ type: 'pointerdown' })
    expect(matchInputBinding(binding({ type: 'mousedown' }), nativePointerDown)).toBe(false)
  })

  it('matches button identity, button chords, clicks, and modifiers', () => {
    const chord = binding(
      {
        type: 'mousemove',
        button: 'secondary',
        physicalButton: 2,
        buttons: ['primary', 'secondary'],
        buttonsMode: 'exact',
        clicks: 2
      },
      { modifiers: ['Control'] }
    )
    expect(matchInputBinding(chord, mouseEvent({
      type: 'mousemove',
      button: 'secondary',
      physicalButton: 2,
      buttons: 1 | 2,
      clicks: 2,
      modifiers: { control: true }
    }))).toBe(true)
    expect(matchInputBinding(chord, mouseEvent({
      type: 'mousemove',
      button: 'secondary',
      physicalButton: 2,
      buttons: 1 | 2 | 4,
      clicks: 2,
      modifiers: { control: true }
    }))).toBe(false)
  })

  it('formats mouse bindings without changing their event identity', () => {
    expect(formatBinding(binding({
      type: 'mousedown',
      button: 'secondary'
    }), 'windows')).toBe('mousedown Right Click')
  })
})
