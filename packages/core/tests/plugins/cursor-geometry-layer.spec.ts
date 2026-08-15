import type { Shikitor } from '@shikitor/core'
import { describe, expect, test } from 'vitest'

import { installCursorGeometryLayer } from '../../src/plugins/cursor-geometry-layer'

const cursor = { line: 1, character: 0, offset: 0 }

function createEditor() {
  return {
    _getCursorAbsolutePosition: () => ({ x: 1, y: 2 })
  } as unknown as Shikitor
}

describe('cursor geometry layers', () => {
  test('deactivates a lower layer without bypassing a later layer', () => {
    const editor = createEditor()
    const folding = installCursorGeometryLayer(editor, (previous, value, offset) => {
      const position = previous(value, offset)
      return { x: position.x + 10, y: position.y }
    })
    const replacements = installCursorGeometryLayer(editor, (previous, value, offset) => {
      const position = previous(value, offset)
      return { x: position.x, y: position.y + 20 }
    })

    folding.dispose()
    expect(editor._getCursorAbsolutePosition(cursor)).toEqual({ x: 1, y: 22 })
    replacements.dispose()
    expect(editor._getCursorAbsolutePosition(cursor)).toEqual({ x: 1, y: 2 })
  })

  test('restores through an already-deactivated upper layer', () => {
    const editor = createEditor()
    const widgets = installCursorGeometryLayer(editor, (previous, value, offset) => {
      const position = previous(value, offset)
      return { x: position.x, y: position.y + 20 }
    })
    const replacements = installCursorGeometryLayer(editor, (previous, value, offset) => {
      const position = previous(value, offset)
      return { x: position.x + 10, y: position.y }
    })

    replacements.dispose()
    expect(editor._getCursorAbsolutePosition(cursor)).toEqual({ x: 1, y: 22 })
    widgets.dispose()
    expect(editor._getCursorAbsolutePosition(cursor)).toEqual({ x: 1, y: 2 })
  })
})
