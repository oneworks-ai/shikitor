import { definePlugin } from '@shikitor/core'
import { CompletionItemKind } from '@shikitor/core/plugins/provide-completions'

type CompletionItemIconRenderer = import(
  '@shikitor/core/plugins/provide-completions'
).CompletionItemIconRenderer

export type MessengerCompletionTrigger = '/' | '$' | '#' | '@'

export interface MessengerCompletionItem {
  label: string
  insertText?: string
  detail?: string
  documentation?: string
  kind?: CompletionItemKind
  renderIcon?: CompletionItemIconRenderer
}

export interface MessengerCompletionGroup {
  trigger: MessengerCompletionTrigger
  items: MessengerCompletionItem[]
}

export interface TriggerCompletionsOptions {
  groups: MessengerCompletionGroup[]
}

export function resolveMessengerCompletionInsertText(
  trigger: MessengerCompletionTrigger,
  item: MessengerCompletionItem
) {
  return item.insertText ?? `${trigger}${item.label}`
}

/**
 * Register one completion provider per trigger. Keeping the providers isolated
 * lets Cordis route the native keydown directly to the matching data source,
 * without inferring the trigger from text that may not have reached the model yet.
 */
export default definePlugin({
  name: 'messenger-trigger-completions',
  inject: ['shikitorCompletions'],
  apply(ctx, options: TriggerCompletionsOptions) {
    const disposables = options.groups.map(group => (
      ctx.shikitorCompletions.registerCompletionItemProvider('markdown', {
        triggerCharacters: [group.trigger],
        provideCompletionItems(_rawTextHelper, position) {
          const triggerOffset = Math.max(0, position.offset - 1)
          return {
            suggestions: group.items.map(item => ({
              label: item.label,
              kind: item.kind ?? CompletionItemKind.Text,
              renderIcon: item.renderIcon,
              detail: item.detail,
              documentation: item.documentation,
              range: {
                start: triggerOffset,
                end: triggerOffset
              },
              insertText: resolveMessengerCompletionInsertText(group.trigger, item)
            }))
          }
        }
      })
    ))

    return () => disposables.forEach(disposable => disposable.dispose?.())
  }
})
