import type {
  BenchmarkAdapter,
  BenchmarkConfig,
  BenchmarkDataset,
  BenchmarkEngineDefinition,
  BenchmarkProgress,
  BenchmarkResult
} from './types'
import { loadBenchmarkAdapter } from './engines'
import type { LifecycleMeasurement } from './measurement'
import { firstUsableDuration, observeMainThreadBlocking } from './measurement'
import { calculateMemoryDelta, measureApplicationMemory } from './memory'
import { resourceEntryCount, resourceUsageSince } from './resources'

function abortError() {
  return new DOMException('Benchmark stopped', 'AbortError')
}
function assertActive(signal: AbortSignal) {
  if (signal.aborted) throw abortError()
}
async function nextPaint(signal: AbortSignal) {
  assertActive(signal)
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  assertActive(signal)
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  assertActive(signal)
}
function percentile(values: number[], ratio: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]
}
function measureAverage(iterations: number, action: (index: number) => void) {
  const started = performance.now()
  for (let index = 0; index < iterations; index++) action(index)
  return (performance.now() - started) / iterations
}
function countDOMNodes(root: ParentNode): number {
  const elements = [...root.querySelectorAll<HTMLElement>('*')]
  return elements.length + elements.reduce((total, element) => (
    total + (element.shadowRoot ? countDOMNodes(element.shadowRoot) : 0)
  ), 0)
}
async function paintedAt(started: number, signal: AbortSignal) {
  await nextPaint(signal)
  return performance.now() - started
}
async function measureLifecycle(
  mount: () => ReturnType<BenchmarkAdapter['mount']>,
  signal: AbortSignal
) {
  const blocking = observeMainThreadBlocking()
  const started = performance.now()
  try {
    const instance = await mount()
    const shellReady = performance.now() - started
    const firstPaint = await paintedAt(started, signal)
    let viewportSyntax: number | undefined
    let fullSyntax: number | undefined

    if (instance.waitForViewportSyntax) {
      await instance.waitForViewportSyntax()
      viewportSyntax = await paintedAt(started, signal)
    }
    if (instance.waitForFullSyntax) {
      await instance.waitForFullSyntax()
      fullSyntax = performance.now() - started
    }

    const endTime = started + (fullSyntax ?? viewportSyntax ?? firstPaint)
    const measurement: LifecycleMeasurement = {
      firstPaint,
      fullSyntax,
      mainThreadBlocking: blocking?.finish(started, endTime),
      shellReady,
      viewportSyntax
    }
    return {
      instance,
      measurement,
      syntaxProfile: instance.readSyntaxProfile?.()
    }
  } catch (error) {
    blocking?.cancel()
    throw error
  }
}
export async function runBenchmarkEngine({
  config,
  dataset,
  definition,
  signal,
  stage,
  onProgress
}: {
  config: BenchmarkConfig
  dataset: BenchmarkDataset
  definition: BenchmarkEngineDefinition
  signal: AbortSignal
  stage: HTMLElement
  onProgress(phase: BenchmarkProgress['phase']): void
}): Promise<BenchmarkResult> {
  if (!definition.suites.includes(config.suite)) {
    return { engine: definition.id, status: 'unsupported' }
  }
  let instance: Awaited<ReturnType<BenchmarkAdapter['mount']>> | undefined
  try {
    assertActive(signal)
    stage.replaceChildren()
    onProgress('memory')
    const memoryBefore = await measureApplicationMemory()
    assertActive(signal)
    onProgress('load')
    const resourceStart = resourceEntryCount()
    const { adapter, moduleCached, moduleLoad } = await loadBenchmarkAdapter(
      definition.id,
      config
    )
    assertActive(signal)
    onProgress('mount')
    const cold = await measureLifecycle(
      () => adapter.mount({ config, container: stage, dataset }),
      signal
    )
    instance = cold.instance
    const sdkUsage = resourceUsageSince(resourceStart)

    instance.dispose()
    instance = undefined
    stage.replaceChildren()
    await nextPaint(signal)
    const warm = await measureLifecycle(
      () => adapter.mount({ config, container: stage, dataset }),
      signal
    )
    instance = warm.instance

    onProgress('edit')
    const editSamples: number[] = []
    for (let index = 0; index < config.iterations; index++) {
      assertActive(signal)
      const started = performance.now()
      await instance.insertText(String(index % 10))
      await nextPaint(signal)
      editSamples.push(performance.now() - started)
    }
    if (instance.waitForFullSyntax) await instance.waitForFullSyntax()
    onProgress('scroll')
    const scrollStarted = performance.now()
    await instance.scrollTo(1)
    await nextPaint(signal)
    const scroll = performance.now() - scrollStarted
    onProgress('native')
    const valueLength = instance.readValue?.().length ?? dataset.current.length
    let readChecksum = 0
    const valueRead = instance.readValue
      ? measureAverage(10_000, () => { readChecksum ^= instance!.readValue!().length })
      : undefined
    void readChecksum
    const selectionUpdate = instance.setSelection
      ? measureAverage(500, index => {
          const start = index % Math.max(1, valueLength - 1)
          instance!.setSelection!(start, Math.min(valueLength, start + 1))
        })
      : undefined
    const replaceStarted = performance.now()
    if (instance.replaceValue) {
      await instance.replaceValue(dataset.current.replaceAll('const ', 'let   '))
    }
    const replaceValue = instance.replaceValue
      ? performance.now() - replaceStarted
      : undefined
    await nextPaint(signal)
    onProgress('memory')
    const memoryAfter = await measureApplicationMemory()
    assertActive(signal)

    return {
      domNodes: countDOMNodes(stage),
      editP50: percentile(editSamples, .5),
      editP95: percentile(editSamples, .95),
      engine: definition.id,
      firstPaintCold: cold.measurement.firstPaint,
      firstPaintWarm: warm.measurement.firstPaint,
      firstUsableCold: firstUsableDuration(
        moduleLoad,
        cold.measurement.viewportSyntax
      ),
      fullSyntaxCold: cold.measurement.fullSyntax,
      fullSyntaxWarm: warm.measurement.fullSyntax,
      mainThreadBlockingCold: cold.measurement.mainThreadBlocking,
      mainThreadBlockingWarm: warm.measurement.mainThreadBlocking,
      memoryDelta: calculateMemoryDelta(memoryBefore, memoryAfter),
      moduleCached,
      moduleLoad,
      nativeTextarea: instance.nativeTextarea,
      replaceValue,
      renderer: instance.renderer,
      sdkDecodedBytes: sdkUsage.decoded,
      sdkEncodedBytes: sdkUsage.encoded,
      sdkResourceCount: sdkUsage.resources,
      sdkTransferBytes: sdkUsage.transfer,
      selectionUpdate,
      shellReadyCold: cold.measurement.shellReady,
      shellReadyWarm: warm.measurement.shellReady,
      scroll,
      status: 'complete',
      syntaxProfileCold: cold.syntaxProfile,
      syntaxProfileWarm: warm.syntaxProfile,
      valueRead,
      viewportSyntaxCold: cold.measurement.viewportSyntax,
      viewportSyntaxWarm: warm.measurement.viewportSyntax
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    if (error instanceof Error && error.name === 'BenchmarkUnsupportedError') {
      return { engine: definition.id, error: error.message, status: 'unsupported' }
    }
    return {
      engine: definition.id,
      error: error instanceof Error ? error.message : String(error),
      status: 'error'
    }
  } finally {
    instance?.dispose()
    stage.replaceChildren()
  }
}
