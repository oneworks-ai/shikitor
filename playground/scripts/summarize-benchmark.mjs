#!/usr/bin/env node
// Summarizes one or more run-benchmark.mjs JSON exports as a Markdown table.
// Values are medians across runs for each engine.
//
//   node playground/scripts/summarize-benchmark.mjs before.json after.json
import { readFileSync } from 'node:fs'
import process from 'node:process'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: summarize-benchmark.mjs <run.json> [...]')
  process.exit(1)
}

const METRICS = [
  ['firstPaintCold', 'Cold mount'],
  ['firstPaintWarm', 'Warm mount'],
  ['fullSyntaxCold', 'Cold full syntax'],
  ['editP50', 'Edit P50'],
  ['editP95', 'Edit P95'],
  ['scroll', 'Scroll'],
  ['domNodes', 'DOM elements'],
  ['memoryDelta', 'Memory Δ']
]

function median(values) {
  const sorted = values.filter(value => typeof value === 'number').sort((a, b) => a - b)
  if (!sorted.length) return undefined
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function format(key, value) {
  if (value === undefined) return '—'
  if (key === 'domNodes') return Math.round(value).toLocaleString('en-US')
  if (key === 'memoryDelta') return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${value.toFixed(1)} ms`
}

for (const file of files) {
  const output = JSON.parse(readFileSync(file, 'utf8'))
  const { config } = output
  const byEngine = new Map()
  for (const run of output.runs) {
    for (const result of run.results) {
      if (result.status !== 'complete') continue
      const entry = byEngine.get(result.engine) ?? { samples: {}, renderer: result.renderer }
      for (const [key] of METRICS) {
        entry.samples[key] ??= []
        entry.samples[key].push(result[key])
      }
      byEngine.set(result.engine, entry)
    }
  }
  console.log(`\n### ${file}`)
  console.log(`suite=${config.suite} view=${config.view} lines=${config.lineCount} change=${config.changePercent}% iterations=${config.iterations} runs=${output.runs.length} (median of runs)`)
  console.log(`| Engine | ${METRICS.map(([, label]) => label).join(' | ')} |`)
  console.log(`| --- | ${METRICS.map(() => '---:').join(' | ')} |`)
  for (const [engine, entry] of byEngine) {
    const cells = METRICS.map(([key]) => format(key, median(entry.samples[key])))
    console.log(`| ${engine}${entry.renderer ? ` (${entry.renderer})` : ''} | ${cells.join(' | ')} |`)
  }
  const errors = output.runs.flatMap(run => run.results.filter(result => result.status === 'error'))
  for (const error of errors) console.log(`- ${error.engine}: error — ${error.error}`)
}
