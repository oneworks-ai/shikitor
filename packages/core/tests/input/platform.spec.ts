import { describe, expect, it } from 'vitest'

import {
  detectInputPlatform,
  normalizeModifiers,
  resolveModifier
} from '../../src/input'

describe('input platform detection', () => {
  it('always prefers an explicit host override', () => {
    expect(detectInputPlatform('linux', {
      userAgentDataPlatform: 'macOS',
      navigatorPlatform: 'MacIntel'
    })).toBe('linux')
  })

  it('prefers UA client hints over legacy navigator fields', () => {
    expect(detectInputPlatform(undefined, {
      userAgentDataPlatform: 'Windows',
      navigatorPlatform: 'MacIntel',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)'
    })).toBe('windows')
  })

  it('distinguishes iPadOS from macOS compatibility reporting', () => {
    expect(detectInputPlatform(undefined, {
      navigatorPlatform: 'MacIntel',
      maxTouchPoints: 5
    })).toBe('ios')
    expect(detectInputPlatform(undefined, {
      navigatorPlatform: 'MacIntel',
      maxTouchPoints: 0
    })).toBe('macos')
  })

  it('falls back through navigatorPlatform and userAgent', () => {
    expect(detectInputPlatform(undefined, {
      navigatorPlatform: 'Linux x86_64'
    })).toBe('linux')
    expect(detectInputPlatform(undefined, {
      userAgent: 'Mozilla/5.0 (Linux; Android 15)'
    })).toBe('android')
    expect(detectInputPlatform(undefined, {
      userAgent: 'custom-runtime'
    })).toBe('unknown')
  })
})

describe('Mod normalization', () => {
  it('maps Mod to Meta on Apple platforms', () => {
    expect(resolveModifier('Mod', 'macos')).toEqual(['Meta'])
    expect(resolveModifier('Mod', 'ios')).toEqual(['Meta'])
    expect(normalizeModifiers({ metaKey: true }, 'macos')).toMatchObject({
      mod: true,
      meta: true,
      control: false
    })
  })

  it('maps Mod to Control on Windows, Linux, and Android', () => {
    for (const platform of ['windows', 'linux', 'android'] as const) {
      expect(resolveModifier('Mod', platform)).toEqual(['Control'])
      expect(normalizeModifiers({ ctrlKey: true }, platform).mod).toBe(true)
      expect(normalizeModifiers({ metaKey: true }, platform).mod).toBe(false)
    }
  })

  it('accepts Control or Meta as Mod on unknown hosts', () => {
    expect(resolveModifier('Mod', 'unknown')).toEqual(['Control', 'Meta'])
    expect(normalizeModifiers({ ctrlKey: true }, 'unknown').mod).toBe(true)
    expect(normalizeModifiers({ metaKey: true }, 'unknown').mod).toBe(true)
  })

  it('preserves explicit physical modifier and AltGraph state', () => {
    const state = normalizeModifiers({
      ctrlKey: true,
      altKey: true,
      getModifierState: key => key === 'AltGraph'
    }, 'windows')

    expect(state).toEqual({
      mod: true,
      control: true,
      meta: false,
      alt: true,
      shift: false,
      altGraph: true
    })
  })
})
