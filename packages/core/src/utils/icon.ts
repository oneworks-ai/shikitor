import { classnames } from './classnames'
import { ICON_PATHS } from './iconPaths'

const prefix = `${'shikitor'}-icon`

export const icon = (text: string, classname: string | false = false) => {
  const classes = classnames(prefix, classname)
  const path = ICON_PATHS[text]
  if (path === undefined) return `<span class='${classes}'>${text}</span>`
  return `<span class='${classes} shikitor-icon--svg' aria-hidden='true'><svg viewBox='0 0 24 24' width='1em' height='1em' focusable='false'><path d='${path}'></path></svg></span>`
}
