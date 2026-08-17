import type { BundledLanguage, BundledTheme } from 'shiki'

import { tokenizeColdDocument } from './coldDocumentTokenizer'
import { createDocumentLines } from './documentLines'
import type { DocumentLines } from './documentLines'
import { getSharedHighlighter } from './sharedHighlighter'
import type { SharedHighlighter } from './sharedHighlighter'
import { getSharedTokenSnapshot, setSharedTokenSnapshot } from './sharedTokenSnapshot'
import type {
  TokenizedLine,
  TokenizeOptions,
  TokenSnapshot
} from './tokenSnapshot'
import {
  blockIsUnchanged,
  findCheckpoint,
  findFirstChangedLine,
  findNextCheckpoint,
  grammarStatesEqual,
  yieldToMain
} from './tokenizationUtils'

const DEFAULT_BLOCK_SIZE = 64

function createSnapshot(
  changedFrom: number,
  complete: boolean,
  lines: TokenizedLine[],
  theme: TokenSnapshot['theme'],
  document: DocumentLines,
  lineOffset = 0
): TokenSnapshot {
  return {
    changedFrom,
    complete,
    document,
    lineCount: document.lineCount,
    lineOffset,
    lines,
    theme
  }
}

export function createIncrementalHighlighter() {
  let cacheKey = ''
  let cachedLines: TokenizedLine[] = []

  async function tokenize(
    value: string,
    theme: BundledTheme,
    language: BundledLanguage,
    isCurrent: () => boolean,
    options: TokenizeOptions = {}
  ): Promise<TokenSnapshot | undefined> {
    if (!isCurrent()) return undefined
    const nextKey = `${theme}\0${language}`
    const sharedSnapshot = getSharedTokenSnapshot(value, theme, language)
    if (!cachedLines.length && sharedSnapshot) {
      cacheKey = nextKey
      cachedLines = sharedSnapshot.lines
      return {
        changedFrom: 0,
        complete: true,
        document: options.document ?? createDocumentLines(value),
        lineCount: sharedSnapshot.lines.length,
        lineOffset: 0,
        lines: cachedLines,
        theme: sharedSnapshot.themeRegistration
      }
    }

    const highlighterStarted = performance.now()
    const highlighter = await getSharedHighlighter(theme, language)
    options.onHighlighterReady?.(performance.now() - highlighterStarted)
    if (!isCurrent()) return undefined
    const document = options.document?.value === value
      ? options.document
      : createDocumentLines(value)
    const previous = cacheKey === nextKey ? cachedLines : []
    const firstChanged = findFirstChangedLine(previous, document)
    const changedFrom = findCheckpoint(previous, firstChanged)
    let lines: TokenizedLine[] = previous.length
      ? previous.slice(0, changedFrom)
      : []
    let state = previous[changedFrom]?.inputState ?? lines.at(-1)?.outputState

    if (!previous.length) {
      const initial = await tokenizeColdDocument({
        document,
        highlighter,
        isCurrent,
        language,
        options,
        theme
      })
      if (!initial) return undefined
      lines = initial
    }

    const incrementalStart = previous.length ? changedFrom : document.lineCount
    for (let index = incrementalStart; index < document.lineCount; index++) {
      if (!isCurrent()) return undefined
      const source = document.lineAt(index)
      const cached = previous[index]
      const nextCheckpoint = findNextCheckpoint(previous, index)
      if (
        cached?.checkpoint
        && grammarStatesEqual(state, cached.inputState)
        && blockIsUnchanged(previous, document, index, nextCheckpoint)
      ) {
        const block = previous.slice(index, nextCheckpoint)
        lines.push(...block)
        state = block.at(-1)?.outputState
        index = nextCheckpoint - 1
        continue
      }
      const tokenLines = highlighter.codeToTokensBase(source, {
        grammarState: state,
        lang: language,
        theme
      })
      const outputState = highlighter.getLastGrammarState(tokenLines)
      lines.push({
        checkpoint: true,
        inputState: state,
        outputState,
        source,
        tokenized: true,
        tokens: tokenLines[0] ?? []
      })
      state = outputState
      if (
        index < document.lineCount - 1
        && (index - incrementalStart + 1) % DEFAULT_BLOCK_SIZE === 0
      ) {
        await yieldToMain()
        if (!isCurrent()) return undefined
      }
    }
    if (!isCurrent()) return undefined
    cacheKey = nextKey
    cachedLines = lines
    const snapshot = createSnapshot(
      changedFrom,
      true,
      lines,
      highlighter.getTheme(theme),
      document
    )
    setSharedTokenSnapshot({
      language,
      lines,
      source: value,
      theme,
      themeRegistration: snapshot.theme
    })
    return snapshot
  }

  return {
    async codeToHtml(
      value: string,
      theme: BundledTheme,
      language: BundledLanguage,
      options: Parameters<SharedHighlighter['codeToHtml']>[1],
      isCurrent: () => boolean
    ) {
      const highlighter = await getSharedHighlighter(theme, language)
      if (!isCurrent()) return undefined
      return highlighter.codeToHtml(value, options)
    },
    dispose() {
      cacheKey = ''
      cachedLines = []
    },
    tokenize
  }
}
