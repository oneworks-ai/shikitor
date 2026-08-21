import type { TokenSnapshot } from '@shikitor/core'
import {
  createDocumentLines,
  createIncrementalHighlighter,
  createTokenLine,
  tokenizedLineAt
} from '@shikitor/core'
import type { BundledLanguage, BundledTheme } from 'shiki'

export interface DiffOriginalLines {
  /** Fresh, detached element for a one-based original line, if tokenized. */
  clone(line: number): HTMLElement | undefined
  readonly lineCount: number
}

const EMPTY_LINES: DiffOriginalLines = { clone: () => undefined, lineCount: 0 }

/**
 * Tokenizes the diff baseline with the editor's shared Shiki engine instead of
 * a private highlighter. The incremental tokenizer reuses unchanged blocks when
 * the baseline changes through hunk actions, and line elements are built on
 * demand so a 5,000-line baseline does not materialize 5,000 cloned lines.
 */
export class DiffSyntaxRenderer {
  private highlighter = createIncrementalHighlighter()
  private version = 0
  private snapshot?: TokenSnapshot
  private elements = new Map<number, HTMLElement>()

  get lines(): DiffOriginalLines {
    const snapshot = this.snapshot
    if (!snapshot) return EMPTY_LINES
    const elements = this.elements
    return {
      lineCount: snapshot.lineCount,
      clone: line => {
        const index = line - 1
        let element = elements.get(index)
        if (!element) {
          const tokenized = tokenizedLineAt(snapshot, index)
          if (!tokenized) return undefined
          element = createTokenLine(tokenized, index)
          elements.set(index, element)
        }
        return element.cloneNode(true) as HTMLElement
      }
    }
  }

  async render(value: string, theme: string, language: string) {
    const version = ++this.version
    const snapshot = await this.highlighter.tokenize(
      value,
      theme as BundledTheme,
      language as BundledLanguage,
      () => version === this.version,
      { document: createDocumentLines(value) }
    )
    if (!snapshot || version !== this.version) return undefined
    this.snapshot = snapshot
    this.elements = new Map()
    return this.lines
  }

  dispose() {
    this.version++
    this.snapshot = undefined
    this.elements.clear()
    this.highlighter.dispose()
  }
}
