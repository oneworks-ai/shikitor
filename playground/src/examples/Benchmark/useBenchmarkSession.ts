import { useEffect, useRef, useState } from 'react'

import { createBenchmarkDataset } from './dataset'
import { defaultBenchmarkConfig, defaultResults } from './defaults'
import { benchmarkEnginesFor } from './engines'
import {
  createPersistedBenchmarkRun,
  readBenchmarkRun,
  writeBenchmarkRun
} from './persistence'
import type { PersistedBenchmarkRun } from './persistence'
import { runBenchmarkEngine } from './runner'
import type {
  BenchmarkConfig,
  BenchmarkDataset,
  BenchmarkProgress,
  BenchmarkResult,
  BenchmarkStatus,
  BenchmarkTheme
} from './types'
import { useBenchmarkPageRecovery } from './useBenchmarkPageRecovery'

interface CompletedRun {
  config: BenchmarkConfig
  dataset: BenchmarkDataset
  results: BenchmarkResult[]
}

export function useBenchmarkSession(theme: BenchmarkTheme) {
  const initialRef = useRef<{ run?: PersistedBenchmarkRun }>()
  if (!initialRef.current) {
    initialRef.current = { run: readBenchmarkRun(theme) }
  }
  const initial = initialRef.current.run
  const initialConfig = initial?.config ?? defaultBenchmarkConfig(theme)
  const stageRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController>()
  const executeRef = useRef<(run: PersistedBenchmarkRun) => Promise<void>>()
  const stopRequestedRef = useRef(false)
  const themeRef = useRef(theme)
  const [config, setConfig] = useState(initialConfig)
  const [results, setResults] = useState(
    initial?.results ?? defaultResults(initialConfig)
  )
  const [progress, setProgress] = useState<BenchmarkProgress>({
    completed: initial?.nextIndex ?? 0,
    total: benchmarkEnginesFor(initialConfig.shikitorMode).length
  })
  const [runStatus, setRunStatus] = useState<BenchmarkStatus>(
    initial?.status ?? 'idle'
  )
  const [lastRun, setLastRun] = useState<CompletedRun | undefined>(() => (
    initial && initial.status !== 'running'
      ? {
          config: initial.config,
          dataset: createBenchmarkDataset(
            initial.config.lineCount,
            initial.config.changePercent
          ),
          results: initial.results
        }
      : undefined
  ))
  const clearResults = (nextConfig: BenchmarkConfig = config) => {
    stopRequestedRef.current = true
    writeBenchmarkRun()
    abortRef.current?.abort()
    setResults(defaultResults(nextConfig))
    setLastRun(undefined)
    setRunStatus('idle')
    setProgress({
      completed: 0,
      total: benchmarkEnginesFor(nextConfig.shikitorMode).length
    })
  }
  const execute = async (run: PersistedBenchmarkRun) => {
    const stage = stageRef.current
    if (!stage || abortRef.current) return
    const runEngines = benchmarkEnginesFor(run.config.shikitorMode)
    const definition = runEngines[run.nextIndex]
    if (!definition) return
    const dataset = createBenchmarkDataset(
      run.config.lineCount,
      run.config.changePercent
    )
    const controller = new AbortController()
    abortRef.current = controller
    stopRequestedRef.current = false
    const activeResults = run.results.map(result => (
      result.engine === definition.id
        ? { engine: definition.id, status: 'running' as const }
        : result
    ))
    const activeRun = { ...run, results: activeResults }
    writeBenchmarkRun(activeRun)
    setResults(activeResults)
    setRunStatus('running')
    let shouldReload = false
    try {
      const onProgress = (phase: BenchmarkProgress['phase']) => setProgress({
        completed: run.nextIndex,
        engine: definition.id,
        phase,
        total: runEngines.length
      })
      onProgress('load')
      const result = await runBenchmarkEngine({
        config: run.config,
        dataset,
        definition,
        signal: controller.signal,
        stage,
        onProgress
      })
      const nextResults = [...activeResults]
      nextResults[run.nextIndex] = result
      const nextIndex = run.nextIndex + 1
      const finished = nextIndex >= runEngines.length
      const status = finished
        ? nextResults.some(item => item.status === 'error') ? 'error' : 'complete'
        : 'running'
      const nextRun: PersistedBenchmarkRun = {
        ...run,
        nextIndex,
        results: nextResults,
        status
      }
      writeBenchmarkRun(nextRun)
      setResults(nextResults)
      setProgress({ completed: nextIndex, total: runEngines.length })
      setRunStatus(status)
      if (finished) setLastRun({ config: run.config, dataset, results: nextResults })
      else shouldReload = true
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error
      if (stopRequestedRef.current) {
        writeBenchmarkRun()
        setResults(current => current.map(result => result.status === 'running'
          ? { engine: result.engine, status: 'idle' }
          : result))
        setRunStatus('idle')
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = undefined
      stage.replaceChildren()
    }
    if (shouldReload && !controller.signal.aborted) location.reload()
  }
  executeRef.current = execute
  useEffect(() => {
    if (initial?.status === 'running') void executeRef.current?.(initial)
  }, [])
  useEffect(() => {
    if (themeRef.current === theme) return
    themeRef.current = theme
    const nextConfig = { ...config, theme }
    setConfig(nextConfig)
    clearResults(nextConfig)
  }, [theme])
  useBenchmarkPageRecovery(abortRef)
  const changeConfig = <Key extends keyof BenchmarkConfig>(
    key: Key,
    value: BenchmarkConfig[Key]
  ) => {
    const nextConfig = {
      ...config,
      [key]: value,
      ...(key === 'suite' && value === 'diff'
        ? { shikitorMode: 'all-dom' as const }
        : {})
    }
    setConfig(nextConfig)
    clearResults(nextConfig)
  }
  const run = () => {
    const nextResults = defaultResults(config)
    const nextRun = createPersistedBenchmarkRun({ ...config }, nextResults)
    writeBenchmarkRun(nextRun)
    setResults(nextResults)
    setLastRun(undefined)
    setRunStatus('running')
    void executeRef.current?.(nextRun)
  }
  return {
    changeConfig,
    clearResults,
    config,
    lastRun,
    progress,
    results,
    run,
    runStatus,
    stageRef,
    stop: clearResults
  }
}
