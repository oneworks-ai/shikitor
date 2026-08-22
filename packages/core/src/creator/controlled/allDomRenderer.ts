import { getTokenStyleObject } from '@shikijs/core'
import { bundledThemesInfo } from 'shiki'

import { applyShikitorTheme } from '../structureTransfomer'
import type { DocumentLines } from './documentLines'
import { resolveLinePatch, tokenizedLinesEquivalent } from './linePatch'
import { MATERIALIZATION_OVERSCAN_LINES, resolveMaterializationWindow } from './materialization'
import type { TokenizedLine,TokenSnapshot } from './tokenSnapshot'
import { tokenizedLineAt } from './tokenSnapshot'
import { resolveVirtualLineRange } from './virtualViewport'

const DEFAULT_LINE_HEIGHT = 22

const darkThemes = new Set(bundledThemesInfo
  .filter(({ type }) => type === 'dark')
  .map(({ id }) => id))

function appendWhitespace(container: HTMLElement, content: string) {
  let text = ''
  const flush = () => {
    if (!text) return
    container.append(document.createTextNode(text))
    text = ''
  }
  for (let index = 0; index < content.length; index++) {
    const character = content[index]
    if (character !== ' ' && character !== '\t') {
      text += character
      continue
    }
    flush()
    const whitespace = document.createElement('span')
    if (character === ' ') {
      let end = index + 1
      while (content[end] === ' ') end++
      whitespace.className = 'space'
      whitespace.textContent = '·'.repeat(end - index)
      index = end - 1
    } else {
      whitespace.className = 'tab'
      whitespace.textContent = character
    }
    container.append(whitespace)
  }
  flush()
}

/** Child nodes of one rendered line: token spans, or plain text. */
export function createTokenLineChildren(line: TokenizedLine, lineIndex: number): Node[] {
  if (line.tokenized === false) return [document.createTextNode(line.source || ' ')]
  if (!line.tokens.length) return [document.createTextNode(' ')]
  const nodes: Node[] = []
  for (const token of line.tokens) {
    const span = document.createElement('span')
    span.className = [
      'shikitor-output-token',
      `offset:${token.offset}`,
      `position:${lineIndex + 1}:${token.offset + 1}`
    ].join(' ')
    for (const [property, value] of Object.entries(getTokenStyleObject(token))) {
      span.style.setProperty(property, value)
    }
    appendWhitespace(span, token.content)
    nodes.push(span)
  }
  return nodes
}

export function createTokenLine(line: TokenizedLine, lineIndex: number) {
  const element = document.createElement('span')
  element.className = 'line shikitor-output-line'
  element.dataset.line = String(lineIndex + 1)
  element.append(...createTokenLineChildren(line, lineIndex))
  return element
}

/**
 * Dispatched (bubbling) on a `.shikitor-output-line` element whose children
 * were re-rendered in place, so plugins that decorate inside lines can
 * restore their decorations for that line without a line-structure change.
 */
export const LINE_PATCH_EVENT = 'shikitor-line-patch'

function plainLine(source: string): TokenizedLine {
  return { source, tokenized: false, tokens: [] }
}

function createStructure(output: HTMLElement) {
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  const viewport = document.createElement('div')
  code.className = 'shiki shikitor-output-lines shikitor-output-lines--virtual'
  viewport.className = 'shikitor-output-viewport'
  code.append(viewport)
  pre.append(code)
  output.replaceChildren(pre)
  output.dataset.renderKind = 'tokens-virtual'
  return { code, viewport }
}

interface RenderedLine {
  element: HTMLElement
  line?: TokenizedLine
  /** Whether the element carries real content or a one-line placeholder. */
  materialized: boolean
  source: string
}

/** Marks a line element whose content is not materialized. */
export const VIRTUAL_LINE_ATTRIBUTE = 'data-shikitor-virtual'

function createPlaceholderLine(index: number) {
  const element = document.createElement('span')
  element.className = 'line shikitor-output-line'
  element.dataset.line = String(index + 1)
  element.setAttribute(VIRTUAL_LINE_ATTRIBUTE, '')
  element.append(document.createTextNode(' '))
  return element
}

/**
 * Complete line projection for editors whose plugins own line DOM. Every
 * source line keeps one `.shikitor-output-line` element so plugins can
 * anchor widgets, hide ranges and decorate by line number, but only the
 * lines around the scrolled viewport carry token content; the rest are
 * one-line placeholders. Edits replace only the lines whose source changed,
 * token updates touch only materialized lines whose paint changed, and the
 * materialized window follows the flow layout (hidden lines and block
 * widgets included) measured from the elements themselves.
 */
