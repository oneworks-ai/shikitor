import { afterEach, describe, expect, test } from 'vitest'
import { createHighlighter } from 'shiki'

import {
  disposeSharedHighlighter,
  getSharedHighlighter,
  prewarmSharedHighlighter
} from '../../src/creator/controlled/sharedHighlighter'

afterEach(() => disposeSharedHighlighter())

describe('shared highlighter', () => {
  test('reuses one engine while loading requested languages and themes', async () => {
    const light = await getSharedHighlighter('github-light', 'typescript')
    const dark = await getSharedHighlighter('github-dark', 'typescript')

    expect(dark).toBe(light)
    expect(dark.getLoadedLanguages()).toContain('typescript')
    expect(dark.getLoadedThemes()).toEqual(expect.arrayContaining([
      'github-light',
      'github-dark'
    ]))
  })

  test('matches the default engine for representative TypeScript grammar', async () => {
    const dollar = '$'
    const source = [
      'const matcher = /shiki(?:tor)?/gi',
      `const message = \`value: ${dollar}{matcher.source}\``,
      '/* multiline',
      '   comment */'
    ].join('\n')
    const javascriptEngine = await getSharedHighlighter(
      'github-light',
      'typescript'
    )
    const defaultEngine = await createHighlighter({
      langs: ['typescript'],
      themes: ['github-light']
    })

    try {
      expect(javascriptEngine.codeToTokensBase(source, {
        lang: 'typescript',
        theme: 'github-light'
      })).toEqual(defaultEngine.codeToTokensBase(source, {
        lang: 'typescript',
        theme: 'github-light'
      }))
    } finally {
      defaultEngine.dispose()
    }
  })

  test('prewarms the loaded grammar without replacing the shared engine', async () => {
    const loaded = await getSharedHighlighter('github-light', 'typescript')
    const warmed = await prewarmSharedHighlighter('github-light', 'typescript')
    const repeated = await prewarmSharedHighlighter('github-light', 'typescript')

    expect(warmed).toBe(loaded)
    expect(repeated).toBe(loaded)
  })
})
