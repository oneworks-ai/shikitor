import type { CompletionItemIconRenderer } from '@shikitor/core/plugins/provide-completions'

export type SuggestionIconName =
  | 'chat'
  | 'command'
  | 'file'
  | 'mention'
  | 'plugin'
  | 'skill'
  | 'subagent'

const suggestionIconPaths: Readonly<Record<SuggestionIconName, string>> = {
  chat: 'M4 5h16v11H8l-4 4zM8 9h8M8 12h5',
  command: 'M4 5h16v14H4zM7 9l3 3-3 3M12 15h5',
  file: 'M7 3h7l4 4v14H7zM14 3v5h4M10 12h5M10 16h5',
  mention: 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  plugin: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  skill: 'M15 4l5 5L8 21H3v-5zM13 6l5 5M6 3v4M4 5h4M19 15v4M17 17h4',
  subagent: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0',
}

/** Create the shared, theme-aware SVG used by popup and inline token renderers. */
export function createSuggestionIcon(name: SuggestionIconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')

  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  shape.setAttribute('d', suggestionIconPaths[name])
  svg.append(shape)
  return svg
}

function suggestionIcon(name: SuggestionIconName): CompletionItemIconRenderer {
  return () => createSuggestionIcon(name)
}

export const suggestionIcons = {
  chat: suggestionIcon('chat'),
  command: suggestionIcon('command'),
  file: suggestionIcon('file'),
  mention: suggestionIcon('mention'),
  plugin: suggestionIcon('plugin'),
  skill: suggestionIcon('skill'),
  subagent: suggestionIcon('subagent'),
} satisfies Record<SuggestionIconName, CompletionItemIconRenderer>
