import { describe, expect, it } from 'vitest'

import {
  acceptDiffHunk,
  createDiffTextEdit,
  rejectDiffHunk
} from '../../src/plugins/diff/actions'
import { computeCollapsedContexts } from '../../src/plugins/diff/collapsed-context'
import { computeInlineDiff } from '../../src/plugins/diff/inline'
import {
  computeDiffModel,
  findSingleLineEdit,
  updateDiffModelForLineEdit
} from '../../src/plugins/diff/model'

describe('diff model', () => {
  it('aligns modified, removed, added and context rows', () => {
    const model = computeDiffModel(
      ['const value = 1', 'removeMe()', 'return value'].join('\n'),
      ['const value = 2', 'return value', 'export default value'].join('\n')
    )

    expect(model.rows.map(row => row.kind)).toEqual([
      'modified', 'removed', 'context', 'added'
    ])
    expect(model.rows.map(row => [row.oldLine, row.newLine])).toEqual([
      [1, 1], [2, undefined], [3, 2], [undefined, 3]
    ])
    expect(model.stats).toEqual({ additions: 2, deletions: 2, hunks: 2 })
  })

  it('preserves trailing newlines through accept and reject', () => {
    const original = 'first\nsecond\n'
    const current = 'first\nchanged\nthird\n'
    const model = computeDiffModel(original, current)

    expect(model.hunks).toHaveLength(1)
    expect(acceptDiffHunk(original, model.hunks[0])).toBe(current)
    expect(rejectDiffHunk(current, model.hunks[0])).toBe(original)
  })

  it('reduces a hunk result to the smallest textarea edit', () => {
    const before = 'first\nworking\nlast'
    const after = 'first\nbaseline\nlast'
    const edit = createDiffTextEdit(before, after)
    expect(edit).toEqual({ start: 6, end: 13, text: 'baseline' })
    expect(before.slice(0, edit.start) + edit.text + before.slice(edit.end)).toBe(after)
  })

  it('models pure insertion and deletion boundaries', () => {
    const inserted = computeDiffModel('a\nb', 'x\na\nb\ny')
    expect(inserted.hunks.map(hunk => [hunk.oldStart, hunk.newStart])).toEqual([[1, 1], [3, 4]])
    expect(rejectDiffHunk(inserted.current, inserted.hunks[0])).toBe('a\nb\ny')

    const removed = computeDiffModel('x\na\nb\ny', 'a\nb')
    expect(removed.hunks.map(hunk => [hunk.oldStart, hunk.newStart])).toEqual([[1, 1], [4, 3]])
    expect(rejectDiffHunk(removed.current, removed.hunks[1])).toBe('a\nb\ny')
  })

  it('reports an identical source without hunks', () => {
    const model = computeDiffModel('same', 'same')
    expect(model.identical).toBe(true)
    expect(model.stats).toEqual({ additions: 0, deletions: 0, hunks: 0 })
  })

  it('falls back to a complete replacement when the configured budget aborts', () => {
    const model = computeDiffModel('a\nb\nc', 'x\ny\nz', { maxEditLength: 0 })
    expect(model.truncated).toBe(true)
    expect(model.hunks).toHaveLength(1)
  })
})

describe('inline diff', () => {
  it('keeps word-level ranges on their own source sides', () => {
    const inline = computeInlineDiff('theme: light', 'theme: dark', 'word')
    expect(inline.oldRanges).toEqual([{ start: 7, end: 12 }])
    expect(inline.newRanges).toEqual([{ start: 7, end: 11 }])
  })

  it('can use character ranges or disable inline changes', () => {
    expect(computeInlineDiff('mode', 'model', 'character')).toEqual({
      oldRanges: [],
      newRanges: [{ start: 4, end: 5 }]
    })
    expect(computeInlineDiff('a', 'b', 'none')).toEqual({ oldRanges: [], newRanges: [] })
  })
})

describe('collapsed diff context', () => {
  it('keeps configured context beside changes and collapses the middle', () => {
    const original = ['same 1', 'same 2', 'same 3', 'same 4', 'old', 'tail'].join('\n')
    const current = ['same 1', 'same 2', 'same 3', 'same 4', 'new', 'tail'].join('\n')
    const ranges = computeCollapsedContexts(computeDiffModel(original, current), {
      context: 1,
      minimum: 3,
      label: count => `${count} stable`
    })

    expect(ranges).toEqual([{ startLine: 1, endLine: 3, count: 3, label: '3 stable' }])
  })

  it('does not fold identical files or short context runs', () => {
    expect(computeCollapsedContexts(computeDiffModel('same', 'same'))).toEqual([])
    expect(computeCollapsedContexts(computeDiffModel('a\nold\nb', 'a\nnew\nb'), {
      context: 0,
      minimum: 2
    })).toEqual([])
  })

  it('can collapse one unchanged line when the host explicitly requests it', () => {
    const ranges = computeCollapsedContexts(computeDiffModel('stable\nold', 'stable\nnew'), {
      context: 0,
      minimum: 1
    })

    expect(ranges).toEqual([{
      startLine: 1,
      endLine: 1,
      count: 1,
      label: '1 unchanged line'
    }])
  })
})

