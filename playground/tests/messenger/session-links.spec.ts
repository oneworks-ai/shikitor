import type { ShikitorInputEvent } from '@shikitor/core'
import MarkdownIt from 'markdown-it'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import sessionLinks, {
  getMessengerSessionInlineReplacements,
  getMessengerSessionLinkDecorations
} from '../../src/examples/Messenger/plugins/session-links'
import {
  getMessengerSkillInlineReplacements,
  getMessengerSkillMarkdown
} from '../../src/examples/Messenger/plugins/skill-links'
import { resolveMessengerCompletionInsertText } from '../../src/examples/Messenger/plugins/trigger-completions'

class FakeClassList {
  private values = new Set<string>()

  constructor(...values: string[]) {
    values.forEach(value => this.values.add(value))
  }

  contains(value: string) {
    return this.values.has(value)
  }

  remove(value: string) {
    this.values.delete(value)
  }

  toggle(value: string, force: boolean) {
    if (force) this.values.add(value)
    else this.values.delete(value)
  }
}

class FakeElement extends EventTarget {
  readonly classList: FakeClassList
  readonly dataset: Record<string, string> = {}
  parentElement?: FakeElement
  ownerDocument: { defaultView: EventTarget }

  constructor(ownerDocument: { defaultView: EventTarget }, ...classNames: string[]) {
    super()
    this.ownerDocument = ownerDocument
    this.classList = new FakeClassList(...classNames)
  }

  closest<T extends Element = Element>(selector: string): T | null {
    const className = selector.startsWith('.') ? selector.slice(1) : undefined
    if (className && this.classList.contains(className)) return this as unknown as T
    for (let element = this.parentElement; element; element = element.parentElement) {
      if (className && element.classList.contains(className)) return element as unknown as T
    }
    return null
  }
}

type InputListener = (event: ShikitorInputEvent) => void

function inputService() {
  const listeners = new Set<InputListener>()
  const disposeAction = vi.fn()
  const disposeBinding = vi.fn()
  const disposeSubscription = vi.fn()
  let action: { run(event: ShikitorInputEvent): unknown } | undefined
  let binding: Record<string, unknown> | undefined
  return {
    service: {
      platform: 'macos' as const,
      registerAction(value: typeof action) {
        action = value
        return { dispose: disposeAction }
      },
      registerBinding(value: Record<string, unknown>) {
        binding = value
        return { dispose: disposeBinding }
      },
      registerBindings() {
        return { dispose() {} }
      },
      subscribe(listener: InputListener) {
        listeners.add(listener)
        return {
          dispose() {
            listeners.delete(listener)
            disposeSubscription()
          }
        }
      }
    },
    emit(event: ShikitorInputEvent) {
      listeners.forEach(listener => listener(event))
    },
    action: () => action,
    binding: () => binding,
    disposals: { disposeAction, disposeBinding, disposeSubscription }
  }
}

function inputEvent(
  type: ShikitorInputEvent['type'],
  element: EventTarget,
  mod = false
) {
  return {
    type,
    hit: { zone: 'content', element },
    modifiers: { mod },
    nativeEvent: new Event(type)
  } as unknown as ShikitorInputEvent
}

