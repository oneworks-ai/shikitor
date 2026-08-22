import { derive } from 'valtio/utils'
import { subscribe } from 'valtio/vanilla'

import type { RefObject } from '../../base'
import type { Cursor, ResolvedCursor, Shikitor } from '../../editor'
import type { RawTextHelper } from '../../utils/getRawTextHelper'
import { setCursorGeometry } from './cursorGeometry'

export function cursorControlled(
  getShikitor: () => Shikitor | undefined,
  target: HTMLElement,
  input: HTMLTextAreaElement,
  rthRef: RefObject<RawTextHelper>,
  ref: RefObject<{ cursor?: Cursor }>,
  onCursorChange: (cursor: ResolvedCursor) => void
) {
  const defaultCursor = target.querySelector('.shikitor-cursor:first-child') as HTMLElement

  const optionsCursorRef = derive({
    current: get => get(ref).current.cursor
  })
  const cursorRef: RefObject<ResolvedCursor> = derive({
    current: get => {
      const { resolvePosition } = get(rthRef).current
      return resolvePosition(get(optionsCursorRef).current ?? 0)
    }
  })

  let cursorBlinkInterval: NodeJS.Timeout | null = null
  let geometryFrame = 0
  // Measuring the caret right inside input handlers forces a synchronous
  // style and layout flush after every projection write; the geometry only
  // needs to be current by the next paint.
  const renderCursorGeometry = () => {
    geometryFrame = 0
    const shikitor = getShikitor()
    const cursor = cursorRef.current
    setCursorGeometry(
      target,
      shikitor ? shikitor._getCursorAbsolutePosition(cursor, -1) : { x: 0, y: 0 }
    )
  }
  const scheduleCursorGeometry = () => {
    if (geometryFrame || typeof requestAnimationFrame === 'undefined') {
      if (!geometryFrame) renderCursorGeometry()
      return
    }
    geometryFrame = requestAnimationFrame(renderCursorGeometry)
  }
  const stopCursorBlink = () => {
    if (cursorBlinkInterval) clearInterval(cursorBlinkInterval)
    cursorBlinkInterval = null
    target.classList.remove('shikitor--focused')
    defaultCursor.classList.remove(
      'shikitor-cursor--visible',
      'shikitor-cursor--keyboard-reveal'
    )
  }
  const startCursorBlink = () => {
    stopCursorBlink()
    if (document.activeElement !== input) return
    target.classList.add('shikitor--focused')
    scheduleCursorGeometry()
    defaultCursor.classList.add('shikitor-cursor--visible')
    cursorBlinkInterval = setInterval(() => {
      defaultCursor.classList.toggle('shikitor-cursor--visible')
    }, 700) // 0.5s visible, 0.2s hidden
  }
  const disposeCursor = subscribe(cursorRef, () => {
    const cursor = cursorRef.current
    if (cursor === undefined) return
    onCursorChange(cursor)
    startCursorBlink()
  })
  input.addEventListener('focus', startCursorBlink)
  input.addEventListener('blur', stopCursorBlink)

  // An attached host textarea may already be focused before Shikitor mounts,
  // so the focus listener is not guaranteed to run. Seed the controlled
  // cursor from the live selection to keep cursor-relative popups anchored.
  if (ref.current.cursor === undefined) {
    ref.current.cursor = input.selectionStart
  }
  startCursorBlink()
  return {
    cursorRef,
    dispose() {
      disposeCursor()
      if (geometryFrame) cancelAnimationFrame(geometryFrame)
      geometryFrame = 0
      input.removeEventListener('focus', startCursorBlink)
      input.removeEventListener('blur', stopCursorBlink)
      stopCursorBlink()
    }
  }
}
