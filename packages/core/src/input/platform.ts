import type {
  InputModifier,
  InputModifierState,
  InputPlatform,
  PhysicalInputModifier
} from './types'

export interface InputPlatformEnvironment {
  userAgentDataPlatform?: string
  navigatorPlatform?: string
  userAgent?: string
  maxTouchPoints?: number
}

function platformFromText(value: string | undefined): InputPlatform | undefined {
  if (!value) return
  const source = value.toLowerCase()
  if (/iphone|ipad|ipod|ios/.test(source)) return 'ios'
  if (/mac/.test(source)) return 'macos'
  if (/win/.test(source)) return 'windows'
  if (/android/.test(source)) return 'android'
  if (/linux|x11|cros|chrome os/.test(source)) return 'linux'
}

function getDefaultEnvironment(): InputPlatformEnvironment {
  if (typeof navigator === 'undefined') return {}
  const extendedNavigator = navigator as Navigator & {
    userAgentData?: { platform?: string }
  }
  return {
    userAgentDataPlatform: extendedNavigator.userAgentData?.platform,
    navigatorPlatform: navigator.platform,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints
  }
}

export function detectInputPlatform(
  override?: InputPlatform,
  environment: InputPlatformEnvironment = getDefaultEnvironment()
): InputPlatform {
  if (override) return override

  const dataPlatform = platformFromText(environment.userAgentDataPlatform)
  if (dataPlatform) return dataPlatform

  if (
    environment.navigatorPlatform === 'MacIntel'
    && (environment.maxTouchPoints ?? 0) > 1
  ) return 'ios'

  const navigatorPlatform = platformFromText(environment.navigatorPlatform)
  if (navigatorPlatform) return navigatorPlatform
  return platformFromText(environment.userAgent) ?? 'unknown'
}

export function resolveModifier(
  modifier: InputModifier,
  platform: InputPlatform
): readonly PhysicalInputModifier[] {
  if (modifier !== 'Mod') return [modifier]
  if (platform === 'macos' || platform === 'ios') return ['Meta']
  if (platform === 'unknown') return ['Control', 'Meta']
  return ['Control']
}

export interface ModifierEventLike {
  type?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  getModifierState?: (key: string) => boolean
}

export function normalizeModifiers(
  event: ModifierEventLike | Event,
  platform: InputPlatform
): InputModifierState {
  const input = event as ModifierEventLike
  const control = !!input.ctrlKey
  const meta = !!input.metaKey
  const alt = !!input.altKey
  const shift = !!input.shiftKey
  const altGraph = !!input.getModifierState?.('AltGraph')
  const mod = platform === 'macos' || platform === 'ios'
    ? meta
    : platform === 'unknown'
      ? control || meta
      : control
  return { mod, control, meta, alt, shift, altGraph }
}
