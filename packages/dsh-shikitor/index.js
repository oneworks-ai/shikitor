/** Host half of dsh-shikitor: workspace files and compatible skill roots. */

import { lstat, opendir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

const SKILL_PROVIDER_NAME = 'dsh-shikitor-compatible-filesystem'
const MAX_SKILL_PROJECTS = 128
const MAX_ICON_BYTES = 1024 * 1024
const EDITOR_CONTEXT_MAX_AGE_MS = 90_000
const MAX_CONTEXT_COMMENTS = 128
const MAX_CONTEXT_FILES = 32
const MAX_CONTEXT_SELECTIONS = 64

const ICON_MIME_TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
])

const PROJECT_SKILL_ROOTS = [
  { directory: '.agents', source: 'project-agents', rank: 200 },
  { directory: '.codex', source: 'project-codex', rank: 210 },
  { directory: '.claude', source: 'project-claude', rank: 220 },
  { directory: '.oo', source: 'project-oo', rank: 230 },
]

const USER_SKILL_ROOTS = [
  { directory: '.agents', source: 'user-agents', rank: 500 },
  { directory: '.codex', source: 'user-codex', rank: 510 },
  { directory: '.claude', source: 'user-claude', rank: 520 },
  { directory: '.oo', source: 'user-oo', rank: 530 },
]

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.next',
  '.nuxt',
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
])

function skillRoots(base, specifications) {
  return specifications.map(specification => ({
    path: join(base, specification.directory, 'skills'),
    source: specification.source,
    rank: specification.rank,
  }))
}

function isMissingPath(error) {
  return error !== null
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'ENOENT'
}

async function findProjectRoot(cwd, signal) {
  const fallback = resolve(cwd)
  let current = fallback
  while (true) {
    signal?.throwIfAborted()
    try {
      await lstat(join(current, '.git'))
      return current
    } catch (error) {
      if (!isMissingPath(error)) throw error
    }
    const parent = dirname(current)
    if (parent === current) return fallback
    current = parent
  }
}

function isWithinRoot(path, root) {
  const child = relative(root, path)
  return child !== ''
    && child !== '..'
    && !child.startsWith(`..${sep}`)
    && !isAbsolute(child)
}

function normalizeSkillObservation(output) {
  return Array.isArray(output) ? { candidates: output, complete: true } : output
}

/**
 * Reuse DSH's filesystem parser and loader while adding cross-agent skill
 * locations. The provider remains the execution owner, so the sender catalog
 * and the model-facing skill loader resolve the same winning entry.
 */
class CompatibleSkillProvider {
  name = SKILL_PROVIDER_NAME
  projectProviders = new Map()

  constructor(ctx, control) {
    this.ctx = ctx
    this.control = control
    this.userProvider = this.createProvider(skillRoots(homedir(), USER_SKILL_ROOTS))
  }

  async list(options) {
    const providers = [this.userProvider]
    if (options.cwd !== undefined) {
      const projectRoot = await findProjectRoot(options.cwd, options.signal)
      providers.unshift(this.projectProvider(projectRoot))
    }

    const observations = await Promise.all(providers.map(async (entry) => ({
      entry,
      observation: normalizeSkillObservation(await entry.provider.list(options)),
    })))
    const candidates = observations.flatMap(({ entry, observation }) =>
      observation.candidates.map(candidate => this.rewriteCandidate(entry, candidate)))
    const complete = observations.every(({ observation }) => observation.complete)
    return complete ? candidates : { candidates, complete }
  }

  async get(candidate, options) {
    const locator = candidate.locator
    const definition = await locator.provider.get(locator.candidate, options)
    if (definition === undefined) return undefined
    return {
      ...definition,
      source: candidate.source,
      provider: this.name,
    }
  }

  createProvider(roots) {
    return {
      roots,
      provider: new FileSystemSkillProvider(this.ctx, this.control, {
        providerName: this.name,
        includeDefaultRoots: false,
        customSkillDirs: roots.map(root => root.path),
      }),
    }
  }

