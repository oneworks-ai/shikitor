import { create } from '@shikitor/core'
import type { InputShikitorPlugin, Shikitor, ShikitorOptions } from '@shikitor/core'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { SenderCatalog } from './catalog.ts'
import { NS } from './locales.ts'
import { createSenderSuggestionsPlugin } from './senderSuggestions.ts'
import { createSenderTokenIcons } from './senderTokenIcons.ts'
import {
  resolveShikitorTheme,
  resolveSurfaceAppearance,
  type ShikitorAppearance,
  type ShikitorService,
} from './registry.ts'

declare const __DSH_SHIKITOR_DEV__: boolean

const SENDER_MODE_KEY = 'dsh-shikitor.sender-mode'

interface SenderInjected {
  hooks: {
    plugins: HostObservable<readonly InputShikitorPlugin[]>
    colorScheme: HostObservable<'light' | 'dark'>
    appearance: HostObservable<ShikitorAppearance>
  }
  catalog: SenderCatalog
  editorTabLabel: () => string
  runtime: ShikitorService
}

export type ShikitorSenderBridgeProps = PropsRuntime<'conversation.input.right'>
  & PropsLocale<typeof NS>
  & InjectFace<SenderInjected>

/**
 * Attach Shikitor to DSH's resident textarea without replacing or moving it.
 * DSH remains responsible for the draft, keyboard policy, submission and all
 * surrounding composer extension points.
 */
export function ShikitorSenderBridge({
  input,
  inputActions,
  sessionId,
  catalog,
  editorTabLabel,
  runtime,
  t,
  useInput,
  usePlugins,
  useColorScheme,
  useAppearance,
}: ShikitorSenderBridgeProps) {
  const anchorRef = useRef<HTMLElement | null>(null)
  const editorRef = useRef<Shikitor | undefined>(undefined)
  const draft = useInput(state => state.draft)
  const draftRef = useRef(draft)
  const inputActionsRef = useRef(inputActions)
  const translateRef = useRef(t)
  const editorTabLabelRef = useRef(editorTabLabel)
  const plugins = usePlugins(value => value)
  const colorScheme = useColorScheme(value => value)
  const appearance = useAppearance(value => value)
  const senderAppearance = resolveSurfaceAppearance(appearance, 'sender')
  const translate = useMemo<typeof t>(
    () => (key, params) => translateRef.current(key, params),
    [],
  )
  const suggestionsPlugin = useMemo(
    () => createSenderSuggestionsPlugin(catalog, sessionId, runtime, translate),
    [catalog, runtime, sessionId, translate],
  )
  const tokenPlugin = useMemo(() => createSenderTokenIcons({
    service: runtime,
    openFileHint: () => translateRef.current('file.openHint'),
    onOpenFile: (path) => {
      const document = anchorRef.current?.ownerDocument
      const editorTab = document === undefined
        ? undefined
        : [...document.querySelectorAll<HTMLButtonElement>('button[role="tab"]')]
            .find(button => button.textContent?.trim() === editorTabLabelRef.current())
      editorTab?.click()
      void runtime.openFile(sessionId, path)
    },
  }), [runtime, sessionId])
  const editorOptions = useMemo<ShikitorOptions>(() => ({
    language: 'markdown',
    lineNumbers: 'off',
    hideSelfCursorUsername: true,
    readOnly: input.phase !== 'plain',
    theme: resolveShikitorTheme(senderAppearance, colorScheme),
    plugins: [...plugins, suggestionsPlugin, tokenPlugin],
  }), [colorScheme, input.phase, plugins, senderAppearance, suggestionsPlugin, tokenPlugin])
  const editorOptionsRef = useRef(editorOptions)
  const cursorStyleRef = useRef(senderAppearance.cursor)
  const [mode, setMode] = useState<'native' | 'shikitor'>(() =>
    __DSH_SHIKITOR_DEV__ && localStorage.getItem(SENDER_MODE_KEY) === 'native'
      ? 'native'
      : 'shikitor'
  )

  draftRef.current = draft
  inputActionsRef.current = inputActions
  translateRef.current = t
  editorTabLabelRef.current = editorTabLabel
  editorOptionsRef.current = editorOptions
  cursorStyleRef.current = senderAppearance.cursor

  useLayoutEffect(() => {
    if (mode !== 'shikitor') return

    const textarea = anchorRef.current
      ?.closest<HTMLElement>('[data-composer-card]')
      ?.querySelector<HTMLTextAreaElement>('[data-input-scroll] textarea')
    if (!textarea) return

    const abort = new AbortController()
    let mounted: Shikitor | undefined
    let active = true

    void create(textarea, {
      value: textarea.value,
      ...editorOptionsRef.current,
      onChange: value => {
        queueMicrotask(() => {
          // DSH's own textarea handler normally arrives first. Only write
          // when a Shikitor plugin changed the value outside that native path.
          if (active && draftRef.current !== value) inputActionsRef.current.setDraft(value)
        })
      },
    }, { abort: abort.signal }).then(editor => {
      mounted = editor
      editorRef.current = editor
      editor.element.dataset.dshShikitorCursor = cursorStyleRef.current
      if (editor.value !== draftRef.current) editor.value = draftRef.current
      void editor.updateOptions(current => ({
        ...current,
        ...editorOptionsRef.current,
      })).catch(error => {
        console.error('Failed to update Shikitor sender', error)
      })
    }).catch(error => {
      if (!abort.signal.aborted) console.error('Failed to attach Shikitor sender', error)
    })

    return () => {
      active = false
      abort.abort()
      mounted?.[Symbol.dispose]()
      if (editorRef.current === mounted) editorRef.current = undefined
    }
  }, [mode, sessionId])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.element.dataset.dshShikitorCursor = senderAppearance.cursor
    void editor.updateOptions(current => ({
      ...current,
      ...editorOptions,
    })).catch(error => {
      console.error('Failed to update Shikitor sender', error)
    })
  }, [editorOptions, senderAppearance.cursor])

  useEffect(() => {
    const editor = editorRef.current
    if (editor && editor.value !== draft) editor.value = draft
  }, [draft])

  const setAnchor = (element: HTMLElement | null): void => {
    anchorRef.current = element
  }

  if (!__DSH_SHIKITOR_DEV__) {
    return <span ref={setAnchor} hidden aria-hidden="true" />
  }

  const switchMode = () => {
    const next = mode === 'shikitor' ? 'native' : 'shikitor'
    localStorage.setItem(SENDER_MODE_KEY, next)
    setMode(next)
  }

  const currentModeLabel = mode === 'shikitor' ? 'Shikitor' : t('mode.native')
  const nextModeLabel = mode === 'shikitor' ? t('mode.native') : 'Shikitor'

  return (
    <button
      ref={setAnchor}
      type="button"
      className="dsh-shikitor-mode-toggle"
      aria-label={t('mode.aria', { current: currentModeLabel, next: nextModeLabel })}
      title={t('mode.title', { current: currentModeLabel, next: nextModeLabel })}
      onClick={switchMode}
    >
      {currentModeLabel}
    </button>
  )
}
