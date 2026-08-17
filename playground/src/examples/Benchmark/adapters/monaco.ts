import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'
import * as monaco from 'monaco-editor'

import type { BenchmarkAdapter } from '../types'

type MonacoGlobal = typeof globalThis & {
  MonacoEnvironment?: {
    getWorker(moduleId: string, label: string): Worker
  }
}

const monacoGlobal = globalThis as MonacoGlobal
monacoGlobal.MonacoEnvironment ??= {
  getWorker(_moduleId, label) {
    return label === 'javascript' || label === 'typescript'
      ? new TsWorker()
      : new EditorWorker()
  }
}

function editorOptions(theme: 'dark' | 'light'): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
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
    theme: theme === 'dark' ? 'vs-dark' : 'vs',
    wordWrap: 'off'
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

interface MonacoTokenization {
  forceTokenization(lineNumber: number): void
  hasAccurateTokensForLine(lineNumber: number): boolean
}

type TokenizedModel = monaco.editor.ITextModel & {
  tokenization: MonacoTokenization
}

function forceSyntax(model: monaco.editor.ITextModel, lineNumber: number) {
  // Monaco 0.56 exposes this service on the runtime model but omits it from
  // ITextModel. The benchmark pins that version and deliberately bridges the
  // internal hook so "syntax ready" measures real lexical tokenization.
  const tokenization = (model as TokenizedModel).tokenization
  tokenization.forceTokenization(lineNumber)
  if (!tokenization.hasAccurateTokensForLine(lineNumber)) {
    throw new Error(`Monaco did not tokenize through line ${lineNumber}`)
  }
}

function forceViewportSyntax(
  editor: monaco.editor.ICodeEditor,
  model: monaco.editor.ITextModel
) {
  const endLine = Math.max(
    1,
    ...editor.getVisibleRanges().map(range => range.endLineNumber)
  )
  forceSyntax(model, endLine)
}

const adapter: BenchmarkAdapter = {
  async mount({ config, container, dataset }) {
    const root = document.createElement('div')
    root.className = 'benchmark-editor-host benchmark-editor-host--monaco'
    container.append(root)
    const options = editorOptions(config.theme)

    if (config.suite === 'diff') {
      const original = monaco.editor.createModel(dataset.original, 'typescript')
      const current = monaco.editor.createModel(dataset.current, 'typescript')
      const editor = monaco.editor.createDiffEditor(root, {
        ...options,
        enableSplitViewResizing: false,
        originalEditable: false,
        renderSideBySide: config.view === 'split'
      })
      editor.setModel({ original, modified: current })
      return {
        dispose() {
          editor.dispose()
          original.dispose()
          current.dispose()
          root.remove()
        },
        insertText(text) { appendToModel(current, text) },
        scrollTo(ratio) {
          const modified = editor.getModifiedEditor()
          modified.setScrollTop(modified.getScrollHeight() * ratio)
        },
        waitForFullSyntax() {
          forceSyntax(original, original.getLineCount())
          forceSyntax(current, current.getLineCount())
        },
        waitForViewportSyntax() {
          forceViewportSyntax(editor.getOriginalEditor(), original)
          forceViewportSyntax(editor.getModifiedEditor(), current)
        }
      }
    }

    const editor = monaco.editor.create(root, {
      ...options,
      value: dataset.current
    })
    const model = editor.getModel()
    if (!model) throw new Error('Monaco did not create a text model')
    return {
      dispose() {
        editor.dispose()
        model.dispose()
        root.remove()
      },
      insertText(text) { appendToModel(model, text) },
      nativeTextarea: false,
      readValue() { return model.getValue() },
      replaceValue(value) { model.setValue(value) },
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
      waitForViewportSyntax() { forceViewportSyntax(editor, model) }
    }
  }
}

export default adapter
