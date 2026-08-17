import { getTokenStyleObject } from '@shikijs/core'
import { bundledThemesInfo } from 'shiki'

import { applyShikitorTheme } from '../structureTransfomer'
import type { DocumentLines } from './documentLines'
import type { TokenSnapshot, TokenizedLine } from './tokenSnapshot'
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

function createTokenLine(line: TokenizedLine, lineIndex: number) {
  const element = document.createElement('span')
  element.className = 'line shikitor-output-line'
  element.dataset.line = String(lineIndex + 1)
  if (line.tokenized === false) {
    element.textContent = line.source || ' '
    return element
  }
  if (!line.tokens.length) {
    element.textContent = ' '
    return element
  }
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
    element.append(span)
  }
  return element
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

function renderFullPlainText(output: HTMLElement, sourceDocument: DocumentLines) {
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.className = 'shikitor-output-lines'
  for (let index = 0; index < sourceDocument.lineCount; index++) {
    code.append(createTokenLine({
      source: sourceDocument.lineAt(index),
      tokenized: false,
      tokens: []
    }, index))
  }
  pre.append(code)
  output.replaceChildren(pre)
  output.dataset.renderKind = 'plaintext-full'
}

export function createAllDomRenderer(
  target: HTMLElement, input: HTMLTextAreaElement, output: HTMLElement,
  onRender: () => void
) {
  let frame = 0
  let active = false
  let virtual = true
  let snapshot: TokenSnapshot | undefined
  let sourceDocument: DocumentLines | undefined
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
        snapshot ? tokenizedLineAt(snapshot, index) ?? {
          source: sourceDocument.lineAt(index),
          tokenized: false,
          tokens: []
        } : {
          source: sourceDocument.lineAt(index),
          tokenized: false,
          tokens: []
        },
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
      virtual = true
      snapshot = next
      sourceDocument = next.document
      render()
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
      observer?.disconnect()
      input.removeEventListener('scroll', scheduleRender)
    },
    enter(nextDocument: DocumentLines, theme: string, useVirtualViewport: boolean) {
      active = true
      virtual = useVirtualViewport
      snapshot = undefined
      sourceDocument = nextDocument
      if (virtual) render()
      else renderFullPlainText(output, sourceDocument)
      output.dataset.renderState = 'plaintext'
      output.dataset.syntaxState = 'pending'
      const isDark = darkThemes.has(theme)
      output.style.color = isDark ? '#c9d1d9' : '#24292f'
      output.style.backgroundColor = isDark ? '#0d1117' : '#ffffff'
    },
    leave() {
      active = false
      cancelAnimationFrame(frame)
    }
  }
}
