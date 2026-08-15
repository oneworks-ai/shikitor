import type { DecorationItem } from '@shikijs/core'
import { transformerRenderWhitespace } from '@shikijs/transformers'
import { getHighlighter } from 'shiki'
import { describe, expect, test, vi } from 'vitest'

import {
  createLatestRenderController,
  normalizeDecorations,
  normalizeInlineReplacementDecorations,
  resolveVisualScrollLeft
} from '../../src/creator/controlled/outputRenderControlled'

describe('output rendering', () => {
  test('keeps a wider visual transform authoritative over native input scrolling', () => {
    expect(resolveVisualScrollLeft(20, '808px')).toBe(808)
    expect(resolveVisualScrollLeft(20, '')).toBe(20)
    expect(resolveVisualScrollLeft(20, 'not-a-number')).toBe(20)
  })

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

  test('normalizes inline replacements into measurable visual slots', () => {
    expect(normalizeInlineReplacementDecorations('#room', [{
      start: 0,
      end: 1,
      inlineSize: '1em',
      properties: {
        class: 'room-marker',
        'data-icon': 'forum'
      }
    }])).toEqual([{
      start: 0,
      end: 1,
      alwaysWrap: true,
      properties: {
        class: 'room-marker shikitor-inline-replacement',
        style: '--shikitor-inline-replacement-size:1em',
        'data-icon': 'forum',
        'data-shikitor-inline-replacement': '0',
        'data-shikitor-source-start': '0',
        'data-shikitor-source-end': '1',
        'data-shikitor-source-text': '#'
      }
    }])
  })

  test('publishes atomic interaction and an independent block size', () => {
    expect(normalizeInlineReplacementDecorations('[$mem](skill://mem)', [{
      start: 0,
      end: 19,
      inlineSize: 'calc(1em + 4ch)',
      blockSize: '1em',
      interaction: 'atomic'
    }])).toEqual([{
      start: 0,
      end: 19,
      alwaysWrap: true,
      properties: {
        class: 'shikitor-inline-replacement',
        style: '--shikitor-inline-replacement-size:calc(1em + 4ch);--shikitor-inline-replacement-block-size:1em',
        'data-shikitor-inline-replacement': '0',
        'data-shikitor-inline-replacement-interaction': 'atomic',
        'data-shikitor-source-start': '0',
        'data-shikitor-source-end': '19',
        'data-shikitor-source-text': '[$mem](skill://mem)'
      }
    }])
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
