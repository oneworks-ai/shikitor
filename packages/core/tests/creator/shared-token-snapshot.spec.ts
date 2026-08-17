import { afterEach, describe, expect, test } from 'vitest'

import {
  clearSharedTokenSnapshots,
  getSharedTokenSnapshot,
  setSharedTokenSnapshot
} from '../../src/creator/controlled/sharedTokenSnapshot'

afterEach(clearSharedTokenSnapshots)

describe('shared token snapshot cache', () => {
  test('retains recent exact documents with an LRU entry bound', () => {
    for (let index = 0; index < 9; index++) {
      const source = `const value${index} = ${index}`
      setSharedTokenSnapshot({
        language: 'typescript',
        lines: [{ source, tokens: [] }],
        source,
        theme: 'github-light',
        themeRegistration: {
          bg: '#fff',
          fg: '#000',
          name: 'test',
          settings: [],
          type: 'light'
        }
      })
    }

    expect(getSharedTokenSnapshot(
      'const value0 = 0',
      'github-light',
      'typescript'
    )).toBeUndefined()
    expect(getSharedTokenSnapshot(
      'const value8 = 8',
      'github-light',
      'typescript'
    )?.source).toBe('const value8 = 8')
  })
})