describe('messenger session links', () => {
  beforeEach(() => {
    vi.stubGlobal('Element', FakeElement)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('decorates known room names and reserves a square marker slot', () => {
    const references = {
      'frontend-review': { roomId: 'frontend-review', icon: 'preview' },
      'release-prep': { roomId: 'release-prep', icon: 'rocket_launch' }
    }

    expect(getMessengerSessionLinkDecorations(
      '#frontend-review #unknown #release-prep',
      references
    )).toEqual([
      {
        start: 1,
        end: 16,
        alwaysWrap: true,
        properties: {
          class: 'messenger-session-link messenger-session-link--text',
          'data-room': 'frontend-review'
        }
      },
      {
        start: 27,
        end: 39,
        alwaysWrap: true,
        properties: {
          class: 'messenger-session-link messenger-session-link--text',
          'data-room': 'release-prep'
        }
      }
    ])
    expect(getMessengerSessionInlineReplacements(
      '#frontend-review #unknown #release-prep',
      references
    )).toEqual([
      {
        start: 0,
        end: 1,
        inlineSize: '1em',
        properties: {
          class: 'messenger-session-link messenger-session-link--marker',
          'data-room': 'frontend-review',
          'data-session-icon': 'preview'
        }
      },
      {
        start: 26,
        end: 27,
        inlineSize: '1em',
        properties: {
          class: 'messenger-session-link messenger-session-link--marker',
          'data-room': 'release-prep',
          'data-session-icon': 'rocket_launch'
        }
      }
    ])
  })

  test('navigates only when the Mod primary-click binding hits link text', () => {
    const ownerDocument = { defaultView: new EventTarget() }
    const root = new FakeElement(ownerDocument, 'shikitor')
    const link = new FakeElement(ownerDocument, 'messenger-session-link')
    link.dataset.room = 'frontend-review'
    const whitespace = new FakeElement(ownerDocument, 'shikitor-output-line')
    const pointer = inputService()
    const keyboard = inputService()
    const onNavigate = vi.fn()
    const plugin = sessionLinks as unknown as {
      apply(context: unknown, options: { onNavigate(roomId: string): void }): () => void
    }
    const cleanup = plugin.apply({
      shikitor: { element: root },
      shikitorPointer: pointer.service,
      shikitorKeyboard: keyboard.service
    }, { onNavigate })

    expect(pointer.binding()).toMatchObject({
      trigger: { type: 'click', button: 'primary' },
      modifiers: ['Mod'],
      target: 'content'
    })
    expect(pointer.action()?.run(inputEvent('click', whitespace, true))).toBe(false)
    expect(onNavigate).not.toHaveBeenCalled()
    expect(pointer.action()?.run(inputEvent('click', link, true))).toMatchObject({
      handled: true,
      preventDefault: true,
      stopPropagation: true
    })
    expect(onNavigate).toHaveBeenCalledWith('frontend-review')

    cleanup()
  })

  test('underlines only while Mod is active over the exact link and cleans up', () => {
    const ownerDocument = { defaultView: new EventTarget() }
    const root = new FakeElement(ownerDocument, 'shikitor')
    const link = new FakeElement(ownerDocument, 'messenger-session-link')
    link.dataset.room = 'release-prep'
    const whitespace = new FakeElement(ownerDocument, 'shikitor-output-line')
    const pointer = inputService()
    const keyboard = inputService()
    const plugin = sessionLinks as unknown as {
      apply(context: unknown, options: { onNavigate(roomId: string): void }): () => void
    }
    const cleanup = plugin.apply({
      shikitor: { element: root },
      shikitorPointer: pointer.service,
      shikitorKeyboard: keyboard.service
    }, { onNavigate() {} })

    pointer.emit(inputEvent('pointermove', link))
    expect(link.classList.contains('messenger-session-link--active')).toBe(false)
    keyboard.emit(inputEvent('keydown', root, true))
    expect(link.classList.contains('messenger-session-link--active')).toBe(true)
    keyboard.emit(inputEvent('keyup', root))
    expect(link.classList.contains('messenger-session-link--active')).toBe(false)
    pointer.emit(inputEvent('pointermove', link, true))
    expect(link.classList.contains('messenger-session-link--active')).toBe(true)
    pointer.emit(inputEvent('pointermove', whitespace, true))
    expect(link.classList.contains('messenger-session-link--active')).toBe(false)
    pointer.emit(inputEvent('pointermove', link, true))

    cleanup()
    expect(link.classList.contains('messenger-session-link--active')).toBe(false)
    expect(pointer.disposals.disposeAction).toHaveBeenCalledOnce()
    expect(pointer.disposals.disposeBinding).toHaveBeenCalledOnce()
    expect(pointer.disposals.disposeSubscription).toHaveBeenCalledOnce()
    expect(keyboard.disposals.disposeSubscription).toHaveBeenCalledOnce()
  })
})

describe('messenger skill links', () => {
  const references = {
    mem: { title: '$mem', href: 'skill://mem', icon: 'memory' },
    browser: { title: '$browser', href: 'skill://browser', icon: 'language' }
  }

  test('keeps a real Markdown link while showing only its title', () => {
    const value = getMessengerSkillMarkdown(references.mem)

    expect(value).toBe('[$mem](skill://mem)')
    expect(MarkdownIt().renderInline(value)).toBe('<a href="skill://mem">$mem</a>')
    expect(getMessengerSkillInlineReplacements(value, references)).toEqual([
      {
        start: 0,
        end: 19,
        inlineSize: 'calc(1em + 4ch)',
        blockSize: '1em',
        interaction: 'atomic',
        properties: {
          class: 'messenger-skill-link messenger-skill-link--atomic',
          'data-skill-href': 'skill://mem',
          'data-skill-icon': 'memory',
          'data-skill-title': '$mem'
        }
      }
    ])
  })

  test('inserts the full Markdown link from skill completion', () => {
    expect(resolveMessengerCompletionInsertText('$', {
      label: 'mem',
      insertText: getMessengerSkillMarkdown(references.mem)
    })).toBe('[$mem](skill://mem)')
    expect(resolveMessengerCompletionInsertText('#', {
      label: 'frontend-review'
    })).toBe('#frontend-review')
  })

  test('does not compress unknown or mismatched skill links', () => {
    const value = '[$unknown](skill://unknown) [$mem](skill://browser)'
    expect(getMessengerSkillInlineReplacements(value, references)).toEqual([])
  })
})
