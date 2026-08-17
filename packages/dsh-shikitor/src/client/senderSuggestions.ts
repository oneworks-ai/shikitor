import { definePlugin } from '@shikitor/core'
import type { CompletionItem, CompletionList } from '@shikitor/core'
import type {} from '@shikitor/core/plugins/provide-completions'
import type { CompletionItemIconRenderer } from '@shikitor/core/plugins/provide-completions'
import { CompletionItemKind } from '@shikitor/core/plugins/provide-completions'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { TriggerChar } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

import type { MentionProtocol, SenderCatalog } from './catalog.ts'
import { presentFileIcon } from './fileIcons.ts'
import { NS } from './locales.ts'
import type { ShikitorService } from './registry.ts'
import { suggestionIcons } from './suggestionIcons.ts'

const FILE_PAGE_SIZE = 40

interface MentionQuery {
  readonly protocol: MentionProtocol
  readonly query: string
}

function parseMentionQuery(query: string): MentionQuery | undefined {
  const match = /^(file|plugin):(.*)$/iu.exec(query)
  if (match === null) return
  return {
    protocol: match[1]!.toLocaleLowerCase() as MentionProtocol,
    query: match[2]!,
  }
}

function fileIcon(service: ShikitorService, path: string): CompletionItemIconRenderer {
  return () => {
    if (typeof document === 'undefined') return null
    const icon = presentFileIcon(
      service.resolveFileIcon(path),
      document,
      service.appearance.getSnapshot().fileIcons,
    )
    if (icon !== null) return icon
    const placeholder = document.createElement('span')
    placeholder.className = 'dsh-shikitor-file-icon-placeholder'
    placeholder.setAttribute('aria-hidden', 'true')
    return placeholder
  }
}

function sourceIcon(
  trigger: TriggerChar,
  source: string,
  name: string,
  service: ShikitorService,
): CompletionItemIconRenderer {
  if (source === 'file') return fileIcon(service, name)
  if (source === 'cordis') return suggestionIcons.plugin
  if (source === 'skill') return suggestionIcons.skill
  if (source === 'subagent') return suggestionIcons.subagent
  if (source === 'command') return suggestionIcons.command
  return trigger === '/' ? suggestionIcons.command : suggestionIcons.mention
}

function triggerRange(offset: number) {
  const triggerOffset = Math.max(0, offset - 1)
  return { start: triggerOffset, end: triggerOffset }
}

function triggerEndOffset(cursorOffset: number, query: string): number {
  return Math.max(0, cursorOffset - query.length)
}

function atTokenBoundary(value: string, offset: number): boolean {
  const previous = value[offset - 2]
  return previous === undefined || /\s/.test(previous)
}

function atDshTriggerBoundary(value: string, offset: number, trigger: TriggerChar): boolean {
  const triggerOffset = offset - 1
  if (triggerOffset <= 0) return true
  if (value[triggerOffset] !== trigger) return false
  const previous = value[triggerOffset - 1] ?? ''
  if (/\s/u.test(previous)) return true
  if (/[\p{L}\p{N}_]/u.test(previous)) return false
  if (trigger === '/') {
    if (previous === '/') return false
    if (previous === ':' && triggerOffset >= 2 && !/\s/u.test(value[triggerOffset - 2] ?? '')) return false
  }
  return true
}

function sourceKind(trigger: TriggerChar, source: string): CompletionItemKind {
  if (source === 'file') return CompletionItemKind.File
  if (source === 'cordis') return CompletionItemKind.Module
  if (source === 'subagent') return CompletionItemKind.User
  return trigger === '/' ? CompletionItemKind.Function : CompletionItemKind.Reference
}

function sourceLabel(t: TranslateNS<typeof NS>, source: string): string {
  if (source === 'command') return t('source.command')
  if (source === 'cordis') return t('source.plugin')
  if (source === 'file') return t('source.file')
  if (source === 'skill') return t('source.skill')
  if (source === 'subagent') return t('source.subagent')
  return t('source.mention')
}

function sourceDetail(
  t: TranslateNS<typeof NS>,
  source: string,
  description?: string,
): string {
  const label = sourceLabel(t, source)
  if (source === 'file' && (description === '文件' || description === 'File')) return label
  return description === undefined || description === '' || description === label
    ? label
    : `${label} · ${description}`
}

