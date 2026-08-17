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
import { pluginsControlled } from './controlled/pluginsControlled'
import { valueControlled } from './controlled/valueControlled'

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
  disposes.push(listen(document, 'selectionchange', e => {
    if (!shikitor) return
    const { focusNode } = document.getSelection() ?? {}
    if (
      (
        !(focusNode instanceof HTMLElement)
        || focusNode.closest(`.${'shikitor'}`) !== target
      )
      && (
        !(e.target instanceof HTMLElement)
        || e.target.closest(`.${'shikitor'}`) !== target
      )
    ) return

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
  }))

  disposes.push(outputRenderControlled(
    { target, input, lines, output },
    { valueRef, cursorRef, optionsRef, syntaxWorker: options.syntaxWorker }
  ))

  const shikitorInternal: ShikitorInternal = {
    _getCursorAbsolutePosition(cursor, lineOffset = 0): { x: number; y: number } {
      const { rawTextHelper: { line } } = this
      const span = document.createElement('span')
      const inputStyle = getComputedStyle(input)
      span.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-wrap: break-word;
        visibility: hidden;
      `
      const style = getComputedStyle(input)
      ;[
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
      ].forEach(
        prop => {
          // @ts-ignore
          span.style[prop] = style[prop]
        }
      )
      const reallyLine = cursor.line + lineOffset - 1
      const computedLine = Math.max(reallyLine, 0)
      const text = line(cursor).substring(0, cursor.character)
      const inTheLineStart = cursor.character === 0
      span.textContent = inTheLineStart
        ? `${'\n'.repeat(computedLine)} `
        : `${'\n'.repeat(computedLine)}${text}`
      document.body.appendChild(span)
      const rect = span.getBoundingClientRect()
      document.body.removeChild(span)
      const inputStyle = getComputedStyle(input)
      const left = dom.attached
        ? 0
        : parseInt(inputStyle.marginLeft) + parseInt(inputStyle.paddingLeft)
      const top = dom.attached
        ? 0
        : parseInt(inputStyle.marginTop) + parseInt(inputStyle.paddingTop)
      return {
        x: (inTheLineStart ? 0 : rect.right) + left,
        y: (reallyLine === -1 ? 0 : rect.bottom) + top
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
      const {
        cursor,
        plugins,
        ...resolvedOptions
      } = callUpdateDispatcher(newOptions, this.options) ?? {}
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
        plugins: [...plugins ?? []]
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
  return shikitor
}