  projectProvider(projectRoot) {
    const existing = this.projectProviders.get(projectRoot)
    if (existing !== undefined) {
      this.projectProviders.delete(projectRoot)
      this.projectProviders.set(projectRoot, existing)
      return existing
    }

    const entry = this.createProvider(skillRoots(projectRoot, PROJECT_SKILL_ROOTS))
    this.projectProviders.set(projectRoot, entry)
    if (this.projectProviders.size > MAX_SKILL_PROJECTS) {
      const oldest = this.projectProviders.entries().next()
      if (!oldest.done) {
        this.projectProviders.delete(oldest.value[0])
        void oldest.value[1].provider.dispose().catch((error) => {
          this.ctx.logger.warn(`dsh-shikitor: failed to dispose skill watcher: ${String(error)}`)
        })
      }
    }
    return entry
  }

  rewriteCandidate(entry, candidate) {
    const root = entry.roots.find(current =>
      candidate.path !== undefined && isWithinRoot(candidate.path, current.path))
    if (root === undefined) {
      throw new Error(`dsh-shikitor: skill candidate "${candidate.name}" escaped its configured roots`)
    }
    return {
      ...candidate,
      source: root.source,
      provider: this.name,
      rank: root.rank,
      locator: { provider: entry.provider, candidate },
    }
  }
}

/**
 * Recursively collect ordinary files below one session cwd. The result is
 * deliberately bounded: the client filters a warm snapshot per keystroke,
 * while giant generated/vendor trees never turn a mention popup into a crawl.
 */
async function scanFiles(cwd, limit, signal) {
  const root = resolve(cwd)
  const pending = [root]
  const files = []
  let truncated = false

  // Breadth-first traversal makes the bounded snapshot deterministic and
  // useful: root files arrive before first-level folders, then the next depth.
  for (let directoryIndex = 0; directoryIndex < pending.length; directoryIndex += 1) {
    signal?.throwIfAborted()
    const directory = pending[directoryIndex]
    let handle
    try {
      handle = await opendir(directory)
    } catch (error) {
      if (directory === root) throw error
      continue
    }

    const entries = []
    for await (const entry of handle) entries.push(entry)
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      signal?.throwIfAborted()
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) pending.push(resolve(directory, entry.name))
        continue
      }
      if (!entry.isFile()) continue
      files.push(relative(root, resolve(directory, entry.name)).split(sep).join('/'))
      if (files.length >= limit) {
        truncated = true
        break
      }
    }
    if (files.length >= limit) break
  }

  files.sort((left, right) => {
    const leftDepth = left.split('/').length
    const rightDepth = right.split('/').length
    return leftDepth - rightDepth || left.localeCompare(right)
  })
  return { files, truncated }
}

const remoteInitializers = []
const contextRemoteInitializers = []

