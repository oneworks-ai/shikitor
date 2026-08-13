import { detectInputPlatform, resolveModifier } from './platform'
import type {
  ClickInputTrigger,
  InputBinding,
  InputModifier,
  InputModifierState,
  InputPlatform,
  MouseInputTrigger,
  ModifierMatcher,
  MouseButton,
  PhysicalInputModifier,
  PointerInputTrigger,
  ShikitorInputEvent
} from './types'

const modifierStateKey: Record<InputModifier, keyof InputModifierState> = {
  Mod: 'mod',
  Control: 'control',
  Meta: 'meta',
  Alt: 'alt',
  Shift: 'shift',
  AltGraph: 'altGraph'
}

const physicalModifierStateKey: Record<PhysicalInputModifier, keyof InputModifierState> = {
  Control: 'control',
  Meta: 'meta',
  Alt: 'alt',
  Shift: 'shift',
  AltGraph: 'altGraph'
}

const physicalButtonMask: Record<MouseButton, number> = {
  primary: 1,
  auxiliary: 4,
  secondary: 2,
  back: 8,
  forward: 16
}

function includes<T>(value: T, expected: T | readonly T[] | undefined) {
  if (expected === undefined) return true
  return Array.isArray(expected) ? expected.includes(value) : value === expected
}

function modifierMatcher(
  input: InputBinding['modifiers']
): Required<Pick<ModifierMatcher, 'required' | 'forbidden' | 'mode' | 'allowAltGraph'>> {
  if (Array.isArray(input)) {
    return { required: input, forbidden: [], mode: 'exact', allowAltGraph: false }
  }
  const matcher = input as ModifierMatcher | undefined
  return {
    required: matcher?.required ?? [],
    forbidden: matcher?.forbidden ?? [],
    mode: matcher?.mode ?? 'exact',
    allowAltGraph: matcher?.allowAltGraph ?? false
  }
}

export function matchModifiers(
  input: InputBinding['modifiers'],
  state: InputModifierState,
  platform: InputPlatform
) {
  const matcher = modifierMatcher(input)
  const explicitlyRequiresAltGraph = matcher.required.includes('AltGraph')
  if (state.altGraph && !matcher.allowAltGraph && !explicitlyRequiresAltGraph) return false

  if (
    platform === 'unknown'
    && matcher.required.includes('Mod')
    && state.control
    && state.meta
    && !matcher.required.includes('Control')
    && !matcher.required.includes('Meta')
  ) {
    // Unknown hosts accept either Control or Meta as Mod. Exact bindings still
    // describe a single primary modifier, not both physical keys at once.
    return false
  }

  for (const modifier of matcher.required) {
    if (!state[modifierStateKey[modifier]]) return false
  }
  for (const modifier of matcher.forbidden) {
    if (state[modifierStateKey[modifier]]) return false
  }
  if (matcher.mode === 'at-least') return true

  const allowed = new Set<PhysicalInputModifier>()
  for (const modifier of matcher.required) {
    resolveModifier(modifier, platform).forEach(value => allowed.add(value))
  }
  if (explicitlyRequiresAltGraph) {
    // Browsers commonly expose AltGraph as Control+Alt as well as through
    // getModifierState('AltGraph'). Those physical flags are part of AltGraph,
    // not unexpected extras in an exact matcher.
    allowed.add('Control')
    allowed.add('Alt')
  }
  if (state.altGraph && matcher.allowAltGraph) allowed.add('AltGraph')
  for (const modifier of Object.keys(physicalModifierStateKey) as PhysicalInputModifier[]) {
    if (state[physicalModifierStateKey[modifier]] && !allowed.has(modifier)) return false
  }
  return true
}

function matchKeyboard(binding: InputBinding, event: ShikitorInputEvent) {
  const trigger = binding.trigger
  if (trigger.type !== 'keydown' && trigger.type !== 'keyup') return false
  const keyboard = event.keyboard
  if (!keyboard) return false
  if (trigger.key !== undefined) {
    const expected = trigger.key.length === 1 ? trigger.key.toLocaleLowerCase() : trigger.key
    const actual = keyboard.key.length === 1 ? keyboard.key.toLocaleLowerCase() : keyboard.key
    if (actual !== expected) return false
  }
  if (trigger.code !== undefined && keyboard.code !== trigger.code) return false
  if (trigger.location !== undefined && keyboard.location !== trigger.location) return false

  const repeat = trigger.repeat ?? 'ignore'
  if (repeat === 'ignore' && keyboard.repeat) return false
  if (repeat === 'only' && !keyboard.repeat) return false
  const composing = trigger.composing ?? 'ignore'
  if (composing === 'ignore' && keyboard.isComposing) return false
  if (composing === 'only' && !keyboard.isComposing) return false
  return true
}

