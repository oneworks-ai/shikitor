import { Service } from '@deepseek-ai/cordis'
import type { InputShikitorPlugin } from '@shikitor/core'
import type { BundledLanguage } from 'shiki'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

import {
  FileIconRegistry,
  matchesFileIconPattern,
  type ResolvedFileIcon,
  type ShikitorConfiguredFileIconRule,
  type ShikitorFileIconRule,
} from './fileIcons.ts'

/** Independently configurable Shikitor surfaces exposed by this bundle. */
export type ShikitorSurface = 'sender' | 'editor'
export type ShikitorColorScheme = 'auto' | 'dark' | 'light'
export type ShikitorTheme = 'github' | 'min' | 'vitesse'
export type ShikitorCursorStyle = 'line' | 'block' | 'underline'
export type ShikitorFileIconMode = 'colored' | 'monochrome' | 'hidden'

export interface ShikitorSurfaceAppearance {
  readonly colorScheme: ShikitorColorScheme
  readonly cursor: ShikitorCursorStyle
  readonly theme: ShikitorTheme
}

export interface ShikitorEditorAppearance {
  /** Null means the shared General surface appearance remains in effect. */
  readonly surface: ShikitorSurfaceAppearance | null
  readonly highlightCurrentLine: boolean
  readonly lineNumbers: boolean
}

export interface ShikitorAppearance {
  /** Complete fallback inherited by sender/editor while they have no override. */
  readonly general: ShikitorSurfaceAppearance
  readonly editor: ShikitorEditorAppearance
  readonly fileIcons: ShikitorFileIconMode
  /** Null means the shared General surface appearance remains in effect. */
  readonly sender: ShikitorSurfaceAppearance | null
}

export interface ShikitorEditorAppearanceUpdate {
  readonly highlightCurrentLine?: boolean
  readonly lineNumbers?: boolean
  readonly surface?: Partial<ShikitorSurfaceAppearance> | null
}

export interface ShikitorAppearanceUpdate {
  readonly general?: Partial<ShikitorSurfaceAppearance>
  readonly editor?: ShikitorEditorAppearanceUpdate
  readonly fileIcons?: ShikitorFileIconMode
  readonly sender?: Partial<ShikitorSurfaceAppearance> | null
}

export interface ShikitorEditorPreferences {
  readonly autoSave: boolean
}

export interface ShikitorSenderPreferences {
  /** Comma/newline-separated folder globs. Empty means every indexed folder. */
  readonly folderIncludes: string
  /** Comma/newline-separated folder globs removed from sender file search. */
  readonly folderExcludes: string
}

export interface ShikitorPreferences {
  readonly editor: ShikitorEditorPreferences
  readonly sender: ShikitorSenderPreferences
}

export interface ShikitorPreferencesUpdate {
  readonly editor?: Partial<ShikitorEditorPreferences>
  readonly sender?: Partial<ShikitorSenderPreferences>
}

export interface ShikitorEditorDocument {
  readonly dirty: boolean
  readonly error?: string
  readonly language: BundledLanguage
  readonly name: string
  readonly path?: string
  readonly status: 'error' | 'loading' | 'ready'
  readonly value: string
}

/** One stable source position retained for future multi-range context. */
export interface ShikitorEditorContextPosition {
  readonly character: number
  readonly line: number
  readonly offset: number
}

/** One independently addressable range in an editor context snapshot. */
export interface ShikitorEditorContextSelection {
  readonly end: ShikitorEditorContextPosition
  readonly id: string
  readonly start: ShikitorEditorContextPosition
}

/** One file and its selected ranges in an editor context snapshot. */
export interface ShikitorEditorContextFile {
  readonly path: string
  readonly selections: readonly ShikitorEditorContextSelection[]
}

/** A future comment may address one or more selections in a referenced file. */
export interface ShikitorEditorContextComment {
  readonly body: string
  readonly filePath: string
  readonly id: string
  readonly selectionIds: readonly string[]
}

/** Browser-published editor references; current model rendering uses file paths only. */
export interface ShikitorEditorContext {
  readonly comments: readonly ShikitorEditorContextComment[]
  readonly files: readonly ShikitorEditorContextFile[]
}

