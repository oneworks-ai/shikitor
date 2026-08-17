import { createBundledHighlighter } from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import { bundledLanguages } from 'shiki/langs'
import type { BundledLanguage } from 'shiki/langs'
import { bundledThemes } from 'shiki/themes'
import type { BundledTheme } from 'shiki/themes'

const createHighlighter = createBundledHighlighter({
  engine: createJavaScriptRegexEngine,
  langs: bundledLanguages,
  themes: bundledThemes
})

export type SharedHighlighter = Awaited<ReturnType<typeof createHighlighter>>

let sharedHighlighter: ReturnType<typeof createHighlighter> | undefined
let loadQueue = Promise.resolve()
const warmedSyntax = new Set<string>()

function getHighlighter(theme: BundledTheme, language: BundledLanguage) {
  if (!sharedHighlighter) {
    const pending = createHighlighter({
      langs: [language],
      themes: [theme]
    })
    sharedHighlighter = pending
    void pending.catch(() => {
      if (sharedHighlighter === pending) sharedHighlighter = undefined
    })
  }
  return sharedHighlighter
}

export async function getSharedHighlighter(
  theme: BundledTheme,
  language: BundledLanguage
) {
  const highlighter = await getHighlighter(theme, language)
  loadQueue = loadQueue.catch(() => {}).then(async () => {
    if (!highlighter.getLoadedLanguages().includes(language)) {
      await highlighter.loadLanguage(language)
    }
    if (!highlighter.getLoadedThemes().includes(theme)) {
      await highlighter.loadTheme(theme)
    }
  })
  await loadQueue
  return highlighter
}

export async function prewarmSharedHighlighter(
  theme: BundledTheme,
  language: BundledLanguage
) {
  const highlighter = await getSharedHighlighter(theme, language)
  const key = `${theme}\0${language}`
  if (warmedSyntax.has(key)) return highlighter
  highlighter.codeToTokensBase('const shikitorWarmup: string = "ready"', {
    lang: language,
    theme
  })
  warmedSyntax.add(key)
  return highlighter
}

export async function disposeSharedHighlighter() {
  const pending = sharedHighlighter
  sharedHighlighter = undefined
  loadQueue = Promise.resolve()
  warmedSyntax.clear()
  if (!pending) return
  const highlighter = await pending.catch(() => undefined)
  highlighter?.dispose()
}
