import './code-folding.scss'

import { definePlugin } from '@shikitor/core'

import { installCursorGeometryLayer } from './cursor-geometry-layer'

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
  /** Override syntax-derived ranges with application-defined ranges. */
  ranges?: readonly CodeFoldingRange[] | (() => readonly CodeFoldingRange[])
  onReady?(controller: CodeFoldingController): void
}

export interface CodeFoldingRange {
  startLine: number
  endLine: number
  label?: string
  presentation?: 'inline' | 'line'
}

export interface CodeFoldingController {
  refresh(): void
  toggle(line: number): void
}

interface FoldRange {
  startLine: number
  endLine: number
  open: string
  close: string
  closeColumn: number
  kind: 'block' | 'import' | 'import-group' | 'line-comment' | 'block-comment' | 'custom'
  label?: string
  presentation?: 'inline' | 'line'
  suffixLine?: number
  suffixColumn?: number
}

interface ImportStatement {
  startLine: number
  endLine: number
}

export interface FoldScrollMetrics {
  scrollTop: number
  maxScrollTop: number
  thumbTop: number
  thumbHeight: number
}

/**
 * Resolve the vertical scroll geometry for the folded (visual) document.
 *
 * The textarea intentionally keeps the complete source value, so its native
 * scrollHeight cannot describe a folded document. Keeping this calculation
 * independent from the textarea makes the rendered source, gutter and custom
 * scrollbar share one coordinate system.
 */
export function resolveFoldScrollMetrics(
  contentHeight: number,
  viewportHeight: number,
  requestedScrollTop: number,
  trackHeight = viewportHeight,
  minimumThumbHeight = 24
): FoldScrollMetrics {
  const safeContentHeight = Math.max(0, contentHeight)
  const safeViewportHeight = Math.max(0, viewportHeight)
  const safeTrackHeight = Math.max(0, trackHeight)
  const maxScrollTop = Math.max(0, safeContentHeight - safeViewportHeight)
  const scrollTop = Math.min(maxScrollTop, Math.max(0, requestedScrollTop))
  const thumbHeight = maxScrollTop === 0
    ? safeTrackHeight
    : Math.min(
        safeTrackHeight,
        Math.max(minimumThumbHeight, safeTrackHeight * safeViewportHeight / safeContentHeight)
      )
  const thumbTravel = Math.max(0, safeTrackHeight - thumbHeight)
  const thumbTop = maxScrollTop === 0 ? 0 : scrollTop / maxScrollTop * thumbTravel
  return { scrollTop, maxScrollTop, thumbTop, thumbHeight }
}

export function shouldUseFoldVisualHorizontalScroll(
  hasCollapsedRange: boolean,
  visualContentWidth: number,
  inputContentWidth: number
) {
  return hasCollapsedRange && visualContentWidth > inputContentWidth
}

export interface FoldVisualBoundary {
  offset: number
  x: number
}

export function resolveFoldVisualOffset(
  boundaries: readonly FoldVisualBoundary[],
  x: number
) {
  if (boundaries.length === 0) return undefined
  return boundaries.reduce((closest, boundary) =>
    Math.abs(boundary.x - x) < Math.abs(closest.x - x) ? boundary : closest
  ).offset
}

export type FoldVisualNavigationDirection = 'backward' | 'forward'

function orderedFoldVisualBoundaries(boundaries: readonly FoldVisualBoundary[]) {
  return boundaries
    .filter(boundary => Number.isFinite(boundary.x) && Number.isFinite(boundary.offset))
    .map((boundary, order) => ({ ...boundary, order }))
    .sort((left, right) => left.x - right.x || left.order - right.order)
    .filter((boundary, index, ordered) => {
      const previous = ordered[index - 1]
      return !previous || previous.x !== boundary.x || previous.offset !== boundary.offset
    })
}

/**
 * Move one visual caret stop through a composed folded line.
 *
 * A placeholder contributes two stops: the source offset before its hidden
 * body and the source offset after it. Moving between those stops therefore
 * treats the complete hidden source range as one keyboard-addressable unit,
 * while adjacent visible suffix text continues character by character.
 */
export function resolveFoldVisualKeyboardOffset(
  boundaries: readonly FoldVisualBoundary[],
  currentOffset: number,
  direction: FoldVisualNavigationDirection
) {
  const ordered = orderedFoldVisualBoundaries(boundaries)
  if (ordered.length === 0) return undefined

  const matches = ordered
    .map((boundary, index) => ({ boundary, index }))
    .filter(({ boundary }) => boundary.offset === currentOffset)
  if (matches.length > 0) {
    const currentIndex = direction === 'forward'
      ? matches[matches.length - 1].index
      : matches[0].index
    const step = direction === 'forward' ? 1 : -1
    for (
      let index = currentIndex + step;
      index >= 0 && index < ordered.length;
      index += step
    ) {
      if (ordered[index].offset !== currentOffset) return ordered[index].offset
    }
    return undefined
  }

  // Programmatic cursors may still point inside hidden source. Snap them to
  // the corresponding side of the placeholder instead of exposing a hidden
  // row or expanding the range.
  const candidates = ordered.filter(boundary => direction === 'forward'
    ? boundary.offset > currentOffset
    : boundary.offset < currentOffset)
  if (candidates.length === 0) return undefined
  return direction === 'forward'
    ? candidates.reduce((closest, boundary) =>
        boundary.offset < closest.offset ? boundary : closest).offset
    : candidates.reduce((closest, boundary) =>
        boundary.offset > closest.offset ? boundary : closest).offset
}

const closingBracket: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}'
}
const openingBracket = Object.fromEntries(
  Object.entries(closingBracket).map(([open, close]) => [close, open])
)

