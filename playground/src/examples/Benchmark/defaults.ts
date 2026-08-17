import { benchmarkEnginesFor } from './engines'
import type {
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkTheme
} from './types'

export function defaultResults(
  config: Pick<BenchmarkConfig, 'shikitorMode'>
) {
  return benchmarkEnginesFor(config.shikitorMode).map<BenchmarkResult>(definition => ({
    engine: definition.id,
    status: 'idle'
  }))
}

export function defaultBenchmarkConfig(theme: BenchmarkTheme): BenchmarkConfig {
  return {
    changePercent: 5,
    iterations: 20,
    lineCount: 1000,
    shikitorMode: 'less-dom',
    suite: 'editor',
    theme,
    view: 'unified'
  }
}
