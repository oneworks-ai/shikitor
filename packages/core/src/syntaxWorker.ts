import type { BundledLanguage, BundledTheme } from 'shiki'

import { createDocumentLines } from './creator/controlled/documentLines'
import type { DocumentLines } from './creator/controlled/documentLines'
import type {
  SyntaxWorkerPhaseProfile,
  SyntaxWorkerProfile,
  TokenizeOptions,
  TokenSnapshot
} from './creator/controlled/tokenSnapshot'
import type {
  SyntaxWorkerCommand,
  SyntaxWorkerEvent,
  SyntaxWorkerSnapshot
} from './syntaxWorkerProtocol'

export type {
  SyntaxWorkerPhaseProfile,
  SyntaxWorkerProfile
} from './creator/controlled/tokenSnapshot'

const MAX_COMPLETED_SNAPSHOTS = 2

export interface ShikitorSyntaxWorkerSession {
  dispose(): void
  tokenize(
    value: string,
    theme: BundledTheme,
    language: BundledLanguage,
    isCurrent: () => boolean,
    options?: TokenizeOptions
  ): Promise<TokenSnapshot | undefined>
}

export interface ShikitorSyntaxWorker {
  createSession(): ShikitorSyntaxWorkerSession
  dispose(): void
  preload(theme: BundledTheme, language: BundledLanguage): Promise<void>
  reset(): Promise<void>
}

interface PendingRequest {
  onViewport?(snapshot: ReceivedSnapshot): void
  reject(error: Error): void
  requestStarted: number
  resolve(snapshot?: ReceivedSnapshot): void
}

interface ReceivedSnapshot {
  receivedAt: number
  requestStarted: number
  snapshot: SyntaxWorkerSnapshot
}

type RequestCommand<T = Extract<SyntaxWorkerCommand, { id: number }>> =
  T extends { id: number } ? Omit<T, 'id'> : never

