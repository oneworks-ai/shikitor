import './index.scss'

import { definePlugin } from '@shikitor/core'

import { createInlineReplacementVisuals } from './visual'

function isWordCharacter(character: string | undefined) {
  return !!character && /[\w$]/.test(character)
}

export default definePlugin({
  name: 'inline-replacements',
  inject: ['shikitor'],
  apply(ctx) {
    const shikitor = ctx.shikitor
    const target = shikitor.element
    const output = target.querySelector('.shikitor-output') as HTMLElement
    const input = target.querySelector('.shikitor-input') as HTMLTextAreaElement
    const container = target.querySelector('.shikitor-container') as HTMLElement
    const visuals = createInlineReplacementVisuals({
      shikitor,
      target,
      output,
      input,
      container
    })
    let renderFrame: number | undefined
    let pointerAnchor: number | undefined
    let mappedPointerSelection: { anchor: number; focus: number } | undefined
    let mappedPointerExpiresAt = 0

    const onPointerDown = (event: PointerEvent) => {
      if (
        event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || !visuals.hasActiveReplacement()
      ) return
      const rect = container.getBoundingClientRect()
      if (
        event.clientX < rect.left
        || event.clientX > rect.right
        || event.clientY < rect.top
        || event.clientY > rect.bottom
      ) return
      event.preventDefault()
      event.stopImmediatePropagation()
      input.focus({ preventScroll: true })
      const hit = visuals.pointerPosition(event)
      const position = hit.position
      const previousAnchor = input.selectionDirection === 'backward'
        ? input.selectionEnd
        : input.selectionStart
      pointerAnchor = event.shiftKey ? previousAnchor : position.offset
      if (event.detail === 2 && hit.atomicRange) {
        pointerAnchor = hit.atomicRange.start
        mappedPointerSelection = {
          anchor: hit.atomicRange.start,
          focus: hit.atomicRange.end
        }
      } else if (event.detail === 2) {
        let start = position.offset
        let end = position.offset
        while (start > 0 && isWordCharacter(shikitor.value[start - 1])) start--
        while (end < shikitor.value.length && isWordCharacter(shikitor.value[end])) end++
        pointerAnchor = start
        mappedPointerSelection = { anchor: start, focus: end }
      } else if (event.detail >= 3) {
        const start = shikitor.rawTextHelper.lineStart(position)
        const end = shikitor.rawTextHelper.lineEnd(position)
        pointerAnchor = start
        mappedPointerSelection = { anchor: start, focus: end }
      } else {
        mappedPointerSelection = { anchor: pointerAnchor, focus: position.offset }
      }
      visuals.applySelection(mappedPointerSelection.anchor, mappedPointerSelection.focus)
      mappedPointerExpiresAt = performance.now() + 500
      input.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (pointerAnchor === undefined || !input.hasPointerCapture(event.pointerId)) return
      event.preventDefault()
      const focus = visuals.pointerPosition(event).position.offset
      mappedPointerSelection = { anchor: pointerAnchor, focus }
      mappedPointerExpiresAt = performance.now() + 500
      visuals.applySelection(pointerAnchor, focus)
    }
    const onPointerUp = (event: PointerEvent) => {
      if (pointerAnchor === undefined) return
      if (input.hasPointerCapture(event.pointerId)) input.releasePointerCapture(event.pointerId)
      mappedPointerExpiresAt = performance.now() + 500
      pointerAnchor = undefined
    }
    const onClickMapped = (event: MouseEvent) => {
      if (!mappedPointerSelection || performance.now() > mappedPointerExpiresAt) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const selection = mappedPointerSelection
      mappedPointerSelection = undefined
      setTimeout(() => visuals.applySelection(selection.anchor, selection.focus), 0)
    }
    const onDoubleClick = (event: MouseEvent) => {
      if (!visuals.hasActiveReplacement()) return
      const hit = visuals.pointerPosition(event as PointerEvent)
      if (!hit.atomicRange) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const selection = {
        anchor: hit.atomicRange.start,
        focus: hit.atomicRange.end
      }
      mappedPointerSelection = selection
      mappedPointerExpiresAt = performance.now() + 500
      visuals.applySelection(selection.anchor, selection.focus)
      setTimeout(() => visuals.applySelection(selection.anchor, selection.focus), 0)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      visuals.applyKeyboardNavigation(event)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      visuals.finishKeyboardNavigation(event)
      visuals.render()
    }
    const onSelect = () => {
      if (!visuals.normalizeSelection()) visuals.render()
    }
    function scheduleRender() {
      if (renderFrame !== undefined) return
      renderFrame = requestAnimationFrame(() => {
        renderFrame = undefined
        visuals.render()
      })
    }

    const observer = new MutationObserver(scheduleRender)
    observer.observe(output, { childList: true, subtree: true })
    target.addEventListener('pointerdown', onPointerDown, true)
    target.addEventListener('pointermove', onPointerMove, true)
    target.addEventListener('pointerup', onPointerUp, true)
    target.addEventListener('pointercancel', onPointerUp, true)
    target.addEventListener('click', onClickMapped, true)
    target.addEventListener('dblclick', onDoubleClick, true)
    input.addEventListener('keydown', onKeyDown)
    input.addEventListener('select', onSelect)
    input.addEventListener('keyup', onKeyUp)
    input.addEventListener('scroll', visuals.render)
    input.addEventListener('focus', visuals.render)
    input.addEventListener('blur', visuals.render)
    ctx.on('shikitor/change', scheduleRender)
    ctx.on('shikitor/cursor-change', visuals.render)
    scheduleRender()

    return () => {
      observer.disconnect()
      if (renderFrame !== undefined) cancelAnimationFrame(renderFrame)
      target.removeEventListener('pointerdown', onPointerDown, true)
      target.removeEventListener('pointermove', onPointerMove, true)
      target.removeEventListener('pointerup', onPointerUp, true)
      target.removeEventListener('pointercancel', onPointerUp, true)
      target.removeEventListener('click', onClickMapped, true)
      target.removeEventListener('dblclick', onDoubleClick, true)
      input.removeEventListener('keydown', onKeyDown)
      input.removeEventListener('select', onSelect)
      input.removeEventListener('keyup', onKeyUp)
      input.removeEventListener('scroll', visuals.render)
      input.removeEventListener('focus', visuals.render)
      input.removeEventListener('blur', visuals.render)
      visuals.dispose()
    }
  }
})

export * from './geometry'
