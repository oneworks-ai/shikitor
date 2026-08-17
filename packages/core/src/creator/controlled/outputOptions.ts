import { derive } from 'valtio/utils'

import type { RefObject } from '../../base'
import { cssvar } from '../../base'
import type { ShikitorOptions } from '../../editor'

type OutputPresentation = Pick<
  ShikitorOptions,
  | 'currentLineHighlightColor'
  | 'hideSelfCursorUsername'
  | 'highlightCurrentLine'
  | 'lineNumbers'
  | 'readOnly'
>

type OutputRenderDependencies = Pick<
  ShikitorOptions,
  | 'decorations'
  | 'inlineReplacements'
  | 'language'
  | 'plugins'
  | 'renderMode'
  | 'theme'
>

export function createOutputPresentation(
  optionsRef: RefObject<ShikitorOptions>
): OutputPresentation {
  return derive({
    readOnly: get => get(optionsRef).current.readOnly,
    lineNumbers: get => get(optionsRef).current.lineNumbers,
    highlightCurrentLine: get => get(optionsRef).current.highlightCurrentLine,
    currentLineHighlightColor: get => (
      get(optionsRef).current.currentLineHighlightColor
    ),
    hideSelfCursorUsername: get => (
      get(optionsRef).current.hideSelfCursorUsername
    )
  })
}

export function createOutputRenderDependencies(
  optionsRef: RefObject<ShikitorOptions>
): OutputRenderDependencies {
  return derive({
    theme: get => get(optionsRef).current.theme,
    language: get => get(optionsRef).current.language,
    decorations: get => get(optionsRef).current.decorations,
    inlineReplacements: get => get(optionsRef).current.inlineReplacements,
    plugins: get => get(optionsRef).current.plugins,
    renderMode: get => get(optionsRef).current.renderMode
  })
}

export function applyOutputPresentation(
  target: HTMLElement,
  {
    readOnly,
    lineNumbers = 'on',
    highlightCurrentLine = true,
    currentLineHighlightColor,
    hideSelfCursorUsername = false
  }: OutputPresentation
) {
  target.classList.toggle('read-only', readOnly === true)
  target.classList.toggle('line-numbers', lineNumbers === 'on')
  target.classList.toggle('hide-current-line', !highlightCurrentLine)
  target.classList.toggle('hide-self-cursor-username', hideSelfCursorUsername)
  if (currentLineHighlightColor) {
    target.style.setProperty(cssvar('current-line-color'), currentLineHighlightColor)
  } else {
    target.style.removeProperty(cssvar('current-line-color'))
  }
}
