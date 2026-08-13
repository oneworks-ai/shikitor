import {
  definePlugin,
  formatAriaKeyShortcut,
  formatBinding
} from '@shikitor/core'
import type {
  EditorHitKind,
  InputBinding,
  InputBindingPolicy,
  InputBindingWhen,
  InputDispatchSummary,
  InputModifier,
  InputModifierState,
  InputPlatform,
  InputTrigger,
  ModifierMatcher,
  ShikitorInputEvent,
  ShikitorPlugin
} from '@shikitor/core'

export type InputEventsPresetId =
  | 'mod-primary-click'
  | 'control-context-menu'
  | 'command-palette'
  | 'save-file'

export type InputEventsActionId =
  | 'go-to-definition'
  | 'inspect-context'
  | 'open-command-palette'
  | 'save-file'

export interface InputEventsBindingArgs {
  presetId: InputEventsPresetId
}

/**
 * A JSON-serializable override that can be persisted by the playground or a
 * product settings service. Passing an override with the same id replaces the
 * corresponding fields on the built-in preset.
 */
export interface InputEventsBindingOverride {
  id: InputEventsPresetId
  enabled?: boolean
  trigger?: InputTrigger
  modifiers?: readonly InputModifier[] | {
    required?: readonly InputModifier[]
    forbidden?: readonly InputModifier[]
    mode?: 'exact' | 'at-least'
    allowAltGraph?: boolean
  }
  target?: EditorHitKind | readonly EditorHitKind[]
  platform?: InputPlatform | readonly InputPlatform[]
  when?: InputBindingWhen
  priority?: number
  policy?: InputBindingPolicy
}

export interface InputEventsConfig {
  bindings?: readonly InputEventsBindingOverride[]
  /** Maximum number of serializable input observations kept in memory. */
  traceLimit?: number
  /** Leading-edge throttle for move and wheel observations. */
  motionThrottleMs?: number
}

export interface InputEventsActionObservation {
  actionId: InputEventsActionId
  presetId: InputEventsPresetId
  timestamp: number
  eventType: ShikitorInputEvent['type']
  target: EditorHitKind
  line?: number
  offset?: number
}

export interface InputEventsTraceTarget {
  zone: EditorHitKind
  line?: number
  visualRow?: number
  position?: {
    offset: number
    line: number
    character: number
  }
  token?: {
    text: string
    start: { offset: number; line: number; character: number }
    end: { offset: number; line: number; character: number }
    scopes?: readonly string[]
  }
  point?: {
    clientX: number
    clientY: number
    editorX: number
    editorY: number
  }
}

export interface InputEventsTraceEntry {
  id: number
  timestamp: number
  type: ShikitorInputEvent['type']
  target: InputEventsTraceTarget
  modifiers: InputModifierState
  keyboard?: {
    key: string
    code: string
    repeat: boolean
    isComposing: boolean
  }
  pointer?: {
    pointerType?: string
    button?: string
    physicalButton?: number
    buttons: number
    clicks: number
  }
  mouse?: {
    button?: string
    physicalButton?: number
    buttons: number
    clicks: number
  }
  wheel?: {
    deltaX: number
    deltaY: number
    deltaMode: number
  }
  input?: {
    inputType: string
    data: string | null
    isComposing: boolean
  }
  composition?: { data: string }
  handled: boolean
  matchedBindingIds: readonly string[]
  handledBindingId?: string
  handledActionId?: string
  disposition: {
    preventDefault: boolean
    stopPropagation: boolean
    stopImmediatePropagation: boolean
  }
}

export interface InputEventsBindingView {
  id: InputEventsPresetId
  action: InputEventsActionId
  enabled: boolean
  label: string
  ariaKeyShortcut?: string
  binding: InputBinding<InputEventsBindingArgs>
}

export interface InputEventsSnapshot {
  revision: number
  platform: InputPlatform
  platformLabel: string
  bindings: readonly InputEventsBindingView[]
  trace: readonly InputEventsTraceEntry[]
  actionCounts: Readonly<Record<InputEventsActionId, number>>
  lastAction?: InputEventsActionObservation
}

export interface InputEventsRuntimeOptions {
  config?: InputEventsConfig
  now?: () => number
  onAction?: (action: InputEventsActionObservation) => void
}

