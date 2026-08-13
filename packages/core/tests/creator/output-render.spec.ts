import type { DecorationItem } from '@shikijs/core'
import { transformerRenderWhitespace } from '@shikijs/transformers'
import { getHighlighter } from 'shiki'
import { describe, expect, test, vi } from 'vitest'

import {
  createLatestRenderController,
  normalizeDecorations
} from '../../src/creator/controlled/outputRenderControlled'

describe('output rendering', () => {
  test('drops stale decoration offsets and splits ranges at newlines', () => {
    const properties = { class: 'selection' }
    const decorations: DecorationItem[] = [
      { start: 0, end: 7, properties },
      { start: 3, end: 4, properties },
      { start: { line: 1, character: 0 }, end: { line: 1, character: 3 }, properties },
      { start: 20, end: 21, properties }
    ]

    expect(normalizeDecorations('abc\ndef', decorations)).toEqual([
      { start: 0, end: 3, properties },
      { start: 4, end: 7, properties },
      { start: 4, end: 7, properties }
    ])
    expect(normalizeDecorations('', decorations)).toBeUndefined()
    expect(normalizeDecorations('abc', [])).toBeUndefined()
  })

  test('keeps whitespace rendering safe for a multi-line decoration', async () => {
    const highlighter = await getHighlighter({
      themes: ['github-dark'],
      langs: ['typescript']
    })
    const value = 'const first = 1\nconst second = 2'
    const decorations = normalizeDecorations(value, [{
      start: 0,
      end: value.length,
      properties: { class: 'selection' }
    }])

    expect(() => highlighter.codeToHtml(value, {
      lang: 'typescript',
      theme: 'github-dark',
      decorations,
      transformers: [transformerRenderWhitespace()]
    })).not.toThrow()
    highlighter.dispose()
  })

  test('only commits the latest asynchronous render', async () => {
    const pending = new Map<string, ReturnType<typeof Promise.withResolvers<string>>>()
    const fallbacks: string[] = []
    const commits: string[] = []
    const controller = createLatestRenderController<string, string>({
      renderFallback: input => fallbacks.push(input),
      renderAsync: async input => {
        const deferred = Promise.withResolvers<string>()
        pending.set(input, deferred)
        return deferred.promise
      },
      commit: output => commits.push(output)
    })

    const first = controller.render('first')
    const second = controller.render('second')
    pending.get('second')!.resolve('second highlighted')
    await second
    pending.get('first')!.resolve('first highlighted')
    await first

    expect(fallbacks).toEqual(['first', 'second'])
    expect(commits).toEqual(['second highlighted'])
  })

  test('keeps the fallback on errors and after disposal', async () => {
    const commit = vi.fn()
    const onError = vi.fn()
    const deferred = Promise.withResolvers<string>()
    const controller = createLatestRenderController<string, string>({
      renderFallback: vi.fn(),
      renderAsync: input => input === 'error'
        ? Promise.reject(new Error('highlight failed'))
        : deferred.promise,
      commit,
      onError
    })

    await controller.render('error')
    expect(onError).toHaveBeenCalledOnce()
    expect(commit).not.toHaveBeenCalled()

    const pendingRender = controller.render('pending')
    controller.dispose()
    deferred.resolve('late highlight')
    await pendingRender
    expect(commit).not.toHaveBeenCalled()
  })
})
