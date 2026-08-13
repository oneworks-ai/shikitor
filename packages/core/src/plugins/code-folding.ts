import './code-folding.scss'

import { definePlugin } from '@shikitor/core'

export interface CodeFoldingOptions {
  /**
   * Collapse top-level foldable ranges when the plugin is mounted.
   * @default false
   */
  defaultCollapsed?: boolean
  /** Accessible label shown for an expanded fold range. */
  collapseLabel?: string
  /** Accessible label shown for a collapsed fold range. */
  expandLabel?: string
}

interface FoldRange {
  startLine: number
  endLine: number
  open: string
  close: string
  closeColumn: number
}

const closingBracket: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}'
}
const openingBracket = Object.fromEntries(
  Object.entries(closingBracket).map(([open, close]) => [close, open])
)

function findFoldRanges(value: string) {
  const stack: Array<{ char: string; line: number }> = []
  const ranges: FoldRange[] = []
  let line = 1
  let quote: '"' | "'" | '`' | undefined
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    const next = value[index + 1]
    if (char === '\n') {
      line++
      lineComment = false
      escaped = false
      continue
    }
    if (lineComment) continue
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index++
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) quote = undefined
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      index++
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index++
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (closingBracket[char]) {
      stack.push({ char, line })
      continue
    }
    const expectedOpen = openingBracket[char]
    if (!expectedOpen) continue
    let openIndex = -1
    for (let stackIndex = stack.length - 1; stackIndex >= 0; stackIndex--) {
      if (stack[stackIndex].char !== expectedOpen) continue
      openIndex = stackIndex
      break
    }
    if (openIndex === -1) continue
    const [{ line: startLine, char: open }] = stack.splice(openIndex, 1)
    if (startLine < line) {
      const lineStart = value.lastIndexOf('\n', index - 1) + 1
      ranges.push({
        startLine,
        endLine: line,
        open,
        close: char,
        closeColumn: index - lineStart
      })
    }
  }

  const widestRangeByLine = new Map<number, FoldRange>()
  for (const range of ranges) {
    const current = widestRangeByLine.get(range.startLine)
    if (!current || range.endLine > current.endLine) {
      widestRangeByLine.set(range.startLine, range)
    }
  }
  return [...widestRangeByLine.values()].sort((a, b) => a.startLine - b.startLine)
}

function cloneLineSuffix(line: HTMLElement, startColumn: number) {
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  let consumed = 0
  let text = walker.nextNode()
  while (text) {
    const length = text.textContent?.length ?? 0
    if (consumed + length >= startColumn) {
      const range = document.createRange()
      range.setStart(text, Math.max(0, startColumn - consumed))
      range.setEnd(line, line.childNodes.length)
      return range.cloneContents()
    }
    consumed += length
    text = walker.nextNode()
  }
}