export function createShikitorSyntaxWorker(worker: Worker): ShikitorSyntaxWorker {
  let disposed = false
  let nextId = 0
  let nextSessionId = 0
  const pending = new Map<number, PendingRequest>()
  const completed: Array<{
    language: BundledLanguage
    snapshot: TokenSnapshot
    source: string
    theme: BundledTheme
  }> = []

  const rejectPending = (message: string) => {
    for (const request of pending.values()) request.reject(new Error(message))
    pending.clear()
  }
  worker.addEventListener('error', event => rejectPending(event.message))
  worker.addEventListener('message', ({ data }: MessageEvent<SyntaxWorkerEvent>) => {
    const request = pending.get(data.id)
    if (!request) return
    if (data.type === 'viewport') {
      request.onViewport?.({
        receivedAt: performance.now(),
        requestStarted: request.requestStarted,
        snapshot: data.snapshot
      })
      return
    }
    pending.delete(data.id)
    if (data.type === 'error') request.reject(new Error(data.error))
    else request.resolve(data.type === 'complete' ? {
      receivedAt: performance.now(),
      requestStarted: request.requestStarted,
      snapshot: data.snapshot
    } : undefined)
  })

  function request(
    command: RequestCommand,
    onViewport?: PendingRequest['onViewport']
  ) {
    if (disposed) return Promise.reject(new Error('Syntax worker is disposed'))
    const id = ++nextId
    const requestStarted = performance.now()
    return new Promise<ReceivedSnapshot | undefined>((resolve, reject) => {
      pending.set(id, { onViewport, reject, requestStarted, resolve })
      worker.postMessage({ ...command, id } as SyntaxWorkerCommand)
    })
  }

  return {
    createSession() {
      const sessionId = `syntax-${++nextSessionId}`
      let active = true
      let cachedLines: TokenSnapshot['lines'] = []
      let cachedDocument: DocumentLines | undefined
      let syntaxWorkerProfile: SyntaxWorkerProfile = {}
      let exactSnapshot: {
        language: BundledLanguage
        snapshot: TokenSnapshot
        source: string
        theme: BundledTheme
      } | undefined
      let pendingSeed: Promise<ReceivedSnapshot | undefined> | undefined
      const hydrate = (
        received: ReceivedSnapshot,
        value: string,
        documentOption?: DocumentLines
      ): TokenSnapshot => {
        const hydrateStarted = performance.now()
        const { snapshot } = received
        const document = documentOption?.value === value
          ? documentOption
          : cachedDocument?.value === value
            ? cachedDocument
            : createDocumentLines(value)
        cachedDocument = document
        const segment = snapshot.lines.map((line, index) => ({
          ...line,
          source: document.lineAt(snapshot.lineOffset + index)
        }))
        const phase: SyntaxWorkerPhaseProfile = {
          bridgeMs: Math.max(
            0,
            received.receivedAt
            - received.requestStarted
            - snapshot.timing.workerMs
            - snapshot.timing.serializeMs
          ),
          hydrateMs: 0,
          serializedLines: snapshot.timing.serializedLines,
          serializeMs: snapshot.timing.serializeMs,
          setupMs: snapshot.timing.setupMs,
          tokenizeMs: snapshot.timing.tokenizeMs,
          workerMs: snapshot.timing.workerMs
        }
        if (!snapshot.complete) {
          const lines = cachedLines.slice()
          for (let index = 0; index < segment.length; index++) {
            lines[snapshot.lineOffset + index] = segment[index]
          }
          cachedLines = lines
          phase.hydrateMs = performance.now() - hydrateStarted
          syntaxWorkerProfile = { viewport: phase }
          return {
            ...snapshot,
            document,
            lines: segment,
            syntaxWorkerProfile
          }
        }
        const lines = cachedLines.length
          ? cachedLines.slice(0, snapshot.lineOffset)
          : []
        lines.push(...segment)
        lines.length = snapshot.lineCount
        cachedLines = lines
        phase.hydrateMs = performance.now() - hydrateStarted
        syntaxWorkerProfile = { ...syntaxWorkerProfile, complete: phase }
        return {
          ...snapshot,
          document,
          lineOffset: 0,
          lines,
          syntaxWorkerProfile
        }
      }
      return {
        dispose() {
          if (!active || disposed) return
          active = false
          worker.postMessage({ sessionId, type: 'dispose-session' } satisfies SyntaxWorkerCommand)
        },
        async tokenize(value, theme, language, isCurrent, options) {
          if (!active || !isCurrent()) return undefined
          if (
            exactSnapshot?.source === value
            && exactSnapshot.theme === theme
            && exactSnapshot.language === language
          ) {
            return {
              ...exactSnapshot.snapshot,
              syntaxWorkerProfile: { cacheHit: true }
            }
          }
          if (pendingSeed) {
            const seed = pendingSeed
            pendingSeed = undefined
            await seed
            if (!active || !isCurrent()) return undefined
          }
          const cached = completed.find(entry => (
            entry.source === value
            && entry.theme === theme
            && entry.language === language
          ))
          if (cached && !cachedLines.length) {
            cachedLines = cached.snapshot.lines
            cachedDocument = cached.snapshot.document
            const snapshot = {
              ...cached.snapshot,
              syntaxWorkerProfile: { cacheHit: true }
            }
            exactSnapshot = { ...cached, snapshot }
            pendingSeed = request({
              language,
              sessionId,
              theme,
              type: 'seed',
              value
            })
            void pendingSeed.catch(() => {})
            return active && isCurrent() ? snapshot : undefined
          }
          const snapshot = await request(
            {
              language,
              sessionId,
              theme,
              type: 'tokenize',
              value,
              viewportLines: options?.viewportLines
            },
            viewport => {
              if (active) {
                const hydrated = hydrate(viewport, value, options?.document)
                if (isCurrent()) options?.onViewportReady?.(hydrated)
              }
            }
          )
          if (!snapshot) return undefined
          const hydrated = hydrate(snapshot, value, options?.document)
          exactSnapshot = { language, snapshot: hydrated, source: value, theme }
          const previous = completed.findIndex(entry => (
            entry.source === value
            && entry.theme === theme
            && entry.language === language
          ))
          if (previous >= 0) completed.splice(previous, 1)
          completed.unshift({ language, snapshot: hydrated, source: value, theme })
          completed.splice(MAX_COMPLETED_SNAPSHOTS)
          return active && isCurrent() ? hydrated : undefined
        }
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      rejectPending('Syntax worker was disposed')
      worker.terminate()
    },
    async preload(theme, language) {
      await request({ language, theme, type: 'preload' })
    },
    async reset() {
      completed.length = 0
      await request({ type: 'reset' })
    }
  }
}
