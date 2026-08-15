import type { ResolvedCursor, Shikitor } from '@shikitor/core'

export interface CursorGeometry {
  x: number
  y: number
}

export type CursorGeometryResolver = (
  cursor: ResolvedCursor,
  lineOffset?: number
) => CursorGeometry

export type CursorGeometryTransform = (
  previous: CursorGeometryResolver,
  cursor: ResolvedCursor,
  lineOffset: number
) => CursorGeometry

/**
 * Compose a cursor-geometry transform without leaving a stale transform in a
 * later plugin's captured chain when plugins are removed out of order.
 */
export function installCursorGeometryLayer(
  shikitor: Shikitor,
  transform: CursorGeometryTransform
) {
  const previous = shikitor._getCursorAbsolutePosition.bind(shikitor)
  let active = true
  const resolve: CursorGeometryResolver = (cursor, lineOffset = 0) => active
    ? transform(previous, cursor, lineOffset)
    : previous(cursor, lineOffset)

  shikitor._getCursorAbsolutePosition = resolve
  return {
    previous,
    resolve,
    dispose() {
      active = false
      if (shikitor._getCursorAbsolutePosition === resolve) {
        shikitor._getCursorAbsolutePosition = previous
      }
    }
  }
}
