import { calculateNodeSize } from './calculateNodeSize'

function isNull<T>(value: T | null | undefined): value is null | undefined {
  return value === null || value === undefined
}

type CalculateStyleType = {
  height?: string
  minHeight?: string
}

const TEXTAREA_STYLE = `
  min-height:0 !important;
  max-height:none !important;
  height:0 !important;
  visibility:hidden !important;
  overflow:hidden !important;
  position:absolute !important;
  z-index:-1000 !important;
  top:0 !important;
  right:0 !important
`

let hiddenTextarea: HTMLTextAreaElement

export function calcTextareaHeight(
  targetElement: HTMLTextAreaElement,
  minRows?: number,
  maxRows?: number
): CalculateStyleType {
  if (!hiddenTextarea) {
    hiddenTextarea = document.createElement('textarea')
    document.body.appendChild(hiddenTextarea)
  }

  const {
    paddingSize,
    borderSize,
    boxSizing,
    sizingStyle
  } = calculateNodeSize(targetElement)

  hiddenTextarea.setAttribute('style', `${sizingStyle};${TEXTAREA_STYLE}`)
  hiddenTextarea.value = targetElement.value || targetElement.placeholder || ''

  let height = hiddenTextarea.scrollHeight
  const result: CalculateStyleType = {}
  const isBorderbox = boxSizing === 'border-box'
  const isContentbox = boxSizing === 'content-box'

  if (isBorderbox) {
    height += borderSize
  } else if (isContentbox) {
    height -= paddingSize
  }

  hiddenTextarea.value = ''
  const measuredRowHeight = hiddenTextarea.scrollHeight - paddingSize
  const computedLineHeight = Number.parseFloat(
    window.getComputedStyle(targetElement).lineHeight
  )
  // React adapters may create the editor before its root is attached to the
  // document. Browsers report a zero scrollHeight in that state, so keep the
  // autosize contract (at least one row) using the resolved line height.
  const singleRowHeight = measuredRowHeight > 0
    ? measuredRowHeight
    : Number.isFinite(computedLineHeight) && computedLineHeight > 0
      ? computedLineHeight
      : 22
  hiddenTextarea?.parentNode?.removeChild(hiddenTextarea)
  // @ts-ignore
  hiddenTextarea = null

  const calcHeight = (rows: number) => {
    let rowsHeight = singleRowHeight * rows
    if (isBorderbox) {
      rowsHeight = rowsHeight + paddingSize + borderSize
    }
    return rowsHeight
  }

  if (!isNull(minRows)) {
    const minHeight = calcHeight(minRows)
    height = Math.max(minHeight, Number.isFinite(height) ? height : 0)
    result.minHeight = `${minHeight}px`
  }
  if (!isNull(maxRows)) {
    height = Math.min(calcHeight(maxRows), height)
  }
  result.height = `${height}px`
  return result
}
