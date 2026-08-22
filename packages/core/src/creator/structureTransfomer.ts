import type { ShikiTransformer } from '@shikijs/types'

import { cssvar } from '../base'
import { classnames } from '../utils/classnames'

const appliedThemes = new WeakMap<HTMLElement, string>()

export function applyShikitorTheme(
  target: HTMLElement,
  { backgroundColor, color }: { backgroundColor: string, color: string }
) {
  // Root custom property writes invalidate every descendant's style; every
  // render commit applies the theme, so unchanged values are skipped.
  const key = `${backgroundColor}\0${color}`
  if (appliedThemes.get(target) === key) return
  appliedThemes.set(target, key)
  target.style.setProperty(cssvar('fg-color'), color)
  for (let i = 1; i <= 9; i++) {
    target.style.setProperty(
      cssvar(`fg-color-op${i}`),
      `color-mix(in oklch, var(${cssvar('fg-color')}), transparent ${i * 10}%)`
    )
    target.style.setProperty(
      cssvar(`bg-color-op${i}`),
      `color-mix(in oklch, var(${cssvar('bg-color')}), transparent ${i * 10}%)`
    )
  }
  target.style.setProperty(cssvar('bg-color'), backgroundColor)
  target.style.setProperty(
    cssvar('caret-color'),
    `color-mix(in srgb, var(${cssvar('bg-color')}), var(${cssvar('fg-color')}) 90%)`
  )
  target.style.setProperty(
    cssvar('hv-color'),
    `color-mix(in srgb, var(${cssvar('bg-color')}), var(${cssvar('fg-color')}) 80%)`
  )
  target.style.setProperty(
    cssvar('active-color'),
    `color-mix(in srgb, var(${cssvar('bg-color')}), var(${cssvar('fg-color')}) 60%)`
  )
  target.style.color = color
  target.style.backgroundColor = backgroundColor
}

export function shikitorStructureTransformer(
  target: HTMLElement
): ShikiTransformer {
  return {
    name: 'shikitor',
    pre(ele) {
      const div = document.createElement('div')
      div.style.cssText = (ele.properties.style as string | undefined) ?? ''
      const bg = div.style.backgroundColor
      const fg = div.style.color
      applyShikitorTheme(target, { backgroundColor: bg, color: fg })
      target.style.cssText += ele.properties.style
    },
    code(ele) {
      const props = ele.properties as {
        class?: string
      }
      props.class = classnames(props.class, 'shikitor-output-lines')
    },
    line(ele, line) {
      const props = ele.properties as {
        'data-line'?: string
        class?: string
      }
      props.class = classnames(
        props.class,
        'shikitor-output-line'
      )
      props['data-line'] = String(line)
      if (ele.children.length === 0) {
        ele.children.push({ type: 'text', value: ' ' })
      }
    },
    span(ele, line, col) {
      const props = ele.properties as {
        class?: string
        style?: string
      }
      props.class = classnames(
        props.class,
        'shikitor-output-token',
        `offset:${col}`,
        `position:${line + 1}:${col + 1}`
      )
    }
  }
}
