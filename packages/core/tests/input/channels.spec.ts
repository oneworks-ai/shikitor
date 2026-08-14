import { describe, expect, it, vi } from 'vitest'

import { createInputRegistry } from '../../src/input'
import {
  compositionEvent,
  keyboardEvent,
  pointerEvent,
  textInputEvent,
  wheelEvent
} from './fixtures'

describe('normalized input channels', () => {
  it('publishes every event after binding dispatch', () => {
    const registry = createInputRegistry()
    const listener = vi.fn()
    registry.subscribe(listener)
    registry.registerAction({ id: 'save', run: () => true })
    registry.registerBinding({
      id: 'save',
      action: 'save',
      trigger: { type: 'keydown', key: 's' }
    })

    const event = keyboardEvent({ key: 's', code: 'KeyS' })
    registry.dispatch(event)

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(event, expect.objectContaining({
      handled: true,
      handledActionId: 'save'
    }))
  })

  it('routes pointer, keyboard and text families independently', () => {
    const registry = createInputRegistry()
    const pointer = vi.fn()
    const keyboard = vi.fn()
    const text = vi.fn()
    registry.pointer.subscribe(pointer)
    registry.keyboard.subscribe(keyboard)
    registry.text.subscribe(text)

    registry.dispatch(pointerEvent({ type: 'pointermove' }))
    registry.dispatch(pointerEvent({ type: 'contextmenu' }))
    registry.dispatch(wheelEvent())
    registry.dispatch(keyboardEvent())
    registry.dispatch(textInputEvent())
    registry.dispatch(compositionEvent())

    expect(pointer).toHaveBeenCalledTimes(3)
    expect(keyboard).toHaveBeenCalledOnce()
    expect(text).toHaveBeenCalledTimes(2)
  })

  it('stops publishing after a subscription is disposed', () => {
    const registry = createInputRegistry()
    const listener = vi.fn()
    const subscription = registry.pointer.subscribe(listener)
    registry.dispatch(pointerEvent())
    subscription.dispose()
    registry.dispatch(pointerEvent())
    expect(listener).toHaveBeenCalledOnce()
  })
})
