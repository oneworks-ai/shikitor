import { definePlugin } from '@shikitor/core'
import type {} from '@shikitor/core/plugins/provide-completions'
import { CompletionItemKind } from '@shikitor/core/plugins/provide-completions'

import type { LanguageServiceClient, LanguageServiceSnapshot } from './client'
import { createTypeScriptLanguageService } from './typescript-adapter'

declare module 'cordis' {
  interface Context {
    shikitorTypeScript: LanguageServiceClient
  }

  interface Events {
    'shikitor/typescript-updated'(snapshot: LanguageServiceSnapshot): void
  }
}

function completionKind(kind: string) {
  switch (kind) {
    case 'method':
      return CompletionItemKind.Method
    case 'function':
      return CompletionItemKind.Function
    case 'class':
      return CompletionItemKind.Class
    case 'interface':
      return CompletionItemKind.Interface
    case 'const':
      return CompletionItemKind.Constant
    case 'let':
    case 'var':
      return CompletionItemKind.Variable
    case 'property':
    case 'memberVariable':
      return CompletionItemKind.Property
    case 'keyword':
      return CompletionItemKind.Keyword
    default:
      return CompletionItemKind.Text
  }
}

function resolveExpression(value: string, triggerOffset: number) {
  let start = triggerOffset
  while (start > 0 && /[\w$]/.test(value[start - 1])) start--
  return {
    start,
    text: value.slice(start, triggerOffset)
  }
}

export function createTypeScriptCompletionProvider(client: LanguageServiceClient) {
  return {
    triggerCharacters: ['.'],
    provideCompletionItems({ value }: { value: string }, position: { offset: number }) {
      // The completion plugin observes the trigger on keydown. Depending on the
      // browser, its provider can run before the textarea input/cursor updates,
      // after both updates, or between them. Normalize all three phases to the
      // virtual document containing the just-typed dot.
      const cursorOffset = Math.max(0, Math.min(position.offset, value.length))
      const triggerOffset = value[cursorOffset - 1] === '.'
        ? cursorOffset - 1
        : value[cursorOffset] === '.'
          ? cursorOffset
          : cursorOffset
      const completionValue = value[triggerOffset] === '.'
        ? value
        : `${value.slice(0, triggerOffset)}.${value.slice(triggerOffset)}`
      const completionPosition = triggerOffset + 1
      client.updateDocument(completionValue)

      const expression = resolveExpression(completionValue, triggerOffset)
      if (!expression.text) return
      return {
        suggestions: client.getCompletions(completionPosition).map(completion => ({
          kind: completionKind(completion.kind),
          label: completion.label,
          detail: completion.detail || completion.kind,
          documentation: `TypeScript ${client.runtimeVersion}`,
          range: { start: expression.start, end: triggerOffset },
          insertText: `${expression.text}.${completion.insertText ?? completion.label}`
        }))
      }
    }
  }
}

export default definePlugin({
  name: 'playground-typescript-language-service',
  provide: 'shikitorTypeScript',
  inject: ['shikitor', 'shikitorCompletions'],
  apply(ctx) {
    const { shikitor } = ctx
    const client = createTypeScriptLanguageService(shikitor.value)
    ctx.provide('shikitorTypeScript', client)

    const publish = (offset = shikitor.cursor.offset) => {
      const snapshot = client.inspect(offset)
      ctx.emit('shikitor/typescript-updated', snapshot)
    }
    const completionDisposable = ctx.shikitorCompletions.registerCompletionItemProvider(
      '*',
      createTypeScriptCompletionProvider(client)
    )

    ctx.on('shikitor/change', value => {
      client.updateDocument(value)
      const cursorOffset = shikitor.cursor.offset
      publish(value[cursorOffset] === '.' ? cursorOffset + 1 : cursorOffset)
    })
    ctx.on('shikitor/cursor-change', cursor => publish(cursor?.offset))

    return () => {
      completionDisposable.dispose?.()
      client[Symbol.dispose]()
    }
  }
})
