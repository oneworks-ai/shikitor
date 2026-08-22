import './index.scss'

import { definePlugin, LINE_PATCH_EVENT } from '@shikitor/core'

import type { CodeFoldingController } from '../code-folding'
import codeFolding from '../code-folding'
import type { LineWidget, LineWidgetsController } from '../line-widgets'
import lineWidgets from '../line-widgets'
import { acceptDiffHunk, createDiffTextEdit, rejectDiffHunk } from './actions'
import { computeCollapsedContexts } from './collapsed-context'
import { applyDiffTextEdit } from './editing'
import { computeDiffModel, updateDiffModelForLineEdit } from './model'
import { DiffSyntaxRenderer } from './syntax'
import type {
  ShikitorDiffCollapseUnchangedOptions,
  ShikitorDiffController,
  ShikitorDiffHunk,
  ShikitorDiffHunkActionLabels,
  ShikitorDiffModel,
  ShikitorDiffOptions,
  ShikitorDiffView
} from './types'
import { DiffView } from './view'
import { createDiffWidgets } from './widgets'

export * from './actions'
export * from './collapsed-context'
export * from './inline'
export * from './model'
export * from './types'

declare module 'cordis' {
  interface Context {
    shikitorDiff: ShikitorDiffController
  }
  interface Events {
    'shikitor/diff-change'(model: ShikitorDiffModel): void
  }
}

function actionLabels(value: ShikitorDiffOptions['hunkActions']) {
  if (value === false) return undefined
  return (typeof value === 'object' ? value : {}) satisfies ShikitorDiffHunkActionLabels
}

function collapseOptions(value: ShikitorDiffOptions['collapseUnchanged']) {
  if (!value) return undefined
  return (typeof value === 'object' ? value : {}) satisfies ShikitorDiffCollapseUnchangedOptions
}

