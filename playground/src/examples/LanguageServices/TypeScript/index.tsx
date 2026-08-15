import './index.scss'

import type { Shikitor, ShikitorInputEvent } from '@shikitor/core'
import provideCompletions from '@shikitor/core/plugins/provide-completions'
import hoverPopover from '@shikitor/core/plugins/hover-popover'
import providePopup from '@shikitor/core/plugins/provide-popup'
import providePointer from '@shikitor/core/plugins/provide-pointer'
import { WithoutCoreEditor } from '@shikitor/react/WithoutCoreEditor'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useQueries } from '../../../hooks/useQueries'
import { useShikitorCreate } from '../../../hooks/useShikitorCreate'
import { useI18n } from '../../../i18n'
import type { LanguageDefinition, LanguageServiceSnapshot } from './client'
import typeScriptLanguageService from './plugin'

const initialCode = `/** Profile data returned by the account API. */
interface User {
  /** Stable numeric identifier for the account. */
  id: number
  /** Display name shown throughout the workspace. */
  name: string
}

/** The user currently signed in to this workspace. */
const user: User = {
  id: "not-a-number",
  name: "Ada"
}

user.name
user`

const emptySnapshot: LanguageServiceSnapshot = {
  diagnostics: [],
  completions: [],
  documentVersion: 0,
  runtimeVersion: '…'
}

