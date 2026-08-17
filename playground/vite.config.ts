import path from 'node:path'
import process from 'node:process'

import react from '@vitejs/plugin-react'
import unbundledReexport from 'rollup-plugin-unbundled-reexport'
import { defineConfig } from 'vite'
import globAccept from 'vite-plugin-glob-accept'
import replacer from 'vite-plugin-replacer'

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
  optimizeDeps: {
    // Shiki loads language grammars through generated dynamic imports. Keeping
    // it out of Vite's dependency pre-bundle prevents HMR invalidation from
    // leaving editors pointed at an obsolete hashed grammar chunk.
    exclude: ['@shikitor/core', 'shiki'],
    // Benchmark adapters are lazy by design. Pre-bundling Pierre's two public
    // entrypoints prevents Vite from reloading the page on the first diff run.
    include: ['@pierre/diffs', '@pierre/diffs/edit']
  },
  build: {
    rollupOptions: {
      external: ['shiki']
    }
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
