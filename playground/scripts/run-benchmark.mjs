#!/usr/bin/env node
// Drives the Playground benchmark page headlessly and writes the exported
// JSON. The page persists its run in sessionStorage and reloads between
// engines, so this script seeds a run, reloads, and polls until it finishes.
//
//   node playground/scripts/run-benchmark.mjs \
//     --url http://127.0.0.1:41730 --suite diff --lines 5000 --runs 3 \
//     --out /tmp/diff-5000.json
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
// Playwright is a devDependency of dsh-shikitor; resolve it from the
// workspace store without adding another dependency to the Playground.
const { chromium } = require(path.resolve(
  process.cwd(),
  'packages/dsh-shikitor/node_modules/playwright'
))

function readArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) args[key] = true
    else {
      args[key] = next
      index++
    }
  }
  return args
}

const args = readArgs(process.argv.slice(2))
const url = args.url ?? 'http://127.0.0.1:41730'
const suite = args.suite ?? 'diff'
const shikitorMode = args.mode ?? (suite === 'diff' ? 'all-dom' : 'less-dom')
const config = {
  changePercent: Number(args.change ?? 5),
  iterations: Number(args.iterations ?? 20),
  lineCount: Number(args.lines ?? 1000),
  shikitorMode,
  suite,
  theme: args.theme ?? 'light',
  view: args.view ?? 'unified'
}
const runs = Number(args.runs ?? 1)
const out = args.out
const headless = !args.headed
const engineFilter = typeof args.engines === 'string' ? args.engines.split(',') : undefined
const timeoutMs = Number(args.timeout ?? 15 * 60_000)

const STORAGE_KEY = 'shikitor-benchmark-run-v1'
const ENGINES = shikitorMode === 'less-dom'
  ? ['shikitor-less-dom', 'monaco', 'monaco-shiki', 'codemirror', 'pierre']
  : ['shikitor-all-dom', 'monaco', 'monaco-shiki', 'codemirror', 'pierre']

function seedRun() {
  return {
    config,
    nextIndex: 0,
    // Engines outside the filter are pre-marked unsupported so the runner
    // skips them; the runner only executes the entry at nextIndex, so we
    // instead jump nextIndex forward inside the page when needed.
    results: ENGINES.map(engine => ({ engine, status: 'idle' })),
    status: 'running',
    version: 1
  }
}

async function runOnce(browser, runIndex) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  if (engineFilter) {
    // The page reads its persisted run before React mounts; rewrite it on
    // every navigation so engines outside the filter are skipped without a
    // race against the runner.
    await context.addInitScript(([key, engines, wanted]) => {
      const raw = sessionStorage.getItem(key)
      if (!raw) return
      const run = JSON.parse(raw)
      if (run.status !== 'running') return
      let changed = false
      while (run.nextIndex < engines.length && !wanted.includes(engines[run.nextIndex])) {
        run.results[run.nextIndex] = { engine: engines[run.nextIndex], status: 'unsupported' }
        run.nextIndex += 1
        changed = true
      }
      if (run.nextIndex >= engines.length) {
        run.status = run.results.some(item => item.status === 'error') ? 'error' : 'complete'
        changed = true
      }
      if (changed) sessionStorage.setItem(key, JSON.stringify(run))
    }, [STORAGE_KEY, ENGINES, engineFilter])
  }
  const page = await context.newPage()
  page.on('pageerror', error => console.error(`[page error] ${error.message}`))
  page.on('console', message => {
    if (message.type() === 'error') console.error(`[console] ${message.text()}`)
  })
  const target = `${url.replace(/\/$/, '')}/?active=code-editor-benchmark&theme=${config.theme}`
  await page.goto(target, { waitUntil: 'networkidle' })
  await page.evaluate(([key, run]) => {
    sessionStorage.setItem(key, JSON.stringify(run))
  }, [STORAGE_KEY, seedRun()])
  await page.reload({ waitUntil: 'domcontentloaded' })

  const started = Date.now()
  let last
  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(750)
    let raw
    try {
      raw = await page.evaluate(key => sessionStorage.getItem(key), STORAGE_KEY)
    } catch {
      // Navigation in progress (the page reloads between engines).
      continue
    }
    if (!raw) continue
    const run = JSON.parse(raw)
    const done = run.nextIndex >= ENGINES.length || run.status !== 'running'
    const progress = `${run.nextIndex}/${ENGINES.length}`
    if (progress !== last) {
      console.error(`[run ${runIndex + 1}] progress ${progress} (${run.status})`)
      last = progress
    }
    if (done) {
      const environment = await page.evaluate(() => ({
        generatedAt: new Date().toISOString(),
        hardwareConcurrency: navigator.hardwareConcurrency,
        userAgent: navigator.userAgent
      }))
      await context.close()
      return { config: run.config, environment, results: run.results, status: run.status }
    }
  }
  await context.close()
  throw new Error('benchmark timed out')
}

function formatMs(value) {
  return value === undefined ? '—' : `${value.toFixed(1)}ms`
}

function printSummary(output) {
  for (const run of output.runs) {
    console.error(`\nrun @ ${run.environment.generatedAt} (${run.status})`)
    for (const result of run.results) {
      if (result.status !== 'complete') {
        console.error(`  ${result.engine.padEnd(18)} ${result.status}${result.error ? ` — ${result.error}` : ''}`)
        continue
      }
      console.error(
        `  ${result.engine.padEnd(18)} mountCold=${formatMs(result.firstPaintCold)} `
        + `mountWarm=${formatMs(result.firstPaintWarm)} editP50=${formatMs(result.editP50)} `
        + `editP95=${formatMs(result.editP95)} scroll=${formatMs(result.scroll)} `
        + `dom=${result.domNodes} replace=${formatMs(result.replaceValue)} `
        + `renderer=${result.renderer ?? '-'}`
      )
    }
  }
}

const browser = await chromium.launch({
  channel: args.channel ?? 'chrome',
  headless,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding']
})
try {
  const output = { config, engineFilter, runs: [] }
  for (let index = 0; index < runs; index++) {
    output.runs.push(await runOnce(browser, index))
  }
  printSummary(output)
  const json = JSON.stringify(output, null, 2)
  if (out) {
    mkdirSync(path.dirname(out), { recursive: true })
    writeFileSync(out, json)
    console.error(`\nwrote ${out}`)
  } else {
    console.log(json)
  }
} finally {
  await browser.close()
}
