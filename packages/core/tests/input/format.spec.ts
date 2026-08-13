import { describe, expect, it } from 'vitest'

import { formatAriaKeyShortcut, formatBinding } from '../../src/input'
import { binding } from './fixtures'

describe('input binding labels', () => {
  const modK = binding(
    { type: 'keydown', key: 'k', code: 'KeyK' },
    { modifiers: ['Mod'] }
  )

  it('formats Mod for visual presentation on each platform family', () => {
    expect(formatBinding(modK, 'macos')).toBe('⌘ + k')
    expect(formatBinding(modK, 'ios')).toBe('⌘ + k')
    expect(formatBinding(modK, 'windows')).toBe('Ctrl + k')
    expect(formatBinding(modK, 'linux')).toBe('Ctrl + k')
    expect(formatBinding(modK, 'android')).toBe('Ctrl + k')
    expect(formatBinding(modK, 'unknown')).toBe('Ctrl/Cmd + k')
  })

  it('keeps physical modifier labels distinct from Mod', () => {
    const physical = binding(
      { type: 'keydown', key: 'p' },
      { modifiers: ['Control', 'Meta', 'Alt', 'Shift', 'AltGraph'] }
    )
    expect(formatBinding(physical, 'macos')).toBe('⌃ + ⌘ + ⌥ + ⇧ + AltGr + p')
    expect(formatBinding(physical, 'windows')).toBe('Ctrl + Meta + Alt + Shift + AltGr + p')
  })

  it('produces platform-resolved aria-keyshortcuts values', () => {
    expect(formatAriaKeyShortcut(modK, 'macos')).toBe('Meta+k')
    expect(formatAriaKeyShortcut(modK, 'windows')).toBe('Control+k')
    expect(formatAriaKeyShortcut(modK, 'unknown')).toBe('Control+k')

    const explicitControl = binding(
      { type: 'keydown', key: 'Enter' },
      { modifiers: ['Control', 'Shift'] }
    )
    expect(formatAriaKeyShortcut(explicitControl, 'macos')).toBe('Control+Shift+Enter')
  })

  it('does not create ARIA keyboard labels for pointer or incomplete triggers', () => {
    expect(formatAriaKeyShortcut(binding({
      type: 'click',
      button: 'primary'
    }), 'windows')).toBeUndefined()
    expect(formatAriaKeyShortcut(binding({
      type: 'keydown'
    }), 'windows')).toBeUndefined()
    expect(formatAriaKeyShortcut(binding({
      type: 'keydown',
      code: 'KeyK'
    }), 'windows')).toBeUndefined()
  })

  it('formats pointer, context-menu, and wheel bindings for the UI', () => {
    expect(formatBinding(binding({
      type: 'click',
      button: 'primary'
    }), 'windows')).toBe('Click')
    expect(formatBinding(binding({
      type: 'contextmenu',
      button: 'secondary'
    }), 'windows')).toBe('Right Click')
    expect(formatBinding(binding({
      type: 'auxclick',
      button: 'auxiliary'
    }), 'windows')).toBe('Middle Click')
    expect(formatBinding(binding({
      type: 'wheel',
      axis: 'y',
      direction: 'negative'
    }), 'windows')).toBe('Wheel Y negative')
  })
})
