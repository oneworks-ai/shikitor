import { afterEach, describe, expect, test, vi } from 'vitest'

import { createReplyTimerRegistry } from '../../src/examples/Messenger/plugins/reply-timers'

describe('messenger reply timers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('cancels pending replies for only the cleared room', () => {
    vi.useFakeTimers()
    const registry = createReplyTimerRegistry()
    const documentationReply = vi.fn()
    const releaseReply = vi.fn()

    registry.schedule('documentation', documentationReply, 350)
    registry.schedule('release-prep', releaseReply, 350)
    registry.cancel('documentation')
    vi.advanceTimersByTime(350)

    expect(documentationReply).not.toHaveBeenCalled()
    expect(releaseReply).toHaveBeenCalledOnce()
    registry.dispose()
  })

  test('cancels every pending reply when disposed', () => {
    vi.useFakeTimers()
    const registry = createReplyTimerRegistry()
    const reply = vi.fn()

    registry.schedule('documentation', reply, 350)
    registry.schedule('documentation', reply, 350)
    registry.dispose()
    vi.advanceTimersByTime(350)

    expect(reply).not.toHaveBeenCalled()
  })
})
