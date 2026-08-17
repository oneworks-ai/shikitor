import type {
  BenchmarkConfig,
  BenchmarkDataset,
  BenchmarkResult,
  BenchmarkRunOutput
} from './types'

export function createBenchmarkOutput(
  config: BenchmarkConfig,
  dataset: BenchmarkDataset,
  results: BenchmarkResult[]
): BenchmarkRunOutput {
  return {
    config,
    dataset: { changedLines: dataset.changedLines },
    environment: {
      generatedAt: new Date().toISOString(),
      hardwareConcurrency: navigator.hardwareConcurrency,
      userAgent: navigator.userAgent
    },
    results
  }
}
