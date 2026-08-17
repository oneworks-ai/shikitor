import type { BundledLanguage, BundledTheme } from 'shiki'

import type { DocumentLines } from './documentLines'
import type { SharedHighlighter } from './sharedHighlighter'
import type { TokenizedLine, TokenizeOptions } from './tokenSnapshot'
import { shouldYield, yieldToMain } from './tokenizationUtils'

const DEFAULT_BLOCK_SIZE = 64
const SMALL_DOCUMENT_LINES = 128

interface ColdDocumentOptions {
  document: DocumentLines
  highlighter: SharedHighlighter
  isCurrent(): boolean
  language: BundledLanguage
  options: TokenizeOptions
  theme: BundledTheme
}

export async function tokenizeColdDocument({
  document,
  highlighter,
  isCurrent,
  language,
  options,
  theme
}: ColdDocumentOptions): Promise<TokenizedLine[] | undefined> {
  const lines: TokenizedLine[] = []
  const progressive = document.lineCount > SMALL_DOCUMENT_LINES
  const backgroundBlockSize = !progressive
    ? 1
    : options.batchSize ?? DEFAULT_BLOCK_SIZE
  const viewportLines = Math.min(
    document.lineCount,
    progressive ? options.viewportLines ?? DEFAULT_BLOCK_SIZE : 1
  )
  let state: TokenizedLine['outputState']
  let yieldedAt = performance.now()
  for (let start = 0; start < document.lineCount;) {
    if (!isCurrent()) return undefined
    const blockSize = start === 0 ? viewportLines : backgroundBlockSize
    const end = Math.min(document.lineCount, start + blockSize)
    const blockSources = Array.from(
      { length: end - start },
      (_, index) => document.lineAt(start + index)
    )
    const tokenLines = highlighter.codeToTokensBase(blockSources.join('\n'), {
      grammarState: state,
      lang: language,
      theme
    })
    const outputState = highlighter.getLastGrammarState(tokenLines)
    let blockLineOffset = 0
    for (let index = start; index < end; index++) {
      const source = blockSources[index - start]
      lines[index] = {
        checkpoint: index === start,
        inputState: index === start ? state : undefined,
        outputState: index === end - 1 ? outputState : undefined,
        source,
        tokenized: true,
        tokens: (tokenLines[index - start] ?? []).map(token => ({
          ...token,
          offset: token.offset - blockLineOffset
        }))
      }
      blockLineOffset += source.length + 1
    }
    state = outputState
    if (progressive && start === 0 && end < document.lineCount) {
      options.onViewportReady?.({
        changedFrom: 0,
        complete: false,
        document,
        lineCount: document.lineCount,
        lineOffset: 0,
        lines: lines.slice(0, end),
        theme: highlighter.getTheme(theme)
      })
    }
    if (
      end < document.lineCount
      && (
        (progressive && start === 0)
        || shouldYield(yieldedAt, options.yieldBudgetMs)
      )
    ) {
      await yieldToMain()
      if (!isCurrent()) return undefined
      yieldedAt = performance.now()
    }
    start = end
  }
  return lines
}
