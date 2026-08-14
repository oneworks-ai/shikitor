import { describe, expect, it } from 'vitest'

import {
  findHoverPopoverRegion,
  resolveHoverPopoverMoveType,
  resolveHoverPopoverPosition
} from '../../src/plugins/hover-popover'

describe('hover popover regions', () => {
  const regions = [{ id: 'target', start: 4, end: 10, content: 'Target' }]

  it('matches offsets inside a configured fixed source range', () => {
    expect(findHoverPopoverRegion(regions, 4)?.id).toBe('target')
    expect(findHoverPopoverRegion(regions, 9)?.id).toBe('target')
    expect(findHoverPopoverRegion(regions, 10)).toBeUndefined()
  })
})

describe('hover popover event compatibility', () => {
  it('uses mousemove only when PointerEvent is unavailable', () => {
    expect(resolveHoverPopoverMoveType()).toBe('mousemove')
    expect(resolveHoverPopoverMoveType({ PointerEvent: class {} })).toBe('pointermove')
  })
})

describe('hover popover positioning', () => {
  it('clamps the popover inside the editor', () => {
    expect(resolveHoverPopoverPosition(
      { width: 300, height: 180 },
      { width: 120, height: 60 },
      { x: 260, y: 100 },
      'bottom'
    )).toEqual({ x: 172, y: 108 })
  })

  it('flips above the pointer when the bottom placement does not fit', () => {
    expect(resolveHoverPopoverPosition(
      { width: 300, height: 180 },
      { width: 120, height: 60 },
      { x: 100, y: 150 },
      'bottom'
    )).toEqual({ x: 100, y: 82 })
  })
})
