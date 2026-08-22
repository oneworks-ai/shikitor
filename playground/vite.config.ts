import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

import react from '@vitejs/plugin-react'
import unbundledReexport from 'rollup-plugin-unbundled-reexport'
import { defineConfig } from 'vite'
import globAccept from 'vite-plugin-glob-accept'
import replacer from 'vite-plugin-replacer'

const require = createRequire(import.meta.url)
const sharedTextmateRuntime = require.resolve('@shikijs/vscode-textmate', {
  paths: [path.dirname(require.resolve('shiki/package.json'))]
})

const crossOriginIsolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Opener-Policy': 'same-origin'
}

export default defineConfig({
  base: process.env.BASE ?? '/',
  server: {
    headers: crossOriginIsolationHeaders,
    fs: {
      // Playground cases exercise workspace plugins from source so newly
      // added capability providers participate in the same HMR graph.
      allow: [path.resolve(__dirname, '..')]
    },
    port: 31971
  },
  preview: {
    headers: crossOriginIsolationHeaders
  },
  resolve: {
    alias: [
      {
        // The workspace lockfile resolves part of the Shiki family through a
        // registry-qualified key, which gives bundles two physical copies of
        // @shikijs/vscode-textmate. Grammar state objects from one copy are
        // not recognised by grammars of the other, so every consumer must
        // share the copy Shiki itself uses.
        find: /^@shikijs\/vscode-textmate$/,
        replacement: sharedTextmateRuntime
      }
    ]
  },
  optimizeDeps: {
    // Shiki loads language grammars through generated dynamic imports. Keeping
    // it out of Vite's dependency pre-bundle prevents HMR invalidation from
    // leaving editors pointed at an obsolete hashed grammar chunk. The whole
    // Shiki family stays together so every consumer (core, Monaco + Shiki,
    // Pierre) shares one TextMate runtime instance; a second copy makes
    // grammar state objects from one instance unusable by the other.
    exclude: [
      '@shikitor/core',
      'shiki',
      '@shikijs/core',
      '@shikijs/engine-javascript',
      '@shikijs/engine-oniguruma',
      '@shikijs/langs',
      '@shikijs/themes',
      '@shikijs/transformers',
      '@shikijs/types',
      '@shikijs/vscode-textmate'
    ],
    // Benchmark adapters are lazy by design. Pre-bundling Pierre's two public
    // entrypoints prevents Vite from reloading the page on the first diff run.
    include: ['@pierre/diffs', '@pierre/diffs/edit']
  },
  worker: {
    format: 'es'
  },
  esbuild: {
    target: 'es2019'
  },
  plugins: [
    react(),
    globAccept(),
    replacer({
      exclude: [/.s?css$/],
      define: {
        __WORKSPACE_DIR__: path.resolve(__dirname, '..')
      }
    }),
    unbundledReexport()
  ]
})
