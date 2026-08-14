import { definePlugin } from '@shikitor/core'
import type {} from '@shikitor/core/plugins/provide-completions'
import type { CompletionItemIconRenderer } from '@shikitor/core/plugins/provide-completions'
import { CompletionItemKind } from '@shikitor/core/plugins/provide-completions'

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
              insertText: `${group.trigger}${item.insertText ?? item.label}`
            }))
          }
        }
      })
    ))

    return () => disposables.forEach(disposable => disposable.dispose?.())
  }
})
