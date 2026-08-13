import { definePlugin } from '@shikitor/core'

const symmetryOperatorMapping: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '<': '>',
  '`': '`',
  "'": "'",
  '"': '"'
}

function isSymmetryOperatorKey(key: string) {
  return key in symmetryOperatorMapping
}

export default definePlugin({
  name: 'symmetry-operator',
  inject: ['shikitor'],
  apply(ctx) {
    const shikitor = ctx.shikitor
    ctx.on('shikitor/keydown', event => {
      const textarea = event.target
      const [{ start, end }] = shikitor.selections ?? [{}]
      if (start.offset === end.offset) return
      if (isSymmetryOperatorKey(event.key) && !(event.metaKey || event.ctrlKey)) {
        textarea.setRangeText(symmetryOperatorMapping[event.key], end.offset, end.offset)
        textarea.setRangeText(event.key, start.offset, start.offset)
        textarea.dispatchEvent(new Event('input'))
        shikitor.focus(end.offset + 2)
        event.preventDefault()
      }
    })
  }
})
