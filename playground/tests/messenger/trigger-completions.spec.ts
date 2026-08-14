import { CompletionItemKind } from '@shikitor/core/plugins/provide-completions'
import { describe, expect, test, vi } from 'vitest'

import triggerCompletions from '../../src/examples/Messenger/plugins/trigger-completions'

describe('messenger trigger completions', () => {
  test('registers and disposes an isolated provider for every trigger', () => {
    const dispose = vi.fn()
    const renderIcon = vi.fn(() => null)
    type CompletionProvider = {
      triggerCharacters?: string[]
      provideCompletionItems(
        rawTextHelper: unknown,
        position: { offset: number }
      ): unknown
    }
    const providers: CompletionProvider[] = []
    const register = vi.fn((_selector: string, provider: CompletionProvider) => {
      providers.push(provider)
      return { dispose }
    })
    const plugin = triggerCompletions as unknown as {
      apply(context: {
        shikitorCompletions: {
          registerCompletionItemProvider: typeof register
        }
      }, options: {
        groups: Array<{
          trigger: '/' | '$' | '#' | '@'
          items: Array<{
            label: string
            kind: CompletionItemKind
            detail: string
            renderIcon?: () => Node | null
          }>
        }>
      }): () => void
    }

    const cleanup = plugin.apply({
      shikitorCompletions: {
        registerCompletionItemProvider: register
      }
    }, {
      groups: [
        {
          trigger: '/',
          items: [{
            label: 'clear',
            kind: CompletionItemKind.Function,
            detail: 'Command'
          }]
        },
        {
          trigger: '$',
          items: [{
            label: 'mem',
            kind: CompletionItemKind.Module,
            detail: 'Skill'
          }]
        },
        {
          trigger: '#',
          items: [{
            label: 'release-prep',
            kind: CompletionItemKind.Reference,
            detail: 'Session'
          }]
        },
        {
          trigger: '@',
          items: [{
            label: 'Shikitor',
            kind: CompletionItemKind.User,
            renderIcon,
            detail: 'User'
          }]
        }
      ]
    })

    expect(register).toHaveBeenCalledTimes(4)
    expect(providers.map(provider => provider.triggerCharacters)).toEqual([
      ['/'], ['$'], ['#'], ['@']
    ])

    const slashProvider = providers[0]
    expect(slashProvider.provideCompletionItems({}, { offset: 1 })).toEqual({
      suggestions: [{
        label: 'clear',
        kind: CompletionItemKind.Function,
        renderIcon: undefined,
        detail: 'Command',
        documentation: undefined,
        range: { start: 0, end: 0 },
        insertText: '/clear'
      }]
    })

    const mentionProvider = providers[3]
    const mentionResult = mentionProvider.provideCompletionItems({}, { offset: 1 }) as {
      suggestions: Array<{ renderIcon?: () => Node | null }>
    }
    expect(mentionResult.suggestions[0].renderIcon).toBe(renderIcon)

    cleanup()
    expect(dispose).toHaveBeenCalledTimes(4)
  })
})
