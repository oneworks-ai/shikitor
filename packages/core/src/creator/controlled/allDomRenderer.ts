import { getTokenStyleObject } from '@shikijs/core'
import { bundledThemesInfo } from 'shiki'

import { applyShikitorTheme } from '../structureTransfomer'
import type { DocumentLines } from './documentLines'
import { resolveLinePatch, tokenizedLinesEquivalent } from './linePatch'
import type { TokenizedLine,TokenSnapshot } from './tokenSnapshot'
import { tokenizedLineAt } from './tokenSnapshot'
import { resolveVirtualLineRange } from './virtualViewport'

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
  source: string
}

/**
 * Complete line projection for editors whose plugins own line DOM. Every
 * source line keeps one `.shikitor-output-line` element, but edits only
 * replace the lines whose source or paint changed; unchanged elements keep
 * their identity so plugin decorations and observers see minimal churn.
 */
function createFullLineProjection(output: HTMLElement) {
  let code: HTMLElement | undefined
  let rendered: RenderedLine[] = []

  function ensureStructure() {
    if (code && output.dataset.renderKind === 'tokens-full' && code.isConnected) return code
    const pre = document.createElement('pre')
    code = document.createElement('code')
    code.className = 'shiki shikitor-output-lines'
    pre.append(code)
    output.replaceChildren(pre)
    output.dataset.renderKind = 'tokens-full'
    rendered = []
    return code
  }

  function replaceLine(index: number, line: TokenizedLine) {
    const element = createTokenLine(line, index)
    const previous = rendered[index]
    if (previous) previous.element.replaceWith(element)
    rendered[index] = { element, line: line.tokenized === false ? undefined : line, source: line.source }
    return element
  }

  /**
   * Re-render a line's children for a paint-only change (same source, new
   * tokens). The element keeps its identity, classes and position, so line
   * structure observers stay quiet; plugins decorating inside the line are
   * told through LINE_PATCH_EVENT.
   */
  function patchLine(index: number, line: TokenizedLine) {
    const current = rendered[index]
    current.element.replaceChildren(...createTokenLineChildren(line, index))
    current.line = line.tokenized === false ? undefined : line
    current.source = line.source
    current.element.dispatchEvent(new CustomEvent(LINE_PATCH_EVENT, {
      bubbles: true,
      detail: { line: index + 1 }
    }))
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

  return {
    clear() {
      code = undefined
      rendered = []
    },
    get lineCount() {
      return rendered.length
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
      // Changed lines that keep their slot are replaced in place.
      for (let index = 0; index < reusable; index++) {
        replaceLine(prefix + index, desiredLine(document, snapshot, prefix + index))
      }
      if (removeCount > reusable) {
        for (const entry of rendered.splice(prefix + reusable, removeCount - reusable)) {
          entry.element.remove()
        }
      } else if (insertCount > reusable) {
        const fragment = window.document.createDocumentFragment()
        const inserted: RenderedLine[] = []
        for (let index = prefix + reusable; index < prefix + insertCount; index++) {
          const line = desiredLine(document, snapshot, index)
          const element = createTokenLine(line, index)
          fragment.append(element)
          inserted.push({
            element,
            line: line.tokenized === false ? undefined : line,
            source: line.source
          })
        }
        const anchor = rendered[prefix + reusable]?.element
        if (anchor) anchor.before(fragment)
        else container.append(fragment)
        rendered.splice(prefix + reusable, 0, ...inserted)
      }
      // Shifted tail lines keep their DOM and only take the new line number.
      if (insertCount !== removeCount) {
        for (let index = prefix + insertCount; index < nextCount; index++) {
          rendered[index].element.dataset.line = String(index + 1)
        }
      }
      if (!snapshot) return
      // Upgrade plaintext lines and lines whose paint changed.
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
    }
  }
}

export function createAllDomRenderer(
  target: HTMLElement, input: HTMLTextAreaElement, output: HTMLElement,
  onRender: () => void
) {
  let frame = 0
  let sourceFrame = 0
  let active = false
  let virtual = true
  let snapshot: TokenSnapshot | undefined
  let sourceDocument: DocumentLines | undefined
  const projection = createFullLineProjection(output)
  const observer = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(scheduleRender)

  observer?.observe(input)
  input.addEventListener('scroll', scheduleRender)

  function scheduleRender() {
    if (!active || !virtual) return
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
        onRender()
      }
      applyShikitorTheme(target, {
        backgroundColor: next.theme.bg,
        color: next.theme.fg
      })
      output.dataset.renderState = 'highlighted'
      output.dataset.syntaxState = next.complete ? 'complete' : 'viewport'
      output.style.removeProperty('color')
      output.style.removeProperty('background-color')
    },
    dispose() {
      active = false
      cancelAnimationFrame(frame)
      cancelAnimationFrame(sourceFrame)
      observer?.disconnect()
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
        onRender()
      }
      output.dataset.renderState = 'plaintext'
      output.dataset.syntaxState = 'pending'
      const isDark = darkThemes.has(theme)
      output.style.color = isDark ? '#c9d1d9' : '#24292f'
      output.style.backgroundColor = isDark ? '#0d1117' : '#ffffff'
    },
    leave() {
      active = false
      cancelAnimationFrame(frame)
      cancelAnimationFrame(sourceFrame)
      sourceFrame = 0
      projection.clear()
    }
  }
}
