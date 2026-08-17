import type { ShikitorSyntaxWorker } from '../../syntaxWorker'
import { createIncrementalHighlighter } from './incrementalHighlighter'
import type { TokenizeOptions } from './tokenSnapshot'

const MAIN_THREAD_MAX_CHARACTERS = 32 * 1024
const MAIN_THREAD_MAX_LINES = 128
const MAIN_THREAD_YIELD_BUDGET_MS = 8

export type SyntaxExecutionLane = 'main-thread' | 'worker'

function exceedsMainThreadLineLimit(value: string) {
  let lineCount = 1
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) !== 10) continue
    if (++lineCount > MAIN_THREAD_MAX_LINES) return true
  }
  return false
}

async function yieldUntilInitialPaint() {
  if (typeof requestAnimationFrame === 'undefined') return
  await new Promise<void>(resolve => requestAnimationFrame(() => {
    requestAnimationFrame(() => setTimeout(resolve, 0))
  }))
}

export function resolveSyntaxExecutionLane(
  value: string,
  options: TokenizeOptions,
  workerAvailable: boolean
): SyntaxExecutionLane {
  if (!workerAvailable) return 'main-thread'
  if (value.length > MAIN_THREAD_MAX_CHARACTERS) return 'worker'
  const lineCount = options.document?.lineCount
  if (lineCount !== undefined) {
    return lineCount > MAIN_THREAD_MAX_LINES ? 'worker' : 'main-thread'
  }
  return exceedsMainThreadLineLimit(value) ? 'worker' : 'main-thread'
}

export function createWorkerIncrementalHighlighter(
  syntaxWorker?: ShikitorSyntaxWorker,
  onExecutionLane?: (lane: SyntaxExecutionLane) => void
): ReturnType<typeof createIncrementalHighlighter> {
  const local = createIncrementalHighlighter()
  const session = syntaxWorker?.createSession()
  let localStarted = false
  let workerAvailable = Boolean(session)

  return {
    codeToHtml: local.codeToHtml,
    dispose() {
      session?.dispose()
      local.dispose()
    },
    async tokenize(...args: Parameters<typeof local.tokenize>) {
      const [value, theme, language, isCurrent, options = {}] = args
      const lane = resolveSyntaxExecutionLane(value, options, workerAvailable)
      onExecutionLane?.(lane)
      if (lane === 'worker' && session) {
        try {
          return await session.tokenize(...args)
        } catch (error) {
          workerAvailable = false
          onExecutionLane?.('main-thread')
          console.warn('Shikitor syntax worker failed; using main thread.', error)
        }
      }
      if (!localStarted) {
        localStarted = true
        await yieldUntilInitialPaint()
        if (!isCurrent()) return undefined
      }
      return local.tokenize(value, theme, language, isCurrent, {
        ...options,
        yieldBudgetMs: MAIN_THREAD_YIELD_BUDGET_MS
      })
    }
  }
}
