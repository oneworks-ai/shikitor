import { describe, expect, it } from 'vitest'

import { matchInputBinding } from '../../src/input'
import {
  binding,
  keyboardEvent,
  pointerEvent,
  textInputEvent,
  wheelEvent
} from './fixtures'

describe('cross-platform modifier matching', () => {
  const modClick = binding(
    { type: 'click', button: 'primary' },
    { modifiers: ['Mod'] }
  )

  it('matches Meta on macOS and Control on Windows', () => {
    expect(matchInputBinding(modClick, pointerEvent({
      platform: 'macos',
      modifiers: { meta: true }
    }))).toBe(true)
    expect(matchInputBinding(modClick, pointerEvent({
      platform: 'macos',
      modifiers: { control: true }
    }))).toBe(false)

    expect(matchInputBinding(modClick, pointerEvent({
      platform: 'windows',
      modifiers: { control: true }
    }))).toBe(true)
    expect(matchInputBinding(modClick, pointerEvent({
      platform: 'windows',
      modifiers: { meta: true }
    }))).toBe(false)
  })

  it('keeps explicit Control distinct from Mod on macOS', () => {
    const controlContextMenu = binding(
      { type: 'contextmenu', button: 'secondary' },
      { modifiers: ['Control'] }
    )
    expect(matchInputBinding(controlContextMenu, pointerEvent({
      type: 'contextmenu',
      platform: 'macos',
      button: 'secondary',
      physicalButton: 2,
      modifiers: { control: true }
    }))).toBe(true)
    expect(matchInputBinding(controlContextMenu, pointerEvent({
      type: 'contextmenu',
      platform: 'macos',
      button: 'secondary',
      physicalButton: 2,
      modifiers: { meta: true }
    }))).toBe(false)
  })

  it('matches either Control or Meta as Mod on unknown hosts', () => {
    expect(matchInputBinding(modClick, pointerEvent({
      platform: 'unknown',
      modifiers: { control: true }
    }))).toBe(true)
    expect(matchInputBinding(modClick, pointerEvent({
      platform: 'unknown',
      modifiers: { meta: true }
    }))).toBe(true)
  })

  it('rejects extra modifiers by default and supports at-least matching', () => {
    const exact = binding(
      { type: 'keydown', key: 'p' },
      { modifiers: ['Mod'] }
    )
    const atLeast = binding(
      { type: 'keydown', key: 'p' },
      {
        modifiers: {
          required: ['Mod'],
          mode: 'at-least'
        }
      }
    )
    const event = keyboardEvent({
      key: 'p',
      code: 'KeyP',
      modifiers: { control: true, shift: true }
    })

    expect(matchInputBinding(exact, event)).toBe(false)
    expect(matchInputBinding(atLeast, event)).toBe(true)
  })

  it('blocks AltGraph unless a binding explicitly opts in', () => {
    const controlAlt = keyboardEvent({
      key: '@',
      code: 'KeyQ',
      modifiers: {
        control: true,
        alt: true,
        altGraph: true
      }
    })
    const ordinaryShortcut = binding(
      { type: 'keydown', code: 'KeyQ' },
      {
        modifiers: {
          required: ['Control', 'Alt'],
          mode: 'at-least'
        }
      }
    )
    const explicitAltGraph = binding(
      { type: 'keydown', code: 'KeyQ' },
      { modifiers: ['AltGraph'] }
    )

    expect(matchInputBinding(ordinaryShortcut, controlAlt)).toBe(false)
    expect(matchInputBinding(explicitAltGraph, controlAlt)).toBe(true)
  })
})

describe('keyboard, composition, and text input matching', () => {
  it('uses key for layout-aware shortcuts and code for physical keys', () => {
    const event = keyboardEvent({ key: 'a', code: 'KeyQ' })

    expect(matchInputBinding(
      binding({ type: 'keydown', key: 'A' }),
      event
    )).toBe(true)
    expect(matchInputBinding(
      binding({ type: 'keydown', key: 'q' }),
      event
    )).toBe(false)
    expect(matchInputBinding(
      binding({ type: 'keydown', code: 'KeyQ' }),
      event
    )).toBe(true)
    expect(matchInputBinding(
      binding({ type: 'keydown', code: 'KeyA' }),
      event
    )).toBe(false)
  })

  it('ignores repeated and composing keyboard events by default', () => {
    const trigger = binding({ type: 'keydown', key: 'ArrowDown' })
    expect(matchInputBinding(trigger, keyboardEvent({
      key: 'ArrowDown',
      code: 'ArrowDown',
      repeat: true
    }))).toBe(false)
    expect(matchInputBinding(trigger, keyboardEvent({
      key: 'ArrowDown',
      code: 'ArrowDown',
      isComposing: true
    }))).toBe(false)
  })

  it('supports repeat-only and composition-only bindings', () => {
    expect(matchInputBinding(
      binding({ type: 'keydown', key: 'ArrowDown', repeat: 'only' }),
      keyboardEvent({ key: 'ArrowDown', code: 'ArrowDown', repeat: true })
    )).toBe(true)
    expect(matchInputBinding(
      binding({ type: 'keydown', key: 'Process', composing: 'only' }),
      keyboardEvent({ key: 'Process', code: 'KeyA', isComposing: true })
    )).toBe(true)
  })

  it('allows composing text input by default but supports explicit filters', () => {
    const composing = textInputEvent({ isComposing: true })
    expect(matchInputBinding(
      binding({ type: 'beforeinput', inputType: 'insertText' }),
      composing
    )).toBe(true)
    expect(matchInputBinding(
      binding({
        type: 'beforeinput',
        inputType: ['insertText', 'insertCompositionText'],
        composing: 'ignore'
      }),
      composing
    )).toBe(false)
    expect(matchInputBinding(
      binding({ type: 'beforeinput', composing: 'only' }),
      composing
    )).toBe(true)
  })
})