class ShikitorCatalogService extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'shikitorCatalog')
    for (const initialize of remoteInitializers) initialize.call(this)
  }

  /** Return relative file paths for an exact, absolute session cwd. */
  async files(cwd, limit, signal) {
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) {
      throw new TypeError('shikitorCatalog.files requires an absolute cwd')
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
      throw new RangeError('shikitorCatalog.files limit must be between 1 and 10000')
    }
    return scanFiles(cwd, limit, signal)
  }

  /** Read one UTF-8 workspace file without allowing lexical or symlink escapes. */
  async read(cwd, path, maxBytes, signal) {
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) {
      throw new TypeError('shikitorCatalog.read requires an absolute cwd')
    }
    if (typeof path !== 'string' || !isAbsolute(path)) {
      throw new TypeError('shikitorCatalog.read requires an absolute path')
    }
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 10 * 1024 * 1024) {
      throw new RangeError('shikitorCatalog.read maxBytes must be between 1 and 10485760')
    }
    signal?.throwIfAborted()
    const root = await realpath(resolve(cwd))
    const target = await realpath(resolve(path.replaceAll('%3C', '<').replaceAll('%3E', '>')))
    if (!isWithinRoot(target, root)) {
      throw new RangeError('shikitorCatalog.read path must stay inside cwd')
    }
    const metadata = await stat(target)
    if (!metadata.isFile()) throw new TypeError('shikitorCatalog.read path is not a file')
    if (metadata.size > maxBytes) throw new RangeError(`shikitorCatalog.read file exceeds ${maxBytes} bytes`)
    const contents = await readFile(target, { signal })
    if (contents.includes(0)) throw new TypeError('shikitorCatalog.read does not open binary files')
    return { path: target, text: contents.toString('utf8') }
  }

  /** Create one empty file below an existing workspace directory. */
  async create(cwd, path, signal) {
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) {
      throw new TypeError('shikitorCatalog.create requires an absolute cwd')
    }
    if (typeof path !== 'string' || !isAbsolute(path)) {
      throw new TypeError('shikitorCatalog.create requires an absolute path')
    }
    signal?.throwIfAborted()
    const root = await realpath(resolve(cwd))
    const target = resolve(path.replaceAll('%3C', '<').replaceAll('%3E', '>'))
    const parent = await realpath(dirname(target))
    if (parent !== root && !isWithinRoot(parent, root)) {
      throw new RangeError('shikitorCatalog.create path must stay inside cwd')
    }
    await writeFile(target, '', { flag: 'wx', signal })
    return { path: target, text: '' }
  }

  /** Atomically replace one existing UTF-8 workspace file. */
  async write(cwd, path, text, maxBytes, signal) {
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) {
      throw new TypeError('shikitorCatalog.write requires an absolute cwd')
    }
    if (typeof path !== 'string' || !isAbsolute(path)) {
      throw new TypeError('shikitorCatalog.write requires an absolute path')
    }
    if (typeof text !== 'string' || text.includes('\0')) {
      throw new TypeError('shikitorCatalog.write requires UTF-8 text')
    }
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 10 * 1024 * 1024) {
      throw new RangeError('shikitorCatalog.write maxBytes must be between 1 and 10485760')
    }
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new RangeError(`shikitorCatalog.write file exceeds ${maxBytes} bytes`)
    }
    signal?.throwIfAborted()
    const root = await realpath(resolve(cwd))
    const target = await realpath(resolve(path.replaceAll('%3C', '<').replaceAll('%3E', '>')))
    if (!isWithinRoot(target, root)) {
      throw new RangeError('shikitorCatalog.write path must stay inside cwd')
    }
    const metadata = await stat(target)
    if (!metadata.isFile()) throw new TypeError('shikitorCatalog.write path is not a file')
    signal?.throwIfAborted()
    await writeFileAtomic(target, text, { mode: metadata.mode & 0o777 })
    return { path: target, text }
  }

  /** Read a workspace image as a browser-safe data URL for custom file icons. */
  async icon(cwd, path, signal) {
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) {
      throw new TypeError('shikitorCatalog.icon requires an absolute cwd')
    }
    if (typeof path !== 'string' || path.trim() === '') {
      throw new TypeError('shikitorCatalog.icon requires a non-empty path')
    }
    signal?.throwIfAborted()
    const root = await realpath(resolve(cwd))
    const requested = path.replace(/^project:/u, '').trim()
    const target = await realpath(isAbsolute(requested)
      ? resolve(requested)
      : resolve(root, requested))
    if (!isWithinRoot(target, root)) {
      throw new RangeError('shikitorCatalog.icon path must stay inside cwd')
    }
    const mime = ICON_MIME_TYPES.get(extname(target).toLocaleLowerCase())
    if (mime === undefined) throw new TypeError('shikitorCatalog.icon only supports image files')
    const metadata = await stat(target)
    if (!metadata.isFile()) throw new TypeError('shikitorCatalog.icon path is not a file')
    if (metadata.size > MAX_ICON_BYTES) {
      throw new RangeError(`shikitorCatalog.icon file exceeds ${MAX_ICON_BYTES} bytes`)
    }
    const contents = await readFile(target, { signal })
    return { path: target, dataUrl: `data:${mime};base64,${contents.toString('base64')}` }
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(value, label, maxLength) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maxLength) {
    throw new TypeError(`${label} must be a non-empty string of at most ${String(maxLength)} characters`)
  }
  return value
}