export interface InputEventsRuntime {
  readonly plugin: ShikitorPlugin
  getSnapshot(): InputEventsSnapshot
  subscribe(listener: (snapshot: InputEventsSnapshot) => void): () => void
  updateConfig(config: InputEventsConfig): void
  clearTrace(): void
  resetCounts(): void
}

const actionIds: readonly InputEventsActionId[] = [
  'go-to-definition',
  'inspect-context',
  'open-command-palette',
  'save-file'
]

export const INPUT_EVENT_PRESETS: readonly InputBinding<InputEventsBindingArgs>[] = [
  {
    id: 'mod-primary-click',
    action: 'go-to-definition',
    args: { presetId: 'mod-primary-click' },
    trigger: { type: 'click', button: 'primary', source: 'pointer' },
    modifiers: ['Mod'],
    target: 'content',
    when: { focused: true },
    priority: 40,
    policy: { preventDefault: 'handled' }
  },
  {
    id: 'control-context-menu',
    action: 'inspect-context',
    args: { presetId: 'control-context-menu' },
    // Do not constrain the button: browsers report a macOS Control+click as
    // either primary or secondary depending on when the contextmenu fires.
    trigger: { type: 'contextmenu', source: 'pointer' },
    modifiers: ['Control'],
    target: ['content', 'gutter', 'line-number'],
    when: { focused: true },
    priority: 50,
    policy: { preventDefault: 'handled', stopPropagation: 'handled' }
  },
  {
    id: 'command-palette',
    action: 'open-command-palette',
    args: { presetId: 'command-palette' },
    trigger: {
      type: 'keydown',
      key: 'p',
      code: 'KeyP',
      repeat: 'ignore',
      composing: 'ignore'
    },
    modifiers: ['Mod', 'Shift'],
    target: 'content',
    when: { focused: true },
    priority: 30,
    policy: { preventDefault: 'handled' }
  },
  {
    id: 'save-file',
    action: 'save-file',
    args: { presetId: 'save-file' },
    trigger: {
      type: 'keydown',
      key: 's',
      code: 'KeyS',
      repeat: 'ignore',
      composing: 'ignore'
    },
    modifiers: ['Mod'],
    target: 'content',
    when: { focused: true },
    priority: 30,
    policy: { preventDefault: 'handled' }
  }
]

export const DEFAULT_INPUT_EVENTS_CONFIG: Readonly<Required<Pick<
  InputEventsConfig,
  'traceLimit' | 'motionThrottleMs'
>>> = {
  traceLimit: 40,
  motionThrottleMs: 80
}

function cloneBinding(
  binding: InputBinding<InputEventsBindingArgs>
): InputBinding<InputEventsBindingArgs> {
  const modifierMatcher = binding.modifiers && !Array.isArray(binding.modifiers)
    ? binding.modifiers as ModifierMatcher
    : undefined
  return {
    ...binding,
    args: binding.args ? { ...binding.args } : undefined,
    trigger: { ...binding.trigger },
    modifiers: Array.isArray(binding.modifiers)
      ? [...binding.modifiers]
      : modifierMatcher
        ? {
            ...modifierMatcher,
            required: modifierMatcher.required
              ? [...modifierMatcher.required]
              : undefined,
            forbidden: modifierMatcher.forbidden
              ? [...modifierMatcher.forbidden]
              : undefined
          }
        : undefined,
    target: Array.isArray(binding.target) ? [...binding.target] : binding.target,
    platform: Array.isArray(binding.platform)
      ? [...binding.platform]
      : binding.platform,
    when: binding.when
      ? {
          ...binding.when,
          language: Array.isArray(binding.when.language)
            ? [...binding.when.language]
            : binding.when.language
        }
      : undefined,
    policy: binding.policy ? { ...binding.policy } : undefined
  }
}

export function compileInputEventBindings(
  config: InputEventsConfig = {}
): InputBinding<InputEventsBindingArgs>[] {
  const overrides = new Map<InputEventsPresetId, InputEventsBindingOverride>()
  for (const override of config.bindings ?? []) overrides.set(override.id, override)

  return INPUT_EVENT_PRESETS.map(preset => {
    const binding = cloneBinding(preset)
    const override = overrides.get(preset.id as InputEventsPresetId)
    if (!override) return binding
    return cloneBinding({
      ...binding,
      ...override,
      id: binding.id,
      action: binding.action,
      args: binding.args,
      trigger: override.trigger ?? binding.trigger,
      modifiers: override.modifiers ?? binding.modifiers,
      target: override.target ?? binding.target,
      platform: override.platform ?? binding.platform,
      when: override.when ?? binding.when,
      policy: override.policy ?? binding.policy
    })
  })
}