describe('pointer, context-menu, and wheel matching', () => {
  it('keeps contextmenu source and secondary-button semantics explicit', () => {
    const pointerMenu = binding({
      type: 'contextmenu',
      button: 'secondary',
      source: 'pointer'
    })
    const keyboardMenu = binding({
      type: 'contextmenu',
      source: 'keyboard'
    })

    expect(matchInputBinding(pointerMenu, pointerEvent({
      type: 'contextmenu',
      button: 'secondary',
      physicalButton: 2,
      source: 'pointer'
    }))).toBe(true)
    expect(matchInputBinding(pointerMenu, pointerEvent({
      type: 'contextmenu',
      button: 'primary',
      source: 'keyboard'
    }))).toBe(false)
    expect(matchInputBinding(keyboardMenu, pointerEvent({
      type: 'contextmenu',
      button: 'primary',
      source: 'keyboard'
    }))).toBe(true)
  })

  it('matches pointer button chords using the buttons bitmask', () => {
    const atLeast = binding({
      type: 'pointermove',
      buttons: ['primary', 'secondary']
    })
    const exact = binding({
      type: 'pointermove',
      buttons: ['primary', 'secondary'],
      buttonsMode: 'exact'
    })

    expect(matchInputBinding(atLeast, pointerEvent({
      type: 'pointermove',
      buttons: 1 | 2 | 4
    }))).toBe(true)
    expect(matchInputBinding(exact, pointerEvent({
      type: 'pointermove',
      buttons: 1 | 2 | 4
    }))).toBe(false)
    expect(matchInputBinding(exact, pointerEvent({
      type: 'pointermove',
      buttons: 1 | 2
    }))).toBe(true)
  })

  it('matches wheel axis and direction and requires explicit Control opt-in', () => {
    const verticalDown = binding({
      type: 'wheel',
      axis: 'y',
      direction: 'positive'
    })
    expect(matchInputBinding(verticalDown, wheelEvent({ deltaX: 1, deltaY: 50 }))).toBe(true)
    expect(matchInputBinding(verticalDown, wheelEvent({ deltaX: 50, deltaY: 1 }))).toBe(false)
    expect(matchInputBinding(verticalDown, wheelEvent({ deltaY: -50 }))).toBe(false)
    expect(matchInputBinding(verticalDown, wheelEvent({
      deltaY: 50,
      modifiers: { control: true }
    }))).toBe(false)
    expect(matchInputBinding(
      binding(
        { type: 'wheel', axis: 'y', direction: 'positive' },
        { modifiers: ['Control'] }
      ),
      wheelEvent({ deltaY: 50, modifiers: { control: true } })
    )).toBe(true)
  })
})

describe('binding scopes', () => {
  it('applies platform, target, and editor-state conditions together', () => {
    const scoped = binding(
      { type: 'keydown', key: 'k' },
      {
        platform: ['windows', 'linux'],
        target: ['content', 'line-widget'],
        when: {
          focused: true,
          readOnly: false,
          hasSelection: false,
          language: ['typescript', 'javascript']
        }
      }
    )
    const matching = keyboardEvent({ key: 'k', code: 'KeyK' })
    expect(matchInputBinding(scoped, matching)).toBe(true)
    expect(matchInputBinding(scoped, {
      ...matching,
      state: { ...matching.state, readOnly: true }
    })).toBe(false)
    expect(matchInputBinding(scoped, {
      ...matching,
      hit: { ...matching.hit, zone: 'gutter' }
    })).toBe(false)
    expect(matchInputBinding(scoped, {
      ...matching,
      platform: 'macos'
    })).toBe(false)
  })
})
