import { definePlugin } from '@shikitor/core'

import { createSuggestionIcon, type SuggestionIconName } from './suggestionIcons.ts'
import { presentFileIcon } from './fileIcons.ts'
import type { ShikitorService } from './registry.ts'
import { parseSessionLinks, type SessionLinkReference } from './sessionLinks.ts'

const tokenIconClass = 'dsh-shikitor-token-icon'
const fileReferenceClass = 'dsh-shikitor-file-reference'
const sessionReferenceClass = 'dsh-shikitor-session-reference'
const sourceAttribute = 'data-dsh-shikitor-source-start'
const tokenPattern = /(^|\s)([#$/@])([^\s]*)/gu
const fileLinkPattern = /\[((?:\\.|[^\]\\])*)\]\(<([^>\n]+)> "((?:\\.|[^"\\])*)"\)/gu

interface InlineRange {
  readonly end: number
  readonly start: number
}

interface FileReference extends InlineRange {
  readonly destination: string
  readonly kind: 'file'
  readonly label: string
}

interface SessionReference extends SessionLinkReference {
  readonly kind: 'session'
}

type InlineReference = FileReference | SessionReference

interface TokenMatch {
  readonly offset: number
  readonly kind: SuggestionIconName
}

interface VisualBoundary {
  readonly bottom: number
  readonly offset: number
  readonly top: number
  readonly x: number
}

function iconKind(trigger: string, body: string): SuggestionIconName {
  if (trigger === '#') return 'chat'
  if (trigger === '$') return 'skill'
  if (trigger === '/') return 'command'
  if (/^plugin:/iu.test(body)) return 'plugin'
  if (/^(?:agent|subagent):/iu.test(body)) return 'subagent'
  if (/^file:/iu.test(body) || body.includes('/')) return 'file'
  return 'mention'
}

function tokenMatches(value: string): TokenMatch[] {
  return Array.from(value.matchAll(tokenPattern), match => {
    const prefix = match[1] ?? ''
    return {
      offset: (match.index ?? 0) + prefix.length,
      kind: iconKind(match[2] ?? '', match[3] ?? ''),
    }
  })
}

