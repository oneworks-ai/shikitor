import './line-widgets.scss'

import { definePlugin } from '@shikitor/core'

export interface LineWidget {
  id: string
  /** One-based source line after which the region is inserted. */
  afterLine: number
  className?: string
  minHeight?: number
  render(container: HTMLElement): void | (() => void)
}

export interface LineWidgetsOptions {
  widgets: LineWidget[]
}

export default definePlugin({
  name: 'line-widgets',
  inject: ['shikitor'],
  apply(ctx, options: LineWidgetsOptions) {
    const shikitor = ctx.shikitor
    const target = shikitor.element
    const output = target.querySelector('.shikitor-output') as HTMLElement
    const gutters = target.querySelector('.shikitor-lines') as HTMLElement
    const input = target.querySelector('.shikitor-input') as HTMLTextAreaElement
    const container = target.querySelector('.shikitor-container') as HTMLElement
    const selectionLayer = document.createElement('div')
    const getCursorAbsolutePosition = shikitor._getCursorAbsolutePosition.bind(shikitor)
    let renderFrame: number | undefined
    let widgetDisposers: Array<() => void> = []
    let widgetObservers: ResizeObserver[] = []

    target.classList.add('shikitor--line-widgets')
    selectionLayer.className = 'shikitor-line-widget-selection'
    container.append(selectionLayer)

    function widgetHeightBeforeLine(line: number) {
      return [...target.querySelectorAll<HTMLElement>('.shikitor-line-widget')]
        .filter(widget => Number(widget.dataset.afterLine) < line)
        .reduce((height, widget) => height + widget.getBoundingClientRect().height, 0)
    }

    function sourceLineTop(line: number) {
      const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 22
      return (line - 1) * lineHeight + widgetHeightBeforeLine(line)
    }

    const getLineWidgetCursorPosition = (cursor: Parameters<typeof getCursorAbsolutePosition>[0], lineOffset = 0) => {
      const position = getCursorAbsolutePosition(cursor, lineOffset)
      return {
        x: position.x,
        y: position.y + widgetHeightBeforeLine(cursor.line)
      }
    }
    shikitor._getCursorAbsolutePosition = getLineWidgetCursorPosition

    function renderCursor() {
      const position = shikitor._getCursorAbsolutePosition(shikitor.cursor, -1)
      target.style.setProperty('--shikitor-cursor-t', `${position.y}px`)
      target.style.setProperty('--shikitor-cursor-l', `${position.x}px`)
    }

    function applySelection(anchor: number, focus: number) {
      const start = Math.min(anchor, focus)
      const end = Math.max(anchor, focus)
      input.setSelectionRange(start, end, focus < anchor ? 'backward' : 'forward')
      shikitor.selectionsRef.current[0] = {
        start: shikitor.rawTextHelper.resolvePosition(start),
        end: shikitor.rawTextHelper.resolvePosition(end)
      }
      shikitor.optionsRef.current.cursor = shikitor.rawTextHelper.resolvePosition(focus)
      renderSelection()
    }

    function pointerPosition(event: PointerEvent) {
      const rect = input.getBoundingClientRect()
      const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 22
      const visualY = Math.max(0, event.clientY - rect.top + input.scrollTop)
      const lineCount = shikitor.value.split('\n').length
      let line = lineCount
      for (let sourceLine = 1; sourceLine <= lineCount; sourceLine++) {
        if (visualY < sourceLineTop(sourceLine) + lineHeight) {
          line = sourceLine
          break
        }
      }
      const lineText = shikitor.rawTextHelper.line({ line, character: 0 })
      const x = Math.max(0, event.clientX - rect.left + input.scrollLeft)
      let low = 0
      let high = lineText.length
      while (low < high) {
        const middle = Math.floor((low + high + 1) / 2)
        const cursor = shikitor.rawTextHelper.resolvePosition({ line, character: middle })
        const width = shikitor._getCursorAbsolutePosition(cursor).x
        if (width <= x) low = middle
        else high = middle - 1
      }
      const currentCursor = shikitor.rawTextHelper.resolvePosition({ line, character: low })
      const currentWidth = shikitor._getCursorAbsolutePosition(currentCursor).x
      const nextWidth = low < lineText.length
        ? shikitor._getCursorAbsolutePosition(
            shikitor.rawTextHelper.resolvePosition({ line, character: low + 1 })
          ).x
        : currentWidth
      const character = low < lineText.length && x - currentWidth > (nextWidth - currentWidth) / 2
        ? low + 1
        : low
      return shikitor.rawTextHelper.resolvePosition({ line, character })
    }

    function renderSelection() {
      selectionLayer.replaceChildren()
      const start = Math.min(input.selectionStart, input.selectionEnd)
      const end = Math.max(input.selectionStart, input.selectionEnd)
      if (start === end || document.activeElement !== input) return
      const startPosition = shikitor.rawTextHelper.resolvePosition(start)
      const endPosition = shikitor.rawTextHelper.resolvePosition(end)
      for (let line = startPosition.line; line <= endPosition.line; line++) {
        const marker = document.createElement('div')
        marker.className = 'shikitor-line-widget-selection__line'
        marker.style.top = `${sourceLineTop(line) - input.scrollTop}px`
        if (line === startPosition.line) marker.style.setProperty('--selection-start', `${startPosition.character}ch`)
        if (line === endPosition.line) marker.style.setProperty('--selection-end', `${endPosition.character}ch`)
        selectionLayer.append(marker)
      }
    }

    function clearWidgets() {
      widgetObservers.forEach(observer => observer.disconnect())
      widgetObservers = []
      widgetDisposers.forEach(dispose => dispose())
      widgetDisposers = []
      target.querySelectorAll<HTMLElement>('[data-shikitor-line-widget]')
        .forEach(element => element.remove())
    }

    function render() {
      renderFrame = undefined
      observer.disconnect()
      clearWidgets()
      const outputAnchors = new Map<number, Element>()
      const gutterAnchors = new Map<number, Element>()
      const widgets = [...(options.widgets ?? [])]
        .filter(widget => Number.isInteger(widget.afterLine) && widget.afterLine > 0)
        .sort((a, b) => a.afterLine - b.afterLine)

      for (const widget of widgets) {
        const outputLine = output.querySelector<HTMLElement>(`[data-line="${widget.afterLine}"]`)
        const gutterLine = gutters.querySelector<HTMLElement>(`[data-line="${widget.afterLine}"]`)
        if (!outputLine || !gutterLine) continue

        const region = document.createElement('div')
        region.className = `shikitor-line-widget${widget.className ? ` ${widget.className}` : ''}`
        region.dataset.shikitorLineWidget = widget.id
        region.dataset.afterLine = String(widget.afterLine)
        if (widget.minHeight) region.style.minHeight = `${widget.minHeight}px`

        const spacer = document.createElement('div')
        spacer.className = 'shikitor-line-widget-gutter'
        spacer.dataset.shikitorLineWidget = `${widget.id}-gutter`
        spacer.setAttribute('aria-hidden', 'true')

        const outputAnchor = outputAnchors.get(widget.afterLine) ?? outputLine
        const gutterAnchor = gutterAnchors.get(widget.afterLine) ?? gutterLine
        outputAnchor.after(region)
        gutterAnchor.after(spacer)
        outputAnchors.set(widget.afterLine, region)
        gutterAnchors.set(widget.afterLine, spacer)

        const dispose = widget.render(region)
        if (dispose) widgetDisposers.push(dispose)
        const syncHeight = () => {
          region.style.setProperty(
            '--shikitor-line-widget-gutter-width',
            `${gutters.getBoundingClientRect().width}px`
          )
          spacer.style.height = `${region.getBoundingClientRect().height}px`
          renderCursor()
          renderSelection()
        }
        syncHeight()
        const resizeObserver = new ResizeObserver(syncHeight)
        resizeObserver.observe(region)
        widgetObservers.push(resizeObserver)
      }

      observer.observe(output, { childList: true, subtree: true })
      observer.observe(gutters, { childList: true, subtree: true })
      renderCursor()
      renderSelection()
    }

    function scheduleRender() {
      if (renderFrame !== undefined) return
      renderFrame = requestAnimationFrame(render)
    }

    const observer = new MutationObserver(scheduleRender)
    let pointerAnchor: number | undefined
    let mappedPointerSelection: { anchor: number; focus: number } | undefined
    let mappedPointerExpiresAt = 0
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.button !== 0
        || (event.target instanceof Element && event.target.closest('.shikitor-line-widget'))
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
      const position = pointerPosition(event)
      const previousAnchor = input.selectionDirection === 'backward'
        ? input.selectionEnd
        : input.selectionStart
      pointerAnchor = event.shiftKey ? previousAnchor : position.offset
      if (event.detail === 2) {
        const isWord = (character: string | undefined) => !!character && /[\w$]/.test(character)
        let start = position.offset
        let end = position.offset
        while (start > 0 && isWord(shikitor.value[start - 1])) start--
        while (end < shikitor.value.length && isWord(shikitor.value[end])) end++
        pointerAnchor = start
        mappedPointerSelection = { anchor: start, focus: end }
        applySelection(start, end)
      } else if (event.detail >= 3) {
        const start = shikitor.rawTextHelper.lineStart(position)
        const end = shikitor.rawTextHelper.lineEnd(position)
        pointerAnchor = start
        mappedPointerSelection = { anchor: start, focus: end }
        applySelection(start, end)
      } else {
        mappedPointerSelection = { anchor: pointerAnchor, focus: position.offset }
        applySelection(pointerAnchor, position.offset)
      }
      mappedPointerExpiresAt = performance.now() + 500
      input.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (pointerAnchor === undefined || !input.hasPointerCapture(event.pointerId)) return
      event.preventDefault()
      const focus = pointerPosition(event).offset
      mappedPointerSelection = { anchor: pointerAnchor, focus }
      mappedPointerExpiresAt = performance.now() + 500
      applySelection(pointerAnchor, focus)
    }
    const onPointerUp = (event: PointerEvent) => {
      if (pointerAnchor === undefined) return
      if (input.hasPointerCapture(event.pointerId)) input.releasePointerCapture(event.pointerId)
      mappedPointerExpiresAt = performance.now() + 500
      pointerAnchor = undefined
    }
    const onClickMapped = (event: MouseEvent) => {
      if (!mappedPointerSelection || performance.now() > mappedPointerExpiresAt) return
      if (event.target instanceof Element && event.target.closest('.shikitor-line-widget')) return
      const rect = container.getBoundingClientRect()
      if (
        event.clientX < rect.left
        || event.clientX > rect.right
        || event.clientY < rect.top
        || event.clientY > rect.bottom
      ) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const selection = mappedPointerSelection
      mappedPointerSelection = undefined
      setTimeout(() => applySelection(selection.anchor, selection.focus), 0)
    }
    let syncingSelection = false
    const syncNativeSelection = () => {
      if (syncingSelection) return
      syncingSelection = true
      const isBackward = input.selectionDirection === 'backward'
      const anchor = isBackward ? input.selectionEnd : input.selectionStart
      const focus = isBackward ? input.selectionStart : input.selectionEnd
      applySelection(anchor, focus)
      syncingSelection = false
    }
    target.addEventListener('pointerdown', onPointerDown, true)
    target.addEventListener('pointermove', onPointerMove, true)
    target.addEventListener('pointerup', onPointerUp, true)
    target.addEventListener('pointercancel', onPointerUp, true)
    target.addEventListener('click', onClickMapped, true)
    input.addEventListener('select', syncNativeSelection)
    input.addEventListener('keyup', syncNativeSelection)
    input.addEventListener('scroll', renderSelection)
    input.addEventListener('focus', renderSelection)
    input.addEventListener('blur', renderSelection)
    ctx.on('shikitor/change', scheduleRender)
    ctx.on('shikitor/cursor-change', renderCursor)
    scheduleRender()
    return () => {
      observer.disconnect()
      if (renderFrame !== undefined) cancelAnimationFrame(renderFrame)
      target.removeEventListener('pointerdown', onPointerDown, true)
      target.removeEventListener('pointermove', onPointerMove, true)
      target.removeEventListener('pointerup', onPointerUp, true)
      target.removeEventListener('pointercancel', onPointerUp, true)
      target.removeEventListener('click', onClickMapped, true)
      input.removeEventListener('select', syncNativeSelection)
      input.removeEventListener('keyup', syncNativeSelection)
      input.removeEventListener('scroll', renderSelection)
      input.removeEventListener('focus', renderSelection)
      input.removeEventListener('blur', renderSelection)
      if (shikitor._getCursorAbsolutePosition === getLineWidgetCursorPosition) {
        shikitor._getCursorAbsolutePosition = getCursorAbsolutePosition
      }
      clearWidgets()
      selectionLayer.remove()
      target.classList.remove('shikitor--line-widgets')
    }
  }
})
