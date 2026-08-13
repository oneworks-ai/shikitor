import type { Shikitor } from '../../src/editor'
import type {
  ClickInputType,
  InputBinding,
  InputModifierState,
  InputPlatform,
  InputTrigger,
  KeyboardInputType,
  MouseButton,
  PointerInputType,
  PointerKind,
  ShikitorInputEvent
} from '../../src/input'

const editor = {} as Shikitor

export function modifierState(
  platform: InputPlatform,
  overrides: Partial<InputModifierState> = {}
): InputModifierState {
  const control = overrides.control ?? false
  const meta = overrides.meta ?? false
  return {
    control,
    meta,
    alt: false,
    shift: false,
    altGraph: false,
    ...overrides,
    mod: overrides.mod ?? (
      platform === 'macos' || platform === 'ios'
        ? meta
        : platform === 'unknown'
          ? control || meta
          : control
    )
  }
}

function baseEvent(
  type: ShikitorInputEvent['type'],
  platform: InputPlatform,
  modifiers: InputModifierState
): ShikitorInputEvent {
  return {
    editor,
    nativeEvent: {} as KeyboardEvent,
    type,
    platform,
    modifiers,
    hit: { zone: 'content', element: null },
    cursor: { offset: 0, line: 1, character: 1 },
    selections: [],
    state: {
      focused: true,
      readOnly: false,
      hasSelection: false,
      language: 'typescript'
    }
  }
}

export interface KeyboardEventOptions {
  type?: KeyboardInputType
  platform?: InputPlatform
  modifiers?: Partial<InputModifierState>
  key?: string
  code?: string
  location?: number
  repeat?: boolean
  isComposing?: boolean
}

export function keyboardEvent(
  options: KeyboardEventOptions = {}
): ShikitorInputEvent {
  const platform = options.platform ?? 'windows'
  return {
    ...baseEvent(
      options.type ?? 'keydown',
      platform,
      modifierState(platform, options.modifiers)
    ),
    keyboard: {
      key: options.key ?? 's',
      code: options.code ?? 'KeyS',
      location: options.location ?? 0,
      repeat: options.repeat ?? false,
      isComposing: options.isComposing ?? false
    }
  }
}

export interface PointerEventOptions {
  type?: PointerInputType | ClickInputType
  platform?: InputPlatform
  modifiers?: Partial<InputModifierState>
  button?: MouseButton
  physicalButton?: number
  buttons?: number
  pointerType?: PointerKind
  clicks?: number
  source?: 'pointer' | 'keyboard'
}

export function pointerEvent(
  options: PointerEventOptions = {}
): ShikitorInputEvent {
  const platform = options.platform ?? 'windows'
  return {
    ...baseEvent(
      options.type ?? 'click',
      platform,
      modifierState(platform, options.modifiers)
    ),
    nativeEvent: {} as PointerEvent,
    pointer: {
      button: options.button ?? 'primary',
      physicalButton: options.physicalButton ?? 0,
      buttons: options.buttons ?? 0,
      pointerType: options.pointerType ?? 'mouse',
      clicks: options.clicks ?? 1,
      source: options.source ?? 'pointer'
    }
  }
}

export interface WheelEventOptions {
  platform?: InputPlatform
  modifiers?: Partial<InputModifierState>
  deltaX?: number
  deltaY?: number
  deltaMode?: number
}

export function wheelEvent(
  options: WheelEventOptions = {}
): ShikitorInputEvent {
  const platform = options.platform ?? 'windows'
  return {
    ...baseEvent('wheel', platform, modifierState(platform, options.modifiers)),
    nativeEvent: {} as WheelEvent,
    wheel: {
      deltaX: options.deltaX ?? 0,
      deltaY: options.deltaY ?? 100,
      deltaMode: options.deltaMode ?? 0
    }
  }
}

export function textInputEvent(options: {
  type?: 'beforeinput' | 'input'
  inputType?: string
  data?: string | null
  isComposing?: boolean
} = {}): ShikitorInputEvent {
  return {
    ...baseEvent('beforeinput', 'windows', modifierState('windows')),
    type: options.type ?? 'beforeinput',
    nativeEvent: {} as InputEvent,
    input: {
      inputType: options.inputType ?? 'insertText',
      data: options.data ?? 'a',
      isComposing: options.isComposing ?? false
    }
  }
}

export function compositionEvent(options: {
  type?: 'compositionstart' | 'compositionupdate' | 'compositionend'
  data?: string
} = {}): ShikitorInputEvent {
  return {
    ...baseEvent(
      options.type ?? 'compositionupdate',
      'windows',
      modifierState('windows')
    ),
    nativeEvent: {} as CompositionEvent,
    composition: {
      data: options.data ?? '你'
    }
  }
}

export function binding(
  trigger: InputTrigger,
  overrides: Partial<InputBinding> = {}
): InputBinding {
  return {
    id: 'binding',
    action: 'action',
    trigger,
    ...overrides
  }
}
