import { definePlugin } from '@shikitor/core'
import { isMultipleKey } from '@shikitor/core/utils'

const predictions = [
  { prefix: 'editor.', suffix: 'updateOptions({ theme: "github-dark" })' },
  { prefix: 'console.', suffix: 'log("Hello, Shikitor!")' },
  { prefix: 'return ', suffix: 'editor.value' },
  { prefix: 'const message = ', suffix: 'createMessage()' }
]

export default definePlugin({
  name: 'playground-ghost-text',
  inject: ['shikitor'],
  apply(ctx) {
    const shikitor = ctx.shikitor
    const ghost = document.createElement('span')
    ghost.className = 'shikitor-ghost-text'
    shikitor.element.querySelector('.shikitor-container')?.append(ghost)
    let activePrediction = ''

    function render() {
      const cursor = shikitor.cursor
      const { rawTextHelper } = shikitor
      const lineStart = rawTextHelper.lineStart(cursor)
      const beforeCursor = rawTextHelper.value.slice(lineStart, cursor.offset)
      activePrediction = predictions.find(item => beforeCursor.endsWith(item.prefix))?.suffix ?? ''
      ghost.textContent = activePrediction
      ghost.hidden = !activePrediction
      if (!activePrediction) return

      const position = shikitor._getCursorAbsolutePosition(cursor, -1)
      ghost.style.top = `${position.y}px`
      ghost.style.left = `${position.x}px`
    }

    ctx.on('shikitor/change', render)
    ctx.on('shikitor/cursor-change', render)
    ctx.on('shikitor/focus', render)
    ctx.on('shikitor/blur', () => {
      ghost.hidden = true
    })
    ctx.on('shikitor/keydown', event => {
      if (!activePrediction || event.key !== 'Tab' || isMultipleKey(event)) return
      const offset = shikitor.cursor.offset
      event.preventDefault()
      event.target.setRangeText(activePrediction, offset, offset, 'end')
      event.target.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: activePrediction,
        inputType: 'insertText'
      }))
    })

    queueMicrotask(render)
    return () => ghost.remove()
  }
})
