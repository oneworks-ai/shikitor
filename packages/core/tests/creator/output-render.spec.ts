import type { DecorationItem } from '@shikijs/types'
import { transformerRenderWhitespace } from '@shikijs/transformers'
import { createHighlighter } from 'shiki'
import { describe, expect, test, vi } from 'vitest'

import {
  canVirtualizeAllDom,
  createLatestRenderController,
  normalizeDecorations,
  normalizeInlineReplacementDecorations,
  resolveVisualScrollLeft,
  selectRenderMode
} from '../../src/creator/controlled/outputRenderControlled'
import { resolveContentOffsetTop } from '../../src/creator/controlled/outputView'
import { resolveVirtualLineRange } from '../../src/creator/controlled/virtualViewport'

describe('output rendering', () => {
  test('selects less DOM only for capable non-projected editors', () => {
    expect(selectRenderMode({ capable: true, needsProjection: false })).toBe('less-dom')
    expect(selectRenderMode({
      capable: true,
      needsProjection: false,
      requested: 'all-dom'
    })).toBe('all-dom')
    expect(selectRenderMode({
      capable: false,
      needsProjection: false,
      requested: 'less-dom'
    })).toBe('all-dom')
    expect(selectRenderMode({
      capable: true,
      needsProjection: true,
      requested: 'less-dom'
    })).toBe('all-dom')
  })

  test('virtualizes all DOM only when no projection feature owns line DOM', () => {
    expect(canVirtualizeAllDom({})).toBe(true)
    expect(canVirtualizeAllDom({
      decorations: [{ start: 0, end: 1, properties: {} }]
    })).toBe(false)
    expect(canVirtualizeAllDom({
      highlights: [{ color: 'gold', lines: [2, { start: 4, end: 6 }] }]
    })).toBe(true)
    expect(canVirtualizeAllDom({
      highlights: [{ color: 'gold', ranges: [{ start: 0, end: 1 }] }]
    })).toBe(false)
    expect(canVirtualizeAllDom({
      inlineReplacements: [{ start: 0, end: 1 }]
    })).toBe(false)
    expect(canVirtualizeAllDom({ plugins: [{} as never] })).toBe(false)
  })

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
    const highlighter = await createHighlighter({
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

  test('publishes progressive renders without allowing stale commits', async () => {
    const commits: string[] = []
    const controller = createLatestRenderController<string, string>({
      renderFallback: vi.fn(),
      renderAsync: async (input, _isCurrent, publish) => {
        publish(`${input} viewport`)
        return `${input} complete`
      },
      commit: output => commits.push(output)
    })

    await controller.render('current')

    expect(commits).toEqual(['current viewport', 'current complete'])
  })

  test('resolves an overscanned viewport without scaling with document length', () => {
    vi.stubGlobal('getComputedStyle', () => (
      { lineHeight: '22px' } as CSSStyleDeclaration
    ))
    const input = { clientHeight: 44, scrollTop: 220 } as HTMLTextAreaElement

    expect(resolveVirtualLineRange(input, 5000, 2)).toEqual({
      end: 15,
      lineHeight: 22,
      start: 8
    })
    vi.unstubAllGlobals()
  })

  test('aligns less DOM current-line paint to the padded content origin', () => {
    const input = {
      parentElement: { offsetTop: 12 }
    } as unknown as HTMLTextAreaElement

    expect(resolveContentOffsetTop(input)).toBe(12)
    expect(resolveContentOffsetTop({} as HTMLTextAreaElement)).toBe(0)
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
