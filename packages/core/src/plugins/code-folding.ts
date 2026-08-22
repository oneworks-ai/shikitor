import './code-folding.scss'

import { definePlugin, LINE_PATCH_EVENT, VIRTUAL_LINE_ATTRIBUTE } from '@shikitor/core'

import { insertGutterDecorationSlot } from './_internal/gutter-decoration-slot'
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

export interface FoldSourceInterval {
  end: number
  start: number
}

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

/**
 * Keep native word/document navigation out of source hidden by a folded
 * placeholder. The browser still owns platform-specific shortcut semantics;
 * only an endpoint strictly inside an atomic visual interval is corrected.
 */
export function normalizeFoldedKeyboardOffset(
  intervals: readonly FoldSourceInterval[],
  offset: number,
  direction: FoldVisualNavigationDirection
) {
  const containing = intervals
    .filter(interval => interval.start < offset && offset < interval.end)
    .sort((left, right) =>
      (right.end - right.start) - (left.end - left.start)
    )[0]
  if (!containing) return offset
  return direction === 'forward' ? containing.end : containing.start
}

export function resolveFoldKeyboardSelection(
  anchor: number,
  focus: number,
  extend: boolean
) {
  return {
    anchor: extend ? anchor : focus,
    focus
  }
}

export function isFoldSelectAllShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>
) {
  return !event.altKey
    && !event.shiftKey
    && (event.metaKey || event.ctrlKey)
    && event.key.toLowerCase() === 'a'
}

export type FoldLineSpan = Pick<CodeFoldingRange, 'startLine' | 'endLine'>

/**
 * Precomputed visibility of every source line for one `ranges` + `collapsed`
 * state. All arrays are 1-based (index 0 is unused) and sized `lineCount + 1`.
 */
export interface FoldHiddenIndex {
  lineCount: number
  /** `hidden[line] === 1` when the source line is folded away. */
  hidden: Uint8Array
  /** Prefix sums: the number of visible source lines within `1..line`. */
  visibleRowByLine: Int32Array
  /**
   * Index into the range list of the first collapsed range (in list order)
   * whose body hides the line, or `-1` when the line is visible.
   */
  ownerRangeIndex: Int32Array
  visibleLineCount: number
}

/**
 * Build the hidden-line index once per fold state instead of scanning every
 * range for every line query. Costs O(lineCount + total collapsed body size).
 */
export function buildFoldHiddenIndex(
  ranges: readonly FoldLineSpan[],
  collapsed: ReadonlySet<number>,
  lineCount: number
): FoldHiddenIndex {
  const size = Math.max(0, Math.trunc(lineCount)) + 1
  const hidden = new Uint8Array(size)
  const ownerRangeIndex = new Int32Array(size).fill(-1)
  // Walk backwards so the first matching range in list order wins, matching
  // `ranges.find(...)` semantics for nested or overlapping collapsed ranges.
  for (let index = ranges.length - 1; index >= 0; index--) {
    const range = ranges[index]
    if (!collapsed.has(range.startLine)) continue
    const start = Math.max(1, Math.floor(range.startLine) + 1)
    const end = Math.min(size - 1, Math.floor(range.endLine))
    for (let line = start; line <= end; line++) {
      hidden[line] = 1
      ownerRangeIndex[line] = index
    }
  }
  const visibleRowByLine = new Int32Array(size)
  let visibleLineCount = 0
  for (let line = 1; line < size; line++) {
    if (hidden[line] === 0) visibleLineCount++
    visibleRowByLine[line] = visibleLineCount
  }
  return { lineCount: size - 1, hidden, visibleRowByLine, ownerRangeIndex, visibleLineCount }
}

export function isFoldLineHidden(index: FoldHiddenIndex, line: number) {
  return index.hidden[line] === 1
}

/**
 * Visual row (1-based) of a source line once hidden lines are removed. Lines
 * after the indexed document continue counting as visible rows.
 */
export function resolveFoldVisibleRow(index: FoldHiddenIndex, line: number) {
  if (!(line > 0)) return 1
  const sourceLine = Math.floor(line)
  if (sourceLine <= index.lineCount) return Math.max(1, index.visibleRowByLine[sourceLine])
  return Math.max(1, index.visibleRowByLine[index.lineCount] + (sourceLine - index.lineCount))
}