/** Combine an independent theme family and light/dark preference. */
export function resolveShikitorTheme(
  appearance: ShikitorSurfaceAppearance,
  hostColorScheme: 'dark' | 'light',
): `${ShikitorTheme}-${'dark' | 'light'}` {
  const colorScheme = appearance.colorScheme === 'auto' ? hostColorScheme : appearance.colorScheme
  return `${appearance.theme}-${colorScheme}`
}

/** Resolve the effective shared appearance for one surface. */
export function resolveSurfaceAppearance(
  appearance: ShikitorAppearance,
  surface: ShikitorSurface,
): ShikitorSurfaceAppearance {
  return surface === 'sender'
    ? appearance.sender ?? appearance.general
    : appearance.editor.surface ?? appearance.general
}

const APPEARANCE_STORAGE_KEY = 'dsh-shikitor.appearance.v2'
const LEGACY_APPEARANCE_STORAGE_KEY = 'dsh-shikitor.appearance.v1'
const FILE_ICON_RULES_STORAGE_KEY = 'dsh-shikitor.file-icons.v1'
const PREFERENCES_STORAGE_KEY = 'dsh-shikitor.preferences.v1'
const MAX_EDITOR_FILE_BYTES = 2 * 1024 * 1024
const AUTO_SAVE_DELAY_MS = 500

const defaultAppearance: ShikitorAppearance = {
  general: { colorScheme: 'auto', cursor: 'line', theme: 'github' },
  sender: null,
  editor: {
    surface: null,
    highlightCurrentLine: false,
    lineNumbers: true,
  },
  fileIcons: 'colored',
}

const defaultPreferences: ShikitorPreferences = {
  editor: { autoSave: true },
  sender: { folderExcludes: '', folderIncludes: '' },
}

interface FileReadResponse {
  readonly path: string
  readonly text: string
}

interface FileIconReadResponse {
  readonly dataUrl: string
  readonly path: string
}

type CachedImageSource =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly url: string }
  | { readonly state: 'error' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFileReadResponse(value: unknown): value is FileReadResponse {
  return isRecord(value) && typeof value.path === 'string' && typeof value.text === 'string'
}

function isFileIconReadResponse(value: unknown): value is FileIconReadResponse {
  return isRecord(value)
    && typeof value.path === 'string'
    && typeof value.dataUrl === 'string'
    && value.dataUrl.startsWith('data:image/')
}

function oneOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && values.includes(value as T) ? value as T : fallback
}

function migratedSurface(
  surface: Record<string, unknown>,
  fallback: ShikitorSurfaceAppearance,
): ShikitorSurfaceAppearance {
  const legacyTheme = surface.theme
  return {
    colorScheme: oneOf(
      surface.colorScheme ?? (legacyTheme === 'github-dark'
        ? 'dark'
        : legacyTheme === 'github-light' ? 'light' : 'auto'),
      ['auto', 'dark', 'light'],
      fallback.colorScheme,
    ),
    cursor: oneOf(surface.cursor, ['line', 'block', 'underline'], fallback.cursor),
    theme: oneOf(
      legacyTheme === 'github-dark' || legacyTheme === 'github-light' || legacyTheme === 'auto'
        ? 'github'
        : legacyTheme,
      ['github', 'min', 'vitesse'],
      fallback.theme,
    ),
  }
}

function sameSurface(
  left: ShikitorSurfaceAppearance,
  right: ShikitorSurfaceAppearance,
): boolean {
  return left.colorScheme === right.colorScheme
    && left.cursor === right.cursor
    && left.theme === right.theme
}

function appearanceV2(value: Record<string, unknown>): ShikitorAppearance {
  const general = migratedSurface(
    isRecord(value.general) ? value.general : {},
    defaultAppearance.general,
  )
  const editor = isRecord(value.editor) ? value.editor : {}
  return {
    general,
    sender: isRecord(value.sender) ? migratedSurface(value.sender, general) : null,
    editor: {
      surface: isRecord(editor.surface) ? migratedSurface(editor.surface, general) : null,
      highlightCurrentLine: typeof editor.highlightCurrentLine === 'boolean'
        ? editor.highlightCurrentLine
        : defaultAppearance.editor.highlightCurrentLine,
      lineNumbers: typeof editor.lineNumbers === 'boolean'
        ? editor.lineNumbers
        : defaultAppearance.editor.lineNumbers,
    },
    fileIcons: oneOf(value.fileIcons, ['colored', 'monochrome', 'hidden'], defaultAppearance.fileIcons),
  }
}

