import { createdBundledHighlighter } from 'shiki/core'
import markdown from 'shiki/dist/langs/markdown.mjs'
import typescript from 'shiki/dist/langs/typescript.mjs'
import bash from 'shiki/dist/langs/bash.mjs'
import css from 'shiki/dist/langs/css.mjs'
import html from 'shiki/dist/langs/html.mjs'
import javascript from 'shiki/dist/langs/javascript.mjs'
import json from 'shiki/dist/langs/json.mjs'
import jsonc from 'shiki/dist/langs/jsonc.mjs'
import python from 'shiki/dist/langs/python.mjs'
import scss from 'shiki/dist/langs/scss.mjs'
import shellscript from 'shiki/dist/langs/shellscript.mjs'
import svelte from 'shiki/dist/langs/svelte.mjs'
import vue from 'shiki/dist/langs/vue.mjs'
import yaml from 'shiki/dist/langs/yaml.mjs'
import githubDark from 'shiki/dist/themes/github-dark.mjs'
import githubLight from 'shiki/dist/themes/github-light.mjs'
import minDark from 'shiki/dist/themes/min-dark.mjs'
import minLight from 'shiki/dist/themes/min-light.mjs'
import vitesseDark from 'shiki/dist/themes/vitesse-dark.mjs'
import vitesseLight from 'shiki/dist/themes/vitesse-light.mjs'
import getWasmInlined from 'shiki/wasm'

const languages = {
  bash,
  css,
  html,
  javascript,
  json,
  jsonc,
  markdown,
  python,
  scss,
  shellscript,
  svelte,
  typescript,
  vue,
  yaml,
}
const themes = {
  'github-dark': githubDark,
  'github-light': githubLight,
  'min-dark': minDark,
  'min-light': minLight,
  'vitesse-dark': vitesseDark,
  'vitesse-light': vitesseLight,
}

/** Minimal Shiki facade used by the DSH bundle; it deliberately avoids the full language registry. */
export const getHighlighter = createdBundledHighlighter(languages, themes, getWasmInlined)

/** Shikitor only needs this list to decide whether its plain-text fallback is dark. */
export const bundledThemesInfo = [
  { id: 'github-dark', type: 'dark' },
  { id: 'github-light', type: 'light' },
  { id: 'min-dark', type: 'dark' },
  { id: 'min-light', type: 'light' },
  { id: 'vitesse-dark', type: 'dark' },
  { id: 'vitesse-light', type: 'light' },
] as const
