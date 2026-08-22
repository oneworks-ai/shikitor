import {
  create,
  createShikitorSyntaxWorker,
  prepareShikitorSyntax
} from '@shikitor/core'
import type { ShikitorRenderMode, SyntaxWorkerProfile } from '@shikitor/core'
import diffPlugin from '@shikitor/core/plugins/diff'
import TokenizationWorker from '@shikitor/core/workers/tokenization?worker'

import type { BenchmarkAdapter } from '../types'

const syntaxWorker = createShikitorSyntaxWorker(new TokenizationWorker())

function resolveTheme(theme: 'dark' | 'light') {
  return theme === 'dark' ? 'github-dark' : 'github-light'
}

function waitForRender(
  root: HTMLElement,
  target: 'complete' | 'viewport',
  previousVersion?: string
) {
  const output = root.querySelector<HTMLElement>('.shikitor-output')
  if (!output) return Promise.resolve()
  const ready = () => (
    output.dataset.renderState === 'highlighted'
    && (
      target === 'viewport'
        ? output.dataset.syntaxState !== 'pending'
        : output.dataset.syntaxState === 'complete'
    )
    && output.dataset.renderVersion !== previousVersion
  )
  if (ready()) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      observer.disconnect()
      reject(new Error('Shikitor render did not become ready'))
    }, 10_000)
    const observer = new MutationObserver(() => {
      if (!ready()) return
      window.clearTimeout(timeout)
      observer.disconnect()
      resolve()
    })
    observer.observe(output, { attributes: true })
  })
}

function waitForRenderMode(root: HTMLElement) {
  if (root.dataset.shikitorRenderMode) return Promise.resolve()
  return new Promise<void>(resolve => {
    const observer = new MutationObserver(() => {
      if (!root.dataset.shikitorRenderMode) return
      observer.disconnect()
      resolve()
    })
    observer.observe(root, { attributes: true })
  })
}

function readSyntaxProfile(root: HTMLElement): SyntaxWorkerProfile | undefined {
  const value = root.querySelector<HTMLElement>('.shikitor-output')
    ?.dataset.shikitorSyntaxProfile
  if (!value) return undefined
  try {
    return JSON.parse(value) as SyntaxWorkerProfile
  } catch {
    return undefined
  }
}

export function createShikitorAdapter(renderMode: ShikitorRenderMode): BenchmarkAdapter {
  return {
    async prepare(config) {
      const theme = resolveTheme(config.theme)
      await Promise.all([
        prepareShikitorSyntax({
          language: 'typescript',
          prewarm: false,
          reset: true,
          theme
        }),
        syntaxWorker.reset()
      ])
    },
    async mount({ config, container, dataset }) {
      const root = document.createElement('div')
      root.className = 'benchmark-editor-host benchmark-editor-host--shikitor'
      container.append(root)
      const editor = await create(root, {
        autoSize: false,
        hideSelfCursorUsername: true,
        language: 'typescript',
        lineNumbers: 'on',
        renderMode,
        theme: resolveTheme(config.theme),
        value: dataset.current,
        plugins: config.suite === 'diff'
          ? [[diffPlugin, {
              collapseUnchanged: { context: 2, minimum: 8 },
              inline: 'word',
              original: dataset.original,
              view: config.view
            }]]
          : []
      }, { syntaxWorker })
      await waitForRenderMode(root)
      const effectiveMode = root.dataset.shikitorRenderMode
      if (renderMode === 'less-dom' && effectiveMode !== 'less-dom') {
        editor[Symbol.dispose]()
        root.remove()
        const error = new Error(
          root.dataset.shikitorProjectionRequired === 'true'
            ? 'Active projections require the all-DOM renderer'
            : 'This browser has no supported less-DOM paint backend'
        )
        error.name = 'BenchmarkUnsupportedError'
        throw error
      }
      const input = root.querySelector<HTMLTextAreaElement>('.shikitor-input')
      if (!input) throw new Error('Shikitor did not create a textarea')
      let pendingRenderVersion: string | undefined

      return {
        dispose() {
          editor[Symbol.dispose]()
          root.remove()
        },
        async insertText(text) {
          const output = root.querySelector<HTMLElement>('.shikitor-output')
          const previousVersion = output?.dataset.renderVersion
          pendingRenderVersion = previousVersion
          // Edits target a focused editor, as typing would; the core then
          // applies them through the browser's editing engine.
          if (document.activeElement !== input) input.focus({ preventScroll: true })
          const offset = editor.value.length
          await editor.setRangeText({ start: offset, end: offset }, text)
          if (renderMode === 'all-dom') {
            await waitForRender(root, 'viewport', previousVersion)
          }
        },
        nativeTextarea: true,
        readValue() { return input.value },
        readSyntaxProfile() { return readSyntaxProfile(root) },
        replaceValue(value) {
          input.value = value
          input.dispatchEvent(new Event('input', { bubbles: true }))
        },
        get renderer() {
          return `${effectiveMode === 'less-dom'
            ? `${effectiveMode}/${root.dataset.shikitorLessDomBackend ?? 'unknown'}`
            : effectiveMode}/${root.dataset.shikitorSyntaxLane ?? 'auto'}`
        },
        setSelection(start, end) { input.setSelectionRange(start, end) },
        scrollTo(ratio) {
          input.scrollTop = Math.max(0, input.scrollHeight - input.clientHeight) * ratio
        },
        waitForFullSyntax() {
          const previousVersion = pendingRenderVersion
          pendingRenderVersion = undefined
          return waitForRender(root, 'complete', previousVersion)
        },
        waitForViewportSyntax() { return waitForRender(root, 'viewport') }
      }
    }
  }
}