function unescapeMarkdown(value: string): string {
  return value.replace(/\\([\\\[\]"])/gu, '$1')
}

function isAbsoluteFilePath(value: string): boolean {
  return value.startsWith('/') || /^[a-z]:\//iu.test(value) || value.startsWith('\\\\')
}

/** Parse only the titled absolute-path links emitted by the DSH file catalog. */
export function fileReferences(value: string): FileReference[] {
  return Array.from(value.matchAll(fileLinkPattern)).flatMap(match => {
    const label = unescapeMarkdown(match[1] ?? '')
    const destination = match[2] ?? ''
    const title = unescapeMarkdown(match[3] ?? '')
    const start = match.index ?? 0
    if (label === '' || title !== label || !isAbsoluteFilePath(destination)) return []
    return [{ start, end: start + match[0].length, kind: 'file', label, destination }]
  })
}

function inlineReferences(value: string): InlineReference[] {
  const sessions: SessionReference[] = parseSessionLinks(value)
    .map(reference => ({ ...reference, kind: 'session' }))
  return [...fileReferences(value), ...sessions]
    .sort((left, right) => left.start - right.start)
}

function containsOffset(range: InlineRange, offset: number): boolean {
  return offset > range.start && offset < range.end
}

function setSourceRange(
  element: HTMLElement,
  range: InlineRange,
  kind: InlineReference['kind'] | 'placeholder' | 'text',
): void {
  element.dataset.dshShikitorSourceStart = String(range.start)
  element.dataset.dshShikitorSourceEnd = String(range.end)
  element.dataset.dshShikitorSourceKind = kind
}

function appendPlaceholder(parent: DocumentFragment, offset: number): void {
  const element = parent.ownerDocument.createElement('span')
  setSourceRange(element, { start: offset, end: offset }, 'placeholder')
  element.textContent = ' '
  parent.append(element)
}

function appendText(
  parent: DocumentFragment,
  text: string,
  start: number,
  token?: TokenMatch,
): void {
  if (text === '') return
  const element = parent.ownerDocument.createElement('span')
  setSourceRange(element, { start, end: start + text.length }, 'text')
  if (token === undefined) {
    element.textContent = text
  } else {
    element.className = `${tokenIconClass} ${tokenIconClass}--${token.kind}`
    element.append(text, createSuggestionIcon(token.kind))
  }
  parent.append(element)
}

function decodedFilePath(path: string): string {
  return path.replaceAll('%3C', '<').replaceAll('%3E', '>')
}

function appendFileReference(
  parent: DocumentFragment,
  reference: FileReference,
  service: ShikitorService,
  openFileHint: () => string,
): void {
  const element = parent.ownerDocument.createElement('span')
  element.className = fileReferenceClass
  element.title = `${reference.label} · ${openFileHint()}`
  element.dataset.dshShikitorFilePath = decodedFilePath(reference.destination)
  setSourceRange(element, reference, 'file')

  const iconMode = service.appearance.getSnapshot().fileIcons
  const resolved = service.resolveFileIcon(decodedFilePath(reference.destination))
  const icon = presentFileIcon(resolved, parent.ownerDocument, iconMode)
  if (icon !== null) {
    icon.classList.add(`${fileReferenceClass}__icon`)
    element.append(icon)
  }
  const label = parent.ownerDocument.createElement('span')
  label.className = `${fileReferenceClass}__label`
  label.textContent = reference.label
  element.append(label)
  parent.append(element)
}

function appendSessionReference(
  parent: DocumentFragment,
  reference: SessionReference,
): void {
  const element = parent.ownerDocument.createElement('a')
  element.className = sessionReferenceClass
  element.href = reference.destination
  element.title = reference.label
  element.dataset.dshShikitorSessionId = reference.sessionId
  setSourceRange(element, reference, 'session')

  const icon = createSuggestionIcon('chat')
  icon.classList.add(`${sessionReferenceClass}__icon`)
  element.append(icon)
  const label = parent.ownerDocument.createElement('span')
  label.className = `${sessionReferenceClass}__label`
  label.textContent = reference.label
  element.append(label)
  parent.append(element)
}

function appendInlineReference(
  parent: DocumentFragment,
  reference: InlineReference,
  service: ShikitorService,
  openFileHint: () => string,
): void {
  if (reference.kind === 'file') {
    appendFileReference(parent, reference, service, openFileHint)
  } else {
    appendSessionReference(parent, reference)
  }
}

function renderLine(
  line: HTMLElement,
  value: string,
  lineStart: number,
  references: readonly InlineReference[],
  tokens: readonly TokenMatch[],
  service: ShikitorService,
  openFileHint: () => string,
): void {
  const lineEnd = lineStart + value.length
  const lineReferences = references.filter(reference =>
    reference.start >= lineStart && reference.end <= lineEnd
  )
  const lineTokens = tokens.filter(token =>
    token.offset >= lineStart
    && token.offset < lineEnd
    && !lineReferences.some(reference =>
      token.offset >= reference.start && token.offset < reference.end
    )
  )
  const items = [
    ...lineReferences.map(reference => ({ offset: reference.start, reference })),
    ...lineTokens.map(token => ({ offset: token.offset, token })),
  ].sort((left, right) => left.offset - right.offset)

  const fragment = line.ownerDocument.createDocumentFragment()
  let offset = lineStart
  for (const item of items) {
    appendText(fragment, value.slice(offset - lineStart, item.offset - lineStart), offset)
    if ('reference' in item) {
      appendInlineReference(fragment, item.reference, service, openFileHint)
      offset = item.reference.end
    } else {
      appendText(fragment, value.slice(item.offset - lineStart, item.offset - lineStart + 1), item.offset, item.token)
      offset = item.offset + 1
    }
  }
  appendText(fragment, value.slice(offset - lineStart), offset)
  if (fragment.childNodes.length === 0) appendPlaceholder(fragment, lineStart)
  line.replaceChildren(fragment)
}

function textNodeOf(element: HTMLElement): Text | undefined {
  return [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE) as Text | undefined
}

function boundaryRect(node: Text, character: number): DOMRect {
  const range = node.ownerDocument.createRange()
  range.setStart(node, character)
  range.collapse(true)
  const collapsed = range.getBoundingClientRect()
  if (collapsed.height > 0) return collapsed

  const fallback = node.ownerDocument.createRange()
  if (character === 0) {
    fallback.setStart(node, 0)
    fallback.setEnd(node, Math.min(1, node.length))
    return fallback.getBoundingClientRect()
  }
  fallback.setStart(node, character - 1)
  fallback.setEnd(node, character)
  const rect = fallback.getBoundingClientRect()
  return new DOMRect(rect.right, rect.top, 0, rect.height)
}

function visualGeometry(output: HTMLElement, lineHeight: number): VisualBoundary[] {
  const boundaries: VisualBoundary[] = []
  output.querySelectorAll<HTMLElement>(`[${sourceAttribute}]`).forEach(element => {
    const start = Number(element.dataset.dshShikitorSourceStart)
    const end = Number(element.dataset.dshShikitorSourceEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return
    const line = element.closest<HTMLElement>('.shikitor-output-line')
    if (!line) return
    const lineRect = line.getBoundingClientRect()
    const normalize = (rect: DOMRect, offset: number, x: number): VisualBoundary => {
      const row = Math.max(0, Math.round((rect.top - lineRect.top) / lineHeight))
      const top = lineRect.top + row * lineHeight
      return { offset, x, top, bottom: top + lineHeight }
    }

    if (
      element.dataset.dshShikitorSourceKind === 'file'
      || element.dataset.dshShikitorSourceKind === 'session'
    ) {
      const rect = element.getBoundingClientRect()
      boundaries.push(normalize(rect, start, rect.left), normalize(rect, end, rect.right))
      return
    }

    if (element.dataset.dshShikitorSourceKind === 'placeholder') {
      const rect = element.getBoundingClientRect()
      boundaries.push(normalize(rect, start, rect.left))
      return
    }

    const node = textNodeOf(element)
    if (!node) return
    for (let character = 0; character <= node.length; character++) {
      const rect = boundaryRect(node, character)
      boundaries.push(normalize(rect, start + character, rect.left))
    }
  })
  return boundaries
}

function closestBoundary(
  boundaries: readonly VisualBoundary[],
  clientX: number,
  clientY: number,
): VisualBoundary | undefined {
  if (boundaries.length === 0) return
  const rowDistance = (boundary: VisualBoundary) => {
    if (clientY < boundary.top) return boundary.top - clientY
    if (clientY > boundary.bottom) return clientY - boundary.bottom
    return 0
  }
  const closestRowDistance = Math.min(...boundaries.map(rowDistance))
  return boundaries
    .filter(boundary => rowDistance(boundary) === closestRowDistance)
    .reduce((closest, boundary) =>
      Math.abs(boundary.x - clientX) < Math.abs(closest.x - clientX) ? boundary : closest
    )
}

/**
 * Render sender trigger icons and collapse catalog-owned Markdown file links to
 * filename-only inline references while retaining the complete draft source.
 */
export interface SenderTokenOptions {
  readonly openFileHint: () => string
  readonly onOpenFile: (path: string) => void
  readonly service: ShikitorService
}

/** Create the session-bound inline projection and modified-click opener. */
export function createSenderTokenIcons(options: SenderTokenOptions) {
  return definePlugin({
    name: 'dsh-sender-inline-tokens',
    inject: ['shikitor'],
    apply(ctx) {
    const shikitor = ctx.shikitor
    const target = shikitor.element
    const input = shikitor.inputElement
    const output = target.querySelector<HTMLElement>('.shikitor-output')
    const container = target.querySelector<HTMLElement>('.shikitor-container')
    const view = output?.ownerDocument.defaultView
    const MutationObserver = view?.MutationObserver
    const ResizeObserver = view?.ResizeObserver
    if (!output || !container || !MutationObserver) return

    const getCursorAbsolutePosition: OmitThisParameter<typeof shikitor._getCursorAbsolutePosition>
      = shikitor._getCursorAbsolutePosition.bind(shikitor)
    const selectionLayer = input.ownerDocument.createElement('div')
    selectionLayer.className = 'dsh-shikitor-selection-layer'
    selectionLayer.setAttribute('aria-hidden', 'true')
    container.append(selectionLayer)
    let references: InlineReference[] = []
    let boundaries: VisualBoundary[] = []
    let disposed = false
    let geometryFrame: number | undefined
    let modifiedNavigation: 'backward' | 'forward' | undefined
    let modifiedNavigationTimer: ReturnType<typeof setTimeout> | undefined
    let scheduled = false
    let pointerAnchor: number | undefined
    let pointerId: number | undefined

    const lineHeight = () => Number.parseFloat(getComputedStyle(input).lineHeight) || 22
    const appendSelectionRect = (rect: DOMRect): void => {
      if (rect.width <= 0 || rect.height <= 0) return
      const containerRect = container.getBoundingClientRect()
      const marker = input.ownerDocument.createElement('span')
      marker.className = 'dsh-shikitor-selection'
      marker.style.left = `${rect.left - containerRect.left}px`
      marker.style.top = `${rect.top - containerRect.top}px`
      marker.style.width = `${rect.width}px`
      marker.style.height = `${rect.height}px`
      selectionLayer.append(marker)
    }
    const renderSelection = (): void => {
      selectionLayer.replaceChildren()
      if (
        disposed
        || references.length === 0
        || input.ownerDocument.activeElement !== input
        || input.selectionStart === input.selectionEnd
      ) return

      const selectionStart = input.selectionStart
      const selectionEnd = input.selectionEnd
      output.querySelectorAll<HTMLElement>(`[${sourceAttribute}]`).forEach(element => {
        const start = Number(element.dataset.dshShikitorSourceStart)
        const end = Number(element.dataset.dshShikitorSourceEnd)
        if (
          !Number.isFinite(start)
          || !Number.isFinite(end)
          || selectionStart >= end
          || selectionEnd <= start
        ) return
        if (
          element.dataset.dshShikitorSourceKind === 'file'
          || element.dataset.dshShikitorSourceKind === 'session'
        ) {
          appendSelectionRect(element.getBoundingClientRect())
          return
        }
        if (element.dataset.dshShikitorSourceKind !== 'text') return
        const node = textNodeOf(element)
        if (!node) return
        const localStart = Math.max(selectionStart, start) - start
        const localEnd = Math.min(selectionEnd, end) - start
        if (localStart >= localEnd) return
        const range = input.ownerDocument.createRange()
        range.setStart(node, localStart)
        range.setEnd(node, localEnd)
        for (const rect of range.getClientRects()) appendSelectionRect(rect)
      })
    }
    const updateSelection = (anchor: number, focus: number): void => {
      input.setSelectionRange(
        Math.min(anchor, focus),
        Math.max(anchor, focus),
        focus < anchor ? 'backward' : 'forward',
      )
      shikitor.optionsRef.current.cursor = shikitor.rawTextHelper.resolvePosition(focus)
      shikitor.selectionsRef.current[0] = {
        start: shikitor.rawTextHelper.resolvePosition(Math.min(anchor, focus)),
        end: shikitor.rawTextHelper.resolvePosition(Math.max(anchor, focus)),
      }
      document.dispatchEvent(new Event('selectionchange'))
    }

    const projectedCursorPosition: typeof shikitor._getCursorAbsolutePosition = (
      cursor,
      lineOffset = 0,
    ) => {
      if (disposed) return getCursorAbsolutePosition(cursor, lineOffset)
      const exact = boundaries.find(boundary => boundary.offset === cursor.offset)
      const reference = references.find(candidate => containsOffset(candidate, cursor.offset))
      const edge = reference === undefined
        ? undefined
        : boundaries.find(boundary => boundary.offset === (
            cursor.offset - reference.start <= reference.end - cursor.offset
              ? reference.start
              : reference.end
          ))
      const boundary = exact ?? edge
      if (boundary === undefined) return getCursorAbsolutePosition(cursor, lineOffset)
      const containerRect = container.getBoundingClientRect()
      return {
        x: boundary.x - containerRect.left + output.scrollLeft,
        y: boundary.bottom - containerRect.top + output.scrollTop + lineOffset * lineHeight(),
      }
    }

    const refreshGeometry = () => {
      if (disposed) return
      boundaries = visualGeometry(output, lineHeight())
      const cursor = projectedCursorPosition.call(shikitor, shikitor.cursor, -1)
      target.style.setProperty('--shikitor-cursor-t', `${cursor.y}px`)
      target.style.setProperty('--shikitor-cursor-l', `${cursor.x}px`)
      renderSelection()
    }
    const scheduleGeometry = () => {
      if (disposed || geometryFrame !== undefined || !view) return
      geometryFrame = view.requestAnimationFrame(() => {
        geometryFrame = undefined
        refreshGeometry()
      })
    }

    const observer = new MutationObserver(() => { scheduleRender() })
    const observe = () => {
      if (!disposed) observer.observe(output, { childList: true, subtree: true })
    }
    const render = () => {
      scheduled = false
      if (disposed) return
      observer.disconnect()
      references = inlineReferences(shikitor.value)
      const tokens = tokenMatches(shikitor.value)
      const lines = shikitor.value.split('\n')
      let lineStart = 0
      output.querySelectorAll<HTMLElement>('.shikitor-output-line').forEach((line, index) => {
        const value = lines[index] ?? ''
        renderLine(
          line,
          value,
          lineStart,
          references,
          tokens,
          options.service,
          options.openFileHint,
        )
        lineStart += value.length + 1
      })
      target.classList.toggle('dsh-shikitor--has-inline-references', references.length > 0)
      refreshGeometry()
      observe()
    }
    function scheduleRender(): void {
      if (disposed || scheduled) return
      scheduled = true
      queueMicrotask(render)
    }

    shikitor._getCursorAbsolutePosition = projectedCursorPosition

    const deleteRawRange = (
      start: number,
      end: number,
      inputType: 'deleteContentBackward' | 'deleteContentForward',
    ) => {
      input.setRangeText('', start, end, 'end')
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: null,
        inputType,
      }))
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const anchor = input.selectionDirection === 'backward' ? input.selectionEnd : input.selectionStart
      const focus = input.selectionDirection === 'backward' ? input.selectionStart : input.selectionEnd
      const backward = event.key === 'ArrowLeft'
      const forward = event.key === 'ArrowRight'
      const deleteBackward = event.key === 'Backspace'
      const deleteForward = event.key === 'Delete'

      if ((event.metaKey || event.ctrlKey || event.altKey) && (backward || forward)) {
        modifiedNavigation = backward ? 'backward' : 'forward'
        if (modifiedNavigationTimer !== undefined) clearTimeout(modifiedNavigationTimer)
        modifiedNavigationTimer = setTimeout(() => { modifiedNavigation = undefined }, 150)
        return
      }

      if (backward || forward) {
        const reference = references.find(candidate =>
          backward
            ? focus > candidate.start && focus <= candidate.end
            : focus >= candidate.start && focus < candidate.end
        )
        if (!reference) return
        event.preventDefault()
        event.stopImmediatePropagation()
        const next = backward ? reference.start : reference.end
        updateSelection(event.shiftKey ? anchor : next, next)
        return
      }

      if (!deleteBackward && !deleteForward) return
      const selectionStart = input.selectionStart
      const selectionEnd = input.selectionEnd
      if (selectionStart !== selectionEnd) {
        const selectedReferences = references.filter(reference =>
          selectionStart < reference.end && selectionEnd > reference.start
        )
        if (selectedReferences.length === 0) return
        event.preventDefault()
        event.stopImmediatePropagation()
        deleteRawRange(
          Math.min(selectionStart, ...selectedReferences.map(reference => reference.start)),
          Math.max(selectionEnd, ...selectedReferences.map(reference => reference.end)),
          deleteBackward ? 'deleteContentBackward' : 'deleteContentForward',
        )
        return
      }

      const reference = references.find(candidate =>
        deleteBackward
          ? focus > candidate.start && focus <= candidate.end
          : focus >= candidate.start && focus < candidate.end
      )
      if (!reference) return
      event.preventDefault()
      event.stopImmediatePropagation()
      deleteRawRange(
        reference.start,
        reference.end,
        deleteBackward ? 'deleteContentBackward' : 'deleteContentForward',
      )
    }

    const onSelectionChange = () => {
      if (
        disposed
        || input.ownerDocument.activeElement !== input
      ) return
      if (input.selectionStart !== input.selectionEnd) {
        const selectedReferences = references.filter(reference =>
          input.selectionStart < reference.end && input.selectionEnd > reference.start
        )
        if (selectedReferences.length === 0) {
          renderSelection()
          return
        }
        const start = Math.min(
          input.selectionStart,
          ...selectedReferences.map(reference => reference.start),
        )
        const end = Math.max(
          input.selectionEnd,
          ...selectedReferences.map(reference => reference.end),
        )
        if (start === input.selectionStart && end === input.selectionEnd) {
          renderSelection()
          return
        }
        if (input.selectionDirection === 'backward') updateSelection(end, start)
        else updateSelection(start, end)
        return
      }
      const offset = input.selectionStart
      const reference = references.find(candidate => containsOffset(candidate, offset))
      if (!reference) {
        renderSelection()
        return
      }
      const next = modifiedNavigation === 'backward'
        ? reference.start
        : modifiedNavigation === 'forward'
          ? reference.end
          : offset - reference.start <= reference.end - offset
            ? reference.start
            : reference.end
      updateSelection(next, next)
    }

    const onFocusChange = () => { renderSelection() }

    const pointerOffset = (event: PointerEvent) =>
      closestBoundary(boundaries, event.clientX, event.clientY)?.offset
    const referenceAtPoint = (event: PointerEvent) => references.find(reference => {
      const element = output.querySelector<HTMLElement>(
        `[data-dsh-shikitor-source-kind="${reference.kind}"]`
        + `[data-dsh-shikitor-source-start="${reference.start}"]`,
      )
      if (!element) return false
      const rect = element.getBoundingClientRect()
      return event.clientX >= rect.left
        && event.clientX <= rect.right
        && event.clientY >= rect.top
        && event.clientY <= rect.bottom
    })
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || references.length === 0) return
      refreshGeometry()
      const reference = referenceAtPoint(event)
      if (
        (event.metaKey || event.ctrlKey)
        && reference?.kind === 'file'
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
        pointerAnchor = undefined
        pointerId = undefined
        options.onOpenFile(decodedFilePath(reference.destination))
        return
      }
      const offset = pointerOffset(event)
      if (offset === undefined) return
      event.preventDefault()
      input.focus({ preventScroll: true })
      if (event.detail > 1 && reference !== undefined) {
        pointerAnchor = undefined
        pointerId = undefined
        updateSelection(reference.start, reference.end)
        return
      }
      const selectionAnchor = input.selectionDirection === 'backward'
        ? input.selectionEnd
        : input.selectionStart
      pointerAnchor = event.shiftKey ? selectionAnchor : offset
      pointerId = event.pointerId
      input.setPointerCapture?.(event.pointerId)
      updateSelection(pointerAnchor, offset)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (pointerAnchor === undefined || event.pointerId !== pointerId) return
      const offset = pointerOffset(event)
      if (offset === undefined) return
      event.preventDefault()
      updateSelection(pointerAnchor, offset)
    }
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      pointerAnchor = undefined
      pointerId = undefined
      if (input.hasPointerCapture?.(event.pointerId)) input.releasePointerCapture(event.pointerId)
    }

    const resizeObserver = ResizeObserver === undefined
      ? undefined
      : new ResizeObserver(scheduleGeometry)
    const fonts = input.ownerDocument.fonts
    resizeObserver?.observe(input)
    resizeObserver?.observe(container)
    fonts?.addEventListener('loadingdone', scheduleGeometry)
    void fonts?.ready.then(scheduleGeometry)
    input.addEventListener('keydown', onKeyDown)
    input.addEventListener('focus', onFocusChange)
    input.addEventListener('blur', onFocusChange)
    input.addEventListener('scroll', scheduleGeometry)
    input.addEventListener('pointerdown', onPointerDown)
    input.addEventListener('pointermove', onPointerMove)
    input.addEventListener('pointerup', onPointerUp)
    input.addEventListener('pointercancel', onPointerUp)
    output.addEventListener('scroll', scheduleGeometry)
    input.ownerDocument.addEventListener('selectionchange', onSelectionChange)
    input.ownerDocument.addEventListener('scroll', scheduleGeometry, true)
    const unsubscribeAppearance = options.service.appearance.subscribe(scheduleRender)
    const unsubscribeFileIcons = options.service.fileIconRules.subscribe(scheduleRender)
    ctx.on('shikitor/change', scheduleRender)
    render()
    return () => {
      disposed = true
      observer.disconnect()
      resizeObserver?.disconnect()
      if (geometryFrame !== undefined && view) view.cancelAnimationFrame(geometryFrame)
      if (modifiedNavigationTimer !== undefined) clearTimeout(modifiedNavigationTimer)
      if (shikitor._getCursorAbsolutePosition === projectedCursorPosition) {
        shikitor._getCursorAbsolutePosition = getCursorAbsolutePosition
      }
      input.removeEventListener('keydown', onKeyDown)
      input.removeEventListener('focus', onFocusChange)
      input.removeEventListener('blur', onFocusChange)
      input.removeEventListener('scroll', scheduleGeometry)
      input.removeEventListener('pointerdown', onPointerDown)
      input.removeEventListener('pointermove', onPointerMove)
      input.removeEventListener('pointerup', onPointerUp)
      input.removeEventListener('pointercancel', onPointerUp)
      output.removeEventListener('scroll', scheduleGeometry)
      input.ownerDocument.removeEventListener('selectionchange', onSelectionChange)
      input.ownerDocument.removeEventListener('scroll', scheduleGeometry, true)
      unsubscribeAppearance()
      unsubscribeFileIcons()
      fonts?.removeEventListener('loadingdone', scheduleGeometry)
      selectionLayer.remove()
      target.classList.remove('dsh-shikitor--has-inline-references')
    }
    },
  })
}
