import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

const sessionLinkPattern = /\[((?:\\.|[^\]\\])*)\]\((deepseekharness:\/\/sessions\/([^\s)]+))\)/gu

export interface SessionLinkReference {
  readonly destination: string
  readonly end: number
  readonly label: string
  readonly sessionId: SessionId
  readonly start: number
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/[\\\[\]]/gu, character => `\\${character}`)
}

function unescapeMarkdownLabel(value: string): string {
  return value.replace(/\\([\\\[\]])/gu, '$1')
}

function decodeSessionId(value: string): SessionId | undefined {
  try {
    const decoded = decodeURIComponent(value)
    return decoded === '' ? undefined : decoded as SessionId
  } catch {
    return
  }
}

/** Serialize one catalog session as the stable DSH deep-link Markdown form. */
export function createSessionLink(title: string, sessionId: SessionId): string {
  const destination = `deepseekharness://sessions/${encodeURIComponent(String(sessionId))}`
  return `[${escapeMarkdownLabel(title)}](${destination})`
}

/** Parse only the stable session-link protocol owned by this integration. */
export function parseSessionLinks(value: string): SessionLinkReference[] {
  return Array.from(value.matchAll(sessionLinkPattern)).flatMap(match => {
    const label = unescapeMarkdownLabel(match[1] ?? '')
    const destination = match[2] ?? ''
    const sessionId = decodeSessionId(match[3] ?? '')
    const start = match.index ?? 0
    if (label === '' || sessionId === undefined) return []
    return [{ start, end: start + match[0].length, label, destination, sessionId }]
  })
}
