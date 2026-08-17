import './index.scss'

import React from 'react'
import { PlayCircleIcon } from 'tdesign-icons-react'

import { useQueries } from '../../hooks/useQueries'
import { useI18n } from '../../i18n'
import { BenchmarkControls } from './Controls'
import { BenchmarkResults } from './Results'
import { benchmarkEngines } from './engines'
import { createBenchmarkOutput } from './output'
import type { BenchmarkRunOutput, BenchmarkTheme } from './types'
import { useBenchmarkSession } from './useBenchmarkSession'

function downloadOutput(output: BenchmarkRunOutput) {
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.download = `shikitor-benchmark-${Date.now()}.json`
  anchor.href = url
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function Benchmark() {
  const { t } = useI18n()
  const { value: query } = useQueries<{ theme: 'dark' | 'light' }>()
  const theme: BenchmarkTheme = query.theme === 'dark' ? 'dark' : 'light'
  const session = useBenchmarkSession(theme)
  const {
    changeConfig,
    clearResults,
    config,
    lastRun,
    progress,
    results,
    run,
    runStatus,
    stageRef,
    stop
  } = session

  const stageStatus = progress.engine
    ? `${benchmarkEngines.find(engine => engine.id === progress.engine)?.label} · ${t(`benchmark.phase.${progress.phase}`)}`
    : t(`benchmark.status.${runStatus}`)
  const exportResults = () => {
    if (!lastRun) return
    downloadOutput(createBenchmarkOutput(lastRun.config, lastRun.dataset, lastRun.results))
  }

  return (
    <div className='benchmark-demo'>
      <BenchmarkControls
        config={config}
        hasOutput={Boolean(lastRun)}
        running={runStatus === 'running'}
        onChange={changeConfig}
        onExport={exportResults}
        onReset={clearResults}
        onRun={run}
        onStop={stop}
      />
      <section className='benchmark-stage'>
        <header>
          <strong>{t('benchmark.stage')}</strong>
          <span className={`benchmark-status benchmark-status--${runStatus}`}>{stageStatus}</span>
          <span>{progress.completed} / {progress.total}</span>
        </header>
        <div className='benchmark-stage__viewport'>
          <div className='benchmark-stage__mount' ref={stageRef} />
          {runStatus !== 'running' && <div className='benchmark-stage__empty'>
            <PlayCircleIcon />
            <strong>{t('benchmark.emptyTitle')}</strong>
            <span>{t('benchmark.emptyDescription')}</span>
          </div>}
        </div>
      </section>
      <BenchmarkResults
        changedLines={lastRun?.dataset.changedLines}
        shikitorMode={config.shikitorMode}
        results={results}
        suite={config.suite}
      />
      <p className='benchmark-methodology'>{t('benchmark.methodology')}</p>
    </div>
  )
}
