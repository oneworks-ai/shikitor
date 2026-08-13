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

export interface CompletionItemInner {
  label: string
  kind?: CompletionItemKind
  detail?: string
  documentation?: string
  range: TextRange
  insertText: string
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
      position: ResolvedPosition
    ): ProviderResult<CompletionList>
  }
  export interface ShikitorProvideCompletions {
    registerCompletionItemProvider: (selector: LanguageSelector, provider: CompletionItemProvider) => IDisposable
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

function highlightingKeyword(text: string, keywordParts: string[]) {
  const { prefix } = completionItemTemplate
  return keywordParts.reduce((prev, keyword) => {
    const index = prev.toLowerCase().indexOf(keyword)
    if (index === -1) return prev
    return prev.slice(0, index)
      + `<span class="${prefix}__keyword">${keyword}</span>`
      + prev.slice(index + keyword.length)
  }, text)
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
      ${item.detail ? `<div class="${prefix}__detail">${item.detail}</div>` : ''}
      ${item.documentation ? `<div class="${prefix}__documentation">${item.documentation}</div>` : ''}
    </div>
  `
}
completionItemTemplate.prefix = `${'shikitor'}-completion-item` as const

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
      ? options.emptyText ?? 'No completions available'
      : completionsSnapshot.map(innerCompletionItemTemplate).join('')
    const {
      footer = true,
      tooltip = true
    } = options
    const tooltipStr = tooltip === true
      ? 'Press <kbd>↑</kbd> <kbd>↓</kbd> to navigate, <kbd>↵</kbd> to select'
      : (tooltip || '')
    const footerStr = footer
      ? `<div class="${'shikitor'}-completions__footer">
            <div class="${'shikitor'}-completions__tooltip">${tooltipStr}</div>
            <div class="${'shikitor'}-completions__setting">
              <button>${icon('settings')}</button>
            </div>
          </div>`
      : ''
    element.innerHTML = `
      ${completionsContent}
      ${footerStr}
    `
  })

  const displayRef = derive({
    current: get => get(resolvedCompletions).current.length > 0
  })
  const displayDeps = derive({
    element: get => get(elementRef).current,
    display: get => get(displayRef).current
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

    const items = element.querySelectorAll(`.${'shikitor'}-completion-item`)
    items.forEach((item, index) => {
      if (index === selectIndex) {
        item.classList.add('selected')
      } else {
        item.classList.remove('selected')
      }
    })
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

  function acceptCompletion(shikitor: Shikitor) {
    const completion = snapshot(resolvedCompletions.current[selectIndexRef.current])
    if (completion) {
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
      resetTriggerCharacter()
      setTimeout(() => {
        shikitor.focus(prefix.length + insertText.length)
      }, 0)
      return true
    }
    return false
  }
      const shikitor = ctx.shikitor
      const { optionsRef } = shikitor
      const cursorRef = derive({
        current: get => get(optionsRef).current.cursor
      })
      const languageRef = derive({
        current: get => get(optionsRef).current.language
      })
      const { disposeScoped: disposeProviderScope, scopeWatch } = scoped()
      ctx.provide('shikitorCompletions', {
        registerCompletionItemProvider(selector, provider) {
          let providerDispose: (() => void) | undefined
          const { triggerCharacters, provideCompletionItems } = provider

          const completionSymbol = Symbol('completion')
          const start = allTriggerCharacters.length
          const end = allTriggerCharacters.push(...triggerCharacters ?? [])
          const disposeWatcher = scopeWatch(async get => {
            const char = get(triggerCharacter).current
            const language = get(languageRef).current
            if (selector !== '*' && selector !== language) return

            const cursor = cursorRef.current
            if (cursor === undefined) return
            let suggestions: CompletionItemInner[] = []
            if (char && triggerCharacters?.includes(char)) {
              const { rawTextHelper } = shikitor
              providerDispose?.()
              const { suggestions: newSugs = [], dispose } = await provideCompletionItems(
                rawTextHelper,
                cursor
              ) ?? {}
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
              disposeWatcher()
              providerDispose?.()
              allTriggerCharacters.splice(start, end - start)
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
        resetTriggerCharacter()

        keywordRef.current = -1
        return
      }
      if (
        !isMultipleKey(e)
        && displayRef.current
        && ['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)
      ) {
        e.preventDefault()
        if ([e.key === 'ArrowUp', e.key === 'ArrowDown'].some(Boolean)) {
          const selectIndex = selectIndexRef.current
          const delta = e.key === 'ArrowUp' ? -1 : 1
          const deltaedIndex = selectIndex + delta
          selectIndexRef.current = deltaedIndex < 0
            ? completions.length - 1
            : deltaedIndex % completions.length
          return
        }
        if (e.key === 'Enter' && acceptCompletion(shikitor)) return
        return
      }
      if (!isMultipleKey(e, false)) {
        if (allTriggerCharacters.includes(e.key)) {
          keywordRef.current = ''
          triggerCharacter.current = e.key
          triggerCharacter.offset = shikitor.cursor.offset + 1
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
      return () => {
        popupProviderDisposable.dispose?.()
        disposeProviderScope()
        disposeScoped()
      }
  }
})

const CalcExitError = Symbol('CalcExitError')
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

  return completions.filter(({ label }) => label.startsWith(keyword))
}
