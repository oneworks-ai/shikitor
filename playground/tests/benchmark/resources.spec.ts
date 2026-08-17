import { describe, expect, test } from 'vitest'

import { summarizeResourceUsage } from '../../src/examples/Benchmark/resources'

describe('benchmark resource usage', () => {
  test('sums transfer and decoded costs independently', () => {
    expect(summarizeResourceUsage([
      { decodedBodySize: 1200, encodedBodySize: 400, transferSize: 520 },
      { decodedBodySize: 800, encodedBodySize: 300, transferSize: 0 }
    ])).toEqual({
      decoded: 2000,
      encoded: 700,
      resources: 2,
      transfer: 520
    })
  })
})
