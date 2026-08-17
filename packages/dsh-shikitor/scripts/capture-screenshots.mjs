#!/usr/bin/env node

import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUTPUT = resolve(PACKAGE_ROOT, 'assets/screenshots')
const DEFAULT_BASE_URL = 'http://127.0.0.1:3080/'
const LOCALES = ['zh', 'en']
const THEMES = ['light', 'dark']
const SURFACES = ['completions', 'sender', 'editor', 'settings']
const DEFAULT_SURFACES = ['completions', 'editor', 'settings']
const COMPLETIONS = [
  { id: 'sessions', trigger: '#' },
  { id: 'files', trigger: '@' },
  { id: 'skills', trigger: '$' },
  { id: 'commands', trigger: '/' },
]

const COPY = {
  zh: {
    settings: '设置',
    generalSettings: '通用设置',
    editorSettings: '编辑器',
    fileEditorSettingsTab: '文件编辑器',
    editorTab: '编辑器',
    chatTab: '对话',
    language: '中文',
    themes: { light: '浅色', dark: '深色', system: '跟随系统' },
    treeExpand: '展开文件目录树',
  },
  en: {
    settings: 'Settings',
    generalSettings: 'General',
    editorSettings: 'Editor',
    fileEditorSettingsTab: 'File editor',
    editorTab: 'Editor',
    chatTab: 'Chat',
    language: 'English',
    themes: { light: 'Light', dark: 'Dark', system: 'System' },
    treeExpand: 'Expand file tree',
  },
}

function parseList(value, allowed, label) {
  const values = value.split(',').map(item => item.trim()).filter(Boolean)
  for (const item of values) {
    if (!allowed.includes(item)) throw new Error(`Unknown ${label} "${item}"; expected ${allowed.join(', ')}`)
  }
  return values
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    output: DEFAULT_OUTPUT,
    locales: [...LOCALES],
    themes: [...THEMES],
    surfaces: [...DEFAULT_SURFACES],
    file: 'README.md',
    sessionTitle: undefined,
    trigger: '@',
    headed: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[index += 1]
      if (value === undefined) throw new Error(`${arg} requires a value`)
      return value
    }

    if (arg === '--') continue
    if (arg === '--base-url') options.baseUrl = next()
    else if (arg === '--output') options.output = resolve(next())
    else if (arg === '--locales') options.locales = parseList(next(), LOCALES, 'locale')
    else if (arg === '--themes') options.themes = parseList(next(), THEMES, 'theme')
    else if (arg === '--surfaces') options.surfaces = parseList(next(), SURFACES, 'surface')
    else if (arg === '--file') options.file = next()
    else if (arg === '--session-title') options.sessionTitle = next()
    else if (arg === '--trigger') options.trigger = next()
    else if (arg === '--headed') options.headed = true
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(`Capture localized dsh-shikitor marketplace screenshots.\n\n`
        + `Usage: pnpm --filter dsh-shikitor screenshots -- [options]\n\n`
        + `  --base-url URL          Running DSH Web URL (default: ${DEFAULT_BASE_URL})\n`
        + `  --output DIR            PNG output directory (default: assets/screenshots)\n`
        + `  --locales zh,en         Locale variants\n`
        + `  --themes light,dark     Theme variants\n`
        + `  --surfaces LIST         completions,editor,settings (sender keeps the legacy single-trigger shot)\n`
        + `  --session-title TITLE   Select a sanitized demo session first\n`
        + `  --file PATH             File to open in the editor tree (default: README.md)\n`
        + `  --trigger CHARACTER     Sender completion trigger (default: @)\n`
        + `  --headed                 Show Chromium while capturing\n`)
      process.exit(0)
    } else {
      throw new Error(`Unknown option ${arg}`)
    }
  }

  return options
}

async function clickVisible(locators, label) {
  for (const locator of locators) {
    const count = await locator.count()
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index)
      if (await candidate.isVisible()) {
        await candidate.click()
        return
      }
    }
  }
  throw new Error(`Could not find visible ${label}`)
}