export default definePlugin({
  name: 'diff',
  inject: ['shikitor'],
  apply(ctx, options: ShikitorDiffOptions) {
    const shikitor = ctx.shikitor
    const target = shikitor.element
    const output = target.querySelector('.shikitor-output') as HTMLElement
    const gutters = target.querySelector('.shikitor-lines') as HTMLElement
    const input = shikitor.inputElement
    const viewRenderer = new DiffView(target, output, gutters, input)
    const syntax = new DiffSyntaxRenderer()
    const widgets: LineWidget[] = []
    let original = options.original
    let view: ShikitorDiffView = options.view ?? 'unified'
    let model = computeDiffModel(original, shikitor.value, options)
    let widgetGroup: ReturnType<typeof createDiffWidgets>
    let syntaxEpoch = 0
    let syntaxKey = ''
    let lineWidgetsController: LineWidgetsController | undefined
    let codeFoldingController: CodeFoldingController | undefined
    let collapsedContexts = collapseOptions(options.collapseUnchanged)
      ? computeCollapsedContexts(model, collapseOptions(options.collapseUnchanged))
      : []

    const onAction = (action: 'accept' | 'reject', hunk: ShikitorDiffHunk) => {
      if (action === 'accept') controller.acceptHunk(hunk.id)
      else void controller.rejectHunk(hunk.id)
    }

    function renderState() {
      const collapse = collapseOptions(options.collapseUnchanged)
      collapsedContexts = collapse ? computeCollapsedContexts(model, collapse) : []
      widgetGroup = createDiffWidgets({
        model,
        view,
        oldLines: syntax.lines,
        actions: actionLabels(options.hunkActions),
        onAction
      })
      widgets.splice(0, widgets.length, ...widgetGroup.widgets)
      viewRenderer.update({
        model,
        view,
        oldLines: syntax.lines,
        actions: actionLabels(options.hunkActions),
        onAction
      })
      codeFoldingController?.refresh()
    }

    function notify() {
      options.onDiffChange?.(model)
      ctx.emit('shikitor/diff-change', model)
    }

    function recompute(current = shikitor.value) {
      // Typing inside an existing change only moves one row's text; the
      // structure (and a full Myers pass) is needed only for other edits.
      model = (model.original === original && updateDiffModelForLineEdit(model, current, options))
        || computeDiffModel(original, current, options)
      renderState()
      notify()
    }

    async function renderOriginalSyntax() {
      const theme = String(shikitor.optionsRef.current.theme ?? 'github-light')
      const language = String(shikitor.optionsRef.current.language ?? 'javascript')
      const key = `${original}\0${theme}\0${language}`
      if (key === syntaxKey) return
      syntaxKey = key
      const epoch = ++syntaxEpoch
      try {
        const lines = await syntax.render(original, theme, language)
        if (epoch !== syntaxEpoch || !lines) return
        viewRenderer.update({
          model, view, oldLines: lines,
          actions: actionLabels(options.hunkActions), onAction
        })
        widgetGroup.refresh()
      } catch (error) {
        console.error(error)
      }
    }

    const controller: ShikitorDiffController = {
      get model() { return model },
      get original() { return original },
      get view() { return view },
      setOriginal(value) {
        original = value
        syntaxKey = ''
        recompute()
        void renderOriginalSyntax()
        lineWidgetsController?.refresh()
      },
      setView(value) {
        if (view === value) return
        view = value
        renderState()
        lineWidgetsController?.refresh()
      },
      refresh() { recompute() },
      acceptHunk(id) {
        const hunk = model.hunks.find(item => item.id === id)
        if (!hunk) return Promise.resolve()
        options.onHunkAction?.('accept', hunk)
        original = acceptDiffHunk(original, hunk)
        syntaxKey = ''
        recompute()
        void renderOriginalSyntax()
        lineWidgetsController?.refresh()
        return Promise.resolve()
      },
      async rejectHunk(id) {
        const hunk = model.hunks.find(item => item.id === id)
        if (!hunk) return
        options.onHunkAction?.('reject', hunk)
        const next = rejectDiffHunk(shikitor.value, hunk)
        const edit = createDiffTextEdit(shikitor.value, next)
        await applyDiffTextEdit(shikitor, input, edit)
      },
      acceptAll() {
        original = shikitor.value
        syntaxKey = ''
        recompute()
        void renderOriginalSyntax()
        lineWidgetsController?.refresh()
      },
      async rejectAll() {
        const edit = createDiffTextEdit(shikitor.value, original)
        await applyDiffTextEdit(shikitor, input, edit)
      }
    }

    renderState()
    ctx.on('shikitor/change', value => recompute(value))
    const lineWidgetsFiber = ctx.plugin(lineWidgets, {
      widgets: () => widgets,
      onReady(controller) { lineWidgetsController = controller }
    })
    const collapse = collapseOptions(options.collapseUnchanged)
    const codeFoldingFiber = collapse && ctx.plugin(codeFolding, {
      defaultCollapsed: true,
      collapseLabel: collapse.collapseLabel ?? 'Collapse unchanged lines',
      expandLabel: collapse.expandLabel ?? 'Expand unchanged lines',
      ranges: () => collapsedContexts.map(range => ({
        startLine: range.startLine,
        endLine: range.endLine,
        label: range.label,
        presentation: 'line' as const
      })),
      onReady(controller) { codeFoldingController = controller }
    })
    ctx.provide('shikitorDiff', controller)
    const themeObserver = new MutationObserver(() => { void renderOriginalSyntax() })
    themeObserver.observe(target, { attributes: true, attributeFilter: ['style'] })
    // Removed-row widgets render their code only while their anchor line is
    // materialized; follow the anchor's content changes.
    const onLinePatch = (event: Event) => {
      const line = event.target
      if (!(line instanceof HTMLElement)) return
      const number = Number(line.dataset.line)
      if (Number.isInteger(number)) widgetGroup.refreshAfterLine(number)
    }
    output.addEventListener(LINE_PATCH_EVENT, onLinePatch)
    void renderOriginalSyntax()

    return () => {
      syntaxEpoch++
      themeObserver.disconnect()
      output.removeEventListener(LINE_PATCH_EVENT, onLinePatch)
      if (codeFoldingFiber) void codeFoldingFiber.dispose()
      void lineWidgetsFiber.dispose()
      syntax.dispose()
      viewRenderer.dispose()
    }
  }
})
