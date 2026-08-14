import type { ShikitorInputEvent } from '@shikitor/core'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import provideMouse, {
  type ShikitorMouseService
} from '../../src/plugins/provide-mouse'
import { getRawTextHelper } from '../../src/utils/getRawTextHelper'

class FakeElement {
  ownerDocument = { defaultView: {} }
}

describe('provide mouse compatibility facade', () => {
  beforeEach(() => {
    vi.stubGlobal('Element', FakeElement)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('uses the editor pointer channel and resets deduplication on leave', () => {
    let listener: ((event: ShikitorInputEvent) => void) | undefined
    let service: ShikitorMouseService | undefined
    const disposeSubscription = vi.fn()
    const emit = vi.fn()
    const rawTextHelper = getRawTextHelper('value')
    const element = new FakeElement()
    const editor = {
      element,
      value: 'value',
      rawTextHelper,
      input: {
        pointer: {
          subscribe(next: typeof listener) {
            listener = next
            return { dispose: disposeSubscription }
          }
        }
      }
    }
    const plugin = provideMouse as unknown as {
      apply(context: unknown): () => void
    }
    const cleanup = plugin.apply({
      shikitor: editor,
      emit,
      provide(_name: string, value: ShikitorMouseService) {
        service = value
      }
    })
    const onHover = vi.fn()
    service?.registerMouseProvider({ onHover })
    const position = rawTextHelper.resolvePosition(1)
    const inputEvent = (
      type: ShikitorInputEvent['type'],
      zone: ShikitorInputEvent['hit']['zone'] = 'content'
    ) => ({
      type,
      hit: { zone, element, position },
      modifiers: {}
    } as unknown as ShikitorInputEvent)

    listener?.(inputEvent('mousemove', 'gutter'))
    listener?.(inputEvent('mousemove'))
    listener?.(inputEvent('mousemove'))
    expect(onHover).toHaveBeenCalledOnce()
    expect(emit).toHaveBeenCalledOnce()

    listener?.(inputEvent('mouseleave'))
    listener?.(inputEvent('mousemove'))
    expect(onHover).toHaveBeenCalledTimes(2)

    cleanup()
    expect(disposeSubscription).toHaveBeenCalledOnce()
  })
})