function createFullLineProjection(output: HTMLElement, input: HTMLTextAreaElement) {
  let code: HTMLElement | undefined
  let rendered: RenderedLine[] = []
  const materialized = new Set<number>()
  let lastMinWidth = ''
  let windowDirty = true
  let lastCodeHeight = -1
  let visibleDirty = true
  let visible: number[] = []
  let onLayout: (() => void) | undefined
  const codeObserver = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(entries => {
        // Only height changes (folds, widgets) move lines; width changes do not.
        const height = entries[entries.length - 1]?.contentRect.height ?? -1
        if (height === lastCodeHeight) return
        lastCodeHeight = height
        windowDirty = true
        onLayout?.()
      })
  // Hidden-state changes (code folding) alter which lines are visible.
  const hiddenObserver = typeof MutationObserver === 'undefined'
    ? undefined
    : new MutationObserver(() => {
        visibleDirty = true
        windowDirty = true
        onLayout?.()
      })

  function ensureStructure() {
    if (code && output.dataset.renderKind === 'tokens-full' && code.isConnected) return code
    codeObserver?.disconnect()
    const pre = document.createElement('pre')
    code = document.createElement('code')
    code.className = 'shiki shikitor-output-lines'
    pre.append(code)
    output.replaceChildren(pre)
    output.dataset.renderKind = 'tokens-full'
    rendered = []
    materialized.clear()
    lastMinWidth = ''
    lastCodeHeight = -1
    visibleDirty = true
    codeObserver?.observe(code)
    hiddenObserver?.disconnect()
    hiddenObserver?.observe(code, { attributeFilter: ['hidden'], attributes: true, subtree: true })
    return code
  }

  function contentFor(index: number): TokenizedLine {
    const current = rendered[index]
    return current.line ?? plainLine(current.source)
  }

  function announce(index: number) {
    rendered[index].element.dispatchEvent(new CustomEvent(LINE_PATCH_EVENT, {
      bubbles: true,
      detail: { line: index + 1 }
    }))
  }

  function materialize(index: number) {
    const current = rendered[index]
    current.element.replaceChildren(...createTokenLineChildren(contentFor(index), index))
    current.element.removeAttribute(VIRTUAL_LINE_ATTRIBUTE)
    current.materialized = true
    materialized.add(index)
    announce(index)
  }

  function dematerialize(index: number) {
    const current = rendered[index]
    current.element.replaceChildren(document.createTextNode(' '))
    current.element.setAttribute(VIRTUAL_LINE_ATTRIBUTE, '')
    current.materialized = false
    materialized.delete(index)
    announce(index)
  }

  function createLine(index: number, line: TokenizedLine, withContent: boolean) {
    return withContent ? createTokenLine(line, index) : createPlaceholderLine(index)
  }

  function replaceLine(index: number, line: TokenizedLine, keepMaterialized: boolean) {
    const element = createLine(index, line, keepMaterialized)
    const previous = rendered[index]
    if (previous) previous.element.replaceWith(element)
    rendered[index] = {
      element,
      line: line.tokenized === false ? undefined : line,
      materialized: keepMaterialized,
      source: line.source
    }
    if (keepMaterialized) materialized.add(index)
    else materialized.delete(index)
    return element
  }

  /**
   * Re-render a materialized line's children for a paint-only change (same
   * source, new tokens). The element keeps its identity, classes and
   * position, so line structure observers stay quiet; plugins decorating
   * inside the line are told through LINE_PATCH_EVENT.
   */
  function patchLine(index: number, line: TokenizedLine) {
    const current = rendered[index]
    current.line = line.tokenized === false ? undefined : line
    current.source = line.source
    if (!current.materialized) return
    current.element.replaceChildren(...createTokenLineChildren(line, index))
    announce(index)
  }

  function desiredLine(
    document: DocumentLines,
    snapshot: TokenSnapshot | undefined,
    index: number
  ): TokenizedLine {
    const tokenized = snapshot && tokenizedLineAt(snapshot, index)
    if (tokenized && tokenized.source === document.lineAt(index)) return tokenized
    return plainLine(document.lineAt(index))
  }

  function reindexMaterialized(from: number, delta: number) {
    if (!delta) return
    const moved = [...materialized].filter(index => index >= from)
    for (const index of moved) materialized.delete(index)
    for (const index of moved) materialized.add(index + delta)
  }

  return {
    clear() {
      codeObserver?.disconnect()
      hiddenObserver?.disconnect()
      code = undefined
      rendered = []
      materialized.clear()
      lastMinWidth = ''
      windowDirty = true
      visibleDirty = true
    },
    markWindowDirty() {
      windowDirty = true
    },
    dispose() {
      codeObserver?.disconnect()
      hiddenObserver?.disconnect()
      onLayout = undefined
    },
    get lineCount() {
      return rendered.length
    },
    /** Called when the flow layout of the projection changed size. */
    set onLayoutChange(callback: (() => void) | undefined) {
      onLayout = callback
    },
    /**
     * Reconcile the line elements with the document, touching only changed
     * lines. When a token snapshot is supplied, changed lines are created
     * with their tokens directly so an edit costs one element replacement.
     */
    sync(document: DocumentLines, snapshot?: TokenSnapshot) {
      const container = ensureStructure()
      const { prefix, suffix } = resolveLinePatch(rendered.map(line => line.source), document)
      const previousCount = rendered.length
      const nextCount = document.lineCount
      const removeCount = previousCount - prefix - suffix
      const insertCount = nextCount - prefix - suffix
      const reusable = Math.min(removeCount, insertCount)
      // Changed lines that keep their slot are replaced in place and keep
      // the slot's materialization; the window pass corrects the rest.
      // Changed lines that keep their slot are patched in place: the element,
      // its attributes and its position survive, so plugins see a content
      // change (LINE_PATCH_EVENT) instead of a line-structure mutation.
      for (let index = 0; index < reusable; index++) {
        const slot = prefix + index
        patchLine(slot, desiredLine(document, snapshot, slot))
      }
      if (removeCount !== insertCount) visibleDirty = true
      if (removeCount > reusable) {
        const removed = rendered.splice(prefix + reusable, removeCount - reusable)
        for (const entry of removed) entry.element.remove()
        for (let index = prefix + reusable; index < prefix + removeCount; index++) materialized.delete(index)
        reindexMaterialized(prefix + removeCount, -(removeCount - reusable))
      } else if (insertCount > reusable) {
        const nearby = rendered[prefix + reusable - 1]?.materialized
          || rendered[prefix + reusable]?.materialized
          || false
        reindexMaterialized(prefix + reusable, insertCount - reusable)
        const fragment = window.document.createDocumentFragment()
        const inserted: RenderedLine[] = []
        for (let index = prefix + reusable; index < prefix + insertCount; index++) {
          const line = desiredLine(document, snapshot, index)
          const element = createLine(index, line, nearby)
          fragment.append(element)
          inserted.push({
            element,
            line: line.tokenized === false ? undefined : line,
            materialized: nearby,
            source: line.source
          })
          if (nearby) materialized.add(index)
        }
        const anchor = rendered[prefix + reusable]?.element
        if (anchor) anchor.before(fragment)
        else container.append(fragment)
        rendered.splice(prefix + reusable, 0, ...inserted)
      }
      // Shifted tail lines keep their DOM and only take the new line number.
      if (insertCount !== removeCount) {
        windowDirty = true
        for (let index = prefix + insertCount; index < nextCount; index++) {
          rendered[index].element.dataset.line = String(index + 1)
        }
      }
      if (!snapshot) return
      // Record tokens for every line; only materialized lines whose paint
      // changed are re-rendered.
      for (let index = 0; index < nextCount; index++) {
        const line = tokenizedLineAt(snapshot, index)
        if (!line) continue
        const current = rendered[index]
        if (current.line === line) continue
        if (current.line && tokenizedLinesEquivalent(current.line, line)) {
          current.line = line
          continue
        }
        if (line.source !== current.source) continue
        patchLine(index, line)
      }
    },
    /**
     * Materialize the lines around the scrolled viewport and release the
     * content of lines that left it. Positions come from the flow layout,
     * so hidden lines and block widgets inserted by plugins are respected
     * without a private layout model.
     */
    updateWindow(force = false) {
      if (!code || !rendered.length) return
      if (!windowDirty && !force) return
      windowDirty = false
      if (visibleDirty) {
        visibleDirty = false
        visible = []
        for (let index = 0; index < rendered.length; index++) {
          if (!rendered[index].element.hidden) visible.push(index)
        }
      }
      const wanted = new Set<number>()
      if (visible.length) {
        const firstElement = rendered[visible[0]].element
        // offsetTop is relative to the offset parent; the container's own
        // offset is the content origin only when both share that parent.
        const origin = code.offsetParent === firstElement.offsetParent ? code.offsetTop : 0
        const lineHeight = firstElement.offsetHeight || DEFAULT_LINE_HEIGHT
        const { first, last } = resolveMaterializationWindow(
          visible.length,
          row => rendered[visible[row]].element.offsetTop - origin,
          input.scrollTop,
          input.clientHeight,
          MATERIALIZATION_OVERSCAN_LINES * lineHeight
        )
        for (let row = first; row < last; row++) wanted.add(visible[row])
        const minWidth = `${Math.max(input.clientWidth, input.scrollWidth)}px`
        if (minWidth !== lastMinWidth) {
          lastMinWidth = minWidth
          code.style.minWidth = minWidth
        }
        output.dataset.renderWindowStart = String(visible[first] + 1)
        output.dataset.renderWindowEnd = String(visible[Math.max(first, last - 1)] + 1)
      }
      for (const index of [...materialized]) {
        if (!wanted.has(index)) dematerialize(index)
      }
      for (const index of wanted) {
        if (!rendered[index].materialized || force) materialize(index)
      }
    }
  }
}

