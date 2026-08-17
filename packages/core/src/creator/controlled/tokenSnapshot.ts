import type {
  GrammarState,
  ThemedToken,
  ThemeRegistrationResolved
} from '@shikijs/types'

import type { DocumentLines } from './documentLines'

export interface TokenizedLine {
  checkpoint?: boolean
  inputState?: GrammarState
  outputState?: GrammarState
  source: string
  tokenized?: boolean
  tokens: ThemedToken[]
}

export interface SyntaxWorkerPhaseProfile {
  /** Main/worker message delivery and worker scheduling not spent tokenizing or serializing. */
  bridgeMs: number
  /** Main-thread reconstruction of source lines and snapshot state. */
  hydrateMs: number
  serializedLines: number
  /** Worker-side conversion into the structured-clone payload. */
  serializeMs: number
  /** Worker time spent loading the syntax engine, grammar and theme. */
  setupMs: number
  /** Worker wall time after syntax setup through this milestone. */
  tokenizeMs: number
  /** Worker wall time from request receipt through syntax work for this milestone. */
  workerMs: number
}

export interface SyntaxWorkerProfile {
  cacheHit?: boolean
  complete?: SyntaxWorkerPhaseProfile
  viewport?: SyntaxWorkerPhaseProfile
}

export interface TokenSnapshot {
  changedFrom: number
  complete: boolean
  document: DocumentLines
  lineCount: number
  lineOffset: number
  lines: TokenizedLine[]
  syntaxWorkerProfile?: SyntaxWorkerProfile
  theme: ThemeRegistrationResolved
}

export interface TokenizeOptions {
  /** Number of lines processed per background batch. */
  batchSize?: number
  /** Shared main-thread document index used by renderers and worker hydration. */
  document?: DocumentLines
  onHighlighterReady?(duration: number): void
  onViewportReady?(snapshot: TokenSnapshot): void
  /** Number of lines required before the first viewport snapshot. */
  viewportLines?: number
  /** Main-thread time slice before yielding to browser work. */
  yieldBudgetMs?: number
}

export function tokenizedLineAt(snapshot: TokenSnapshot, index: number) {
  return snapshot.lines[index - snapshot.lineOffset]
}
