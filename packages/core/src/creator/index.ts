import './index.scss'

import { Context } from 'cordis'
import { derive } from 'valtio/utils'
import { proxy, snapshot } from 'valtio/vanilla'

import type { _KeyboardEvent } from '../base'
import type { ResolvedSelection, Shikitor, ShikitorBase, ShikitorInternal, ShikitorOptions } from '../editor'
import type { ShikitorInputService } from '../input'
import type { ShikitorSyntaxWorker } from '../syntaxWorker'
import { callUpdateDispatcher, completeAssign, listen } from '../utils' with {
  'unbundled-reexport': 'on'
}
import { calcTextareaHeight } from '../utils/calcTextareaHeight'
import { resolveSelectionFocus } from '../utils/resolveSelectionFocus'
import { scoped } from '../utils/valtio/scoped'
import { cursorControlled } from './controlled/cursorControlled'
import { inputBindingsControlled } from './controlled/inputBindingsControlled'
import { initDom, outputRenderControlled } from './controlled/outputRenderControlled'
import { pluginsControlled, resolveUpdatedPluginInputs } from './controlled/pluginsControlled'
import { valueControlled } from './controlled/valueControlled'

/** Computed font properties are re-read at most this often (ms). */
const MEASURE_FONT_REFRESH_MS = 1000

const MEASURE_FONT_PROPERTIES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'fontStretch',
  'fontKerning',
  'fontFeatureSettings',
  'fontVariationSettings',
  'lineHeight',
  'textTransform',
  'letterSpacing',
  'wordSpacing'
] as const

export interface CreateOptions {
  abort?: AbortSignal
  /** Optional off-main-thread syntax service. The caller owns its lifecycle. */
  syntaxWorker?: ShikitorSyntaxWorker
}