export default function TypeScriptLanguageServiceDemo() {
  const { t } = useI18n()
  const shikitorCreate = useShikitorCreate()
  const queries = useQueries<{ theme: 'dark' | 'light' }>()
  const editorTheme = queries.value.theme === 'dark' ? 'github-dark' as const : 'github-light' as const
  const [code, setCode] = useState(initialCode)
  const [snapshot, setSnapshot] = useState(emptySnapshot)
  const [ready, setReady] = useState(false)
  const [definition, setDefinition] = useState<LanguageDefinition>()
  const editorRef = useRef<Shikitor>()
  const disposeListenerRef = useRef<() => void>()
  const completionEmptyText = t('lsp.completion.empty')
  const hoverEmptyText = t('lsp.hover.documentationEmpty')
  const hoverAriaLabel = t('lsp.hover.ariaLabel')
  const editorOptions = useMemo(() => ({
    language: 'typescript' as const,
    theme: editorTheme,
    lineNumbers: 'on' as const,
    hideSelfCursorUsername: true
  }), [editorTheme])
  const plugins = useMemo(() => [
    providePointer,
    providePopup,
    [provideCompletions, {
      popupPlacement: 'bottom',
      footer: false,
      emptyText: completionEmptyText
    }] as const,
    typeScriptLanguageService,
    [hoverPopover, {
      delay: 240,
      ariaLabel: hoverAriaLabel,
      resolve(event: ShikitorInputEvent, editor: Shikitor) {
        const offset = event.hit.position?.offset
        if (offset === undefined) return
        const client = editor.context.shikitorTypeScript
        client.updateDocument(editor.value)
        const hover = client.getHover(offset)
        if (!hover) return
        return {
          id: `typescript-${hover.start}-${hover.length}`,
          start: hover.start,
          end: hover.start + hover.length,
          title: hover.signature,
          content: hover.documentation ?? hoverEmptyText
        }
      }
    }] as const
  ], [completionEmptyText, hoverAriaLabel, hoverEmptyText])

  const handleMounted = useCallback((editor: Shikitor) => {
    disposeListenerRef.current?.()
    editorRef.current = editor
    editor.optionsRef.current.cursor = initialCode.length
    editor.focus(initialCode.length)
    setReady(true)
    setSnapshot(editor.context.shikitorTypeScript.inspect(editor.cursor.offset))
    const disposeSnapshot = editor.context.on('shikitor/typescript-updated', setSnapshot)
    const disposeDefinition = editor.context.on('shikitor/typescript-definition', setDefinition)
    disposeListenerRef.current = () => {
      disposeSnapshot()
      disposeDefinition()
    }
  }, [])

  useEffect(() => () => disposeListenerRef.current?.(), [])

  const focusDiagnostic = (start: number) => {
    editorRef.current?.focus(start)
  }

  return (
    <div className='ts-lsp-demo'>
      <section className='ts-lsp-hero'>
        <div>
          <span className='ts-lsp-eyebrow'>{t('lsp.eyebrow')}</span>
          <h2>{t('lsp.title')}</h2>
          <p>{t('lsp.description')}</p>
        </div>
        <div className={`ts-lsp-runtime${ready ? ' ts-lsp-runtime--ready' : ''}`}>
          <span className='shikitor-icon'>hub</span>
          <span>
            <strong>{ready ? t('lsp.runtime.ready') : t('lsp.runtime.loading')}</strong>
            <small>Cordis · TypeScript {snapshot.runtimeVersion}</small>
          </span>
        </div>
      </section>

      <div className='ts-lsp-pipeline' aria-label={t('lsp.pipeline.label')}>
        <span><i className='shikitor-icon'>edit_note</i>Shikitor</span>
        <i className='shikitor-icon'>arrow_forward</i>
        <span><i className='shikitor-icon'>extension</i>Cordis plugin</span>
        <i className='shikitor-icon'>arrow_forward</i>
        <span><i className='shikitor-icon'>data_object</i>TS LanguageService</span>
      </div>

      <section className='ts-lsp-workbench'>
        <div className='ts-lsp-editor-column'>
          <div className='ts-lsp-editor-toolbar'>
            <span><i className='shikitor-icon'>description</i>index.ts</span>
            <span>{t('lsp.document.version', { version: snapshot.documentVersion })}</span>
          </div>
          <WithoutCoreEditor
            className='ts-lsp-editor'
            create={shikitorCreate}
            value={code}
            onChange={setCode}
            onMounted={handleMounted}
            plugins={plugins}
            options={editorOptions}
          />
          <div className='ts-lsp-editor-hint'>
            <span className='shikitor-icon'>tips_and_updates</span>
            {definition
              ? t('lsp.definition.navigated', {
                  name: definition.name,
                  line: definition.line,
                  character: definition.character
                })
              : t('lsp.tryHint')}
          </div>
        </div>

        <aside className='ts-lsp-results'>
          <section className='ts-lsp-result-section'>
            <header>
              <span><i className='shikitor-icon'>error</i>{t('lsp.diagnostics')}</span>
              <b>{snapshot.diagnostics.length}</b>
            </header>
            <div className='ts-lsp-result-list'>
              {snapshot.diagnostics.length === 0
                ? <p className='ts-lsp-empty'>{t('lsp.diagnostics.empty')}</p>
                : snapshot.diagnostics.map(diagnostic => (
                    <button
                      type='button'
                      key={`${diagnostic.code}-${diagnostic.start}`}
                      className={`ts-lsp-diagnostic ts-lsp-diagnostic--${diagnostic.severity}`}
                      onClick={() => focusDiagnostic(diagnostic.start)}
                    >
                      <span>TS{diagnostic.code}</span>
                      <strong>{diagnostic.message}</strong>
                      <small>{diagnostic.line}:{diagnostic.character}</small>
                    </button>
                  ))}
            </div>
          </section>

          <section className='ts-lsp-result-section'>
            <header>
              <span><i className='shikitor-icon'>info</i>{t('lsp.hover')}</span>
            </header>
            {snapshot.hover
              ? (
                  <div className='ts-lsp-hover'>
                    <code>{snapshot.hover.signature}</code>
                    {snapshot.hover.documentation && <p>{snapshot.hover.documentation}</p>}
                  </div>
                )
              : <p className='ts-lsp-empty'>{t('lsp.hover.empty')}</p>}
          </section>

          <section className='ts-lsp-result-section'>
            <header>
              <span><i className='shikitor-icon'>auto_awesome</i>{t('lsp.completion')}</span>
              <b>{snapshot.completions.length}</b>
            </header>
            {snapshot.completions.length > 0
              ? (
                  <div className='ts-lsp-completions'>
                    {snapshot.completions.map(completion => (
                      <span key={`${completion.kind}-${completion.label}`}>
                        <i>{completion.kind.slice(0, 1).toUpperCase()}</i>
                        {completion.label}
                      </span>
                    ))}
                  </div>
                )
              : <p className='ts-lsp-empty'>{t('lsp.completion.empty')}</p>}
          </section>
        </aside>
      </section>
    </div>
  )
}
