import { getTokenStyleObject } from '@shikijs/core'

import type { TokenSnapshot } from './tokenSnapshot'
import { tokenizedLineAt } from './tokenSnapshot'

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  }[character]!))
}

export function supportsSvgRenderer() {
  return typeof document !== 'undefined'
}

export function createLessDomSvgRenderer(
  input: HTMLTextAreaElement,
  output: HTMLElement
) {
  let snapshot: TokenSnapshot | undefined
  let drawing = 0
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => scheduleDraw())
    : undefined
  observer?.observe(input)
  input.addEventListener('scroll', scheduleDraw)

  function scheduleDraw() {
    cancelAnimationFrame(drawing)
    drawing = requestAnimationFrame(draw)
  }

  function draw() {
    if (!snapshot) return
    const currentSnapshot = snapshot
    const width = Math.max(1, input.clientWidth)
    const height = Math.max(1, input.clientHeight)
    const computed = getComputedStyle(input)
    const fontSize = Number.parseFloat(computed.fontSize) || 12
    const lineHeight = Number.parseFloat(computed.lineHeight) || fontSize * 1.5
    const firstLine = Math.max(0, Math.floor(input.scrollTop / lineHeight))
    const lastLine = Math.min(
      currentSnapshot.lineCount,
      firstLine + Math.ceil(height / lineHeight) + 1
    )
    const rows: string[] = []
    for (let lineIndex = firstLine; lineIndex < lastLine; lineIndex++) {
      const y = lineIndex * lineHeight + lineHeight / 2 - input.scrollTop
      const line = tokenizedLineAt(currentSnapshot, lineIndex)
      const tokens = line ? line.tokens.map(token => {
        const style = getTokenStyleObject(token)
        return '<tspan'
          + ` fill="${escapeXml(style.color || currentSnapshot.theme.fg)}"`
          + `${style['font-style'] ? ` font-style="${escapeXml(style['font-style'])}"` : ''}`
          + `${style['font-weight'] ? ` font-weight="${escapeXml(style['font-weight'])}"` : ''}`
          + `>${escapeXml(token.content.replaceAll('\t', '  '))}</tspan>`
      }).join('') : `<tspan fill="${escapeXml(currentSnapshot.theme.fg)}">${escapeXml(
        currentSnapshot.document.lineAt(lineIndex).replaceAll('\t', '  ')
      )}</tspan>`
      rows.push(`<text x="${-input.scrollLeft}" y="${y}" dominant-baseline="middle">${tokens}</text>`)
    }
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}"`,
      ` height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<g xml:space="preserve" font-family="${escapeXml(computed.fontFamily)}"`,
      ` font-size="${fontSize}px">${rows.join('')}</g></svg>`
    ].join('')
    output.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
    output.style.backgroundPosition = '0 0'
    output.style.backgroundRepeat = 'no-repeat'
  }

  function clear() {
    snapshot = undefined
    cancelAnimationFrame(drawing)
    output.style.removeProperty('background-image')
    output.style.removeProperty('background-position')
    output.style.removeProperty('background-repeat')
  }

  return {
    clear,
    commit(next: TokenSnapshot) {
      snapshot = next
      output.replaceChildren()
      scheduleDraw()
    },
    dispose() {
      clear()
      observer?.disconnect()
      input.removeEventListener('scroll', scheduleDraw)
    },
    kind: 'svg-viewport' as const
  }
}
