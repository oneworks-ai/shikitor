interface UserAgentSpecificMemoryResult {
  bytes: number
}

type MemoryPerformance = Performance & {
  measureUserAgentSpecificMemory?: () => Promise<UserAgentSpecificMemoryResult>
}

export async function measureApplicationMemory(): Promise<number | undefined> {
  const scope = globalThis as typeof globalThis & { crossOriginIsolated?: boolean }
  const memoryPerformance = performance as MemoryPerformance
  if (!scope.crossOriginIsolated || !memoryPerformance.measureUserAgentSpecificMemory) {
    return undefined
  }
  try {
    const result = await memoryPerformance.measureUserAgentSpecificMemory()
    return Number.isFinite(result.bytes) ? result.bytes : undefined
  } catch {
    return undefined
  }
}

export function calculateMemoryDelta(before?: number, after?: number) {
  if (before === undefined || after === undefined) return undefined
  return after - before
}
