import { definePlugin } from '@shikitor/core'

import { DEFAULT_CODE } from '../utils/analyzeHash'
import { zipStr } from '../utils/zipStr'

export default definePlugin({
  name: 'shikitor-saver',
  inject: ['shikitor'],
  apply(ctx) {
    ctx.on('shikitor/keydown', event => {
      if (event.key !== 's' || !(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      const code = ctx.shikitor.value
      const url = new URL(location.href)

      let newHashStr = ''
      if (code !== DEFAULT_CODE) {
        newHashStr = `zip-code/${zipStr(code)}`
      }
      url.hash = newHashStr
      history.pushState(null, '', url)
    })
  }
})
