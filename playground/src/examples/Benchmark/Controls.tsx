import React from 'react'
import {
  DownloadIcon,
  PlayCircleIcon,
  RefreshIcon,
  StopCircleIcon
} from 'tdesign-icons-react'

import { useI18n } from '../../i18n'
import type {
  BenchmarkConfig,
  BenchmarkShikitorMode,
  BenchmarkSuite,
  BenchmarkView
} from './types'

interface BenchmarkControlsProps {
  config: BenchmarkConfig
  hasOutput: boolean
  running: boolean
  onChange<Key extends keyof BenchmarkConfig>(key: Key, value: BenchmarkConfig[Key]): void
  onExport(): void
  onReset(): void
  onRun(): void
  onStop(): void
}

export function BenchmarkControls({
  config,
  hasOutput,
  running,
  onChange,
  onExport,
  onReset,
  onRun,
  onStop
}: BenchmarkControlsProps) {
  const { t } = useI18n()

  return (
    <section className='benchmark-controls' aria-label={t('benchmark.configuration')}>
      <div className='benchmark-controls__fields'>
        <label>
          <span>{t('benchmark.suite')}</span>
          <select
            value={config.suite}
            disabled={running}
            onChange={event => onChange('suite', event.target.value as BenchmarkSuite)}
          >
            <option value='editor'>{t('benchmark.editor')}</option>
            <option value='diff'>{t('benchmark.diff')}</option>
          </select>
        </label>
        <label>
          <span>{t('benchmark.shikitorMode')}</span>
          <select
            value={config.shikitorMode}
            disabled={running}
            onChange={event => onChange(
              'shikitorMode',
              event.target.value as BenchmarkShikitorMode
            )}
          >
            <option value='less-dom' disabled={config.suite === 'diff'}>
              {t('benchmark.lessDom')}
            </option>
            <option value='all-dom'>{t('benchmark.allDom')}</option>
          </select>
        </label>
        <label>
          <span>{t('benchmark.lines')}</span>
          <select
            value={config.lineCount}
            disabled={running}
            onChange={event => onChange('lineCount', Number(event.target.value))}
          >
            {[100, 500, 1000, 5000, 10000].map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>{t('benchmark.changes')}</span>
          <select
            value={config.changePercent}
            disabled={running || config.suite === 'editor'}
            onChange={event => onChange('changePercent', Number(event.target.value))}
          >
            {[1, 5, 10, 20].map(value => <option key={value} value={value}>{value}%</option>)}
          </select>
        </label>
        <label>
          <span>{t('benchmark.iterations')}</span>
          <select
            value={config.iterations}
            disabled={running}
            onChange={event => onChange('iterations', Number(event.target.value))}
          >
            {[5, 10, 20, 50].map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>{t('benchmark.view')}</span>
          <select
            value={config.view}
            disabled={running || config.suite === 'editor'}
            onChange={event => onChange('view', event.target.value as BenchmarkView)}
          >
            <option value='unified'>{t('benchmark.unified')}</option>
            <option value='split'>{t('benchmark.split')}</option>
          </select>
        </label>
      </div>
      <div className='benchmark-controls__actions'>
        {running
          ? <button type='button' className='benchmark-button benchmark-button--danger' onClick={onStop}>
              <StopCircleIcon />{t('benchmark.stop')}
            </button>
          : <button type='button' className='benchmark-button benchmark-button--primary' onClick={onRun}>
              <PlayCircleIcon />{t('benchmark.run')}
            </button>}
        <button type='button' className='benchmark-button' disabled={running} onClick={onReset}>
          <RefreshIcon />{t('benchmark.reset')}
        </button>
        <button type='button' className='benchmark-button' disabled={running || !hasOutput} onClick={onExport}>
          <DownloadIcon />{t('benchmark.export')}</button>
      </div>
    </section>
  )
}
