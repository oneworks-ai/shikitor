import type {
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkStatus
} from './types'

const STORAGE_KEY = 'shikitor-benchmark-run-v1'
const STORAGE_VERSION = 1

export interface PersistedBenchmarkRun {
  config: BenchmarkConfig
  nextIndex: number
  results: BenchmarkResult[]
  status: Extract<BenchmarkStatus, 'complete' | 'error' | 'running'>
  version: typeof STORAGE_VERSION
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseBenchmarkRun(value: string | null): PersistedBenchmarkRun | undefined {
  if (!value) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      !isRecord(parsed)
      || parsed.version !== STORAGE_VERSION
      || !isRecord(parsed.config)
      || !Array.isArray(parsed.results)
      || typeof parsed.nextIndex !== 'number'
      || !['complete', 'error', 'running'].includes(String(parsed.status))
    ) return undefined
    return parsed as unknown as PersistedBenchmarkRun
  } catch {
    return undefined
  }
}

export function readBenchmarkRun(theme: BenchmarkConfig['theme']) {
  const run = parseBenchmarkRun(sessionStorage.getItem(STORAGE_KEY))
  if (!run || run.config.theme !== theme) return undefined
  return run
}

export function writeBenchmarkRun(run?: PersistedBenchmarkRun) {
  if (!run) sessionStorage.removeItem(STORAGE_KEY)
  else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(run))
}

export function createPersistedBenchmarkRun(
  config: BenchmarkConfig,
  results: BenchmarkResult[]
): PersistedBenchmarkRun {
  return {
    config,
    nextIndex: 0,
    results,
    status: 'running',
    version: STORAGE_VERSION
  }
}
