export interface LifecycleMeasurement {
  firstPaint: number
  fullSyntax?: number
  mainThreadBlocking?: number
  shellReady: number
  viewportSyntax?: number
}

interface TimedEntry {
  duration: number
  startTime: number
}

export function phaseDuration(current?: number, previous = 0) {
  return current === undefined ? undefined : Math.max(0, current - previous)
}

export function firstUsableDuration(
  moduleLoad?: number,
  viewportSyntax?: number
) {
  return moduleLoad === undefined || viewportSyntax === undefined
    ? undefined
    : moduleLoad + viewportSyntax
}

export function calculateTotalBlockingTime(
  entries: TimedEntry[],
  startTime: number,
  endTime: number
) {
  return entries.reduce((total, entry) => {
    const blockingStart = entry.startTime + 50
    const overlapStart = Math.max(startTime, blockingStart)
    const overlapEnd = Math.min(endTime, entry.startTime + entry.duration)
    return total + Math.max(0, overlapEnd - overlapStart)
  }, 0)
}

export function observeMainThreadBlocking() {
  if (
    typeof PerformanceObserver === 'undefined'
    || !PerformanceObserver.supportedEntryTypes.includes('longtask')
  ) return undefined
  const entries: PerformanceEntry[] = []
  const observer = new PerformanceObserver(list => entries.push(...list.getEntries()))
  try {
    observer.observe({ entryTypes: ['longtask'] })
  } catch {
    observer.disconnect()
    return undefined
  }
  return {
    cancel() { observer.disconnect() },
    finish(startTime: number, endTime: number) {
      entries.push(...observer.takeRecords())
      observer.disconnect()
      return calculateTotalBlockingTime(entries, startTime, endTime)
    }
  }
}
