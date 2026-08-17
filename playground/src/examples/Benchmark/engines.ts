import type {
  BenchmarkAdapter,
  BenchmarkEngineDefinition,
  BenchmarkEngineId,
  BenchmarkShikitorMode
} from './types'

export const benchmarkEngines: readonly BenchmarkEngineDefinition[] = [
  {
    id: 'shikitor-less-dom',
    label: 'Shikitor',
    note: 'less DOM · Viewport paint · no token DOM',
    suites: ['editor']
  },
  {
    id: 'shikitor-all-dom',
    label: 'Shikitor',
    note: 'all DOM · Viewport token DOM',
    suites: ['editor', 'diff']
  },
  {
    id: 'monaco',
    label: 'Monaco Editor',
    note: '0.56 · standalone',
    suites: ['editor', 'diff']
  },
  {
    id: 'monaco-shiki',
    label: 'Monaco + Shiki',
    note: '0.56 · Shiki 4.4 TextMate',
    suites: ['editor']
  },
  {
    id: 'codemirror',
    label: 'CodeMirror 6',
    note: 'EditorView · MergeView',
    suites: ['editor', 'diff']
  },
  {
    id: 'pierre',
    label: 'Pierre Diffs',
    note: '1.3.1 · editable diff',
    suites: ['diff']
  }
]

export function benchmarkEnginesFor(mode: BenchmarkShikitorMode) {
  const selected = mode === 'less-dom'
    ? 'shikitor-less-dom'
    : 'shikitor-all-dom'
  return benchmarkEngines.filter(definition => (
    !definition.id.startsWith('shikitor-') || definition.id === selected
  ))
}

export function shikitorEngineId(mode: BenchmarkShikitorMode): BenchmarkEngineId {
  return mode === 'less-dom' ? 'shikitor-less-dom' : 'shikitor-all-dom'
}

const loadedEngines = new Set<BenchmarkEngineId | 'shikitor'>()

function moduleCacheKey(id: BenchmarkEngineId) {
  return id.startsWith('shikitor-') ? 'shikitor' : id
}

async function loadAdapter(id: BenchmarkEngineId): Promise<BenchmarkAdapter> {
  switch (id) {
    case 'shikitor-less-dom': return (await import('./adapters/shikitor-less-dom')).default
    case 'shikitor-all-dom': return (await import('./adapters/shikitor-all-dom')).default
    case 'monaco': return (await import('./adapters/monaco')).default
    case 'monaco-shiki': return (await import('./adapters/monaco-shiki')).default
    case 'codemirror': return (await import('./adapters/codemirror')).default
    case 'pierre': return (await import('./adapters/pierre')).default
  }
}

export async function loadBenchmarkAdapter(
  id: BenchmarkEngineId,
  config: Parameters<NonNullable<BenchmarkAdapter['prepare']>>[0]
) {
  const cacheKey = moduleCacheKey(id)
  const moduleCached = loadedEngines.has(cacheKey)
  const started = performance.now()
  const adapter = await loadAdapter(id)
  await adapter.prepare?.(config)
  const moduleLoad = performance.now() - started
  loadedEngines.add(cacheKey)
  return { adapter, moduleCached, moduleLoad }
}
