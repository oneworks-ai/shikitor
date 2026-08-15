import './index.scss'

import type { Shikitor, ShikitorOptions } from '@shikitor/core'
import type {
  ShikitorDiffController,
  ShikitorDiffModel,
  ShikitorDiffView
} from '@shikitor/core/plugins/diff'
import diffPlugin, { computeDiffModel } from '@shikitor/core/plugins/diff'
import { WithoutCoreEditor } from '@shikitor/react'
import React, { useMemo, useRef, useState } from 'react'
import type { BundledTheme } from 'shiki'

import { useQueries } from '../../hooks/useQueries'
import { useShikitorCreate } from '../../hooks/useShikitorCreate'
import { useI18n } from '../../i18n'

const originalSource = `export interface ReviewOptions {
  theme: 'light' | 'dark'
  compact: boolean
}

const defaults: ReviewOptions = {
  theme: 'light',
  compact: true
}

const reviewStages = ['draft', 'review', 'approved'] as const

function isReviewStage(value: string) {
  return reviewStages.includes(value as typeof reviewStages[number])
}

function normalizeReviewer(name: string) {
  return name.trim().toLowerCase()
}

function formatLabel(name: string) {
  return name.toUpperCase()
}

export function createReview(options = defaults) {
  return { label: formatLabel('Diff'), options }
}`

const workingSource = `export interface ReviewOptions {
  theme: 'light' | 'dark'
  mode: 'unified' | 'split'
}

const defaults: ReviewOptions = {
  theme: 'dark',
  mode: 'split'
}

const reviewStages = ['draft', 'review', 'approved'] as const

function isReviewStage(value: string) {
  return reviewStages.includes(value as typeof reviewStages[number])
}

function normalizeReviewer(name: string) {
  return name.trim().toLowerCase()
}

export function createReview(options = defaults) {
  return { label: 'Diff review', options }
}

export function acceptHunk(id: string) {
  return { id, accepted: true }
}`

export default function DiffEditor() {
  const { t } = useI18n()
  const shikitorCreate = useShikitorCreate()
  const { value: query } = useQueries<{ theme: 'dark' | 'light' }>()
  const editorTheme: BundledTheme = query.theme === 'dark' ? 'github-dark' : 'github-light'
  const editorRef = useRef<Shikitor>()
  const controllerRef = useRef<ShikitorDiffController>()
  const [source, setSource] = useState(workingSource)
  const [view, setViewState] = useState<ShikitorDiffView>('unified')
  const viewRef = useRef<ShikitorDiffView>(view)
  viewRef.current = view
  const [model, setModel] = useState<ShikitorDiffModel>(() => (
    computeDiffModel(originalSource, workingSource)
  ))

  const options = useMemo<ShikitorOptions>(() => ({
    language: 'typescript',
    theme: editorTheme,
    lineNumbers: 'on',
    hideSelfCursorUsername: true
  }), [editorTheme])
  const plugins = useMemo<ShikitorOptions['plugins']>(() => [[diffPlugin, {
    original: originalSource,
    get view() {
      return viewRef.current
    },
    inline: 'word',
    hunkActions: {
      accept: t('diff.acceptHunk'),
      reject: t('diff.revertHunk')
    },
    collapseUnchanged: {
      context: 1,
      minimum: 4,
      collapseLabel: t('diff.collapseUnchanged'),
      expandLabel: t('diff.expandUnchanged'),
      label: (count: number) => t('diff.unchangedLines', { count })
    },
    onDiffChange: setModel
  }]], [t])

  const setView = (next: ShikitorDiffView) => {
    setViewState(next)
    controllerRef.current?.setView(next)
  }
  const reset = () => {
    controllerRef.current?.setOriginal(originalSource)
    if (editorRef.current) editorRef.current.value = workingSource
    setSource(workingSource)
    setView('unified')
  }

  return (
    <div className='diff-editor-demo'>
      <section className='diff-editor-workbench'>
        <header className='diff-editor-toolbar'>
          <div className='diff-editor-file'>
            <span className='shikitor-icon' aria-hidden='true'>difference</span>
            <strong>{t('diff.file')}</strong>
            <span className='diff-editor-stats' aria-live='polite'>
              {model.identical
                ? t('diff.noChanges')
                : <>
                    <b>{t('diff.additions', { count: model.stats.additions })}</b>
                    <i>{t('diff.deletions', { count: model.stats.deletions })}</i>
                    <span>{t('diff.hunks', { count: model.stats.hunks })}</span>
                  </>}
            </span>
          </div>
          <div className='diff-editor-actions'>
            <div className='diff-editor-view' role='group' aria-label='Diff view'>
              {(['unified', 'split'] as const).map(item => (
                <button
                  type='button'
                  key={item}
                  aria-pressed={view === item}
                  onClick={() => setView(item)}
                >
                  {t(`diff.${item}`)}
                </button>
              ))}
            </div>
            <button type='button' onClick={() => controllerRef.current?.acceptAll()}>
              <span className='shikitor-icon' aria-hidden='true'>done_all</span>{t('diff.acceptAll')}
            </button>
            <button type='button' onClick={() => void controllerRef.current?.rejectAll()}>
              <span className='shikitor-icon' aria-hidden='true'>undo</span>{t('diff.revertAll')}
            </button>
            <button type='button' onClick={reset}>
              <span className='shikitor-icon' aria-hidden='true'>restart_alt</span>{t('diff.reset')}
            </button>
          </div>
        </header>

        <WithoutCoreEditor
          create={shikitorCreate}
          value={source}
          onChange={setSource}
          options={options}
          plugins={plugins}
          onMounted={editor => {
            editorRef.current = editor
            controllerRef.current = editor.context.shikitorDiff
            editor.context.shikitorDiff.setView(view)
            setModel(editor.context.shikitorDiff.model)
          }}
        />
      </section>
    </div>
  )
}
