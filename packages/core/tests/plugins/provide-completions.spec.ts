import { describe, expect, it, vi } from 'vitest'
import { proxy } from 'valtio/vanilla'

import { Context } from '../../src/context'
import type { Shikitor } from '../../src/editor'
import type { ShikitorPopupService } from '../../src/plugins/provide-popup'
import {
  mountCompletionItemIcon,
  default as provideCompletions,
  resolveCompletionInputKeyword
} from '../../src/plugins/provide-completions'
import { getRawTextHelper } from '../../src/utils/getRawTextHelper'

class ResidentTextarea extends EventTarget {
  value = ''
  selectionStart = 0
  selectionEnd = 0
  readonly add = vi.fn(super.addEventListener.bind(this))
  readonly remove = vi.fn(super.removeEventListener.bind(this))

  override addEventListener(...args: Parameters<EventTarget['addEventListener']>) {
    this.add(...args)
  }

  override removeEventListener(...args: Parameters<EventTarget['removeEventListener']>) {
    this.remove(...args)
  }
}

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

  it('uses and cleans the resident textarea when Shikitor is attached', async () => {
    const context = new Context()
    const input = new ResidentTextarea()
    const rawTextHelper = getRawTextHelper('')
    const querySelector = vi.fn(() => null)
    const shikitor = {
      element: { querySelector },
      inputElement: input,
      value: '',
      cursor: rawTextHelper.resolvePosition(0),
      rawTextHelper,
      optionsRef: proxy({
        current: {
          cursor: rawTextHelper.resolvePosition(0),
          language: 'markdown'
        }
      }),
      focus: vi.fn()
    } as unknown as Shikitor
    const popupDispose = vi.fn()
    const popup = {
      registerPopupProvider: vi.fn(() => ({ dispose: popupDispose }))
    } as unknown as ShikitorPopupService
    context.provide('shikitor', shikitor)
    context.provide('shikitorPopup', popup)

    const fiber = await context.plugin(provideCompletions)
    const provider = vi.fn(() => ({ suggestions: [] }))
    context.shikitorCompletions.registerCompletionItemProvider('*', {
      triggerCharacters: ['$'],
      provideCompletionItems: provider
    })

    input.value = '$'
    input.selectionStart = 1
    input.selectionEnd = 1
    input.dispatchEvent(new Event('input'))
    await vi.waitFor(() => expect(provider).toHaveBeenCalled())

    expect(querySelector).not.toHaveBeenCalled()
    expect(input.add).toHaveBeenCalledTimes(2)

    await fiber.dispose()
    expect(input.remove).toHaveBeenCalledTimes(2)
    expect(popupDispose).toHaveBeenCalledOnce()
  })
})
