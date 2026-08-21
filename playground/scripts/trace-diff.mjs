#!/usr/bin/env node
// Records a Chrome performance trace while a benchmark adapter performs
// repeated edits and aggregates the rendering pipeline (scripting, style,
// layout, paint) per keystroke. Complements profile-diff.mjs, which only
// samples JavaScript.
//
//   node playground/scripts/trace-diff.mjs --url http://127.0.0.1:31971 \
//     --adapter shikitor-all-dom --lines 1000 --edits 8
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
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) args[token.slice(2)] = true
    else {
      args[token.slice(2)] = next
      index++
    }
  }
  return args
}

const args = readArgs(process.argv.slice(2))
const url = (args.url ?? 'http://127.0.0.1:31971').replace(/\/$/, '')
const adapterName = args.adapter ?? 'shikitor-all-dom'
const lineCount = Number(args.lines ?? 1000)
const edits = Number(args.edits ?? 8)
const view = args.view ?? 'unified'
const suite = args.suite ?? 'diff'
const out = args.out

const CATEGORIES = {
  'FunctionCall': 'scripting',
  'EvaluateScript': 'scripting',
  'v8.compile': 'scripting',
  'TimerFire': 'scripting',
  'EventDispatch': 'scripting',
  'RunMicrotasks': 'scripting',
  'FireAnimationFrame': 'scripting',
  'MajorGC': 'gc',
  'MinorGC': 'gc',
  'UpdateLayoutTree': 'style',
  'Layout': 'layout',
  'PrePaint': 'layout',
  'Paint': 'paint',
  'Layerize': 'paint',
  'UpdateLayer': 'paint',
  'HitTest': 'layout'
}

