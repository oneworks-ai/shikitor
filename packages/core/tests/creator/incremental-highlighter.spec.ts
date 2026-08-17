import { describe, expect, test } from 'vitest'

import { createDocumentLines } from '../../src/creator/controlled/documentLines'
import { createIncrementalHighlighter } from '../../src/creator/controlled/incrementalHighlighter'
import { getSharedHighlighter } from '../../src/creator/controlled/sharedHighlighter'
import {
  createWorkerIncrementalHighlighter,
  resolveSyntaxExecutionLane
} from '../../src/creator/controlled/workerIncrementalHighlighter'
import type { ShikitorSyntaxWorker } from '../../src/syntaxWorker'

describe('incremental highlighter', () => {
  test('routes bounded documents locally and large documents to the worker', () => {
    const localDocument = createDocumentLines(Array.from(
      { length: 128 },
      (_, index) => `const item${index} = ${index}`
    ).join('\n'))
    const workerDocument = createDocumentLines(`${localDocument.value}\nconst overflow = true`)

    expect(resolveSyntaxExecutionLane(
      localDocument.value,
      { document: localDocument },
      true
    )).toBe('main-thread')
    expect(resolveSyntaxExecutionLane(
      workerDocument.value,
      { document: workerDocument },
      true
    )).toBe('worker')
    expect(resolveSyntaxExecutionLane('x'.repeat(32 * 1024 + 1), {}, true)).toBe('worker')
    expect(resolveSyntaxExecutionLane(workerDocument.value, {}, false)).toBe('main-thread')
  })

  test('executes the selected syntax lane', async () => {
    let workerCalls = 0
    const lanes: string[] = []
    const syntaxWorker = {
      createSession() {
        return {
          dispose() {},
          async tokenize() {
            workerCalls++
            return undefined
          }
        }
      },
      dispose() {},
      async preload() {},
      async reset() {}
    } satisfies ShikitorSyntaxWorker
    const highlighter = createWorkerIncrementalHighlighter(
      syntaxWorker,
      lane => lanes.push(lane)
    )

    const local = await highlighter.tokenize(
      'const local = true',
      'github-light',
      'typescript',
      () => true
    )
    const large = Array.from({ length: 129 }, (_, index) => `const line${index} = ${index}`).join('\n')
    await highlighter.tokenize(
      large,
      'github-light',
      'typescript',
      () => true,
      { document: createDocumentLines(large) }
    )

    expect(local?.complete).toBe(true)
    expect(workerCalls).toBe(1)
    expect(lanes).toEqual(['main-thread', 'worker'])
    highlighter.dispose()
  })

  test('reuses unchanged prefix lines and retokenizes the edited suffix', async () => {
    const highlighter = createIncrementalHighlighter()
    const current = () => true
    const first = await highlighter.tokenize(
      'const first = 1\nconst second = 2\nreturn second',
      'github-light',
      'typescript',
      current
    )
    const second = await highlighter.tokenize(
      'const first = 1\nconst second = 2\nreturn second + 1',
      'github-light',
      'typescript',
      current
    )

    expect(first?.changedFrom).toBe(0)
    expect(second?.changedFrom).toBe(2)
    expect(second?.lines[0]).toBe(first?.lines[0])
    expect(second?.lines[1]).toBe(first?.lines[1])
    expect(second?.lines[2]).not.toBe(first?.lines[2])
    highlighter.dispose()
  })

  test('does not publish a stale tokenization', async () => {
    const highlighter = createIncrementalHighlighter()
    const result = await highlighter.tokenize(
      'const stale = true',
      'github-dark',
      'typescript',
      () => false
    )

    expect(result).toBeUndefined()
    highlighter.dispose()
  })

  test('shares an exact token snapshot with a later editor instance', async () => {
    const source = 'const shared = true\nexport default shared'
    const firstHighlighter = createIncrementalHighlighter()
    const first = await firstHighlighter.tokenize(
      source,
      'github-light',
      'typescript',
      () => true
    )
    firstHighlighter.dispose()

    const secondHighlighter = createIncrementalHighlighter()
    const second = await secondHighlighter.tokenize(
      source,
      'github-light',
      'typescript',
      () => true
    )

    expect(second?.changedFrom).toBe(0)
    expect(second?.lines).toBe(first?.lines)
    secondHighlighter.dispose()
  })

  test('restarts a large document from its nearest grammar checkpoint', async () => {
    const highlighter = createIncrementalHighlighter()
    const current = () => true
    const source = Array.from({ length: 1000 }, (_, index) => (
      `export const value${index} = ${index}`
    )).join('\n')
    const first = await highlighter.tokenize(
      source,
      'github-light',
      'typescript',
      current
    )
    const second = await highlighter.tokenize(
      `${source} + 1`,
      'github-light',
      'typescript',
      current
    )

    expect(second?.changedFrom).toBe(960)
    expect(second?.lines[959]).toBe(first?.lines[959])
    expect(second?.lines[999]).not.toBe(first?.lines[999])
    highlighter.dispose()
  })

  test('matches full-document grammar across block boundaries', async () => {
    const highlighter = createIncrementalHighlighter()
    const prefix = Array.from({ length: 63 }, (_, index) => `const p${index} = ${index}`)
    const source = [
      ...prefix,
      '/* comment crossing the checkpoint',
      'still a comment */',
      ...Array.from({ length: 70 }, (_, index) => `const s${index} = ${index}`)
    ].join('\n')
    const snapshot = await highlighter.tokenize(
      source,
      'github-light',
      'typescript',
      () => true
    )
    const referenceHighlighter = await getSharedHighlighter(
      'github-light',
      'typescript'
    )
    const reference = referenceHighlighter.codeToTokensBase(source, {
      lang: 'typescript',
      theme: 'github-light'
    })
    let lineOffset = 0
    const normalizedReference = reference.map((tokens, index) => {
      const normalized = tokens.map(token => ({
        ...token,
        offset: token.offset - lineOffset
      }))
      lineOffset += source.split('\n')[index].length + 1
      return normalized
    })

    expect(snapshot?.lines.map(line => line.tokens)).toEqual(normalizedReference)
    highlighter.dispose()
  })

  test('publishes a viewport snapshot before finishing a large document', async () => {
    const highlighter = createIncrementalHighlighter()
    const source = Array.from({ length: 200 }, (_, index) => (
      `export const item${index} = ${index}`
    )).join('\n')
    const indexedDocument = createDocumentLines(source)
    let maximumLineRead = -1
    let maximumLineReadAtViewport = -1
    const document = {
      ...indexedDocument,
      lineAt(index: number) {
        maximumLineRead = Math.max(maximumLineRead, index)
        return indexedDocument.lineAt(index)
      }
    }
    const viewportSnapshots: NonNullable<Awaited<ReturnType<
      typeof highlighter.tokenize
    >>>[] = []
    const complete = await highlighter.tokenize(
      source,
      'github-light',
      'typescript',
      () => true,
      {
        batchSize: 128,
        document,
        onViewportReady(snapshot) {
          maximumLineReadAtViewport = maximumLineRead
          viewportSnapshots.push(snapshot)
        },
        viewportLines: 32
      }
    )

    expect(viewportSnapshots).toHaveLength(1)
    expect(viewportSnapshots[0].complete).toBe(false)
    expect(viewportSnapshots[0].lineCount).toBe(200)
    expect(viewportSnapshots[0].lines).toHaveLength(32)
    expect(viewportSnapshots[0].lines[0].tokenized).toBe(true)
    expect(viewportSnapshots[0].lines[31].tokenized).toBe(true)
    expect(maximumLineReadAtViewport).toBe(31)
    expect(complete?.complete).toBe(true)
    expect(complete?.lines.every(line => line.tokenized !== false)).toBe(true)
    highlighter.dispose()
  })
})
