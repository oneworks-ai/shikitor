export type LowerIsBetterComparison = 'better' | 'equal' | 'worse'

export interface BenchmarkComparison {
  percent: number
  state: LowerIsBetterComparison
}

export function compareLowerIsBetter(
  value?: number,
  baseline?: number
): BenchmarkComparison | undefined {
  if (value === undefined || baseline === undefined) return undefined
  if (Object.is(value, baseline)) return { percent: 0, state: 'equal' }
  if (baseline === 0) return undefined
  return {
    percent: Math.abs(value - baseline) / Math.abs(baseline) * 100,
    state: value < baseline ? 'better' : 'worse'
  }
}