function contextPosition(value, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`)
  for (const key of ['offset', 'line', 'character']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) {
      throw new TypeError(`${label}.${key} must be a non-negative safe integer`)
    }
  }
  return { offset: value.offset, line: value.line, character: value.character }
}

function contextSelections(value, label) {
  if (!Array.isArray(value) || value.length > MAX_CONTEXT_SELECTIONS) {
    throw new TypeError(`${label} must be an array of at most ${String(MAX_CONTEXT_SELECTIONS)} selections`)
  }
  return value.map((selection, index) => {
    const selectionLabel = `${label}[${String(index)}]`
    if (!isRecord(selection)) throw new TypeError(`${selectionLabel} must be an object`)
    return {
      id: boundedString(selection.id, `${selectionLabel}.id`, 128),
      start: contextPosition(selection.start, `${selectionLabel}.start`),
      end: contextPosition(selection.end, `${selectionLabel}.end`),
    }
  })
}

function contextFiles(value, cwd) {
  if (!Array.isArray(value) || value.length > MAX_CONTEXT_FILES) {
    throw new TypeError(`shikitorContext.update files must be an array of at most ${String(MAX_CONTEXT_FILES)} files`)
  }
  if (value.length > 0 && cwd === undefined) {
    throw new TypeError('shikitorContext.update cannot reference files without a session cwd')
  }
  const paths = new Set()
  return value.map((file, index) => {
    const label = `shikitorContext.update files[${String(index)}]`
    if (!isRecord(file)) throw new TypeError(`${label} must be an object`)
    const path = boundedString(file.path, `${label}.path`, 4096)
    if (!isAbsolute(path)) throw new TypeError(`${label}.path must be absolute`)
    if (cwd !== undefined && !isWithinRoot(resolve(path), resolve(cwd))) {
      throw new RangeError(`${label}.path must stay inside the session cwd`)
    }
    if (paths.has(path)) throw new TypeError(`${label}.path must be unique`)
    paths.add(path)
    return { path, selections: contextSelections(file.selections, `${label}.selections`) }
  })
}

function contextComments(value, files) {
  if (!Array.isArray(value) || value.length > MAX_CONTEXT_COMMENTS) {
    throw new TypeError(`shikitorContext.update comments must be an array of at most ${String(MAX_CONTEXT_COMMENTS)} comments`)
  }
  const paths = new Set(files.map(file => file.path))
  return value.map((comment, index) => {
    const label = `shikitorContext.update comments[${String(index)}]`
    if (!isRecord(comment)) throw new TypeError(`${label} must be an object`)
    const filePath = boundedString(comment.filePath, `${label}.filePath`, 4096)
    if (!paths.has(filePath)) throw new TypeError(`${label}.filePath must reference a supplied file`)
    if (!Array.isArray(comment.selectionIds) || comment.selectionIds.length > MAX_CONTEXT_SELECTIONS) {
      throw new TypeError(`${label}.selectionIds must be an array of at most ${String(MAX_CONTEXT_SELECTIONS)} ids`)
    }
    return {
      id: boundedString(comment.id, `${label}.id`, 128),
      body: boundedString(comment.body, `${label}.body`, 16_384),
      filePath,
      selectionIds: comment.selectionIds.map((id, selectionIndex) =>
        boundedString(id, `${label}.selectionIds[${String(selectionIndex)}]`, 128)),
    }
  })
}

class ShikitorContextService extends TypertRemoteService {
  contexts = new Map()

  constructor(ctx) {
    super(ctx, 'shikitorContext')
    this.agents = ctx.agents
    for (const initialize of contextRemoteInitializers) initialize.call(this)
  }

  /** Publish one browser editor's current reference snapshot. */
  async update(sessionId, leaseId, revision, files, comments, signal) {
    signal?.throwIfAborted()
    boundedString(sessionId, 'shikitorContext.update sessionId', 512)
    boundedString(leaseId, 'shikitorContext.update leaseId', 128)
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new TypeError('shikitorContext.update revision must be a positive safe integer')
    }
    const current = this.contexts.get(sessionId)
    if (current?.leaseId === leaseId && current.revision >= revision) return { accepted: false }
    const checkedFiles = contextFiles(files, this.agents.get(sessionId)?.session.header.cwd)
    const checkedComments = contextComments(comments, checkedFiles)
    this.contexts.set(sessionId, {
      comments: checkedComments,
      files: checkedFiles,
      leaseId,
      revision,
      updatedAt: Date.now(),
    })
    return { accepted: true }
  }

  /** Clear a snapshot only when it still belongs to the caller's editor lease. */
  async clear(sessionId, leaseId, revision, signal) {
    signal?.throwIfAborted()
    boundedString(sessionId, 'shikitorContext.clear sessionId', 512)
    boundedString(leaseId, 'shikitorContext.clear leaseId', 128)
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new TypeError('shikitorContext.clear revision must be a positive safe integer')
    }
    const current = this.contexts.get(sessionId)
    if (current?.leaseId !== leaseId || current.revision >= revision) return { accepted: false }
    this.contexts.delete(sessionId)
    return { accepted: true }
  }

  /** Return a live snapshot or discard a browser lease that stopped refreshing. */
  current(sessionId) {
    const current = this.contexts.get(sessionId)
    if (current === undefined) return undefined
    if (Date.now() - current.updatedAt <= EDITOR_CONTEXT_MAX_AGE_MS) return current
    this.contexts.delete(sessionId)
    return undefined
  }
}

function renderEditorContext(context) {
  if (context.files.length === 0) return undefined
  const paths = context.files.map(file => `- ${JSON.stringify(file.path)}`).join('\n')
  return `Files referenced by the current user message:\n${paths}`
}

// index.js is loaded directly by DSH, so install the same metadata emitted by
// the @Remote decorator without requiring a host build step for this bundle.
Remote('files')(ShikitorCatalogService.prototype.files, {
  name: 'files',
  private: false,
  static: false,
  addInitializer(initializer) {
    remoteInitializers.push(initializer)
  },
})

Remote('read')(ShikitorCatalogService.prototype.read, {
  name: 'read',
  private: false,
  static: false,
  addInitializer(initializer) {
    remoteInitializers.push(initializer)
  },
})

Remote('create')(ShikitorCatalogService.prototype.create, {
  name: 'create',
  private: false,
  static: false,
  addInitializer(initializer) {
    remoteInitializers.push(initializer)
  },
})

Remote('write')(ShikitorCatalogService.prototype.write, {
  name: 'write',
  private: false,
  static: false,
  addInitializer(initializer) {
    remoteInitializers.push(initializer)
  },
})

Remote('icon')(ShikitorCatalogService.prototype.icon, {
  name: 'icon',
  private: false,
  static: false,
  addInitializer(initializer) {
    remoteInitializers.push(initializer)
  },
})

Remote('update')(ShikitorContextService.prototype.update, {
  name: 'update',
  private: false,
  static: false,
  addInitializer(initializer) {
    contextRemoteInitializers.push(initializer)
  },
})

Remote('clear')(ShikitorContextService.prototype.clear, {
  name: 'clear',
  private: false,
  static: false,
  addInitializer(initializer) {
    contextRemoteInitializers.push(initializer)
  },
})

/** DSH services required by the host-side Shikitor integration. */
export const inject = ['agents', 'skills']

/** Install compatible skills, file access and per-message editor references. */
export function apply(ctx) {
  ctx.skills.registerProvider(control => new CompatibleSkillProvider(ctx, control))
  new ShikitorCatalogService(ctx)
  const editorContexts = new ShikitorContextService(ctx)
  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    const context = messages.some(message => message.source.kind === 'user')
      ? editorContexts.current(agent.id)
      : undefined
    const decision = await next()
    if (context === undefined || decision.kind === 'reject' || signal.aborted) return decision
    const text = renderEditorContext(context)
    if (text === undefined) return decision
    const name = 'editor-files'
    return {
      kind: 'enter',
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text }],
          source: {
            kind: 'plugin',
            plugin: 'dsh-shikitor',
            form: 'snapshot',
            sections: [{ name, text }],
          },
        }),
      ],
    }
  })
}
