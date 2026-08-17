interface LatestRenderHandlers<Input, Output> {
  renderFallback: (input: Input) => void
  renderAsync: (
    input: Input,
    isCurrent: () => boolean,
    publish: (output: Output) => void
  ) => Promise<Output | undefined>
  commit: (output: Output, input: Input) => void
  onError?: (error: unknown, input: Input) => void
}

export function createLatestRenderController<Input, Output>(
  handlers: LatestRenderHandlers<Input, Output>
) {
  let renderVersion = 0
  let disposed = false

  return {
    async render(input: Input) {
      if (disposed) return
      const currentRender = ++renderVersion
      const isCurrent = () => !disposed && currentRender === renderVersion
      const publish = (output: Output) => {
        if (isCurrent()) handlers.commit(output, input)
      }
      handlers.renderFallback(input)
      try {
        const rendered = await handlers.renderAsync(input, isCurrent, publish)
        if (rendered === undefined || !isCurrent()) return
        handlers.commit(rendered, input)
      } catch (error) {
        if (isCurrent()) handlers.onError?.(error, input)
      }
    },
    dispose() {
      disposed = true
      renderVersion++
    }
  }
}