export default definePlugin({
  name: 'code-folding',
  inject: ['shikitor'],
  apply(ctx, options: CodeFoldingOptions = {}) {
    const shikitor = ctx.shikitor
    const target = shikitor.element
    const output = target.querySelector('.shikitor-output') as HTMLElement
    const gutters = target.querySelector('.shikitor-lines') as HTMLElement
    const input = target.querySelector('.shikitor-input') as HTMLTextAreaElement
    const container = target.querySelector('.shikitor-container') as HTMLElement
    const selectionLayer = document.createElement('div')
    const collapsed = new Set<number>()
    let ranges: FoldRange[] = []
    let initialized = false
    let renderFrame: number | undefined
    let renderPending = true
    const collapseLabel = options.collapseLabel ?? 'Collapse block'
    const expandLabel = options.expandLabel ?? 'Expand block'

    target.classList.add('shikitor--code-folding')
    target.classList.add('shikitor--fold-rendering')
    selectionLayer.className = 'shikitor-fold-selection'
    container.append(selectionLayer)

    function isLineHidden(line: number) {
      return ranges.some(range =>
        collapsed.has(range.startLine)
        && line > range.startLine
        && line <= range.endLine
      )
    }

    function visibleRow(line: number) {
      let row = 0
      for (let sourceLine = 1; sourceLine <= line; sourceLine++) {
        if (!isLineHidden(sourceLine)) row++
      }
      return Math.max(1, row)
    }

    function visibleLines() {
      return shikitor.value
        .split('\n')
        .map((_, index) => index + 1)
        .filter(line => !isLineHidden(line))
    }

    function applySelection(anchor: number, focus: number) {
      const start = Math.min(anchor, focus)
      const end = Math.max(anchor, focus)
      input.setSelectionRange(start, end, focus < anchor ? 'backward' : 'forward')
      const selection = {
        start: shikitor.rawTextHelper.resolvePosition(start),
        end: shikitor.rawTextHelper.resolvePosition(end)
      }
      shikitor.selectionsRef.current[0] = selection
      shikitor.optionsRef.current.cursor = shikitor.rawTextHelper.resolvePosition(focus)
      renderSelection()
    }

    function pointerPosition(event: PointerEvent) {
      const lines = visibleLines()
      const rect = input.getBoundingClientRect()
      const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 22
      const visibleIndex = Math.min(
        lines.length - 1,
        Math.max(0, Math.floor((event.clientY - rect.top + input.scrollTop) / lineHeight))
      )
      const line = lines[visibleIndex] ?? 1
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
      const startVisibleLine = isLineHidden(startPosition.line)
        ? ranges.find(range => collapsed.has(range.startLine) && startPosition.line <= range.endLine)?.startLine
          ?? startPosition.line
        : startPosition.line
      const endVisibleLine = isLineHidden(endPosition.line)
        ? ranges.find(range => collapsed.has(range.startLine) && endPosition.line <= range.endLine)?.startLine
          ?? endPosition.line
        : endPosition.line

      for (let line = startVisibleLine; line <= endVisibleLine; line++) {
        if (isLineHidden(line)) continue
        const marker = document.createElement('div')
        marker.className = 'shikitor-fold-selection__line'
        marker.style.top = `calc(${visibleRow(line) - 1} * var(--line-height))`
        const isFirst = line === startVisibleLine && !isLineHidden(startPosition.line)
        const isLast = line === endVisibleLine && !isLineHidden(endPosition.line)
        if (isFirst) marker.style.setProperty('--selection-start', `${startPosition.character}ch`)
        if (isLast) marker.style.setProperty('--selection-end', `${endPosition.character}ch`)
        selectionLayer.append(marker)
      }
    }

    function updateRanges() {
      ranges = findFoldRanges(shikitor.value)
      const validStarts = new Set(ranges.map(range => range.startLine))
      for (const line of collapsed) {
        if (!validStarts.has(line)) collapsed.delete(line)
      }
      if (!initialized) {
        initialized = true
        if (options.defaultCollapsed) {
          for (const range of ranges) {
            const isNested = ranges.some(other =>
              other !== range
              && other.startLine < range.startLine
              && other.endLine >= range.endLine
            )
            if (!isNested) collapsed.add(range.startLine)
          }
        }
      }
    }

    function render() {
      renderFrame = undefined
      observer.disconnect()
      target.querySelectorAll<HTMLElement>(
        '.shikitor-fold-toggle, .shikitor-fold-placeholder, .shikitor-fold-suffix'
      )
        .forEach(element => element.remove())
      target.querySelectorAll<HTMLElement>('.shikitor-output-line, .shikitor-gutter-line')
        .forEach(element => { element.hidden = false })

      for (const range of [...ranges].reverse()) {
        const gutter = gutters.querySelector<HTMLElement>(`[data-line="${range.startLine}"]`)
        const outputLine = output.querySelector<HTMLElement>(`[data-line="${range.startLine}"]`)
        if (!gutter || !outputLine) continue
        const isCollapsed = collapsed.has(range.startLine)
        const toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.className = 'shikitor-fold-toggle'
        toggle.dataset.foldLine = String(range.startLine)
        toggle.title = isCollapsed ? expandLabel : collapseLabel
        toggle.setAttribute('aria-label', toggle.title)
        toggle.innerHTML = `<span class="shikitor-icon">${isCollapsed ? 'chevron_right' : 'expand_more'}</span>`
        gutter.prepend(toggle)

        if (!isCollapsed) continue
        for (let line = range.startLine + 1; line <= range.endLine; line++) {
          output.querySelector<HTMLElement>(`[data-line="${line}"]`)?.setAttribute('hidden', '')
          gutters.querySelector<HTMLElement>(`[data-line="${line}"]`)?.setAttribute('hidden', '')
        }
        const placeholder = document.createElement('span')
        placeholder.className = 'shikitor-fold-placeholder'
        placeholder.dataset.foldLine = String(range.startLine)
        placeholder.title = expandLabel
        placeholder.textContent = '...'
        outputLine.append(placeholder)
        const closingLine = output.querySelector<HTMLElement>(`[data-line="${range.endLine}"]`)
        const suffixContent = closingLine && cloneLineSuffix(closingLine, range.closeColumn)
        const suffix = document.createElement('span')
        suffix.className = 'shikitor-fold-suffix'
        if (suffixContent) {
          suffix.append(suffixContent)
        } else {
          suffix.textContent = range.close
        }
        outputLine.append(suffix)
      }
      observer.observe(output, { childList: true, subtree: true })
      observer.observe(gutters, { childList: true, subtree: true })
      renderPending = false
      target.classList.remove('shikitor--fold-rendering')
      renderSelection()
    }

    function scheduleRender() {
      if (renderFrame !== undefined) return
      if (!renderPending) {
        renderPending = true
        target.classList.add('shikitor--fold-rendering')
      }
      renderFrame = requestAnimationFrame(render)
    }

    function toggleFold(line: number) {
      const range = ranges.find(item => item.startLine === line)
      if (!range) return
      if (collapsed.has(line)) {
        collapsed.delete(line)
      } else {
        const cursor = shikitor.cursor
        if (cursor.line > range.startLine && cursor.line <= range.endLine) {
          shikitor.focus(shikitor.rawTextHelper.lineEnd({ line: range.startLine, character: 0 }))
        }
        collapsed.add(line)
      }
      scheduleRender()
    }

    const observer = new MutationObserver(scheduleRender)
    const onClick = (event: Event) => {
      if (!(event.target instanceof Element)) return
      const control = event.target.closest<HTMLElement>('[data-fold-line]')
      if (!control || !target.contains(control)) return
      event.preventDefault()
      event.stopPropagation()
      toggleFold(Number(control.dataset.foldLine))
    }
    target.addEventListener('click', onClick)
    let pointerAnchor: number | undefined
    let mappedPointerOffset: number | undefined
    let mappedPointerExpiresAt = 0
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || collapsed.size === 0) return
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
      mappedPointerOffset = position.offset
      mappedPointerExpiresAt = performance.now() + 500
      input.dataset.foldPointerOffset = String(position.offset)
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
        applySelection(start, end)
      } else if (event.detail >= 3) {
        const start = shikitor.rawTextHelper.lineStart(position)
        const end = shikitor.rawTextHelper.lineEnd(position)
        pointerAnchor = start
        applySelection(start, end)
      } else {
        applySelection(pointerAnchor, position.offset)
      }
      input.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (pointerAnchor === undefined || !input.hasPointerCapture(event.pointerId)) return
      event.preventDefault()
      applySelection(pointerAnchor, pointerPosition(event).offset)
    }
    const onPointerUp = (event: PointerEvent) => {
      if (pointerAnchor === undefined) return
      if (input.hasPointerCapture(event.pointerId)) input.releasePointerCapture(event.pointerId)
      pointerAnchor = undefined
    }
    const onMouseDown = (event: MouseEvent) => {
      if (collapsed.size === 0) return
      const rect = container.getBoundingClientRect()
      if (
        event.clientX < rect.left
        || event.clientX > rect.right
        || event.clientY < rect.top
        || event.clientY > rect.bottom
      ) return
      // Prevent the compatibility mouse event from applying the textarea's
      // uncollapsed native line geometry after the pointer mapper ran.
      event.preventDefault()
      event.stopImmediatePropagation()
      if (mappedPointerOffset !== undefined && performance.now() <= mappedPointerExpiresAt) {
        const offset = mappedPointerOffset
        queueMicrotask(() => {
          applySelection(offset, offset)
          mappedPointerOffset = undefined
        })
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (collapsed.size === 0 || input.selectionStart !== input.selectionEnd) return
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
      if (event.altKey || event.metaKey || event.ctrlKey) return
      const cursor = shikitor.rawTextHelper.resolvePosition(input.selectionStart)
      const lines = visibleLines()
      const visibleIndex = lines.indexOf(cursor.line)
      if (visibleIndex === -1) return
      let targetLine: number | undefined
      let character = cursor.character
      if (event.key === 'ArrowUp') targetLine = lines[visibleIndex - 1]
      if (event.key === 'ArrowDown') targetLine = lines[visibleIndex + 1]
      if (event.key === 'ArrowLeft' && cursor.character === 0) {
        targetLine = lines[visibleIndex - 1]
        if (targetLine) character = shikitor.rawTextHelper.line({ line: targetLine, character: 0 }).length
      }
      if (event.key === 'ArrowRight') {
        const lineLength = shikitor.rawTextHelper.line(cursor).length
        if (cursor.character >= lineLength) {
          targetLine = lines[visibleIndex + 1]
          character = 0
        }
      }
      if (!targetLine) return
      event.preventDefault()
      const lineLength = shikitor.rawTextHelper.line({ line: targetLine, character: 0 }).length
      const offset = shikitor.rawTextHelper.resolvePosition({
        line: targetLine,
        character: Math.min(character, lineLength)
      }).offset
      applySelection(offset, offset)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('pointercancel', onPointerUp, true)
    document.addEventListener('mousedown', onMouseDown, true)
    const onClickMapped = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      if (
        event.clientX < rect.left
        || event.clientX > rect.right
        || event.clientY < rect.top
        || event.clientY > rect.bottom
      ) return
      const pendingOffset = input.dataset.foldPointerOffset
      if (mappedPointerOffset === undefined && pendingOffset === undefined) return
      if (performance.now() > mappedPointerExpiresAt && pendingOffset === undefined) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const offset = mappedPointerOffset ?? Number(pendingOffset)
      mappedPointerOffset = undefined
      delete input.dataset.foldPointerOffset
      setTimeout(() => applySelection(offset, offset), 0)
    }
    document.addEventListener('click', onClickMapped, true)
    input.addEventListener('keydown', onKeyDown)
    const onSelectionChange = () => renderSelection()
    document.addEventListener('selectionchange', onSelectionChange)
    input.addEventListener('select', onSelectionChange)
    input.addEventListener('focus', onSelectionChange)
    input.addEventListener('blur', onSelectionChange)

    ctx.on('shikitor/change', () => {
      updateRanges()
      scheduleRender()
    })
    ctx.on('shikitor/cursor-change', cursor => {
      if (!cursor) return
      const hiddenRange = ranges.find(range =>
        collapsed.has(range.startLine)
        && cursor.line > range.startLine
        && cursor.line <= range.endLine
      )
      if (!hiddenRange) return
      // The caret model keeps the real source offset. A pointer selection can
      // therefore cross folded text without expanding it. Only explicit
      // keyboard navigation into a hidden line should reveal that range.
      if (document.activeElement !== input || input.selectionStart !== input.selectionEnd) return
      // Pointer coordinates are based on the native textarea's full source
      // geometry. Keep the fold stable and clamp a click into the hidden body
      // to the visible opening line. Explicit gutter controls remain the only
      // way to unfold a block.
      const offset = shikitor.rawTextHelper.lineEnd({ line: hiddenRange.startLine, character: 0 })
      input.setSelectionRange(offset, offset)
      renderSelection()
    })

    updateRanges()
    scheduleRender()
    return () => {
      observer.disconnect()
      if (renderFrame !== undefined) cancelAnimationFrame(renderFrame)
      target.removeEventListener('click', onClick)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('pointercancel', onPointerUp, true)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('click', onClickMapped, true)
      input.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('selectionchange', onSelectionChange)
      input.removeEventListener('select', onSelectionChange)
      input.removeEventListener('focus', onSelectionChange)
      input.removeEventListener('blur', onSelectionChange)
      target.classList.remove('shikitor--code-folding', 'shikitor--fold-rendering')
      selectionLayer.remove()
      target.querySelectorAll<HTMLElement>(
        '.shikitor-fold-toggle, .shikitor-fold-placeholder, .shikitor-fold-suffix'
      )
        .forEach(element => element.remove())
      target.querySelectorAll<HTMLElement>('.shikitor-output-line, .shikitor-gutter-line')
        .forEach(element => { element.hidden = false })
    }
  }
})
