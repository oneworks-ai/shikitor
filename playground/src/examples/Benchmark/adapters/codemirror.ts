import { javascript } from '@codemirror/lang-javascript'
import { forceParsing } from '@codemirror/language'
import { MergeView, unifiedMergeView } from '@codemirror/merge'
import { basicSetup, EditorView } from 'codemirror'

import type { BenchmarkAdapter, BenchmarkTheme } from '../types'

function themeExtension(theme: BenchmarkTheme) {
  return EditorView.theme({
    '&': {
      backgroundColor: 'var(--pg-surface)',
      color: 'var(--pg-text)',
      fontSize: '12px',
      height: '100%'
    },
    '.cm-content': {
      caretColor: 'var(--pg-accent)',
      fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, monospace'
    },
    '.cm-gutters': {
      backgroundColor: 'var(--pg-surface-muted)',
      borderRightColor: 'var(--pg-border)',
      color: 'var(--pg-text-tertiary)'
    },
    '.cm-scroller': { overflow: 'auto' }
  }, { dark: theme === 'dark' })
}

function extensions(theme: BenchmarkTheme) {
  return [basicSetup, javascript({ typescript: true }), themeExtension(theme)]
}

function append(view: EditorView, text: string) {
  view.dispatch({ changes: { from: view.state.doc.length, insert: text } })
}

async function waitForSyntax(view: EditorView, upto: number) {
  while (!forceParsing(view, upto, 25)) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }
}

const adapter: BenchmarkAdapter = {
  async mount({ config, container, dataset }) {
    const root = document.createElement('div')
    root.className = 'benchmark-editor-host benchmark-editor-host--codemirror'
    container.append(root)
    const baseExtensions = extensions(config.theme)

    if (config.suite === 'diff' && config.view === 'split') {
      const editor = new MergeView({
        a: {
          doc: dataset.original,
          extensions: [...baseExtensions, EditorView.editable.of(false)]
        },
        b: { doc: dataset.current, extensions: baseExtensions },
        collapseUnchanged: { margin: 2, minSize: 8 },
        gutter: true,
        highlightChanges: true,
        orientation: 'a-b',
        parent: root
      })
      return {
        dispose() {
          editor.destroy()
          root.remove()
        },
        insertText(text) { append(editor.b, text) },
        scrollTo(ratio) {
          editor.b.scrollDOM.scrollTop = editor.b.scrollDOM.scrollHeight * ratio
        },
        async waitForFullSyntax() {
          await Promise.all([
            waitForSyntax(editor.a, editor.a.state.doc.length),
            waitForSyntax(editor.b, editor.b.state.doc.length)
          ])
        },
        async waitForViewportSyntax() {
          await Promise.all([
            waitForSyntax(editor.a, editor.a.viewport.to),
            waitForSyntax(editor.b, editor.b.viewport.to)
          ])
        }
      }
    }

    const editor = new EditorView({
      doc: dataset.current,
      extensions: config.suite === 'diff'
        ? [
            ...baseExtensions,
            unifiedMergeView({
              allowInlineDiffs: true,
              collapseUnchanged: { margin: 2, minSize: 8 },
              gutter: true,
              mergeControls: false,
              original: dataset.original
            })
          ]
        : baseExtensions,
      parent: root
    })
    return {
      dispose() {
        editor.destroy()
        root.remove()
      },
      insertText(text) { append(editor, text) },
      nativeTextarea: false,
      readValue() { return editor.state.doc.toString() },
      replaceValue(value) {
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: value }
        })
      },
      setSelection(start, end) {
        editor.dispatch({ selection: { anchor: start, head: end } })
      },
      scrollTo(ratio) { editor.scrollDOM.scrollTop = editor.scrollDOM.scrollHeight * ratio },
      waitForFullSyntax() { return waitForSyntax(editor, editor.state.doc.length) },
      waitForViewportSyntax() { return waitForSyntax(editor, editor.viewport.to) }
    }
  }
}

export default adapter
