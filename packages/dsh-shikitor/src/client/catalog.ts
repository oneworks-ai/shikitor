import type { ClientContext, ISessions, SessionId, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ConnectionHandle,
  DynamicCordisInventoryRow,
  SkillEntry,
} from '@deepseek-ai/dsh-api-remotes/client'
import type {
  InputTriggerCandidate,
  InputTriggerController,
  InputTriggerServiceContract,
  InputTriggerSource,
  TriggerChar,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'

import { createSessionLink } from './sessionLinks.ts'

const FILE_LIMIT = 4_000
const CANDIDATE_LIMIT = 80
const CACHE_TTL_MS = 15_000
const TRIGGER_MENU_WAIT_MS = 5_000

export interface TriggerSuggestion {
  readonly trigger: TriggerChar
  readonly source: string
  readonly name: string
  readonly description?: string
  readonly icon?: string
}

export type MentionProtocol = 'file' | 'plugin'

interface FileCatalogResponse {
  readonly files: readonly string[]
  readonly truncated: boolean
}

interface SubagentLabelEntry {
  readonly id: string
  readonly kind: 'child'
  readonly label: string
}

interface SettledCatalog<T> {
  readonly value: readonly T[]
  readonly settledAt: number
}

interface PendingCatalog<T> {
  readonly promise: Promise<readonly T[]>
  settled?: SettledCatalog<T>
}

function isFileCatalogResponse(value: unknown): value is FileCatalogResponse {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<FileCatalogResponse>
  return Array.isArray(candidate.files)
    && candidate.files.every(file => typeof file === 'string')
    && typeof candidate.truncated === 'boolean'
}

function subagentLabelEntries(value: unknown): readonly SubagentLabelEntry[] {
  if (typeof value !== 'object' || value === null || !('entries' in value)) return []
  const entries = value.entries
  if (!Array.isArray(entries)) return []
  return entries.flatMap((entry): SubagentLabelEntry[] => {
    if (typeof entry !== 'object'
      || entry === null
      || !('kind' in entry)
      || entry.kind !== 'child'
      || !('id' in entry)
      || typeof entry.id !== 'string'
      || !('label' in entry)
      || typeof entry.label !== 'string') return []
    return [{ id: entry.id, kind: 'child', label: entry.label }]
  })
}

function matchRank(path: string, query: string): number {
  if (query === '') return 0
  const haystack = path.toLocaleLowerCase()
  const needle = query.toLocaleLowerCase()
  const basename = haystack.slice(haystack.lastIndexOf('/') + 1)
  if (basename.startsWith(needle)) return 0
  if (haystack.startsWith(needle)) return 1
  if (basename.includes(needle)) return 2
  if (haystack.includes(needle)) return 3
  return Number.POSITIVE_INFINITY
}

function hasHiddenPathSegment(path: string): boolean {
  return path.split('/').some(segment => segment.startsWith('.'))
}

function requestsHiddenPath(query: string): boolean {
  return query.split('/').some(segment => segment.startsWith('.'))
}

function fileName(path: string): string {
  return path.split(/[\\/]/u).at(-1) || path
}

function markdownLabel(value: string): string {
  return value.replace(/[\\\[\]]/gu, character => `\\${character}`)
}

function markdownTitle(value: string): string {
  return value.replace(/[\\"]/gu, character => `\\${character}`)
}

function absoluteFilePath(cwd: string, path: string): string {
  const base = cwd.replaceAll('\\', '/').replace(/\/+$/u, '')
  const relative = path.replaceAll('\\', '/').replace(/^\/+/, '')
  return `${base}/${relative}`
}

function markdownFileLink(cwd: string, path: string): string {
  const name = fileName(path)
  const destination = absoluteFilePath(cwd, path)
    .replaceAll('<', '%3C')
    .replaceAll('>', '%3E')
  return `[${markdownLabel(name)}](<${destination}> "${markdownTitle(name)}")`
}

function matchingFiles(files: readonly string[], query: string): readonly string[] {
  const includeHidden = requestsHiddenPath(query)
  return files
    .filter(path => includeHidden || !hasHiddenPathSegment(path))
    .map(path => ({ path, rank: matchRank(path, query) }))
    .filter(candidate => Number.isFinite(candidate.rank))
    .sort((left, right) => left.rank - right.rank || left.path.localeCompare(right.path))
    .slice(0, CANDIDATE_LIMIT)
    .map(({ path }) => path)
}

/** Shared, real-data directory used by the sender's DSH and Shikitor menus. */
export class SenderCatalog {
  private readonly connection: ConnectionHandle
  private readonly remote: ClientContext['remote']
  private readonly inputTriggers: InputTriggerServiceContract
  private readonly sessions: ISessions
  private readonly fileFetches = new Map<string, PendingCatalog<string>>()
  private readonly skillFetches = new Map<SessionId, PendingCatalog<SkillEntry>>()
  private pluginFetch: PendingCatalog<DynamicCordisInventoryRow> | undefined
  private readonly fileLexiconListeners = new Map<SessionId, Set<() => void>>()

  constructor(ctx: ClientContext) {
    this.connection = ctx.get('connection') as ConnectionHandle
    this.remote = ctx.remote
    this.inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract
    this.sessions = ctx.get('sessions') as ISessions
    ctx.on('connection/reset', () => { this.clear() })
  }

  /** Current sidebar rows, in the same order as the sidebar's session store. */
  chats(): readonly SessionSummary[] {
    const state = this.sessions.list.getSnapshot()
    const subagentLabels = new Map<string, string>()
    for (const catalog of Object.values(state.subagentsByParent)) {
      for (const entry of subagentLabelEntries(catalog)) {
        if (entry.label.trim() === '') continue
        subagentLabels.set(entry.id, entry.label)
      }
    }

    return state.ids.flatMap((id) => {
      const chat = state.byId[id]
      if (chat === undefined || (chat.blank && id !== state.current)) return []
      const subagentLabel = subagentLabels.get(id)
      return [subagentLabel === undefined ? chat : { ...chat, displayTitle: subagentLabel }]
    })
  }

  /** Stable Markdown link consumed by DSH and projected as an atomic sender reference. */
  chatLink(chat: SessionSummary): string {
    return createSessionLink(chat.displayTitle, chat.id)
  }

  /** Session skill catalog, including filesystem and plugin providers. */
  skills(sessionId: SessionId): Promise<readonly SkillEntry[]> {
    const existing = this.skillFetches.get(sessionId)
    if (existing?.settled !== undefined && Date.now() - existing.settled.settledAt < CACHE_TTL_MS) {
      return Promise.resolve(existing.settled.value)
    }
    if (existing !== undefined && existing.settled === undefined) return existing.promise

    const promise = (async () => {
      const { result } = await this.connection.api.skills.list({ sessionId })
      if (!result.ok) throw new Error(`skill.list failed: ${result.error.code}: ${result.error.message}`)
      return result.value.skills
    })()
    const fetch: PendingCatalog<SkillEntry> = { promise }
    this.skillFetches.set(sessionId, fetch)
    promise.then(
      value => { fetch.settled = { value, settledAt: Date.now() } },
      () => { if (this.skillFetches.get(sessionId) === fetch) this.skillFetches.delete(sessionId) },
    )
    return promise
  }

  /**
   * Mirror the settled DSH trigger groups into Shikitor without copying any
   * command, skill, plugin, or subagent business registry.
   */
  triggerSuggestions(
    sessionId: SessionId,
    trigger: TriggerChar,
    query: string,
  ): Promise<readonly TriggerSuggestion[]> {
    const controller = this.controller(sessionId)
    if (controller === undefined) return Promise.resolve([])

    return new Promise((resolve) => {
      let matched = false
      let unsubscribe: (() => void) | undefined
      let timeout: ReturnType<typeof setTimeout> | undefined
      const suggestions = (): TriggerSuggestion[] => {
        const state = controller.menu.getSnapshot()
        if (state.hit?.trigger !== trigger || state.hit.query !== query) return []
        return state.groups.flatMap(group => group.status === 'ready'
          ? group.items.map(item => ({
              trigger,
              source: group.source,
              name: item.name,
              ...item.description === undefined ? {} : { description: item.description },
              ...item.icon === undefined ? {} : { icon: item.icon },
            }))
          : [],
        )
      }
      const finish = (value: readonly TriggerSuggestion[]): void => {
        if (timeout !== undefined) clearTimeout(timeout)
        unsubscribe?.()
        resolve(value)
      }
      const inspect = (): void => {
        const state = controller.menu.getSnapshot()
        if (state.hit?.trigger === trigger && state.hit.query === query) {
          matched = true
          if (state.groups.every(group => group.status === 'ready')) finish(suggestions())
          return
        }
        if (matched && !state.open) finish([])
      }

      unsubscribe = controller.menu.subscribe(inspect)
      timeout = setTimeout(() => { finish(suggestions()) }, TRIGGER_MENU_WAIT_MS)
      inspect()
    })
  }

  /** Query one `@` source with a protocol prefix removed from its search term. */
  async mentionSuggestions(
    sessionId: SessionId,
    protocol: MentionProtocol,
    query: string,
  ): Promise<readonly TriggerSuggestion[]> {
    if (protocol === 'file') {
      const files = matchingFiles(await this.files(sessionId), query)
      return files.map(name => ({ trigger: '@', source: 'file', name, description: '文件' }))
    }

    const rows = await this.plugins()
    return rows
      .filter(row => row.agentId === sessionId)
      .map(row => {
        const name = String(row.pluginId)
        const packageId = row.nextPackageId ?? row.currentPackageId ?? row.packages.at(-1)?.packageId
        const pkg = packageId === undefined
          ? undefined
          : row.packages.find(candidate => candidate.packageId === packageId)
        return { name, description: pkg?.purpose, rank: matchRank(name, query) }
      })
      .filter(candidate => Number.isFinite(candidate.rank))
      .sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name))
      .slice(0, CANDIDATE_LIMIT)
      .map(({ name, description }) => ({
        trigger: '@' as const,
        source: 'cordis',
        name,
        ...(description === undefined ? {} : { description }),
      }))
  }

  /** Serialize one workspace file as a titled Markdown link with an absolute target. */
  fileLink(sessionId: SessionId, path: string): string {
    const cwd = this.sessions.list.getSnapshot().byId[sessionId]?.cwd
    return cwd === undefined ? path : markdownFileLink(cwd, path)
  }

  /** Resolve one catalog-relative file path against the session workspace. */
  workspaceFilePath(sessionId: SessionId, path: string): string {
    const cwd = this.sessions.list.getSnapshot().byId[sessionId]?.cwd
    return cwd === undefined ? path : absoluteFilePath(cwd, path)
  }

  /** Shared cached workspace file catalog used by mentions and the editor tree. */
  workspaceFiles(sessionId: SessionId): Promise<readonly string[]> {
    return this.files(sessionId)
  }

  /** Drop the shared file snapshot after a workspace mutation. */
  invalidateWorkspaceFiles(sessionId: SessionId): void {
    const cwd = this.sessions.list.getSnapshot().byId[sessionId]?.cwd
    if (cwd !== undefined) this.fileFetches.delete(cwd)
  }

  /** Route a Shikitor selection back through DSH's public pick transaction. */
  pickTriggerSuggestion(
    sessionId: SessionId,
    trigger: TriggerChar,
    source: string,
    name: string,
  ): boolean {
    const controller = this.controller(sessionId)
    const state = controller?.menu.getSnapshot()
    if (controller === undefined || state?.hit?.trigger !== trigger) return false
    const group = state.groups.find(candidate => candidate.source === source)
    if (group?.status !== 'ready') return false
    const index = group.items.findIndex(candidate => candidate.name === name)
    if (index < 0) return false
    controller.pick(source, index)
    return true
  }

  /** Observe DSH's programmatic menu launcher (the composer command button). */
  subscribeLauncher(sessionId: SessionId, listener: (source: string | null) => void): () => void {
    const controller = this.controller(sessionId)
    if (controller === undefined) {
      listener(null)
      return () => {}
    }
    const publish = (): void => { listener(controller.launcher.getSnapshot()) }
    const unsubscribe = controller.launcher.subscribe(publish)
    publish()
    return unsubscribe
  }

  /** Current programmatic launcher source, used to distinguish it from typed triggers. */
  launcherSource(sessionId: SessionId): string | null {
    return this.controller(sessionId)?.launcher.getSnapshot() ?? null
  }

  /** Register a native DSH `@` source backed by the host file catalog. */
  registerFileSource(inputTriggers: InputTriggerServiceContract): () => void {
    const source: InputTriggerSource = {
      trigger: '@',
      name: 'file',
      order: 100,
      candidates: async (session, { query, signal }) => {
        const files = await this.files(session.sessionId)
        if (signal.aborted) return []
        return matchingFiles(files, query)
          .map((path): InputTriggerCandidate => ({ name: path, description: '文件' }))
      },
      warm: (session) => { void this.files(session.sessionId).catch(() => {}) },
      lexicon: (session) => this.settledFiles(session.sessionId),
      subscribeLexicon: (session, listener) => {
        const listeners = this.fileLexiconListeners.get(session.sessionId) ?? new Set()
        listeners.add(listener)
        this.fileLexiconListeners.set(session.sessionId, listeners)
        return () => {
          listeners.delete(listener)
          if (listeners.size === 0) this.fileLexiconListeners.delete(session.sessionId)
        }
      },
      onPick: ({ candidate, session }) => ({
        text: `${this.fileLink(session.sessionId, candidate.name)} `,
      }),
    }
    return inputTriggers.registerSource(source)
  }

  private settledFiles(sessionId: SessionId): readonly string[] | undefined {
    const cwd = this.sessions.list.getSnapshot().byId[sessionId]?.cwd
    if (cwd === undefined) return undefined
    return this.fileFetches.get(cwd)?.settled?.value
  }

  private controller(sessionId: SessionId): InputTriggerController | undefined {
    const scope = this.sessions.scope(sessionId)
    return scope === undefined ? undefined : this.inputTriggers.sessionOf(scope)
  }

  private files(sessionId: SessionId): Promise<readonly string[]> {
    const cwd = this.sessions.list.getSnapshot().byId[sessionId]?.cwd
    if (cwd === undefined) return Promise.resolve([])
    const existing = this.fileFetches.get(cwd)
    if (existing?.settled !== undefined && Date.now() - existing.settled.settledAt < CACHE_TTL_MS) {
      return Promise.resolve(existing.settled.value)
    }
    if (existing !== undefined && existing.settled === undefined) return existing.promise

    const promise = (async () => {
      const result = await this.connection.rpc.call(
        '/api',
        'shikitorCatalog/files',
        { args: { cwd, limit: FILE_LIMIT } },
      )
      if (!result.ok) throw new Error(`file catalog failed: ${result.error.code}: ${result.error.message}`)
      if (!isFileCatalogResponse(result.value)) throw new TypeError('file catalog returned an invalid payload')
      return result.value.files
    })()
    const fetch: PendingCatalog<string> = { promise }
    this.fileFetches.set(cwd, fetch)
    promise.then(
      value => {
        fetch.settled = { value, settledAt: Date.now() }
        this.notifyFileLexicon(cwd)
      },
      () => { if (this.fileFetches.get(cwd) === fetch) this.fileFetches.delete(cwd) },
    )
    return promise
  }

  private plugins(): Promise<readonly DynamicCordisInventoryRow[]> {
    const existing = this.pluginFetch
    if (existing?.settled !== undefined && Date.now() - existing.settled.settledAt < CACHE_TTL_MS) {
      return Promise.resolve(existing.settled.value)
    }
    if (existing !== undefined && existing.settled === undefined) return existing.promise

    const promise = (async () => {
      const result = await this.remote.dynamicCordisRunner.inventory()
      if (!result.ok) throw new Error(`cordis inventory failed: ${result.error.code}: ${result.error.message}`)
      return result.value
    })()
    const fetch: PendingCatalog<DynamicCordisInventoryRow> = { promise }
    this.pluginFetch = fetch
    promise.then(
      value => { fetch.settled = { value, settledAt: Date.now() } },
      () => { if (this.pluginFetch === fetch) this.pluginFetch = undefined },
    )
    return promise
  }

  private notifyFileLexicon(cwd: string): void {
    const state = this.sessions.list.getSnapshot()
    for (const id of state.ids) {
      if (state.byId[id]?.cwd !== cwd) continue
      for (const listener of [...(this.fileLexiconListeners.get(id) ?? [])]) listener()
    }
  }

  private clear(): void {
    this.fileFetches.clear()
    this.skillFetches.clear()
    this.pluginFetch = undefined
    for (const listeners of this.fileLexiconListeners.values()) {
      for (const listener of [...listeners]) listener()
    }
  }
}
