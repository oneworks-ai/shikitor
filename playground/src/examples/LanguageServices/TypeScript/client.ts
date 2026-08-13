export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'

export interface LanguageDiagnostic {
  code: number
  severity: DiagnosticSeverity
  message: string
  start: number
  length: number
  line: number
  character: number
}

export interface LanguageHover {
  start: number
  length: number
  signature: string
  documentation?: string
}

export interface LanguageCompletion {
  label: string
  kind: string
  detail?: string
  insertText?: string
}

export interface LanguageServiceSnapshot {
  diagnostics: LanguageDiagnostic[]
  hover?: LanguageHover
  completions: LanguageCompletion[]
  documentVersion: number
  runtimeVersion: string
}

/**
 * Transport-neutral language intelligence used by the Cordis plugin.
 * A browser TypeScript adapter powers this demo; a Worker or JSON-RPC LSP
 * client can implement the same boundary without changing Shikitor.
 */
export interface LanguageServiceClient extends Disposable {
  readonly languageId: string
  readonly runtimeVersion: string
  updateDocument(value: string): void
  getDiagnostics(): LanguageDiagnostic[]
  getHover(position: number): LanguageHover | undefined
  getCompletions(position: number, limit?: number): LanguageCompletion[]
  inspect(position: number): LanguageServiceSnapshot
}
