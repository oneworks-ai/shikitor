import { Editor } from '@shikitor/react'
import type { InputShikitorPlugin } from '@shikitor/core'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import type { ShikitorFileIconRule } from './fileIcons.ts'
import { NS } from './locales.ts'
import { ShikitorFileIcon, ShikitorFileTree } from './ShikitorFileTree.tsx'
import type {
  ShikitorAppearance,
  ShikitorEditorDocument,
  ShikitorService,
} from './registry.ts'
import { resolveShikitorTheme, resolveSurfaceAppearance } from './registry.ts'

interface EditorInjected {
  hooks: {
    appearance: HostObservable<ShikitorAppearance>
    document: HostObservable<ShikitorEditorDocument>
    fileIconRules: HostObservable<readonly ShikitorFileIconRule[]>
    plugins: HostObservable<readonly InputShikitorPlugin[]>
    colorScheme: HostObservable<'light' | 'dark'>
  }
  createWorkspaceFile: (path: string) => Promise<void>
  loadWorkspaceFiles: () => Promise<readonly string[]>
  openWorkspaceFile: (path: string) => Promise<void>
  runtime: ShikitorService
}

const SUGGESTED_ROOT_FILES = ['README.md', 'README.zh-Hans.md', 'AGENTS.md', 'package.json'] as const
const EDITOR_CONTEXT_HEARTBEAT_MS = 30_000

function suggestedWorkspaceFiles(files: readonly string[]): readonly string[] {
  const available = new Set(files.filter(path => !normalizedPath(path).includes('/')))
  return SUGGESTED_ROOT_FILES.filter(path => available.has(path)).slice(0, 3)
}

/** Props composed for the Shikitor conversation view. */
export type ShikitorEditorProps = PropsRuntime<'conversation.view'>
  & PropsLocale<typeof NS>
  & InjectFace<EditorInjected>

interface FileTreeState {
  readonly error?: string
  readonly files: readonly string[]
  readonly status: 'error' | 'loading' | 'ready'
}

function normalizedPath(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/u, '')
}

function workspaceRelativePath(
  path: string | undefined,
  cwd: string | undefined,
  fallback: string,
): string {
  if (path === undefined) return fallback
  const normalized = normalizedPath(path)
  if (cwd === undefined) return normalized
  const root = normalizedPath(cwd)
  return normalized.toLocaleLowerCase().startsWith(`${root.toLocaleLowerCase()}/`)
    ? normalized.slice(root.length + 1)
    : normalized
}

