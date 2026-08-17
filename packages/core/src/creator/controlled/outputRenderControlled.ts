import { transformerRenderWhitespace } from '@shikijs/transformers'

import type { RefObject } from '../../base'
import type { ResolvedCursor, ShikitorOptions } from '../../editor'
import type { ShikitorSyntaxWorker } from '../../syntaxWorker'
import { scoped } from '../../utils/valtio/scoped'
import { shikitorStructureTransformer } from '../structureTransfomer'
import { createAllDomRenderer } from './allDomRenderer'
import {
  normalizeDecorations, normalizeInlineReplacementDecorations
} from './decorationNormalizer'
import { createDocumentLines } from './documentLines'
import { createLatestRenderController } from './latestRenderController'
import { rangeHighlightDecorations } from './highlightNormalizer'
import { createLessDomRenderer } from './lessDomRenderer'
import {
  applyOutputPresentation, createOutputPresentation,
  createOutputRenderDependencies
} from './outputOptions'
import { createOutputView } from './outputView'
import { canVirtualizeAllDom, resolveRenderMode } from './renderMode'
import type { RenderInput, RenderOutput } from './renderMode'
import { createWorkerIncrementalHighlighter } from './workerIncrementalHighlighter'
import { resolveVirtualLineRange } from './virtualViewport'

export {
  normalizeDecorations, normalizeInlineReplacementDecorations
} from './decorationNormalizer'
export { createLatestRenderController } from './latestRenderController'
export { initDom, resolveVisualScrollLeft } from './outputDom'
export { canVirtualizeAllDom, selectRenderMode } from './renderMode'