function matchPointer(
  trigger: PointerInputTrigger | ClickInputTrigger,
  event: ShikitorInputEvent
) {
  const pointer = event.pointer
  if (!pointer) return false
  if (trigger.button !== undefined && pointer.button !== trigger.button) return false
  if (
    trigger.physicalButton !== undefined
    && pointer.physicalButton !== trigger.physicalButton
  ) return false
  if (trigger.pointerType !== undefined && pointer.pointerType !== trigger.pointerType) return false
  if (trigger.clicks !== undefined && pointer.clicks !== trigger.clicks) return false
  if ('source' in trigger && trigger.source !== undefined && pointer.source !== trigger.source) return false
  if ('buttons' in trigger && trigger.buttons?.length) {
    const requiredMask = trigger.buttons.reduce((mask, button) => mask | physicalButtonMask[button], 0)
    if (trigger.buttonsMode === 'exact') {
      if (pointer.buttons !== requiredMask) return false
    } else if ((pointer.buttons & requiredMask) !== requiredMask) {
      return false
    }
  }
  return true
}

function matchMouse(trigger: MouseInputTrigger, event: ShikitorInputEvent) {
  const mouse = event.mouse
  if (!mouse) return false
  if (trigger.button !== undefined && mouse.button !== trigger.button) return false
  if (
    trigger.physicalButton !== undefined
    && mouse.physicalButton !== trigger.physicalButton
  ) return false
  if (trigger.clicks !== undefined && mouse.clicks !== trigger.clicks) return false
  if (trigger.buttons?.length) {
    const requiredMask = trigger.buttons.reduce(
      (mask, button) => mask | physicalButtonMask[button],
      0
    )
    if (trigger.buttonsMode === 'exact') {
      if (mouse.buttons !== requiredMask) return false
    } else if ((mouse.buttons & requiredMask) !== requiredMask) {
      return false
    }
  }
  return true
}

function matchTrigger(binding: InputBinding, event: ShikitorInputEvent) {
  const trigger = binding.trigger
  if (trigger.type !== event.type) return false
  if (trigger.type === 'keydown' || trigger.type === 'keyup') {
    return matchKeyboard(binding, event)
  }
  if (trigger.type.startsWith('pointer')) {
    return matchPointer(trigger as PointerInputTrigger, event)
  }
  if (trigger.type.startsWith('mouse')) {
    return matchMouse(trigger as MouseInputTrigger, event)
  }
  if (['click', 'dblclick', 'auxclick', 'contextmenu'].includes(trigger.type)) {
    return matchPointer(trigger as ClickInputTrigger, event)
  }
  if (trigger.type === 'wheel') {
    if (!event.wheel) return false
    const { deltaX, deltaY } = event.wheel
    const axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'
    const delta = axis === 'x' ? deltaX : deltaY
    if (trigger.axis !== undefined && trigger.axis !== axis) return false
    if (trigger.direction !== undefined) {
      if (delta === 0) return false
      if ((delta > 0 ? 'positive' : 'negative') !== trigger.direction) return false
    }
    return true
  }
  if (trigger.type === 'beforeinput' || trigger.type === 'input') {
    if (!event.input) return false
    if (!includes(event.input.inputType, trigger.inputType)) return false
    if (trigger.data !== undefined && trigger.data !== event.input.data) return false
    const composing = trigger.composing ?? 'allow'
    if (composing === 'ignore' && event.input.isComposing) return false
    if (composing === 'only' && !event.input.isComposing) return false
    return true
  }
  if (!event.composition) return false
  const compositionTrigger = trigger as import('./types').CompositionInputTrigger
  return compositionTrigger.data === undefined
    || compositionTrigger.data === event.composition.data
}

function matchWhen(binding: InputBinding, event: ShikitorInputEvent) {
  const when = binding.when
  if (!when) return true
  if (when.focused !== undefined && when.focused !== event.state.focused) return false
  if (when.readOnly !== undefined && when.readOnly !== event.state.readOnly) return false
  if (
    when.hasSelection !== undefined
    && when.hasSelection !== event.state.hasSelection
  ) return false
  if (when.language !== undefined) {
    if (!event.state.language || !includes(event.state.language, when.language)) return false
  }
  return true
}

export function matchInputBinding(binding: InputBinding, event: ShikitorInputEvent) {
  if (binding.enabled === false) return false
  if (!includes(event.platform, binding.platform)) return false
  if (!includes(event.hit.zone, binding.target)) return false
  if (!matchModifiers(binding.modifiers, event.modifiers, event.platform)) return false
  if (!matchWhen(binding, event)) return false
  return matchTrigger(binding, event)
}