async function waitForStableFrame(page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)))
  })
  await page.waitForTimeout(180)
}

async function redactLocalPaths(page) {
  await page.locator('body').evaluate(body => {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      node.nodeValue = node.nodeValue
        ?.replace(/\/(?:Users|home)\/[^/\s]+\/[^\s<>"']+/g, '~/workspace/shikitor-demo')
        .replace(/[A-Za-z]:\\Users\\[^\\\s]+\\[^\s<>"']+/g, '~/workspace/shikitor-demo') ?? null
    }
  })
}

async function isolateSenderScreenshot(page) {
  const input = page.locator('textarea.shikitor-input--attached').first()
  const composer = input.locator('xpath=../../..')
  const popup = page.locator('.shikitor-popup:visible').first()

  await page.locator('body').evaluate(body => {
    if (document.querySelector('#dsh-shikitor-screenshot-style') === null) {
      const style = document.createElement('style')
      style.id = 'dsh-shikitor-screenshot-style'
      style.textContent = `
        body.dsh-shikitor-screenshot-mode {
          background: var(--dsh-shikitor-screenshot-background) !important;
        }
        body.dsh-shikitor-screenshot-mode * {
          visibility: hidden !important;
        }
        body.dsh-shikitor-screenshot-mode .dsh-shikitor-screenshot-focus,
        body.dsh-shikitor-screenshot-mode .dsh-shikitor-screenshot-focus * {
          visibility: visible !important;
        }
      `
      document.head.append(style)
    }

    const computedBackground = getComputedStyle(body).backgroundColor
    const fallbackBackground = body.hasAttribute('data-ds-dark-theme') ? '#141414' : '#ffffff'
    body.style.setProperty(
      '--dsh-shikitor-screenshot-background',
      computedBackground === 'rgba(0, 0, 0, 0)' ? fallbackBackground : computedBackground,
    )
    body.classList.add('dsh-shikitor-screenshot-mode')
  })
  await composer.evaluate(element => element.classList.add('dsh-shikitor-screenshot-focus'))
  await popup.evaluate(element => element.classList.add('dsh-shikitor-screenshot-focus'))

  return async () => {
    await page.locator('.dsh-shikitor-screenshot-focus').evaluateAll(elements => {
      for (const element of elements) element.classList.remove('dsh-shikitor-screenshot-focus')
    })
    await page.locator('body').evaluate(body => {
      body.classList.remove('dsh-shikitor-screenshot-mode')
      body.style.removeProperty('--dsh-shikitor-screenshot-background')
    })
  }
}

async function openSettings(page, locale) {
  if (await page.getByRole('dialog', { name: /^(设置|Settings)$/ }).isVisible().catch(() => false)) return
  const labels = [COPY[locale].settings, COPY.zh.settings, COPY.en.settings]
  await clickVisible(
    labels.map(label => page.getByRole('button', { name: label, exact: true })),
    'Settings button',
  )
  await page.getByRole('dialog', { name: /^(设置|Settings)$/ }).waitFor({ state: 'visible' })
}

async function openGeneralSettings(page, locale) {
  await openSettings(page, locale)
  await clickVisible([
    page.getByRole('button', { name: COPY[locale].generalSettings, exact: true }),
    page.getByRole('button', {
      name: COPY[locale === 'zh' ? 'en' : 'zh'].generalSettings,
      exact: true,
    }),
  ], 'General settings navigation')
}

async function selectLocale(page, locale) {
  await openGeneralSettings(page, locale)
  const target = COPY[locale].language
  const current = page.getByRole('button', { name: target, exact: true })
  if (await current.isVisible().catch(() => false)) return

  await clickVisible([
    page.getByRole('button', { name: COPY.zh.language, exact: true }),
    page.getByRole('button', { name: COPY.en.language, exact: true }),
  ], 'language selector')
  await clickVisible([
    page.getByRole('menuitem', { name: target, exact: true }),
    page.getByText(target, { exact: true }),
  ], `${target} locale option`)
  await page.getByRole('button', { name: target, exact: true }).waitFor({ state: 'visible' })
}

async function selectTheme(page, locale, theme) {
  await openGeneralSettings(page, locale)
  const label = COPY[locale].themes[theme]
  const button = page.getByRole('button', { name: label, exact: true })
  await button.waitFor({ state: 'visible' })
  if (await button.getAttribute('aria-pressed') !== 'true') await button.click()
  const dark = theme === 'dark'
  await page.waitForFunction(
    expectedDark => document.body.hasAttribute('data-ds-dark-theme') === expectedDark,
    dark,
  )
}

async function readOriginalPreferences(page) {
  await openGeneralSettings(page, 'zh')
  const language = await page.getByRole('button', { name: /^(中文|English)$/ }).innerText()
  const locale = language.trim() === COPY.en.language ? 'en' : 'zh'
  let theme = 'system'
  for (const candidate of THEMES.concat('system')) {
    const button = page.getByRole('button', { name: COPY[locale].themes[candidate], exact: true })
    if (await button.isVisible().catch(() => false) && await button.getAttribute('aria-pressed') === 'true') {
      theme = candidate
      break
    }
  }
  return { locale, theme }
}

async function selectDemoSession(page, title) {
  if (title === undefined) return
  const sessionTitle = page.locator('[role="tree"]').getByText(title, { exact: true })
  await sessionTitle.waitFor({ state: 'visible' })
  await sessionTitle.click()
}

async function openEditorFile(page, locale, file) {
  await clickVisible([
    page.getByRole('tab', { name: COPY[locale].editorTab, exact: true }),
    page.getByRole('button', { name: COPY[locale].editorTab, exact: true }),
  ], 'Editor tab')
  await page.locator('.dsh-shikitor-editor').waitFor({ state: 'visible' })

  const expand = page.getByRole('button', { name: COPY[locale].treeExpand, exact: true })
  if (await expand.isVisible().catch(() => false)) await expand.click()

  const normalized = file.replace(/^\.\//, '').replaceAll('\\', '/')
  const segments = normalized.split('/').filter(Boolean)
  for (let depth = 1; depth < segments.length; depth += 1) {
    const directory = segments.slice(0, depth).join('/')
    const row = page.getByTitle(directory, { exact: true })
    await row.waitFor({ state: 'visible' })
    const item = row.locator('xpath=..')
    if (await item.getAttribute('aria-expanded') !== 'true') await row.click()
  }

  const fileRow = page.getByTitle(normalized, { exact: true })
  await fileRow.waitFor({ state: 'visible' })
  await fileRow.click()
  await page.locator('.dsh-shikitor-editor__toolbar-main').getByText(segments.at(-1), { exact: true })
    .waitFor({ state: 'visible' })
}

async function openEditorSettings(page, locale) {
  await openSettings(page, locale)
  await clickVisible([
    page.getByRole('button', { name: COPY[locale].editorSettings, exact: true }),
    page.getByText(COPY[locale].editorSettings, { exact: true }),
  ], 'Editor settings navigation')
  await page.locator('.dsh-shikitor-settings').waitFor({ state: 'visible' })
  await page.getByRole('tab', { name: COPY[locale].fileEditorSettingsTab, exact: true }).click()
}

async function closeSettings(page) {
  const dialog = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
  if (!await dialog.isVisible().catch(() => false)) return
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
}

async function openSenderCompletion(page, locale, trigger) {
  await closeSettings(page)
  await clickVisible([
    page.getByRole('tab', { name: COPY[locale].chatTab, exact: true }),
    page.getByRole('button', { name: COPY[locale].chatTab, exact: true }),
  ], 'Chat tab')
  const input = page.locator('textarea.shikitor-input--attached').first()
  await input.waitFor({ state: 'visible' })
  await input.fill('')
  await input.click()
  await page.keyboard.type(trigger)
  await page.locator('.shikitor-popup:visible').first().waitFor({ state: 'visible', timeout: 5_000 })
}

async function capture(page, output, surface, locale, theme) {
  await redactLocalPaths(page)
  await waitForStableFrame(page)
  const path = resolve(output, `dsh-shikitor-${surface}-${locale}-${theme}.png`)
  let clip
  const senderSurface = surface === 'sender' || surface.startsWith('completion-')
  const cleanup = senderSurface ? await isolateSenderScreenshot(page) : async () => {}
  if (senderSurface) {
    const popupBox = await page.locator('.shikitor-popup:visible').first().boundingBox()
    const composerBox = await page.locator('textarea.shikitor-input--attached').first()
      .locator('xpath=../../..').boundingBox()
    const viewport = page.viewportSize()
    if (popupBox !== null && composerBox !== null && viewport !== null) {
      const padding = 8
      const x = Math.max(0, Math.min(popupBox.x, composerBox.x) - padding)
      const y = Math.max(0, Math.min(popupBox.y, composerBox.y) - padding)
      const right = Math.min(
        viewport.width,
        Math.max(popupBox.x + popupBox.width, composerBox.x + composerBox.width) + padding,
      )
      const bottom = Math.min(
        viewport.height,
        Math.max(popupBox.y + popupBox.height, composerBox.y + composerBox.height) + padding,
      )
      clip = { x, y, width: right - x, height: bottom - y }
    }
  }
  try {
    await page.screenshot({
      path,
      animations: 'disabled',
      ...(clip === undefined ? {} : { clip }),
    })
  } finally {
    await cleanup()
  }
  process.stdout.write(`${path}\n`)
}

const options = parseArgs(process.argv.slice(2))
await mkdir(options.output, { recursive: true })

const response = await fetch(options.baseUrl).catch(() => undefined)
if (response === undefined || !response.ok) {
  throw new Error(`DSH Web is not reachable at ${options.baseUrl}; start it before capturing screenshots`)
}

const { chromium } = await import('playwright')
const browser = await chromium.launch({ headless: !options.headed })
const context = await browser.newContext({
  colorScheme: 'light',
  deviceScaleFactor: 1,
  locale: 'zh-CN',
  viewport: { width: 1440, height: 960 },
})
const page = await context.newPage()

let original
try {
  await page.goto(options.baseUrl, { waitUntil: 'networkidle' })
  await selectDemoSession(page, options.sessionTitle)
  original = await readOriginalPreferences(page)

  for (const locale of options.locales) {
    await selectLocale(page, locale)
    // DSH recreates its localized client seats and runtime connection after a
    // locale change. Capture only after the new connection has initialized.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await selectDemoSession(page, options.sessionTitle)
    for (const theme of options.themes) {
      await selectTheme(page, locale, theme)

      if (options.surfaces.includes('settings')) {
        await openEditorSettings(page, locale)
        await capture(page, options.output, 'settings', locale, theme)
      }
      if (options.surfaces.includes('editor')) {
        await closeSettings(page)
        await openEditorFile(page, locale, options.file)
        await capture(page, options.output, 'editor', locale, theme)
      }
      if (options.surfaces.includes('sender')) {
        await openSenderCompletion(page, locale, options.trigger)
        await capture(page, options.output, 'sender', locale, theme)
        await page.locator('textarea.shikitor-input--attached').first().fill('')
      }
      if (options.surfaces.includes('completions')) {
        for (const completion of COMPLETIONS) {
          await openSenderCompletion(page, locale, completion.trigger)
          await capture(page, options.output, `completion-${completion.id}`, locale, theme)
          await page.locator('textarea.shikitor-input--attached').first().fill('')
        }
      }
    }
  }
} finally {
  if (original !== undefined) {
    await openSettings(page, original.locale).catch(() => {})
    await selectLocale(page, original.locale).catch(() => {})
    if (original.theme !== 'system') {
      await selectTheme(page, original.locale, original.theme).catch(() => {})
    } else {
      const system = page.getByRole('button', { name: COPY[original.locale].themes.system, exact: true })
      if (await system.isVisible().catch(() => false)) await system.click().catch(() => {})
    }
  }
  await context.close()
  await browser.close()
}
