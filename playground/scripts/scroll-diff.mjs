#!/usr/bin/env node
// Measures scroll frame cost of a benchmark adapter: scrolls the editor in
// steps and records the time from each scroll to the next two paints, plus
// the long-task share. Uses the Vite dev server.
//
//   node playground/scripts/scroll-diff.mjs --url http://127.0.0.1:31971 \
//     --adapter shikitor-all-dom --lines 5000 --steps 40
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
const lineCount = Number(args.lines ?? 5000)
const steps = Number(args.steps ?? 40)
const suite = args.suite ?? 'diff'
const view = args.view ?? 'unified'

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
  const result = await page.evaluate(async ([adapterName, lineCount, suite, view, steps]) => {
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
    const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const samples = []
    for (let step = 1; step <= steps; step++) {
      const started = performance.now()
      await instance.scrollTo(step / steps)
      await nextPaint()
      samples.push(performance.now() - started)
    }
    const dom = container.querySelectorAll('*').length
    instance.dispose()
    container.remove()
    return { dom, samples }
  }, [adapterName, lineCount, suite, view, steps])
  const sorted = [...result.samples].sort((a, b) => a - b)
  const p = ratio => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]
  console.log(JSON.stringify({
    adapter: adapterName,
    lineCount,
    steps,
    dom: result.dom,
    scrollToPaintP50: Number(p(.5).toFixed(1)),
    scrollToPaintP95: Number(p(.95).toFixed(1)),
    max: Number(Math.max(...result.samples).toFixed(1))
  }))
  await context.close()
} finally {
  await browser.close()
}
