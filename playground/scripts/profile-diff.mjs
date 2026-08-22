#!/usr/bin/env node
// Samples the main thread with the Chrome DevTools profiler while a benchmark
// adapter performs repeated edits, then prints the hottest functions by self
// time. Uses the Vite dev server so adapter modules can be imported by path.
//
//   node playground/scripts/profile-diff.mjs --url http://127.0.0.1:31971 \
//     --adapter shikitor-all-dom --lines 1000 --edits 10 --out profile.json
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
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
const url = (args.url ?? 'http://127.0.0.1:31971').replace(/\/$/, '')
const adapterName = args.adapter ?? 'shikitor-all-dom'
const lineCount = Number(args.lines ?? 1000)
const edits = Number(args.edits ?? 10)
const view = args.view ?? 'unified'
const suite = args.suite ?? 'diff'
const top = Number(args.top ?? 40)
const out = args.out

const browser = await chromium.launch({ channel: args.channel ?? 'chrome', headless: !args.headed })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const page = await context.newPage()
  page.on('pageerror', error => console.error(`[page error] ${error.message}`))
  await page.goto(`${url}/?active=code-editor-benchmark&theme=light`, { waitUntil: 'networkidle' })

  const session = await context.newCDPSession(page)
  await session.send('Profiler.enable')
  await session.send('Profiler.setSamplingInterval', { interval: 100 })

  // The dev server may optimise new dependencies on first import and reload
  // the page; import the adapter until the page stays put.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.evaluate(async name => {
        await import(`/src/examples/Benchmark/adapters/${name}.ts`)
        await import('/src/examples/Benchmark/dataset.ts')
      }, adapterName)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1500)
      break
    } catch (error) {
      console.error(`[warm-up] ${error.message.split('\n')[0]} (retrying)`)
      await page.waitForLoadState('load').catch(() => {})
      await page.waitForTimeout(1500)
    }
  }

  const setup = await page.evaluate(async ([adapterName, lineCount, suite, view]) => {
    const { default: adapter } = await import(`/src/examples/Benchmark/adapters/${adapterName}.ts`)
    const { createBenchmarkDataset } = await import('/src/examples/Benchmark/dataset.ts')
    const dataset = createBenchmarkDataset(lineCount, 5)
    const config = {
      changePercent: 5, iterations: 5, lineCount, shikitorMode: 'all-dom', suite, theme: 'light', view
    }
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;top:0;left:0;width:1200px;height:700px;overflow:hidden;z-index:9999;background:#fff'
    document.body.append(container)
    await adapter.prepare?.(config)
    const started = performance.now()
    const instance = await adapter.mount({ config, container, dataset })
    const mountMs = performance.now() - started
    await instance.waitForFullSyntax?.()
    const afterSyntaxMs = performance.now() - started
    window.__profileInstance = instance
    window.__profileContainer = container
    return { mountMs, afterSyntaxMs, dom: container.querySelectorAll('*').length }
  }, [adapterName, lineCount, suite, view])
  console.error(`mount ${setup.mountMs.toFixed(1)}ms, full syntax ${setup.afterSyntaxMs.toFixed(1)}ms, dom=${setup.dom}`)

  await session.send('Profiler.start')
  const timings = await page.evaluate(async edits => {
    const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const instance = window.__profileInstance
    const samples = []
    for (let index = 0; index < edits; index++) {
      const started = performance.now()
      await instance.insertText(String(index % 10))
      await nextPaint()
      samples.push(performance.now() - started)
    }
    if (instance.waitForFullSyntax) await instance.waitForFullSyntax()
    return samples
  }, edits)
  const { profile } = await session.send('Profiler.stop')
  await page.evaluate(() => {
    window.__profileInstance?.dispose()
    window.__profileContainer?.remove()
  })

  const nodes = new Map(profile.nodes.map(node => [node.id, node]))
  const selfTime = new Map()
  const deltas = profile.timeDeltas ?? []
  const total = deltas.reduce((sum, delta) => sum + delta, 0)
  for (let index = 0; index < profile.samples.length; index++) {
    const node = nodes.get(profile.samples[index])
    if (!node) continue
    const frame = node.callFrame
    const fileName = frame.url ? frame.url.split('/').slice(-2).join('/').split('?')[0] : '(native)'
    const key = `${frame.functionName || '(anonymous)'} @ ${fileName}:${frame.lineNumber + 1}`
    selfTime.set(key, (selfTime.get(key) ?? 0) + (deltas[index] ?? 0))
  }
  const inclusive = new Map()
  const parentOf = new Map()
  for (const node of profile.nodes) for (const child of node.children ?? []) parentOf.set(child, node.id)
  for (let index = 0; index < profile.samples.length; index++) {
    let id = profile.samples[index]
    const seen = new Set()
    while (id !== undefined) {
      const node = nodes.get(id)
      if (!node) break
      const frame = node.callFrame
      const fileName = frame.url ? frame.url.split('/').slice(-2).join('/').split('?')[0] : '(native)'
      const key = `${frame.functionName || '(anonymous)'} @ ${fileName}:${frame.lineNumber + 1}`
      if (!seen.has(key)) {
        inclusive.set(key, (inclusive.get(key) ?? 0) + (deltas[index] ?? 0))
        seen.add(key)
      }
      id = parentOf.get(id)
    }
  }
  const rows = [...selfTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)
  const sorted = samples => [...samples].sort((a, b) => a - b)
  const p = (samples, ratio) => sorted(samples)[Math.min(samples.length - 1, Math.ceil(samples.length * ratio) - 1)]
  console.error(`\nedits: p50=${p(timings, .5).toFixed(1)}ms p95=${p(timings, .95).toFixed(1)}ms (${timings.map(v => v.toFixed(0)).join(', ')})`)
  console.error(`profile wall ${(total / 1000).toFixed(1)}ms, top ${top} by self time:`)
  for (const [key, value] of rows) {
    console.error(`  ${(value / 1000).toFixed(1).padStart(8)}ms ${(100 * value / total).toFixed(1).padStart(5)}%  ${key}`)
  }
  const inclusiveRows = [...inclusive.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)
  console.error(`\ntop ${top} by inclusive time:`)
  for (const [key, value] of inclusiveRows) {
    console.error(`  ${(value / 1000).toFixed(1).padStart(8)}ms ${(100 * value / total).toFixed(1).padStart(5)}%  ${key}`)
  }
  if (out) {
    mkdirSync(path.dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify({
      adapter: adapterName, lineCount, edits, view, setup, timings,
      selfTime: rows, inclusive: inclusiveRows, totalMicros: total
    }, null, 2))
    console.error(`wrote ${out}`)
  }
  await context.close()
} finally {
  await browser.close()
}
