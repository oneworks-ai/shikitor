import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Shikitor } from '../../src/editor'
import type { ResolvedPopup } from '../../src/plugins/provide-popup'
import {
  mountPopup,
  popupsControlled
} from '../../src/plugins/provide-popup/popupsControlled'

class FakeStyle {
  [key: string]: unknown

  setProperty(name: string, value: string) {
    this[name] = value
  }
}

class FakeElement {
  readonly children: FakeElement[] = []
  readonly style = new FakeStyle()
  className = ''
  clientHeight = 20
  clientWidth = 100
  parentElement?: FakeElement

  get classList() {
    const names = () => this.className.split(/\s+/).filter(Boolean)
    return {
      add: (...classNames: string[]) => {
        this.className = [...new Set([...names(), ...classNames])].join(' ')
      },
      contains: (className: string) => names().includes(className),
      remove: (...classNames: string[]) => {
        this.className = names().filter(name => !classNames.includes(name)).join(' ')
      }
    }
  }

  appendChild(child: FakeElement) {
    child.parentElement = this
    this.children.push(child)
    return child
  }

  remove() {
    if (!this.parentElement) return
    const index = this.parentElement.children.indexOf(this)
    if (index !== -1) this.parentElement.children.splice(index, 1)
    this.parentElement = undefined
  }

  querySelector() {
    return null
  }

  getBoundingClientRect() {
    return {
      top: 0,
      left: 0,
      right: 640,
      bottom: 480,
      width: 640,
      height: 480
    }
  }
}

class FakeDocument extends EventTarget {
  createElement() {
    return new FakeElement()
  }
}

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

const popup = (id = 'selection-toolbox'): ResolvedPopup => ({
  id,
  position: 'absolute',
  offset: { top: 0, left: 0 },
  render() {}
})

describe('popup lifecycle', () => {
  let root: FakeElement
  let documentTarget: FakeDocument

  beforeEach(() => {
    root = new FakeElement()
    documentTarget = new FakeDocument()
    vi.stubGlobal('document', documentTarget)
    vi.stubGlobal('window', new EventTarget())
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('replaces a stale popup with the same editor-scoped id', () => {
    const shikitor = { element: root } as unknown as Shikitor

    mountPopup(shikitor, popup())
    mountPopup(shikitor, popup())

    expect(root.children).toHaveLength(1)
  })

  it('removes mounted popups and ignores queued updates after disposal', async () => {
    const shikitor = { element: root } as unknown as Shikitor
    const controller = popupsControlled(() => shikitor)
    controller.popups.push(popup())

    await vi.waitFor(() => expect(root.children).toHaveLength(1))
    controller.dispose()
    expect(root.children).toHaveLength(0)

    controller.popups.push(popup('late-popup'))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(root.children).toHaveLength(0)
  })

  it('recovers when a direct mount replaces a controlled popup id', async () => {
    const shikitor = { element: root } as unknown as Shikitor
    const controller = popupsControlled(() => shikitor)
    const controlledPopup = popup()
    controller.popups.push(controlledPopup)
    await vi.waitFor(() => expect(root.children).toHaveLength(1))

    mountPopup(shikitor, popup())
    expect(root.children).toHaveLength(1)
    controller.popups.push(popup('second-popup'))

    await vi.waitFor(() => expect(root.children).toHaveLength(2))
    controller.dispose()
    expect(root.children).toHaveLength(0)
  })
})
