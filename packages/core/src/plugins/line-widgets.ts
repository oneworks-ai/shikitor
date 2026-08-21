import './line-widgets.scss'

import { definePlugin } from '@shikitor/core'

import { installCursorGeometryLayer } from './cursor-geometry-layer'

export interface LineWidget {
  id: string
  /** One-based source line after which the region is inserted. Use 0 before the first line. */
  afterLine: number
  className?: string
  minHeight?: number
  render(container: HTMLElement): void | (() => void)
}

export interface LineWidgetsOptions {
  widgets: LineWidget[] | (() => readonly LineWidget[])
  onReady?(controller: LineWidgetsController): void
}

export interface LineWidgetsController {
  refresh(): void
}

export interface LineWidgetGeometryEntry {
  /** One-based source line after which the widget is inserted (0 before the first line). */
  afterLine: number
  /** Measured widget height in CSS pixels; finite and non-negative. */
  height: number
}

/**
 * Cached vertical geometry of the mounted widgets. `afterLines` is ascending
 * and `heightPrefix[i]` sums the heights of widgets `0..i-1` (so the last
 * entry is the total widget height). Every lookup below is pure arithmetic
 * over these arrays, which keeps the cursor-geometry transform, pointer
 * mapping and selection overlay free of DOM measurements.
 */
export interface LineWidgetGeometry {
  readonly afterLines: readonly number[]
  readonly heightPrefix: readonly number[]
}

export const EMPTY_LINE_WIDGET_GEOMETRY: LineWidgetGeometry = {
  afterLines: [],
  heightPrefix: [0]
}

export function createLineWidgetGeometry(
  entries: readonly LineWidgetGeometryEntry[]
): LineWidgetGeometry {
  const sorted = [...entries].sort((a, b) => a.afterLine - b.afterLine)
  const afterLines = new Array<number>(sorted.length)
  const heightPrefix = new Array<number>(sorted.length + 1)
  heightPrefix[0] = 0
  for (let index = 0; index < sorted.length; index++) {
    afterLines[index] = sorted[index].afterLine
    heightPrefix[index + 1] = heightPrefix[index] + sorted[index].height
  }
  return { afterLines, heightPrefix }
}

export function totalLineWidgetHeight(geometry: LineWidgetGeometry) {
  return geometry.heightPrefix[geometry.afterLines.length]
}

/** Summed height of the widgets anchored strictly before `line` (`afterLine < line`). */
export function resolveWidgetHeightBeforeLine(geometry: LineWidgetGeometry, line: number) {
  const { afterLines, heightPrefix } = geometry
  let low = 0
  let high = afterLines.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (afterLines[middle] < line) low = middle + 1
    else high = middle
  }
  return heightPrefix[low]
}

/** Visual top of a one-based source line: the lines above plus the widgets anchored before it. */
export function resolveSourceLineTop(
  geometry: LineWidgetGeometry,
  line: number,
  lineHeight: number
) {
  return (line - 1) * lineHeight + resolveWidgetHeightBeforeLine(geometry, line)
}

/**
 * First source line whose row (`top .. top + lineHeight`) extends below
 * `visualY`, or `lineCount` when `visualY` lies below the last line. Line
 * tops are monotonic (positive line height, non-negative widget heights), so
 * the scan over all lines is a binary search.
 */
export function resolveSourceLineAtVisualY(
  geometry: LineWidgetGeometry,
  visualY: number,
  lineHeight: number,
  lineCount: number
) {
  if (lineCount < 1) return lineCount
  let low = 1
  let high = lineCount
  while (low < high) {
    const middle = (low + high) >>> 1
    if (visualY < resolveSourceLineTop(geometry, middle, lineHeight) + lineHeight) high = middle
    else low = middle + 1
  }
  return low
}

interface MountedLineWidget {
  afterLine: number
  className: string
  height: number
  id: string
  minHeight?: number
  region: HTMLElement
  spacer: HTMLElement
}

function collectLines(root: ParentNode, selector: string) {
  const lines = new Map<number, HTMLElement>()
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    const line = Number(element.dataset.line)
    // `querySelector` semantics: the first element in document order wins.
    if (!lines.has(line)) lines.set(line, element)
  }
  return lines
}

