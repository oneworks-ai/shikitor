import { FileDiff } from '@pierre/diffs'
import { Editor } from '@pierre/diffs/edit'

import type { BenchmarkAdapter } from '../types'

const adapter: BenchmarkAdapter = {
  async mount({ config, container, dataset }) {
    const root = document.createElement('div')
    root.className = 'benchmark-editor-host benchmark-editor-host--pierre'
    container.append(root)
    const instance = new FileDiff<unknown>({
      collapsedContextThreshold: 8,
      diffStyle: config.view === 'split' ? 'split' : 'unified',
      disableFileHeader: true,
      expandUnchanged: false,
      lineDiffType: 'word',
      overflow: 'scroll',
      themeType: config.theme
    })
    let markAttached: () => void = () => undefined
    const attached = new Promise<void>(resolve => { markAttached = resolve })
    const editor = new Editor<unknown>({ onAttach: () => markAttached() })
    const detach = editor.edit(instance)
    instance.render({
      fileContainer: root,
      newFile: {
        cacheKey: 'benchmark-current',
        contents: dataset.current,
        name: 'benchmark.ts'
      },
      oldFile: {
        cacheKey: 'benchmark-original',
        contents: dataset.original,
        name: 'benchmark.ts'
      }
    })
    await instance.primeHighlightCache()
    instance.rerender()
    await attached

    return {
      dispose() {
        detach()
        editor.cleanUp()
        instance.cleanUp()
        root.remove()
      },
      insertText(text) {
        const value = editor.getText()
        const lines = value.split('\n')
        const position = { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 }
        editor.applyEdits([{
          newText: text,
          range: { start: position, end: position }
        }])
      },
      scrollTo(ratio) {
        const scroller = root.querySelector<HTMLElement>('pre') ?? root
        scroller.scrollTop = scroller.scrollHeight * ratio
      }
    }
  }
}

export default adapter
