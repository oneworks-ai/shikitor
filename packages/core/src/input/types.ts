import type { ResolvedPosition } from '@shikijs/core'

import type { ResolvedCursor, ResolvedSelection, Shikitor } from '../editor'

export type InputPlatform =
  | 'macos'
  | 'ios'
  | 'windows'
  | 'linux'
  | 'android'
  | 'unknown'

export type InputModifier =
  | 'Mod'
  | 'Control'
  | 'Meta'
  | 'Alt'
  | 'Shift'
  | 'AltGraph'

export type PhysicalInputModifier = Exclude<InputModifier, 'Mod'>

export interface InputModifierState {
  mod: boolean
  control: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  altGraph: boolean
}

export interface ModifierMatcher {
  required?: readonly InputModifier[]
  forbidden?: readonly InputModifier[]
  /**
   * `exact` rejects physical modifiers that are not represented by a required
   * modifier. `at-least` only checks required and forbidden modifiers.
   * @default 'exact'
   */
  mode?: 'exact' | 'at-least'
  /**
   * AltGraph is commonly exposed as Control+Alt. Bindings ignore such events
   * unless AltGraph is explicitly required or this flag is enabled.
   * @default false
   */
  allowAltGraph?: boolean
}

export type MouseButton =
  | 'primary'
  | 'auxiliary'
  | 'secondary'
  | 'back'
  | 'forward'

export type PointerKind = 'mouse' | 'pen' | 'touch'

export type KeyboardInputType = 'keydown' | 'keyup'
export type PointerInputType =
  | 'pointerdown'
  | 'pointerup'
  | 'pointermove'
  | 'pointerenter'
  | 'pointerleave'
  | 'pointercancel'
export type MouseInputType =
  | 'mousedown'
  | 'mouseup'
  | 'mousemove'
  | 'mouseenter'
  | 'mouseleave'
  | 'mouseover'
  | 'mouseout'
export type ClickInputType = 'click' | 'dblclick' | 'auxclick' | 'contextmenu'
export type InputEventType =
  | KeyboardInputType
  | PointerInputType
  | MouseInputType
  | ClickInputType
  | 'wheel'
  | 'beforeinput'
  | 'input'
  | 'compositionstart'
  | 'compositionupdate'
  | 'compositionend'

export interface KeyboardInputTrigger {
  type: KeyboardInputType
  /** Layout-aware key value, for example `s` or `Enter`. */
  key?: string
  /** Physical key position, for example `KeyS`. */
  code?: string
  location?: number
  /** @default 'ignore' */
  repeat?: 'allow' | 'ignore' | 'only'
  /** @default 'ignore' */
  composing?: 'allow' | 'ignore' | 'only'
}

export interface PointerInputTrigger {
  type: PointerInputType
  button?: MouseButton
  /** Match the native DOM button number instead of its semantic mapping. */
  physicalButton?: 0 | 1 | 2 | 3 | 4
  pointerType?: PointerKind
  clicks?: number
  /** Buttons that must currently be pressed. */
  buttons?: readonly MouseButton[]
  /** @default 'at-least' */
  buttonsMode?: 'exact' | 'at-least'
}

/**
 * Native mouse compatibility events. These bindings are intentionally
 * distinct from pointer bindings: dispatching a mousedown never implicitly
 * dispatches pointerdown (or vice versa), so hosts can opt into one channel
 * without duplicate actions.
 */
export interface MouseInputTrigger {
  type: MouseInputType
  button?: MouseButton
  physicalButton?: 0 | 1 | 2 | 3 | 4
  clicks?: number
  /** Buttons that must currently be pressed. */
  buttons?: readonly MouseButton[]
  /** @default 'at-least' */
  buttonsMode?: 'exact' | 'at-least'
}

export interface ClickInputTrigger {
  type: ClickInputType
  button?: MouseButton
  physicalButton?: 0 | 1 | 2 | 3 | 4
  pointerType?: PointerKind
  clicks?: number
  /** Keyboard context-menu commands have no pointer location. */
  source?: 'pointer' | 'keyboard'
}

export interface WheelInputTrigger {
  type: 'wheel'
  axis?: 'x' | 'y'
  direction?: 'positive' | 'negative'
}

export interface TextInputTrigger {
  type: 'beforeinput' | 'input'
  inputType?: string | readonly string[]
  data?: string | null
  /** @default 'allow' */
  composing?: 'allow' | 'ignore' | 'only'
}

export interface CompositionInputTrigger {
  type: 'compositionstart' | 'compositionupdate' | 'compositionend'
  data?: string
}

export type InputTrigger =
  | KeyboardInputTrigger
  | PointerInputTrigger
  | MouseInputTrigger
  | ClickInputTrigger
  | WheelInputTrigger
  | TextInputTrigger
  | CompositionInputTrigger

export type EditorHitKind =
  | 'content'
  | 'gutter'
  | 'line-number'
  | 'fold-control'
  | 'line-widget'
  | 'gutter-decoration'
  | 'scrollbar'
  | 'outside'

export interface EditorInputTarget {
  zone: EditorHitKind
  element: EventTarget | null
  position?: ResolvedPosition
  line?: number
  visualRow?: number
  token?: {
    text: string
    start: ResolvedPosition
    end: ResolvedPosition
    scopes?: readonly string[]
  }
  point?: {
    clientX: number
    clientY: number
    editorX: number
    editorY: number
  }
}

