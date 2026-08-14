const DOM_STYLE_PROPS = [
  'padding-top',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'font-family',
  'font-weight',
  'font-size',
  'font-variant',
  'text-rendering',
  'text-transform',
  'width',
  'text-indent',
  'border-width',
  'box-sizing',
  'line-height',
  'letter-spacing'
]

export function calculateNodeSize(targetElement: HTMLElement) {
  if (typeof window === 'undefined') {
    return {
      paddingSize: 0,
      borderSize: 0,
      boxSizing: 0,
      sizingStyle: ''
    }
  }

  const style = window.getComputedStyle(targetElement)

  const boxSizing = style.getPropertyValue('box-sizing')
    || style.getPropertyValue('-moz-box-sizing')
    || style.getPropertyValue('-webkit-box-sizing')

  const readSize = (name: string) => {
    const value = Number.parseFloat(style.getPropertyValue(name))
    return Number.isFinite(value) ? value : 0
  }

  const paddingSize = readSize('padding-bottom')
    + readSize('padding-top')

  const borderSize = readSize('border-bottom-width')
    + readSize('border-top-width')

  const sizingStyle = DOM_STYLE_PROPS
    .map((name) => `${name}:${style.getPropertyValue(name)}`)
    .join(';')

  return {
    paddingSize,
    borderSize,
    boxSizing,
    sizingStyle
  }
}
