import { describe, expect, test } from 'vitest'
import ts from 'typescript'

import { createTypeScriptLanguageService } from '../../src/examples/LanguageServices/TypeScript/typescript-adapter'
import { createTypeScriptCompletionProvider } from '../../src/examples/LanguageServices/TypeScript/plugin'

describe('browser TypeScript language service adapter', () => {
  test('returns real diagnostics, hover, and member completions', () => {
    const value = `interface User { id: number; name: string }
const user: User = { id: "wrong", name: "Ada" }
user.`
    const client = createTypeScriptLanguageService(value, ts)

    expect(client.getDiagnostics().some(item => (
      item.code === 2322 && item.message.includes("Type 'string' is not assignable to type 'number'")
    ))).toBe(true)
    expect(client.getHover(value.indexOf('user:') + 1)?.signature).toContain('const user: User')
    expect(client.getCompletions(value.length).map(item => item.label)).toEqual(
      expect.arrayContaining(['id', 'name'])
    )

    client[Symbol.dispose]()
  })

  test('increments document versions without rebuilding the client', () => {
    const client = createTypeScriptLanguageService('const value = 1', ts)
    expect(client.inspect(5).documentVersion).toBe(0)
    client.updateDocument('const value: string = 1')
    expect(client.inspect(5).documentVersion).toBe(1)
    expect(client.getDiagnostics().some(item => item.code === 2322)).toBe(true)
    client[Symbol.dispose]()
  })

  test('normalizes dot completion before and after the native input cursor updates', () => {
    const value = `interface User { id: number; name: string }
const user: User = { id: 1, name: "Ada" }
user`
    const client = createTypeScriptLanguageService(value, ts)
    const provider = createTypeScriptCompletionProvider(client)

    const beforeInput = provider.provideCompletionItems(
      { value },
      { offset: value.length }
    )
    expect(beforeInput?.suggestions.map(item => item.label)).toEqual(
      expect.arrayContaining(['id', 'name'])
    )

    const afterInput = `${value}.`
    const withStaleCursor = provider.provideCompletionItems(
      { value: afterInput },
      { offset: value.length }
    )
    expect(withStaleCursor?.suggestions.map(item => item.label)).toEqual(
      expect.arrayContaining(['id', 'name'])
    )
    expect(client.inspect(afterInput.length).completions.map(item => item.label)).toEqual(
      expect.arrayContaining(['id', 'name'])
    )

    client[Symbol.dispose]()
  })
})