export async function create(
  mount: HTMLElement,
  inputOptions: ShikitorOptions = {},
  options: CreateOptions = {}
): Promise<Shikitor> {
  let shikitor: Shikitor | undefined = undefined
  let inputService: ShikitorInputService | undefined
  const context = new Context()
  const {
    onChange,
    onCursorChange,
    onDispose,
    onFocused,
    onBlurred,
    onSelectionChange,
    onKeydown,
    onKeyup
  } = inputOptions
  const {
    abort
  } = options

  const disposes: (() => void)[] = []
  const { disposeScoped, scopeWatch } = scoped()
  let disposed = false

  const dispose = () => {
    if (disposed) return
    disposed = true
    context.emit('shikitor/dispose')
    disposeScoped()
    disposes.forEach(dispose => dispose())
    onDispose?.()
    void context.fiber.dispose()
  }
  const checkAborted = () => {
    if (abort?.aborted) {
      dispose()
      throw new Error('Aborted')
    }
  }
  await Promise.resolve()
  checkAborted()

  const dom = initDom(mount)
  const { target, input, output, placeholder, lines } = dom
  disposes.push(dom.dispose)
  let measureElement: HTMLSpanElement | undefined
  let measureFontKey = ''
  let measureFrameValid = false
  let measureFontCheckedAt = 0
  let measureBoxOffset = { left: 0, top: 0 }
  let measureLineBoxHeight = 0
  let measureLineBoxKey = ''
  const measureSpan = () => {
    if (measureElement?.isConnected) return measureElement
    const span = document.createElement('span')
    span.className = 'shikitor-measure'
    span.setAttribute('aria-hidden', 'true')
    span.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: break-word;
      visibility: hidden;
      pointer-events: none;
    `
    document.body.appendChild(span)
    measureElement = span
    measureFontKey = ''
    measureLineBoxKey = ''
    measureFrameValid = false
    measureFontCheckedAt = 0
    return span
  }
  // Height of one empty line box for the current font; cached per font.
  const measureLineBox = (span: HTMLSpanElement) => {
    if (measureLineBoxKey === measureFontKey) return measureLineBoxHeight
    const text = span.textContent
    span.textContent = ' '
    measureLineBoxHeight = span.getBoundingClientRect().height
    measureLineBoxKey = measureFontKey
    span.textContent = text
    return measureLineBoxHeight
  }
  disposes.push(() => {
    measureElement?.remove()
    measureElement = undefined
  })
  const listenInput = <K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    capture = false
  ) => {
    input.addEventListener(type, listener, capture)
    disposes.push(() => input.removeEventListener(type, listener, capture))
  }

  const optionsRef = proxy({
    current: {
      ...inputOptions,
      value: inputOptions.value ?? (dom.attached ? input.value : undefined),
      plugins: inputOptions.plugins ?? []
    }
  })
  checkAborted()

  const {
    dispose: disposeValueControlled,
    valueRef,
    rawTextHelperRef
  } = valueControlled(input, optionsRef, value => {
    onChange?.(value)
    context.emit('shikitor/change', value)
  })
  disposes.push(disposeValueControlled)
  const {
    dispose: disposeCursorControlled,
    cursorRef
  } = cursorControlled(
    () => shikitor,
    target,
    input,
    rawTextHelperRef,
    optionsRef,
    cursor => {
      onCursorChange?.(cursor)
      context.emit('shikitor/cursor-change', cursor)
    }
  )
  disposes.push(disposeCursorControlled)
  const {
    dispose: disposePluginsControlled,
    install: installAllPlugins,
    shikitorSupportPlugin
  } = pluginsControlled(optionsRef, context)
  disposes.push(disposePluginsControlled)

  const autoSizeRef = derive({
    minRows: get => {
      const inputAutoSize = get(optionsRef).current.autoSize
      if (!inputAutoSize) return
      return inputAutoSize === true ? 1 : Math.max(1, inputAutoSize.minRows ?? 1)
    },
    maxRows: get => {
      const inputAutoSize = get(optionsRef).current.autoSize
      if (!inputAutoSize) return
      return inputAutoSize === true ? 5 : Math.max(1, inputAutoSize.maxRows ?? 5)
    },
    enabled: get => {
      const inputAutoSize = get(optionsRef).current.autoSize
      return inputAutoSize !== false
    }
  })
  scopeWatch(get => {
    // noinspection BadExpressionStatementJS
    get(valueRef).current
    const { enabled, minRows, maxRows } = get(autoSizeRef)
    if (!enabled || !minRows || !maxRows) return

    const { height, minHeight } = calcTextareaHeight(input, minRows, maxRows)
    height && (target.style.height = height)
    minHeight && (target.style.minHeight = minHeight)
  })

  const placeholderRef = derive({
    current: get => get(optionsRef).current.placeholder
  })
  scopeWatch(get => {
    const text = get(placeholderRef).current
    const value = get(valueRef).current
    if (text) {
      if (value.length === 0) {
        placeholder.innerText = text
      } else {
        placeholder.innerText = ''
      }
    }
  })

  const selectionsRef = proxy({
    current: [] as ResolvedSelection[]
  })
  const syncSelection = (event?: Event) => {
    if (!shikitor) return
    // Reading the document selection forces style and layout; a focused
    // textarea already identifies the selection as ours.
    const eventBelongsToInput = event?.target === input || document.activeElement === input
    if (!eventBelongsToInput) {
      const { focusNode } = document.getSelection() ?? {}
      if (
        (
          !(focusNode instanceof HTMLElement)
          || focusNode.closest(`.${'shikitor'}`) !== target
        )
        && (
          !(event?.target instanceof HTMLElement)
          || event.target.closest(`.${'shikitor'}`) !== target
        )
      ) return
    }

    const { resolvePosition } = shikitor.rawTextHelper
    const selections = selectionsRef.current
    const [start, end] = [input.selectionStart, input.selectionEnd]
    const selection = { start: resolvePosition(start), end: resolvePosition(end) }
    const [prevSelection] = selections
    const pos = resolvePosition(resolveSelectionFocus(
      start,
      end,
      input.selectionDirection
    ))
    if (resolvePosition(optionsRef.current.cursor ?? 0).offset !== pos.offset) {
      optionsRef.current.cursor = resolvePosition(pos)
    }
    if (
      selection.start.offset !== prevSelection?.start.offset
      || selection.end.offset !== prevSelection?.end.offset
    ) {
      selectionsRef.current[0] = selection
    }
  }
  // Textarea selection changes are not consistently surfaced as a document
  // selectionchange event. Keep the rendered caret in sync with the host
  // textarea for typing, keyboard navigation, and pointer selection too.
  disposes.push(listen(document, 'selectionchange', syncSelection))
  listenInput('input', syncSelection)
  listenInput('select', syncSelection)
  listenInput('keyup', syncSelection)
  listenInput('mouseup', syncSelection)

  disposes.push(outputRenderControlled(
    { target, input, lines, output },
    { valueRef, cursorRef, optionsRef, syntaxWorker: options.syntaxWorker }
  ))

  const shikitorInternal: ShikitorInternal = {
    _getCursorAbsolutePosition(cursor, lineOffset = 0): { x: number; y: number } {
      const { rawTextHelper: { line } } = this
      const span = measureSpan()
      // Reading computed style after DOM writes forces a style recalculation;
      // plugins resolve geometry many times per frame, so the font/box
      // snapshot is refreshed at most once per animation frame.
      if (!measureFrameValid) {
        measureFrameValid = true
        requestAnimationFrame(() => { measureFrameValid = false })
        const now = performance.now()
        if (!measureFontKey || now - measureFontCheckedAt > MEASURE_FONT_REFRESH_MS) {
          measureFontCheckedAt = now
          const style = getComputedStyle(input)
          const fontKey = MEASURE_FONT_PROPERTIES
            .map(prop => style[prop as keyof CSSStyleDeclaration] as string)
            .join('\0')
          if (fontKey !== measureFontKey) {
            measureFontKey = fontKey
            MEASURE_FONT_PROPERTIES.forEach(prop => {
              // @ts-ignore
              span.style[prop] = style[prop]
            })
          }
          measureBoxOffset = dom.attached
            ? { left: 0, top: 0 }
            : {
                left: parseInt(style.marginLeft) + parseInt(style.paddingLeft),
                top: parseInt(style.marginTop) + parseInt(style.paddingTop)
              }
        }
      }
      const reallyLine = cursor.line + lineOffset - 1
      const computedLine = Math.max(reallyLine, 0)
      const text = line(cursor).substring(0, cursor.character)
      const inTheLineStart = cursor.character === 0
      // Measure only the caret line. Preceding lines are plain line boxes of
      // the same height, so their contribution is arithmetic instead of a
      // layout over the whole document prefix.
      span.textContent = inTheLineStart ? ' ' : text
      const rect = span.getBoundingClientRect()
      const lineBox = inTheLineStart ? rect.height : measureLineBox(span)
      const { left, top } = measureBoxOffset
      return {
        x: (inTheLineStart ? 0 : rect.right) + left,
        y: (reallyLine === -1 ? 0 : rect.bottom + computedLine * lineBox) + top
      }
    }
  }
  const shikitorDisposable: Disposable = {
    [Symbol.dispose]() {
      dispose()
    }
  }
  const shikitorBase: ShikitorBase = {
    get element() {
      return target
    },
    get inputElement() {
      return input
    },
    get input() {
      if (!inputService) throw new Error('Shikitor input service is not ready')
      return inputService
    },
    get value() {
      return valueRef.current
    },
    set value(value) {
      optionsRef.current.value = value
    },
    get optionsRef() {
      return optionsRef
    },
    get options() {
      return snapshot(optionsRef).current as Shikitor['options']
    },
    set options(newOptions) {
      this.updateOptions(newOptions)
    },
    async updateOptions(newOptions) {
      const previousOptions = this.options
      const updatedOptions = callUpdateDispatcher(newOptions, previousOptions) ?? {}
      const shouldAutoFocus = updatedOptions.autoFocus === true
        && previousOptions.autoFocus !== true
      const pluginsProvided = Object.prototype.hasOwnProperty.call(updatedOptions, 'plugins')
      const {
        cursor,
        plugins,
        ...resolvedOptions
      } = updatedOptions
      let newCursor = optionsRef.current.cursor
      if (cursor !== undefined) {
        const { resolvePosition } = this.rawTextHelper
        if (resolvePosition(cursor).offset !== resolvePosition(newCursor ?? 0).offset) {
          newCursor = cursor
        }
      }
      optionsRef.current = {
        ...resolvedOptions,
        cursor: newCursor,
        plugins: resolveUpdatedPluginInputs(
          optionsRef.current.plugins,
          plugins,
          previousOptions.plugins,
          pluginsProvided
        )
      }
      if (shouldAutoFocus && document.activeElement !== input) {
        this.focus(newCursor)
      }
    },
    get language() {
      return this.options.language
    },
    set language(language) {
      this.updateLanguage(language)
    },
    updateLanguage(language) {
      const newLanguage = callUpdateDispatcher(language, this.language)
      if (newLanguage === undefined) {
        return
      }
      optionsRef.current.language = newLanguage
    },
    get cursor() {
      return snapshot(cursorRef).current
    },
    focus(cursor, focusOptions) {
      const { resolvePosition } = this.rawTextHelper
      const resolvedStartPos = resolvePosition(cursor ?? 0)
      input.setSelectionRange(
        resolvedStartPos.offset,
        resolvedStartPos.offset
      )
      input.focus(focusOptions)
    },
    blur() {
      input.blur()
    },
    get rawTextHelper() {
      return snapshot(rawTextHelperRef).current
    },
    get selections() {
      return snapshot(selectionsRef).current
    },
    get selectionsRef() {
      return selectionsRef
    },
    updateSelection(index, selectionOrGetSelection) {
      const selections = selectionsRef.current
      if (index < 0 || index >= selections.length) {
        return
      }
      const selectionT0 = selections[index]
      const selectionT1 = callUpdateDispatcher(selectionOrGetSelection, selectionT0)
      if (selectionT1 === undefined) {
        return
      }

      const { resolvePosition } = this.rawTextHelper
      const prevResolvedPrevSelection = {
        start: resolvePosition(selectionT0.start),
        end: resolvePosition(selectionT0.end)
      }
      const resolvedSelection = {
        start: resolvePosition(selectionT1.start),
        end: resolvePosition(selectionT1.end)
      }
      if (
        [
          prevResolvedPrevSelection.start.offset !== resolvedSelection.start.offset,
          prevResolvedPrevSelection.end.offset !== resolvedSelection.end.offset
        ].some(Boolean)
      ) {
        selections[index] = resolvedSelection
      }
      input.setSelectionRange(resolvedSelection.start.offset, resolvedSelection.end.offset)
    },
    setRangeText({ start, end }, text) {
      const { resolvePosition } = this.rawTextHelper
      const resolvedStart = resolvePosition(start)
      const resolvedEnd = resolvePosition(end)
      // A focused textarea can take the edit through the browser's editing
      // engine, exactly like typing: the native undo stack records it and
      // the textarea patches its internal text instead of rebuilding every
      // line (Chrome re-creates one text node and <br> per line for
      // setRangeText/value assignments). Unfocused editors, or browsers that
      // refuse the command, keep the programmatic path.
      if (
        document.activeElement === input
        && typeof document.execCommand === 'function'
      ) {
        const previous = input.value
        input.setSelectionRange(resolvedStart.offset, resolvedEnd.offset)
        try {
          if (document.execCommand('insertText', false, text) && input.value !== previous) {
            return Promise.resolve()
          }
        } catch {
          // Fall through to the programmatic edit.
        }
      }
      input.setRangeText(text, resolvedStart.offset, resolvedEnd.offset, 'end')
      input.dispatchEvent(new Event('input'))
      return Promise.resolve()
    }
  }
  const base = completeAssign(
    shikitorBase,
    shikitorDisposable
  )
  const baseWithInternal = completeAssign(
    base,
    shikitorInternal
  )
  shikitor = completeAssign(
    baseWithInternal,
    shikitorSupportPlugin
  )
  context.provide('shikitor', shikitor)
  // Keep the legacy keyboard hooks registered before the normalized binding
  // router. A binding may synchronously stop immediate propagation, but that
  // must not make the long-standing shikitor/keydown API disappear.
  listenInput('keydown', e => {
    context.emit('shikitor/keydown', e as _KeyboardEvent)
    onKeydown?.(e as _KeyboardEvent)
  }, true)
  listenInput('keyup', e => {
    context.emit('shikitor/keyup', e as _KeyboardEvent)
    onKeyup?.(e as _KeyboardEvent)
  }, true)
  listenInput(
    'keypress',
    e => context.emit('shikitor/keypress', e as _KeyboardEvent),
    true
  )
  const { service, dispose: disposeInputBindings } = inputBindingsControlled({
    target,
    input,
    context,
    shikitor,
    platform: inputOptions.input?.platform
  })
  inputService = service
  disposes.push(disposeInputBindings)
  await installAllPlugins()
  checkAborted()

  scopeWatch(get => {
    const selections = get(selectionsRef).current
    onSelectionChange?.(selections)
    context.emit('shikitor/selection-change', selections)
  })
  listenInput('focus', () => {
    context.emit('shikitor/focus')
    onFocused?.()
  })
  listenInput('blur', () => {
    context.emit('shikitor/blur')
    onBlurred?.()
  })
  if (inputOptions.autoFocus && document.activeElement !== input) {
    shikitor.focus(inputOptions.cursor)
  }
  return shikitor
}
