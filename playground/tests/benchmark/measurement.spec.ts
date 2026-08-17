import { describe, expect, test } from 'vitest'

import {
  calculateTotalBlockingTime,
  firstUsableDuration,
  phaseDuration
} from '../../src/examples/Benchmark/measurement'

describe('benchmark lifecycle measurement', () => {
  test('derives non-overlapping phase durations from cumulative milestones', () => {
    expect(phaseDuration(58, 20)).toBe(38)
    expect(phaseDuration(18, 20)).toBe(0)
    expect(phaseDuration(undefined, 20)).toBeUndefined()
  })

  test('includes deferred module work in cold first usable syntax', () => {
    expect(firstUsableDuration(50.8, 133.8)).toBeCloseTo(184.6)
    expect(firstUsableDuration(undefined, 133.8)).toBeUndefined()
    expect(firstUsableDuration(50.8, undefined)).toBeUndefined()
  })

  test('uses the Web Vitals long-task blocking definition', () => {
    expect(calculateTotalBlockingTime([
      { duration: 40, startTime: 0 },
      { duration: 90, startTime: 50 },
      { duration: 70, startTime: 180 }
    ], 0, 200)).toBe(40)
    expect(calculateTotalBlockingTime([
      { duration: 120, startTime: 0 }
    ], 80, 130)).toBe(40)
    expect(calculateTotalBlockingTime([
      { duration: 120, startTime: 0 }
    ], 0, 75)).toBe(25)
  })
})
