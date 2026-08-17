import { describe, expect, test } from 'vitest'

import { compareLowerIsBetter } from '../../src/examples/Benchmark/comparison'
import { benchmarkEnginesFor } from '../../src/examples/Benchmark/engines'

describe('benchmark comparison', () => {
  test('reports a lower competitor value as better', () => {
    expect(compareLowerIsBetter(50, 100)).toEqual({
      percent: 50,
      state: 'better'
    })
  })

  test('reports a higher competitor value as worse', () => {
    expect(compareLowerIsBetter(150, 100)).toEqual({
      percent: 50,
      state: 'worse'
    })
  })

  test('does not fabricate a relative delta from a zero baseline', () => {
    expect(compareLowerIsBetter(0, 0)).toEqual({ percent: 0, state: 'equal' })
    expect(compareLowerIsBetter(1, 0)).toBeUndefined()
    expect(compareLowerIsBetter(undefined, 10)).toBeUndefined()
  })

  test('keeps only the selected Shikitor mode beside competitor engines', () => {
    const lessDomIds = benchmarkEnginesFor('less-dom').map(engine => engine.id)
    const allDomIds = benchmarkEnginesFor('all-dom').map(engine => engine.id)

    expect(lessDomIds).toContain('shikitor-less-dom')
    expect(lessDomIds).not.toContain('shikitor-all-dom')
    expect(allDomIds).toContain('shikitor-all-dom')
    expect(allDomIds).not.toContain('shikitor-less-dom')
    expect(lessDomIds).toContain('monaco-shiki')
    expect(lessDomIds.filter(id => !id.startsWith('shikitor-'))).toEqual(
      allDomIds.filter(id => !id.startsWith('shikitor-'))
    )
  })
})
