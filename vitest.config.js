import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      reporter: [
        'html',
        'json',
        'json-summary'
      ]
    },
    include: [
      'packages/**/tests/**/*.spec.ts',
      'playground/tests/**/*.spec.ts'
    ],
    exclude: [...configDefaults.exclude, 'vendors/**'],
    typecheck: {
      include: [
        'packages/**/tests/**/*.spec.ts',
        'playground/tests/**/*.spec.ts'
      ],
      exclude: [...configDefaults.exclude, 'vendors/**']
    }
  },
  esbuild: {
    target: 'es2019'
  },
  plugins: []
})
