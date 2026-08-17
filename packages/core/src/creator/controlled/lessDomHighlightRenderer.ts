import { getTokenStyleObject } from '@shikijs/core'

import type { TokenSnapshot } from './tokenSnapshot'

interface OpaqueRange extends AbstractRange { disconnect(): void }
type HighlightRange = AbstractRange & { disconnect?(): void }
type OpaqueTextarea = HTMLTextAreaElement & {
  createValueRange(start: number, end: number): OpaqueRange
}

export function supportsHighlightApi() {
  return typeof Highlight === 'function'
    && typeof CSS !== 'undefined'
    && typeof CSS.highlights?.set === 'function'
}

export function supportsOpaqueRange(input: HTMLTextAreaElement): input is OpaqueTextarea {
  return typeof (input as Partial<OpaqueTextarea>).createValueRange === 'function'
}

function tokenStyle(token: Parameters<typeof getTokenStyleObject>[0]) {
  const style = getTokenStyleObject(token)
  const value = {
    background: style['background-color'],
    color: style.color,
    decoration: style['text-decoration']
  }
  return { key: JSON.stringify(Object.values(value)), value }
}

function updateText(textNode: Text, value: string) {
  const previous = textNode.data
  let start = 0
  while (start < previous.length && previous[start] === value[start]) start++
  let oldEnd = previous.length
  let newEnd = value.length
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === value[newEnd - 1]) {
    oldEnd--
    newEnd--
  }
  textNode.replaceData(start, oldEnd - start, value.slice(start, newEnd))
}

export function createLessDomHighlightRenderer({
  input,
  output,
  target,
  rendererId
}: {
  input: HTMLTextAreaElement
  output: HTMLElement
  target: HTMLElement
  rendererId: string
}) {
  const native = supportsOpaqueRange(input)
  const kind = native ? 'opaque-range' : 'range-bridge'
  const styleElement = document.createElement('style')
  const groups = new Map<string, {
    highlight: Highlight
    name: string
    ranges: HighlightRange[]
    style: ReturnType<typeof tokenStyle>['value']
  }>()
  const lines: Array<Array<{ key: string, range: HighlightRange }>> = []
  let themeKey = ''
  target.append(styleElement)

  function clear() {
    for (const { highlight, name, ranges } of groups.values()) {
      CSS.highlights.delete(name)
      for (const range of ranges) {
        highlight.delete(range)
        range.disconnect?.()
      }
    }
    groups.clear()
    lines.length = 0
    themeKey = ''
    styleElement.textContent = ''
  }

  function bridgeText() {
    const current = output.querySelector<HTMLElement>('[data-shikitor-less-dom-id]')
    if (current?.firstChild instanceof Text) return current.firstChild
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.className = 'shiki shikitor-output-lines'
    code.dataset.shikitorLessDomId = rendererId
    code.append(document.createTextNode(''))
    pre.append(code)
    output.replaceChildren(pre)
    return code.firstChild as Text
  }

  function removeSuffix(changedFrom: number) {
    for (const records of lines.splice(changedFrom)) {
      for (const { key, range } of records) {
        const group = groups.get(key)
        group?.highlight.delete(range)
        const index = group?.ranges.indexOf(range) ?? -1
        if (group && index >= 0) group.ranges.splice(index, 1)
        range.disconnect?.()
      }
    }
  }

  function syncStyles() {
    const selector = native
      ? `[data-shikitor-native-id="${rendererId}"] .shikitor-input`
      : `[data-shikitor-less-dom-id="${rendererId}"]`
    styleElement.textContent = [...groups.values()].map(({ name, style }) => (
      `${selector}::highlight(${name}){`
      + `${style.color ? `color:${style.color};` : ''}`
      + `${style.background ? `background-color:${style.background};` : ''}`
      + `${style.decoration ? `text-decoration:${style.decoration};` : ''}`
      + '}'
    )).join('\n')
  }

  function commit(snapshot: TokenSnapshot) {
    const nextTheme = `${snapshot.theme.bg}\0${snapshot.theme.fg}`
    const changedFrom = themeKey === nextTheme ? snapshot.changedFrom : 0
    if (changedFrom === 0) clear()
    else removeSuffix(changedFrom)
    themeKey = nextTheme
    const textNode = native ? undefined : bridgeText()
    if (textNode) updateText(textNode, snapshot.document.value)
    if (native) output.replaceChildren()
    const startLine = Math.max(changedFrom, snapshot.lineOffset)
    const endLine = snapshot.lineOffset + snapshot.lines.length
    let lineOffset = snapshot.document.offsetAt(startLine)
    for (let lineIndex = startLine; lineIndex < endLine; lineIndex++) {
      const line = snapshot.lines[lineIndex - snapshot.lineOffset]
      const records: Array<{ key: string, range: HighlightRange }> = []
      for (const token of line.tokens) {
        if (!token.content.length) continue
        const { key, value: style } = tokenStyle(token)
        let group = groups.get(key)
        if (!group) {
          const name = `shikitor-syntax-${rendererId}-${groups.size}`
          group = { highlight: new Highlight(), name, ranges: [], style }
          groups.set(key, group)
          CSS.highlights.set(name, group.highlight)
        }
        const start = lineOffset + token.offset
        const range: HighlightRange = native
          ? input.createValueRange(start, start + token.content.length)
          : document.createRange()
        if (range instanceof Range) {
          range.setStart(textNode!, start)
          range.setEnd(textNode!, start + token.content.length)
        }
        group.highlight.add(range)
        group.ranges.push(range)
        records.push({ key, range })
      }
      lines[lineIndex] = records
      lineOffset += line.source.length + 1
    }
    syncStyles()
  }

  return {
    clear,
    commit,
    dispose: () => { clear(); styleElement.remove() },
    kind
  }
}
