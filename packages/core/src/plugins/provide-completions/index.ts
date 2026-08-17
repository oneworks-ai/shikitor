import './index.scss'

import type { ResolvedPosition } from '@shikijs/core'
import type { IDisposable, LanguageSelector, ProviderResult, Shikitor } from '@shikitor/core'
import type { TextRange } from '@shikitor/core'
import { definePlugin } from '@shikitor/core'
import type {} from '@shikitor/core/plugins/provide-popup'
import type { RecursiveReadonly } from '@shikitor/core/types'
import { classnames, icon, isMultipleKey, isUnset, UNSET } from '@shikitor/core/utils' with {
  'unbundled-reexport': 'on'
}
import { refProxy, scoped } from '@shikitor/core/utils/valtio'
import { derive } from 'valtio/utils'
import { proxy, ref, snapshot } from 'valtio/vanilla'

import type { RawTextHelper } from '../../utils/getRawTextHelper'

const name = 'provide-completions'

export enum CompletionItemKind {
  Method = 0,
  Function = 1,
  Constructor = 2,
  Field = 3,
  Variable = 4,
  Class = 5,
  Struct = 6,
  Interface = 7,
  Module = 8,
  Property = 9,
  Event = 10,
  Operator = 11,
  Unit = 12,
  Value = 13,
  Constant = 14,
  Enum = 15,
  EnumMember = 16,
  Keyword = 17,
  Text = 18,
  Color = 19,
  File = 20,
  Reference = 21,
  Customcolor = 22,
  Folder = 23,
  TypeParameter = 24,
  User = 25,
  Issue = 26,
  Snippet = 27
}

/**
 * Render a completion item's leading icon.
 *
 * Return a fresh DOM node for every call. Consumers can return an `img`, an
 * `svg`, or any other node without handing raw HTML to Shikitor.
 */
export type CompletionItemIconRenderer = () => Node | null | undefined

export interface CompletionRequest {
  readonly triggerCharacter: string
  readonly query: string
}

export interface CompletionItemInner {
  label: string
  /** Text used for filtering when it differs from the displayed label. */
  filterText?: string
  kind?: CompletionItemKind
  /**
   * Override the icon inferred from {@link kind}. When the renderer returns no
   * node or throws, Shikitor keeps the kind icon as a safe fallback.
   */
  renderIcon?: CompletionItemIconRenderer
  detail?: string
  documentation?: string
  range: TextRange
  insertText: string
  /**
   * Run a host-owned acceptance path instead of applying {@link insertText}.
   * Return `true` when the host handled the selection; any other result keeps
   * the ordinary text replacement behavior.
   */
  onAccept?: () => boolean | void
  /**
   * @internal
   */
  additionalTextEdits?: unknown[]
}

declare module '@shikitor/core' {
  export type CompletionItem = CompletionItemInner
  export interface CompletionList extends IDisposable {
    suggestions: CompletionItemInner[]
  }
  export interface CompletionItemProvider {
    triggerCharacters?: string[]
    /**
     * Provide completion items for the given position and document.
     */
    provideCompletionItems(
      rawTextHelper: RawTextHelper,
      position: ResolvedPosition,
      request: CompletionRequest
    ): ProviderResult<CompletionList>
  }
  export interface ShikitorProvideCompletions {
    registerCompletionItemProvider: (selector: LanguageSelector, provider: CompletionItemProvider) => IDisposable
    /** Open the completion surface without requiring a typed trigger character. */
    show: (triggerCharacter: string) => boolean
    /** Close the active completion surface, if any. */
    hide: () => void
  }
}

declare module 'cordis' {
  interface Context {
    shikitorCompletions: import('@shikitor/core').ShikitorProvideCompletions
  }
}

/**
 * Split keyword by space, comma, dot and upper case.
 * ```ts
 * splitKeywords('a.b c, d') // ['a', 'b', 'c', 'd']
 * splitKeywords('aBc') // ['a', 'b', 'c']
 * ```
 * @param keyword
 */
function splitKeywords(keyword: string) {
  return keyword
    .split(/(?=[A-Z])|[\s,.]/)
    .filter(Boolean)
    .map(s => s.toLowerCase())
}

