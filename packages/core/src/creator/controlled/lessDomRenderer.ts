import { cssvar } from '../../base'
import { applyShikitorTheme } from '../structureTransfomer'
import {
  createLessDomCanvasRenderer,
  supportsCanvasRenderer
} from './lessDomCanvasRenderer'
import {
  createLessDomHighlightRenderer,
  supportsHighlightApi,
  supportsOpaqueRange
} from './lessDomHighlightRenderer'
import {
  createLessDomSvgRenderer,
  supportsSvgRenderer
} from './lessDomSvgRenderer'
import type { TokenSnapshot } from './tokenSnapshot'

let rendererSequence = 0

export function canUseLessDom(_input: HTMLTextAreaElement) {
  return supportsHighlightApi() || supportsCanvasRenderer() || supportsSvgRenderer()
}

export function createLessDomRenderer(
  target: HTMLElement,
  input: HTMLTextAreaElement,
  output: HTMLElement
) {
  const rendererId = String(++rendererSequence)
  // A native value range paints the textarea directly. Without it, prefer a
  // viewport canvas over thousands of live DOM Ranges: the bridge remains a
  // compatibility fallback for environments without Canvas 2D.
  const renderer = supportsOpaqueRange(input)
    ? createLessDomHighlightRenderer({ input, output, rendererId, target })
    : supportsCanvasRenderer()
      ? createLessDomCanvasRenderer(input, output)
      : supportsHighlightApi()
        ? createLessDomHighlightRenderer({ input, output, rendererId, target })
        : createLessDomSvgRenderer(input, output)
  return {
    clear() {
      renderer.clear()
      target.classList.remove(
        'shikitor--less-dom',
        'shikitor--less-dom-bridge',
        'shikitor--less-dom-canvas',
        'shikitor--less-dom-native',
        'shikitor--less-dom-pending',
        'shikitor--less-dom-svg'
      )
      target.removeAttribute('data-shikitor-native-id')
      target.removeAttribute('data-shikitor-less-dom-backend')
      target.style.removeProperty(cssvar('native-fg-color'))
    },
    commit(snapshot: TokenSnapshot) {
      renderer.commit(snapshot)
      target.classList.remove('shikitor--less-dom-pending')
      output.dataset.renderKind = `less-dom-${renderer.kind}`
      output.dataset.renderState = 'highlighted'
      output.dataset.syntaxState = snapshot.complete ? 'complete' : 'viewport'
      applyShikitorTheme(target, {
        backgroundColor: snapshot.theme.bg,
        color: snapshot.theme.fg
      })
      target.dataset.shikitorLessDomBackend = renderer.kind
      target.style.setProperty(cssvar('native-fg-color'), snapshot.theme.fg)
      return true
    },
    dispose() {
      renderer.dispose()
      target.removeAttribute('data-shikitor-native-id')
    },
    enter() {
      target.dataset.shikitorNativeId = rendererId
      target.dataset.shikitorLessDomBackend = renderer.kind
      target.classList.toggle('shikitor--less-dom-native', renderer.kind === 'opaque-range')
      target.classList.toggle('shikitor--less-dom-bridge', renderer.kind === 'range-bridge')
      target.classList.toggle('shikitor--less-dom-canvas', renderer.kind === 'canvas')
      target.classList.toggle('shikitor--less-dom-svg', renderer.kind === 'svg-viewport')
      target.classList.add('shikitor--less-dom')
      target.classList.add('shikitor--less-dom-pending')
      output.dataset.renderState = 'plaintext'
      output.dataset.syntaxState = 'pending'
      target.dataset.shikitorRenderMode = 'less-dom'
    }
  }
}