export default definePlugin({
  name: 'line-widgets',
  inject: ['shikitor'],
  apply(ctx, options: LineWidgetsOptions) {
    const shikitor = ctx.shikitor
    const target = shikitor.element
    const output = target.querySelector('.shikitor-output') as HTMLElement
    const gutters = target.querySelector('.shikitor-lines') as HTMLElement
    const input = shikitor.inputElement
    const container = target.querySelector('.shikitor-container') as HTMLElement
    const selectionLayer = document.createElement('div')
    let renderFrame: number | undefined
    let widgetDisposers: Array<() => void> = []
    let mounted: MountedLineWidget[] = []
    let geometry: LineWidgetGeometry = EMPTY_LINE_WIDGET_GEOMETRY
    let gutterWidth: number | undefined
    let rendering = false
    let resizeObserver: ResizeObserver | undefined

    target.classList.add('shikitor--line-widgets')
    selectionLayer.className = 'shikitor-line-widget-selection'
    container.append(selectionLayer)

    const readLineHeight = () => Number.parseFloat(getComputedStyle(input).lineHeight) || 22

    const geometryLayer = installCursorGeometryLayer(
      shikitor,
      (getCursorAbsolutePosition, cursor, lineOffset) => {
        const position = getCursorAbsolutePosition(cursor, lineOffset)
        return {
          x: position.x,
          y: position.y + resolveWidgetHeightBeforeLine(geometry, cursor.line)
        }
      }
    )

    function applyCursorPosition(position: { x: number; y: number }) {
      target.style.setProperty('--shikitor-cursor-t', `${position.y}px`)
      target.style.setProperty('--shikitor-cursor-l', `${position.x}px`)
    }

    function renderCursor() {
      applyCursorPosition(shikitor._getCursorAbsolutePosition(shikitor.cursor, -1))
    }

    let cursorFrame: number | undefined
    // Cursor changes arrive inside input handlers, right after projection
    // writes; measuring there forces a synchronous layout flush. The caret
    // only needs to be current by the next paint.
    function scheduleCursorRender() {
      if (cursorFrame !== undefined) return
      cursorFrame = requestAnimationFrame(() => {
        cursorFrame = undefined
        if (renderFrame !== undefined) return
        renderCursor()
      })
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
      const lineHeight = readLineHeight()
      const visualY = Math.max(0, event.clientY - rect.top + input.scrollTop)
      const lineCount = shikitor.value.split('\n').length
      const line = resolveSourceLineAtVisualY(geometry, visualY, lineHeight, lineCount)
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

    interface SelectionMarker { end?: number; start?: number; top: number }

    function readSelectionMarkers(): SelectionMarker[] {
      if (target.classList.contains('shikitor--fold-collapsed')) return []
      const start = Math.min(input.selectionStart, input.selectionEnd)
      const end = Math.max(input.selectionStart, input.selectionEnd)
      if (start === end || document.activeElement !== input) return []
      const startPosition = shikitor.rawTextHelper.resolvePosition(start)
      const endPosition = shikitor.rawTextHelper.resolvePosition(end)
      const lineHeight = readLineHeight()
      const scrollTop = input.scrollTop
      const markers: SelectionMarker[] = []
      for (let line = startPosition.line; line <= endPosition.line; line++) {
        markers.push({
          end: line === endPosition.line ? endPosition.character : undefined,
          start: line === startPosition.line ? startPosition.character : undefined,
          top: resolveSourceLineTop(geometry, line, lineHeight) - scrollTop
        })
      }
      return markers
    }

    function applySelectionMarkers(markers: readonly SelectionMarker[]) {
      if (!markers.length) {
        if (selectionLayer.childElementCount) selectionLayer.replaceChildren()
        return
      }
      const fragment = document.createDocumentFragment()
      for (const entry of markers) {
        const marker = document.createElement('div')
        marker.className = 'shikitor-line-widget-selection__line'
        marker.style.top = `${entry.top}px`
        if (entry.start !== undefined) marker.style.setProperty('--selection-start', `${entry.start}ch`)
        if (entry.end !== undefined) marker.style.setProperty('--selection-end', `${entry.end}ch`)
        fragment.append(marker)
      }
      selectionLayer.replaceChildren(fragment)
    }

    function renderSelection() {
      applySelectionMarkers(readSelectionMarkers())
    }

    function clearWidgets() {
      resizeObserver?.disconnect()
      widgetDisposers.forEach(dispose => dispose())
      widgetDisposers = []
      for (const entry of mounted) {
        entry.region.remove()
        entry.spacer.remove()
      }
      mounted = []
      geometry = EMPTY_LINE_WIDGET_GEOMETRY
      input.style.removeProperty('--shikitor-line-widget-extra-height')
      input.style.removeProperty('padding-bottom')
    }

    function applyGutterWidth(width: number) {
      const value = `${width}px`
      for (const entry of mounted) {
        entry.region.style.setProperty('--shikitor-line-widget-gutter-width', value)
      }
    }

    /**
     * One layout read pass (gutter width plus the heights of every mounted
     * region, or only of `regions` for resize notifications), then one write
     * pass applying the spacer heights, the extra input height and the
     * cached geometry. Returns whether anything changed.
     */
    function measureGeometry(regions?: ReadonlySet<Element>): MountedLineWidget[] | undefined {
      if (mounted.length === 0) return undefined
      const full = regions === undefined
      const nextGutterWidth = gutters.getBoundingClientRect().width
      const gutterWidthChanged = nextGutterWidth !== gutterWidth
      if (gutterWidthChanged) {
        // Region widths derive from the gutter width, so it has to be applied
        // before heights are measured. Rare after the first pass (line-number
        // digit count or font changes), so the extra layout is acceptable.
        gutterWidth = nextGutterWidth
        applyGutterWidth(nextGutterWidth)
      }
      const subset = full || gutterWidthChanged ? undefined : regions
      const changed: MountedLineWidget[] = []
      for (const entry of mounted) {
        if (subset && !subset.has(entry.region)) continue
        const height = entry.region.getBoundingClientRect().height
        if (height === entry.height && !full) continue
        entry.height = height
        changed.push(entry)
      }
      if (!full && !gutterWidthChanged && changed.length === 0) return undefined
      geometry = createLineWidgetGeometry(mounted)
      return changed
    }

    function applyGeometry(changed: MountedLineWidget[]) {
      for (const entry of changed) entry.spacer.style.height = `${entry.height}px`
      const extraHeight = totalLineWidgetHeight(geometry)
      input.style.setProperty('--shikitor-line-widget-extra-height', `${extraHeight}px`)
      input.style.paddingBottom = `${extraHeight}px`
    }

    function syncGeometry(regions?: ReadonlySet<Element>) {
      const changed = measureGeometry(regions)
      if (!changed) return false
      applyGeometry(changed)
      return true
    }

    function ensureResizeObserver() {
      if (resizeObserver || typeof ResizeObserver === 'undefined') return resizeObserver
      resizeObserver = new ResizeObserver(entries => {
        if (rendering || mounted.length === 0) return
        const regions = new Set<Element>()
        for (const entry of entries) regions.add(entry.target)
        if (!syncGeometry(regions)) return
        renderCursor()
        renderSelection()
      })
      return resizeObserver
    }

    function render() {
      renderFrame = undefined
      observer.disconnect()
      rendering = true
      try {
        const configuredWidgets = typeof options.widgets === 'function'
          ? options.widgets()
          : options.widgets
        const widgets = [...(configuredWidgets ?? [])]
          .filter(widget => Number.isInteger(widget.afterLine) && widget.afterLine >= 0)
          .sort((a, b) => a.afterLine - b.afterLine)
        // Regions are created with the gutter width already applied so their
        // first measurement reflects the final width. Later passes reuse the
        // cached value; `syncGeometry` re-applies it if it changed meanwhile.
        if (gutterWidth === undefined && widgets.length > 0) {
          gutterWidth = gutters.getBoundingClientRect().width
        }
        // Regions and spacers are keyed by widget id and kept across passes
        // when their anchor and presentation are unchanged, so a keystroke
        // that leaves the widget list alone inserts no DOM; the widget's own
        // render callback decides whether its content needs work.
        resizeObserver?.disconnect()
        widgetDisposers.forEach(dispose => dispose())
        widgetDisposers = []
        const reusable = new Map<string, MountedLineWidget>()
        for (const entry of mounted) reusable.set(entry.id, entry)
        mounted = []
        const outputLines = collectLines(output, '.shikitor-output-line[data-line]')
        const gutterLines = collectLines(gutters, '.shikitor-gutter-line[data-line]')
        const outputAnchors = new Map<number, Element>()
        const gutterAnchors = new Map<number, Element>()
        const gutterWidthValue = `${gutterWidth ?? 0}px`
        const place = (node: Element, anchor: Element, before: boolean) => {
          if (before) {
            if (anchor.previousSibling !== node) anchor.before(node)
          } else if (anchor.nextSibling !== node) {
            anchor.after(node)
          }
        }

        // Write pass: mount every region and spacer before measuring anything.
        for (const widget of widgets) {
          const anchorLine = Math.max(1, widget.afterLine)
          const outputLine = outputLines.get(anchorLine)
          const gutterLine = gutterLines.get(anchorLine)
          if (!outputLine || !gutterLine) continue
          const className = `shikitor-line-widget${widget.className ? ` ${widget.className}` : ''}`

          let entry = reusable.get(widget.id)
          if (entry) reusable.delete(widget.id)
          if (
            entry
            && (
              entry.afterLine !== widget.afterLine
              || entry.className !== className
              || entry.minHeight !== widget.minHeight
            )
          ) {
            entry.region.remove()
            entry.spacer.remove()
            entry = undefined
          }
          if (!entry) {
            const region = document.createElement('div')
            region.className = className
            region.dataset.shikitorLineWidget = widget.id
            region.dataset.afterLine = String(widget.afterLine)
            if (widget.minHeight) region.style.minHeight = `${widget.minHeight}px`
            region.style.setProperty('--shikitor-line-widget-gutter-width', gutterWidthValue)

            const spacer = document.createElement('div')
            spacer.className = 'shikitor-line-widget-gutter'
            spacer.dataset.shikitorLineWidget = `${widget.id}-gutter`
            spacer.setAttribute('aria-hidden', 'true')
            entry = {
              afterLine: widget.afterLine,
              className,
              height: 0,
              id: widget.id,
              minHeight: widget.minHeight,
              region,
              spacer
            }
          }

          const outputAnchor = outputAnchors.get(widget.afterLine) ?? outputLine
          const gutterAnchor = gutterAnchors.get(widget.afterLine) ?? gutterLine
          place(entry.region, outputAnchor, widget.afterLine === 0 && !outputAnchors.has(widget.afterLine))
          place(entry.spacer, gutterAnchor, widget.afterLine === 0 && !gutterAnchors.has(widget.afterLine))
          outputAnchors.set(widget.afterLine, entry.region)
          gutterAnchors.set(widget.afterLine, entry.spacer)

          const dispose = widget.render(entry.region)
          if (dispose) widgetDisposers.push(dispose)
          mounted.push(entry)
        }
        for (const entry of reusable.values()) {
          entry.region.remove()
          entry.spacer.remove()
        }
        if (mounted.length === 0) {
          geometry = EMPTY_LINE_WIDGET_GEOMETRY
          input.style.removeProperty('--shikitor-line-widget-extra-height')
          input.style.removeProperty('padding-bottom')
        }

        // One read pass for the whole batch (region heights, caret geometry,
        // selection), then one write pass; measuring after the spacer writes
        // would force a second style and layout flush.
        const changed = measureGeometry() ?? []
        const cursorPosition = shikitor._getCursorAbsolutePosition(shikitor.cursor, -1)
        const selectionMarkers = readSelectionMarkers()
        applyGeometry(changed)
        applyCursorPosition(cursorPosition)
        applySelectionMarkers(selectionMarkers)
        const regionObserver = ensureResizeObserver()
        if (regionObserver) {
          for (const entry of mounted) regionObserver.observe(entry.region)
        }
      } finally {
        rendering = false
      }

      observer.observe(output, { childList: true, subtree: true })
      observer.observe(gutters, { childList: true, subtree: true })
    }

    function scheduleRender() {
      if (renderFrame !== undefined) return
      renderFrame = requestAnimationFrame(render)
    }

    const hasLineStructureMutation = (records: MutationRecord[]) => records.some(record => (
      [...record.addedNodes, ...record.removedNodes].some(node => (
        node instanceof Element
        && (
          node.matches('.shikitor-output-line[data-line], .shikitor-gutter-line[data-line]')
          || !!node.querySelector('.shikitor-output-line[data-line], .shikitor-gutter-line[data-line]')
        )
      ))
    ))
    const observer = new MutationObserver(records => {
      if (hasLineStructureMutation(records)) scheduleRender()
    })
    let pointerAnchor: number | undefined
    let mappedPointerSelection: { anchor: number; focus: number } | undefined
    let mappedPointerExpiresAt = 0
    const isInteractiveTarget = (event: Event) => {
      if (!(event.target instanceof Element) || event.target === input) return false
      return !!event.target.closest(
        '.shikitor-line-widget, button, a, input, select, textarea, [role="button"]'
      )
    }
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.button !== 0
        || target.classList.contains('shikitor--fold-collapsed')
        || isInteractiveTarget(event)
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
      if (target.classList.contains('shikitor--fold-collapsed')) return
      if (!mappedPointerSelection || performance.now() > mappedPointerExpiresAt) return
      if (isInteractiveTarget(event)) return
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
    ctx.on('shikitor/cursor-change', scheduleCursorRender)
    options.onReady?.({ refresh: scheduleRender })
    scheduleRender()
    return () => {
      observer.disconnect()
      if (renderFrame !== undefined) cancelAnimationFrame(renderFrame)
      if (cursorFrame !== undefined) cancelAnimationFrame(cursorFrame)
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
      geometryLayer.dispose()
      clearWidgets()
      resizeObserver = undefined
      selectionLayer.remove()
      target.classList.remove('shikitor--line-widgets')
    }
  }
})
