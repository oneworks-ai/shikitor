import { bindingSpecificity, formatBinding, matchInputBinding } from './match'
import { detectInputPlatform } from './platform'
import type {
  InputAction,
  InputActionResult,
  InputBinding,
  InputChannelName,
  InputDisposable,
  InputDispatchSummary,
  InputEventPolicy,
  InputPlatform,
  ShikitorInputEvent,
  ShikitorInputListener,
  ShikitorInputService
} from './types'

interface Registered<T extends { id: string }> {
  value: T
  order: number
  disposed: boolean
}

function shouldApplyPolicy(
  policy: InputEventPolicy | undefined,
  handled: boolean
) {
  return policy === 'matched' || (policy === 'handled' && handled)
}

function normalizeActionResult(result: InputActionResult) {
  if (result === true) {
    return {
      handled: true,
      preventDefault: false,
      stopPropagation: false,
      stopImmediatePropagation: false
    } as const
  }
  if (!result) return { handled: false } as const
  return result
}

export interface InputRegistryOptions {
  platform?: InputPlatform
}

export class InputRegistry implements ShikitorInputService {
  readonly platform: InputPlatform
  readonly pointer = this.createChannel('pointer')
  readonly keyboard = this.createChannel('keyboard')
  readonly text = this.createChannel('text')

  private order = 0
  private actions: Registered<InputAction<any>>[] = []
  private bindings: Registered<InputBinding<any>>[] = []
  private listeners = new Set<ShikitorInputListener>()

  constructor(options: InputRegistryOptions = {}) {
    this.platform = detectInputPlatform(options.platform)
  }

  private createChannel(channel: InputChannelName) {
    return {
      subscribe: (listener: ShikitorInputListener) => this.subscribe((event, summary) => {
        if (this.resolveChannel(event.type) === channel) listener(event, summary)
      })
    }
  }

  private resolveChannel(type: ShikitorInputEvent['type']): InputChannelName {
    if (type === 'keydown' || type === 'keyup') return 'keyboard'
    if (
      type === 'beforeinput'
      || type === 'input'
      || type.startsWith('composition')
    ) return 'text'
    return 'pointer'
  }

  subscribe(listener: ShikitorInputListener): InputDisposable {
    this.listeners.add(listener)
    return {
      dispose: () => this.listeners.delete(listener)
    }
  }

  registerAction<Args = unknown>(action: InputAction<Args>): InputDisposable {
    const registered: Registered<InputAction<Args>> = {
      value: action,
      order: this.order++,
      disposed: false
    }
    this.actions.push(registered)
    return {
      dispose: () => {
        registered.disposed = true
      }
    }
  }

  registerBinding<Args = unknown>(binding: InputBinding<Args>): InputDisposable {
    const registered: Registered<InputBinding<Args>> = {
      value: binding,
      order: this.order++,
      disposed: false
    }
    this.bindings.push(registered)
    return {
      dispose: () => {
        registered.disposed = true
      }
    }
  }

  registerBindings(bindings: readonly InputBinding[]): InputDisposable {
    const disposables = bindings.map(binding => this.registerBinding(binding))
    return {
      dispose() {
        disposables.forEach(disposable => disposable.dispose())
      }
    }
  }

  private activeActions() {
    const active = new Map<string, Registered<InputAction<any>>>()
    for (const action of this.actions) {
      if (!action.disposed) active.set(action.value.id, action)
    }
    return active
  }

  private activeBindings() {
    const active = new Map<string, Registered<InputBinding<any>>>()
    for (const binding of this.bindings) {
      if (!binding.disposed) active.set(binding.value.id, binding)
    }
    return [...active.values()]
  }

  listBindings(): readonly InputBinding[] {
    return this.activeBindings().map(binding => binding.value)
  }

  formatBinding(binding: InputBinding, platform = this.platform) {
    return formatBinding(binding, platform)
  }

  dispatch(event: ShikitorInputEvent): InputDispatchSummary {
    const actions = this.activeActions()
    const candidates = this.activeBindings()
      .filter(binding => actions.has(binding.value.action))
      .filter(binding => matchInputBinding(binding.value, event))
      .sort((left, right) => {
        const priority = (right.value.priority ?? 0) - (left.value.priority ?? 0)
        if (priority) return priority
        const specificity = bindingSpecificity(right.value) - bindingSpecificity(left.value)
        if (specificity) return specificity
        return left.order - right.order
      })

    const summary: {
      handled: boolean
      matchedBindingIds: string[]
      handledBindingId?: string
      handledActionId?: string
      preventDefault: boolean
      stopPropagation: boolean
      stopImmediatePropagation: boolean
    } = {
      handled: false,
      matchedBindingIds: [],
      preventDefault: false,
      stopPropagation: false,
      stopImmediatePropagation: false
    }

    for (const registered of candidates) {
      const binding = registered.value
      const action = actions.get(binding.action)?.value
      if (!action) continue
      summary.matchedBindingIds.push(binding.id)
      const result = normalizeActionResult(action.run(event, binding.args))
      const handled = result.handled
      const policy = binding.policy
      summary.preventDefault ||= shouldApplyPolicy(policy?.preventDefault, handled)
      summary.stopPropagation ||= shouldApplyPolicy(policy?.stopPropagation, handled)
      summary.stopImmediatePropagation ||= shouldApplyPolicy(
        policy?.stopImmediatePropagation,
        handled
      )
      if (handled) {
        summary.handled = true
        summary.handledBindingId ??= binding.id
        summary.handledActionId ??= action.id
        summary.preventDefault ||= !!result.preventDefault
        summary.stopPropagation ||= !!result.stopPropagation
        summary.stopImmediatePropagation ||= !!result.stopImmediatePropagation
        if (!policy?.continueOnHandled) break
      }
    }
    summary.stopPropagation ||= summary.stopImmediatePropagation
    for (const listener of [...this.listeners]) listener(event, summary)
    return summary
  }
}

export function createInputRegistry(options?: InputRegistryOptions) {
  return new InputRegistry(options)
}
