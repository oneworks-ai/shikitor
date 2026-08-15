import type { DecorationItem } from '@shikijs/core'
import { transformerRenderWhitespace } from '@shikijs/transformers'
import { bundledThemesInfo, getHighlighter } from 'shiki'
import { derive } from 'valtio/utils'

import type { RefObject } from '../../base'
import { cssvar } from '../../base'
import type { InlineReplacement, ResolvedCursor, ShikitorOptions } from '../../editor'
import { isMultipleKey, isWhatBrowser } from '../../utils' with {
  'unbundled-reexport': 'on'
}
import { scoped } from '../../utils/valtio/scoped'
import { HIGHLIGHTED, OUTPUT_HIGHLIGHTED } from '../classes'
import { shikitorStructureTransformer } from '../structureTransfomer'

const darkThemes = new Set(
  bundledThemesInfo
    .filter(({ type }) => type === 'dark')
    .map(({ id }) => id)
)

export function normalizeDecorations(
  value: string,
  decorations?: DecorationItem[]
): DecorationItem[] | undefined {
  if (!decorations?.length || value.length === 0) return undefined

  const lineStarts = [0]
  for (let offset = 0; offset < value.length; offset++) {
    if (value[offset] === '\n') lineStarts.push(offset + 1)
  }
  const resolveOffset = (position: DecorationItem['start']) => {
    if (typeof position === 'number') return position
    const { line, character } = position
    if (
      !Number.isInteger(line)
      || !Number.isInteger(character)
      || line < 0
      || line >= lineStarts.length
      || character < 0
    ) return undefined
    const lineStart = lineStarts[line]
    const lineEnd = line + 1 < lineStarts.length
      ? lineStarts[line + 1] - 1
      : value.length
    if (character > lineEnd - lineStart) return undefined
    return lineStart + character
  }

  const normalized: DecorationItem[] = []
  for (const decoration of decorations) {
    const start = resolveOffset(decoration.start)
    const end = resolveOffset(decoration.end)
    if (
      start === undefined
      || end === undefined
      || !Number.isInteger(start)
      || !Number.isInteger(end)
      || start < 0
      || end <= start
      || start >= value.length
      || end > value.length
    ) continue

    // Shiki 1.12's whitespace transformer cannot safely process a decoration
    // whose range includes a line break. Split otherwise-valid multi-line
    // ranges into one decoration per visible line and omit newline-only spans.
    let segmentStart = start
    for (let offset = start; offset < end; offset++) {
      if (value[offset] !== '\n') continue
      if (segmentStart < offset) {
        normalized.push({ ...decoration, start: segmentStart, end: offset })
      }
      segmentStart = offset + 1
    }
    if (segmentStart < end) {
      normalized.push({ ...decoration, start: segmentStart, end })
    }
  }
  return normalized.length ? normalized : undefined
}

export function normalizeInlineReplacementDecorations(
  value: string,
  replacements?: InlineReplacement[]
): DecorationItem[] | undefined {
  if (!replacements?.length) return undefined

  const decorations = replacements.map((replacement, index) => {
    const className = [
      replacement.properties?.class,
      'shikitor-inline-replacement'
    ].filter(Boolean).join(' ')
    const style = [
      replacement.properties?.style,
      `--shikitor-inline-replacement-size:${replacement.inlineSize ?? '1em'}`,
      replacement.blockSize
        ? `--shikitor-inline-replacement-block-size:${replacement.blockSize}`
        : undefined
    ].filter(Boolean).join(';')
    return {
      start: replacement.start,
      end: replacement.end,
      alwaysWrap: true,
      properties: {
        ...replacement.properties,
        class: className,
        style,
        'data-shikitor-inline-replacement': String(index),
        ...(replacement.interaction === 'atomic'
          ? { 'data-shikitor-inline-replacement-interaction': 'atomic' }
          : {})
      }
    } satisfies DecorationItem
  })
  const normalized = normalizeDecorations(value, decorations)
  return normalized?.map(decoration => ({
    ...decoration,
    properties: {
      ...decoration.properties,
      'data-shikitor-source-start': String(decoration.start),
      'data-shikitor-source-end': String(decoration.end),
      'data-shikitor-source-text': value.slice(
        decoration.start as number,
        decoration.end as number
      )
    }
  }))
}

interface LatestRenderHandlers<Input, Output> {
  renderFallback: (input: Input) => void
  renderAsync: (
    input: Input,
    isCurrent: () => boolean
  ) => Promise<Output | undefined>
  commit: (output: Output, input: Input) => void
  onError?: (error: unknown, input: Input) => void
}

export function createLatestRenderController<Input, Output>(
  handlers: LatestRenderHandlers<Input, Output>
) {
  let renderVersion = 0
  let disposed = false

  return {
    async render(input: Input) {
      if (disposed) return
      const currentRender = ++renderVersion
      const isCurrent = () => !disposed && currentRender === renderVersion
      handlers.renderFallback(input)
      try {
        const rendered = await handlers.renderAsync(input, isCurrent)
        if (rendered === undefined || !isCurrent()) return
        handlers.commit(rendered, input)
      } catch (error) {
        if (isCurrent()) handlers.onError?.(error, input)
      }
    },
    dispose() {
      disposed = true
      renderVersion++
    }
  }
}

/**
 * Resolve the horizontal offset shared by the rendered code and cursor layers.
 *
 * Most editors can use the textarea's native scrollLeft. Visual transforms such
 * as code folding may, however, compose a rendered line that is wider than any
 * physical source line. Those transforms publish their own visual offset so a
 * later vertical textarea scroll cannot snap the rendered document back to the
 * textarea's smaller native range.
 */
