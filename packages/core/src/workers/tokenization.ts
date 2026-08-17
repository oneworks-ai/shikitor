import { clearSharedTokenSnapshots } from '../creator/controlled/sharedTokenSnapshot'
import { createIncrementalHighlighter } from '../creator/controlled/incrementalHighlighter'
import {
  disposeSharedHighlighter,
  prewarmSharedHighlighter
} from '../creator/controlled/sharedHighlighter'
import type { TokenSnapshot } from '../creator/controlled/tokenSnapshot'
import type {
  SyntaxWorkerCommand,
  SyntaxWorkerEvent,
  SyntaxWorkerSnapshot
} from '../syntaxWorkerProtocol'

interface WorkerSession {
  highlighter: ReturnType<typeof createIncrementalHighlighter>
  version: number
}

interface WorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<SyntaxWorkerCommand>) => void
  ): void
  postMessage(event: SyntaxWorkerEvent): void
}

const scope = globalThis as unknown as WorkerScope
const sessions = new Map<string, WorkerSession>()

function serializableSnapshot(
  snapshot: TokenSnapshot,
  workerStarted: number,
  setupMs: number,
  completedViewportEnd = 0
): SyntaxWorkerSnapshot {
  const start = snapshot.complete
    ? Math.max(snapshot.changedFrom, completedViewportEnd)
    : snapshot.lineOffset
  const end = snapshot.complete ? snapshot.lineCount : snapshot.lines.length
  const lines = snapshot.complete
    ? snapshot.lines.slice(start, end)
    : snapshot.lines
  const workerMs = performance.now() - workerStarted
  const serializeStarted = performance.now()
  const serializedLines = lines.map(({ tokenized, tokens }) => ({
    tokenized,
    tokens
  }))
  const serializeMs = performance.now() - serializeStarted
  return {
    changedFrom: snapshot.changedFrom,
    complete: snapshot.complete,
    lineCount: snapshot.lineCount,
    lineOffset: start,
    lines: serializedLines,
    theme: snapshot.theme,
    timing: {
      serializedLines: serializedLines.length,
      serializeMs,
      setupMs,
      tokenizeMs: Math.max(0, workerMs - setupMs),
      workerMs
    }
  }
}

function sessionFor(id: string) {
  let session = sessions.get(id)
  if (!session) {
    session = { highlighter: createIncrementalHighlighter(), version: 0 }
    sessions.set(id, session)
  }
  return session
}

async function reset() {
  for (const session of sessions.values()) session.highlighter.dispose()
  sessions.clear()
  clearSharedTokenSnapshots()
  await disposeSharedHighlighter()
}

scope.addEventListener('message', ({ data }) => {
  if (data.type === 'dispose-session') {
    const session = sessions.get(data.sessionId)
    session?.highlighter.dispose()
    sessions.delete(data.sessionId)
    return
  }
  void (async () => {
    try {
      if (data.type === 'reset') {
        await reset()
        scope.postMessage({ id: data.id, type: 'ready' })
        return
      }
      if (data.type === 'preload') {
        await prewarmSharedHighlighter(data.theme, data.language)
        scope.postMessage({ id: data.id, type: 'ready' })
        return
      }
      const workerStarted = performance.now()
      let setupMs = 0
      let completedViewportEnd = 0
      const session = sessionFor(data.sessionId)
      const version = ++session.version
      const isCurrent = () => sessions.get(data.sessionId) === session
        && session.version === version
      const snapshot = await session.highlighter.tokenize(
        data.value,
        data.theme,
        data.language,
        isCurrent,
        {
          batchSize: 256,
          onHighlighterReady(duration) {
            setupMs = duration
          },
          onViewportReady(viewport) {
            if (!isCurrent()) return
            const snapshot = serializableSnapshot(
              viewport,
              workerStarted,
              setupMs
            )
            completedViewportEnd = snapshot.lineOffset + snapshot.lines.length
            scope.postMessage({
              id: data.id,
              snapshot,
              type: 'viewport'
            })
          },
          viewportLines: data.type === 'tokenize'
            ? data.viewportLines ?? 32
            : 32
        }
      )
      if (!snapshot || !isCurrent()) {
        scope.postMessage({ id: data.id, type: 'ready' })
        return
      }
      if (data.type === 'seed') {
        scope.postMessage({ id: data.id, type: 'ready' })
        return
      }
      scope.postMessage({
        id: data.id,
        snapshot: serializableSnapshot(
          snapshot,
          workerStarted,
          setupMs,
          completedViewportEnd
        ),
        type: 'complete'
      })
    } catch (error) {
      scope.postMessage({
        error: error instanceof Error ? error.message : String(error),
        id: data.id,
        type: 'error'
      })
    }
  })()
})
