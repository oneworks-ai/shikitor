import type { GrammarState } from '@shikijs/types'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'
import * as monaco from 'monaco-editor'
import { createHighlighter } from 'shiki'

import type { BenchmarkAdapter } from '../types'

type MonacoGlobal = typeof globalThis & {
  MonacoEnvironment?: {
    getWorker(moduleId: string, label: string): Worker
  }
}

interface MonacoTokenization {
  forceTokenization(lineNumber: number): void
  hasAccurateTokensForLine(lineNumber: number): boolean
}

type TokenizedModel = monaco.editor.ITextModel & {
  tokenization: MonacoTokenization
}

const monacoGlobal = globalThis as MonacoGlobal
monacoGlobal.MonacoEnvironment ??= {
  getWorker(_moduleId, label) {
    return label === 'javascript' || label === 'typescript'
      ? new TsWorker()
      : new EditorWorker()
  }
}

const highlighter = createHighlighter({
  langs: ['typescript'],
  themes: ['github-dark', 'github-light']
})

class ShikiTokenizerState implements monaco.languages.IState {
  constructor(readonly grammarState?: GrammarState) {}

  clone() { return new ShikiTokenizerState(this.grammarState) }

  equals(other: monaco.languages.IState) {
    if (!(other instanceof ShikiTokenizerState)) return false
    return (other as ShikiTokenizerState).grammarState === this.grammarState
  }
}

function fontStyle(bits: number) {
  return [
    bits & 1 ? 'italic' : '',
    bits & 2 ? 'bold' : '',
    bits & 4 ? 'underline' : '',
    bits & 8 ? 'strikethrough' : ''
  ].filter(Boolean).join(' ')
}

function normalizeColor(color: string) {
  const value = color.replace(/^#/, '')
  return (value.length === 3 || value.length === 4
    ? [...value].map(channel => channel.repeat(2)).join('')
    : value).toUpperCase()
}

function forceSyntax(model: monaco.editor.ITextModel, lineNumber: number) {
  const tokenization = (model as TokenizedModel).tokenization
  tokenization.forceTokenization(lineNumber)
  if (!tokenization.hasAccurateTokensForLine(lineNumber)) {
    throw new Error(`Monaco Shiki did not tokenize through line ${lineNumber}`)
  }
}

function appendToModel(model: monaco.editor.ITextModel, text: string) {
  const position = model.getPositionAt(model.getValueLength())
  model.applyEdits([{
    range: new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    ),
    text
  }])
}

const adapter: BenchmarkAdapter = {
  async mount({ config, container, dataset }) {
    const shiki = await highlighter
    const shikiTheme = config.theme === 'dark' ? 'github-dark' : 'github-light'
    const monacoTheme = `benchmark-shiki-${shikiTheme}`
    const { colorMap } = shiki.setTheme(shikiTheme)
    const colorIndexes = new Map(
      colorMap.flatMap((color, index) => color
        ? [[color.toLowerCase(), index] as const]
        : [])
    )
    monaco.editor.defineTheme(monacoTheme, {
      base: config.theme === 'dark' ? 'vs-dark' : 'vs',
      colors: {},
      inherit: false,
      rules: colorMap.flatMap((color, index) => color
        ? Array.from({ length: 16 }, (_, style) => ({
            fontStyle: fontStyle(style),
            foreground: normalizeColor(color),
            token: `shiki-${index}-${style}`
          }))
        : [])
    })
    const provider = monaco.languages.setTokensProvider('typescript', {
      getInitialState: () => new ShikiTokenizerState(),
      tokenize(line, state) {
        const tokenizerState = state as ShikiTokenizerState
        if (line.length >= 20_000) {
          return { endState: tokenizerState, tokens: [{ scopes: '', startIndex: 0 }] }
        }
        const tokenLines = shiki.codeToTokensBase(line, {
          grammarState: tokenizerState.grammarState,
          lang: 'typescript',
          theme: shikiTheme
        })
        const tokens = tokenLines[0] ?? []
        return {
          endState: new ShikiTokenizerState(shiki.getLastGrammarState(tokenLines)),
          tokens: tokens.map(token => ({
            scopes: `shiki-${colorIndexes.get(token.color?.toLowerCase() ?? '') ?? 0}-${token.fontStyle ?? 0}`,
            startIndex: token.offset
          }))
        }
      }
    })
    const root = document.createElement('div')
    root.className = 'benchmark-editor-host benchmark-editor-host--monaco'
    container.append(root)
    const editor = monaco.editor.create(root, {
      automaticLayout: true,
      fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, monospace',
      fontSize: 12,
      language: 'typescript',
      lineHeight: 20,
      minimap: { enabled: false },
      overviewRulerLanes: 0,
      renderLineHighlight: 'line',
      scrollBeyondLastLine: false,
      stickyScroll: { enabled: false },
      theme: monacoTheme,
      value: dataset.current,
      wordWrap: 'off'
    })
    const model = editor.getModel()
    if (!model) throw new Error('Monaco Shiki did not create a text model')

    return {
      dispose() {
        editor.dispose()
        model.dispose()
        provider.dispose()
        root.remove()
      },
      insertText(text) { appendToModel(model, text) },
      nativeTextarea: false,
      readValue() { return model.getValue() },
      replaceValue(value) { model.setValue(value) },
      renderer: 'Monaco viewport · Shiki TextMate',
      setSelection(start, end) {
        const startPosition = model.getPositionAt(start)
        const endPosition = model.getPositionAt(end)
        editor.setSelection(new monaco.Selection(
          startPosition.lineNumber,
          startPosition.column,
          endPosition.lineNumber,
          endPosition.column
        ))
      },
      scrollTo(ratio) { editor.setScrollTop(editor.getScrollHeight() * ratio) },
      waitForFullSyntax() { forceSyntax(model, model.getLineCount()) },
      waitForViewportSyntax() {
        const endLine = Math.max(
          1,
          ...editor.getVisibleRanges().map(range => range.endLineNumber)
        )
        forceSyntax(model, endLine)
      }
    }
  }
}

export default adapter