export function bindingSpecificity(binding: InputBinding) {
  let value = 0
  const trigger = binding.trigger
  if (binding.platform !== undefined) value += 16
  if (binding.target !== undefined) value += 12
  if (binding.when) value += Object.values(binding.when).filter(item => item !== undefined).length * 2
  const modifiers = modifierMatcher(binding.modifiers)
  value += modifiers.required.length * 3 + modifiers.forbidden.length * 2
  if (modifiers.mode === 'exact') value += 2

  for (const [key, field] of Object.entries(trigger)) {
    if (key === 'type' || field === undefined) continue
    value += Array.isArray(field) ? field.length : 1
  }
  return value
}

function requiredModifiers(binding: InputBinding) {
  return modifierMatcher(binding.modifiers).required
}

function modifierLabel(modifier: InputModifier, platform: InputPlatform) {
  const isApple = platform === 'macos' || platform === 'ios'
  if (modifier === 'Mod') {
    if (isApple) return '⌘'
    if (platform === 'unknown') return 'Ctrl/Cmd'
    return 'Ctrl'
  }
  if (modifier === 'Control') return isApple ? '⌃' : 'Ctrl'
  if (modifier === 'Meta') return isApple ? '⌘' : 'Meta'
  if (modifier === 'Alt') return isApple ? '⌥' : 'Alt'
  if (modifier === 'Shift') return isApple ? '⇧' : 'Shift'
  return 'AltGr'
}

function buttonLabel(button: MouseButton | undefined) {
  if (button === 'auxiliary') return 'Middle Click'
  if (button === 'secondary') return 'Right Click'
  if (button === 'back') return 'Back Button'
  if (button === 'forward') return 'Forward Button'
  return 'Click'
}

function triggerLabel(binding: InputBinding) {
  const trigger = binding.trigger
  if (trigger.type === 'keydown' || trigger.type === 'keyup') {
    const key = trigger.key ?? trigger.code ?? trigger.type
    return key === ' ' ? 'Space' : key
  }
  if (trigger.type === 'click') return buttonLabel(trigger.button)
  if (trigger.type === 'dblclick') return `Double ${buttonLabel(trigger.button)}`
  if (trigger.type === 'auxclick') {
    return buttonLabel((trigger as ClickInputTrigger).button ?? 'auxiliary')
  }
  if (trigger.type === 'contextmenu') return 'Right Click'
  if (trigger.type.startsWith('pointer')) {
    return `${trigger.type} ${buttonLabel((trigger as PointerInputTrigger).button)}`
  }
  if (trigger.type.startsWith('mouse')) {
    return `${trigger.type} ${buttonLabel((trigger as MouseInputTrigger).button)}`
  }
  if (trigger.type === 'wheel') {
    const axis = trigger.axis ? ` ${trigger.axis.toUpperCase()}` : ''
    const direction = trigger.direction ? ` ${trigger.direction}` : ''
    return `Wheel${axis}${direction}`
  }
  if (trigger.type === 'beforeinput' || trigger.type === 'input') {
    const inputType = typeof trigger.inputType === 'string' ? ` ${trigger.inputType}` : ''
    return `${trigger.type}${inputType}`
  }
  return trigger.type
}

export function formatBinding(
  binding: InputBinding,
  platform: InputPlatform = detectInputPlatform()
) {
  const parts: string[] = requiredModifiers(binding)
    .map(modifier => modifierLabel(modifier, platform))
  parts.push(triggerLabel(binding))
  return parts.join(' + ')
}

/**
 * Format a keyboard binding for aria-keyshortcuts. Pointer and text bindings
 * have no ARIA shortcut representation and return undefined.
 */
export function formatAriaKeyShortcut(
  binding: InputBinding,
  platform: InputPlatform = detectInputPlatform()
) {
  const trigger = binding.trigger
  if (trigger.type !== 'keydown' && trigger.type !== 'keyup') return undefined
  const keys: string[] = []
  for (const modifier of requiredModifiers(binding)) {
    const resolved = resolveModifier(modifier, platform)
    if (modifier === 'Mod' && platform === 'unknown') {
      // aria-keyshortcuts cannot express an OR branch. Prefer Control as the
      // conservative, widely understood unknown-platform label.
      keys.push('Control')
    } else {
      keys.push(resolved[0])
    }
  }
  // aria-keyshortcuts is expressed in KeyboardEvent.key values. A physical
  // code (for example KeyK) is layout-dependent and cannot be represented
  // accessibly without a semantic key supplied by the host.
  const key = trigger.key
  if (!key) return undefined
  keys.push(key === ' ' ? 'Space' : key.length === 1 ? key.toLocaleLowerCase() : key)
  return keys.join('+')
}