/** Session-scoped Shikitor renderer for the complete sender trigger set. */
export function createSenderSuggestionsPlugin(
  catalog: SenderCatalog,
  sessionId: SessionId,
  service: ShikitorService,
  t: TranslateNS<typeof NS>,
) {
  return definePlugin({
    name: `dsh-sender-suggestions:${sessionId}`,
    inject: ['shikitorCompletions'],
    apply(ctx) {
      const chats = ctx.shikitorCompletions.registerCompletionItemProvider('*', {
        triggerCharacters: ['#'],
        provideCompletionItems({ value }, position, request) {
          const triggerEnd = triggerEndOffset(position.offset, request.query)
          if (!atTokenBoundary(value, triggerEnd)) return
          const range = triggerRange(triggerEnd)
          const suggestions: CompletionItem[] = catalog.chats().map(chat => ({
            label: chat.displayTitle,
            kind: CompletionItemKind.Reference,
            renderIcon: suggestionIcons.chat,
            detail: chat.id === sessionId ? t('source.currentChat') : chat.cwd ?? t('source.chat'),
            range,
            insertText: `${catalog.chatLink(chat)} `,
          }))
          return { suggestions }
        },
      })

      const skills = ctx.shikitorCompletions.registerCompletionItemProvider('*', {
        triggerCharacters: ['$'],
        async provideCompletionItems({ value }, position, request) {
          const triggerEnd = triggerEndOffset(position.offset, request.query)
          if (!atTokenBoundary(value, triggerEnd)) return
          const range = triggerRange(triggerEnd)
          try {
            const entries = await catalog.skills(sessionId)
            const suggestions: CompletionItem[] = entries.map(skill => ({
              label: skill.name,
              kind: CompletionItemKind.Function,
              renderIcon: suggestionIcons.skill,
              detail: skill.modelInvocable
                ? skill.description
                : `${t('source.userOnly')} · ${skill.description}`,
              documentation: skill.whenToUse,
              range,
              // DSH's host skill pre-step recognizes /name. `$` is the
              // discovery shorthand; acceptance keeps execution semantic.
              insertText: `/${skill.name} `,
            }))
            return { suggestions }
          } catch (error) {
            console.error('[dsh-shikitor] reading skills failed:', error)
            return { suggestions: [] }
          }
        },
      })

      const dshTrigger = (trigger: TriggerChar) =>
        ctx.shikitorCompletions.registerCompletionItemProvider('*', {
          triggerCharacters: [trigger],
          async provideCompletionItems({ value }, position, request) {
            const programmatic = trigger === '/' && catalog.launcherSource(sessionId) === 'command'
            const mentionQuery = trigger === '@' ? parseMentionQuery(request.query) : undefined
            const triggerEnd = triggerEndOffset(position.offset, request.query)
            if (!programmatic && !atDshTriggerBoundary(value, triggerEnd, trigger)) return
            const range = triggerRange(triggerEnd)
            try {
              const toCompletionItem = (entry: Awaited<ReturnType<typeof catalog.triggerSuggestions>>[number]) => ({
                label: entry.name,
                ...(mentionQuery === undefined
                  ? {}
                  : { filterText: `${mentionQuery.protocol}:${entry.name}` }),
                kind: sourceKind(trigger, entry.source),
                renderIcon: sourceIcon(trigger, entry.source, entry.name, service),
                detail: sourceDetail(t, entry.source, entry.description),
                range,
                insertText: entry.source === 'file'
                  ? `${catalog.fileLink(sessionId, entry.name)} `
                  : `${trigger}${entry.name} `,
                onAccept: () => catalog.pickTriggerSuggestion(
                  sessionId,
                  trigger,
                  entry.source,
                  entry.name,
                ),
              } satisfies CompletionItem)
              const fileQuery = trigger === '@'
                && (mentionQuery === undefined || mentionQuery.protocol === 'file')
                ? mentionQuery?.query ?? request.query
                : undefined
              const filePage = fileQuery === undefined
                ? undefined
                : await catalog.fileSuggestionPage(sessionId, fileQuery, 0, FILE_PAGE_SIZE)
              const entries = mentionQuery === undefined
                ? (await catalog.triggerSuggestions(sessionId, trigger, request.query))
                    .filter(entry => entry.source !== 'file')
                : mentionQuery.protocol === 'file'
                  ? []
                  : await catalog.mentionSuggestions(sessionId, mentionQuery.protocol, mentionQuery.query)
              const suggestions: CompletionItem[] = [
                ...entries,
                ...(filePage?.suggestions ?? []),
              ].map(toCompletionItem)
              const nextFilePage = (offset: number): CompletionList['loadMore'] | undefined => {
                if (fileQuery === undefined) return
                return async () => {
                  const page = await catalog.fileSuggestionPage(
                    sessionId,
                    fileQuery,
                    offset,
                    FILE_PAGE_SIZE,
                  )
                  const nextOffset = offset + page.suggestions.length
                  return {
                    suggestions: page.suggestions.map(toCompletionItem),
                    ...(page.hasMore ? { loadMore: nextFilePage(nextOffset) } : {}),
                  }
                }
              }
              const nextOffset = filePage?.suggestions.length ?? 0
              return {
                suggestions,
                ...(filePage?.hasMore ? { loadMore: nextFilePage(nextOffset) } : {}),
              }
            } catch (error) {
              console.error(`[dsh-shikitor] reading ${trigger} suggestions failed:`, error)
              return { suggestions: [] }
            }
          },
        })

      const mentions = dshTrigger('@')
      const commands = dshTrigger('/')
      let programmaticLauncherOpen = false
      const launcher = catalog.subscribeLauncher(sessionId, (source) => {
        if (source === 'command') {
          programmaticLauncherOpen = ctx.shikitorCompletions.show('/')
        } else if (programmaticLauncherOpen) {
          programmaticLauncherOpen = false
          ctx.shikitorCompletions.hide()
        }
      })

      return () => {
        chats.dispose?.()
        skills.dispose?.()
        mentions.dispose?.()
        commands.dispose?.()
        launcher()
      }
    },
  })
}