export function createAllDomRenderer(
  target: HTMLElement, input: HTMLTextAreaElement, output: HTMLElement,
  onRender: () => void
) {
  let frame = 0
  let sourceFrame = 0
  let windowFrame = 0
  let active = false
  let virtual = true
  let snapshot: TokenSnapshot | undefined
  let sourceDocument: DocumentLines | undefined
  const projection = createFullLineProjection(output, input)
  const observer = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(scheduleRender)

  observer?.observe(input)
  input.addEventListener('scroll', scheduleRender)
  projection.onLayoutChange = () => scheduleWindow()

  function scheduleWindow() {
    if (!active || virtual) return
    projection.markWindowDirty()
    cancelAnimationFrame(windowFrame)
    windowFrame = requestAnimationFrame(() => {
      windowFrame = 0
      if (!active || virtual) return
      projection.updateWindow()
    })
  }

  function scheduleRender() {
    if (!active) return
    if (!virtual) {
      scheduleWindow()
      return
    }
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(render)
  }

  function render() {
    if (!active || !virtual || !sourceDocument) return
    const existing = output.dataset.renderKind === 'tokens-virtual'
    const structure = existing
      ? {
          code: output.querySelector<HTMLElement>('.shikitor-output-lines')!,
          viewport: output.querySelector<HTMLElement>('.shikitor-output-viewport')!
        }
      : createStructure(output)
    const range = resolveVirtualLineRange(input, sourceDocument.lineCount)
    const fragment = window.document.createDocumentFragment()
    for (let index = range.start; index < range.end; index++) {
      fragment.append(createTokenLine(
        (snapshot ? tokenizedLineAt(snapshot, index) : undefined)
          ?? plainLine(sourceDocument.lineAt(index)),
        index
      ))
    }
    structure.viewport.replaceChildren(fragment)
    structure.viewport.style.transform = `translateY(${range.start * range.lineHeight}px)`
    structure.code.style.height = `${sourceDocument.lineCount * range.lineHeight}px`
    structure.code.style.minWidth = `${Math.max(input.clientWidth, input.scrollWidth)}px`
    output.scrollTop = input.scrollTop
    output.scrollLeft = input.scrollLeft
    output.dataset.renderWindowStart = String(range.start + 1)
    output.dataset.renderWindowEnd = String(range.end)
    onRender()
  }

  return {
    commit(next: TokenSnapshot) {
      active = true
      snapshot = next
      sourceDocument = next.document
      if (virtual) render()
      else {
        cancelAnimationFrame(sourceFrame)
        sourceFrame = 0
        projection.sync(next.document, next)
        projection.updateWindow()
        onRender()
      }
      applyShikitorTheme(target, {
        backgroundColor: next.theme.bg,
        color: next.theme.fg
      })
      output.dataset.renderState = 'highlighted'
      output.dataset.syntaxState = next.complete ? 'complete' : 'viewport'
      // `color` inherits; only clear the plaintext fallback when it is set.
      if (output.style.color) output.style.removeProperty('color')
      if (output.style.backgroundColor) output.style.removeProperty('background-color')
    },
    dispose() {
      active = false
      cancelAnimationFrame(frame)
      cancelAnimationFrame(sourceFrame)
      cancelAnimationFrame(windowFrame)
      observer?.disconnect()
      projection.dispose()
      input.removeEventListener('scroll', scheduleRender)
    },
    enter(nextDocument: DocumentLines, theme: string, useVirtualViewport: boolean) {
      active = true
      virtual = useVirtualViewport
      snapshot = undefined
      sourceDocument = nextDocument
      cancelAnimationFrame(sourceFrame)
      sourceFrame = 0
      if (virtual) {
        projection.clear()
        render()
      } else {
        projection.sync(nextDocument)
        projection.updateWindow()
        onRender()
      }
      const highlighted = output.dataset.renderState === 'highlighted'
      output.dataset.renderState = 'plaintext'
      output.dataset.syntaxState = 'pending'
      // The plaintext fallback colors only matter before the first themed
      // commit; afterwards the projection inherits the applied theme, and
      // rewriting an inherited color would restyle every line per keystroke.
      if (!highlighted || virtual) {
        const isDark = darkThemes.has(theme)
        output.style.color = isDark ? '#c9d1d9' : '#24292f'
        output.style.backgroundColor = isDark ? '#0d1117' : '#ffffff'
      }
    },
    leave() {
      active = false
      cancelAnimationFrame(frame)
      cancelAnimationFrame(sourceFrame)
      cancelAnimationFrame(windowFrame)
      sourceFrame = 0
      windowFrame = 0
      projection.clear()
    }
  }
}