function appearanceV1(value: Record<string, unknown>): ShikitorAppearance {
  const legacySender = migratedSurface(
    isRecord(value.sender) ? value.sender : {},
    defaultAppearance.general,
  )
  const legacyEditorRecord = isRecord(value.editor) ? value.editor : {}
  const legacyEditor = migratedSurface(legacyEditorRecord, defaultAppearance.general)
  return {
    ...defaultAppearance,
    sender: sameSurface(legacySender, defaultAppearance.general) ? null : legacySender,
    editor: {
      surface: sameSurface(legacyEditor, defaultAppearance.general) ? null : legacyEditor,
      highlightCurrentLine: typeof legacyEditorRecord.highlightCurrentLine === 'boolean'
        ? legacyEditorRecord.highlightCurrentLine
        : defaultAppearance.editor.highlightCurrentLine,
      lineNumbers: typeof legacyEditorRecord.lineNumbers === 'boolean'
        ? legacyEditorRecord.lineNumbers
        : defaultAppearance.editor.lineNumbers,
    },
    fileIcons: oneOf(value.fileIcons, ['colored', 'monochrome', 'hidden'], defaultAppearance.fileIcons),
  }
}

function readAppearance(): ShikitorAppearance {
  if (typeof localStorage === 'undefined') return defaultAppearance
  try {
    const value = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? 'null') as unknown
    if (isRecord(value)) return appearanceV2(value)
    const legacy = JSON.parse(localStorage.getItem(LEGACY_APPEARANCE_STORAGE_KEY) ?? 'null') as unknown
    return isRecord(legacy) ? appearanceV1(legacy) : defaultAppearance
  } catch {
    return defaultAppearance
  }
}

function readPreferences(): ShikitorPreferences {
  if (typeof localStorage === 'undefined') return defaultPreferences
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? 'null') as unknown
    const editor = isRecord(value) && isRecord(value.editor) ? value.editor : {}
    const sender = isRecord(value) && isRecord(value.sender) ? value.sender : {}
    return {
      editor: {
        autoSave: typeof editor.autoSave === 'boolean'
          ? editor.autoSave
          : defaultPreferences.editor.autoSave,
      },
      sender: {
        folderExcludes: typeof sender.folderExcludes === 'string'
          ? sender.folderExcludes.slice(0, 4_000)
          : defaultPreferences.sender.folderExcludes,
        folderIncludes: typeof sender.folderIncludes === 'string'
          ? sender.folderIncludes.slice(0, 4_000)
          : defaultPreferences.sender.folderIncludes,
      },
    }
  } catch {
    return defaultPreferences
  }
}

function readConfiguredFileIconRules(): readonly ShikitorConfiguredFileIconRule[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const value = JSON.parse(localStorage.getItem(FILE_ICON_RULES_STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.flatMap((candidate): ShikitorConfiguredFileIconRule[] => {
      if (!isRecord(candidate)
        || typeof candidate.id !== 'string'
        || typeof candidate.pattern !== 'string'
        || (candidate.source !== 'atom' && candidate.source !== 'image')
        || typeof candidate.value !== 'string') return []
      return [{
        id: candidate.id,
        pattern: candidate.pattern,
        source: candidate.source,
        value: candidate.value,
      }]
    }).slice(0, 100)
  } catch {
    return []
  }
}

function editorLanguage(path: string): BundledLanguage {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLocaleLowerCase()
  const languages: Readonly<Record<string, BundledLanguage>> = {
    bash: 'bash', cjs: 'javascript', css: 'css', html: 'html', htm: 'html',
    js: 'javascript', json: 'json', jsonc: 'jsonc', jsx: 'javascript',
    md: 'markdown', mdx: 'markdown', mjs: 'javascript', py: 'python',
    sass: 'scss', scss: 'scss', sh: 'shellscript', svelte: 'svelte',
    ts: 'typescript', tsx: 'typescript', vue: 'vue', yaml: 'yaml', yml: 'yaml',
  }
  return languages[extension] ?? 'markdown'
}

function fileName(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1) || normalized
}

