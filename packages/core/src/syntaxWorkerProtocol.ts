import type { BundledLanguage, BundledTheme } from 'shiki'

import type { TokenSnapshot, TokenizedLine } from './creator/controlled/tokenSnapshot'

export type SyntaxWorkerLine = Pick<TokenizedLine, 'tokenized' | 'tokens'>

export interface SyntaxWorkerTiming {
  serializedLines: number
  serializeMs: number
  setupMs: number
  tokenizeMs: number
  workerMs: number
}

export interface SyntaxWorkerSnapshot {
  changedFrom: number
  complete: boolean
  lineCount: number
  lineOffset: number
  lines: SyntaxWorkerLine[]
  theme: TokenSnapshot['theme']
  timing: SyntaxWorkerTiming
}

export type SyntaxWorkerCommand =
  | {
      id: number
      language: BundledLanguage
      theme: BundledTheme
      type: 'preload'
    }
  | {
      id: number
      language: BundledLanguage
      sessionId: string
      theme: BundledTheme
      type: 'seed'
      value: string
    }
  | {
      id: number
      language: BundledLanguage
      sessionId: string
      theme: BundledTheme
      type: 'tokenize'
      value: string
      viewportLines?: number
    }
  | { id: number, type: 'reset' }
  | { sessionId: string, type: 'dispose-session' }

export type SyntaxWorkerEvent =
  | { id: number, snapshot: SyntaxWorkerSnapshot, type: 'complete' }
  | { id: number, snapshot: SyntaxWorkerSnapshot, type: 'viewport' }
  | { id: number, type: 'ready' }
  | { error: string, id: number, type: 'error' }
