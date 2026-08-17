import { describe, expect, it } from 'vitest'

import { filterAndSortWorkspaceFiles } from '../src/client/catalog.ts'

const noFilters = { folderExcludes: '', folderIncludes: '' }

describe('sender workspace file ordering', () => {
  it('orders matching files by directory depth before lexical order', () => {
    expect(filterAndSortWorkspaceFiles([
      'apps/android/src/main.ts',
      'packages/core/package.json',
      'README.md',
      'apps/AGENTS.md',
      'package.json',
    ], '', noFilters)).toEqual([
      'package.json',
      'README.md',
      'apps/AGENTS.md',
      'packages/core/package.json',
      'apps/android/src/main.ts',
    ])
  })

  it('keeps hidden folders opt-in through the typed query', () => {
    const files = ['.agents/skills/review/SKILL.md', 'AGENTS.md']
    expect(filterAndSortWorkspaceFiles(files, '', noFilters)).toEqual(['AGENTS.md'])
    expect(filterAndSortWorkspaceFiles(files, '.agents', noFilters)).toEqual([
      '.agents/skills/review/SKILL.md',
    ])
  })

  it('applies sender include and exclude folder globs without affecting root files implicitly', () => {
    const files = [
      'README.md',
      'apps/client/index.ts',
      'apps/generated/schema.ts',
      'packages/core/index.ts',
    ]
    expect(filterAndSortWorkspaceFiles(files, '', {
      folderIncludes: 'apps/**, packages/**',
      folderExcludes: 'generated',
    })).toEqual([
      'apps/client/index.ts',
      'packages/core/index.ts',
    ])
  })
})
