import type { ThemeRegistrationResolved } from '@shikijs/types'
import type { BundledLanguage, BundledTheme } from 'shiki'

import type { TokenizedLine } from './tokenSnapshot'

const MAX_CACHE_BYTES = 16 * 1024 * 1024
const MAX_ENTRIES = 8

interface SharedTokenSnapshot {
  language: BundledLanguage
  lines: TokenizedLine[]
  source: string
  theme: BundledTheme
  themeRegistration: ThemeRegistrationResolved
}

const sharedTokenSnapshots: Array<SharedTokenSnapshot & { bytes: number }> = []

function estimateBytes(snapshot: SharedTokenSnapshot) {
  return snapshot.source.length * 2 + snapshot.lines.reduce((total, line) => (
    total + 48 + line.tokens.reduce((tokenTotal, token) => (
      tokenTotal + 48 + token.content.length * 2
    ), 0)
  ), 0)
}

export function getSharedTokenSnapshot(
  source: string,
  theme: BundledTheme,
  language: BundledLanguage
) {
  const index = sharedTokenSnapshots.findIndex(snapshot => (
    snapshot.source === source
    && snapshot.theme === theme
    && snapshot.language === language
  ))
  if (index < 0) return undefined
  const [snapshot] = sharedTokenSnapshots.splice(index, 1)
  sharedTokenSnapshots.unshift(snapshot)
  return snapshot
}

export function setSharedTokenSnapshot(snapshot: SharedTokenSnapshot) {
  const bytes = estimateBytes(snapshot)
  if (bytes > MAX_CACHE_BYTES) return
  const previous = sharedTokenSnapshots.findIndex(entry => (
    entry.source === snapshot.source
    && entry.theme === snapshot.theme
    && entry.language === snapshot.language
  ))
  if (previous >= 0) sharedTokenSnapshots.splice(previous, 1)
  sharedTokenSnapshots.unshift({ ...snapshot, bytes })
  let total = sharedTokenSnapshots.reduce((sum, entry) => sum + entry.bytes, 0)
  while (sharedTokenSnapshots.length > MAX_ENTRIES || total > MAX_CACHE_BYTES) {
    total -= sharedTokenSnapshots.pop()!.bytes
  }
}

export function clearSharedTokenSnapshots() {
  sharedTokenSnapshots.length = 0
}