export function resolveFoldVisibleLines(index: FoldHiddenIndex) {
  const lines: number[] = []
  for (let line = 1; line <= index.lineCount; line++) {
    if (index.hidden[line] === 0) lines.push(line)
  }
  return lines
}

export interface FoldWidgetHeightEntry {
  afterLine: number
  height: number
}

export interface FoldWidgetHeightIndex {
  /** Widget anchors sorted ascending. */
  afterLines: number[]
  /** `cumulativeHeights[i]` sums the heights of `afterLines[0..i-1]`. */
  cumulativeHeights: number[]
}

/**
 * Sort measured line widgets once so the widget height above any source line
 * can be answered with a binary search instead of re-reading layout.
 */
export function buildFoldWidgetHeightIndex(
  widgets: readonly FoldWidgetHeightEntry[]
): FoldWidgetHeightIndex {
  const entries = widgets
    .filter(widget => !Number.isNaN(widget.afterLine))
    .sort((left, right) => left.afterLine - right.afterLine)
  const afterLines = new Array<number>(entries.length)
  const cumulativeHeights = new Array<number>(entries.length + 1)
  cumulativeHeights[0] = 0
  for (let index = 0; index < entries.length; index++) {
    afterLines[index] = entries[index].afterLine
    cumulativeHeights[index + 1] = cumulativeHeights[index] + entries[index].height
  }
  return { afterLines, cumulativeHeights }
}

/** Total height of the widgets anchored strictly before `line`. */
export function resolveFoldWidgetHeightBefore(index: FoldWidgetHeightIndex, line: number) {
  let low = 0
  let high = index.afterLines.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (index.afterLines[middle] < line) low = middle + 1
    else high = middle
  }
  return index.cumulativeHeights[low]
}

/** Source offset of the first character of every line (`starts[0]` is line 1). */
export function buildFoldLineStarts(value: string) {
  const starts = [0]
  let index = value.indexOf('\n')
  while (index !== -1) {
    starts.push(index + 1)
    index = value.indexOf('\n', index + 1)
  }
  return starts
}

/**
 * Offset of the end of the line that starts at `start`, mirroring
 * `RawTextHelper.lineEnd` (a `\r` also terminates the line).
 */
