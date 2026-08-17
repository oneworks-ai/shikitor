import React, { useMemo } from 'react'
import type { ReactNode } from 'react'

import { useI18n } from '../../i18n'
import { compareLowerIsBetter } from './comparison'
import { benchmarkEnginesFor, shikitorEngineId } from './engines'
import { phaseDuration } from './measurement'
import type {
  BenchmarkResult,
  BenchmarkShikitorMode,
  BenchmarkSuite
} from './types'

function formatMilliseconds(value?: number) {
  if (value === undefined) return '—'
  return `${value < 10 ? value.toFixed(2) : value.toFixed(1)} ms`
}

function formatBytes(value?: number) {
  if (value === undefined) return '—'
  if (value < 1024) return `${value.toFixed(0)} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(2)} MB`
}

function formatMemoryDelta(value?: number) {
  if (value === undefined) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatBytes(Math.abs(value))}`
}

function formatOperation(value?: number) {
  if (value === undefined) return '—'
  if (value < 1) return `${(value * 1000).toFixed(value < .01 ? 2 : 1)} μs`
  return formatMilliseconds(value)
}

function formatPercent(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : '∞'
}

function SyntaxProfileDetail({
  profile
}: {
  profile?: BenchmarkResult['syntaxProfileCold']
}) {
  const { t } = useI18n()
  if (!profile) return null
  if (profile.cacheHit) return <small>{t('benchmark.cached')}</small>
  const viewport = profile.viewport
  const complete = profile.complete
  if (!viewport || !complete) return null
  const label = t('benchmark.syntaxProfileSummary', {
    completeBridge: formatMilliseconds(complete.bridgeMs),
    completeHydrate: formatMilliseconds(complete.hydrateMs),
    completeLines: complete.serializedLines,
    completeSerialize: formatMilliseconds(complete.serializeMs),
    completeSetup: formatMilliseconds(complete.setupMs),
    completeTokenize: formatMilliseconds(complete.tokenizeMs),
    completeWorker: formatMilliseconds(complete.workerMs),
    viewportBridge: formatMilliseconds(viewport.bridgeMs),
    viewportHydrate: formatMilliseconds(viewport.hydrateMs),
    viewportLines: viewport.serializedLines,
    viewportSerialize: formatMilliseconds(viewport.serializeMs),
    viewportSetup: formatMilliseconds(viewport.setupMs),
    viewportTokenize: formatMilliseconds(viewport.tokenizeMs),
    viewportWorker: formatMilliseconds(viewport.workerMs)
  })
  return <small className='benchmark-syntax-profile' title={label}>{label}</small>
}

function MetricCell({
  baseline,
  detail,
  format,
  shouldCompare,
  value
}: {
  baseline?: number
  detail?: ReactNode
  format(value?: number): ReactNode
  shouldCompare: boolean
  value?: number
}) {
  const { t } = useI18n()
  const comparison = shouldCompare
    ? compareLowerIsBetter(value, baseline)
    : undefined
  const label = comparison && t(`benchmark.comparison.${comparison.state}`, {
    percent: formatPercent(comparison.percent)
  })

  return (
    <td
      className={comparison ? `benchmark-metric benchmark-metric--${comparison.state}` : undefined}
      data-comparison={comparison?.state}
    >
      {format(value)}
      {detail}
      {label && <small className='benchmark-comparison'>{label}</small>}
    </td>
  )
}

function PhaseDetail({ current, previous }: { current?: number, previous?: number }) {
  const { t } = useI18n()
  const duration = phaseDuration(current, previous)
  if (duration === undefined) return null
  return <small>{t('benchmark.phaseNet', { duration: formatMilliseconds(duration) })}</small>
}

export function BenchmarkResults({
  changedLines,
  results,
  shikitorMode,
  suite
}: {
  changedLines?: number
  results: BenchmarkResult[]
  shikitorMode: BenchmarkShikitorMode
  suite: BenchmarkSuite
}) {
  const { t } = useI18n()
  const resultMap = useMemo(() => new Map(results.map(result => [result.engine, result])), [results])
  const engines = benchmarkEnginesFor(shikitorMode)
  const baselineId = shikitorEngineId(shikitorMode)
  const baseline = resultMap.get(baselineId)

  return (
    <section className='benchmark-results'>
      <header>
        <div>
          <strong>{t('benchmark.results')}</strong>
          {changedLines !== undefined && <span>{t('benchmark.changedLines', { count: changedLines })}</span>}
        </div>
        <span>{t('benchmark.lowerIsBetter')}</span>
      </header>
      <div className='benchmark-results__scroll'>
        <table>
          <thead><tr>
            <th>{t('benchmark.engine')}</th>
            <th>{t('benchmark.module')}</th>
            <th>{t('benchmark.firstUsableCold')}</th>
            <th>{t('benchmark.shellCold')}</th>
            <th>{t('benchmark.firstPaintCold')}</th>
            <th>{t('benchmark.syntaxViewportCold')}</th>
            <th>{t('benchmark.syntaxFullCold')}</th>
            <th>{t('benchmark.blockingCold')}</th>
            <th>{t('benchmark.shellWarm')}</th>
            <th>{t('benchmark.firstPaintWarm')}</th>
            <th>{t('benchmark.syntaxViewportWarm')}</th>
            <th>{t('benchmark.syntaxFullWarm')}</th>
            <th>{t('benchmark.blockingWarm')}</th>
            <th>{t('benchmark.sdkSize')}</th>
            <th>{t('benchmark.editP50')}</th>
            <th>{t('benchmark.editP95')}</th>
            <th>{t('benchmark.scroll')}</th>
            <th>{t('benchmark.nodes')}</th>
            <th>{t('benchmark.heap')}</th>
          </tr></thead>
          <tbody>
            {engines.map(definition => {
              const result = resultMap.get(definition.id)!
              const available = definition.suites.includes(suite)
              const shouldCompare = definition.id !== baselineId && baseline?.status === 'complete'
              return (
                <tr key={definition.id} data-status={result.status}>
                  <th scope='row'>
                    <span className='benchmark-engine-dot' />
                    <span>
                      <strong>{definition.label}</strong>
                      <small>
                        {definition.note}
                        {result.renderer ? ` · ${result.renderer}` : ''}
                      </small>
                    </span>
                  </th>
                  {!available || result.status === 'unsupported'
                    ? <td colSpan={18} className='benchmark-results__message'>
                        {result.error ?? t('benchmark.unavailable')}
                      </td>
                    : result.status === 'error'
                      ? <td colSpan={18} className='benchmark-results__message'>{result.error}</td>
                      : <>
                          <MetricCell
                            baseline={baseline?.moduleLoad}
                            value={result.moduleLoad}
                            format={formatMilliseconds}
                            shouldCompare={shouldCompare}
                            detail={result.moduleLoad !== undefined && (
                              <small>{t(result.moduleCached ? 'benchmark.cached' : 'benchmark.fresh')}</small>
                            )}
                          />
                          <MetricCell
                            baseline={baseline?.firstUsableCold}
                            value={result.firstUsableCold}
                            format={formatMilliseconds}
                            shouldCompare={shouldCompare}
                            detail={<SyntaxProfileDetail profile={result.syntaxProfileCold} />}
                          />
                          <MetricCell baseline={baseline?.shellReadyCold} value={result.shellReadyCold}
                            format={formatMilliseconds} shouldCompare={shouldCompare} />
                          <MetricCell baseline={baseline?.firstPaintCold}
                            value={result.firstPaintCold} format={formatMilliseconds}
                            shouldCompare={shouldCompare}
                            detail={<PhaseDetail current={result.firstPaintCold}
                              previous={result.shellReadyCold} />} />
                          <MetricCell baseline={baseline?.viewportSyntaxCold}
                            value={result.viewportSyntaxCold} format={formatMilliseconds}
                            shouldCompare={shouldCompare}
                            detail={<PhaseDetail current={result.viewportSyntaxCold}
                              previous={result.firstPaintCold} />} />
                          <MetricCell baseline={baseline?.fullSyntaxCold}
                            value={result.fullSyntaxCold} format={formatMilliseconds}
                            shouldCompare={shouldCompare}
                            detail={<PhaseDetail current={result.fullSyntaxCold}
                              previous={result.viewportSyntaxCold ?? result.firstPaintCold} />} />
                          <MetricCell baseline={baseline?.mainThreadBlockingCold}
                            value={result.mainThreadBlockingCold} format={formatMilliseconds}
                            shouldCompare={shouldCompare} />
                          <MetricCell baseline={baseline?.shellReadyWarm} value={result.shellReadyWarm}
                            format={formatMilliseconds} shouldCompare={shouldCompare} />
                          <MetricCell baseline={baseline?.firstPaintWarm}
                            value={result.firstPaintWarm} format={formatMilliseconds}
                            shouldCompare={shouldCompare}
                            detail={<PhaseDetail current={result.firstPaintWarm}
                              previous={result.shellReadyWarm} />} />
                          <MetricCell baseline={baseline?.viewportSyntaxWarm}
                            value={result.viewportSyntaxWarm} format={formatMilliseconds}
                            shouldCompare={shouldCompare}
                            detail={<PhaseDetail current={result.viewportSyntaxWarm}
                              previous={result.firstPaintWarm} />} />
                          <MetricCell baseline={baseline?.fullSyntaxWarm}
                            value={result.fullSyntaxWarm} format={formatMilliseconds}
                            shouldCompare={shouldCompare}
                            detail={<PhaseDetail current={result.fullSyntaxWarm}
                              previous={result.viewportSyntaxWarm ?? result.firstPaintWarm} />} />
                          <MetricCell baseline={baseline?.mainThreadBlockingWarm}
                            value={result.mainThreadBlockingWarm} format={formatMilliseconds}
                            shouldCompare={shouldCompare} />
                          <MetricCell
                            baseline={baseline?.sdkEncodedBytes}
                            value={result.sdkEncodedBytes}
                            format={formatBytes}
                            shouldCompare={shouldCompare}
                            detail={result.sdkDecodedBytes !== undefined && (
                              <small>
                                {t('benchmark.sdkDecoded', {
                                  size: formatBytes(result.sdkDecodedBytes)
                                })}
                              </small>
                            )}
                          />
                          <MetricCell baseline={baseline?.editP50} value={result.editP50}
                            format={formatMilliseconds} shouldCompare={shouldCompare} />
                          <MetricCell baseline={baseline?.editP95} value={result.editP95}
                            format={formatMilliseconds} shouldCompare={shouldCompare} />
                          <MetricCell baseline={baseline?.scroll} value={result.scroll}
                            format={formatMilliseconds} shouldCompare={shouldCompare} />
                          <MetricCell baseline={baseline?.domNodes} value={result.domNodes}
                            format={value => value?.toLocaleString() ?? '—'}
                            shouldCompare={shouldCompare} />
                          <MetricCell
                            baseline={baseline?.memoryDelta}
                            value={result.memoryDelta}
                            format={formatMemoryDelta}
                            shouldCompare={shouldCompare
                              && (baseline?.memoryDelta ?? 0) > 0
                              && (result.memoryDelta ?? -1) >= 0}
                            detail={result.memoryDelta === undefined && (
                              <small>{t('benchmark.memoryUnavailable')}</small>
                            )}
                          />
                        </>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <header className='benchmark-results__subheader'>
        <div>
          <strong>{t('benchmark.nativeResults')}</strong>
          <span>{t('benchmark.nativeDescription')}</span>
        </div>
      </header>
      <div className='benchmark-results__scroll'>
        <table className='benchmark-results__native'>
          <thead><tr>
            <th>{t('benchmark.engine')}</th>
            <th>{t('benchmark.valueRead')}</th>
            <th>{t('benchmark.selectionUpdate')}</th>
            <th>{t('benchmark.replaceValue')}</th>
            <th>{t('benchmark.nativeTextarea')}</th>
          </tr></thead>
          <tbody>
            {engines.map(definition => {
              const result = resultMap.get(definition.id)!
              const shouldCompare = definition.id !== baselineId && baseline?.status === 'complete'
              return (
                <tr key={definition.id} data-status={result.status}>
                  <th scope='row'>
                    <span className='benchmark-engine-dot' />
                    <span><strong>{definition.label}</strong></span>
                  </th>
                  {result.status !== 'complete'
                    ? <td colSpan={4} className='benchmark-results__message'>
                        {result.error ?? t('benchmark.unavailable')}
                      </td>
                    : <>
                        <MetricCell baseline={baseline?.valueRead} value={result.valueRead}
                          format={formatOperation} shouldCompare={shouldCompare} />
                        <MetricCell baseline={baseline?.selectionUpdate}
                          value={result.selectionUpdate} format={formatOperation}
                          shouldCompare={shouldCompare} />
                        <MetricCell baseline={baseline?.replaceValue} value={result.replaceValue}
                          format={formatOperation} shouldCompare={shouldCompare} />
                        <td>{result.nativeTextarea === undefined
                          ? '—'
                          : t(result.nativeTextarea ? 'benchmark.yes' : 'benchmark.no')}</td>
                      </>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