/** Session-backed editor view opened by modified-clicking a sender file token. */
export function ShikitorEditor({
  createWorkspaceFile,
  loadWorkspaceFiles,
  openWorkspaceFile,
  runtime,
  sessionId,
  useSessions,
  useAppearance,
  useDocument,
  useFileIconRules,
  usePlugins,
  useColorScheme,
  t,
}: ShikitorEditorProps) {
  const treeId = useId()
  const emptyTitleId = useId()
  const contextLease = useRef(crypto.randomUUID())
  const newFileInput = useRef<HTMLInputElement>(null)
  const plugins = usePlugins(items => items)
  const fileIconRules = useFileIconRules(items => items)
  const colorScheme = useColorScheme(value => value)
  const appearance = useAppearance(value => value)
  const document = useDocument(value => value)
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const [treeOpen, setTreeOpen] = useState(true)
  const [tree, setTree] = useState<FileTreeState>({ files: [], status: 'loading' })
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createPath, setCreatePath] = useState('')
  const [createError, setCreateError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const pendingSaves = useRef(0)
  const editorAppearance = resolveSurfaceAppearance(appearance, 'editor')
  const theme = resolveShikitorTheme(editorAppearance, colorScheme)
  const editorPlugins = useMemo(() => [...plugins], [plugins])
  const editorOptions = useMemo(() => ({
    autoSize: false as const,
    hideSelfCursorUsername: true,
    highlightCurrentLine: appearance.editor.highlightCurrentLine,
    language: document.language,
    lineNumbers: appearance.editor.lineNumbers ? 'on' as const : 'off' as const,
    theme,
  }), [
    appearance.editor.highlightCurrentLine,
    appearance.editor.lineNumbers,
    document.language,
    theme,
  ])
  const relativePath = workspaceRelativePath(document.path, cwd, document.name)
  const breadcrumb = relativePath.split('/').filter(Boolean)
  const suggestedFiles = useMemo(() => suggestedWorkspaceFiles(tree.files), [tree.files])

  const saveDocument = (): void => {
    if (document.path === undefined || !document.dirty) return
    pendingSaves.current += 1
    setSaving(true)
    void runtime.saveDocument(sessionId).catch(() => {}).finally(() => {
      pendingSaves.current -= 1
      if (pendingSaves.current === 0) setSaving(false)
    })
  }

  useEffect(() => {
    let active = true
    setTree({ files: [], status: 'loading' })
    void loadWorkspaceFiles().then(
      files => {
        if (active) setTree({ files, status: 'ready' })
      },
      error => {
        if (!active) return
        setTree({
          error: error instanceof Error ? error.message : String(error),
          files: [],
          status: 'error',
        })
      },
    )
    return () => { active = false }
  }, [loadWorkspaceFiles])

  useEffect(() => {
    const context = {
      comments: [],
      files: document.path === undefined ? [] : [{ path: document.path, selections: [] }],
    }
    const publish = (): void => {
      void runtime.publishEditorContext(sessionId, contextLease.current, context).catch(error => {
        console.warn('Failed to publish Shikitor editor context', error)
      })
    }
    publish()
    const heartbeat = window.setInterval(publish, EDITOR_CONTEXT_HEARTBEAT_MS)
    return () => {
      window.clearInterval(heartbeat)
      void runtime.clearEditorContext(sessionId, contextLease.current).catch(error => {
        console.warn('Failed to clear Shikitor editor context', error)
      })
    }
  }, [document.path, runtime, sessionId])

  useEffect(() => {
    if (createOpen) newFileInput.current?.focus()
  }, [createOpen])

  const submitCreateFile = async (): Promise<void> => {
    const path = normalizedPath(createPath.trim()).replace(/^\.\//u, '')
    const segments = path.split('/')
    if (path === '' || path.startsWith('/') || segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
      setCreateError(t('empty.create.invalid'))
      return
    }
    setCreating(true)
    setCreateError(undefined)
    try {
      await createWorkspaceFile(path)
      const files = await loadWorkspaceFiles()
      setTree({ files, status: 'ready' })
      setCreateOpen(false)
      setCreatePath('')
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error))
    } finally {
      setCreating(false)
    }
  }

  const focusFileTree = (): void => {
    setTreeOpen(true)
    requestAnimationFrame(() => {
      window.document.getElementById(treeId)?.querySelector<HTMLButtonElement>('button')?.focus()
    })
  }

  return (
    <section
      className="dsh-shikitor-editor"
      data-conversation-composer-overlay=""
      data-shikitor-surface="editor"
      data-dsh-shikitor-cursor={editorAppearance.cursor}
      onKeyDownCapture={(event) => {
        if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLocaleLowerCase() === 's') {
          event.preventDefault()
          saveDocument()
        }
      }}
    >
      <div className="dsh-shikitor-editor__toolbar">
        <div className="dsh-shikitor-editor__toolbar-main">
          {document.path !== undefined && (
            <nav
              className="dsh-shikitor-editor__breadcrumbs"
              aria-label={t('tree.breadcrumb')}
              title={document.path}
            >
              {breadcrumb.map((segment, index) => (
                <span key={`${segment}-${index}`} className="dsh-shikitor-editor__breadcrumb">
                  {index > 0 && (
                    <span className="shikitor-icon dsh-shikitor-editor__breadcrumb-separator" aria-hidden="true">
                      chevron_right
                    </span>
                  )}
                  <span className="dsh-shikitor-editor__breadcrumb-label">{segment}</span>
                </span>
              ))}
            </nav>
          )}
          {document.path !== undefined && document.status === 'ready' && document.error !== undefined && (
            <span className="dsh-shikitor-editor__save-error" role="alert" title={document.error}>
              {document.error}
            </span>
          )}
        </div>
        <div className="dsh-shikitor-editor__toolbar-actions">
          <button
            type="button"
            className="dsh-shikitor-editor__toolbar-button dsh-shikitor-editor__save"
            data-dirty={document.dirty ? 'true' : undefined}
            disabled={document.path === undefined || !document.dirty || saving}
            aria-label={saving ? t('editor.saving') : t('editor.save')}
            title={saving ? t('editor.saving') : t('editor.saveShortcut')}
            onClick={saveDocument}
          >
            <span className="shikitor-icon" aria-hidden="true">save</span>
          </button>
          <button
            type="button"
            className="dsh-shikitor-editor__toolbar-button dsh-shikitor-editor__tree-toggle"
            aria-controls={treeId}
            aria-expanded={treeOpen}
            aria-label={treeOpen ? t('tree.collapse') : t('tree.expand')}
            title={treeOpen ? t('tree.collapse') : t('tree.expand')}
            onClick={() => { setTreeOpen(value => !value) }}
          >
            <span className="shikitor-icon" aria-hidden="true">
              {treeOpen ? 'right_panel_close' : 'right_panel_open'}
            </span>
          </button>
        </div>
      </div>
      <div className="dsh-shikitor-editor__workspace">
        {document.path === undefined
          ? (
            <section className="dsh-shikitor-editor-empty" aria-labelledby={emptyTitleId}>
              <div className="dsh-shikitor-editor-empty__copy">
                <h2 id={emptyTitleId}>{t('empty.title')}</h2>
                <p>{cwd === undefined ? t('empty.noWorkspace') : t('empty.description')}</p>
              </div>
              <div className="dsh-shikitor-editor-empty__actions">
                {createOpen
                  ? (
                    <form
                      className="dsh-shikitor-editor-empty__create"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void submitCreateFile()
                      }}
                    >
                      <span className="shikitor-icon" aria-hidden="true">note_add</span>
                      <div className="dsh-shikitor-editor-empty__create-main">
                        <input
                          ref={newFileInput}
                          value={createPath}
                          disabled={creating}
                          aria-label={t('empty.create.path')}
                          placeholder={t('empty.create.placeholder')}
                          onChange={(event) => {
                            setCreatePath(event.currentTarget.value)
                            setCreateError(undefined)
                          }}
                        />
                        {createError !== undefined && (
                          <span className="dsh-shikitor-editor-empty__error" role="alert">{createError}</span>
                        )}
                      </div>
                      <button type="submit" disabled={creating || createPath.trim() === ''}>
                        {creating ? t('empty.create.creating') : t('empty.create.confirm')}
                      </button>
                      <button
                        type="button"
                        disabled={creating}
                        onClick={() => {
                          setCreateOpen(false)
                          setCreatePath('')
                          setCreateError(undefined)
                        }}
                      >
                        {t('empty.create.cancel')}
                      </button>
                    </form>
                  )
                  : (
                    <button
                      type="button"
                      className="dsh-shikitor-editor-empty__action"
                      disabled={cwd === undefined}
                      onClick={() => { setCreateOpen(true) }}
                    >
                      <span className="shikitor-icon dsh-shikitor-editor-empty__action-icon" aria-hidden="true">
                        note_add
                      </span>
                      <span className="dsh-shikitor-editor-empty__action-copy">
                        <strong>{t('empty.create')}</strong>
                        <span>{t('empty.createHint')}</span>
                      </span>
                    </button>
                  )}
                {suggestedFiles.map(path => (
                  <button
                    key={path}
                    type="button"
                    className="dsh-shikitor-editor-empty__action"
                    onClick={() => { void openWorkspaceFile(path) }}
                  >
                    <ShikitorFileIcon
                      mode={appearance.fileIcons}
                      path={path}
                      rules={fileIconRules}
                      runtime={runtime}
                    />
                    <span className="dsh-shikitor-editor-empty__action-copy">
                      <strong>{t('empty.openFile', { file: path })}</strong>
                      <span>{t('empty.openFileHint')}</span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="dsh-shikitor-editor-empty__action"
                  onClick={focusFileTree}
                >
                  <span className="shikitor-icon dsh-shikitor-editor-empty__action-icon" aria-hidden="true">
                    folder_open
                  </span>
                  <span className="dsh-shikitor-editor-empty__action-copy">
                    <strong>{t('empty.browse')}</strong>
                    <span>{t('empty.browseHint')}</span>
                  </span>
                </button>
              </div>
            </section>
            )
          : (
            <Editor
              className="dsh-shikitor-editor__body"
              value={document.value}
              onChange={value => { runtime.updateDocument(sessionId, value) }}
              plugins={editorPlugins}
              options={editorOptions}
            />
            )}
        {treeOpen && (
          <div id={treeId} className="dsh-shikitor-editor__tree-panel">
            <ShikitorFileTree
              activePath={document.path === undefined ? undefined : relativePath}
              emptyLabel={t('tree.empty')}
              error={tree.error}
              failedLabel={t('tree.failed')}
              fileIconMode={appearance.fileIcons}
              fileIconRules={fileIconRules}
              files={tree.files}
              label={t('tree.label')}
              loadingLabel={t('tree.loading')}
              onOpenFile={path => { void openWorkspaceFile(path) }}
              runtime={runtime}
              status={tree.status}
            />
          </div>
        )}
      </div>
    </section>
  )
}
