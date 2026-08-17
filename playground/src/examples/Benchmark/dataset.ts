import type { BenchmarkDataset } from './types'

function sourceLine(index: number, changed: boolean) {
  const key = String(index).padStart(5, '0')
  const enabled = changed ? index % 2 !== 0 : index % 2 === 0
  switch (index % 4) {
    case 0:
      return `export const metric${key} = { id: ${index}, enabled: ${enabled} }`
    case 1:
      return `type Record${key} = { id: ${index}; label: 'row-${changed ? 'next' : 'base'}-${key}' }`
    case 2:
      return `const resolve${key} = (value: number) => value + ${changed ? index + 1 : index}`
    default:
      return `export function select${key}() { return 'item-${changed ? 'next' : 'base'}-${key}' }`
  }
}

export function createBenchmarkDataset(
  lineCount: number,
  changePercent: number
): BenchmarkDataset {
  const safeLineCount = Math.max(10, Math.floor(lineCount))
  const safePercent = Math.min(100, Math.max(0, changePercent))
  const stride = safePercent === 0 ? Number.POSITIVE_INFINITY : Math.max(1, Math.round(100 / safePercent))
  const original: string[] = []
  const current: string[] = []
  let changedLines = 0

  for (let index = 1; index <= safeLineCount; index++) {
    const changed = index < safeLineCount && index % stride === 0
    original.push(sourceLine(index, false))
    current.push(sourceLine(index, changed))
    if (changed) changedLines++
  }
  original[safeLineCount - 1] = '// benchmark-edit-anchor:'
  current[safeLineCount - 1] = '// benchmark-edit-anchor:'

  return {
    changedLines,
    original: original.join('\n'),
    current: current.join('\n')
  }
}
