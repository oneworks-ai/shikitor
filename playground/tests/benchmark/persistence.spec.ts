import { describe, expect, it } from 'vitest'

import {
  createPersistedBenchmarkRun,
  parseBenchmarkRun
} from '../../src/examples/Benchmark/persistence'
import type { BenchmarkConfig, BenchmarkResult } from '../../src/examples/Benchmark/types'

const config: BenchmarkConfig = {
  changePercent: 5,
  iterations: 5,
  lineCount: 1000,
  shikitorMode: 'less-dom',
  suite: 'editor',
  theme: 'light',
  view: 'unified'
}

describe('benchmark persistence', () => {
  it('round-trips an automatic reload run', () => {
    const results: BenchmarkResult[] = [{ engine: 'shikitor-less-dom', status: 'idle' }]
    const run = createPersistedBenchmarkRun(config, results)

    expect(parseBenchmarkRun(JSON.stringify(run))).toEqual(run)
  })

  it('rejects stale and malformed state', () => {
    expect(parseBenchmarkRun(null)).toBeUndefined()
    expect(parseBenchmarkRun('{')).toBeUndefined()
    expect(parseBenchmarkRun(JSON.stringify({ version: 0 }))).toBeUndefined()
  })
})