export interface KeyboardInputPayload {
  key: string
  code: string
  location: number
  repeat: boolean
  isComposing: boolean
}

export interface PointerInputPayload {
  pointerId?: number
  pointerType?: PointerKind
  button?: MouseButton
  physicalButton?: number
  buttons: number
  pressure?: number
  clicks: number
  source?: 'pointer' | 'keyboard'
}

export interface MouseInputPayload {
  button?: MouseButton
  physicalButton?: number
  buttons: number
  clicks: number
}

export interface WheelInputPayload {
  deltaX: number
  deltaY: number
  deltaMode: number
}

export interface TextInputPayload {
  inputType: string
  data: string | null
  isComposing: boolean
}

export interface CompositionInputPayload {
  data: string
}

export type NativeShikitorInputEvent =
  | KeyboardEvent
  | PointerEvent
  | MouseEvent
  | WheelEvent
  | InputEvent
  | CompositionEvent

export interface ShikitorInputEvent {
  readonly editor: Shikitor
  readonly nativeEvent: NativeShikitorInputEvent
  readonly type: InputEventType
  readonly platform: InputPlatform
  readonly modifiers: InputModifierState
  readonly hit: EditorInputTarget
  readonly cursor: ResolvedCursor
  readonly selections: readonly ResolvedSelection[]
  readonly state: {
    focused: boolean
    readOnly: boolean
    hasSelection: boolean
    language?: string
  }
  readonly keyboard?: KeyboardInputPayload
  readonly pointer?: PointerInputPayload
  readonly mouse?: MouseInputPayload
  readonly wheel?: WheelInputPayload
  readonly input?: TextInputPayload
  readonly composition?: CompositionInputPayload
}

export interface InputBindingWhen {
  focused?: boolean
  readOnly?: boolean
  hasSelection?: boolean
  language?: string | readonly string[]
}

export type InputEventPolicy = 'never' | 'matched' | 'handled'

export interface InputBindingPolicy {
  /** @default 'never' */
  preventDefault?: InputEventPolicy
  /** @default 'never' */
  stopPropagation?: InputEventPolicy
  /** @default 'never' */
  stopImmediatePropagation?: InputEventPolicy
  /** Continue evaluating lower ranked bindings after this one handles. */
  continueOnHandled?: boolean
}

export interface InputBinding<Args = unknown> {
  /** Stable identifier used for configuration overrides and disposal. */
  id: string
  /** Identifier of a separately registered action. */
  action: string
  args?: Args
  trigger: InputTrigger
  modifiers?: readonly InputModifier[] | ModifierMatcher
  target?: EditorHitKind | readonly EditorHitKind[]
  platform?: InputPlatform | readonly InputPlatform[]
  when?: InputBindingWhen
  priority?: number
  enabled?: boolean
  policy?: InputBindingPolicy
}

export interface HandledInputActionResult {
  handled: true
  preventDefault?: boolean
  stopPropagation?: boolean
  stopImmediatePropagation?: boolean
}

export interface UnhandledInputActionResult {
  handled: false
}

export type InputActionResult =
  | boolean
  | void
  | HandledInputActionResult
  | UnhandledInputActionResult

export interface InputAction<Args = unknown> {
  id: string
  run(event: ShikitorInputEvent, args: Args): InputActionResult
}

export interface InputDispatchSummary {
  handled: boolean
  matchedBindingIds: readonly string[]
  handledBindingId?: string
  handledActionId?: string
  preventDefault: boolean
  stopPropagation: boolean
  stopImmediatePropagation: boolean
}

export interface InputDisposable {
  dispose(): void
}

export type InputChannelName = 'pointer' | 'keyboard' | 'text'

export type ShikitorInputListener = (
  event: ShikitorInputEvent,
  summary: InputDispatchSummary
) => void

export interface ShikitorInputChannel {
  subscribe(listener: ShikitorInputListener): InputDisposable
}

export interface ShikitorInputCapabilityService extends ShikitorInputChannel {
  readonly platform: InputPlatform
  registerAction<Args = unknown>(action: InputAction<Args>): InputDisposable
  registerBinding<Args = unknown>(binding: InputBinding<Args>): InputDisposable
  registerBindings(bindings: readonly InputBinding[]): InputDisposable
}

export interface ShikitorInputService {
  readonly platform: InputPlatform
  /** Pointer, native mouse, click, context-menu and wheel events. */
  readonly pointer: ShikitorInputChannel
  /** Keyboard events after platform modifier normalization. */
  readonly keyboard: ShikitorInputChannel
  /** beforeinput, input and IME composition events. */
  readonly text: ShikitorInputChannel
  /** Observe every normalized input event after binding dispatch. */
  subscribe(listener: ShikitorInputListener): InputDisposable
  registerAction<Args = unknown>(action: InputAction<Args>): InputDisposable
  registerBinding<Args = unknown>(binding: InputBinding<Args>): InputDisposable
  registerBindings(bindings: readonly InputBinding[]): InputDisposable
  dispatch(event: ShikitorInputEvent): InputDispatchSummary
  listBindings(): readonly InputBinding[]
  formatBinding(binding: InputBinding, platform?: InputPlatform): string
}
