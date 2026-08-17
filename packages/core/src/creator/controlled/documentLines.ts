export interface DocumentLines {
  lineAt(index: number): string
  readonly lineCount: number
  offsetAt(index: number): number
  readonly value: string
}

export function createDocumentLines(value: string): DocumentLines {
  const starts = [0]
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) === 10) starts.push(index + 1)
  }

  return {
    lineAt(index) {
      if (index < 0 || index >= starts.length) return ''
      const start = starts[index]
      const next = starts[index + 1]
      return value.slice(start, next === undefined ? value.length : next - 1)
    },
    lineCount: starts.length,
    offsetAt(index) {
      if (index <= 0) return 0
      return starts[Math.min(index, starts.length)] ?? value.length
    },
    value
  }
}
