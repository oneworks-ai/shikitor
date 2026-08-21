#!/usr/bin/env node
// Opens the Playground diff demo, exercises unified/split views and typing,
// captures screenshots and reports DOM/console health. Works against the dev
// server or a preview build.
//
//   node playground/scripts/capture-diff.mjs --url http://127.0.0.1:31971 \
//     --out /tmp/diff-shots
import { mkdirSync } from 'node:fs'
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
const out = args.out ?? 'playground/.shots'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: args.channel ?? 'chrome', headless: !args.headed })
const errors = []
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  await page.goto(`${url}/?active=code-editor-diff&theme=${args.theme ?? 'light'}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.shikitor--diff .shikitor-output-line', { timeout: 20_000 })
  await page.waitForTimeout(1200)
  const summarize = () => page.evaluate(() => {
    const root = document.querySelector('.shikitor--diff')
    const output = root?.querySelector('.shikitor-output')
    return {
      dom: root ? root.querySelectorAll('*').length : 0,
      kinds: [...(root?.querySelectorAll('.shikitor-output-line[data-diff-kind]') ?? [])]
        .map(line => `${line.dataset.line}:${line.dataset.diffKind}`),
      inlineMarkers: root?.querySelectorAll('.shikitor-diff-inline').length,
      widgets: root?.querySelectorAll('.shikitor-line-widget').length,
      originalRows: root?.querySelectorAll('.shikitor-diff-original__row').length,
      renderKind: output?.dataset.renderKind,
      renderState: output?.dataset.renderState,
      syntaxState: output?.dataset.syntaxState,
      hidden: root?.querySelectorAll('.shikitor-output-line[hidden]').length,
      placeholders: root?.querySelectorAll('.shikitor-fold-placeholder').length
    }
  })
  const results = {}
  results.unified = await summarize()
  await page.screenshot({ path: path.join(out, 'diff-unified.png') })

  // Type at the end of line 2 of the working copy.
  await page.evaluate(() => {
    const input = document.querySelector('.shikitor--diff .shikitor-input')
    const value = input.value
    const offset = value.indexOf('\n', value.indexOf('\n') + 1)
    input.focus()
    input.setSelectionRange(offset, offset)
  })
  await page.keyboard.type(' // typed')
  await page.waitForTimeout(800)
  results.afterTyping = await summarize()
  await page.screenshot({ path: path.join(out, 'diff-unified-typed.png') })

  await page.click('button[aria-pressed="false"]')
  await page.waitForTimeout(800)
  results.split = await summarize()
  await page.screenshot({ path: path.join(out, 'diff-split.png') })

  // Expand the first fold if present and capture again.
  const fold = await page.$('.shikitor-fold-placeholder')
  if (fold) {
    await fold.click()
    await page.waitForTimeout(600)
    results.splitExpanded = await summarize()
    await page.screenshot({ path: path.join(out, 'diff-split-expanded.png') })
  }
  console.log(JSON.stringify({ results, errors }, null, 2))
  await context.close()
} finally {
  await browser.close()
}
