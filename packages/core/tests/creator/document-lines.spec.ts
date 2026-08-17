import { describe, expect, test } from 'vitest'

import { createDocumentLines } from '../../src/creator/controlled/documentLines'

describe('document lines', () => {
  test('indexes lines without materializing a split array', () => {
    const document = createDocumentLines('first\nsecond\n')

    expect(document.lineCount).toBe(3)
    expect(document.lineAt(0)).toBe('first')
    expect(document.lineAt(1)).toBe('second')
    expect(document.lineAt(2)).toBe('')
    expect(document.offsetAt(0)).toBe(0)
    expect(document.offsetAt(1)).toBe(6)
    expect(document.offsetAt(2)).toBe(13)
    expect(document.offsetAt(3)).toBe(13)
  })
})
