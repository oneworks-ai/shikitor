import { describe, expect, it, vi } from 'vitest'

import { mountCompletionItemIcon } from '../../src/plugins/provide-completions'

describe('completion item custom icons', () => {
  it('mounts an image or svg node returned by the consumer', () => {
    const node = { nodeName: 'svg' } as unknown as Node
    const replaceChildren = vi.fn()
    const target = { replaceChildren } as unknown as HTMLElement

    expect(mountCompletionItemIcon(target, () => node)).toBe(true)
    expect(replaceChildren).toHaveBeenCalledWith(node)
  })

  it('keeps the kind fallback when a renderer fails', () => {
    const replaceChildren = vi.fn()
    const target = { replaceChildren } as unknown as HTMLElement

    expect(mountCompletionItemIcon(target, () => {
      throw new Error('broken consumer icon')
    })).toBe(false)
    expect(replaceChildren).not.toHaveBeenCalled()
  })
})