export function getInputPlatformLabel(platform: InputPlatform) {
  switch (platform) {
    case 'macos': return 'macOS · Mod = Command'
    case 'ios': return 'iOS · Mod = Command'
    case 'windows': return 'Windows · Mod = Control'
    case 'linux': return 'Linux · Mod = Control'
    case 'android': return 'Android · Mod = Control'
    default: return 'Unknown platform · Mod = Control or Command'
  }
}

function clampInteger(value: number | undefined, fallback: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(max, Math.round(value)))
}

function nonNegative(value: number | undefined, fallback: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.max(0, value)
}

function serializeTarget(event: ShikitorInputEvent): InputEventsTraceTarget {
  const { hit } = event
  return {
    zone: hit.zone,
    line: hit.line,
    visualRow: hit.visualRow,
    position: hit.position ? { ...hit.position } : undefined,
    token: hit.token
      ? {
          text: hit.token.text,
          start: { ...hit.token.start },
          end: { ...hit.token.end },
          scopes: hit.token.scopes ? [...hit.token.scopes] : undefined
        }
      : undefined,
    point: hit.point ? { ...hit.point } : undefined
  }
}

function serializeTrace(
  id: number,
  timestamp: number,
  event: ShikitorInputEvent,
  summary: InputDispatchSummary
): InputEventsTraceEntry {
  return {
    id,
    timestamp,
    type: event.type,
    target: serializeTarget(event),
    modifiers: { ...event.modifiers },
    keyboard: event.keyboard
      ? {
          key: event.keyboard.key,
          code: event.keyboard.code,
          repeat: event.keyboard.repeat,
          isComposing: event.keyboard.isComposing
        }
      : undefined,
    pointer: event.pointer ? { ...event.pointer } : undefined,
    mouse: event.mouse ? { ...event.mouse } : undefined,
    wheel: event.wheel ? { ...event.wheel } : undefined,
    input: event.input ? { ...event.input } : undefined,
    composition: event.composition ? { ...event.composition } : undefined,
    handled: summary.handled,
    matchedBindingIds: [...summary.matchedBindingIds],
    handledBindingId: summary.handledBindingId,
    handledActionId: summary.handledActionId,
    disposition: {
      preventDefault: summary.preventDefault,
      stopPropagation: summary.stopPropagation,
      stopImmediatePropagation: summary.stopImmediatePropagation
    }
  }
}

const throttledEventTypes = new Set<ShikitorInputEvent['type']>([
  'pointermove',
  'mousemove',
  'wheel'
])

export interface InputEventsTraceRecorder {
  record(event: ShikitorInputEvent, summary: InputDispatchSummary): boolean
  entries(): readonly InputEventsTraceEntry[]
  clear(): void
  updateOptions(options: { limit?: number; motionThrottleMs?: number }): void
}

export function createInputEventsTraceRecorder(options: {
  limit?: number
  motionThrottleMs?: number
  now?: () => number
} = {}): InputEventsTraceRecorder {
  const now = options.now ?? Date.now
  let limit = clampInteger(options.limit, DEFAULT_INPUT_EVENTS_CONFIG.traceLimit, 500)
  let motionThrottleMs = nonNegative(
    options.motionThrottleMs,
    DEFAULT_INPUT_EVENTS_CONFIG.motionThrottleMs
  )
  let sequence = 0
  const trace: InputEventsTraceEntry[] = []
  const lastMotionAt = new Map<ShikitorInputEvent['type'], number>()

  return {
    record(event, summary) {
      const timestamp = now()
      if (throttledEventTypes.has(event.type) && !summary.handled) {
        const previous = lastMotionAt.get(event.type)
        if (previous !== undefined && timestamp - previous < motionThrottleMs) {
          return false
        }
        lastMotionAt.set(event.type, timestamp)
      }
      trace.push(serializeTrace(++sequence, timestamp, event, summary))
      if (trace.length > limit) trace.splice(0, trace.length - limit)
      return true
    },
    entries() {
      return trace
    },
    clear() {
      trace.length = 0
      lastMotionAt.clear()
    },
    updateOptions(next) {
      limit = clampInteger(next.limit, limit, 500)
      motionThrottleMs = nonNegative(next.motionThrottleMs, motionThrottleMs)
      if (trace.length > limit) trace.splice(0, trace.length - limit)
    }
  }
}

