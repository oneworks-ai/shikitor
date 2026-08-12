import { definePlugin } from '@shikitor/core'

import { formatTool, headingSelectTool, linkTool, listFormatTool, NoToolsError, quoteTool } from './tools'

export default definePlugin({
  name: 'selection-toolbox-for-md',
  inject: ['shikitor', 'shikitorSelectionTools'],
  apply(ctx) {
    const shikitor = ctx.shikitor
    const disposable = ctx.shikitorSelectionTools.registerSelectionToolsProvider('markdown', {
      provideSelectionTools(selectionText, selection) {
        const { rawTextHelper: { line, lineStart } } = shikitor
        const lineText = line(selection.start)
        if (lineText.startsWith('[//]: # (')) return

        try {
          return {
            tools: [
              headingSelectTool(shikitor, selectionText, selection, lineText, lineStart(selection.start)),
              formatTool('**', '**', shikitor, selectionText, selection, {
                icon: 'format_bold'
              }),
              formatTool('<u>', '</u>', shikitor, selectionText, selection, {
                icon: 'format_italic'
              }),
              formatTool('~~', '~~', shikitor, selectionText, selection, {
                icon: 'format_strikethrough'
              }),
              formatTool('__', '__', shikitor, selectionText, selection, {
                icon: 'format_underlined'
              }),
              formatTool('`', '`', shikitor, selectionText, selection, {
                icon: 'code'
              }),
              linkTool(shikitor, selectionText, selection),
              quoteTool(shikitor, selection),
              listFormatTool(shikitor, selectionText, selection)
            ]
          }
        } catch (error) {
          if (error === NoToolsError) return
          throw error
        }
      }
    })
    return () => disposable.dispose?.()
  }
})