describe('diff view windows', () => {
  it('hides original rows for folded current lines and keeps fold placeholder rows', async () => {
    const { resolveVisualRows } = await import('../../src/plugins/diff/view')
    const rows = computeDiffModel('a\nb\nc\nd', 'a\nb\nx\nd').rows
    const hidden = new Set([2])
    const visual = resolveVisualRows(rows, line => ({
      hidden: hidden.has(line),
      foldLine: line === 1
    }))
    expect(visual).toEqual([
      { index: 0, fold: true },
      { index: 2, fold: false },
      { index: 3, fold: false }
    ])
  })

  it('renders only the rows around the scrolled viewport', async () => {
    const { resolveOriginalWindow } = await import('../../src/plugins/diff/view')
    expect(resolveOriginalWindow(0, 220, 22, 1000, 2)).toEqual({ first: 0, last: 12 })
    expect(resolveOriginalWindow(2200, 220, 22, 1000, 2)).toEqual({ first: 98, last: 112 })
    expect(resolveOriginalWindow(21900, 220, 22, 1000, 2)).toEqual({ first: 993, last: 1000 })
    expect(resolveOriginalWindow(0, 220, 0, 5, 2)).toEqual({ first: 0, last: 5 })
  })
})

describe('single-line diff updates', () => {
  it('locates a replacement confined to one line', () => {
    expect(findSingleLineEdit('a\nb\nc', 'a\nbX\nc')).toBe(2)
    expect(findSingleLineEdit('a\nb\nc', 'a\nb\nc!')).toBe(3)
    expect(findSingleLineEdit('a\nb\nc', 'a\nb\n\nc')).toBeUndefined()
    expect(findSingleLineEdit('a\nb\nc', 'a\nB\nC')).toBeUndefined()
    expect(findSingleLineEdit('same', 'same')).toBeUndefined()
  })

  it('matches a full recomputation when typing inside a changed row', () => {
    const original = 'one\ntwo\nthree\nfour'
    const previousCurrent = 'one\ntwo!\nthree\nfour\nfive'
    const previous = computeDiffModel(original, previousCurrent)
    for (const next of ['one\ntwo!!\nthree\nfour\nfive', 'one\ntwo!\nthree\nfour\nfive6']) {
      const updated = updateDiffModelForLineEdit(previous, next)
      expect(updated).toBeDefined()
      expect(updated).toEqual(computeDiffModel(original, next))
    }
  })

  it('defers to the full diff for context lines and structural edits', () => {
    const original = 'one\ntwo\nthree'
    const previous = computeDiffModel(original, 'one\ntwo!\nthree')
    expect(updateDiffModelForLineEdit(previous, 'one!\ntwo!\nthree')).toBeUndefined()
    expect(updateDiffModelForLineEdit(previous, 'one\ntwo!\n\nthree')).toBeUndefined()
  })

  it('defers to the full diff when an edit restores or re-matches baseline text', () => {
    const original = 'one\ntwo\nthree\nfour'
    // Restoring a modified row must dissolve the hunk instead of keeping a
    // phantom change.
    const modified = computeDiffModel(original, 'one\ntwo!\nthree\nfour')
    const restored = 'one\ntwo\nthree\nfour'
    expect(updateDiffModelForLineEdit(modified, restored)).toBeUndefined()
    expect(computeDiffModel(original, restored).identical).toBe(true)
    // An added line that becomes equal to a removed line in the same hunk is
    // re-paired by the full diff.
    const unbalanced = computeDiffModel('a\nb\nc', 'a\nx\ny\nc')
    const repaired = 'a\nx\nb\nc'
    const repairedUpdate = updateDiffModelForLineEdit(unbalanced, repaired)
    expect(repairedUpdate ?? computeDiffModel('a\nb\nc', repaired)).toEqual(computeDiffModel('a\nb\nc', repaired))
    // An added line equal to the neighbouring context line shifts the hunk.
    const inserted = computeDiffModel('a\nb\nc', 'a\nX\nb\nc')
    const shifted = 'a\nb\nb\nc'
    const shiftedUpdate = updateDiffModelForLineEdit(inserted, shifted)
    expect(shiftedUpdate ?? computeDiffModel('a\nb\nc', shifted)).toEqual(computeDiffModel('a\nb\nc', shifted))
  })

  it('keeps the fast path exact across a sweep of single-line edits', () => {
    const original = 'alpha\nbeta\ngamma\ndelta\nepsilon'
    const starts = ['alpha\nbeta!\ngamma\ndelta\nepsilon', 'alpha\nbeta\nnew\ngamma\ndelta\nepsilon']
    const edits = ['', '!', '!!', 'beta', 'gamma', 'alpha', 'x y z', 'delta']
    for (const start of starts) {
      const model = computeDiffModel(original, start)
      for (const row of model.rows) {
        if (!row.newLine || row.kind === 'context') continue
        for (const edit of edits) {
          const lines = start.split('\n')
          lines[row.newLine - 1] = edit
          const next = lines.join('\n')
          const updated = updateDiffModelForLineEdit(model, next)
          if (updated) expect(updated, `${start} -> ${next}`).toEqual(computeDiffModel(original, next))
        }
      }
    }
  })
})