interface RuntimeAttachment {
  bindings: { dispose(): void }
  actions: readonly { dispose(): void }[]
  service: import('@shikitor/core').ShikitorInputService
}

export function createInputEventsRuntime(
  options: InputEventsRuntimeOptions = {}
): InputEventsRuntime {
  const now = options.now ?? Date.now
  let config = options.config ?? {}
  let configKey = JSON.stringify(config)
  let platform: InputPlatform = 'unknown'
  let revision = 0
  let cachedSnapshot: InputEventsSnapshot | undefined
  let lastAction: InputEventsActionObservation | undefined
  const listeners = new Set<(snapshot: InputEventsSnapshot) => void>()
  const attachments = new Set<RuntimeAttachment>()
  const actionCounts = Object.fromEntries(
    actionIds.map(id => [id, 0])
  ) as Record<InputEventsActionId, number>
  const trace = createInputEventsTraceRecorder({
    limit: config.traceLimit,
    motionThrottleMs: config.motionThrottleMs,
    now
  })

  const bindingViews = (): InputEventsBindingView[] =>
    compileInputEventBindings(config).map(binding => ({
      id: binding.id as InputEventsPresetId,
      action: binding.action as InputEventsActionId,
      enabled: binding.enabled !== false,
      label: formatBinding(binding, platform),
      ariaKeyShortcut: formatAriaKeyShortcut(binding, platform),
      binding
    }))

  const getSnapshot = (): InputEventsSnapshot => {
    if (!cachedSnapshot) {
      cachedSnapshot = {
        revision,
        platform,
        platformLabel: getInputPlatformLabel(platform),
        bindings: bindingViews(),
        trace: [...trace.entries()],
        actionCounts: { ...actionCounts },
        lastAction: lastAction ? { ...lastAction } : undefined
      }
    }
    return cachedSnapshot
  }

  const publish = () => {
    revision++
    cachedSnapshot = undefined
    const snapshot = getSnapshot()
    listeners.forEach(listener => listener(snapshot))
  }

  const observeAction = (
    actionId: InputEventsActionId,
    event: ShikitorInputEvent,
    args: InputEventsBindingArgs
  ) => {
    actionCounts[actionId]++
    lastAction = {
      actionId,
      presetId: args.presetId,
      timestamp: now(),
      eventType: event.type,
      target: event.hit.zone,
      line: event.hit.line,
      offset: event.hit.position?.offset
    }
    options.onAction?.({ ...lastAction })
    publish()
    // DOM consumption belongs to the binding policy so a host can observe an
    // action without taking selection, context-menu or browser behavior away.
    return { handled: true } as const
  }

  const registerActions = (
    service: import('@shikitor/core').ShikitorInputService
  ) => actionIds.map(actionId => service.registerAction<InputEventsBindingArgs>({
    id: actionId,
    run(event, args) {
      return observeAction(actionId, event, args)
    }
  }))

  const plugin = definePlugin({
    name: 'playground-input-events-runtime',
    inject: ['shikitor', 'shikitorInput'],
    apply(ctx) {
      const service = ctx.shikitorInput
      platform = service.platform
      const attachment: RuntimeAttachment = {
        service,
        actions: registerActions(service),
        bindings: service.registerBindings(compileInputEventBindings(config))
      }
      attachments.add(attachment)
      ctx.on('shikitor/input', (event, summary) => {
        if (trace.record(event, summary)) publish()
      })
      publish()

      return () => {
        if (!attachments.delete(attachment)) return
        attachment.bindings.dispose()
        attachment.actions.forEach(disposable => disposable.dispose())
      }
    }
  })

  return {
    plugin,
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    updateConfig(next) {
      const nextKey = JSON.stringify(next)
      if (nextKey === configKey) return
      config = next
      configKey = nextKey
      trace.updateOptions({
        limit: next.traceLimit,
        motionThrottleMs: next.motionThrottleMs
      })
      for (const attachment of attachments) {
        attachment.bindings.dispose()
        attachment.bindings = attachment.service.registerBindings(
          compileInputEventBindings(config)
        )
      }
      publish()
    },
    clearTrace() {
      trace.clear()
      publish()
    },
    resetCounts() {
      actionIds.forEach(id => { actionCounts[id] = 0 })
      lastAction = undefined
      publish()
    }
  }
}