export function resolveVisualScrollLeft(
  inputScrollLeft: number,
  visualScrollLeft: string
) {
  const resolved = Number.parseFloat(visualScrollLeft)
  return Number.isFinite(resolved) ? resolved : inputScrollLeft
}

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
  input.setAttribute('wrap', 'off')

  output.classList.add('shikitor-output')
  input.addEventListener('scroll', () => {
    setTimeout(() => {
      const scrollLeft = resolveVisualScrollLeft(
        input.scrollLeft,
        target.style.getPropertyValue(cssvar('visual-scroll-l'))
      )
      target.style.setProperty(cssvar('scroll-t'), `${input.scrollTop}px`)
      target.style.setProperty(cssvar('scroll-l'), `${scrollLeft}px`)
      target.style.setProperty(cssvar('offset-x'), 'calc(-1 * var(--shikitor-scroll-l, 0px))')
      target.style.setProperty(cssvar('offset-y'), 'calc(-1 * var(--shikitor-scroll-t, 0px))')
      // wait the output renders, whether not wait it, the scrollTop can't be set
      output.scrollTop = input.scrollTop
      output.scrollLeft = scrollLeft
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
  const highlighters = new Map<string, ReturnType<typeof getHighlighter>>()

  function getCachedHighlighter(theme: string, language: string) {
    const key = `${theme}\0${language}`
    let highlighter = highlighters.get(key)
    if (!highlighter) {
      highlighter = getHighlighter({ themes: [theme], langs: [language] })
      highlighters.set(key, highlighter)
      void highlighter.catch(() => {
        if (highlighters.get(key) === highlighter) highlighters.delete(key)
      })
    }
    return highlighter
  }

  function renderPlainText(value: string, theme: string) {
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.className = 'shikitor-output-lines'
    value.split('\n').forEach((source, index) => {
      const line = document.createElement('div')
      line.className = 'shikitor-output-line'
      line.dataset.line = String(index + 1)
      line.textContent = source || ' '
      code.append(line)
    })
    pre.append(code)
    output.replaceChildren(pre)
    output.dataset.renderState = 'plaintext'
    const isDark = darkThemes.has(theme)
    output.style.color = isDark ? '#c9d1d9' : '#24292f'
    output.style.backgroundColor = isDark ? '#0d1117' : '#ffffff'
  }

  function renderGutter(value: string) {
    const lineCounts = value.split('\n').length
    const gutterLinePrefix = `${'shikitor'}-gutter-line`
    lines.style.setProperty(cssvar('line-digit-count'), `${lineCounts.toString().length}ch`)
    lines.innerHTML = Array
      .from({ length: lineCounts })
      .map((_, i) => (`<div class="${gutterLinePrefix}" data-line="${i + 1}">
        <div class="${gutterLinePrefix}-number">${i + 1}</div>
      </div>`))
      .join('')
  }

  function syncCurrentLineHighlight() {
    const cursorLine = cursorRef.current.line
    const targets = [
      [lines, HIGHLIGHTED],
      [output, OUTPUT_HIGHLIGHTED]
    ] as const
    for (const [container, className] of targets) {
      const oldLine = container.querySelector(`.${className}`)
      const line = cursorLine
        ? container.querySelector<HTMLElement>(`[data-line="${cursorLine}"]`)
        : undefined
      if (oldLine === line) continue
      oldLine?.classList.remove(className)
      line?.classList.add(className)
    }
  }
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
  const outputRenderDeps = derive({
    theme: get => get(optionsRef).current.theme,
    language: get => get(optionsRef).current.language,
    // TODO remove decorations
    decorations: get => get(optionsRef).current.decorations,
    inlineReplacements: get => get(optionsRef).current.inlineReplacements
  })
  interface RenderInput {
    value: string
    theme: string
    language: string
    decorations?: DecorationItem[]
    inlineReplacements?: InlineReplacement[]
  }
  const renderer = createLatestRenderController<RenderInput, string>({
    renderFallback({ value, theme }) {
      renderPlainText(value, theme)
      renderGutter(value)
      syncCurrentLineHighlight()
    },
    async renderAsync({ value, theme, language, decorations, inlineReplacements }, isCurrent) {
      const highlighter = await getCachedHighlighter(theme, language)
      // Do not let an obsolete theme/language request mutate target theme
      // variables through the structure transformer.
      if (!isCurrent()) return
      return highlighter.codeToHtml(value, {
        lang: language,
        theme,
        decorations: [
          ...(normalizeDecorations(value, decorations) ?? []),
          ...(normalizeInlineReplacementDecorations(value, inlineReplacements) ?? [])
        ],
        transformers: [
          shikitorStructureTransformer(target),
          transformerRenderWhitespace()
        ]
      })
    },
    commit(highlighted) {
      output.innerHTML = highlighted
      output.dataset.renderState = 'highlighted'
      output.style.removeProperty('color')
      output.style.removeProperty('background-color')
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
      inlineReplacements
    } = get(outputRenderDeps)
    if (value === undefined) return
    void renderer.render({ value, theme, language, decorations, inlineReplacements })
  })
  scopeSubscribe(cursorRef, () => {
    syncCurrentLineHighlight()
  })
  return () => {
    renderer.dispose()
    disposeScoped()
    for (const highlighter of highlighters.values()) {
      void highlighter.then(instance => instance.dispose()).catch(() => {})
    }
    highlighters.clear()
  }
}
