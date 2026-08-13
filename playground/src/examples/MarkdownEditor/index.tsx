import './index.scss'

import providePopup from '@shikitor/core/plugins/provide-popup'
import provideSelectionToolbox from '@shikitor/core/plugins/provide-selection-toolbox'
import selectionToolboxForMd from '@shikitor/core/plugins/selection-toolbox-for-md'
import { WithoutCoreEditor } from '@shikitor/react'
import React, { type CSSProperties, useMemo, useState } from 'react'
import type { BundledTheme } from 'shiki'
import { Select, Switch } from 'tdesign-react'

import { ComponentCase, ConfigField, SwitchField } from '../../components/ComponentCase'
import { useQueries } from '../../hooks/useQueries'
import { useI18n } from '../../i18n'
import { useShikitorCreate } from '../../hooks/useShikitorCreate'

type CustomProperties = CSSProperties & Record<`--${string}`, string | number>

const initialMarkdown = `# Ship better editing experiences

Shikitor combines **Shiki rendering** with a small, composable editor core.

- Native syntax highlighting
- Cordis-powered plugins
- Contextual Markdown tools

Select some text to open the formatting toolbox.`

export default function MarkdownEditor() {
  const { t } = useI18n()
  const queries = useQueries<{
    'markdown-editor.authoring.theme': BundledTheme
    'markdown-editor.authoring.line-numbers': string
    'markdown-editor.authoring.toolbox': string
  }>()
  const shikitorCreate = useShikitorCreate()
  const theme = queries.value['markdown-editor.authoring.theme'] ?? 'github-light'
  const lineNumbers = queries.value['markdown-editor.authoring.line-numbers'] === 'true'
  const toolbox = queries.value['markdown-editor.authoring.toolbox'] !== 'false'
  const [value, setValue] = useState(initialMarkdown)
  const [colors, setColors] = useState({ bg: '#fff', fg: '#24292f' })
  const plugins = useMemo(() => toolbox
    ? [providePopup, provideSelectionToolbox, selectionToolboxForMd]
    : [providePopup], [toolbox])
  const options = useMemo(() => ({
    language: 'markdown' as const,
    theme,
    lineNumbers: lineNumbers ? 'on' as const : 'off' as const,
    placeholder: 'Write in Markdown…'
  }), [lineNumbers, theme])

  return (
    <div className='markdown-editor-examples'>
      <ComponentCase
        id='markdown-editor-authoring'
        index='01'
        title={t('markdown.title')}
        description={t('markdown.description')}
        tags={['Markdown', 'Plugin']}
        preview={(
          <div
            className='markdown-editor-frame'
            style={{
              '--editor-bg': colors.bg || '#fff',
              '--editor-fg': colors.fg || '#24292f'
            } as CustomProperties}
          >
            <div className='markdown-editor-frame__toolbar'>
              <span className='shikitor-icon'>title</span>
              <span className='shikitor-icon'>format_bold</span>
              <span className='shikitor-icon'>format_italic</span>
              <span className='markdown-editor-frame__divider' />
              <span className='shikitor-icon'>link</span>
              <span className='shikitor-icon'>format_list_bulleted</span>
              <small>{t('markdown.selectHint')}</small>
            </div>
            <WithoutCoreEditor
              create={shikitorCreate}
              value={value}
              onChange={setValue}
              options={options}
              plugins={plugins}
              onColorChange={setColors}
            />
          </div>
        )}
      >
        <ConfigField label={t('markdown.theme')} description={t('markdown.themeHelp')}>
          <Select
            value={theme}
            options={[
              { label: 'GitHub Light', value: 'github-light' },
              { label: 'GitHub Dark', value: 'github-dark' },
              { label: 'Vitesse Light', value: 'vitesse-light' },
              { label: 'Vitesse Dark', value: 'vitesse-dark' }
            ]}
            onChange={value => queries.set('markdown-editor.authoring.theme', value as string)}
          />
        </ConfigField>
        <SwitchField label={t('code.lineNumbers')} description={t('markdown.lineNumbersHelp')}>
          <Switch
            size='small'
            value={lineNumbers}
            onChange={value => queries.set('markdown-editor.authoring.line-numbers', String(value))}
          />
        </SwitchField>
        <SwitchField label={t('markdown.toolbox')} description={t('markdown.toolboxHelp')}>
          <Switch
            size='small'
            value={toolbox}
            onChange={value => queries.set('markdown-editor.authoring.toolbox', String(value))}
          />
        </SwitchField>
      </ComponentCase>
    </div>
  )
}