const browser = await chromium.launch({ channel: args.channel ?? 'chrome', headless: !args.headed })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const page = await context.newPage()
  page.on('pageerror', error => console.error(`[page error] ${error.message}`))
  await page.goto(`${url}/?active=code-editor-benchmark&theme=light`, { waitUntil: 'networkidle' })
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
    const config = { changePercent: 5, iterations: 5, lineCount, shikitorMode: 'all-dom', suite, theme: 'light', view }
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;top:0;left:0;width:1200px;height:700px;overflow:hidden;z-index:9999;background:#fff'
    document.body.append(container)
    await adapter.prepare?.(config)
    const instance = await adapter.mount({ config, container, dataset })
    await instance.waitForFullSyntax?.()
    window.__traceInstance = instance
    window.__traceContainer = container
    return { dom: container.querySelectorAll('*').length }
  }, [adapterName, lineCount, suite, view])
  console.error(`mounted, dom=${setup.dom}`)

  const session = await context.newCDPSession(page)
  await session.send('Tracing.start', {
    categories: [
      'devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'
    ].join(','),
    transferMode: 'ReportEvents'
  })
  const events = []
  session.on('Tracing.dataCollected', ({ value }) => events.push(...value))
  const done = new Promise(resolve => session.once('Tracing.tracingComplete', resolve))

  const timings = await page.evaluate(async edits => {
    const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const instance = window.__traceInstance
    const samples = []
    for (let index = 0; index < edits; index++) {
      performance.mark(`edit-start-${index}`)
      const started = performance.now()
      await instance.insertText(String(index % 10))
      await nextPaint()
      samples.push(performance.now() - started)
      performance.mark(`edit-end-${index}`)
    }
    if (instance.waitForFullSyntax) await instance.waitForFullSyntax()
    return samples
  }, edits)
  await session.send('Tracing.end')
  await done
  await page.evaluate(() => {
    window.__traceInstance?.dispose()
    window.__traceContainer?.remove()
  })

  // Aggregate by category across the whole edit loop (main thread only).
  const byCategory = new Map()
  const byName = new Map()
  const mainThreadPids = new Set(events
    .filter(event => event.name === 'thread_name' && event.args?.name === 'CrRendererMain')
    .map(event => `${event.pid}:${event.tid}`))
  for (const event of events) {
    if (event.ph !== 'X' || typeof event.dur !== 'number') continue
    if (mainThreadPids.size && !mainThreadPids.has(`${event.pid}:${event.tid}`)) continue
    const category = CATEGORIES[event.name]
    if (!category) continue
    byName.set(event.name, (byName.get(event.name) ?? 0) + event.dur)
    // Nested events of the same category (e.g. FunctionCall inside FireAnimationFrame)
    // would double count; only top-level scripting events are counted below.
    if (category === 'scripting' && !['FireAnimationFrame', 'TimerFire', 'EventDispatch', 'EvaluateScript', 'RunMicrotasks', 'FunctionCall'].includes(event.name)) continue
    byCategory.set(category, (byCategory.get(category) ?? 0) + event.dur)
  }
  // Attribute forced style/layout work to the JS frame that triggered it.
  const forcedBy = new Map()
  for (const event of events) {
    if (event.ph !== 'X' || typeof event.dur !== 'number') continue
    if (!['UpdateLayoutTree', 'Layout'].includes(event.name)) continue
    const frame = event.args?.beginData?.stackTrace?.[0]
    const key = frame
      ? `${event.name} ← ${frame.functionName || '(anonymous)'} @ ${String(frame.url).split('/').slice(-2).join('/').split('?')[0]}:${frame.lineNumber}`
      : `${event.name} ← (no JS frame: rAF/style flush)`
    const entry = forcedBy.get(key) ?? { count: 0, elements: 0, micros: 0 }
    entry.count += 1
    entry.micros += event.dur
    entry.elements += event.args?.elementCount ?? 0
    forcedBy.set(key, entry)
  }
  // Style invalidation reasons (requires the invalidationTracking category).
  const invalidations = new Map()
  for (const event of events) {
    if (!['ScheduleStyleInvalidationTracking', 'StyleInvalidatorInvalidationTracking', 'StyleRecalcInvalidationTracking'].includes(event.name)) continue
    const data = event.args?.data ?? {}
    const reason = [
      data.reason,
      data.changedClass ? `class:${data.changedClass}` : '',
      data.changedAttribute ? `attr:${data.changedAttribute}` : '',
      data.changedId ? `id:${data.changedId}` : '',
      data.selectorPart ? `sel:${data.selectorPart}` : '',
      data.invalidationList ? `list:${JSON.stringify(data.invalidationList).slice(0, 80)}` : '',
      data.extraData ? `extra:${String(data.extraData).slice(0, 60)}` : ''
    ].filter(Boolean).join(' ')
    const key = `${event.name.replace('Tracking', '')} ${data.nodeName ?? ''} ${reason}`
    invalidations.set(key, (invalidations.get(key) ?? 0) + 1)
  }
  const sorted = [...timings].sort((a, b) => a - b)
  const p = ratio => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]
  console.error(`edits: p50=${p(.5).toFixed(1)}ms p95=${p(.95).toFixed(1)}ms (${timings.map(v => v.toFixed(0)).join(', ')})`)
  console.error('per-keystroke averages (ms):')
  for (const [name, micros] of [...byName.entries()].sort((a, b) => b[1] - a[1])) {
    console.error(`  ${(micros / 1000 / edits).toFixed(2).padStart(8)}  ${name}`)
  }
  console.error('forced style/layout by trigger (per keystroke):')
  for (const [key, entry] of [...forcedBy.entries()].sort((a, b) => b[1].micros - a[1].micros).slice(0, 20)) {
    console.error(`  ${(entry.micros / 1000 / edits).toFixed(2).padStart(8)}ms ×${(entry.count / edits).toFixed(1).padStart(5)} ${String(Math.round(entry.elements / edits)).padStart(7)} el  ${key}`)
  }
  console.error('style invalidation reasons (count per keystroke):')
  for (const [key, count] of [...invalidations.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.error(`  ${(count / edits).toFixed(1).padStart(8)}  ${key}`)
  }
  if (out) {
    mkdirSync(path.dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify({
      adapter: adapterName, lineCount, edits, view, timings,
      perKeystrokeMs: Object.fromEntries([...byName.entries()].map(([name, micros]) => [name, micros / 1000 / edits]))
    }, null, 2))
    console.error(`wrote ${out}`)
  }
  await context.close()
} finally {
  await browser.close()
}
