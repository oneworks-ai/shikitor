import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

import { getClassWithColor, iconClasses } from '../../vendor/file-icons-js/index.js'

export type ShikitorConfiguredFileIconSource = 'atom' | 'image'

/** One browser-persisted path rule managed by the DSH settings page. */
export interface ShikitorConfiguredFileIconRule {
  readonly id: string
  /** Slash-normalized glob; `*` stays within a segment and `**` crosses directories. */
  readonly pattern: string
  readonly source: ShikitorConfiguredFileIconSource
  /** Atom glyph class or a workspace-relative/absolute/HTTP(S)/data image source. */
  readonly value: string
}

/** Complete Atom glyph catalog used by the settings picker. */
export const atomFileIconClasses = iconClasses

/** File facts passed to externally registered matchers and renderers. */
export interface ShikitorFileIconTarget {
  readonly extension: string
  readonly name: string
  readonly path: string
}

/** A DOM renderer keeps custom icons independent from React and the host UI kit. */
export type ShikitorFileIconRenderer = (
  document: Document,
  target: ShikitorFileIconTarget,
) => Element | null

/**
 * One composable filename/extension/custom-matcher rule. Higher priority wins.
 * A string icon is an Atom File Icons class list, for example
 * `rust-icon medium-red`; a renderer can still provide a completely custom DOM
 * node when an external plugin owns the asset.
 */
export interface ShikitorFileIconRule {
  readonly color?: string
  readonly extensions?: readonly string[]
  readonly fileNames?: readonly string[]
  readonly icon: string | ShikitorFileIconRenderer
  readonly match?: (target: ShikitorFileIconTarget) => boolean
  readonly priority?: number
}

interface RegisteredRule {
  readonly rule: ShikitorFileIconRule
  readonly sequence: number
}

export interface ResolvedFileIcon {
  readonly color?: string
  readonly render: ShikitorFileIconRenderer
  readonly target: ShikitorFileIconTarget
}

export type ShikitorFileIconPresentation = 'colored' | 'hidden' | 'monochrome'

function extensionOf(name: string): string {
  const offset = name.lastIndexOf('.')
  return offset <= 0 ? '' : name.slice(offset).toLocaleLowerCase()
}

function normalizedExtension(value: string): string {
  const normalized = value.toLocaleLowerCase()
  return normalized === '' || normalized.startsWith('.') ? normalized : `.${normalized}`
}

function targetOf(path: string): ShikitorFileIconTarget {
  const normalized = path.replaceAll('\\', '/')
  const name = normalized.slice(normalized.lastIndexOf('/') + 1) || normalized
  return { extension: extensionOf(name), name, path }
}

function matches(rule: ShikitorFileIconRule, target: ShikitorFileIconTarget): boolean {
  const fileNames = rule.fileNames?.map(value => value.toLocaleLowerCase())
  if (fileNames?.includes(target.name.toLocaleLowerCase()) === true) return true
  if (rule.extensions?.map(normalizedExtension).includes(target.extension) === true) return true
  return rule.match?.(target) === true
}

function globExpression(pattern: string): RegExp | null {
  const normalized = pattern.trim().replaceAll('\\', '/').replace(/^\.\//u, '')
  if (normalized === '') return null
  let source = '^'
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!
    if (character === '*') {
      if (normalized[index + 1] === '*') {
        index += 1
        source += '.*'
      } else {
        source += '[^/]*'
      }
      continue
    }
    if (character === '?') {
      source += '[^/]'
      continue
    }
    source += /[\\^$.*+?()[\]{}|]/u.test(character) ? `\\${character}` : character
  }
  try {
    return new RegExp(`${source}$`, 'iu')
  } catch {
    return null
  }
}

/** Match a settings rule against either a full path or its basename. */
export function matchesFileIconPattern(pattern: string, path: string): boolean {
  const expression = globExpression(pattern)
  if (expression === null) return false
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//u, '')
  const name = normalized.slice(normalized.lastIndexOf('/') + 1)
  return expression.test(normalized) || (!pattern.includes('/') && expression.test(name))
}

function atomIcon(classNames: string, document: Document): HTMLElement {
  const icon = document.createElement('i')
  icon.classList.add('dsh-shikitor-file-icon', 'icon')
  icon.classList.add(...classNames.trim().split(/\s+/u).filter(Boolean))
  icon.setAttribute('aria-hidden', 'true')
  return icon
}

/** Apply the shared visibility/colour policy to an Atom or external icon. */
export function presentFileIcon(
  resolved: ResolvedFileIcon,
  document: Document,
  presentation: ShikitorFileIconPresentation,
): Element | null {
  if (presentation === 'hidden') return null
  const icon = resolved.render(document, resolved.target)
  if (icon === null) return null
  icon.classList.add('dsh-shikitor-file-icon')
  icon.classList.add(`dsh-shikitor-file-icon--${presentation}`)
  icon.setAttribute('aria-hidden', 'true')
  if (presentation === 'colored' && resolved.color !== undefined) {
    ;(icon as HTMLElement | SVGElement).style.setProperty(
      '--dsh-shikitor-file-icon-color',
      resolved.color,
    )
    icon.classList.add('dsh-shikitor-file-icon--custom-color')
  }
  return icon
}

/** Mutable rule ledger exposed through `ctx.shikitor`. */
export class FileIconRegistry implements HostObservable<readonly ShikitorFileIconRule[]> {
  private readonly listeners = new Set<() => void>()
  private readonly entries: RegisteredRule[] = []
  private sequence = 0
  private snapshot: readonly ShikitorFileIconRule[] = []

  getSnapshot(): readonly ShikitorFileIconRule[] {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  register(rule: ShikitorFileIconRule): () => void {
    const entry = { rule, sequence: this.sequence++ }
    this.entries.push(entry)
    this.publish()
    let active = true
    return () => {
      if (!active) return
      active = false
      const index = this.entries.indexOf(entry)
      if (index >= 0) this.entries.splice(index, 1)
      this.publish()
    }
  }

  resolve(path: string): ResolvedFileIcon {
    const target = targetOf(path)
    const winner = [...this.entries]
      .filter(entry => matches(entry.rule, target))
      .sort((left, right) =>
        (right.rule.priority ?? 0) - (left.rule.priority ?? 0)
        || right.sequence - left.sequence
      )[0]?.rule
    const icon = winner?.icon ?? getClassWithColor(target.name) ?? 'text-icon'
    return {
      target,
      ...(winner?.color === undefined ? {} : { color: winner.color }),
      render: typeof icon === 'function'
        ? icon
        : document => atomIcon(icon, document),
    }
  }

  /** Re-render consumers after an asynchronous custom image becomes available. */
  refresh(): void {
    this.publish()
  }

  private publish(): void {
    this.snapshot = this.entries.map(entry => entry.rule)
    for (const listener of [...this.listeners]) listener()
  }
}
