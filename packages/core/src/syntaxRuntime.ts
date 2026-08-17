import type { BundledLanguage, BundledTheme } from 'shiki'

import {
  disposeSharedHighlighter,
  prewarmSharedHighlighter
} from './creator/controlled/sharedHighlighter'
import { clearSharedTokenSnapshots } from './creator/controlled/sharedTokenSnapshot'

export interface PrepareShikitorSyntaxOptions {
  language: BundledLanguage
  /** Execute one representative token pass after loading the grammar. */
  prewarm?: boolean
  reset?: boolean
  theme: BundledTheme
}

/** Optionally reset and prewarm the shared main-thread syntax lane. */
export async function prepareShikitorSyntax({
  language,
  prewarm = true,
  reset = false,
  theme
}: PrepareShikitorSyntaxOptions) {
  if (reset) {
    clearSharedTokenSnapshots()
    await disposeSharedHighlighter()
  }
  if (prewarm) await prewarmSharedHighlighter(theme, language)
}