class ObservableValue<T> implements HostObservable<T> {
  private readonly listeners = new Set<() => void>()

  constructor(private value: T) {}

  getSnapshot(): T {
    return this.value
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  set(value: T): void {
    this.value = value
    for (const listener of [...this.listeners]) listener()
  }
}

class PluginList implements HostObservable<readonly InputShikitorPlugin[]> {
  private readonly source = new ObservableValue<readonly InputShikitorPlugin[]>([])

  getSnapshot(): readonly InputShikitorPlugin[] {
    return this.source.getSnapshot()
  }

  subscribe(listener: () => void): () => void {
    return this.source.subscribe(listener)
  }

  add(plugin: InputShikitorPlugin): () => void {
    this.source.set([...this.source.getSnapshot(), plugin])
    let active = true
    return () => {
      if (!active) return
      active = false
      this.source.set(this.source.getSnapshot().filter(candidate => candidate !== plugin))
    }
  }
}

/** Public browser-side registry and configuration service for Shikitor surfaces. */
export interface ShikitorService {
  readonly appearance: HostObservable<ShikitorAppearance>
  readonly configuredFileIconRules: HostObservable<readonly ShikitorConfiguredFileIconRule[]>
  readonly fileIconRules: HostObservable<readonly ShikitorFileIconRule[]>
  readonly preferences: HostObservable<ShikitorPreferences>
  configureAppearance(update: ShikitorAppearanceUpdate): void
  configureFileIconRules(rules: readonly ShikitorConfiguredFileIconRule[]): void
  configurePreferences(update: ShikitorPreferencesUpdate): void
  configureSurface(surface: ShikitorSurface, update: Partial<ShikitorSurfaceAppearance>): void
  createFile(sessionId: SessionId, path: string): Promise<void>
  document(sessionId: SessionId): HostObservable<ShikitorEditorDocument>
  openFile(sessionId: SessionId, path: string): Promise<void>
  publishEditorContext(
    sessionId: SessionId,
    leaseId: string,
    context: ShikitorEditorContext,
  ): Promise<void>
  clearEditorContext(sessionId: SessionId, leaseId: string): Promise<void>
  register(surface: ShikitorSurface, plugin: InputShikitorPlugin): () => void
  registerFileIcon(rule: ShikitorFileIconRule): () => void
  resetSurface(surface: ShikitorSurface): void
  resolveAppearance(surface: ShikitorSurface): ShikitorSurfaceAppearance
  resolveFileIcon(path: string): ResolvedFileIcon
  saveDocument(sessionId: SessionId): Promise<void>
  source(surface: ShikitorSurface): HostObservable<readonly InputShikitorPlugin[]>
  updateDocument(sessionId: SessionId, value: string): void
}

/** Cordis service installed as `ctx.shikitor` in the DSH browser tree. */
export class ShikitorRuntime extends Service implements ShikitorService {
  readonly appearance = new ObservableValue(readAppearance())
  readonly configuredFileIconRules = new ObservableValue(readConfiguredFileIconRules())
  readonly fileIconRules: HostObservable<readonly ShikitorFileIconRule[]>
  readonly preferences = new ObservableValue(readPreferences())
  private readonly connection: ConnectionHandle
  private configuredFileIconDisposers: Array<() => void> = []
  private readonly documents = new Map<SessionId, ObservableValue<ShikitorEditorDocument>>()
  private readonly icons = new FileIconRegistry()
  private readonly imageSources = new Map<string, CachedImageSource>()
  private readonly editorContextRevisions = new Map<string, number>()
  private readonly autoSaveTimers = new Map<SessionId, ReturnType<typeof setTimeout>>()
  private readonly saveQueues = new Map<SessionId, Promise<void>>()
  private readonly sessions: ISessions
  private readonly sources: Record<ShikitorSurface, PluginList> = {
    sender: new PluginList(),
    editor: new PluginList(),
  }

  /** @param ctx - Client Cordis context that owns the service lifecycle. */
  constructor(ctx: ClientContext) {
    super(ctx, 'shikitor')
    this.connection = ctx.get('connection') as ConnectionHandle
    this.sessions = ctx.get('sessions') as ISessions
    this.fileIconRules = this.icons
    this.applyConfiguredFileIconRules()
  }