function escapeHTML(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function highlightingKeyword(text: string, keywordParts: string[]) {
  const { prefix } = completionItemTemplate
  const highlighted = Array.from({ length: text.length }, () => false)
  const lowerText = text.toLocaleLowerCase()
  for (const keyword of keywordParts) {
    const index = lowerText.indexOf(keyword.toLocaleLowerCase())
    if (index === -1) continue
    for (let offset = index; offset < index + keyword.length; offset++) highlighted[offset] = true
  }
  let result = ''
  for (let start = 0; start < text.length;) {
    const marked = highlighted[start]
    let end = start + 1
    while (end < text.length && highlighted[end] === marked) end++
    const content = escapeHTML(text.slice(start, end))
    result += marked ? `<span class="${prefix}__keyword">${content}</span>` : content
    start = end
  }
  return result
}

function completionItemTemplate(
  keywordParts: string[],
  selectedIndex: number,
  item: RecursiveReadonly<CompletionItemInner>,
  index: number
) {
  const { prefix } = completionItemTemplate
  const kind = item.kind !== undefined ? CompletionItemKind[item.kind]?.[0] ?? 'U' : 'U'
  return `
    <div class="${classnames(prefix, selectedIndex === index && 'selected')}" data-index="${index}">
      <div class="${prefix}__kind">${kind}</div>
      <div class="${prefix}__label">${highlightingKeyword(item.label, keywordParts)}</div>
      ${item.detail ? `<div class="${prefix}__detail">${escapeHTML(item.detail)}</div>` : ''}
      ${item.documentation ? `<div class="${prefix}__documentation">${escapeHTML(item.documentation)}</div>` : ''}
    </div>
  `
}
completionItemTemplate.prefix = `${'shikitor'}-completion-item` as const

/**
 * Mount a consumer-provided completion icon without accepting raw HTML.
 *
 * @returns Whether a custom icon was mounted.
 */
export function mountCompletionItemIcon(
  target: HTMLElement,
  renderIcon: CompletionItemIconRenderer
) {
  try {
    const node = renderIcon()
    if (!node) return false
    target.replaceChildren(node)
    return true
  } catch {
    return false
  }
}

export interface ProvideCompletionsOptions {
  /**
   * @default 'need-confirm'
   */
  selectMode?: 'once' | 'need-confirm'
  /**
   * @default 'bottom'
   */
  popupPlacement?: 'top' | 'bottom'
  /**
   * @default true
   */
  tooltip?: string | boolean
  /**
   * @default true
   */
  footer?: boolean
  /**
   * @default 'No completions available'
   */
  emptyText?: string
  /**
   * @internal TODO support group completions popup
   */
  groups?: Record<string, ProvideCompletionsOptions>
}
export default definePlugin({
  name,
  inject: ['shikitor', 'shikitorPopup'],
  apply(ctx, options: ProvideCompletionsOptions = {}) {
  const {
    selectMode = 'once',
    popupPlacement = 'bottom'
  } = options
  const { disposeScoped, scopeSubscribe } = scoped()
  const elementRef = proxy({ current: ref<HTMLDivElement | typeof UNSET>(UNSET) })

  const keywordRef = refProxy(undefined as -1 | string | undefined)
  const triggerCharacter = proxy({
    current: undefined as string | undefined,
    offset: undefined as number | undefined
  })
  const allTriggerCharacters = proxy<string[]>([])
  let lastReconciledValue = ctx.shikitor.value

  const completions = proxy<CompletionItemInner[]>([])
  const resolvedCompletions = derive({
    current: get => {
      const keyword = get(keywordRef).current
      const cps = snapshot(get(completions))
      if (keyword === -1) return []

      return filterCompletions(cps, keyword)
    }
  })
  const completionsDeps = derive({
    keyword: get => get(keywordRef).current,
    element: get => get(elementRef).current,
    completions: get => get(resolvedCompletions).current
  })
  scopeSubscribe(completionsDeps, () => {
    const {
      keyword,
      element,
      completions
    } = completionsDeps
    if (isUnset(element)) return
    const completionsSnapshot = snapshot(completions)

    const selected = selectIndexRef.current
    const keywordStr = keyword === -1 ? '' : keyword ?? ''
    const innerCompletionItemTemplate = completionItemTemplate.bind(null, splitKeywords(keywordStr), selected)
    const completionsContent = completionsSnapshot.length === 0
      ? `<div class="${'shikitor'}-completions__empty">${escapeHTML(options.emptyText ?? 'No completions available')}</div>`
      : completionsSnapshot.map(innerCompletionItemTemplate).join('')
    const {
      footer = true,
      tooltip = true
    } = options
    const tooltipStr = tooltip === true
      ? 'Press <kbd>↑</kbd> <kbd>↓</kbd> to navigate, <kbd>↵</kbd>/<kbd>Tab</kbd> to select'
      : escapeHTML(tooltip || '')
    const footerStr = footer
      ? `<div class="${'shikitor'}-completions__footer">
            <div class="${'shikitor'}-completions__tooltip">${tooltipStr}</div>
            <div class="${'shikitor'}-completions__setting">
              <button>${icon('settings')}</button>
            </div>
          </div>`
      : ''
    element.innerHTML = `
      <div class="${'shikitor'}-completions__list">
        ${completionsContent}
      </div>
      ${footerStr}
    `
    const completionListElement = element.querySelector<HTMLElement>(
      `.${'shikitor'}-completions__list`
    )
    completionListElement?.addEventListener('wheel', event => {
      // The popup owns its scroll gesture. Embedded hosts commonly forward
      // wheel events from their editor scrollport and may prevent the list's
      // native scrolling when the event reaches that outer boundary.
      event.stopPropagation()
    }, { passive: true })
    const completionElements = element.querySelectorAll<HTMLElement>(`.${completionItemTemplate.prefix}`)
    completions.forEach((completion, index) => {
      const renderIcon = completion.renderIcon
      if (typeof renderIcon !== 'function') return
      const iconTarget = completionElements[index]
        ?.querySelector<HTMLElement>(`.${completionItemTemplate.prefix}__kind`)
      if (!iconTarget) return
      if (mountCompletionItemIcon(iconTarget, renderIcon as CompletionItemIconRenderer)) {
        iconTarget.classList.add(`${completionItemTemplate.prefix}__kind--custom`)
      }
    })
  })

  const displayDeps = derive({
    element: get => get(elementRef).current,
    display: get => get(triggerCharacter).current !== undefined
      && get(keywordRef).current !== -1
  })
  scopeSubscribe(displayDeps, () => {
    const {
      element,
      display
    } = displayDeps
    if (isUnset(element)) return

    if (display) {
      element.style.visibility = 'visible'
    } else {
      element.style.visibility = 'hidden'
    }
  })

  const selectIndexRef = proxy({ current: 0 })
  const selectIndexDeps = derive({
    element: get => get(elementRef).current,
    selectIndex: get => get(selectIndexRef).current
  })
  scopeSubscribe(selectIndexDeps, () => {
    const {
      element,
      selectIndex
    } = selectIndexDeps
    if (isUnset(element)) return

    const items = element.querySelectorAll<HTMLElement>(`.${'shikitor'}-completion-item`)
    let selectedItem: HTMLElement | undefined
    items.forEach((item, index) => {
      if (index === selectIndex) {
        item.classList.add('selected')
        selectedItem = item
      } else {
        item.classList.remove('selected')
      }
    })
    const list = element.querySelector<HTMLElement>(`.${'shikitor'}-completions__list`)
    if (selectedItem && list) {
      const itemRect = selectedItem.getBoundingClientRect()
      const listRect = list.getBoundingClientRect()
      const listStyle = getComputedStyle(list)
      const visibleTop = listRect.top + (Number.parseFloat(listStyle.paddingTop) || 0)
      const visibleBottom = listRect.bottom - (Number.parseFloat(listStyle.paddingBottom) || 0)
      if (itemRect.top < visibleTop) {
        list.scrollTop += itemRect.top - visibleTop
      } else if (itemRect.bottom > visibleBottom) {
        list.scrollTop += itemRect.bottom - visibleBottom
      }
    }
  })

  const resetSelectIndexWhenResolvedCompletionsChangeDeps = derive({
    length: get => get(resolvedCompletions).current.length
  })
  scopeSubscribe(resetSelectIndexWhenResolvedCompletionsChangeDeps, () => {
    if (selectIndexRef.current >= resolvedCompletions.current.length) {
      selectIndexRef.current = 0
    }
  })

  function resetTriggerCharacter() {
    triggerCharacter.current = undefined
    triggerCharacter.offset = undefined
  }

  function activateTrigger(char: string, offset: number, keyword = '') {
    keywordRef.current = keyword
    triggerCharacter.current = char
    triggerCharacter.offset = offset
  }

  function closeCompletions() {
    resetTriggerCharacter()
    keywordRef.current = -1
    completions.length = 0
    selectIndexRef.current = 0
    const element = elementRef.current
    if (!isUnset(element)) element.style.visibility = 'hidden'
  }

  function acceptCompletion(shikitor: Shikitor) {
    const completion = snapshot(resolvedCompletions.current[selectIndexRef.current])
    if (completion) {
      try {
        const onAccept = completion.onAccept as CompletionItemInner['onAccept']
        if (onAccept?.() === true) {
          closeCompletions()
          return true
        }
      } catch (error) {
        console.error('[shikitor] completion acceptance failed:', error)
        closeCompletions()
        return true
      }
      const keyword = keywordRef.current === -1
        ? ''
        : keywordRef.current ?? ''
      const { range, insertText } = completion
      const { rawTextHelper: { value, resolveTextRange } } = shikitor
      const resolvedRange = resolveTextRange(range)
      const prefix = value.slice(0, resolvedRange.start.offset)
      const suffix = value.slice(
        resolvedRange.end.offset
          // remove trigger character
          + 1
          // remove keyword
          + keyword.length
      )
      shikitor.value = prefix + insertText + suffix
      closeCompletions()
      setTimeout(() => {
        shikitor.focus(prefix.length + insertText.length)
      }, 0)
      return true
    }
    return false
  }
      const shikitor = ctx.shikitor
      const inputElement = shikitor.inputElement
      const onInput = (event: Event) => {
        const inputEvent = event as InputEvent
        const inputType = inputEvent.inputType
        if (inputType && !inputType.startsWith('insert')) return
        const offset = inputElement.selectionStart
        const value = inputElement.value
        const char = value[offset - 1]
        if (char && allTriggerCharacters.includes(char)) {
          if (!inputEvent.data || inputEvent.data.endsWith(char)) activateTrigger(char, offset)
          return
        }
        if (triggerCharacter.current !== undefined) return
        // Controlled hosts may restore a draft between delete and retype, so
        // reinserting the same trigger can be a DOM no-op with no trigger
        // event. Recover its ownership from the live token on the next input.
        for (let triggerIndex = offset - 1; triggerIndex >= 0; triggerIndex--) {
          const candidate = value[triggerIndex]
          if (candidate === undefined || /\s/u.test(candidate)) break
          if (!allTriggerCharacters.includes(candidate)) continue
          const triggerEnd = triggerIndex + 1
          activateTrigger(candidate, triggerEnd, value.slice(triggerEnd, offset))
          return
        }
      }
      inputElement.addEventListener('input', onInput)
      const { optionsRef } = shikitor
      const input = inputElement
      const cursorRef = derive({
        current: get => get(optionsRef).current.cursor
      })
      const languageRef = derive({
        current: get => get(optionsRef).current.language
      })
      const { disposeScoped: disposeProviderScope, scopeWatch } = scoped()
      const syncKeywordFromInput = () => {
        const triggerOffset = triggerCharacter.offset
        if (triggerCharacter.current === undefined || triggerOffset === undefined) return
        const keyword = resolveCompletionInputKeyword(
          input.value,
          input.selectionStart,
          triggerOffset
        )
        if (keyword === undefined) closeCompletions()
        else keywordRef.current = keyword
      }
      input.addEventListener('input', syncKeywordFromInput)
      ctx.provide('shikitorCompletions', {
        show(char) {
          if (!allTriggerCharacters.includes(char)) return false
          activateTrigger(char, shikitor.inputElement.selectionStart)
          return true
        },
        hide() {
          closeCompletions()
        },
        registerCompletionItemProvider(selector, provider) {
          let providerDispose: (() => void) | undefined
          let requestVersion = 0
          const { triggerCharacters, provideCompletionItems } = provider

          const completionSymbol = Symbol('completion')
          const registeredTriggerCharacters = [...triggerCharacters ?? []]
          allTriggerCharacters.push(...registeredTriggerCharacters)
          const disposeWatcher = scopeWatch(async get => {
            const version = ++requestVersion
            const char = get(triggerCharacter).current
            const keyword = get(keywordRef).current
            const language = get(languageRef).current
            if (selector !== '*' && selector !== language) return

            const cursor = cursorRef.current
            if (cursor === undefined) return
            const position = shikitor.rawTextHelper.resolvePosition(
              shikitor.inputElement.selectionStart
            )
            let suggestions: CompletionItemInner[] = []
            if (char && triggerCharacters?.includes(char)) {
              const { rawTextHelper } = shikitor
              providerDispose?.()
              const { suggestions: newSugs = [], dispose } = await provideCompletionItems(
                rawTextHelper,
                position,
                {
                  triggerCharacter: char,
                  query: keyword === -1 ? '' : keyword ?? '',
                }
              ) ?? {}
              if (version !== requestVersion) {
                dispose?.()
                return
              }
              suggestions = newSugs
              providerDispose = dispose
            }

            const oldCompletionsIndexes = completions
              .reduce((indexes, completion, index) => {
                // @ts-expect-error
                return completion[completionSymbol]
                  ? [...indexes, index]
                  : indexes
              }, [] as number[])
            const removedCompletions = completions
              .filter((_, index) => !oldCompletionsIndexes.includes(index))
            completions.length = 0
            completions.push(
              ...removedCompletions,
              ...suggestions.map(suggestion => ({
                ...suggestion,
                [completionSymbol]: true
              }))
            )
          })
          return {
            dispose() {
              requestVersion++
              disposeWatcher()
              providerDispose?.()
              for (const char of registeredTriggerCharacters) {
                const index = allTriggerCharacters.indexOf(char)
                if (index >= 0) allTriggerCharacters.splice(index, 1)
              }
            }
          }
        }
      })
      const popupProviderDisposable = ctx.shikitorPopup.registerPopupProvider({
        position: 'relative',
        placement: popupPlacement,
        target: 'cursor',
        providePopups() {
          return {
            dispose() {
              if (triggerCharacter.current === undefined) {
                completions.length = 0
              }
            },
            popups: [{
              id: 'completions-board',
              render: ele => {
                elementRef.current = ref(ele)
                ele.addEventListener('click', e => {
                  if (!(e.target instanceof HTMLElement)) return
                  const item = e.target.closest(`.${completionItemTemplate.prefix}`) as HTMLDivElement
                  if (!item) return

                  const index = parseInt(item.dataset.index ?? '')
                  if (Number.isInteger(index)) {
                    selectIndexRef.current = index
                  }
                  let accept = selectMode === 'once'
                  accept ||= selectMode === 'need-confirm' && item.classList.contains('selected')
                  if (accept) acceptCompletion(shikitor)
                })
              }
            }]
          }
        }
      })
      ctx.on('shikitor/keydown', e => {
      if (!isMultipleKey(e) && e.key === 'Escape') {
        closeCompletions()
        return
      }
      const isPlainKey = !isMultipleKey(e)
      const isModArrow = !e.altKey
        && !e.shiftKey
        && (e.metaKey || e.ctrlKey)
        && !(e.metaKey && e.ctrlKey)
        && ['ArrowUp', 'ArrowDown'].includes(e.key)
      const isNavigationKey = isModArrow || (
        isPlainKey
        && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)
      )
      const isAcceptKey = isPlainKey && ['Enter', 'Tab'].includes(e.key)
      if (
        triggerCharacter.current !== undefined
        && keywordRef.current !== -1
        && (isNavigationKey || isAcceptKey)
      ) {
        e.preventDefault()
        e.stopPropagation()
        const completionCount = resolvedCompletions.current.length
        if (completionCount === 0) return
        if (isNavigationKey) {
          const selectIndex = selectIndexRef.current
          if (e.key === 'Home' || (isModArrow && e.key === 'ArrowUp')) {
            selectIndexRef.current = 0
            return
          }
          if (e.key === 'End' || (isModArrow && e.key === 'ArrowDown')) {
            selectIndexRef.current = completionCount - 1
            return
          }
          if (e.key === 'PageUp' || e.key === 'PageDown') {
            const element = elementRef.current
            const list = isUnset(element)
              ? undefined
              : element.querySelector<HTMLElement>(`.${'shikitor'}-completions__list`)
            const item = list?.querySelector<HTMLElement>(`.${completionItemTemplate.prefix}`)
            const itemHeight = item?.getBoundingClientRect().height ?? 0
            const pageSize = Math.max(
              1,
              itemHeight > 0 ? Math.floor((list?.clientHeight ?? 0) / itemHeight) : 1
            )
            const delta = e.key === 'PageUp' ? -pageSize : pageSize
            selectIndexRef.current = Math.max(
              0,
              Math.min(completionCount - 1, selectIndex + delta)
            )
            return
          }
          const delta = e.key === 'ArrowUp' ? -1 : 1
          const nextIndex = selectIndex + delta
          selectIndexRef.current = nextIndex < 0
            ? completionCount - 1
            : nextIndex % completionCount
          return
        }
        if (isAcceptKey && acceptCompletion(shikitor)) return
        return
      }
      if (!isMultipleKey(e, false)) {
        if (allTriggerCharacters.includes(e.key)) {
          activateTrigger(e.key, shikitor.inputElement.selectionStart + 1)
          return
        }
        if (triggerCharacter.current) {
          const { rawTextHelper: { value }, cursor: { offset } } = shikitor
          const nextChar = value[offset + 1]
          try {
            const keyword = keywordRef.current === -1
              ? ''
              : keywordRef.current ?? ''
            const newKeyword = calcNewKeyword(keyword, e.key, nextChar)
            if (!/[\r|\n]$/.test(newKeyword)) {
              keywordRef.current = newKeyword
              return
            }
          } catch (e) {
            if (e !== CalcExitError) throw e
          }
          resetTriggerCharacter()
        }
      }
      })
      ctx.on('shikitor/change', value => {
        // Programmatic draft replacement (host state restore, completion
        // acceptance, external plugin edits) may not have a matching keydown.
        // Reconcile the tracked token against the real value so a popup can
        // never survive after its trigger was replaced. Valtio batches change
        // notifications, so a controlled host may already have accepted a
        // newer native edit by the time an older notification arrives.
        if (value !== shikitor.inputElement.value) return
        const cursor = shikitor.inputElement.selectionStart
        const insertedText = resolveInsertedText(lastReconciledValue, value, cursor)
        lastReconciledValue = value
        const insertedTrigger = insertedText?.at(-1)
        if (insertedTrigger && allTriggerCharacters.includes(insertedTrigger)) {
          // Keydown is not guaranteed for IME, accessibility input, paste or
          // controlled-host edits. The committed text diff is the universal
          // fallback, while the cursor check prevents deletion from reopening.
          activateTrigger(insertedTrigger, cursor)
        }
        const char = triggerCharacter.current
        const triggerEnd = triggerCharacter.offset
        if (char === undefined || triggerEnd === undefined) return
        const keyword = value.slice(triggerEnd, cursor)
        if (
          value[triggerEnd - 1] !== char
          || (cursor >= triggerEnd && /[\s\r\n]/.test(keyword))
        ) {
          closeCompletions()
        } else if (keywordRef.current !== keyword) {
          keywordRef.current = keyword
        }
      })
      return () => {
        input.removeEventListener('input', syncKeywordFromInput)
        inputElement.removeEventListener('input', onInput)
        popupProviderDisposable.dispose?.()
        disposeProviderScope()
        disposeScoped()
      }
  }
})

