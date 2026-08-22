import { isMultipleKey, isWhatBrowser } from '../../utils' with {
  'unbundled-reexport': 'on'
}
import {
  readVisualScrollLeft,
  SCROLL_FOLLOWER_CLASS,
  setProjectionScroll
} from './projectionScroll'

export function resolveVisualScrollLeft(
  inputScrollLeft: number,
  visualScrollLeft: string
) {
  const resolved = Number.parseFloat(visualScrollLeft)
  return Number.isFinite(resolved) ? resolved : inputScrollLeft
}

export function initDom(mount: HTMLElement) {
  const attached = mount instanceof HTMLTextAreaElement
  const input = attached ? mount : document.createElement('textarea')
  const target = attached ? document.createElement('div') : mount
  const parent = attached ? input.parentElement : null
  if (attached && parent === null) {
    throw new Error('Shikitor cannot attach to a textarea without a parent element')
  }

  const inputClass = attached ? 'shikitor-input--attached' : 'shikitor-input'
  const hadInputClass = input.classList.contains(inputClass)
  const parentPosition = parent?.style.position
  const changedParentPosition = parent !== null
    && getComputedStyle(parent).position === 'static'
  if (changedParentPosition && parent !== null) parent.style.position = 'relative'

  target.classList.add('shikitor')
  if (!attached) target.innerHTML = ''

  let resizeObserver: ResizeObserver | undefined
  const syncAttachedLayout = () => {
    target.style.inset = 'auto'
    target.style.top = `${input.offsetTop}px`
    target.style.left = `${input.offsetLeft}px`
    target.style.width = `${input.offsetWidth}px`
    target.style.height = `${input.offsetHeight}px`
  }
  if (attached) {
    const inputStyle = getComputedStyle(input)
    target.classList.add('shikitor--attached')
    target.style.boxSizing = 'border-box'
    target.style.padding = inputStyle.padding
    target.style.borderStyle = 'solid'
    target.style.borderWidth = inputStyle.borderWidth
    target.style.borderColor = 'transparent'
    target.style.fontFamily = inputStyle.fontFamily
    target.style.fontSize = inputStyle.fontSize
    target.style.fontWeight = inputStyle.fontWeight
    target.style.fontStyle = inputStyle.fontStyle
    target.style.letterSpacing = inputStyle.letterSpacing
    target.style.wordSpacing = inputStyle.wordSpacing
    target.style.textAlign = inputStyle.textAlign
    target.style.textTransform = inputStyle.textTransform
    target.style.direction = inputStyle.direction
    target.style.setProperty('--font-family', inputStyle.fontFamily)
    target.style.setProperty('--line-height', inputStyle.lineHeight)
    target.style.setProperty('--shikitor-white-space', inputStyle.whiteSpace)
    target.style.setProperty('--shikitor-word-break', inputStyle.wordBreak)
    target.style.setProperty('--shikitor-overflow-wrap', inputStyle.overflowWrap)
    input.before(target)
    syncAttachedLayout()
    if (typeof ResizeObserver !== 'undefined' && parent !== null) {
      resizeObserver = new ResizeObserver(syncAttachedLayout)
      resizeObserver.observe(input)
      resizeObserver.observe(parent)
    }
  }
  const output = document.createElement('div')
  const placeholder = document.createElement('div')

  input.classList.add(inputClass)
  if (!attached) {
    input.setAttribute('autocapitalize', 'off')
    input.setAttribute('autocomplete', 'off')
    input.setAttribute('autocorrect', 'off')
    input.setAttribute('spellcheck', 'false')
    input.setAttribute('wrap', 'off')
  }

  output.classList.add('shikitor-output')
  output.setAttribute('aria-hidden', 'true')
  const lines = document.createElement('div')
  lines.classList.add('shikitor-lines')
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const defer = (callback: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      callback()
    }, 10)
    timers.add(timer)
  }
  const onScroll = () => {
    defer(() => {
      const scrollLeft = resolveVisualScrollLeft(
        input.scrollLeft,
        String(readVisualScrollLeft(target) ?? '')
      )
      const scrollTop = input.scrollTop
      setProjectionScroll(target, output, { left: scrollLeft, top: scrollTop })
      lines.style.marginTop = `-${scrollTop}px`
    })
  }
  input.addEventListener('scroll', onScroll)
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !isMultipleKey(event)) {
      if (input.selectionStart !== input.selectionEnd) {
        event.preventDefault()
        input.setSelectionRange(input.selectionStart, input.selectionStart)
      }
    }
    // Chrome does not fire selectionchange for these native edit keys.
    if (
      isWhatBrowser('chrome')
      && ['Backspace', 'Delete', 'Enter'].includes(event.key)
      && !isMultipleKey(event)
    ) {
      const selection = { start: input.selectionStart, end: input.selectionEnd }
      defer(() => {
        if (
          selection.start !== input.selectionStart
          || selection.end !== input.selectionEnd
        ) {
          input.setSelectionRange(input.selectionStart, input.selectionEnd)
          document.dispatchEvent(new Event('selectionchange'))
        }
      })
    }
  }
  input.addEventListener('keydown', onKeydown)

  placeholder.classList.add('shikitor-placeholder')

  const cursors = document.createElement('div')
  cursors.classList.add('shikitor-cursors', SCROLL_FOLLOWER_CLASS)
  const defaultCursor = document.createElement('div')
  defaultCursor.classList.add('shikitor-cursor')
  const userName = document.createElement('div')
  userName.classList.add(
    'shikitor-cursor__username',
    'shikitor-cursor__username--you'
  )
  userName.dataset.username = 'You'
  cursors.append(defaultCursor, userName)

  const container = document.createElement('div')
  container.classList.add('shikitor-container')
  container.append(output, placeholder)
  if (!attached) container.append(input)
  container.append(cursors)
  target.append(lines, container)
  return {
    attached,
    target,
    input,
    output,
    placeholder,
    lines,
    dispose() {
      input.removeEventListener('scroll', onScroll)
      input.removeEventListener('keydown', onKeydown)
      resizeObserver?.disconnect()
      timers.forEach(timer => clearTimeout(timer))
      timers.clear()
      if (!attached) {
        target.innerHTML = ''
        return
      }
      target.remove()
      if (!hadInputClass) input.classList.remove(inputClass)
      if (
        changedParentPosition
        && parent !== null
        && parent.style.position === 'relative'
      ) parent.style.position = parentPosition ?? ''
    }
  }
}
