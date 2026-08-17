import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import codeStyler from '@shikitor/core/plugins/code-styler'
import provideCompletions from '@shikitor/core/plugins/provide-completions'
import provideKeyboard from '@shikitor/core/plugins/provide-keyboard'
import providePointer from '@shikitor/core/plugins/provide-pointer'
import providePopup from '@shikitor/core/plugins/provide-popup'
import provideSelectionToolbox from '@shikitor/core/plugins/provide-selection-toolbox'
import selectionToolboxForMd from '@shikitor/core/plugins/selection-toolbox-for-md'

import bracketMatcher from '../../../core/src/plugins/bracket-matcher.ts'
import symmetryOperator from '../../../core/src/plugins/symmetry-operator.ts'

import { SenderCatalog } from './catalog.ts'
import { ShikitorEditor } from './ShikitorEditor.tsx'
import { en, NS, type ShikitorSettingsKey, zh } from './locales.ts'
import { ShikitorRuntime } from './registry.ts'
import { ShikitorSenderBridge } from './ShikitorSender.tsx'
import { ShikitorSettings } from './ShikitorSettings.tsx'
import {
  ShikitorUserMessage,
  type NativeUserMessageRenderer,
} from './ShikitorUserMessage.tsx'
import '../../vendor/material-symbols-outlined/style.css'
import '../../vendor/file-icons-js/css/style.css'
import './styles.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy owned by the Shikitor sender/editor integration. */
    [NS]: ShikitorSettingsKey
  }
}

export type {
  ShikitorAppearance,
  ShikitorAppearanceUpdate,
  ShikitorColorScheme,
  ShikitorCursorStyle,
  ShikitorEditorAppearance,
  ShikitorEditorAppearanceUpdate,
  ShikitorEditorContext,
  ShikitorEditorContextComment,
  ShikitorEditorContextFile,
  ShikitorEditorContextPosition,
  ShikitorEditorContextSelection,
  ShikitorFileIconMode,
  ShikitorService,
  ShikitorSurface,
  ShikitorSurfaceAppearance,
  ShikitorTheme,
} from './registry.ts'
export { resolveSurfaceAppearance } from './registry.ts'
export type {
  ShikitorConfiguredFileIconRule,
  ShikitorConfiguredFileIconSource,
  ShikitorFileIconRenderer,
  ShikitorFileIconRule,
  ShikitorFileIconTarget,
} from './fileIcons.ts'
export { atomFileIconClasses, matchesFileIconPattern } from './fileIcons.ts'

/** DSH services required before the Shikitor bundle activates. */
export const inject = [
  'slots',
  'theme',
  'sessions',
  'connection',
  'inputTriggers',
  'locale',
  'remote',
  'remote.dynamicCordisRunner',
]

/** Install `ctx.shikitor` and the first sender/editor surfaces. */
export function apply(ctx: ClientContext): void {
  const shikitor = new ShikitorRuntime(ctx)
  const catalog = new SenderCatalog(ctx)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-shikitor: dictionaries')
  const t = ctx.locale.bind(NS)

  for (const surface of ['sender', 'editor'] as const) {
    ctx.effect(() => shikitor.register(surface, provideKeyboard), `dsh-shikitor: ${surface} keyboard`)
    ctx.effect(() => shikitor.register(surface, providePointer), `dsh-shikitor: ${surface} pointer`)
  }

  ctx.effect(() => shikitor.register('sender', providePopup), 'dsh-shikitor: sender popup')
  ctx.effect(() => {
    let dispose = shikitor.register('sender', [provideCompletions, {
      popupPlacement: 'top',
      emptyText: t('completion.empty'),
      tooltip: t('completion.tooltip'),
    }])
    const stopLocale = ctx.on('locale/change', () => {
      dispose()
      dispose = shikitor.register('sender', [provideCompletions, {
        popupPlacement: 'top',
        emptyText: t('completion.empty'),
        tooltip: t('completion.tooltip'),
      }])
    })
    return () => {
      stopLocale()
      dispose()
    }
  }, 'dsh-shikitor: sender completions')
  ctx.effect(() => shikitor.register('sender', provideSelectionToolbox), 'dsh-shikitor: sender toolbox')
  ctx.effect(() => shikitor.register('sender', selectionToolboxForMd), 'dsh-shikitor: sender markdown tools')

  ctx.effect(() => shikitor.register('editor', codeStyler), 'dsh-shikitor: editor code style')
  ctx.effect(() => shikitor.register('editor', bracketMatcher), 'dsh-shikitor: editor bracket matching')
  ctx.effect(() => shikitor.register('editor', symmetryOperator), 'dsh-shikitor: editor symmetry')

  ctx.effect(
    () => catalog.registerFileSource(ctx.get('inputTriggers') as InputTriggerServiceContract),
    'dsh-shikitor: @file source',
  )

  const colorScheme = {
    getSnapshot: () => ctx.theme.getTheme().active.colorScheme,
    subscribe: (listener: () => void) => ctx.on('theme/change', () => { listener() }),
  }

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'dsh-shikitor-sender-mode',
    order: 100,
    locale: NS,
    inject: () => ({
      hooks: {
        appearance: shikitor.appearance,
        plugins: shikitor.source('sender'),
        colorScheme,
      },
      catalog,
      editorTabLabel: () => t('nav'),
      runtime: shikitor,
    }),
  }, ShikitorSenderBridge))

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'shikitor-editor',
    order: 30,
    label: () => t('nav'),
    locale: NS,
    inject: sessionId => ({
      hooks: {
        appearance: shikitor.appearance,
        document: shikitor.document(sessionId),
        fileIconRules: shikitor.fileIconRules,
        plugins: shikitor.source('editor'),
        colorScheme,
      },
      createWorkspaceFile: async (path: string) => {
        await shikitor.createFile(
          sessionId,
          catalog.workspaceFilePath(sessionId, path),
        )
        catalog.invalidateWorkspaceFiles(sessionId)
      },
      loadWorkspaceFiles: () => catalog.workspaceFiles(sessionId),
      openWorkspaceFile: path => shikitor.openFile(
        sessionId,
        catalog.workspaceFilePath(sessionId, path),
      ),
      runtime: shikitor,
    }),
  }, ShikitorEditor))

  ctx.slots.inject('conversation.chat.node', () => {
    const native = ctx.slots.entries('conversation.chat.node').find(entry =>
      entry.options.key === 'user' && (entry.options.priority ?? 0) === 0
    )
    if (native === undefined) {
      throw new Error('dsh-shikitor: native user message renderer is unavailable')
    }
    return ctx.slots.register({
      name: 'conversation.chat.node',
      key: 'user',
      priority: -1,
      locale: 'conversation',
      inject: () => ({
        NativeUserMessage: native.component as NativeUserMessageRenderer,
        openSession: (sessionId: SessionId) => { ctx.sessions.open(sessionId) },
      }),
    }, ShikitorUserMessage as NativeUserMessageRenderer & typeof ShikitorUserMessage)
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'shikitor',
    order: 40,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({
      hooks: {
        appearance: shikitor.appearance,
        configuredFileIconRules: shikitor.configuredFileIconRules,
      },
      runtime: shikitor,
    }),
  }, ShikitorSettings))
}
