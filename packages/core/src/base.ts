import type { OffsetOrPosition, ResolvedPosition } from '@shikijs/types'

export type _KeyboardEvent = KeyboardEvent & {
  target: HTMLTextAreaElement
}

export interface RefObject<T> {
  current: T
}

export interface TextRange {
  start: OffsetOrPosition
  end: OffsetOrPosition
}
export interface ResolvedTextRange {
  start: ResolvedPosition
  end: ResolvedPosition
}

export function cssvar(name: string) {
  return `--shikitor-${name}`
}
