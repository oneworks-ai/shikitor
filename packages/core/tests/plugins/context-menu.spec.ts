import { describe, expect, it } from 'vitest'

import { resolveContextMenuPosition } from '../../src/plugins/context-menu'

describe('context menu positioning', () => {
  it('keeps the menu inside the editor viewport', () => {
    expect(resolveContextMenuPosition(
      { width: 400, height: 240 },
      { width: 180, height: 120 },
      { x: 390, y: 230 }
    )).toEqual({ x: 214, y: 114 })
  })

  it('preserves a pointer position that already fits', () => {
    expect(resolveContextMenuPosition(
      { width: 400, height: 240 },
      { width: 180, height: 120 },
      { x: 40, y: 50 }
    )).toEqual({ x: 40, y: 50 })
  })
})
