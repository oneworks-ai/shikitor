import type { DecorationItem } from '@shikijs/types'
import type { ResolvedCursor, Shikitor } from '@shikitor/core'
import { definePlugin } from '@shikitor/core'
import { isMultipleKey } from '@shikitor/core/utils'

const bracketMap: Record<string, string | undefined> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '<': '>',
  ')': '(',
  ']': '[',
  '}': '{',
  '>': '<'
}
const lBrackets = ['(', '[', '{', '<']

const name = 'shikitor-bracket-matcher'

export default definePlugin({
  name,
  inject: ['shikitor'],
  apply(ctx) {
    const shikitor = ctx.shikitor
    let shikitorCursor: ResolvedCursor | undefined
    let isPressedDelete = false

    function insertBracketHighlighting(editor: Shikitor) {
      const cursor = shikitorCursor
      const { decorations = [] } = editor.options
      const filteredDecorations = [
        ...decorations.filter(d => {
          const { class: className } = d.properties ?? {}
          if (typeof className === 'string' || Array.isArray(className)) {
            return !className.includes(name)
          }
          return false
        })
      ]
      if (!cursor) {
        editor.updateOptions(old => ({ ...old, decorations: filteredDecorations }))
        return
      }
      const value = editor.value
      const prev = value[cursor.offset - 1]
      const next = value[cursor.offset]

      const prevBracket = bracketMap[prev]
      const nextBracket = bracketMap[next]
      const relativeBracket = prevBracket || nextBracket
      let newDecorations: DecorationItem[] = []
      if (relativeBracket) {
        const bracket = prevBracket ? prev : next
        const bracketOffset = prevBracket ? cursor.offset - 1 : cursor.offset
        newDecorations.push({
          start: bracketOffset,
          end: bracketOffset + 1,
          properties: {
            class: `shikitor-bg-lighting ${name}`
          }
        })
        const increase = lBrackets.includes(relativeBracket) ? -1 : 1
        const stack = []
        for (let i = bracketOffset + increase;; i += increase) {
          if (i < 0 || i >= value.length) break
          const char = value[i]
          if (char === bracket) stack.push(char)
          if (char === relativeBracket) {
            if (stack.length === 0) {
              filteredDecorations.push({
                start: i,
                end: i + 1,
                properties: {
                  class: `shikitor-bg-lighting ${name}`
                }
              })
              break
            }
            stack.pop()
          }
        }
      } else {
        newDecorations = []
      }
      if (newDecorations.length === 0 && filteredDecorations.length === decorations.length) return
      editor.updateOptions(old => ({ ...old, decorations: filteredDecorations.concat(newDecorations) }))
    }

    ctx.on('shikitor/cursor-change', cursor => {
      shikitorCursor = cursor
      insertBracketHighlighting(shikitor)
    })
    ctx.on('shikitor/keydown', event => {
      if (event.key === 'Delete' && !isMultipleKey(event)) isPressedDelete = true
    })
    ctx.on('shikitor/keyup', event => {
      if (event.key === 'Delete') isPressedDelete = false
    })
    ctx.on('shikitor/change', () => {
      if (isPressedDelete) insertBracketHighlighting(shikitor)
    })
  }
})
