import { definePlugin } from '@shikitor/core'

export interface AtUserOptions {
  targets: string[]
}

export default definePlugin({
  name: 'at-user',
  inject: ['shikitorCompletions'],
  apply(ctx, options: AtUserOptions) {
    const disposable = ctx.shikitorCompletions.registerCompletionItemProvider('markdown', {
      triggerCharacters: ['@'],
      provideCompletionItems(rawTextHelper, position) {
        return {
          suggestions: options.targets.map(target => ({
            label: target,
            range: { start: position.offset - 1, end: position.offset - 1 },
            insertText: `@${target}`
          }))
        }
      }
    })
    return () => disposable.dispose?.()
  }
})
