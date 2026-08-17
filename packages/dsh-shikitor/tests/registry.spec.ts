import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

import { ShikitorRuntime } from '../src/client/registry.ts'

const sessionId = 'session-1' as never
const cwd = '/workspace'

function observable<T>(value: T) {
  return {
    getSnapshot: () => value,
    subscribe: () => () => {},
  }
}

function runtimeFixture() {
  const call = vi.fn(async (_route: string, operation: string, request: { args: { path: string } }) => {
    if (operation === 'shikitorCatalog/create') {
      return { ok: true, value: { path: request.args.path, text: '' } }
    }
    if (operation === 'shikitorCatalog/read') {
      return { ok: true, value: { path: request.args.path, text: `disk:${request.args.path}` } }
    }
    if (operation === 'shikitorCatalog/write') {
      return { ok: true, value: { path: request.args.path, text: '' } }
    }
    throw new Error(`Unexpected operation: ${operation}`)
  })
  const ctx = new Context()
  ctx.provide('connection', { rpc: { call } })
  ctx.provide('sessions', {
    list: observable({
      byId: { [sessionId]: { cwd } },
      current: sessionId,
      ids: [sessionId],
    }),
  })
  return { call, runtime: new ShikitorRuntime(ctx as never) }
}

describe('manual-save editor drafts', () => {
  it('retains dirty contents across open-file switches without writing to disk', async () => {
    const { call, runtime } = runtimeFixture()
    const firstPath = `${cwd}/first.ts`
    const secondPath = `${cwd}/second.ts`

    await runtime.openFile(sessionId, firstPath)
    runtime.configurePreferences({ editor: { autoSave: false } })
    runtime.updateDocument(sessionId, 'unsaved first')
    await runtime.openFile(sessionId, secondPath)
    await runtime.openFile(sessionId, firstPath)

    expect(runtime.document(sessionId).getSnapshot()).toMatchObject({
      dirty: true,
      path: firstPath,
      value: 'unsaved first',
    })
    expect(call.mock.calls.some(([, operation]) => operation === 'shikitorCatalog/write')).toBe(false)
  })

  it('retains the current dirty contents across a create-file action', async () => {
    const { call, runtime } = runtimeFixture()
    const firstPath = `${cwd}/first.ts`
    const createdPath = `${cwd}/created.ts`

    await runtime.openFile(sessionId, firstPath)
    runtime.configurePreferences({ editor: { autoSave: false } })
    runtime.updateDocument(sessionId, 'unsaved before create')
    await runtime.createFile(sessionId, createdPath)
    await runtime.openFile(sessionId, firstPath)

    expect(runtime.document(sessionId).getSnapshot()).toMatchObject({
      dirty: true,
      path: firstPath,
      value: 'unsaved before create',
    })
    expect(call.mock.calls.some(([, operation]) => operation === 'shikitorCatalog/write')).toBe(false)
  })
})
