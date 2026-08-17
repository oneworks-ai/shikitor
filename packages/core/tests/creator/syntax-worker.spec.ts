import { describe, expect, test } from 'vitest'
import type { ThemeRegistrationResolved } from '@shikijs/types'

import { createShikitorSyntaxWorker } from '../../src/syntaxWorker'
import type { SyntaxWorkerCommand, SyntaxWorkerEvent } from '../../src/syntaxWorkerProtocol'

const theme: ThemeRegistrationResolved = {
  bg: '#fff',
  fg: '#000',
  name: 'test',
  settings: [],
  type: 'light'
}

class FakeWorker extends EventTarget {
  commands: SyntaxWorkerCommand[] = []
  terminated = false

  postMessage(command: SyntaxWorkerCommand) {
    this.commands.push(command)
    queueMicrotask(() => {
      if (command.type === 'dispose-session') return
      if (command.type !== 'tokenize') {
        this.respond({ id: command.id, type: 'ready' })
        return
      }
      const sources = command.value.split('\n')
      const changedFrom = command.value.includes('updated') ? 1 : 0
      const viewportEnd = Math.min(sources.length, changedFrom + 1)
      this.respond({
        id: command.id,
        snapshot: {
          changedFrom,
          complete: false,
          lineCount: sources.length,
          lineOffset: changedFrom,
          lines: [tokenLine(sources[changedFrom])],
          theme,
          timing: {
            serializedLines: 1,
            serializeMs: 2,
            setupMs: 3,
            tokenizeMs: 2,
            workerMs: 5
          }
        },
        type: 'viewport'
      })
      this.respond({
        id: command.id,
        snapshot: {
          changedFrom,
          complete: true,
          lineCount: sources.length,
          lineOffset: viewportEnd,
          lines: sources.slice(viewportEnd).map(tokenLine),
          theme,
          timing: {
            serializedLines: sources.length - viewportEnd,
            serializeMs: 3,
            setupMs: 3,
            tokenizeMs: 5,
            workerMs: 8
          }
        },
        type: 'complete'
      })
    })
  }

  respond(data: SyntaxWorkerEvent) {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }

  terminate() {
    this.terminated = true
  }
}

function tokenLine(source: string) {
  return {
    source,
    tokenized: true,
    tokens: [{ content: source, offset: 0 }]
  }
}

describe('syntax worker client', () => {
  test('hydrates viewport and suffix deltas into complete snapshots', async () => {
    const worker = new FakeWorker()
    const service = createShikitorSyntaxWorker(worker as unknown as Worker)
    const session = service.createSession()
    const viewportLines: number[] = []
    const first = await session.tokenize(
      'first\nsecond',
      'github-light',
      'typescript',
      () => true,
      {
        onViewportReady: snapshot => viewportLines.push(snapshot.lines.length),
        viewportLines: 7
      }
    )
    const repeated = await session.tokenize(
      'first\nsecond',
      'github-light',
      'typescript',
      () => true
    )
    const second = await session.tokenize(
      'first\nupdated',
      'github-light',
      'typescript',
      () => true
    )

    expect(viewportLines).toEqual([1])
    expect(repeated?.lines).toBe(first?.lines)
    expect(repeated?.syntaxWorkerProfile).toEqual({ cacheHit: true })
    expect(first?.lines.map(line => line.source)).toEqual(['first', 'second'])
    expect(first?.syntaxWorkerProfile?.viewport).toMatchObject({
      serializedLines: 1,
      serializeMs: 2,
      setupMs: 3,
      tokenizeMs: 2,
      workerMs: 5
    })
    expect(first?.syntaxWorkerProfile?.complete).toMatchObject({
      serializedLines: 1,
      serializeMs: 3,
      setupMs: 3,
      tokenizeMs: 5,
      workerMs: 8
    })
    expect(second?.changedFrom).toBe(1)
    expect(second?.lines.map(line => line.source)).toEqual(['first', 'updated'])
    expect(worker.commands.filter(command => command.type === 'tokenize')).toHaveLength(2)
    expect(worker.commands.find(command => command.type === 'tokenize')).toMatchObject({
      viewportLines: 7
    })
    session.dispose()
    service.dispose()
    expect(worker.commands.at(-1)).toMatchObject({ type: 'dispose-session' })
    expect(worker.terminated).toBe(true)
  })

  test('preloads and resets the worker runtime', async () => {
    const worker = new FakeWorker()
    const service = createShikitorSyntaxWorker(worker as unknown as Worker)

    await service.preload('github-dark', 'typescript')
    await service.reset()

    expect(worker.commands.map(command => command.type)).toEqual([
      'preload',
      'reset'
    ])
    service.dispose()
  })

  test('returns an exact warm snapshot while seeding a new worker session', async () => {
    const worker = new FakeWorker()
    const service = createShikitorSyntaxWorker(worker as unknown as Worker)
    const first = service.createSession()
    const second = service.createSession()

    await first.tokenize(
      'cached',
      'github-light',
      'typescript',
      () => true
    )
    const warm = await second.tokenize(
      'cached',
      'github-light',
      'typescript',
      () => true
    )
    const edited = await second.tokenize(
      'cached edited',
      'github-light',
      'typescript',
      () => true
    )

    expect(warm?.lines[0].source).toBe('cached')
    expect(edited?.lines[0].source).toBe('cached edited')
    expect(worker.commands.map(command => command.type)).toEqual([
      'tokenize',
      'seed',
      'tokenize'
    ])
    service.dispose()
  })

  test('retains a completed worker snapshot after its render becomes stale', async () => {
    const worker = new FakeWorker()
    const service = createShikitorSyntaxWorker(worker as unknown as Worker)
    const first = service.createSession()
    let current = true
    const pending = first.tokenize(
      'stale render, reusable syntax',
      'github-light',
      'typescript',
      () => current
    )
    current = false

    expect(await pending).toBeUndefined()
    const warm = await service.createSession().tokenize(
      'stale render, reusable syntax',
      'github-light',
      'typescript',
      () => true
    )
    expect(warm?.lines[0].source).toBe('stale render, reusable syntax')
    expect(worker.commands.map(command => command.type)).toEqual([
      'tokenize',
      'seed'
    ])
    service.dispose()
  })
})
