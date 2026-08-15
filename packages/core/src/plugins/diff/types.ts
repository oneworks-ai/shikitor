export type ShikitorDiffView = 'split' | 'unified'
export type ShikitorDiffInlineMode = 'character' | 'none' | 'word'

export interface ShikitorDiffInlineRange {
  start: number
  end: number
}

export type ShikitorDiffRowKind = 'added' | 'context' | 'modified' | 'removed'

export interface ShikitorDiffRow {
  kind: ShikitorDiffRowKind
  hunkId?: string
  oldLine?: number
  newLine?: number
  oldText?: string
  newText?: string
  oldInline: ShikitorDiffInlineRange[]
  newInline: ShikitorDiffInlineRange[]
}

export interface ShikitorDiffHunk {
  id: string
  oldStart: number
  oldEnd: number
  newStart: number
  newEnd: number
  oldLines: string[]
  newLines: string[]
  rows: ShikitorDiffRow[]
}

export interface ShikitorDiffStats {
  additions: number
  deletions: number
  hunks: number
}

export interface ShikitorDiffModel {
  original: string
  current: string
  rows: ShikitorDiffRow[]
  hunks: ShikitorDiffHunk[]
  stats: ShikitorDiffStats
  identical: boolean
  truncated: boolean
}

export interface ShikitorDiffComputeOptions {
  inline?: ShikitorDiffInlineMode
  maxEditLength?: number
  timeout?: number
}

export interface ShikitorDiffHunkActionLabels {
  accept?: string
  reject?: string
}

export interface ShikitorDiffCollapseUnchangedOptions {
  /** Visible unchanged lines retained next to each change. @default 2 */
  context?: number
  /** Minimum number of hidden lines needed to create a fold. @default 6 */
  minimum?: number
  collapseLabel?: string
  expandLabel?: string
  label?(count: number): string
}

export interface ShikitorDiffOptions extends ShikitorDiffComputeOptions {
  original: string
  view?: ShikitorDiffView
  hunkActions?: boolean | ShikitorDiffHunkActionLabels
  collapseUnchanged?: boolean | ShikitorDiffCollapseUnchangedOptions
  onDiffChange?(model: ShikitorDiffModel): void
  onHunkAction?(action: 'accept' | 'reject', hunk: ShikitorDiffHunk): void
}

export interface ShikitorDiffController {
  readonly model: ShikitorDiffModel
  readonly original: string
  readonly view: ShikitorDiffView
  setOriginal(value: string): void
  setView(view: ShikitorDiffView): void
  refresh(): void
  acceptHunk(id: string): Promise<void>
  rejectHunk(id: string): Promise<void>
  acceptAll(): void
  rejectAll(): Promise<void>
}
