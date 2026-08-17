import type { SyntaxWorkerProfile } from '@shikitor/core'

export type BenchmarkEngineId =
  | 'codemirror'
  | 'monaco'
  | 'monaco-shiki'
  | 'pierre'
  | 'shikitor-all-dom'
  | 'shikitor-less-dom'
export type BenchmarkPhase = 'edit' | 'load' | 'memory' | 'mount' | 'native' | 'scroll'
export type BenchmarkStatus = 'complete' | 'error' | 'idle' | 'running' | 'unsupported'
export type BenchmarkShikitorMode = 'all-dom' | 'less-dom'
export type BenchmarkSuite = 'diff' | 'editor'
export type BenchmarkTheme = 'dark' | 'light'
export type BenchmarkView = 'split' | 'unified'

export interface BenchmarkConfig {
  changePercent: number
  iterations: number
  lineCount: number
  shikitorMode: BenchmarkShikitorMode
  suite: BenchmarkSuite
  theme: BenchmarkTheme
  view: BenchmarkView
}

export interface BenchmarkDataset {
  changedLines: number
  current: string
  original: string
}

export interface BenchmarkEngineDefinition {
  id: BenchmarkEngineId
  label: string
  note: string
  suites: readonly BenchmarkSuite[]
}

export interface BenchmarkMountContext {
  config: BenchmarkConfig
  container: HTMLElement
  dataset: BenchmarkDataset
}

export interface BenchmarkInstance {
  dispose(): void
  insertText(text: string): Promise<void> | void
  nativeTextarea?: boolean
  readValue?(): string
  readSyntaxProfile?(): SyntaxWorkerProfile | undefined
  replaceValue?(value: string): Promise<void> | void
  renderer?: string
  setSelection?(start: number, end: number): Promise<void> | void
  scrollTo(ratio: number): Promise<void> | void
  waitForFullSyntax?(): Promise<void> | void
  waitForViewportSyntax?(): Promise<void> | void
}

export interface BenchmarkAdapter {
  /** Resolve once the editor shell is visible, focusable and accepts input. */
  mount(context: BenchmarkMountContext): Promise<BenchmarkInstance>
  prepare?(config: BenchmarkConfig): Promise<void> | void
}

export interface BenchmarkResult {
  firstPaintCold?: number
  firstPaintWarm?: number
  firstUsableCold?: number
  fullSyntaxCold?: number
  fullSyntaxWarm?: number
  domNodes?: number
  editP50?: number
  editP95?: number
  engine: BenchmarkEngineId
  error?: string
  memoryDelta?: number
  moduleCached?: boolean
  moduleLoad?: number
  mainThreadBlockingCold?: number
  mainThreadBlockingWarm?: number
  nativeTextarea?: boolean
  replaceValue?: number
  renderer?: string
  sdkDecodedBytes?: number
  sdkEncodedBytes?: number
  sdkResourceCount?: number
  sdkTransferBytes?: number
  selectionUpdate?: number
  shellReadyCold?: number
  shellReadyWarm?: number
  scroll?: number
  status: BenchmarkStatus
  syntaxProfileCold?: SyntaxWorkerProfile
  syntaxProfileWarm?: SyntaxWorkerProfile
  valueRead?: number
  viewportSyntaxCold?: number
  viewportSyntaxWarm?: number
}

export interface BenchmarkProgress {
  completed: number
  engine?: BenchmarkEngineId
  phase?: BenchmarkPhase
  total: number
}

export interface BenchmarkRunOutput {
  config: BenchmarkConfig
  dataset: Pick<BenchmarkDataset, 'changedLines'>
  environment: {
    generatedAt: string
    hardwareConcurrency?: number
    userAgent: string
  }
  results: BenchmarkResult[]
}
