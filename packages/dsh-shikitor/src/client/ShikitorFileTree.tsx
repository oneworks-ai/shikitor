import { useEffect, useMemo, useRef, useState } from 'react'

import { presentFileIcon, type ShikitorFileIconRule } from './fileIcons.ts'
import { MaterialIcon } from './MaterialIcon.tsx'
import type {
  ShikitorFileIconMode,
  ShikitorService,
} from './registry.ts'

interface FileNode {
  readonly kind: 'file'
  readonly name: string
  readonly path: string
}

interface DirectoryNode {
  readonly children: readonly TreeNode[]
  readonly kind: 'directory'
  readonly name: string
  readonly path: string
}

type TreeNode = DirectoryNode | FileNode

interface MutableDirectory {
  readonly directories: Map<string, MutableDirectory>
  readonly files: Map<string, string>
}

interface ShikitorFileTreeProps {
  readonly activePath?: string
  readonly emptyLabel: string
  readonly error?: string
  readonly failedLabel: string
  readonly fileIconMode: ShikitorFileIconMode
  readonly fileIconRules: readonly ShikitorFileIconRule[]
  readonly files: readonly string[]
  readonly label: string
  readonly loadingLabel: string
  readonly onOpenFile: (path: string) => void
  readonly runtime: ShikitorService
  readonly status: 'error' | 'loading' | 'ready'
}

function normalizedPath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/^\/+|\/+$/gu, '')
}

function compareNodes(left: TreeNode, right: TreeNode): number {
  if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
}

function finalizeDirectory(directory: MutableDirectory, parentPath = ''): readonly TreeNode[] {
  const directories: DirectoryNode[] = [...directory.directories.entries()].map(([name, child]) => {
    const path = parentPath === '' ? name : `${parentPath}/${name}`
    return { kind: 'directory', name, path, children: finalizeDirectory(child, path) }
  })
  const files: FileNode[] = [...directory.files.entries()].map(([name, path]) => ({
    kind: 'file',
    name,
    path,
  }))
  return [...directories, ...files].sort(compareNodes)
}

function fileTree(paths: readonly string[]): readonly TreeNode[] {
  const root: MutableDirectory = { directories: new Map(), files: new Map() }
  for (const candidate of paths) {
    const path = normalizedPath(candidate)
    const segments = path.split('/').filter(Boolean)
    const name = segments.pop()
    if (name === undefined) continue
    let directory = root
    for (const segment of segments) {
      let child = directory.directories.get(segment)
      if (child === undefined) {
        child = { directories: new Map(), files: new Map() }
        directory.directories.set(segment, child)
      }
      directory = child
    }
    directory.files.set(name, path)
  }
  return finalizeDirectory(root)
}

function parentDirectories(path: string): readonly string[] {
  const parts = normalizedPath(path).split('/').filter(Boolean)
  parts.pop()
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}

export function ShikitorFileIcon({
  mode,
  path,
  rules,
  runtime,
}: {
  readonly mode: ShikitorFileIconMode
  readonly path: string
  readonly rules: readonly ShikitorFileIconRule[]
  readonly runtime: ShikitorService
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const slot = ref.current
    if (slot === null) return
    const icon = presentFileIcon(runtime.resolveFileIcon(path), slot.ownerDocument, mode)
    slot.replaceChildren(...(icon === null ? [] : [icon]))
    return () => { slot.replaceChildren() }
  }, [mode, path, rules, runtime])

  return <span ref={ref} className="dsh-shikitor-file-tree__file-icon" aria-hidden="true" />
}

function TreeNodes({
  activePath,
  expanded,
  fileIconMode,
  fileIconRules,
  nodes,
  onOpenFile,
  onToggleDirectory,
  runtime,
}: {
  readonly activePath?: string
  readonly expanded: ReadonlySet<string>
  readonly fileIconMode: ShikitorFileIconMode
  readonly fileIconRules: readonly ShikitorFileIconRule[]
  readonly nodes: readonly TreeNode[]
  readonly onOpenFile: (path: string) => void
  readonly onToggleDirectory: (path: string) => void
  readonly runtime: ShikitorService
}) {
  return nodes.map((node) => {
    if (node.kind === 'file') {
      const selected = activePath === node.path
      return (
        <div key={node.path} role="treeitem" aria-selected={selected}>
          <button
            type="button"
            className="dsh-shikitor-file-tree__row"
            data-selected={selected ? 'true' : undefined}
            title={node.path}
            onClick={() => { onOpenFile(node.path) }}
          >
            <span className="dsh-shikitor-file-tree__disclosure" aria-hidden="true" />
            <ShikitorFileIcon
              mode={fileIconMode}
              path={node.path}
              rules={fileIconRules}
              runtime={runtime}
            />
            <span className="dsh-shikitor-file-tree__name">{node.name}</span>
          </button>
        </div>
      )
    }

    const open = expanded.has(node.path)
    return (
      <div key={node.path} role="treeitem" aria-expanded={open}>
        <button
          type="button"
          className="dsh-shikitor-file-tree__row"
          title={node.path}
          onClick={() => { onToggleDirectory(node.path) }}
        >
          <MaterialIcon name="chevron_right" className="dsh-shikitor-file-tree__disclosure" />
          <MaterialIcon name={open ? 'folder_open' : 'folder'} className="dsh-shikitor-file-tree__folder" />
          <span className="dsh-shikitor-file-tree__name">{node.name}</span>
        </button>
        {open && (
          <div role="group" className="dsh-shikitor-file-tree__children">
            <TreeNodes
              activePath={activePath}
              expanded={expanded}
              fileIconMode={fileIconMode}
              fileIconRules={fileIconRules}
              nodes={node.children}
              onOpenFile={onOpenFile}
              onToggleDirectory={onToggleDirectory}
              runtime={runtime}
            />
          </div>
        )}
      </div>
    )
  })
}

/** Workspace-relative, independently scrolling file tree for the editor side panel. */
export function ShikitorFileTree({
  activePath,
  emptyLabel,
  error,
  failedLabel,
  fileIconMode,
  fileIconRules,
  files,
  label,
  loadingLabel,
  onOpenFile,
  runtime,
  status,
}: ShikitorFileTreeProps) {
  const nodes = useMemo(() => fileTree(files), [files])
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    if (activePath === undefined) return
    const parents = parentDirectories(activePath)
    setExpanded((current) => {
      if (parents.every(path => current.has(path))) return current
      return new Set([...current, ...parents])
    })
  }, [activePath])

  const toggleDirectory = (path: string): void => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <aside className="dsh-shikitor-file-tree" aria-label={label}>
      {status === 'loading' && (
        <div className="dsh-shikitor-file-tree__state">{loadingLabel}</div>
      )}
      {status === 'error' && (
        <div className="dsh-shikitor-file-tree__state" title={error}>{failedLabel}</div>
      )}
      {status === 'ready' && nodes.length === 0 && (
        <div className="dsh-shikitor-file-tree__state">{emptyLabel}</div>
      )}
      {status === 'ready' && nodes.length > 0 && (
        <div role="tree" className="dsh-shikitor-file-tree__nodes">
          <TreeNodes
            activePath={activePath}
            expanded={expanded}
            fileIconMode={fileIconMode}
            fileIconRules={fileIconRules}
            nodes={nodes}
            onOpenFile={onOpenFile}
            onToggleDirectory={toggleDirectory}
            runtime={runtime}
          />
        </div>
      )}
    </aside>
  )
}
