import { describe, expect, it, vi } from 'vitest'

import {
  mountCompletionItemIcon,
  resolveCompletionInputKeyword
} from '../../src/plugins/provide-completions'

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

describe('completion keyword synchronization', () => {
  it('derives filtering text from the authoritative input value', () => {
    expect(resolveCompletionInputKeyword('$m', 2, 1)).toBe('m')
    expect(resolveCompletionInputKeyword('use $mem', 8, 5)).toBe('mem')
  })

  it('closes an active query when the caret or line leaves its trigger', () => {
    expect(resolveCompletionInputKeyword('$mem', 0, 1)).toBeUndefined()
    expect(resolveCompletionInputKeyword('$mem\nnext', 9, 1)).toBeUndefined()
    expect(resolveCompletionInputKeyword('$mem', 8, 1)).toBeUndefined()
  })
})
