import path from 'node:path'

import react from '@vitejs/plugin-react'
import unbundledReexport from 'rollup-plugin-unbundled-reexport'
import { defineConfig } from 'vite'
import globAccept from 'vite-plugin-glob-accept'
import replacer from 'vite-plugin-replacer'

export default defineConfig({
  base: process.env.BASE ?? '/',
  server: {
    port: 31971
  },
  optimizeDeps: {
    exclude: ['@shikitor/core']
  },
  build: {
    rollupOptions: {
      external: ['shiki']
    }
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
