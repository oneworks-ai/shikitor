import './index.scss'

import type { ShikitorOptions } from '@shikitor/core'
import { WithoutCoreEditor } from '@shikitor/react'
import React, { useMemo, useState } from 'react'
import type { BundledLanguage, BundledTheme } from 'shiki'
import { Select } from 'tdesign-react'

import { useQueries } from '../../hooks/useQueries'
import { useShikitorCreate } from '../../hooks/useShikitorCreate'
import { useI18n } from '../../i18n'

const examples = {
  typescript: `interface ThemeToken {
  name: string
  value: string
}

const accent: ThemeToken = {
  name: 'accent',
  value: '#8b7df2'
}

export const resolveToken = () => accent.value`,
  javascript: `const accent = {
  name: 'accent',
  value: '#8b7df2'
}

export const resolveToken = () => accent.value`,
  json: `{
  "name": "Shikitor",
  "theme": "github-dark",
  "features": ["editing", "rendering", "plugins"]
}`,
  markdown: `# Shikitor

Edit this **Markdown** source and inspect the synchronized rendering.

- Cordis plugins
- Shiki highlighting
- Exact source projection`,
  css: `.shikitor-demo {
  color: #8b7df2;
  display: grid;
  gap: 0.75rem;
}`
} as const

type LiveLanguage = keyof typeof examples

const languageOptions: { label: string; value: LiveLanguage }[] = [
  { label: 'TypeScript', value: 'typescript' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'JSON', value: 'json' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'CSS', value: 'css' }
]

export default function LiveRenderer() {
  const { t } = useI18n()
  const shikitorCreate = useShikitorCreate()
  const queries = useQueries<{ theme: 'dark' | 'light' }>()
  const colorMode = queries.value.theme === 'dark' ? 'dark' : 'light'
  const editorTheme: BundledTheme = colorMode === 'dark' ? 'github-dark' : 'github-light'
  const [language, setLanguage] = useState<LiveLanguage>('typescript')
  const [sourceByLanguage, setSourceByLanguage] = useState<Record<LiveLanguage, string>>(
    () => ({ ...examples })
  )
  const source = sourceByLanguage[language]

  const sourceOptions = useMemo<ShikitorOptions>(() => ({
    language: language as BundledLanguage,
    theme: editorTheme,
    lineNumbers: 'on',
    hideSelfCursorUsername: true
  }), [editorTheme, language])
  const outputOptions = useMemo<ShikitorOptions>(() => ({
    ...sourceOptions,
    readOnly: true
  }), [sourceOptions])

  const updateSource = (value: string) => {
    setSourceByLanguage(current => ({ ...current, [language]: value }))
  }

  return (
    <div className='live-renderer-demo'>
      <section className='live-renderer-hero'>
        <div>
          <span className='live-renderer-eyebrow'>{t('liveRenderer.eyebrow')}</span>
          <h2>{t('liveRenderer.title')}</h2>
          <p>{t('liveRenderer.description')}</p>
        </div>
        <div className='live-renderer-hero__actions'>
          <label>
            <span>{t('liveRenderer.language')}</span>
            <Select
              value={language}
              options={languageOptions}
              onChange={value => setLanguage(value as LiveLanguage)}
            />
          </label>
          <button
            type='button'
            onClick={() => updateSource(examples[language])}
          >
            <span className='shikitor-icon'>restart_alt</span>
            {t('liveRenderer.reset')}
          </button>
        </div>
      </section>

      <section className='live-renderer-workbench'>
        <div className='live-renderer-pane live-renderer-pane--source'>
          <header>
            <span>
              <span className='shikitor-icon'>code_blocks</span>
              {t('liveRenderer.source')}
            </span>
            <small>{t('liveRenderer.editable')}</small>
          </header>
          <WithoutCoreEditor
            create={shikitorCreate}
            value={source}
            onChange={updateSource}
            options={sourceOptions}
          />
        </div>

        <div className='live-renderer-pane live-renderer-pane--output'>
          <header>
            <span>
              <span className='shikitor-icon'>data_object</span>
              {t('liveRenderer.output')}
            </span>
            <small>
              <i />
              {t('liveRenderer.synced')}
              <b>{t('liveRenderer.readOnly')}</b>
            </small>
          </header>
          <WithoutCoreEditor
            create={shikitorCreate}
            value={source}
            options={outputOptions}
          />
        </div>
      </section>
    </div>
  )
}
