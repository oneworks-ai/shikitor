export function resourceEntryCount() {
  return performance.getEntriesByType('resource').length
}

export function summarizeResourceUsage(entries: Array<Pick<
  PerformanceResourceTiming,
  'decodedBodySize' | 'encodedBodySize' | 'transferSize'
>>) {
  return entries.reduce((usage, entry) => ({
    decoded: usage.decoded + entry.decodedBodySize,
    encoded: usage.encoded + entry.encodedBodySize,
    resources: usage.resources + 1,
    transfer: usage.transfer + entry.transferSize
  }), { decoded: 0, encoded: 0, resources: 0, transfer: 0 })
}

export function resourceUsageSince(index: number) {
  const entries = performance
    .getEntriesByType('resource')
    .slice(index) as PerformanceResourceTiming[]
  return summarizeResourceUsage(entries)
}
