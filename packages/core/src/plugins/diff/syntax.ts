import { transformerRenderWhitespace } from '@shikijs/transformers'
import { createHighlighter } from 'shiki'

import { shikitorStructureTransformer } from '../../creator/structureTransfomer'

type HighlighterPromise = ReturnType<typeof createHighlighter>

export class DiffSyntaxRenderer {
  private highlighters = new Map<string, HighlighterPromise>()

  private get(theme: string, language: string) {
    const key = `${theme}\0${language}`
    let highlighter = this.highlighters.get(key)
    if (!highlighter) {
      highlighter = createHighlighter({ themes: [theme], langs: [language] })
      this.highlighters.set(key, highlighter)
      void highlighter.catch(() => this.highlighters.delete(key))
    }
    return highlighter
  }

  async render(target: HTMLElement, value: string, theme: string, language: string) {
    const highlighter = await this.get(theme, language)
    const html = highlighter.codeToHtml(value, {
      theme,
      lang: language,
      transformers: [
        shikitorStructureTransformer(target),
        transformerRenderWhitespace()
      ]
    })
    const template = document.createElement('template')
    template.innerHTML = html
    return [...template.content.querySelectorAll<HTMLElement>('.shikitor-output-line')]
      .map(line => line.cloneNode(true) as HTMLElement)
  }

  dispose() {
    for (const highlighter of this.highlighters.values()) {
      void highlighter.then(instance => instance.dispose()).catch(() => {})
    }
    this.highlighters.clear()
  }
}
