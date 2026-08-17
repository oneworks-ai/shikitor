import { describe, expect, it } from 'vitest'

import { createBenchmarkDataset } from '../../src/examples/Benchmark/dataset'

describe('benchmark dataset', () => {
  it('is deterministic and preserves the editable anchor', () => {
    const first = createBenchmarkDataset(100, 10)
    const second = createBenchmarkDataset(100, 10)

    expect(first).toEqual(second)
    expect(first.original.split('\n')).toHaveLength(100)
    expect(first.current.split('\n')).toHaveLength(100)
    expect(first.original.endsWith('// benchmark-edit-anchor:')).toBe(true)
    expect(first.current.endsWith('// benchmark-edit-anchor:')).toBe(true)
    expect(first.changedLines).toBe(9)
  })

  it('clamps unsafe inputs', () => {
    const dataset = createBenchmarkDataset(2, 120)

    expect(dataset.original.split('\n')).toHaveLength(10)
    expect(dataset.changedLines).toBe(9)
  })
})
