import type { ShikitorOptions } from '@shikitor/core'
import { WithoutCoreEditor } from '@shikitor/react'
import type { CSSProperties } from 'react'
import React, { useMemo, useState } from 'react'
import type { BundledTheme } from 'shiki'
import { ColorPicker, Switch } from 'tdesign-react'

import {
  ComponentCase,
  ConfigField,
  SwitchField
} from '../../../components/ComponentCase'
import { useQueries } from '../../../hooks/useQueries'
import { useI18n } from '../../../i18n'
import { useShikitorCreate } from '../../../hooks/useShikitorCreate'

type CustomProperties = CSSProperties & Record<`--${string}`, string | number>

const initialValue = `type ReviewStatus = 'draft' | 'approved'
const reviews = getReviews()
const visible = reviews.filter(review => review.status === 'draft')

for (const review of visible) {
  queueReview(review)
}

export { visible }`

function wordRanges(value: string, words: string[]) {
  return words.flatMap(word => {
    const start = value.indexOf(word)
    return start < 0 ? [] : [{ start, end: start + word.length }]
  })
}

export default function HighlightsCase({ theme }: { theme: BundledTheme }) {
  const { t } = useI18n()
  const queries = useQueries<{
    'code-editor.highlights.line-enabled': string
    'code-editor.highlights.line-color': string
    'code-editor.highlights.range-enabled': string
    'code-editor.highlights.range-color': string
  }>()
  const shikitorCreate = useShikitorCreate()
  const lineEnabled = queries.value['code-editor.highlights.line-enabled'] !== 'false'
  const rangeEnabled = queries.value['code-editor.highlights.range-enabled'] !== 'false'
  const lineColor = queries.value['code-editor.highlights.line-color']
    ?? 'rgba(245, 158, 11, 0.2)'
  const rangeColor = queries.value['code-editor.highlights.range-color']
    ?? 'rgba(124, 108, 242, 0.32)'
  const [value, setValue] = useState(initialValue)
  const [colors, setColors] = useState({ bg: '#0d1117', fg: '#e6edf3' })
  const options = useMemo<ShikitorOptions>(() => ({
    theme,
    language: 'typescript',
    highlightCurrentLine: false,
    hideSelfCursorUsername: true,
    highlights: [
      lineEnabled && {
        color: lineColor,
        lines: [2, { start: 5, end: 7 }, 9],
        className: 'demo-source-line-highlight'
      },
      rangeEnabled && {
        color: rangeColor,
        ranges: wordRanges(value, ['draft', 'review.status', 'queueReview']),
        className: 'demo-source-range-highlight'
      }
    ].filter(Boolean) as ShikitorOptions['highlights']
  }), [lineColor, lineEnabled, rangeColor, rangeEnabled, theme, value])

  return (
    <ComponentCase
      id='code-editor-highlights'
      index='08'
      title={t('code.highlights.title')}
      description={t('code.highlights.description')}
      tags={['Decoration', 'Range']}
      preview={(
        <div
          className='editor-frame editor-frame--highlights'
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
            onColorChange={setColors}
          />
        </div>
      )}
    >
      <SwitchField
        icon='view_agenda'
        label={t('code.highlights.lines')}
        description={t('code.highlights.linesHelp')}
      >
        <Switch
          size='small'
          value={lineEnabled}
          onChange={value => queries.set('code-editor.highlights.line-enabled', String(value))}
        />
      </SwitchField>
      <ConfigField
        icon='view_agenda'
        label={t('code.highlights.lineColor')}
        description={t('code.highlights.lineColorHelp')}
        value={lineColor}
      >
        <ColorPicker
          value={lineColor}
          enableAlpha
          format='RGBA'
          colorModes={['monochrome']}
          onChange={value => queries.set('code-editor.highlights.line-color', value)}
        />
      </ConfigField>
      <SwitchField
        icon='ink_highlighter'
        label={t('code.highlights.ranges')}
        description={t('code.highlights.rangesHelp')}
      >
        <Switch
          size='small'
          value={rangeEnabled}
          onChange={value => queries.set('code-editor.highlights.range-enabled', String(value))}
        />
      </SwitchField>
      <ConfigField
        icon='ink_highlighter'
        label={t('code.highlights.rangeColor')}
        description={t('code.highlights.rangeColorHelp')}
        value={rangeColor}
      >
        <ColorPicker
          value={rangeColor}
          enableAlpha
          format='RGBA'
          colorModes={['monochrome']}
          onChange={value => queries.set('code-editor.highlights.range-color', value)}
        />
      </ConfigField>
      <div className='case-tip'>
        <span className='shikitor-icon'>select_all</span>
        {t('code.highlights.hint')}
      </div>
    </ComponentCase>
  )
}
