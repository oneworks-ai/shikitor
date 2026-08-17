import type { GrammarState } from '@shikijs/types'

import type { DocumentLines } from './documentLines'
import type { TokenizedLine } from './tokenSnapshot'

const YIELD_BUDGET_MS = 40

export async function yieldToMain() {
  const scheduler = (globalThis as typeof globalThis & {
    scheduler?: { yield?(): Promise<void> }
  }).scheduler
  if (scheduler?.yield) {
    await scheduler.yield()
    return
  }
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

export function shouldYield(yieldedAt: number, budgetMs = YIELD_BUDGET_MS) {
  return performance.now() - yieldedAt >= budgetMs
}

export function grammarStatesEqual(left?: GrammarState, right?: GrammarState) {
  if (left === right) return true
  if (!left || !right) return false
  if (left.lang !== right.lang || left.theme !== right.theme) return false
  const leftStack = left.getInternalStack(left.theme)
  const rightStack = right.getInternalStack(right.theme)
  return leftStack === rightStack || Boolean(
    leftStack && rightStack && leftStack.equals(rightStack)
  )
}

export function findFirstChangedLine(
  previous: TokenizedLine[],
  document: DocumentLines
) {
  const comparable = Math.min(previous.length, document.lineCount)
  for (let index = 0; index < comparable; index++) {
    if (previous[index].source !== document.lineAt(index)) return index
  }
  return previous.length === document.lineCount
    ? document.lineCount
    : comparable
}

export function findCheckpoint(previous: TokenizedLine[], changedFrom: number) {
  let checkpoint = changedFrom
  while (checkpoint > 0 && !previous[checkpoint]?.checkpoint) checkpoint--
  return checkpoint
}

export function findNextCheckpoint(previous: TokenizedLine[], start: number) {
  for (let index = start + 1; index < previous.length; index++) {
    if (previous[index].checkpoint) return index
  }
  return previous.length
}

export function blockIsUnchanged(
  previous: TokenizedLine[],
  document: DocumentLines,
  start: number,
  end: number
) {
  for (let index = start; index < end; index++) {
    if (previous[index]?.source !== document.lineAt(index)) return false
  }
  return true
}
