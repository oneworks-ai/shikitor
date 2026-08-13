import { transformerRenderWhitespace } from '@shikijs/transformers'
import { getHighlighter } from 'shiki'
import { derive } from 'valtio/utils'
import { snapshot } from 'valtio/vanilla'

import type { RefObject } from '../../base'
import { cssvar } from '../../base'
import type { ResolvedCursor, ShikitorOptions } from '../../editor'
import { classnames, isMultipleKey, isWhatBrowser } from '../../utils' with {
  'unbundled-reexport': 'on'
}
import { scoped } from '../../utils/valtio/scoped'
import { HIGHLIGHTED } from '../classes'
import { shikitorStructureTransformer } from '../structureTransfomer'

export function initDom(target: HTMLElement) {
  target.classList.add('shikitor')
  target.innerHTML = ''

  const input = document.createElement('textarea')
  const output = document.createElement('div')
  const placeholder = document.createElement('div')

  input.classList.add('shikitor-input')
  input.setAttribute('autocapitalize', 'off')
  input.setAttribute('autocomplete', 'off')
  input.setAttribute('autocorrect', 'off')
  input.setAttribute('spellcheck', 'false')

  output.classList.add('shikitor-output')
  input.addEventListener('scroll', () => {
    setTimeout(() => {
      target.style.setProperty(cssvar('scroll-t'), `${input.scrollTop}px`)
      target.style.setProperty(cssvar('scroll-l'), `${input.scrollLeft}px`)
      target.style.setProperty(cssvar('offset-x'), 'calc(-1 * var(--shikitor-scroll-l, 0px))')
      target.style.setProperty(cssvar('offset-y'), 'calc(-1 * var(--shikitor-scroll-t, 0px))')
      // wait the output renders, whether not wait it, the scrollTop can't be set
      output.scrollTop = input.scrollTop
      output.scrollLeft = input.scrollLeft
      lines.style.marginTop = `-${input.scrollTop}px`
    }, 10)
  })
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !isMultipleKey(e)) {
      if (input.selectionStart !== input.selectionEnd) {
        e.preventDefault()
        input.setSelectionRange(input.selectionStart, input.selectionStart)
      }
    }
    // The Chrome browser never fires a selectionchange event when backspace or delete is pressed.
    // So we need to handle this case separately.
    // https://issues.chromium.org/41321247
    // https://issues.chromium.org/41399759
    if (isWhatBrowser('chrome')) {
      if (['Backspace', 'Delete', 'Enter'].includes(e.key) && !isMultipleKey(e)) {
        const s = { start: input.selectionStart, end: input.selectionEnd }
        setTimeout(() => {
          if (s.start !== input.selectionStart || s.end !== input.selectionEnd) {
            input.setSelectionRange(input.selectionStart, input.selectionEnd)
            document.dispatchEvent(new Event('selectionchange'))
          }
        }, 10)
      }
    }
  })

  placeholder.classList.add('shikitor-placeholder')

  const lines = document.createElement('div')
  lines.classList.add('shikitor-lines')

  const cursors = document.createElement('div')
  cursors.classList.add('shikitor-cursors')
  const defaultCursor = document.createElement('div')
  defaultCursor.classList.add('shikitor-cursor')
  const userName = document.createElement('div')
  userName.classList.add('shikitor-cursor__username', 'shikitor-cursor__username--you')
  userName.dataset.username = 'You'
  cursors.append(defaultCursor, userName)

  const container = document.createElement('div')
  container.classList.add('shikitor-container')
  container.append(
    output,
    placeholder,
    input,
    cursors
  )
  target.append(lines, container)
  return [
    input,
    output,
    placeholder,
    lines
  ] as const
}

export function outputRenderControlled(
  { target, lines, output }: {
    target: HTMLElement
    lines: HTMLElement
    output: HTMLElement
  },
  { valueRef, cursorRef, optionsRef }: {
    valueRef: RefObject<string>
    cursorRef: RefObject<ResolvedCursor>
    optionsRef: RefObject<ShikitorOptions>
  }
) {
  const { scopeWatch, scopeSubscribe, disposeScoped } = scoped()
  scopeWatch(get => {
    const {
      readOnly,
      lineNumbers = 'on',
      highlightCurrentLine = true,
      currentLineHighlightColor,
      hideSelfCursorUsername = false
    } = get(derive({
      readOnly: get => get(optionsRef).current.readOnly,
      lineNumbers: get => get(optionsRef).current.lineNumbers,
      highlightCurrentLine: get => get(optionsRef).current.highlightCurrentLine,
      currentLineHighlightColor: get => get(optionsRef).current.currentLineHighlightColor,
      hideSelfCursorUsername: get => get(optionsRef).current.hideSelfCursorUsername
    }))
    target.classList.toggle('read-only', readOnly === true)
    target.classList.toggle('line-numbers', lineNumbers === 'on')
    target.classList.toggle('hide-current-line', !highlightCurrentLine)
    target.classList.toggle('hide-self-cursor-username', hideSelfCursorUsername)
    if (currentLineHighlightColor) {
      target.style.setProperty(cssvar('current-line-color'), currentLineHighlightColor)
    } else {
      target.style.removeProperty(cssvar('current-line-color'))
    }
  })
  let highlighter: ReturnType<typeof getHighlighter> | undefined
  const highlighterDeps = derive({
    theme: get => get(optionsRef).current.theme,
    language: get => get(optionsRef).current.language
  })
  scopeWatch(async get => {
    const {
      theme = 'github-light',
      language = 'javascript'
    } = get(highlighterDeps)
    highlighter = getHighlighter({ themes: [theme], langs: [language] })
  })
  const outputRenderDeps = derive({
    theme: get => get(optionsRef).current.theme,
    language: get => get(optionsRef).current.language,
    // TODO remove decorations
    decorations: get => get(optionsRef).current.decorations
  })
  scopeWatch(async get => {
    const value = get(valueRef).current
    const {
      theme = 'github-light',
      language = 'javascript',
      decorations
    } = get(outputRenderDeps)
    if (!highlighter || value === undefined) return

    const { codeToHtml } = await highlighter
    output.innerHTML = codeToHtml(value, {
      lang: language,
      theme: theme,
      decorations,
      transformers: [
        shikitorStructureTransformer(target),
        transformerRenderWhitespace()
      ]
    })
    let lineCounts = 1
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '\n') lineCounts++
    }

    const gutterLinePrefix = `${'shikitor'}-gutter-line`
    const cursorLine = cursorRef.current.line
    const lineClass = (index: number) => {
      const isCursor = !!cursorLine && cursorLine === index
      return classnames(
        gutterLinePrefix,
        {
          [HIGHLIGHTED]: isCursor
        }
      )
    }
    lines.style.setProperty(cssvar('line-digit-count'), `${lineCounts.toString().length}ch`)
    lines.innerHTML = Array
      .from({ length: lineCounts })
      .map((_, i) => (`<div class="${lineClass(i + 1)}" data-line="${i + 1}">
        <div class="${gutterLinePrefix}-number">${i + 1}</div>
      </div>`))
      .join('')
  })
  scopeSubscribe(cursorRef, () => {
    const cursor = snapshot(cursorRef).current
    if (cursor.line === undefined) return
    const line = lines.querySelector(`[data-line="${cursor.line}"]`)
    if (!line) return

    const oldLine = lines.querySelector(`.${HIGHLIGHTED}`)
    if (oldLine === line) return
    if (oldLine) {
      oldLine.classList.remove(HIGHLIGHTED)
    }
    line.classList.add(HIGHLIGHTED)
  })
  return disposeScoped
}
