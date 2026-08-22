import { describe, expect, it } from 'vitest'

import { resolveMaterializationWindow } from '../../src/creator/controlled/materialization'

describe('materialization window', () => {
  const tops = (count: number, height = 20) => (row: number) => row * height

  it('covers the viewport plus overscan', () => {
    expect(resolveMaterializationWindow(100, tops(100), 0, 200, 40)).toEqual({ first: 0, last: 12 })
    expect(resolveMaterializationWindow(100, tops(100), 1000, 200, 40)).toEqual({ first: 48, last: 62 })
    expect(resolveMaterializationWindow(100, tops(100), 1990, 200, 40)).toEqual({ first: 97, last: 100 })
  })

  it('keeps the row that overlaps the lower edge', () => {
    // Row 49 starts at 980 and still covers 990 (scrollTop 1030 - overscan 40).
    expect(resolveMaterializationWindow(100, tops(100), 1030, 100, 40).first).toBe(49)
  })

  it('handles irregular row positions from hidden lines and widgets', () => {
    const positions = [0, 20, 40, 120, 140, 400, 420]
    const result = resolveMaterializationWindow(positions.length, row => positions[row], 110, 60, 0)
    expect(result).toEqual({ first: 2, last: 5 })
  })

  it('returns an empty window without rows', () => {
    expect(resolveMaterializationWindow(0, tops(0), 0, 100, 10)).toEqual({ first: 0, last: 0 })
  })
})