export function resolveFoldLineEnd(value: string, start: number) {
  let offset = start
  while (offset < value.length && value[offset] !== '\n' && value[offset] !== '\r') offset++
  return offset
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
    const input = shikitor.inputElement
    const container = target.querySelector('.shikitor-container') as HTMLElement
    const cursorElement = target.querySelector('.shikitor-cursor:first-child') as HTMLElement
    const selectionLayer = document.createElement('div')
    const scrollTrack = document.createElement('div')
    const scrollThumb = document.createElement('div')
    const horizontalScrollTrack = document.createElement('div')
    const horizontalScrollThumb = document.createElement('div')
    const collapsed = new Set<number>()
    let ranges: FoldRange[] = []
    let initialized = false
    let renderFrame: number | undefined
    let postRenderScrollFrame: number | undefined
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

    // Line-count cache keyed by value identity: `shikitor.value` is a stable
    // string reference between edits, so the comparison is O(1) in practice.
    let countedValue: string | undefined
    let lineCount = 1
    function currentLineCount() {
      const value = shikitor.value
      if (value !== countedValue) {
        countedValue = value
        let count = 1
        let index = value.indexOf('\n')
        while (index !== -1) {
          count++
          index = value.indexOf('\n', index + 1)
        }
        lineCount = count
      }
      return lineCount
    }

    // Hidden-line index rebuilt lazily whenever `ranges`, `collapsed` or the
    // document value change, so per-line queries do not rescan every range.
    let hiddenIndexCache: FoldHiddenIndex | undefined
    let hiddenIndexValue: string | undefined
    let visibleLinesCache: number[] | undefined
    function invalidateHiddenIndex() {
      hiddenIndexCache = undefined
      visibleLinesCache = undefined
    }
    function hiddenIndex() {
      const value = shikitor.value
      if (hiddenIndexCache && hiddenIndexValue === value) return hiddenIndexCache
      hiddenIndexValue = value
      hiddenIndexCache = buildFoldHiddenIndex(ranges, collapsed, currentLineCount())
      visibleLinesCache = undefined
      return hiddenIndexCache
    }

    function isLineHidden(line: number) {
      return isFoldLineHidden(hiddenIndex(), line)
    }

    /** First collapsed range (in `ranges` order) whose body hides `line`. */
    function hiddenRangeForLine(line: number): FoldRange | undefined {
      const owner = hiddenIndex().ownerRangeIndex[line]
      return owner === undefined || owner < 0 ? undefined : ranges[owner]
    }

    function visibleRow(line: number) {
      return resolveFoldVisibleRow(hiddenIndex(), line)
    }

    function visibleLines() {
      const index = hiddenIndex()
      return visibleLinesCache ??= resolveFoldVisibleLines(index)
    }

    // Layout-derived geometry is cached for the current animation frame so a
    // render pass, a pointer gesture or a selection update measures the line
    // widgets and the computed line height once instead of per line.
    let frameCacheFrame: number | undefined
    let cachedLineHeight: number | undefined
    let cachedWidgetHeights: FoldWidgetHeightIndex | undefined
    function invalidateFrameCaches() {
      cachedLineHeight = undefined
      cachedWidgetHeights = undefined
      if (frameCacheFrame !== undefined) {
        cancelAnimationFrame(frameCacheFrame)
        frameCacheFrame = undefined
      }
    }
    function retainFrameCaches() {
      if (frameCacheFrame !== undefined) return
      frameCacheFrame = requestAnimationFrame(() => {
        frameCacheFrame = undefined
        cachedLineHeight = undefined
        cachedWidgetHeights = undefined
      })
    }
    function lineHeightPx() {
      if (cachedLineHeight === undefined) {
        cachedLineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22
        retainFrameCaches()
      }
      return cachedLineHeight
    }
    function widgetHeights() {
      if (cachedWidgetHeights === undefined) {
        const entries: FoldWidgetHeightEntry[] = []
        for (const widget of target.querySelectorAll<HTMLElement>('.shikitor-line-widget')) {
          entries.push({
            afterLine: Number(widget.dataset.afterLine),
            height: widget.getBoundingClientRect().height
          })
        }
        cachedWidgetHeights = buildFoldWidgetHeightIndex(entries)
        retainFrameCaches()
      }
      return cachedWidgetHeights
    }

    function widgetHeightBeforeLine(line: number) {
      return resolveFoldWidgetHeightBefore(widgetHeights(), line)
    }

    function sourceLineTop(line: number) {
      return (visibleRow(line) - 1) * lineHeightPx() + widgetHeightBeforeLine(line)
    }

    function syncHorizontalScroll(requestedScrollLeft?: number) {
      const viewportWidth = container.clientWidth
      // The textarea retains hidden source rows, so its scrollWidth can be
      // wider than the folded document. The rendered output is the visual
      // source of truth for horizontal geometry, just like visibleLines() is
      // for the vertical axis.
      const contentWidth = Math.max(
        output.scrollWidth,
        output.querySelector<HTMLElement>('.shikitor-output-lines')?.offsetWidth ?? 0
      )
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

    function syncVisualScroll(
      requestedScrollTop = input.scrollTop,
      requestedScrollLeft?: number
    ) {
      syncHorizontalScroll(requestedScrollLeft)
      if (collapsed.size === 0) {
        visualMaxScrollTop = 0
        scrollTrack.hidden = true
        target.classList.remove('shikitor--fold-collapsed')
        return
      }

      target.classList.add('shikitor--fold-collapsed')
      const lineHeight = lineHeightPx()
      const viewportHeight = container.clientHeight
      // The projection may be scrolled through a transform (line widgets make
      // the output overflow visible), which shrinks scrollHeight; the layout
      // height of the line container is transform-independent.
      const projectedHeight = output.querySelector<HTMLElement>('.shikitor-output-lines')?.offsetHeight ?? 0
      const contentHeight = Math.max(
        hiddenIndex().visibleLineCount * lineHeight,
        output.scrollHeight,
        projectedHeight
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
        const hiddenRange = hiddenRangeForLine(cursor.line)
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
                // DOM ranges are measured in the output's current viewport.
                // Use the scroll value that actually produced that rect, not
                // the desired visual offset, because an async decoration
                // render can briefly reset output.scrollLeft before the fold
                // projection restores it on the next frame.
                x: x - containerRect.left + output.scrollLeft,
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
        const lineHeight = lineHeightPx()
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
      const lineHeight = lineHeightPx()
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
      if (selectionLayer.firstChild) selectionLayer.replaceChildren()
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
      const lineCount = currentLineCount()
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
      invalidateHiddenIndex()
    }

    function render() {
      renderFrame = undefined
      if (postRenderScrollFrame !== undefined) {
        cancelAnimationFrame(postRenderScrollFrame)
        postRenderScrollFrame = undefined
      }
      const preservedScrollLeft = visualScrollLeft
      // Geometry measured before this pass describes the previous DOM; it is
      // re-measured lazily after the writes below.
      invalidateFrameCaches()
      // The caret geometry does not depend on the fold DOM written below (it
      // uses the hidden-line index, cached widget heights and a detached
      // measuring span), so it is read before the writes to avoid forcing a
      // second style and layout flush at the end of the pass.
      const cursorPosition = shikitor._getCursorAbsolutePosition(shikitor.cursor, -1)
      observer.disconnect()
      // Existing fold DOM is indexed by its line instead of being torn down up
      // front: a placeholder row that is unchanged since the previous pass is
      // kept, so a keystroke elsewhere does not re-insert every collapsed
      // region and invalidate the style of every token it wraps.
      interface FoldDecor { content?: HTMLElement; placeholder?: HTMLElement; suffix?: HTMLElement }
      const existingDecor = new Map<HTMLElement, FoldDecor>()
      for (const element of output.querySelectorAll<HTMLElement>(
        '.shikitor-fold-line-content, .shikitor-fold-placeholder, .shikitor-fold-suffix'
      )) {
        const line = element.parentElement
        if (!(line instanceof HTMLElement)) continue
        const decor = existingDecor.get(line) ?? {}
        if (element.classList.contains('shikitor-fold-line-content')) decor.content = element
        else if (element.classList.contains('shikitor-fold-placeholder')) decor.placeholder = element
        else decor.suffix = element
        existingDecor.set(line, decor)
      }
      const removeDecor = (decor: FoldDecor) => {
        decor.content?.replaceWith(...decor.content.childNodes)
        decor.placeholder?.remove()
        decor.suffix?.remove()
      }
      const placeholderMatches = (
        placeholder: HTMLElement,
        expected: { className: string; foldKind: string; foldLine: string; label: string; sourceEnd: string; sourceStart: string; title: string }
      ) => placeholder.className === expected.className
        && placeholder.dataset.foldLine === expected.foldLine
        && placeholder.dataset.foldKind === expected.foldKind
        && placeholder.dataset.foldSourceStart === expected.sourceStart
        && placeholder.dataset.foldSourceEnd === expected.sourceEnd
        && placeholder.title === expected.title
        && placeholder.textContent === expected.label

      // Reset sweep: one pass over every line element resets fold state,
      // indexes the first output/gutter element per line number (replacing
      // the per-line `[data-line="N"]` queries of this pass) and prepares the
      // gutter toggle slots. Lines that are still hidden are remembered
      // instead of being un-hidden immediately so a line that stays folded
      // costs no attribute writes at all.
      const previouslyHidden = new Set<HTMLElement>()
      const outputLines = new Map<number, HTMLElement>()
      const gutterLines = new Map<number, HTMLElement>()
      // A toggle slot that is still the immediate left neighbour of its line
      // number is exactly where a fresh insertion would land, so reuse it and
      // only drop its previous toggle. Any other stale slot is removed.
      const staleSlots = gutters.querySelectorAll<HTMLElement>('.shikitor-fold-toggle-slot')
      const reusedSlots = new Set<Element>()
      const slotByGutter = new Map<Element, HTMLElement>()
      // Fold presentation attributes are removed only from elements that do
      // not receive them again below, so unchanged lines see no writes.
      const stalePresentation = new Set<HTMLElement>()
      for (const element of target.querySelectorAll<HTMLElement>(
        '.shikitor-output-line, .shikitor-gutter-line'
      )) {
        if (element.hidden) previouslyHidden.add(element)
        if (element.hasAttribute('data-fold-presentation')) stalePresentation.add(element)
        const isGutterLine = element.classList.contains('shikitor-gutter-line')
        const raw = element.getAttribute('data-line')
        if (raw !== null) {
          const line = Number(raw)
          // Only canonical numbers can match a `[data-line="${line}"]` query.
          if (String(line) === raw) {
            if (isGutterLine) {
              if (!gutterLines.has(line) && gutters.contains(element)) gutterLines.set(line, element)
            } else if (!outputLines.has(line) && output.contains(element)) {
              outputLines.set(line, element)
            }
          }
        }
        if (!isGutterLine || !gutters.contains(element)) continue
        const number = element.querySelector<HTMLElement>('.shikitor-gutter-line-number')
        if (!number) continue
        const previous = number.previousElementSibling
        let slot: HTMLElement
        if (
          previous instanceof HTMLElement
          && previous.classList.contains('shikitor-fold-toggle-slot')
        ) {
          slot = previous
          reusedSlots.add(slot)
          if (slot.firstChild) slot.replaceChildren()
        } else {
          slot = insertGutterDecorationSlot(number, 'left')
          slot.classList.add('shikitor-fold-toggle-slot')
        }
        slotByGutter.set(element, slot)
      }
      for (const slot of staleSlots) {
        if (!reusedSlots.has(slot)) slot.remove()
      }

      // Source offsets for placeholders, resolved from one line-start table
      // instead of splitting the whole document per lookup.
      const value = shikitor.value
      let lineStarts: number[] | undefined
      const lineStartOffset = (line: number) => {
        const start = (lineStarts ??= buildFoldLineStarts(value))[line - 1]
        return start ?? shikitor.rawTextHelper.lineStart({ line, character: 0 })
      }
      const lineEndOffset = (line: number) => {
        const start = (lineStarts ??= buildFoldLineStarts(value))[line - 1]
        return start === undefined
          ? shikitor.rawTextHelper.lineEnd({ line, character: 0 })
          : resolveFoldLineEnd(value, start)
      }
      const sourceOffset = (line: number, character: number) => {
        const start = (lineStarts ??= buildFoldLineStarts(value))[line - 1]
        return start === undefined
          ? shikitor.rawTextHelper.resolvePosition({ line, character }).offset
          : start + character
      }

      for (const range of [...ranges].reverse()) {
        const gutter = gutterLines.get(range.startLine)
        const outputLine = outputLines.get(range.startLine)
        const toggleSlot = gutter && (
          slotByGutter.get(gutter) ?? gutter.querySelector<HTMLElement>('.shikitor-fold-toggle-slot')
        )
        if (!gutter || !outputLine || !toggleSlot) continue
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
        toggleSlot.append(toggle)

        if (!isCollapsed) continue
        for (let line = range.startLine + 1; line <= range.endLine; line++) {
          const hiddenOutputLine = outputLines.get(line)
          if (hiddenOutputLine && !previouslyHidden.delete(hiddenOutputLine)) {
            hiddenOutputLine.setAttribute('hidden', '')
          }
          const hiddenGutterLine = gutterLines.get(line)
          if (hiddenGutterLine && !previouslyHidden.delete(hiddenGutterLine)) {
            hiddenGutterLine.setAttribute('hidden', '')
          }
        }
        const suffixLine = range.suffixLine ?? range.endLine
        const suffixColumn = range.suffixColumn ?? range.closeColumn
        const linePresentation = range.presentation === 'line'
        const placeholderStart = linePresentation
          ? lineStartOffset(range.startLine)
          : lineEndOffset(range.startLine)
        const suffixStart = sourceOffset(suffixLine, suffixColumn)
        const expected = {
          className: linePresentation
            ? 'shikitor-fold-placeholder shikitor-fold-placeholder--line'
            : 'shikitor-fold-placeholder',
          foldKind: range.kind,
          foldLine: String(range.startLine),
          label: range.label ?? '...',
          sourceEnd: String(
            linePresentation
              ? lineEndOffset(range.endLine)
              : range.kind === 'line-comment' || !range.close
              ? lineEndOffset(range.endLine)
              : suffixStart
          ),
          sourceStart: String(placeholderStart),
          title: expandLabel
        }
        const decor = existingDecor.get(outputLine)
        if (linePresentation) {
          if (outputLine.dataset.foldPresentation !== 'line') outputLine.dataset.foldPresentation = 'line'
          if (gutter.dataset.foldPresentation !== 'line') gutter.dataset.foldPresentation = 'line'
          if (gutter.dataset.foldLine !== expected.foldLine) gutter.dataset.foldLine = expected.foldLine
          stalePresentation.delete(outputLine)
          stalePresentation.delete(gutter)
          if (
            decor?.content && decor.placeholder && !decor.suffix
            && outputLine.childNodes.length === 2
            && outputLine.firstChild === decor.content
            && outputLine.lastChild === decor.placeholder
            && placeholderMatches(decor.placeholder, expected)
          ) {
            existingDecor.delete(outputLine)
            continue
          }
        }
        if (decor) {
          removeDecor(decor)
          existingDecor.delete(outputLine)
        }
        const placeholder = document.createElement('button')
        placeholder.type = 'button'
        placeholder.className = expected.className
        placeholder.dataset.foldLine = expected.foldLine
        placeholder.dataset.foldKind = expected.foldKind
        placeholder.title = expected.title
        placeholder.setAttribute('aria-label', expected.title)
        placeholder.textContent = expected.label
        placeholder.dataset.foldSourceStart = expected.sourceStart
        placeholder.dataset.foldSourceEnd = expected.sourceEnd
        if (linePresentation) {
          const content = document.createElement('span')
          content.className = 'shikitor-fold-line-content'
          content.append(...outputLine.childNodes)
          outputLine.append(content, placeholder)
          continue
        }
        outputLine.append(placeholder)
        if (range.kind === 'line-comment' || !range.close) continue
        const closingLine = outputLines.get(suffixLine)
        const suffixContent = closingLine && !closingLine.hasAttribute(VIRTUAL_LINE_ATTRIBUTE)
          ? cloneLineSuffix(closingLine, suffixColumn)
          : undefined
        const suffix = document.createElement('span')
        suffix.className = 'shikitor-fold-suffix'
        suffix.dataset.foldSourceStart = String(suffixStart)
        suffix.dataset.foldSourceEnd = String(lineEndOffset(suffixLine))
        if (suffixContent) {
          suffix.append(suffixContent)
        } else {
          suffix.textContent = range.close
        }
        outputLine.append(suffix)
      }
      // Fold DOM of lines that are no longer collapsed, and presentation
      // attributes that were not claimed by a collapsed range.
      for (const decor of existingDecor.values()) removeDecor(decor)
      for (const element of stalePresentation) {
        if (element.getAttribute('data-fold-presentation') === 'line') {
          element.removeAttribute('data-fold-line')
        }
        element.removeAttribute('data-fold-presentation')
      }
      // Lines that were hidden by the previous pass but are visible now.
      for (const element of previouslyHidden) element.hidden = false
      observer.observe(output, { childList: true, subtree: true })
      observer.observe(gutters, { childList: true, subtree: true })
      renderPending = false
      target.classList.remove('shikitor--fold-rendering')
      // Replacing fold placeholders changes the output's intrinsic width.
      // Browsers can expose the temporary viewport width until the next
      // layout frame; clamping against that transient measurement resets a
      // valid horizontal scroll to zero during pointer selection. Preserve
      // the visual owner's offset and reconcile it once layout has settled.
      postRenderScrollFrame = requestAnimationFrame(() => {
        postRenderScrollFrame = undefined
        syncVisualScroll(input.scrollTop, preservedScrollLeft)
      })
      renderSelection()
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
      invalidateHiddenIndex()
      scheduleRender()
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
    // A line whose children were re-rendered in place (same source, new
    // tokens) lost any placeholder, suffix or content wrapper it carried, and
    // a collapsed range's suffix clone may describe it; re-render in that case.
    const onLinePatch = (event: Event) => {
      const element = event.target
      if (!(element instanceof HTMLElement)) return
      const line = Number(element.dataset.line)
      if (!Number.isInteger(line)) return
      const affected = ranges.some(range => (
        range.startLine === line
        || (collapsed.has(range.startLine) && (range.suffixLine ?? range.endLine) === line)
      ))
      if (affected) scheduleRender()
    }
    output.addEventListener(LINE_PATCH_EVENT, onLinePatch)
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
        return delta * lineHeightPx()
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
    const resizeObserver = new ResizeObserver(() => {
      if (renderPending || postRenderScrollFrame !== undefined) return
      syncVisualScroll()
    })
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
      return hiddenRangeForLine(position.line)?.startLine ?? position.line
    }
    const visualBoundariesForLine = (line: number) => {
      const outputLine = output.querySelector<HTMLElement>(`[data-line="${line}"]`)
      if (!outputLine) return []
      return visualGeometry(outputLine).boundaries
    }
    const lineHasFoldedVisuals = (line: number) => !!output
      .querySelector<HTMLElement>(`[data-line="${line}"]`)
      ?.querySelector('.shikitor-fold-placeholder')
    const visibleFoldSourceIntervals = () => [...output.querySelectorAll<HTMLElement>(
      '.shikitor-fold-placeholder[data-fold-source-start][data-fold-source-end]'
    )].flatMap(placeholder => {
      const line = placeholder.closest<HTMLElement>('.shikitor-output-line')
      const start = Number(placeholder.dataset.foldSourceStart)
      const end = Number(placeholder.dataset.foldSourceEnd)
      return line?.hidden || !Number.isFinite(start) || !Number.isFinite(end) || end <= start
        ? []
        : [{ start, end }]
    })
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
    let keyboardVisibilityFrame: number | undefined
    let keyboardNormalizationFrame: number | undefined
    let keyboardRevealTimer: ReturnType<typeof setTimeout> | undefined
    const ensureKeyboardFocusVisible = () => {
      keyboardVisibilityFrame = undefined
      if (document.activeElement !== input) return
      cursorElement.classList.add('shikitor-cursor--keyboard-reveal')
      if (keyboardRevealTimer !== undefined) clearTimeout(keyboardRevealTimer)
      keyboardRevealTimer = setTimeout(() => {
        keyboardRevealTimer = undefined
        cursorElement.classList.remove('shikitor-cursor--keyboard-reveal')
      }, 500)
      const cursorRect = cursorElement.getBoundingClientRect()
      const viewportRect = container.getBoundingClientRect()
      const safeViewportRight = viewportRect.right - 24

      if (cursorRect.left < viewportRect.left) {
        const overflow = viewportRect.left - cursorRect.left
        syncHorizontalScroll(Math.max(0, visualScrollLeft - overflow - 12))
      } else if (cursorRect.right > safeViewportRight) {
        const overflow = cursorRect.right - safeViewportRight
        syncHorizontalScroll(visualScrollLeft + overflow + 10)
      }
      if (cursorRect.top < viewportRect.top) {
        syncVisualScroll(Math.max(0, input.scrollTop - (viewportRect.top - cursorRect.top)))
      } else if (cursorRect.bottom > viewportRect.bottom) {
        syncVisualScroll(input.scrollTop + cursorRect.bottom - viewportRect.bottom)
      }
    }
    const scheduleKeyboardFocusVisibility = () => {
      if (keyboardVisibilityFrame !== undefined) {
        cancelAnimationFrame(keyboardVisibilityFrame)
      }
      // The native textarea selection settles before the custom caret layer.
      // Wait one extra paint so modifier navigation (Meta/Alt/Ctrl) reveals
      // the caret drawn for the final selection instead of its previous rect.
      keyboardVisibilityFrame = requestAnimationFrame(() => {
        keyboardVisibilityFrame = requestAnimationFrame(ensureKeyboardFocusVisible)
      })
    }
    const applyKeyboardSelection = (anchor: number, focus: number) => {
      rememberKeyboardOffset(focus)
      applySelection(anchor, focus)
      scheduleKeyboardFocusVisibility()
    }
    const onSelectAllKeyDown = (event: KeyboardEvent) => {
      if (collapsed.size === 0 || !isFoldSelectAllShortcut(event)) return
      // Do not depend on the host/browser's native select-all command. A
      // folded editor owns its visual selection layer, and some hosts consume
      // Command/Ctrl+A before the textarea's native `select` event settles.
      // Committing the complete raw range here keeps the textarea, editor
      // model and folded projection in the same deterministic state.
      event.preventDefault()
      rememberKeyboardOffset(shikitor.value.length)
      applySelection(0, shikitor.value.length)
    }
    let pendingModifierNavigation: {
      direction: FoldVisualNavigationDirection
      extend: boolean
      originFocus: number
    } | undefined
    const normalizeModifierNavigation = () => {
      keyboardNormalizationFrame = undefined
      const pending = pendingModifierNavigation
      pendingModifierNavigation = undefined
      if (!pending || document.activeElement !== input) return
      const selection = selectionAnchorAndFocus()
      const intervals = visibleFoldSourceIntervals()
      let focus = normalizeFoldedKeyboardOffset(
        intervals,
        selection.focus,
        pending.direction
      )
      // Some native word shortcuts stop at the raw newline that also marks a
      // placeholder edge. A repeated shortcut must cross the atomic visual
      // unit instead of remaining stuck on the same invisible source stop.
      if (focus === pending.originFocus && focus === selection.focus) {
        const edge = intervals.find(interval => pending.direction === 'forward'
          ? interval.start === focus
          : interval.end === focus)
        if (edge) focus = pending.direction === 'forward' ? edge.end : edge.start
      }
      if (focus === selection.focus) return
      const next = resolveFoldKeyboardSelection(selection.anchor, focus, pending.extend)
      applyKeyboardSelection(next.anchor, next.focus)
    }
    const scheduleModifierNavigationNormalization = (
      direction: FoldVisualNavigationDirection,
      originFocus: number,
      extend: boolean
    ) => {
      if (keyboardNormalizationFrame !== undefined) {
        cancelAnimationFrame(keyboardNormalizationFrame)
        normalizeModifierNavigation()
      }
      pendingModifierNavigation = { direction, extend, originFocus }
      keyboardNormalizationFrame = requestAnimationFrame(normalizeModifierNavigation)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (collapsed.size === 0) return
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      const selection = selectionAnchorAndFocus()
      const modifierDirection: FoldVisualNavigationDirection = [
        'ArrowLeft',
        'ArrowUp',
        'Home'
      ].includes(event.key) ? 'backward' : 'forward'
      if (event.altKey || event.metaKey || event.ctrlKey) {
        const currentLine = visibleLineForOffset(selection.focus)
        const currentBoundaries = lineHasFoldedVisuals(currentLine)
          ? visualBoundariesForLine(currentLine)
          : []
        // Command+Left/Right means visual line start/end on macOS. Let the
        // folded projection define that line so the command cannot stop at a
        // raw newline hidden behind the placeholder.
        if (
          event.metaKey
          && !event.altKey
          && !event.ctrlKey
          && !(!event.shiftKey && input.selectionStart !== input.selectionEnd)
          && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
          && currentBoundaries.length > 0
        ) {
          const ordered = orderedFoldVisualBoundaries(currentBoundaries)
          const offset = event.key === 'ArrowLeft'
            ? ordered[0]?.offset
            : ordered.at(-1)?.offset
          if (offset !== undefined) {
            event.preventDefault()
            applyKeyboardSelection(event.shiftKey ? selection.anchor : offset, offset)
            return
          }
        }
        scheduleModifierNavigationNormalization(
          modifierDirection,
          selection.focus,
          event.shiftKey
        )
        return
      }
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
    input.addEventListener('keydown', scheduleKeyboardFocusVisibility, true)
    input.addEventListener('keydown', onSelectAllKeyDown, true)
    input.addEventListener('keyup', scheduleKeyboardFocusVisibility, true)
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
      const hiddenRange = hiddenRangeForLine(cursor.line)
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
      output.removeEventListener(LINE_PATCH_EVENT, onLinePatch)
      observer.disconnect()
      if (renderFrame !== undefined) cancelAnimationFrame(renderFrame)
      if (postRenderScrollFrame !== undefined) cancelAnimationFrame(postRenderScrollFrame)
      invalidateFrameCaches()
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
      input.removeEventListener('keydown', scheduleKeyboardFocusVisibility, true)
      input.removeEventListener('keydown', onSelectAllKeyDown, true)
      input.removeEventListener('keyup', scheduleKeyboardFocusVisibility, true)
      input.removeEventListener('keydown', onKeyDown)
      if (keyboardVisibilityFrame !== undefined) {
        cancelAnimationFrame(keyboardVisibilityFrame)
      }
      if (keyboardNormalizationFrame !== undefined) {
        cancelAnimationFrame(keyboardNormalizationFrame)
      }
      pendingModifierNavigation = undefined
      if (keyboardRevealTimer !== undefined) clearTimeout(keyboardRevealTimer)
      cursorElement.classList.remove('shikitor-cursor--keyboard-reveal')
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
      gutters.querySelectorAll<HTMLElement>('.shikitor-fold-toggle-slot')
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
