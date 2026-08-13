import { definePlugin } from '@shikitor/core'
import type {} from '@shikitor/core/plugins/provide-completions'
import { CompletionItemKind } from '@shikitor/core/plugins/provide-completions'

export default definePlugin({
  name: 'playground-demo-completions',
  inject: ['shikitor', 'shikitorCompletions'],
  apply(ctx, options: { locale?: 'en-US' | 'zh-CN' } = {}) {
    const isChinese = options.locale === 'zh-CN'
    const disposable = ctx.shikitorCompletions.registerCompletionItemProvider('*', {
      triggerCharacters: ['.'],
      provideCompletionItems({ value, lineStart }, position) {
        const expressionStart = lineStart(position)
        const expression = value.slice(expressionStart, position.offset - 1).trimStart()
        if (!expression) return
        const indent = value.slice(expressionStart, position.offset - 1).match(/^\s*/)?.[0] ?? ''
        const range = {
          start: expressionStart + indent.length,
          end: position.offset - 1
        }
        return {
          suggestions: [
            {
              kind: CompletionItemKind.Property,
              label: 'value',
              detail: 'string',
              documentation: isChinese ? '读取或更新编辑器内容。' : 'Read or update the editor value.',
              range,
              insertText: `${expression}.value`
            },
            {
              kind: CompletionItemKind.Method,
              label: 'updateOptions',
              detail: '(options) => Promise<void>',
              documentation: isChinese ? '无需重建即可应用新的编辑器配置。' : 'Apply new editor options without remounting.',
              range,
              insertText: `${expression}.updateOptions({})`
            },
            {
              kind: CompletionItemKind.Property,
              label: 'context',
              detail: 'Cordis Context',
              documentation: isChinese ? '访问当前编辑器独立的插件上下文。' : 'Access the isolated plugin context.',
              range,
              insertText: `${expression}.context`
            }
          ]
        }
      }
    })
    return () => disposable.dispose?.()
  }
})
