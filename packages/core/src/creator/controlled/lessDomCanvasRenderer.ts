import { getTokenStyleObject } from '@shikijs/core'

import type { TokenSnapshot } from './tokenSnapshot'
import { tokenizedLineAt } from './tokenSnapshot'

interface CanvasTextMetrics {
  baseFont: string
  fontFamily: string
  fontSize: number
  fontStyle: string
  fontWeight: string
  lineHeight: number
  monospace: boolean
}

export function supportsCanvasRenderer() {
  if (typeof document === 'undefined') return false
  try {
    return Boolean(document.createElement('canvas').getContext('2d'))
  } catch {
    return false
  }
}

export function createLessDomCanvasRenderer(
  input: HTMLTextAreaElement,
  output: HTMLElement
) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  let snapshot: TokenSnapshot | undefined
  let drawing = 0
  let metrics: CanvasTextMetrics | undefined
  const observer = new ResizeObserver(() => {
    metrics = undefined
    scheduleDraw()
  })

  canvas.className = 'shikitor-less-dom-canvas'
  observer.observe(input)
  input.addEventListener('scroll', scheduleDraw)

  function scheduleDraw() {
    cancelAnimationFrame(drawing)
    drawing = requestAnimationFrame(draw)
  }

  function getMetrics(): CanvasTextMetrics {
    if (metrics) return metrics
    const computed = getComputedStyle(input)
    const fontSize = Number.parseFloat(computed.fontSize) || 12
    const lineHeight = Number.parseFloat(computed.lineHeight) || fontSize * 1.5
    const baseFont = [
      computed.fontStyle,
      computed.fontWeight,
      `${fontSize}px`,
      computed.fontFamily
    ].join(' ')
    context.font = baseFont
    metrics = {
      baseFont,
      fontFamily: computed.fontFamily,
      fontSize,
      fontStyle: computed.fontStyle,
      fontWeight: computed.fontWeight,
      lineHeight,
      monospace: Math.abs(
        context.measureText('iiii').width - context.measureText('WWWW').width
      ) < .01
    }
    return metrics
  }

  function draw() {
    if (!snapshot) return
    const ratio = window.devicePixelRatio || 1
    const width = Math.max(1, input.clientWidth)
    const height = Math.max(1, input.clientHeight)
    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = width * ratio
      canvas.height = height * ratio
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    const {
      baseFont,
      fontFamily,
      fontSize,
      fontStyle,
      fontWeight,
      lineHeight,
      monospace
    } = getMetrics()
    context.font = baseFont
    const fontWidths = new Map<string, number>()
    let currentFont = baseFont
    const firstLine = Math.max(0, Math.floor(input.scrollTop / lineHeight))
    const lastLine = Math.min(
      snapshot.lineCount,
      firstLine + Math.ceil(height / lineHeight) + 1
    )
    context.textBaseline = 'middle'
    for (let lineIndex = firstLine; lineIndex < lastLine; lineIndex++) {
      let x = -input.scrollLeft
      const y = lineIndex * lineHeight + lineHeight / 2 - input.scrollTop
      const line = tokenizedLineAt(snapshot, lineIndex)
      if (!line || line.tokenized === false) {
        context.fillStyle = snapshot.theme.fg
        context.font = `${fontSize}px ${fontFamily}`
        context.fillText(
          (line?.source ?? snapshot.document.lineAt(lineIndex)).replaceAll('\t', '  '),
          x,
          y
        )
        continue
      }
      for (const token of line.tokens) {
        const style = getTokenStyleObject(token)
        const content = token.content.replaceAll('\t', '  ')
        context.fillStyle = style.color || snapshot.theme.fg
        const tokenFont = [
          style['font-style'] || fontStyle,
          style['font-weight'] || fontWeight,
          `${fontSize}px`,
          fontFamily
        ].join(' ')
        if (currentFont !== tokenFont) context.font = currentFont = tokenFont
        context.fillText(content, x, y)
        if (monospace) {
          let tokenWidth = fontWidths.get(tokenFont)
          if (tokenWidth === undefined) {
            tokenWidth = context.measureText('M').width
            fontWidths.set(tokenFont, tokenWidth)
          }
          x += content.length * tokenWidth
        } else {
          x += context.measureText(content).width
        }
      }
    }
  }

  function clear() {
    snapshot = undefined
    metrics = undefined
    cancelAnimationFrame(drawing)
    context.clearRect(0, 0, canvas.width, canvas.height)
  }

  return {
    clear,
    commit(next: TokenSnapshot) {
      snapshot = next
      metrics = undefined
      if (canvas.parentElement !== output) output.replaceChildren(canvas)
      scheduleDraw()
    },
    dispose() {
      clear()
      observer.disconnect()
      input.removeEventListener('scroll', scheduleDraw)
      canvas.remove()
    },
    kind: 'canvas' as const
  }
}