export function outputRenderControlled(
  { target, input, lines, output }: {
    target: HTMLElement
    input: HTMLTextAreaElement
    lines: HTMLElement
    output: HTMLElement
  },
  { valueRef, cursorRef, optionsRef, syntaxWorker }: {
    valueRef: RefObject<string>
    cursorRef: RefObject<ResolvedCursor>
    optionsRef: RefObject<ShikitorOptions>
    syntaxWorker?: ShikitorSyntaxWorker
  }
) {
  const { scopeWatch, scopeSubscribe, disposeScoped } = scoped()
  const highlighter = createWorkerIncrementalHighlighter(syntaxWorker, lane => {
    target.dataset.shikitorSyntaxLane = lane
  })
  const {
    dispose: disposeOutputView,
    renderGutter,
    syncCurrentLineHighlight,
    updateLineHighlights
  } = createOutputView({ target, input, lines, output, cursorRef })
  const lessDomRenderer = createLessDomRenderer(target, input, output)
  const allDomRenderer = createAllDomRenderer(
    target, input, output, syncCurrentLineHighlight
  )
  let committedRenderVersion = 0
  const outputPresentation = createOutputPresentation(optionsRef)
  scopeWatch(get => {
    const presentation = get(outputPresentation)
    applyOutputPresentation(target, presentation)
    updateLineHighlights(presentation.highlights)
  })
  const outputRenderDeps = createOutputRenderDependencies(optionsRef)
  const renderer = createLatestRenderController<RenderInput, RenderOutput>({
    renderFallback(renderInput) {
      const {
        value,
        document,
        theme,
        decorations,
        highlights,
        inlineReplacements,
        plugins
      } = renderInput
      const renderMode = resolveRenderMode(target, input, renderInput)
      output.removeAttribute('data-shikitor-syntax-profile')
      target.dataset.shikitorRequestedRenderMode = renderInput.renderMode ?? 'auto'
      target.dataset.shikitorRenderMode = renderMode
      if (renderMode === 'less-dom') {
        allDomRenderer.leave()
        lessDomRenderer.enter()
        renderGutter(document.lineCount, true)
        syncCurrentLineHighlight()
        return
      }
      lessDomRenderer.clear()
      const useVirtualViewport = canVirtualizeAllDom({
        decorations,
        highlights,
        inlineReplacements,
        plugins
      })
      allDomRenderer.enter(document, theme, useVirtualViewport)
      renderGutter(document.lineCount, useVirtualViewport)
      syncCurrentLineHighlight()
    },
    async renderAsync(renderInput, isCurrent, publish) {
      const {
        value,
        document,
        theme,
        language,
        decorations,
        highlights,
        inlineReplacements
      } = renderInput
      const viewportLines = resolveVirtualLineRange(
        input,
        document.lineCount
      ).end
      if (resolveRenderMode(target, input, renderInput) === 'less-dom') {
        const snapshot = await highlighter.tokenize(
          value,
          theme,
          language,
          isCurrent,
          {
            document,
            onViewportReady: value => publish({ kind: 'less-dom', value }),
            viewportLines
          }
        )
        return snapshot ? { kind: 'less-dom', value: snapshot } : undefined
      }
      if (canVirtualizeAllDom(renderInput)) {
        const snapshot = await highlighter.tokenize(
          value,
          theme,
          language,
          isCurrent,
          {
            document,
            onViewportReady: value => publish({ kind: 'tokens', value }),
            viewportLines
          }
        )
        return snapshot ? { kind: 'tokens', value: snapshot } : undefined
      }
      const highlighted = await highlighter.codeToHtml(value, theme, language, {
        decorations: [
          ...(normalizeDecorations(value, decorations) ?? []),
          ...(normalizeDecorations(
            value,
            rangeHighlightDecorations(highlights)
          ) ?? []),
          ...(normalizeInlineReplacementDecorations(value, inlineReplacements) ?? [])
        ],
        lang: language,
        theme,
        transformers: [
          shikitorStructureTransformer(target),
          transformerRenderWhitespace()
        ]
      }, isCurrent)
      return highlighted ? { kind: 'html', value: highlighted } : undefined
    },
    commit(rendered) {
      const profile = rendered.kind === 'html'
        ? undefined
        : rendered.value.syntaxWorkerProfile
      if (profile) {
        output.dataset.shikitorSyntaxProfile = JSON.stringify(profile)
      } else {
        output.removeAttribute('data-shikitor-syntax-profile')
      }
      if (rendered.kind === 'less-dom') {
        if (!lessDomRenderer.commit(rendered.value)) return
      } else if (rendered.kind === 'tokens') {
        allDomRenderer.commit(rendered.value)
      } else {
        allDomRenderer.leave()
        output.innerHTML = rendered.value
        output.dataset.renderKind = 'html'
        output.dataset.renderState = 'highlighted'
        output.dataset.syntaxState = 'complete'
        output.style.removeProperty('color')
        output.style.removeProperty('background-color')
      }
      output.dataset.renderVersion = String(++committedRenderVersion)
      syncCurrentLineHighlight()
    },
    onError(error) {
      // The synchronous source view is already usable. Keep it mounted if an
      // optional highlighter/decoration pass fails instead of blanking the
      // editor, and still surface the failure for diagnostics.
      output.dataset.renderState = 'fallback'
      console.error(error)
    }
  })
  scopeWatch(get => {
    const value = get(valueRef).current
    const {
      theme = 'github-light',
      language = 'javascript',
      decorations,
      highlights,
      inlineReplacements,
      plugins,
      renderMode
    } = get(outputRenderDeps)
    if (value === undefined) return
    void renderer.render({
      document: createDocumentLines(value),
      value,
      theme,
      language,
      decorations,
      highlights,
      inlineReplacements,
      plugins,
      renderMode
    })
  }, { timeout: 0 })
  scopeSubscribe(cursorRef, syncCurrentLineHighlight)
  return () => {
    renderer.dispose()
    disposeScoped()
    disposeOutputView()
    allDomRenderer.dispose()
    highlighter.dispose()
    lessDomRenderer.dispose()
  }
}
