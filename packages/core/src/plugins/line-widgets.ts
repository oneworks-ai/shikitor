import './line-widgets.scss'

import { definePlugin } from '@shikitor/core'

export interface LineWidget {
  id: string
  /** One-based source line after which the region is inserted. */
  afterLine: number
  className?: string
  minHeight?: number
  render(container: HTMLElement): void | (() => void)
}

export interface LineWidgetsOptions {
  widgets: LineWidget[]
}

export default definePlugin({
  name: 'line-widgets',
  inject: ['shikitor'],
  apply(ctx, options: LineWidgetsOptions) {
    const target = ctx.shikitor.element
    const output = target.querySelector('.shikitor-output') as HTMLElement
    const gutters = target.querySelector('.shikitor-lines') as HTMLElement
    let renderFrame: number | undefined
    let widgetDisposers: Array<() => void> = []
    let widgetObservers: ResizeObserver[] = []

    target.classList.add('shikitor--line-widgets')

    function clearWidgets() {
      widgetObservers.forEach(observer => observer.disconnect())
      widgetObservers = []
      widgetDisposers.forEach(dispose => dispose())
      widgetDisposers = []
      target.querySelectorAll<HTMLElement>('[data-shikitor-line-widget]')
        .forEach(element => element.remove())
    }

    function render() {
      renderFrame = undefined
      observer.disconnect()
      clearWidgets()
      const outputAnchors = new Map<number, Element>()
      const gutterAnchors = new Map<number, Element>()
      const widgets = [...(options.widgets ?? [])]
        .filter(widget => Number.isInteger(widget.afterLine) && widget.afterLine > 0)
        .sort((a, b) => a.afterLine - b.afterLine)

      for (const widget of widgets) {
        const outputLine = output.querySelector<HTMLElement>(`[data-line="${widget.afterLine}"]`)
        const gutterLine = gutters.querySelector<HTMLElement>(`[data-line="${widget.afterLine}"]`)
        if (!outputLine || !gutterLine) continue

        const region = document.createElement('div')
        region.className = `shikitor-line-widget${widget.className ? ` ${widget.className}` : ''}`
        region.dataset.shikitorLineWidget = widget.id
        region.dataset.afterLine = String(widget.afterLine)
        if (widget.minHeight) region.style.minHeight = `${widget.minHeight}px`

        const spacer = document.createElement('div')
        spacer.className = 'shikitor-line-widget-gutter'
        spacer.dataset.shikitorLineWidget = `${widget.id}-gutter`
        spacer.setAttribute('aria-hidden', 'true')

        const outputAnchor = outputAnchors.get(widget.afterLine) ?? outputLine
        const gutterAnchor = gutterAnchors.get(widget.afterLine) ?? gutterLine
        outputAnchor.after(region)
        gutterAnchor.after(spacer)
        outputAnchors.set(widget.afterLine, region)
        gutterAnchors.set(widget.afterLine, spacer)

        const dispose = widget.render(region)
        if (dispose) widgetDisposers.push(dispose)
        const syncHeight = () => {
          region.style.setProperty(
            '--shikitor-line-widget-gutter-width',
            `${gutters.getBoundingClientRect().width}px`
          )
          spacer.style.height = `${region.getBoundingClientRect().height}px`
        }
        syncHeight()
        const resizeObserver = new ResizeObserver(syncHeight)
        resizeObserver.observe(region)
        widgetObservers.push(resizeObserver)
      }

      observer.observe(output, { childList: true, subtree: true })
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
      clearWidgets()
      target.classList.remove('shikitor--line-widgets')
    }
  }
})
