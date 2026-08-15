import type { InputShikitorPlugin, ShikitorOptions } from '@shikitor/core'
import inlineReplacements from '@shikitor/core/plugins/inline-replacements'
import { WithoutCoreEditor } from '@shikitor/react'
import type { CSSProperties } from 'react'
import React, { useMemo, useState } from 'react'
import type { BundledTheme } from 'shiki'
import { Radio } from 'tdesign-react'

import { ComponentCase, ConfigField, ConfigOption } from '../../../components/ComponentCase'
import { useQueries } from '../../../hooks/useQueries'
import { useI18n } from '../../../i18n'
import { useShikitorCreate } from '../../../hooks/useShikitorCreate'

type Interaction = 'atomic' | 'mapped'
type CustomProperties = CSSProperties & Record<`--${string}`, string | number>

const plugins = [inlineReplacements] satisfies InputShikitorPlugin[]
const skillSource = '[$mem](skill://mem)'

function replacements(value: string, interaction: Interaction) {
  const start = value.indexOf(skillSource)
  if (start < 0) return []
  return [{
    start,
    end: start + skillSource.length,
    inlineSize: 'calc(1em + 4ch)',
    blockSize: '1em',
    interaction,
    properties: {
      class: 'demo-inline-reference',
      'data-reference-icon': 'memory',
      'data-reference-title': '$mem'
    }
  }] satisfies NonNullable<ShikitorOptions['inlineReplacements']>
}

export default function InlineReplacementsCase({ theme }: { theme: BundledTheme }) {
  const { t } = useI18n()
  const queries = useQueries<{ 'code-editor.inline.interaction': Interaction }>()
  const shikitorCreate = useShikitorCreate()
  const interaction = queries.value['code-editor.inline.interaction'] === 'mapped'
    ? 'mapped'
    : 'atomic'
  const [value, setValue] = useState(`Run ${skillSource} before deploy.`)
  const [colors, setColors] = useState({ bg: '#0d1117', fg: '#e6edf3' })
  const options = useMemo(() => ({
    theme,
    language: 'markdown' as const,
    lineNumbers: 'off' as const,
    highlightCurrentLine: false,
    hideSelfCursorUsername: true,
    inlineReplacements: replacements(value, interaction)
  }), [interaction, theme, value])

  return (
    <ComponentCase
      id='code-editor-inline-replacements'
      index='08'
      title={t('code.inline.title')}
      description={t('code.inline.description')}
      tags={['Inline', 'Interaction']}
      plugins={['inline-replacements']}
      preview={(
        <div
          className='editor-frame editor-frame--inline-replacement'
          style={{
            '--editor-bg': colors.bg || '#0d1117',
            '--editor-fg': colors.fg || '#e6edf3'
          } as CustomProperties}
        >
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
      <ConfigField
        icon='select_all'
        label={t('code.inline.interaction')}
        description={t('code.inline.interactionHelp')}
      >
        <Radio.Group
          variant='default-filled'
          value={interaction}
          options={[
            {
              label: <ConfigOption icon='widgets'>{t('code.inline.atomic')}</ConfigOption>,
              value: 'atomic'
            },
            {
              label: <ConfigOption icon='text_fields'>{t('code.inline.mapped')}</ConfigOption>,
              value: 'mapped'
            }
          ]}
          onChange={value => queries.set('code-editor.inline.interaction', value as string)}
        />
      </ConfigField>
      <div className='case-tip case-tip--inline-replacement'>
        <span className='shikitor-icon'>keyboard</span>
        {t('code.inline.hint')}
      </div>
    </ComponentCase>
  )
}
