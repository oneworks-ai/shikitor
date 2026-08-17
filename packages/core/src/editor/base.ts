import type { OffsetOrPosition, ResolvedPosition } from '@shikijs/types'
import type { BundledLanguage } from 'shiki'

import type { ResolvedTextRange, TextRange } from '../base'
import type { Awaitable, Nullable } from '../types'

export type Cursor = OffsetOrPosition
export type Selection = TextRange
export interface ResolvedCursor extends ResolvedPosition {}
export interface ResolvedSelection extends ResolvedTextRange {}

export type LanguageSelector = '*' | BundledLanguage | readonly BundledLanguage[]

export interface IDisposable {
  dispose?: () => void
}

export type ProviderResult<T> = Awaitable<Nullable<T>>
