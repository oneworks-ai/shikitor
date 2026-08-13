import './popupsControlled.scss'

import { proxy } from 'valtio/vanilla'

import { cssvar } from '../../base'
import type { Shikitor } from '../../editor'
import { classnames } from '../../utils/classnames'
import { debounceSubscribe } from '../../utils/valtio/debounceSubscribe'
import type { ResolvedPopup } from './index'

const prefix = `${'shikitor'}-popup`

const REVERSE_MAP = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left'
} as const

const popupResizeObservers = new WeakMap<HTMLElement, ResizeObserver>()

function updatePopupElement(
  shikitor: Shikitor,
  ele: HTMLElement,
  popup: ResolvedPopup,
  observeSize = false
) {
  ele.className = classnames(
    prefix,
    `${prefix}-${popup.id}`,
    `${prefix}-${popup.position}`
  )
  const { width, height } = popup
  width && (ele.style.width = `${width}px`)
  height && (ele.style.height = `${height}px`)
  const passedOffset = {
    top: undefined,
    left: undefined,
    bottom: undefined,
    right: undefined
  } as {
    top?: number
    left?: number
    bottom?: number
    right?: number
  }
  const passedKeys = Object.keys(passedOffset) as (keyof typeof passedOffset)[]
  if (popup.position === 'absolute') {
    for (const key of passedKeys) {
      const value = popup.offset[key]
      if (value !== undefined) {
        passedOffset[key] = value
      }
    }
  }
  // TODO watch shikitor.element resize
  const containerRect = shikitor.element.getBoundingClientRect()
  if (popup.position === 'relative') {
    if (!popup.cursors) return
    if (!popup.selections) return

    const [cursor] = popup.cursors
    if (!cursor) {
      if (popup.hiddenOnNoCursor) {
        ele.style.display = 'none'
      }
      return
    } else {
      ele.style.display = ''
    }
    const [selection] = popup.selections
    if (popup.target === 'selection') {
      if (!selection || selection.start.offset === selection.end.offset) {
        ele.style.display = 'none'
        return
      } else {
        ele.style.display = ''
      }
    }
    const { x: _x, y: _y } = shikitor._getCursorAbsolutePosition(
      cursor,
      popup.placement === 'top' ? -1 : 0
    )
    const x = _x + containerRect.left
    const y = _y + containerRect.top
    const paddingTop = getComputedStyle(shikitor.element).paddingTop
    if (popup.placement === 'top') {
      ele.style.transform = `translateY(-100%)`
    }
    const lines = shikitor.element.querySelector(`:scope > .${'shikitor'}-lines`)
    passedOffset.top = y + parseInt(paddingTop)
    passedOffset.left = (lines?.clientWidth ?? 0) + x
  }
  // watch ele width and height change
  if (observeSize && (width === undefined || height === undefined)) {
    const observer = new ResizeObserver(() => {
      ele.style.setProperty(`--width`, `${ele.clientWidth}px`)
      ele.style.setProperty(`--height`, `${ele.clientHeight}px`)
    })
    observer.observe(ele)
    popupResizeObservers.set(ele, observer)
  } else {
    width !== undefined && ele.style.setProperty(`--width`, `${width}px`)
    height !== undefined && ele.style.setProperty(`--height`, `${height}px`)
  }
  for (const key of passedKeys) {
    if (passedOffset[key] === undefined) continue

    ele.style.setProperty(`--${key}`, `${passedOffset[key]}px`)
    const realOffset = `calc(var(--${key}, 0px) + var(${
      cssvar(`offset-${key === 'top' || key === 'bottom' ? 'y' : 'x'}`)
    }, 0px))`
    const realOffsetWithCursorWidth = ['left', 'right'].includes(key)
      ? `calc(${realOffset} + var(--cursor-width, 0px))`
      : realOffset
    const rkey = REVERSE_MAP[key]
    ele.style[key] = `min(max(${realOffsetWithCursorWidth}, ${containerRect[key]}px), ${
      {
        top: `calc(${containerRect[rkey]}px ${
          popup.position === 'relative'
            ? popup.placement.includes('top')
              ? '+ 0px'
              : '- var(--height, 0px)'
            : '+ var(--height, 0px)'
        })`,
        bottom: `${containerRect[rkey]}px`,
        left: `calc(${containerRect[rkey]}px - var(--width, 0px))`,
        right: `${containerRect[rkey]}px`
      }[key]
    })`
  }
}
export function mountPopup(shikitor: Shikitor, popup: ResolvedPopup) {
  const ele = document.createElement('div')
  updatePopupElement(shikitor, ele, popup, true)
  popup.render(ele)
  shikitor.element.appendChild(ele)
  return ele
}

export function popupsControlled(getShikitor: () => Shikitor) {
  const popups = proxy<ResolvedPopup[]>([])
  const prevPopupElements = new Map<ResolvedPopup, HTMLDivElement>()
  const disposeSubscribe = debounceSubscribe(popups, () => {
    const shikitor = getShikitor()
    const newPopupElements = new Map<ResolvedPopup, HTMLDivElement>()
    for (const popup of popups) {
      let ele = prevPopupElements.get(popup)
      if (ele) {
        updatePopupElement(shikitor, ele, popup)
      } else {
        ele = mountPopup(shikitor, popup)
      }
      newPopupElements.set(popup, ele)
    }
    for (const [popup, ele] of prevPopupElements) {
      if (!newPopupElements.has(popup)) {
        popupResizeObservers.get(ele)?.disconnect()
        popupResizeObservers.delete(ele)
        ele.remove()
      }
    }
    prevPopupElements.clear()
    for (const [popup, ele] of newPopupElements) {
      prevPopupElements.set(popup, ele)
    }
  })

  let positionFrame: number | undefined
  const updatePositions = () => {
    if (positionFrame !== undefined) return
    positionFrame = requestAnimationFrame(() => {
      positionFrame = undefined
      const shikitor = getShikitor()
      for (const [popup, element] of prevPopupElements) {
        updatePopupElement(shikitor, element, popup)
      }
    })
  }
  document.addEventListener('scroll', updatePositions, true)
  window.addEventListener('resize', updatePositions)
  const editorResizeObserver = new ResizeObserver(updatePositions)
  editorResizeObserver.observe(getShikitor().element)

  return {
    popups,
    dispose() {
      disposeSubscribe()
      document.removeEventListener('scroll', updatePositions, true)
      window.removeEventListener('resize', updatePositions)
      editorResizeObserver.disconnect()
      if (positionFrame !== undefined) cancelAnimationFrame(positionFrame)
      for (const element of prevPopupElements.values()) {
        popupResizeObservers.get(element)?.disconnect()
        popupResizeObservers.delete(element)
      }
    }
  }
}
