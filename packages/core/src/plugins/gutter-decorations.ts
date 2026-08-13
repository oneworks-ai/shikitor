import './gutter-decorations.scss'

import { definePlugin } from '@shikitor/core'

export interface GutterDecoration {
  id: string
  /** One-based source line containing the decoration. */
  line: number
  /** Position relative to the line number. */
  position: 'left' | 'right'
  className?: string
  render(container: HTMLElement): void | (() => void)
}

export interface GutterDecorationsOptions {
  decorations: GutterDecoration[]
}

export default definePlugin({
  name: 'gutter-decorations',
  inject: ['shikitor'],
  apply(ctx, options: GutterDecorationsOptions) {
    const target = ctx.shikitor.element
    const gutters = target.querySelector('.shikitor-lines') as HTMLElement
    let renderFrame: number | undefined
    let decorationDisposers: Array<() => void> = []

    target.classList.add('shikitor--gutter-decorations')

    function clearDecorations() {
      decorationDisposers.forEach(dispose => dispose())
      decorationDisposers = []
      gutters.querySelectorAll<HTMLElement>(
        '[data-shikitor-gutter-decoration], [data-shikitor-gutter-decoration-slot]'
      )
        .forEach(element => element.remove())
    }

    function render() {
      renderFrame = undefined
      observer.disconnect()
      clearDecorations()
      const decorations = (options.decorations ?? [])
        .filter(decoration => Number.isInteger(decoration.line) && decoration.line > 0)
      const positions = new Set(decorations.map(decoration => decoration.position))

      for (const line of gutters.querySelectorAll<HTMLElement>('.shikitor-gutter-line')) {
        const number = line.querySelector<HTMLElement>('.shikitor-gutter-line-number')
        if (!number) continue
        for (const position of ['left', 'right'] as const) {
          if (!positions.has(position)) continue
          const slot = document.createElement('span')
          slot.className = `shikitor-gutter-decoration-slot shikitor-gutter-decoration-slot--${position}`
          slot.dataset.shikitorGutterDecorationSlot = position
          slot.dataset.position = position
          if (position === 'left') number.before(slot)
          else number.after(slot)
        }
      }

      for (const decoration of decorations) {
        const line = gutters.querySelector<HTMLElement>(`[data-line="${decoration.line}"]`)
        const slot = line?.querySelector<HTMLElement>(
          `[data-shikitor-gutter-decoration-slot="${decoration.position}"]`
        )
        if (!slot) continue

        const mount = document.createElement('span')
        mount.className = `shikitor-gutter-decoration shikitor-gutter-decoration--${decoration.position}${
          decoration.className ? ` ${decoration.className}` : ''
        }`
        mount.dataset.shikitorGutterDecoration = decoration.id
        mount.dataset.position = decoration.position
        slot.append(mount)

        const dispose = decoration.render(mount)
        if (dispose) decorationDisposers.push(dispose)
      }

      observer.observe(gutters, { childList: true, subtree: true })
    }

    function scheduleRender() {
      if (renderFrame !== undefined) return
      renderFrame = requestAnimationFrame(render)
    }

    const observer = new MutationObserver(scheduleRender)
    scheduleRender()
    return () => {
      observer.disconnect()
      if (renderFrame !== undefined) cancelAnimationFrame(renderFrame)
      clearDecorations()
      target.classList.remove('shikitor--gutter-decorations')
    }
  }
})