  configureAppearance(update: ShikitorAppearanceUpdate): void {
    const current = this.appearance.getSnapshot()
    const editorUpdate = update.editor
    const surfaceUpdate = editorUpdate?.surface
    const next = {
      ...current,
      fileIcons: update.fileIcons ?? current.fileIcons,
      general: update.general === undefined
        ? current.general
        : { ...current.general, ...update.general },
      sender: update.sender === undefined
        ? current.sender
        : update.sender === null
          ? null
          : { ...resolveSurfaceAppearance(current, 'sender'), ...update.sender },
      editor: editorUpdate === undefined
        ? current.editor
        : {
            ...current.editor,
            ...(editorUpdate.highlightCurrentLine === undefined
              ? {}
              : { highlightCurrentLine: editorUpdate.highlightCurrentLine }),
            ...(editorUpdate.lineNumbers === undefined
              ? {}
              : { lineNumbers: editorUpdate.lineNumbers }),
            surface: surfaceUpdate === undefined
              ? current.editor.surface
              : surfaceUpdate === null
                ? null
                : { ...resolveSurfaceAppearance(current, 'editor'), ...surfaceUpdate },
          },
    }
    this.appearance.set(next)
    try { localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next)) } catch {}
  }

  configureFileIconRules(rules: readonly ShikitorConfiguredFileIconRule[]): void {
    const next = rules.slice(0, 100).map(rule => ({ ...rule }))
    this.configuredFileIconRules.set(next)
    try { localStorage.setItem(FILE_ICON_RULES_STORAGE_KEY, JSON.stringify(next)) } catch {}
    this.imageSources.clear()
    this.applyConfiguredFileIconRules()
  }

  configurePreferences(update: ShikitorPreferencesUpdate): void {
    const current = this.preferences.getSnapshot()
    const next: ShikitorPreferences = {
      editor: { ...current.editor, ...update.editor },
      sender: { ...current.sender, ...update.sender },
    }
    this.preferences.set(next)
    try { localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next)) } catch {}
    if (current.editor.autoSave === next.editor.autoSave) return
    if (next.editor.autoSave) {
      for (const [sessionId, source] of this.documents) {
        if (source.getSnapshot().dirty) this.scheduleDocumentSave(sessionId)
      }
    } else {
      for (const sessionId of [...this.autoSaveTimers.keys()]) this.clearDocumentSaveTimer(sessionId)
    }
  }

  configureSurface(surface: ShikitorSurface, update: Partial<ShikitorSurfaceAppearance>): void {
    if (surface === 'sender') this.configureAppearance({ sender: update })
    else this.configureAppearance({ editor: { surface: update } })
  }

  async createFile(sessionId: SessionId, path: string): Promise<void> {
    await this.saveBeforeDocumentSwitch(sessionId)
    const cwd = this.sessions.list.getSnapshot().byId[sessionId]?.cwd
    if (cwd === undefined) throw new Error('当前会话没有工作区')
    const result = await this.connection.rpc.call(
      '/api',
      'shikitorCatalog/create',
      { args: { cwd, path } },
    )
    if (!result.ok) throw new Error(result.error.message)
    if (!isFileReadResponse(result.value)) throw new TypeError('file creator returned an invalid payload')
    this.documentSource(sessionId).set({
      dirty: false,
      language: editorLanguage(result.value.path),
      name: fileName(result.value.path),
      path: result.value.path,
      status: 'ready',
      value: result.value.text,
    })
  }

  document(sessionId: SessionId): HostObservable<ShikitorEditorDocument> {
    return this.documentSource(sessionId)
  }

  async openFile(sessionId: SessionId, path: string): Promise<void> {
    const source = this.documentSource(sessionId)
    try {
      await this.saveBeforeDocumentSwitch(sessionId)
    } catch {
      return
    }
    const previous = source.getSnapshot()
    const name = fileName(path)
    source.set({ ...previous, dirty: false, name, path, status: 'loading' })
    const cwd = this.sessions.list.getSnapshot().byId[sessionId]?.cwd
    if (cwd === undefined) {
      source.set({ ...source.getSnapshot(), status: 'error', error: '当前会话没有工作区' })
      return
    }
    try {
      const result = await this.connection.rpc.call(
        '/api',
        'shikitorCatalog/read',
        { args: { cwd, path, maxBytes: MAX_EDITOR_FILE_BYTES } },
      )
      if (!result.ok) throw new Error(result.error.message)
      if (!isFileReadResponse(result.value)) throw new TypeError('file reader returned an invalid payload')
      source.set({
        dirty: false,
        language: editorLanguage(result.value.path),
        name: fileName(result.value.path),
        path: result.value.path,
        status: 'ready',
        value: result.value.text,
      })
    } catch (error) {
      source.set({
        ...source.getSnapshot(),
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async publishEditorContext(
    sessionId: SessionId,
    leaseId: string,
    context: ShikitorEditorContext,
  ): Promise<void> {
    const revision = this.nextEditorContextRevision(leaseId)
    const result = await this.connection.rpc.call(
      '/api',
      'shikitorContext/update',
      { args: { sessionId, leaseId, revision, files: context.files, comments: context.comments } },
    )
    if (!result.ok) throw new Error(result.error.message)
  }

  async clearEditorContext(sessionId: SessionId, leaseId: string): Promise<void> {
    const revision = this.nextEditorContextRevision(leaseId)
    const result = await this.connection.rpc.call(
      '/api',
      'shikitorContext/clear',
      { args: { sessionId, leaseId, revision } },
    )
    if (!result.ok) throw new Error(result.error.message)
  }

  register(surface: ShikitorSurface, plugin: InputShikitorPlugin): () => void {
    return this.sources[surface].add(plugin)
  }

  registerFileIcon(rule: ShikitorFileIconRule): () => void {
    return this.icons.register(rule)
  }

  resetSurface(surface: ShikitorSurface): void {
    if (surface === 'sender') this.configureAppearance({ sender: null })
    else this.configureAppearance({ editor: { surface: null } })
  }

  resolveAppearance(surface: ShikitorSurface): ShikitorSurfaceAppearance {
    return resolveSurfaceAppearance(this.appearance.getSnapshot(), surface)
  }

  resolveFileIcon(path: string): ResolvedFileIcon {
    return this.icons.resolve(path)
  }

  saveDocument(sessionId: SessionId): Promise<void> {
    this.clearDocumentSaveTimer(sessionId)
    const previous = this.saveQueues.get(sessionId) ?? Promise.resolve()
    const queued = previous.catch(() => {}).then(async () => { await this.persistDocument(sessionId) })
    this.saveQueues.set(sessionId, queued)
    void queued.finally(() => {
      if (this.saveQueues.get(sessionId) === queued) this.saveQueues.delete(sessionId)
    }).catch(() => {})
    return queued
  }

  source(surface: ShikitorSurface): HostObservable<readonly InputShikitorPlugin[]> {
    return this.sources[surface]
  }

  updateDocument(sessionId: SessionId, value: string): void {
    const source = this.documentSource(sessionId)
    source.set({ ...source.getSnapshot(), dirty: true, error: undefined, value })
    if (this.preferences.getSnapshot().editor.autoSave) this.scheduleDocumentSave(sessionId)
  }

  private clearDocumentSaveTimer(sessionId: SessionId): void {
    const timer = this.autoSaveTimers.get(sessionId)
    if (timer === undefined) return
    clearTimeout(timer)
    this.autoSaveTimers.delete(sessionId)
  }

  private scheduleDocumentSave(sessionId: SessionId): void {
    this.clearDocumentSaveTimer(sessionId)
    const timer = setTimeout(() => {
      if (this.autoSaveTimers.get(sessionId) !== timer) return
      this.autoSaveTimers.delete(sessionId)
      void this.saveDocument(sessionId).catch(() => {})
    }, AUTO_SAVE_DELAY_MS)
    this.autoSaveTimers.set(sessionId, timer)
  }

  private async saveBeforeDocumentSwitch(sessionId: SessionId): Promise<void> {
    const document = this.documentSource(sessionId).getSnapshot()
    if (!document.dirty || !this.preferences.getSnapshot().editor.autoSave) return
    await this.saveDocument(sessionId)
  }

  private async persistDocument(sessionId: SessionId): Promise<void> {
    const source = this.documentSource(sessionId)
    const document = source.getSnapshot()
    if (!document.dirty) return
    if (document.path === undefined) throw new Error('没有可保存的文件')
    const cwd = this.sessions.list.getSnapshot().byId[sessionId]?.cwd
    if (cwd === undefined) throw new Error('当前会话没有工作区')
    try {
      const result = await this.connection.rpc.call(
        '/api',
        'shikitorCatalog/write',
        { args: { cwd, path: document.path, text: document.value, maxBytes: MAX_EDITOR_FILE_BYTES } },
      )
      if (!result.ok) throw new Error(result.error.message)
      if (!isFileReadResponse(result.value)) throw new TypeError('file writer returned an invalid payload')
      const current = source.getSnapshot()
      if (current === document && result.value.path === document.path) {
        source.set({ ...current, dirty: false, error: undefined, status: 'ready' })
      }
    } catch (error) {
      const current = source.getSnapshot()
      if (current === document) {
        source.set({
          ...current,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      throw error
    }
  }

  private nextEditorContextRevision(leaseId: string): number {
    const revision = (this.editorContextRevisions.get(leaseId) ?? 0) + 1
    this.editorContextRevisions.set(leaseId, revision)
    return revision
  }

  private applyConfiguredFileIconRules(): void {
    for (const dispose of this.configuredFileIconDisposers) dispose()
    this.configuredFileIconDisposers = []
    const rules = this.configuredFileIconRules.getSnapshot()
    rules.forEach((rule, index) => {
      const pattern = rule.pattern.trim()
      const value = rule.value.trim()
      if (pattern === '' || value === '') return
      const icon: ShikitorFileIconRule['icon'] = rule.source === 'atom'
        ? value
        : document => this.renderConfiguredImage(document, value)
      this.configuredFileIconDisposers.push(this.icons.register({
        icon,
        match: target => matchesFileIconPattern(pattern, target.path),
        priority: 10_000 + index,
      }))
    })
  }

  private renderConfiguredImage(document: Document, source: string): Element {
    if (/^(?:blob:|data:image\/|https?:\/\/)/iu.test(source)) {
      return this.imageElement(document, source)
    }
    const state = this.workspaceImageSource(source)
    if (state?.state === 'ready') return this.imageElement(document, state.url)
    const placeholder = document.createElement('i')
    placeholder.classList.add('dsh-shikitor-file-icon', 'icon', 'image-icon')
    placeholder.setAttribute('aria-hidden', 'true')
    return placeholder
  }

  private imageElement(document: Document, source: string): HTMLImageElement {
    const image = document.createElement('img')
    image.classList.add('dsh-shikitor-file-icon__image')
    image.alt = ''
    image.src = source
    return image
  }

  private workspaceImageSource(source: string): CachedImageSource | undefined {
    const sessionState = this.sessions.list.getSnapshot()
    const sessionId = sessionState.current ?? sessionState.ids[0]
    const cwd = sessionId === undefined ? undefined : sessionState.byId[sessionId]?.cwd
    if (cwd === undefined) return undefined
    const key = `${cwd}\u0000${source}`
    const cached = this.imageSources.get(key)
    if (cached !== undefined) return cached
    const loading: CachedImageSource = { state: 'loading' }
    this.imageSources.set(key, loading)
    void this.loadWorkspaceImage(key, cwd, source)
    return loading
  }

  private async loadWorkspaceImage(key: string, cwd: string, source: string): Promise<void> {
    try {
      const result = await this.connection.rpc.call(
        '/api',
        'shikitorCatalog/icon',
        { args: { cwd, path: source } },
      )
      if (!result.ok || !isFileIconReadResponse(result.value)) {
        this.imageSources.set(key, { state: 'error' })
      } else {
        this.imageSources.set(key, { state: 'ready', url: result.value.dataUrl })
      }
    } catch {
      this.imageSources.set(key, { state: 'error' })
    }
    this.icons.refresh()
  }

  private documentSource(sessionId: SessionId): ObservableValue<ShikitorEditorDocument> {
    let source = this.documents.get(sessionId)
    if (source !== undefined) return source
    source = new ObservableValue({
      dirty: false,
      language: 'markdown',
      name: '',
      status: 'ready',
      value: '',
    })
    this.documents.set(sessionId, source)
    return source
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Shikitor surface registry, appearance, file icons, and editor documents. */
    shikitor: ShikitorService
  }
}
