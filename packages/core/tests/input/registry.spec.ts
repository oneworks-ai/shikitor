import { describe, expect, it, vi } from 'vitest'

import { createInputRegistry } from '../../src/input'
import type { InputBinding } from '../../src/input'
import { binding, keyboardEvent } from './fixtures'

function register(
  registry: ReturnType<typeof createInputRegistry>,
  inputBinding: InputBinding,
  run: () => boolean | void = () => true
) {
  registry.registerAction({ id: inputBinding.action, run })
  registry.registerBinding(inputBinding)
}

describe('input registry ordering and conflicts', () => {
  it('ranks priority before specificity and specificity before registration order', () => {
    const registry = createInputRegistry({ platform: 'windows' })
    const calls: string[] = []
    for (const inputBinding of [
      binding(
        { type: 'keydown', key: 'k', code: 'KeyK' },
        { id: 'specific', action: 'specific', target: 'content' }
      ),
      binding(
        { type: 'keydown', key: 'k' },
        { id: 'high-priority', action: 'high-priority', priority: 10 }
      ),
      binding(
        { type: 'keydown', key: 'k', code: 'KeyK' },
        { id: 'same-specificity-first', action: 'same-specificity-first' }
      ),
      binding(
        { type: 'keydown', key: 'k', code: 'KeyK' },
        { id: 'same-specificity-second', action: 'same-specificity-second' }
      )
    ]) {
      register(registry, inputBinding, () => {
        calls.push(inputBinding.id)
        return false
      })
    }

    const result = registry.dispatch(keyboardEvent({ key: 'k', code: 'KeyK' }))
    expect(result.matchedBindingIds).toEqual([
      'high-priority',
      'specific',
      'same-specificity-first',
      'same-specificity-second'
    ])
    expect(calls).toEqual(result.matchedBindingIds)
  })

  it('stops at the first handled binding unless continueOnHandled is enabled', () => {
    const registry = createInputRegistry()
    const first = vi.fn(() => true)
    const second = vi.fn(() => true)
    register(registry, binding(
      { type: 'keydown', key: 'k' },
      { id: 'first', action: 'first', priority: 2 }
    ), first)
    register(registry, binding(
      { type: 'keydown', key: 'k' },
      { id: 'second', action: 'second', priority: 1 }
    ), second)

    expect(registry.dispatch(keyboardEvent({ key: 'k', code: 'KeyK' }))).toMatchObject({
      handled: true,
      matchedBindingIds: ['first'],
      handledBindingId: 'first'
    })
    expect(first).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()

    const continuing = createInputRegistry()
    register(continuing, binding(
      { type: 'keydown', key: 'k' },
      {
        id: 'continuing',
        action: 'continuing',
        priority: 2,
        policy: { continueOnHandled: true }
      }
    ), () => true)
    register(continuing, binding(
      { type: 'keydown', key: 'k' },
      { id: 'fallback', action: 'fallback', priority: 1 }
    ), () => true)

    expect(continuing.dispatch(keyboardEvent({ key: 'k', code: 'KeyK' }))).toMatchObject({
      handled: true,
      matchedBindingIds: ['continuing', 'fallback'],
      handledBindingId: 'continuing',
      handledActionId: 'continuing'
    })
  })

  it('treats a later binding with the same id as an override and restores on dispose', () => {
    const registry = createInputRegistry()
    registry.registerAction({ id: 'base', run: () => true })
    registry.registerAction({ id: 'override', run: () => true })
    const original = registry.registerBinding(binding(
      { type: 'keydown', key: 'a' },
      { id: 'user-binding', action: 'base' }
    ))
    const override = registry.registerBinding(binding(
      { type: 'keydown', key: 'b' },
      { id: 'user-binding', action: 'override' }
    ))

    expect(registry.listBindings()).toHaveLength(1)
    expect(registry.dispatch(keyboardEvent({ key: 'a', code: 'KeyA' })).handled).toBe(false)
    expect(registry.dispatch(keyboardEvent({ key: 'b', code: 'KeyB' })).handledActionId).toBe('override')

    override.dispose()
    expect(registry.dispatch(keyboardEvent({ key: 'a', code: 'KeyA' })).handledActionId).toBe('base')
    expect(registry.dispatch(keyboardEvent({ key: 'b', code: 'KeyB' })).handled).toBe(false)

    original.dispose()
    expect(registry.listBindings()).toEqual([])
  })

  it('restores an overridden action when its later registration is disposed', () => {
    const registry = createInputRegistry()
    const original = vi.fn(() => true)
    const override = vi.fn(() => true)
    registry.registerAction({ id: 'action', run: original })
    const overrideDisposable = registry.registerAction({ id: 'action', run: override })
    registry.registerBinding(binding({ type: 'keydown', key: 'k' }))

    registry.dispatch(keyboardEvent({ key: 'k', code: 'KeyK' }))
    expect(override).toHaveBeenCalledOnce()
    expect(original).not.toHaveBeenCalled()

    overrideDisposable.dispose()
    registry.dispatch(keyboardEvent({ key: 'k', code: 'KeyK' }))
    expect(original).toHaveBeenCalledOnce()
  })

  it('disposes binding groups atomically', () => {
    const registry = createInputRegistry()
    registry.registerAction({ id: 'action', run: () => true })
    const disposable = registry.registerBindings([
      binding({ type: 'keydown', key: 'a' }, { id: 'a' }),
      binding({ type: 'keydown', key: 'b' }, { id: 'b' })
    ])

    expect(registry.listBindings().map(item => item.id)).toEqual(['a', 'b'])
    disposable.dispose()
    expect(registry.listBindings()).toEqual([])
  })
})

describe('input event disposition policies', () => {
  it('applies matched policy even when an action declines the event', () => {
    const registry = createInputRegistry()
    register(registry, binding(
      { type: 'keydown', key: 'k' },
      {
        policy: {
          preventDefault: 'matched',
          stopPropagation: 'matched',
          stopImmediatePropagation: 'matched'
        }
      }
    ), () => false)

    expect(registry.dispatch(keyboardEvent({ key: 'k', code: 'KeyK' }))).toMatchObject({
      handled: false,
      preventDefault: true,
      stopPropagation: true,
      stopImmediatePropagation: true
    })
  })

  it('applies handled policy only after an action handles the event', () => {
    const registry = createInputRegistry()
    const inputBinding = binding(
      { type: 'keydown', key: 'k' },
      {
        policy: {
          preventDefault: 'handled',
          stopPropagation: 'handled'
        }
      }
    )
    register(registry, inputBinding, () => false)
    expect(registry.dispatch(keyboardEvent({ key: 'k', code: 'KeyK' }))).toMatchObject({
      handled: false,
      preventDefault: false,
      stopPropagation: false
    })

    const handled = createInputRegistry()
    register(handled, inputBinding, () => true)
    expect(handled.dispatch(keyboardEvent({ key: 'k', code: 'KeyK' }))).toMatchObject({
      handled: true,
      preventDefault: true,
      stopPropagation: true
    })
  })

  it('merges disposition flags returned directly by the action', () => {
    const registry = createInputRegistry()
    registry.registerAction({
      id: 'action',
      run: () => ({
        handled: true,
        preventDefault: true,
        stopImmediatePropagation: true
      })
    })
    registry.registerBinding(binding({ type: 'keydown', key: 'k' }))

    expect(registry.dispatch(keyboardEvent({ key: 'k', code: 'KeyK' }))).toMatchObject({
      handled: true,
      preventDefault: true,
      stopPropagation: true,
      stopImmediatePropagation: true
    })
  })
})