const CalcExitError = Symbol('CalcExitError')
export function resolveCompletionInputKeyword(
  value: string,
  cursorOffset: number,
  triggerOffset: number
) {
  if (
    triggerOffset < 0
    || cursorOffset < triggerOffset
    || cursorOffset > value.length
  ) return undefined
  const keyword = value.slice(triggerOffset, cursorOffset)
  return /[\r\n]/.test(keyword) ? undefined : keyword
}

function resolveInsertedText(previous: string, current: string, cursor: number) {
  let start = 0
  const sharedStart = Math.min(previous.length, current.length)
  while (start < sharedStart && previous[start] === current[start]) start++

  let previousEnd = previous.length
  let currentEnd = current.length
  while (
    previousEnd > start
    && currentEnd > start
    && previous[previousEnd - 1] === current[currentEnd - 1]
  ) {
    previousEnd--
    currentEnd--
  }
  if (cursor !== currentEnd || currentEnd <= start) return
  return current.slice(start, currentEnd)
}

function calcNewKeyword(keyword: string, key: string, nextChar = '') {
  switch (key) {
    case 'ArrowRight':
      return keyword + nextChar
    case 'ArrowLeft':
    case 'Backspace':
      if (keyword.length - 1 < 0) throw CalcExitError
      return keyword.slice(0, keyword.length - 1)
  }
  if (key.length === 1) {
    return keyword + key
  }
  return keyword
}
function filterCompletions(completions: readonly RecursiveReadonly<CompletionItemInner>[], keyword?: string) {
  if (!keyword || keyword === '') return completions

  const keywordParts = splitKeywords(keyword)
  return completions.filter(({ label, filterText }) => {
    const normalized = (filterText ?? label).toLocaleLowerCase()
    return keywordParts.every(part => normalized.includes(part))
  })
}
