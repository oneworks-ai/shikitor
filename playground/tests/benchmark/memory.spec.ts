import { describe, expect, test } from 'vitest'

import { calculateMemoryDelta } from '../../src/examples/Benchmark/memory'

describe('benchmark memory measurement', () => {
  test('preserves the measured signed delta', () => {
    expect(calculateMemoryDelta(10, 25)).toBe(15)
    expect(calculateMemoryDelta(25, 10)).toBe(-15)
    expect(calculateMemoryDelta(10, 10)).toBe(0)
  })

  test('does not fabricate a value from an unavailable sample', () => {
    expect(calculateMemoryDelta(undefined, 10)).toBeUndefined()
    expect(calculateMemoryDelta(10, undefined)).toBeUndefined()
  })
})