function findImportStatements(lines: string[]): ImportStatement[] {
  const statements: ImportStatement[] = []
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*import\b(?!\s*\()/.test(lines[index])) continue
    let endIndex = index
    for (; endIndex < lines.length; endIndex++) {
      const source = lines[endIndex]
      if (
        /\bfrom\b.*?['"`]/.test(source)
        || /^\s*import\s*['"`]/.test(source)
        || /^\s*import\s+\w+\s*=\s*require\s*\(/.test(source)
      ) break
    }
    if (endIndex >= lines.length) endIndex = index
    statements.push({ startLine: index + 1, endLine: endIndex + 1 })
    index = endIndex
  }
  return statements
}

function containsOnlyTrivia(lines: string[]) {
  let blockComment = false
  for (const source of lines) {
    let index = 0
    while (index < source.length) {
      if (blockComment) {
        const end = source.indexOf('*/', index)
        if (end === -1) break
        blockComment = false
        index = end + 2
        continue
      }
      while (/\s/.test(source[index] ?? '')) index++
      if (index >= source.length || source.startsWith('//', index)) break
      if (source.startsWith('/*', index)) {
        blockComment = true
        index += 2
        continue
      }
      return false
    }
  }
  return true
}

export function findFoldRanges(value: string) {
  const sourceLines = value.split('\n')
  const stack: Array<{ char: string; line: number }> = []
  const ranges: FoldRange[] = []
  let line = 1
  let quote: '"' | "'" | '`' | undefined
  let escaped = false
  let lineComment = false
  let blockComment = false
  let blockCommentStart: { line: number } | undefined

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
        if (blockCommentStart && blockCommentStart.line < line) {
          const lineStart = value.lastIndexOf('\n', index - 1) + 1
          ranges.push({
            startLine: blockCommentStart.line,
            endLine: line,
            open: '/*',
            close: '*/',
            closeColumn: index - lineStart,
            kind: 'block-comment'
          })
        }
        blockComment = false
        blockCommentStart = undefined
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
      blockCommentStart = { line }
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
        closeColumn: index - lineStart,
        kind: /^\s*import\b/.test(sourceLines[startLine - 1] ?? '') ? 'import' : 'block'
      })
    }
  }

  let commentStart = -1
  for (let index = 0; index <= sourceLines.length; index++) {
    const isLineComment = /^\s*\/\//.test(sourceLines[index] ?? '')
    if (isLineComment && commentStart === -1) commentStart = index
    if (isLineComment) continue
    if (commentStart !== -1 && index - commentStart > 1) {
      ranges.push({
        startLine: commentStart + 1,
        endLine: index,
        open: '//',
        close: '',
        closeColumn: 0,
        kind: 'line-comment'
      })
    }
    commentStart = -1
  }

  const importStatements = findImportStatements(sourceLines)
  let importGroup: ImportStatement[] = []
  const commitImportGroup = () => {
    if (importGroup.length < 2) {
      importGroup = []
      return
    }
    const first = importGroup[0]
    const last = importGroup[importGroup.length - 1]
    const firstImportRange = ranges.find(range => (
      range.kind === 'import'
      && range.startLine === first.startLine
      && range.endLine === first.endLine
    ))
    ranges.push({
      startLine: first.startLine,
      endLine: last.endLine,
      open: 'import',
      close: firstImportRange?.close ?? '',
      closeColumn: firstImportRange?.closeColumn ?? 0,
      kind: 'import-group',
      suffixLine: firstImportRange?.endLine,
      suffixColumn: firstImportRange?.closeColumn
    })
    importGroup = []
  }
  for (const statement of importStatements) {
    const previous = importGroup.at(-1)
    if (
      previous
      && !containsOnlyTrivia(sourceLines.slice(previous.endLine, statement.startLine - 1))
    ) commitImportGroup()
    importGroup.push(statement)
  }
  commitImportGroup()

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
    const scrollTrack = document.createElement('div')
    const scrollThumb = document.createElement('div')
    const horizontalScrollTrack = document.createElement('div')
    const horizontalScrollThumb = document.createElement('div')
    const collapsed = new Set<number>()
    let ranges: FoldRange[] = []
    let initialized = false
    let renderFrame: number | undefined
    let renderPending = true
    let visualMaxScrollTop = 0
    let visualMaxScrollLeft = 0
    let visualScrollLeft = 0
    let visualOwnsHorizontalScroll = false
    const collapseLabel = options.collapseLabel ?? 'Collapse block'
    const expandLabel = options.expandLabel ?? 'Expand block'

    target.classList.add('shikitor--code-folding')
    target.classList.add('shikitor--fold-rendering')
    selectionLayer.className = 'shikitor-fold-selection'
    scrollTrack.className = 'shikitor-fold-scrollbar shikitor-fold-scrollbar--vertical'
    scrollThumb.className = 'shikitor-fold-scrollbar__thumb'
    horizontalScrollTrack.className = 'shikitor-fold-scrollbar shikitor-fold-scrollbar--horizontal'
    horizontalScrollThumb.className = 'shikitor-fold-scrollbar__thumb'
    scrollTrack.hidden = true
    horizontalScrollTrack.hidden = true
    scrollTrack.append(scrollThumb)
    horizontalScrollTrack.append(horizontalScrollThumb)
    container.append(selectionLayer, scrollTrack, horizontalScrollTrack)

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

    function widgetHeightBeforeLine(line: number) {
      return [...target.querySelectorAll<HTMLElement>('.shikitor-line-widget')]
        .filter(widget => Number(widget.dataset.afterLine) < line)
        .reduce((height, widget) => height + widget.getBoundingClientRect().height, 0)
    }

    function sourceLineTop(line: number) {
      const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22
      return (visibleRow(line) - 1) * lineHeight + widgetHeightBeforeLine(line)
    }

    function syncHorizontalScroll(requestedScrollLeft?: number) {
      const viewportWidth = container.clientWidth
      // The textarea retains hidden source rows, so its scrollWidth can be
      // wider than the folded document. The rendered output is the visual
      // source of truth for horizontal geometry, just like visibleLines() is
      // for the vertical axis.
      const contentWidth = output.scrollWidth
      const nextVisualOwnsHorizontalScroll = shouldUseFoldVisualHorizontalScroll(
        collapsed.size > 0,
        contentWidth,
        input.scrollWidth
      )
      const nextScrollLeft = requestedScrollLeft ?? (visualOwnsHorizontalScroll
        ? visualScrollLeft
        : input.scrollLeft)
      const trackWidth = Math.max(0, viewportWidth - 14)
      const metrics = resolveFoldScrollMetrics(
        contentWidth,
        viewportWidth,
        nextScrollLeft,
        trackWidth
      )
      visualMaxScrollLeft = metrics.maxScrollTop
      visualScrollLeft = metrics.scrollTop
      visualOwnsHorizontalScroll = nextVisualOwnsHorizontalScroll

      // A folded visual line can be wider than every real source line because
      // it combines the opening-line prefix, placeholder and cloned suffix.
      // In that case textarea.scrollLeft cannot represent the visual offset:
      // browsers clamp it to the textarea's much smaller native scrollWidth.
      // Keep the rendered line authoritative and only mirror into the input
      // when the native source is at least as wide as the folded output.
      if (!visualOwnsHorizontalScroll && input.scrollLeft !== metrics.scrollTop) {
        input.scrollLeft = metrics.scrollTop
      }
      output.scrollLeft = metrics.scrollTop
      if (visualOwnsHorizontalScroll) {
        target.style.setProperty('--shikitor-visual-scroll-l', `${metrics.scrollTop}px`)
      } else {
        target.style.removeProperty('--shikitor-visual-scroll-l')
      }
      target.style.setProperty('--shikitor-scroll-l', `${metrics.scrollTop}px`)
      target.style.setProperty('--shikitor-offset-x', `-${metrics.scrollTop}px`)

      horizontalScrollTrack.hidden = metrics.maxScrollTop === 0
      horizontalScrollThumb.style.width = `${metrics.thumbHeight}px`
      horizontalScrollThumb.style.transform = `translateX(${metrics.thumbTop}px)`
    }

    function syncVisualScroll(requestedScrollTop = input.scrollTop) {
      syncHorizontalScroll()
      if (collapsed.size === 0) {
        visualMaxScrollTop = 0
        scrollTrack.hidden = true
        target.classList.remove('shikitor--fold-collapsed')
        return
      }

      target.classList.add('shikitor--fold-collapsed')
      const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22
      const viewportHeight = container.clientHeight
      const contentHeight = Math.max(
        visibleLines().length * lineHeight,
        output.scrollHeight
      )
      const trackHeight = Math.max(0, viewportHeight - 4)
      const metrics = resolveFoldScrollMetrics(
        contentHeight,
        viewportHeight,
        requestedScrollTop,
        trackHeight
      )
      visualMaxScrollTop = metrics.maxScrollTop

      // input.scrollTop remains the single scroll value consumed by the core
      // cursor and popup layers, but it is clamped to folded visual geometry.
      // The creator's normal scroll synchronizer will therefore read this same
      // value instead of the textarea's full-source scrollHeight.
      if (input.scrollTop !== metrics.scrollTop) input.scrollTop = metrics.scrollTop
      output.scrollTop = metrics.scrollTop
      gutters.style.marginTop = `-${metrics.scrollTop}px`
      target.style.setProperty('--shikitor-scroll-t', `${metrics.scrollTop}px`)
      target.style.setProperty('--shikitor-offset-y', `-${metrics.scrollTop}px`)

      scrollTrack.hidden = metrics.maxScrollTop === 0
      scrollThumb.style.height = `${metrics.thumbHeight}px`
      scrollThumb.style.transform = `translateY(${metrics.thumbTop}px)`
    }

    // Cursor geometry is normally based on the complete textarea value. Once
    // rows are folded, map that source geometry back onto the visible rows so
    // the caret remains beside the text the user can actually edit.
    const geometryLayer = installCursorGeometryLayer(
      shikitor,
      (getCursorAbsolutePosition, cursor, lineOffset) => {
        const hiddenRange = ranges.find(range =>
          collapsed.has(range.startLine)
          && cursor.line > range.startLine
          && cursor.line <= range.endLine
        )
        if (hiddenRange) {
          const outputLine = output.querySelector<HTMLElement>(
            `[data-line="${hiddenRange.startLine}"]`
          )
          if (outputLine) {
            const geometry = visualGeometry(outputLine)
            const exactBoundary = geometry.boundaries.find(boundary => boundary.offset === cursor.offset)
            const placeholder = geometry.placeholders.find(element => {
              const start = Number(element.dataset.foldSourceStart)
              const end = Number(element.dataset.foldSourceEnd)
              return cursor.offset >= start && cursor.offset <= end
            })
            const placeholderBoundary = placeholder && (() => {
              const start = Number(placeholder.dataset.foldSourceStart)
              const end = Number(placeholder.dataset.foldSourceEnd)
              const rect = placeholder.getBoundingClientRect()
              return cursor.offset - start <= end - cursor.offset ? rect.left : rect.right
            })()
            const x = exactBoundary?.x ?? placeholderBoundary
            if (x !== undefined) {
              const containerRect = container.getBoundingClientRect()
              const lineRect = outputLine.getBoundingClientRect()
              return {
                x: x - containerRect.left + visualScrollLeft,
                y: lineRect.bottom - containerRect.top + input.scrollTop + lineOffset * lineRect.height
              }
            }
          }
        }
        const visualCursor = hiddenRange
          ? shikitor.rawTextHelper.resolvePosition({
              line: hiddenRange.startLine,
              character: shikitor.rawTextHelper.line({
                line: hiddenRange.startLine,
                character: 0
              }).length
            })
          : cursor
        const position = getCursorAbsolutePosition(visualCursor, lineOffset)
        const hiddenLinesBeforeCursor = visualCursor.line - visibleRow(visualCursor.line)
        const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22
        return {
          x: position.x,
          y: position.y - hiddenLinesBeforeCursor * lineHeight
        }
      }
    )

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
      // The native textarea is visually transparent and the plugin owns the
      // folded selection surface. Emit a selectionchange so the core model
      // and this surface observe every pointer-drag step consistently.
      document.dispatchEvent(new Event('selectionchange'))
      renderSelection()
    }

    interface VisualTextSegment {
      end: number
      node: Text
      start: number
    }

    function textOffsetWithin(root: Element, targetNode: Text) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let offset = 0
      let node = walker.nextNode()
      while (node) {
        if (node === targetNode) return offset
        offset += node.textContent?.length ?? 0
        node = walker.nextNode()
      }
      return offset
    }

    function sourceSegmentForTextNode(node: Text, outputLine: HTMLElement): VisualTextSegment {
      const owner = node.parentElement?.closest<HTMLElement>('[data-fold-source-start]')
      if (owner) {
        const ownerStart = Number(owner.dataset.foldSourceStart)
        const start = ownerStart + textOffsetWithin(owner, node)
        return { node, start, end: start + (node.textContent?.length ?? 0) }
      }

      const line = Number(outputLine.dataset.line) || 1
      const lineStart = shikitor.rawTextHelper.lineStart({ line, character: 0 })
      // Shiki's whitespace transformer can give a separated space token and
      // the following syntax token the same source-position class. Walking
      // the rendered text itself preserves every visual character stop and
      // prevents keyboard navigation from skipping the adjacent token.
      const start = lineStart + textOffsetWithin(outputLine, node)
      return { node, start, end: start + (node.textContent?.length ?? 0) }
    }

    function textBoundaryX(node: Text, character: number) {
      const range = document.createRange()
      if (character === 0) {
        range.selectNodeContents(node)
        return range.getBoundingClientRect().left
      }
      range.setStart(node, 0)
      range.setEnd(node, character)
      return range.getBoundingClientRect().right
    }

    function visualGeometry(outputLine: HTMLElement) {
      const boundaries: FoldVisualBoundary[] = []
      const segments: VisualTextSegment[] = []
      const walker = document.createTreeWalker(outputLine, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode() as Text | null
      while (node) {
        if (!node.parentElement?.closest(
          '.shikitor-fold-placeholder, .shikitor-fold-line-content'
        )) {
          const segment = sourceSegmentForTextNode(node, outputLine)
          segments.push(segment)
          const length = node.textContent?.length ?? 0
          for (let character = 0; character <= length; character++) {
            boundaries.push({
              x: textBoundaryX(node, character),
              offset: segment.start + character
            })
          }
        }
        node = walker.nextNode() as Text | null
      }

      const placeholders = [...outputLine.querySelectorAll<HTMLElement>(
        '.shikitor-fold-placeholder[data-fold-source-start][data-fold-source-end]'
      )]
      for (const placeholder of placeholders) {
        const rect = placeholder.getBoundingClientRect()
        boundaries.push({ x: rect.left, offset: Number(placeholder.dataset.foldSourceStart) })
        boundaries.push({ x: rect.right, offset: Number(placeholder.dataset.foldSourceEnd) })
      }
      return { boundaries, placeholders, segments }
    }

    function pointerPosition(event: PointerEvent) {
      const lines = visibleLines()
      const rect = input.getBoundingClientRect()
      const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22
      const visualY = Math.max(0, event.clientY - rect.top + input.scrollTop)
      const line = lines.find(sourceLine => visualY < sourceLineTop(sourceLine) + lineHeight)
        ?? lines.at(-1)
        ?? 1
      const outputLine = output.querySelector<HTMLElement>(`[data-line="${line}"]`)
      if (outputLine?.querySelector('.shikitor-fold-placeholder')) {
        const offset = resolveFoldVisualOffset(visualGeometry(outputLine).boundaries, event.clientX)
        if (offset !== undefined) return shikitor.rawTextHelper.resolvePosition(offset)
      }
      const lineText = shikitor.rawTextHelper.line({ line, character: 0 })
      const x = Math.max(0, event.clientX - rect.left + visualScrollLeft)
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

    function appendSelectionRect(rect: DOMRect) {
      if (rect.width <= 0 || rect.height <= 0) return
      const containerRect = container.getBoundingClientRect()
      const marker = document.createElement('div')
      marker.className = 'shikitor-fold-selection__line shikitor-fold-selection__line--visual'
      marker.style.left = `${rect.left - containerRect.left}px`
      marker.style.top = `${rect.top - containerRect.top}px`
      marker.style.width = `${rect.width}px`
      marker.style.height = `${rect.height}px`
      selectionLayer.append(marker)
    }

    function renderVisualSelection(outputLine: HTMLElement, start: number, end: number) {
      const geometry = visualGeometry(outputLine)
      for (const segment of geometry.segments) {
        const segmentStart = Math.max(start, segment.start)
        const segmentEnd = Math.min(end, segment.end)
        if (segmentStart >= segmentEnd) continue
        const range = document.createRange()
        range.setStart(segment.node, segmentStart - segment.start)
        range.setEnd(segment.node, segmentEnd - segment.start)
        for (const rect of range.getClientRects()) appendSelectionRect(rect)
      }
      for (const placeholder of geometry.placeholders) {
        const placeholderStart = Number(placeholder.dataset.foldSourceStart)
        const placeholderEnd = Number(placeholder.dataset.foldSourceEnd)
        if (start < placeholderEnd && end > placeholderStart) {
          appendSelectionRect(placeholder.getBoundingClientRect())
        }
      }
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
        if (collapsed.has(line)) {
          const outputLine = output.querySelector<HTMLElement>(`[data-line="${line}"]`)
          if (outputLine) renderVisualSelection(outputLine, start, end)
          continue
        }
        const marker = document.createElement('div')
        marker.className = 'shikitor-fold-selection__line'
        marker.style.top = `${sourceLineTop(line) - input.scrollTop}px`
        const isFirst = line === startVisibleLine && !isLineHidden(startPosition.line)
        const isLast = line === endVisibleLine && !isLineHidden(endPosition.line)
        if (isFirst) marker.style.setProperty('--selection-start', `${startPosition.character}ch`)
        if (isLast) marker.style.setProperty('--selection-end', `${endPosition.character}ch`)
        selectionLayer.append(marker)
      }
    }

    function updateRanges() {
      const previousStarts = new Set(ranges.map(range => range.startLine))
      const configured = typeof options.ranges === 'function'
        ? options.ranges()
        : options.ranges
      const lineCount = shikitor.value.split('\n').length
      ranges = configured
        ? configured
            .filter(range => (
              Number.isInteger(range.startLine)
              && Number.isInteger(range.endLine)
              && range.startLine >= 1
              && (
                range.endLine > range.startLine
                || (range.endLine === range.startLine && range.presentation === 'line')
              )
              && range.endLine <= lineCount
            ))
            .map(range => ({
              startLine: range.startLine,
              endLine: range.endLine,
              open: '',
              close: '',
              closeColumn: 0,
              kind: 'custom' as const,
              label: range.label,
              presentation: range.presentation ?? 'inline'
            }))
        : findFoldRanges(shikitor.value)
      const validStarts = new Set(ranges.map(range => range.startLine))
      for (const line of collapsed) {
        if (!validStarts.has(line)) collapsed.delete(line)
      }
      if (!initialized && ranges.length > 0) {
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
      } else if (configured && options.defaultCollapsed) {
        for (const range of ranges) {
          if (!previousStarts.has(range.startLine)) collapsed.add(range.startLine)
        }
      }
    }

    function render() {
      renderFrame = undefined
      observer.disconnect()
      output.querySelectorAll<HTMLElement>('.shikitor-fold-line-content')
        .forEach(content => content.replaceWith(...content.childNodes))
      output.querySelectorAll<HTMLElement>(
        '.shikitor-fold-placeholder, .shikitor-fold-suffix'
      )
        .forEach(element => element.remove())
      gutters.querySelectorAll<HTMLElement>('.shikitor-fold-toggle')
        .forEach(element => element.remove())
      target.querySelectorAll<HTMLElement>('.shikitor-output-line, .shikitor-gutter-line')
        .forEach(element => {
          element.hidden = false
          if (element.dataset.foldPresentation === 'line') delete element.dataset.foldLine
          delete element.dataset.foldPresentation
        })

      for (const range of [...ranges].reverse()) {
        const gutter = gutters.querySelector<HTMLElement>(`[data-line="${range.startLine}"]`)
        const outputLine = output.querySelector<HTMLElement>(`[data-line="${range.startLine}"]`)
        if (!gutter || !outputLine) continue
        const isCollapsed = collapsed.has(range.startLine)
        const toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.className = 'shikitor-fold-toggle'
        toggle.dataset.foldLine = String(range.startLine)
        toggle.dataset.foldKind = range.kind
        toggle.title = isCollapsed ? expandLabel : collapseLabel
        toggle.setAttribute('aria-label', toggle.title)
        const icon = range.presentation === 'line'
          ? isCollapsed ? 'unfold_more' : 'unfold_less'
          : isCollapsed ? 'chevron_right' : 'expand_more'
        toggle.innerHTML = `<span class="shikitor-icon">${icon}</span>`
        gutter.prepend(toggle)

        if (!isCollapsed) continue
        for (let line = range.startLine + 1; line <= range.endLine; line++) {
          output.querySelector<HTMLElement>(`[data-line="${line}"]`)?.setAttribute('hidden', '')
          gutters.querySelector<HTMLElement>(`[data-line="${line}"]`)?.setAttribute('hidden', '')
        }
        const placeholder = document.createElement('button')
        placeholder.type = 'button'
        placeholder.className = 'shikitor-fold-placeholder'
        placeholder.dataset.foldLine = String(range.startLine)
        placeholder.dataset.foldKind = range.kind
        placeholder.title = expandLabel
        placeholder.setAttribute('aria-label', expandLabel)
        placeholder.textContent = range.label ?? '...'
        const suffixLine = range.suffixLine ?? range.endLine
        const suffixColumn = range.suffixColumn ?? range.closeColumn
        const linePresentation = range.presentation === 'line'
        const placeholderStart = linePresentation
          ? shikitor.rawTextHelper.lineStart({ line: range.startLine, character: 0 })
          : shikitor.rawTextHelper.lineEnd({ line: range.startLine, character: 0 })
        const suffixStart = shikitor.rawTextHelper.resolvePosition({
          line: suffixLine,
          character: suffixColumn
        }).offset
        placeholder.dataset.foldSourceStart = String(placeholderStart)
        placeholder.dataset.foldSourceEnd = String(
          linePresentation
            ? shikitor.rawTextHelper.lineEnd({ line: range.endLine, character: 0 })
            : range.kind === 'line-comment' || !range.close
            ? shikitor.rawTextHelper.lineEnd({ line: range.endLine, character: 0 })
            : suffixStart
        )
        if (linePresentation) {
          const content = document.createElement('span')
          content.className = 'shikitor-fold-line-content'
          content.append(...outputLine.childNodes)
          placeholder.classList.add('shikitor-fold-placeholder--line')
          outputLine.dataset.foldPresentation = 'line'
          gutter.dataset.foldPresentation = 'line'
          gutter.dataset.foldLine = String(range.startLine)
          outputLine.append(content, placeholder)
          continue
        }
        outputLine.append(placeholder)
        if (range.kind === 'line-comment' || !range.close) continue
        const closingLine = output.querySelector<HTMLElement>(`[data-line="${suffixLine}"]`)
        const suffixContent = closingLine && cloneLineSuffix(closingLine, suffixColumn)
        const suffix = document.createElement('span')
        suffix.className = 'shikitor-fold-suffix'
        suffix.dataset.foldSourceStart = String(suffixStart)
        suffix.dataset.foldSourceEnd = String(
          shikitor.rawTextHelper.lineEnd({ line: suffixLine, character: 0 })
        )
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
      syncVisualScroll()
      renderSelection()
      const cursorPosition = shikitor._getCursorAbsolutePosition(shikitor.cursor, -1)
      target.style.setProperty('--shikitor-cursor-t', `${cursorPosition.y}px`)
      target.style.setProperty('--shikitor-cursor-l', `${cursorPosition.x}px`)
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

    const hasLineStructureMutation = (records: MutationRecord[]) => records.some(record => (
      [...record.addedNodes, ...record.removedNodes].some(node => (
        node instanceof Element
        && (
          node.matches('.shikitor-output-line, .shikitor-gutter-line')
          || !!node.querySelector('.shikitor-output-line, .shikitor-gutter-line')
        )
      ))
    ))
    const observer = new MutationObserver(records => {
      if (hasLineStructureMutation(records)) scheduleRender()
    })
    const onClick = (event: Event) => {
      if (!(event.target instanceof Element)) return
      const control = event.target.closest<HTMLElement>('[data-fold-line]')
      if (!control || !target.contains(control)) return
      event.preventDefault()
      event.stopPropagation()
      toggleFold(Number(control.dataset.foldLine))
    }
    target.addEventListener('click', onClick)
    const onInputScroll = () => {
      if (!visualOwnsHorizontalScroll && input.scrollLeft !== visualScrollLeft) {
        syncHorizontalScroll(input.scrollLeft)
      }
      if (collapsed.size === 0) {
        syncHorizontalScroll()
        return
      }
      syncVisualScroll(input.scrollTop)
    }
    input.addEventListener('scroll', onInputScroll)
    const normalizeWheelDelta = (event: WheelEvent, delta: number) => {
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        return delta * (Number.parseFloat(getComputedStyle(input).lineHeight) || 22)
      }
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        return delta * container.clientHeight
      }
      return delta
    }
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      let handled = false
      const horizontalDelta = event.deltaX || (event.shiftKey ? event.deltaY : 0)
      if (horizontalDelta !== 0 && visualMaxScrollLeft > 0) {
        const nextScrollLeft = Math.min(
          visualMaxScrollLeft,
          Math.max(0, visualScrollLeft + normalizeWheelDelta(event, horizontalDelta))
        )
        if (nextScrollLeft !== visualScrollLeft) {
          syncHorizontalScroll(nextScrollLeft)
          handled = true
        }
      }
      if (collapsed.size > 0 && event.deltaY !== 0 && !event.shiftKey) {
        const nextScrollTop = Math.min(
          visualMaxScrollTop,
          Math.max(0, input.scrollTop + normalizeWheelDelta(event, event.deltaY))
        )
        if (nextScrollTop !== input.scrollTop) {
          input.scrollTop = nextScrollTop
          syncVisualScroll(nextScrollTop)
          handled = true
        }
      }
      if (handled) event.preventDefault()
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    let scrollbarPointerId: number | undefined
    const scrollFromPointer = (event: PointerEvent) => {
      const rect = scrollTrack.getBoundingClientRect()
      const thumbHeight = scrollThumb.getBoundingClientRect().height
      const travel = Math.max(0, rect.height - thumbHeight)
      const ratio = travel === 0
        ? 0
        : Math.min(1, Math.max(0, (event.clientY - rect.top - thumbHeight / 2) / travel))
      const nextScrollTop = ratio * visualMaxScrollTop
      input.scrollTop = nextScrollTop
      syncVisualScroll(nextScrollTop)
    }
    const onScrollbarPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || visualMaxScrollTop === 0) return
      event.preventDefault()
      event.stopPropagation()
      scrollbarPointerId = event.pointerId
      scrollTrack.setPointerCapture(event.pointerId)
      scrollFromPointer(event)
    }
    const onScrollbarPointerMove = (event: PointerEvent) => {
      if (scrollbarPointerId !== event.pointerId) return
      event.preventDefault()
      scrollFromPointer(event)
    }
    const onScrollbarPointerUp = (event: PointerEvent) => {
      if (scrollbarPointerId !== event.pointerId) return
      if (scrollTrack.hasPointerCapture(event.pointerId)) {
        scrollTrack.releasePointerCapture(event.pointerId)
      }
      scrollbarPointerId = undefined
    }
    scrollTrack.addEventListener('pointerdown', onScrollbarPointerDown)
    scrollTrack.addEventListener('pointermove', onScrollbarPointerMove)
    scrollTrack.addEventListener('pointerup', onScrollbarPointerUp)
    scrollTrack.addEventListener('pointercancel', onScrollbarPointerUp)
    let horizontalScrollbarPointerId: number | undefined
    const scrollHorizontalFromPointer = (event: PointerEvent) => {
      const rect = horizontalScrollTrack.getBoundingClientRect()
      const thumbWidth = horizontalScrollThumb.getBoundingClientRect().width
      const travel = Math.max(0, rect.width - thumbWidth)
      const ratio = travel === 0
        ? 0
        : Math.min(1, Math.max(0, (event.clientX - rect.left - thumbWidth / 2) / travel))
      const nextScrollLeft = ratio * visualMaxScrollLeft
      syncHorizontalScroll(nextScrollLeft)
    }
    const onHorizontalScrollbarPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || visualMaxScrollLeft === 0) return
      event.preventDefault()
      event.stopPropagation()
      horizontalScrollbarPointerId = event.pointerId
      horizontalScrollTrack.setPointerCapture(event.pointerId)
      scrollHorizontalFromPointer(event)
    }
    const onHorizontalScrollbarPointerMove = (event: PointerEvent) => {
      if (horizontalScrollbarPointerId !== event.pointerId) return
      event.preventDefault()
      scrollHorizontalFromPointer(event)
    }
    const onHorizontalScrollbarPointerUp = (event: PointerEvent) => {
      if (horizontalScrollbarPointerId !== event.pointerId) return
      if (horizontalScrollTrack.hasPointerCapture(event.pointerId)) {
        horizontalScrollTrack.releasePointerCapture(event.pointerId)
      }
      horizontalScrollbarPointerId = undefined
    }
    horizontalScrollTrack.addEventListener('pointerdown', onHorizontalScrollbarPointerDown)
    horizontalScrollTrack.addEventListener('pointermove', onHorizontalScrollbarPointerMove)
    horizontalScrollTrack.addEventListener('pointerup', onHorizontalScrollbarPointerUp)
    horizontalScrollTrack.addEventListener('pointercancel', onHorizontalScrollbarPointerUp)
    const resizeObserver = new ResizeObserver(() => syncVisualScroll())
    resizeObserver.observe(container)
    let pointerAnchor: number | undefined
    let mappedPointerOffset: number | undefined
    let mappedPointerSelection: { anchor: number; focus: number } | undefined
    let mappedPointerExpiresAt = 0
    let mappedKeyboardOffset: number | undefined
    let mappedKeyboardExpiresAt = 0
    let suppressNextCompatibilityMouseDown = false
    let nativeSelectionAnchor: number | undefined
    const onNativeSelectStart = (event: Event) => {
      if (collapsed.size === 0) return
      if (
        event.target instanceof Element
        && event.target.closest('[data-fold-line], .shikitor-fold-scrollbar, .shikitor-line-widget')
      ) return
      event.preventDefault()
    }
    const onNativeMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || collapsed.size === 0) return
      if (
        event.target instanceof Element
        && event.target.closest('[data-fold-line], .shikitor-fold-scrollbar, .shikitor-line-widget')
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
      const position = pointerPosition(event as PointerEvent)
      const currentStart = Math.min(input.selectionStart, input.selectionEnd)
      const currentEnd = Math.max(input.selectionStart, input.selectionEnd)
      const continueExistingSelection = (
        !event.shiftKey
        && currentStart !== currentEnd
        && position.offset >= currentStart
        && position.offset <= currentEnd
      )
      const previousAnchor = continueExistingSelection
        ? (position.offset - currentStart <= currentEnd - position.offset ? currentEnd : currentStart)
        : input.selectionDirection === 'backward'
          ? input.selectionEnd
          : input.selectionStart
      nativeSelectionAnchor = event.shiftKey || continueExistingSelection
        ? previousAnchor
        : position.offset
      mappedPointerOffset = position.offset
      mappedPointerSelection = { anchor: nativeSelectionAnchor, focus: position.offset }
      mappedPointerExpiresAt = performance.now() + 500
      input.dataset.foldPointerOffset = String(position.offset)
      applySelection(nativeSelectionAnchor, position.offset)
      input.focus({ preventScroll: true })
    }
    const onNativeMouseMove = (event: MouseEvent) => {
      if (nativeSelectionAnchor === undefined || event.buttons !== 1) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const focus = pointerPosition(event as PointerEvent).offset
      mappedPointerOffset = focus
      mappedPointerSelection = { anchor: nativeSelectionAnchor, focus }
      mappedPointerExpiresAt = performance.now() + 500
      applySelection(nativeSelectionAnchor, focus)
    }
    const onNativeMouseUp = (event: MouseEvent) => {
      if (nativeSelectionAnchor === undefined) return
      event.preventDefault()
      mappedPointerExpiresAt = performance.now() + 500
      nativeSelectionAnchor = undefined
    }
    container.addEventListener('selectstart', onNativeSelectStart, true)
    container.addEventListener('mousedown', onNativeMouseDown, true)
    document.addEventListener('mousemove', onNativeMouseMove, true)
    document.addEventListener('mouseup', onNativeMouseUp, true)
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || collapsed.size === 0) return
      if (
        event.target instanceof Element
        && event.target.closest('[data-fold-line], .shikitor-fold-scrollbar, .shikitor-line-widget')
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
      suppressNextCompatibilityMouseDown = true
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
      input.focus({ preventScroll: true })
      input.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (pointerAnchor === undefined) return
      event.preventDefault()
      const focus = pointerPosition(event).offset
      mappedPointerOffset = focus
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
    const onMouseDown = (event: MouseEvent) => {
      if (collapsed.size === 0) return
      if (
        event.target instanceof Element
        && event.target.closest('[data-fold-line], .shikitor-fold-scrollbar, .shikitor-line-widget')
      ) return
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
      if (suppressNextCompatibilityMouseDown) {
        suppressNextCompatibilityMouseDown = false
        return
      }
      const position = pointerPosition(event as PointerEvent)
      mappedPointerOffset = position.offset
      mappedPointerExpiresAt = performance.now() + 500
      input.dataset.foldPointerOffset = String(position.offset)
      const previousAnchor = input.selectionDirection === 'backward'
        ? input.selectionEnd
        : input.selectionStart
      pointerAnchor = event.shiftKey ? previousAnchor : position.offset
      mappedPointerSelection = { anchor: pointerAnchor, focus: position.offset }
      applySelection(pointerAnchor, position.offset)
      input.focus({ preventScroll: true })
      if (mappedPointerOffset !== undefined && performance.now() <= mappedPointerExpiresAt) {
        const selection = mappedPointerSelection ?? {
          anchor: mappedPointerOffset,
          focus: mappedPointerOffset
        }
        queueMicrotask(() => {
          applySelection(selection.anchor, selection.focus)
        })
      }
    }
    const onMouseMove = (event: MouseEvent) => {
      if (pointerAnchor === undefined) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const focus = pointerPosition(event as PointerEvent).offset
      mappedPointerOffset = focus
      mappedPointerSelection = { anchor: pointerAnchor, focus }
      mappedPointerExpiresAt = performance.now() + 500
      applySelection(pointerAnchor, focus)
    }
    const onMouseUp = (event: MouseEvent) => {
      if (pointerAnchor === undefined) return
      event.preventDefault()
      event.stopImmediatePropagation()
      mappedPointerExpiresAt = performance.now() + 500
      pointerAnchor = undefined
    }

    const visibleLineForOffset = (offset: number) => {
      const position = shikitor.rawTextHelper.resolvePosition(offset)
      return ranges.find(range =>
        collapsed.has(range.startLine)
        && position.line > range.startLine
        && position.line <= range.endLine
      )?.startLine ?? position.line
    }
    const visualBoundariesForLine = (line: number) => {
      const outputLine = output.querySelector<HTMLElement>(`[data-line="${line}"]`)
      if (!outputLine) return []
      return visualGeometry(outputLine).boundaries
    }
    const lineHasFoldedVisuals = (line: number) => !!output
      .querySelector<HTMLElement>(`[data-line="${line}"]`)
      ?.querySelector('.shikitor-fold-placeholder')
    const rememberKeyboardOffset = (offset: number) => {
      mappedKeyboardOffset = offset
      mappedKeyboardExpiresAt = performance.now() + 500
    }
    const selectionAnchorAndFocus = () => {
      if (input.selectionDirection === 'backward') {
        return { anchor: input.selectionEnd, focus: input.selectionStart }
      }
      return { anchor: input.selectionStart, focus: input.selectionEnd }
    }
    const applyKeyboardSelection = (anchor: number, focus: number) => {
      rememberKeyboardOffset(focus)
      applySelection(anchor, focus)
      queueMicrotask(() => {
        const cursor = shikitor.rawTextHelper.resolvePosition(focus)
        const position = shikitor._getCursorAbsolutePosition(cursor)
        const viewportStart = visualScrollLeft
        const viewportEnd = viewportStart + container.clientWidth - 24
        if (position.x < viewportStart) syncHorizontalScroll(Math.max(0, position.x - 12))
        else if (position.x > viewportEnd) {
          syncHorizontalScroll(position.x - container.clientWidth + 36)
        }
      })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (collapsed.size === 0) return
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      if (event.altKey || event.metaKey || event.ctrlKey) return
      const selection = selectionAnchorAndFocus()
      if (!event.shiftKey && input.selectionStart !== input.selectionEnd) {
        const focus = event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'Home'
          ? input.selectionStart
          : input.selectionEnd
        event.preventDefault()
        applyKeyboardSelection(focus, focus)
        return
      }

      const cursor = shikitor.rawTextHelper.resolvePosition(selection.focus)
      const lines = visibleLines()
      const currentLine = visibleLineForOffset(selection.focus)
      const visibleIndex = lines.indexOf(currentLine)
      if (visibleIndex === -1) return
      const currentIsFolded = lineHasFoldedVisuals(currentLine)
      const currentBoundaries = currentIsFolded ? visualBoundariesForLine(currentLine) : []
      let offset: number | undefined

      if (event.key === 'Home' || event.key === 'End') {
        const ordered = currentIsFolded
          ? orderedFoldVisualBoundaries(currentBoundaries)
          : []
        offset = event.key === 'Home'
          ? ordered[0]?.offset ?? shikitor.rawTextHelper.lineStart(selection.focus)
          : ordered.at(-1)?.offset ?? shikitor.rawTextHelper.lineEnd(selection.focus)
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const direction: FoldVisualNavigationDirection = event.key === 'ArrowLeft'
          ? 'backward'
          : 'forward'
        if (currentIsFolded) {
          offset = resolveFoldVisualKeyboardOffset(currentBoundaries, selection.focus, direction)
        }
        if (offset === undefined) {
          const atLineStart = selection.focus === shikitor.rawTextHelper.lineStart(selection.focus)
          const atLineEnd = selection.focus === shikitor.rawTextHelper.lineEnd(selection.focus)
          const crossesLine = direction === 'backward' ? atLineStart : atLineEnd
          if (!crossesLine && !currentIsFolded) {
            offset = selection.focus + (direction === 'backward' ? -1 : 1)
          }
          if (offset === undefined) {
            const targetLine = direction === 'backward'
              ? lines[visibleIndex - 1]
              : lines[visibleIndex + 1]
            if (!targetLine) return
            const targetBoundaries = lineHasFoldedVisuals(targetLine)
              ? orderedFoldVisualBoundaries(visualBoundariesForLine(targetLine))
              : []
            offset = direction === 'backward'
              ? targetBoundaries.at(-1)?.offset
                ?? shikitor.rawTextHelper.lineEnd({ line: targetLine, character: 0 })
              : targetBoundaries[0]?.offset
                ?? shikitor.rawTextHelper.lineStart({ line: targetLine, character: 0 })
          }
        }
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const targetLine = event.key === 'ArrowUp'
          ? lines[visibleIndex - 1]
          : lines[visibleIndex + 1]
        if (!targetLine) return
        const exactBoundary = currentBoundaries
          .filter(boundary => boundary.offset === selection.focus)
          .at(event.key === 'ArrowUp' ? 0 : -1)
        const currentX = exactBoundary?.x
          ?? shikitor._getCursorAbsolutePosition(cursor).x
            - visualScrollLeft
            + container.getBoundingClientRect().left
        const targetBoundaries = visualBoundariesForLine(targetLine)
        offset = resolveFoldVisualOffset(targetBoundaries, currentX)
        if (offset === undefined) {
          const lineLength = shikitor.rawTextHelper.line({ line: targetLine, character: 0 }).length
          offset = shikitor.rawTextHelper.resolvePosition({
            line: targetLine,
            character: Math.min(cursor.character, lineLength)
          }).offset
        }
      }

      if (offset === undefined) return
      event.preventDefault()
      applyKeyboardSelection(event.shiftKey ? selection.anchor : offset, offset)
    }
    target.addEventListener('pointerdown', onPointerDown, true)
    target.addEventListener('pointermove', onPointerMove, true)
    target.addEventListener('pointerup', onPointerUp, true)
    target.addEventListener('pointercancel', onPointerUp, true)
    target.addEventListener('mousedown', onMouseDown, true)
    target.addEventListener('mousemove', onMouseMove, true)
    target.addEventListener('mouseup', onMouseUp, true)
    const onClickMapped = (event: MouseEvent) => {
      if (
        event.target instanceof Element
        && event.target.closest('[data-fold-line], .shikitor-fold-scrollbar, .shikitor-line-widget')
      ) return
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
      const selection = mappedPointerSelection ?? { anchor: offset, focus: offset }
      delete input.dataset.foldPointerOffset
      // Keep the mapped pointer state alive while the deferred click selection
      // propagates through the editor's cursor subscribers. Clearing it first
      // made the cursor-change guard treat a valid suffix offset as an
      // arbitrary hidden-line caret and clamp it back to the opening line.
      mappedPointerOffset = selection.focus
      mappedPointerSelection = selection
      mappedPointerExpiresAt = performance.now() + 500
      setTimeout(() => applySelection(selection.anchor, selection.focus), 0)
    }
    target.addEventListener('click', onClickMapped, true)
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
      // Pointer mapping deliberately allows a collapsed visual suffix to
      // retain its real hidden-source offset. Do not immediately clamp that
      // mapped caret back to the opening line.
      if (
        mappedPointerOffset !== undefined
        && performance.now() <= mappedPointerExpiresAt
      ) return
      if (
        mappedKeyboardOffset === cursor.offset
        && performance.now() <= mappedKeyboardExpiresAt
      ) return
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

    const controller: CodeFoldingController = {
      refresh() {
        updateRanges()
        scheduleRender()
      },
      toggle: toggleFold
    }
    updateRanges()
    scheduleRender()
    options.onReady?.(controller)
    return () => {
      observer.disconnect()
      if (renderFrame !== undefined) cancelAnimationFrame(renderFrame)
      target.removeEventListener('click', onClick)
      input.removeEventListener('scroll', onInputScroll)
      container.removeEventListener('wheel', onWheel)
      scrollTrack.removeEventListener('pointerdown', onScrollbarPointerDown)
      scrollTrack.removeEventListener('pointermove', onScrollbarPointerMove)
      scrollTrack.removeEventListener('pointerup', onScrollbarPointerUp)
      scrollTrack.removeEventListener('pointercancel', onScrollbarPointerUp)
      horizontalScrollTrack.removeEventListener('pointerdown', onHorizontalScrollbarPointerDown)
      horizontalScrollTrack.removeEventListener('pointermove', onHorizontalScrollbarPointerMove)
      horizontalScrollTrack.removeEventListener('pointerup', onHorizontalScrollbarPointerUp)
      horizontalScrollTrack.removeEventListener('pointercancel', onHorizontalScrollbarPointerUp)
      resizeObserver.disconnect()
      container.removeEventListener('selectstart', onNativeSelectStart, true)
      container.removeEventListener('mousedown', onNativeMouseDown, true)
      document.removeEventListener('mousemove', onNativeMouseMove, true)
      document.removeEventListener('mouseup', onNativeMouseUp, true)
      target.removeEventListener('pointerdown', onPointerDown, true)
      target.removeEventListener('pointermove', onPointerMove, true)
      target.removeEventListener('pointerup', onPointerUp, true)
      target.removeEventListener('pointercancel', onPointerUp, true)
      target.removeEventListener('mousedown', onMouseDown, true)
      target.removeEventListener('mousemove', onMouseMove, true)
      target.removeEventListener('mouseup', onMouseUp, true)
      target.removeEventListener('click', onClickMapped, true)
      input.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('selectionchange', onSelectionChange)
      input.removeEventListener('select', onSelectionChange)
      input.removeEventListener('focus', onSelectionChange)
      input.removeEventListener('blur', onSelectionChange)
      geometryLayer.dispose()
      target.style.removeProperty('--shikitor-visual-scroll-l')
      target.classList.remove(
        'shikitor--code-folding',
        'shikitor--fold-rendering',
        'shikitor--fold-collapsed'
      )
      selectionLayer.remove()
      scrollTrack.remove()
      horizontalScrollTrack.remove()
      output.querySelectorAll<HTMLElement>('.shikitor-fold-line-content')
        .forEach(content => content.replaceWith(...content.childNodes))
      output.querySelectorAll<HTMLElement>(
        '.shikitor-fold-placeholder, .shikitor-fold-suffix'
      )
        .forEach(element => element.remove())
      gutters.querySelectorAll<HTMLElement>('.shikitor-fold-toggle')
        .forEach(element => element.remove())
      target.querySelectorAll<HTMLElement>('.shikitor-output-line, .shikitor-gutter-line')
        .forEach(element => {
          element.hidden = false
          if (element.dataset.foldPresentation === 'line') delete element.dataset.foldLine
          delete element.dataset.foldPresentation
        })
    }
  }
})
