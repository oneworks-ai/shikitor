import { readFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'

import type { UserConfigFn } from 'tsdown'
import * as sass from 'sass'

const PLUGIN_ID = 'dsh-shikitor'
const PACKAGE_ROOT = import.meta.dirname
const SHIKI_ENTRY = resolve(PACKAGE_ROOT, 'src/client/shiki.ts')
const FILE_ICONS_STYLE = resolve(PACKAGE_ROOT, 'vendor/file-icons-js/css/style.css')
const STYLE_PREFIX = '\0dsh-shikitor-style:'
const STYLE_SUFFIX = '.mjs'
const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
] as const

function styleModule(source: string, importer: string): string {
  const file = resolve(dirname(importer), source)
  return `${STYLE_PREFIX}${relative(PACKAGE_ROOT, file)}${STYLE_SUFFIX}`
}

function styleSource(
  css: string,
  file: string,
  classMap?: Readonly<Record<string, string>>,
): string {
  const tagId = `${PLUGIN_ID}/${relative(PACKAGE_ROOT, file)}`
  return [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
    "  const tag = document.createElement('style');",
    `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${classMap === undefined ? 'css' : JSON.stringify(classMap)};`,
  ].join('\n')
}

/** Compile the simple local-class CSS modules used by DSH UI primitives. */
function cssModule(css: string, file: string): {
  css: string
  classMap: Readonly<Record<string, string>>
} {
  const localClass = /\.([_a-zA-Z][_a-zA-Z0-9-]*)/gu
  const moduleName = basename(file, '.module.css').replaceAll(/[^a-zA-Z0-9_-]/gu, '-').toLowerCase()
  const classMap: Record<string, string> = {}
  const chunks = css.split(/(\/\*[\s\S]*?\*\/)/gu)
  for (let index = 0; index < chunks.length; index += 2) {
    for (const match of chunks[index]!.matchAll(localClass)) {
      const local = match[1]!
      classMap[local] ??= `${PLUGIN_ID}-${moduleName}__${local}`
    }
    chunks[index] = chunks[index]!.replace(
      localClass,
      (_match, local: string) => `.${classMap[local]}`,
    )
  }
  return {
    css: chunks.join(''),
    classMap,
  }
}

function scopeAtomFileIconSelectors(css: string): string {
  return css.replace(/^(\.[^{\n]+)\{/gmu, (_match, selectors: string) => {
    const scoped = selectors
      .split(',')
      .map(selector => `.dsh-shikitor-file-icon${selector.trim()}`)
      .join(', ')
    return `${scoped} {`
  })
}

export default ((inlineConfig) => [{
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'dist',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: true,
  define: {
    __DSH_SHIKITOR_DEV__: JSON.stringify(
      inlineConfig.env?.DSH_SHIKITOR_DEV === true
        || inlineConfig.env?.DSH_SHIKITOR_DEV === 'true',
    ),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  deps: {
    neverBundle: [...EXTERNALS],
    alwaysBundle: (id: string) => EXTERNALS.includes(id as typeof EXTERNALS[number]) ? undefined : true,
    onlyBundle: false,
  },
  plugins: [{
    name: 'dsh-shikitor-styles',
    resolveId(source: string, importer: string | undefined) {
      if (source === 'shiki') return SHIKI_ENTRY
      if (importer === undefined || (!source.endsWith('.css') && !source.endsWith('.scss'))) return null
      return styleModule(source, importer)
    },
    async load(id: string) {
      if (!id.startsWith(STYLE_PREFIX)) return null
      const file = resolve(PACKAGE_ROOT, id.slice(STYLE_PREFIX.length, -STYLE_SUFFIX.length))
      this.addWatchFile(file)
      let css = file.endsWith('.scss')
        ? sass.compile(file, { style: 'compressed' }).css
        : await readFile(file, 'utf8')
      let classMap: Readonly<Record<string, string>> | undefined
      if (file.endsWith('.module.css')) {
        const compiled = cssModule(css, file)
        css = compiled.css
        classMap = compiled.classMap
      }
      if (file === FILE_ICONS_STYLE) css = scopeAtomFileIconSelectors(css)
      for (const match of css.matchAll(/url\((['"]?)(\.\.?\/[^'")]+)\1\)/gu)) {
        const asset = resolve(dirname(file), match[2]!)
        this.addWatchFile(asset)
        const data = await readFile(asset)
        css = css.replaceAll(match[0], `url("data:font/woff2;base64,${data.toString('base64')}")`)
      }
      return styleSource(css, file, classMap)
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}, {
  name: `${PLUGIN_ID}/types`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'dist/types',
  format: 'esm',
  platform: 'browser',
  target: 'es2024',
  dts: {
    emitDtsOnly: true,
    sourcemap: false,
  },
  sourcemap: false,
  clean: false,
  deps: {
    neverBundle: true,
  },
}]) satisfies UserConfigFn
