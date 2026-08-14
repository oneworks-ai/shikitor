import './index.scss'

import MarkdownItPluginShiki from '@shikijs/markdown-it'
import type { InputShikitorPlugin, Shikitor, ShikitorOptions } from '@shikitor/core'
import provideCompletions, { CompletionItemKind } from '@shikitor/core/plugins/provide-completions'
import provideKeyboard from '@shikitor/core/plugins/provide-keyboard'
import providePointer from '@shikitor/core/plugins/provide-pointer'
import providePopup from '@shikitor/core/plugins/provide-popup'
import provideSelectionToolbox from '@shikitor/core/plugins/provide-selection-toolbox'
import selectionToolboxForMd from '@shikitor/core/plugins/selection-toolbox-for-md'
import { WithoutCoreEditor } from '@shikitor/react'
import MarkdownIt from 'markdown-it'
import React, { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, Button } from 'tdesign-react'

import { useQueries } from '../../hooks/useQueries'
import { useI18n } from '../../i18n'
import { useShikitorCreate } from '../../hooks/useShikitorCreate'
import type { IMessage, IUser } from './components/Message'
import { Message } from './components/Message'
import { createReplyTimerRegistry } from './plugins/reply-timers'
import sessionLinks from './plugins/session-links'
import triggerCompletions, {
  type MessengerCompletionGroup
} from './plugins/trigger-completions'

type MessageItem = IMessage & {
  hidden?: boolean
  kind?: 'welcome' | 'demoReply'
  roomId?: ChatRoomId
}
type DecorationItem = NonNullable<ShikitorOptions['decorations']>[number]
type CustomProperties = CSSProperties & Record<`--${string}`, string | number>

const chatRoomIds = ['documentation', 'frontend-review', 'lsp-integration', 'release-prep'] as const
type ChatRoomId = typeof chatRoomIds[number]

type ChatRoomDefinition = {
  id: ChatRoomId
  icon: string
  title: string
  status: string
  welcome: string
  unread?: number
}

const sessionRoomIds: Record<string, ChatRoomId> = {
  'documentation': 'documentation',
  'frontend-review': 'frontend-review',
  'lsp-integration': 'lsp-integration',
  'release-prep': 'release-prep'
}

function getSessionLinkDecorations(value: string): DecorationItem[] {
  return Array.from(value.matchAll(/#([\w-]+)/g)).flatMap(match => {
    const roomId = sessionRoomIds[match[1]]
    if (!roomId || match.index === undefined) return []
    return [{
      start: match.index,
      end: match.index + match[0].length,
      properties: {
        class: 'messenger-session-link',
        'data-room': roomId
      }
    }]
  })
}

const currentUser = {
  name: 'YiJie'
} as IUser

function imageCompletionIcon(src: string) {
  return () => {
    const image = document.createElement('img')
    image.src = src
    image.alt = ''
    image.setAttribute('aria-hidden', 'true')
    return image
  }
}

function initialsCompletionIcon(initials: string, color: string) {
  return () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle.setAttribute('cx', '12')
    circle.setAttribute('cy', '12')
    circle.setAttribute('r', '12')
    circle.setAttribute('fill', color)

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', '12')
    text.setAttribute('y', '15.5')
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('font-size', '9')
    text.setAttribute('font-family', 'system-ui, sans-serif')
    text.setAttribute('fill', 'white')
    text.textContent = initials

    svg.append(circle, text)
    return svg
  }
}

function svgCompletionIcon(path: string) {
  return () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '1.8')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')

    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    shape.setAttribute('d', path)
    svg.append(shape)
    return svg
  }
}

const completionIcons = {
  clear: svgCompletionIcon('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5'),
  goal: svgCompletionIcon('M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 10a2 2 0 1 0 2 2M15 9l6-6M21 3v5M21 3h-5'),
  help: svgCompletionIcon('M9.5 9a2.5 2.5 0 1 1 4.4 1.6c-.8.8-1.9 1.2-1.9 2.4M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'),
  memory: svgCompletionIcon('M8 4h8a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3M9 8h6M9 12h6M9 16h3'),
  browser: svgCompletionIcon('M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c2 2.5 3 5.5 3 9s-1 6.5-3 9M12 3c-2 2.5-3 5.5-3 9s1 6.5 3 9'),
  docs: svgCompletionIcon('M7 3h7l4 4v14H7zM14 3v5h4M10 12h5M10 16h5'),
  review: svgCompletionIcon('M4 5h16v11H4zM8 20h8M12 16v4M8 10l2.5 2.5L16 7'),
  integration: svgCompletionIcon('M8 8 4 12l4 4M16 8l4 4-4 4M14 5l-4 14'),
  release: svgCompletionIcon('M14 4c3-1 5-1 6-1 0 1 0 3-1 6l-5 5-4-4zM10 8 6 7 3 10l5 2M12 14l2 5-3 3-1-4M7 17c-2 0-3 1-3 3 2 0 3-1 3-3')
}

export default function Messenger() {
  const { locale, t } = useI18n()
  const tRef = useRef(t)
  tRef.current = t
  const queries = useQueries<{ theme: 'dark' | 'light' }>()
  const appTheme = queries.value.theme === 'dark' ? 'dark' : 'light'
  const theme: NonNullable<ShikitorOptions['theme']> = appTheme === 'dark'
    ? 'github-dark'
    : 'github-light'
  const isDark = appTheme === 'dark'
  const shikitorCreate = useShikitorCreate()
  const botName = t('messenger.botName')
  const welcomeMessage = t('messenger.welcome')
  const demoReply = t('messenger.demoReply')
  const composerPlaceholder = t('messenger.placeholder')
  const documentHelper = useMemo<IUser>(() => ({
    name: botName,
    avatar: `${import.meta.env.BASE_URL}favicon.svg`
  }), [botName])
  const rooms = useMemo<ChatRoomDefinition[]>(() => {
    const translate = tRef.current
    return [
      {
        id: 'documentation',
        icon: 'description',
        title: translate('messenger.room'),
        status: translate('messenger.online'),
        welcome: welcomeMessage
      },
      {
        id: 'frontend-review',
        icon: 'preview',
        title: translate('messenger.room.frontendReview'),
        status: translate('messenger.room.frontendReviewStatus'),
        welcome: translate('messenger.room.frontendReviewWelcome'),
        unread: 2
      },
      {
        id: 'lsp-integration',
        icon: 'data_object',
        title: translate('messenger.room.lspIntegration'),
        status: translate('messenger.room.lspIntegrationStatus'),
        welcome: translate('messenger.room.lspIntegrationWelcome')
      },
      {
        id: 'release-prep',
        icon: 'rocket_launch',
        title: translate('messenger.room.releasePrep'),
        status: translate('messenger.room.releasePrepStatus'),
        welcome: translate('messenger.room.releasePrepWelcome'),
        unread: 1
      }
    ]
  }, [locale, welcomeMessage])

  const completionGroups = useMemo<MessengerCompletionGroup[]>(() => {
    const translate = tRef.current
    return [
      {
        trigger: '/',
        items: [
          {
            label: 'clear',
            kind: CompletionItemKind.Function,
            renderIcon: completionIcons.clear,
            detail: translate('messenger.completion.command'),
            documentation: translate('messenger.command.clear')
          },
          {
            label: 'goal',
            kind: CompletionItemKind.Function,
            renderIcon: completionIcons.goal,
            detail: translate('messenger.completion.command'),
            documentation: translate('messenger.command.goal')
          },
          {
            label: 'help',
            kind: CompletionItemKind.Function,
            renderIcon: completionIcons.help,
            detail: translate('messenger.completion.command'),
            documentation: translate('messenger.command.help')
          }
        ]
      },
      {
        trigger: '$',
        items: [
          {
            label: 'mem',
            kind: CompletionItemKind.Module,
            renderIcon: completionIcons.memory,
            detail: translate('messenger.completion.skill'),
            documentation: translate('messenger.skill.mem')
          },
          {
            label: 'browser',
            kind: CompletionItemKind.Module,
            renderIcon: completionIcons.browser,
            detail: translate('messenger.completion.skill'),
            documentation: translate('messenger.skill.browser')
          },
          {
            label: 'openai-docs',
            kind: CompletionItemKind.Module,
            renderIcon: completionIcons.docs,
            detail: translate('messenger.completion.skill'),
            documentation: translate('messenger.skill.openaiDocs')
          }
        ]
      },
      {
        trigger: '#',
        items: [
          {
            label: 'frontend-review',
            kind: CompletionItemKind.Reference,
            renderIcon: completionIcons.review,
            detail: translate('messenger.completion.session'),
            documentation: translate('messenger.session.frontendReview')
          },
          {
            label: 'lsp-integration',
            kind: CompletionItemKind.Reference,
            renderIcon: completionIcons.integration,
            detail: translate('messenger.completion.session'),
            documentation: translate('messenger.session.lspIntegration')
          },
          {
            label: 'release-prep',
            kind: CompletionItemKind.Reference,
            renderIcon: completionIcons.release,
            detail: translate('messenger.completion.session'),
            documentation: translate('messenger.session.releasePrep')
          }
        ]
      },
      {
        trigger: '@',
        items: [
          {
            label: 'Shikitor',
            kind: CompletionItemKind.User,
            renderIcon: imageCompletionIcon(`${import.meta.env.BASE_URL}favicon.svg`),
            detail: translate('messenger.completion.user'),
            documentation: translate('messenger.user.shikitor')
          },
          {
            label: 'YiJie',
            kind: CompletionItemKind.User,
            renderIcon: initialsCompletionIcon('YJ', '#2563eb'),
            detail: translate('messenger.completion.user'),
            documentation: translate('messenger.user.yijie')
          },
          {
            label: botName,
            kind: CompletionItemKind.User,
            renderIcon: imageCompletionIcon(documentHelper.avatar ?? `${import.meta.env.BASE_URL}favicon.svg`),
            detail: translate('messenger.completion.user'),
            documentation: translate('messenger.user.helper')
          }
        ]
      }
    ]
  }, [botName, documentHelper, locale])

  const [activeRoomId, setActiveRoomId] = useState<ChatRoomId>('documentation')
  const [roomDrafts, setRoomDrafts] = useState<Record<ChatRoomId, string>>(() => (
    Object.fromEntries(chatRoomIds.map(roomId => [roomId, ''])) as Record<ChatRoomId, string>
  ))
  const [roomMessages, setRoomMessages] = useState<Record<ChatRoomId, MessageItem[]>>(() => {
    const timestamp = Date.now()
    return Object.fromEntries(rooms.map((room, index) => [room.id, [{
      text: room.welcome,
      user: documentHelper,
      ctime: timestamp + index,
      kind: 'welcome',
      roomId: room.id
    }]])) as Record<ChatRoomId, MessageItem[]>
  })
  const activeRoom = rooms.find(room => room.id === activeRoomId) ?? rooms[0]
  const messages = roomMessages[activeRoomId]
  const text = roomDrafts[activeRoomId]
  const sessionLinkKey = getSessionLinkDecorations(text)
    .map(decoration => `${decoration.start}:${decoration.end}`)
    .join('|')
  const [composerColors, setComposerColors] = useState(() => isDark
    ? { bg: '#0d1117', fg: '#e6edf3' }
    : { bg: '#fff', fg: '#24292f' })
  const shikitorRef = useRef<Shikitor>(null)
  const [markdownRenderer, setMarkdownRenderer] = useState(() => MarkdownIt())
  const replyTimersRef = useRef<ReturnType<typeof createReplyTimerRegistry>>()
  replyTimersRef.current ??= createReplyTimerRegistry()

  useEffect(() => {
    let active = true
    const renderer = MarkdownIt()
    void MarkdownItPluginShiki({
      // @ts-ignore upstream plugin accepts bundled Shiki themes
      fallbackLanguage: 'text',
      themes: {
        light: theme,
        dark: theme
      }
    }).then(plugin => {
      if (!active) return
      renderer.use(plugin)
      setMarkdownRenderer(renderer)
    }).catch(() => {})
    return () => {
      active = false
    }
  }, [theme])

  useEffect(() => () => replyTimersRef.current?.dispose(), [])

  useEffect(() => {
    setComposerColors(isDark
      ? { bg: '#0d1117', fg: '#e6edf3' }
      : { bg: '#fff', fg: '#24292f' })
  }, [isDark])

  useEffect(() => {
    const editor = shikitorRef.current
    if (!editor) return
    editor.focus(roomDrafts[activeRoomId].length, { preventScroll: true })
  }, [activeRoomId])

  useEffect(() => {
    const roomWelcome = Object.fromEntries(rooms.map(room => [room.id, room.welcome])) as Record<ChatRoomId, string>
    setRoomMessages(current => Object.fromEntries(chatRoomIds.map(roomId => [
      roomId,
      current[roomId].map(message => {
        if (message.kind === 'welcome') {
          return { ...message, text: roomWelcome[roomId], user: documentHelper }
        }
        if (message.kind === 'demoReply') {
          return { ...message, text: demoReply, user: documentHelper }
        }
        return message
      })
    ])) as Record<ChatRoomId, MessageItem[]>)
  }, [demoReply, documentHelper, rooms])

  const composerPlugins = useMemo(() => {
    return [
      providePointer,
      provideKeyboard,
      providePopup,
      [provideCompletions, {
        popupPlacement: 'top',
        footer: false
      }],
      [triggerCompletions, {
        groups: completionGroups
      }],
      [sessionLinks, {
        onNavigate(roomId: string) {
          const targetRoomId = sessionRoomIds[roomId]
          if (targetRoomId) setActiveRoomId(targetRoomId)
        }
      }],
      provideSelectionToolbox,
      selectionToolboxForMd
    ] satisfies InputShikitorPlugin[]
  }, [completionGroups])

  const composerOptions = useMemo(() => ({
    theme,
    language: 'markdown' as const,
    lineNumbers: 'off' as const,
    highlightCurrentLine: false,
    placeholder: composerPlaceholder,
    hideSelfCursorUsername: true,
    decorations: getSessionLinkDecorations(text),
    autoSize: { maxRows: 8 }
  // Updating editor options for every keystroke races the completion popup.
  // Only refresh decorations when a complete, recognized room link changes.
  }), [composerPlaceholder, sessionLinkKey, theme])

  const setText = (value: string) => {
    setRoomDrafts(current => ({ ...current, [activeRoomId]: value }))
  }

  const sendMessage = (message: string) => {
    const targetRoomId = activeRoomId
    setRoomMessages(current => ({
      ...current,
      [targetRoomId]: [...current[targetRoomId], {
        text: message,
        user: currentUser,
        ctime: Date.now(),
        roomId: targetRoomId
      }]
    }))
    setRoomDrafts(current => ({ ...current, [targetRoomId]: '' }))
    replyTimersRef.current?.schedule(targetRoomId, () => {
      setRoomMessages(current => ({
        ...current,
        [targetRoomId]: [...current[targetRoomId], {
          text: demoReply,
          user: documentHelper,
          ctime: Date.now(),
          kind: 'demoReply',
          roomId: targetRoomId
        }]
      }))
    }, 350)
  }

  return (
    <div
      className='messenger-examples'
      data-theme={isDark ? 'dark' : 'light'}
      id='messenger-composer'
    >
      <nav className='chatroom-list' aria-label={t('messenger.rooms')}>
        <div className='chatroom-list__items'>
          {rooms.map(room => {
            const isActive = room.id === activeRoomId
            return (
              <button
                key={room.id}
                type='button'
                className={`chatroom-list__item${isActive ? ' chatroom-list__item--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setActiveRoomId(room.id)}
              >
                <span className='chatroom-list__icon shikitor-icon'>{room.icon}</span>
                <span className='chatroom-list__copy'>
                  <strong>{room.title}</strong>
                  <small>{room.status}</small>
                </span>
                {room.unread && !isActive
                  ? <span className='chatroom-list__badge'>{room.unread}</span>
                  : null}
              </button>
            )
          })}
        </div>
      </nav>
      <div
        className='chatroom'
        data-theme={isDark ? 'dark' : 'light'}
        style={{
          '--composer-bg': composerColors.bg || (isDark ? '#0d1117' : '#fff'),
          '--composer-fg': composerColors.fg || (isDark ? '#e6edf3' : '#24292f'),
          '--bg': composerColors.bg || '#fff',
          '--fg': composerColors.fg || '#24292f'
        } as CustomProperties}
      >
        <div className='chatroom__header'>
          <div className='chatroom__identity'>
            <Avatar size='small' image={documentHelper.avatar}>DH</Avatar>
            <div>
              <strong>{activeRoom.title}</strong>
              <span><i /> {activeRoom.status}</span>
            </div>
          </div>
          <Button
            variant='text'
            shape='square'
            disabled={messages.length === 0}
            aria-label={t('messenger.clear')}
            onClick={() => {
              replyTimersRef.current?.cancel(activeRoomId)
              setRoomMessages(current => ({ ...current, [activeRoomId]: [] }))
            }}
          >
            <span className='shikitor-icon'>delete_sweep</span>
          </Button>
        </div>
        <div className='messages'>
          {messages.map((message, index) => (
            <Message
              key={`${message.ctime}-${index}`}
              value={message}
              textRender={value => (
                <div className='message-text'>
                  <div
                    className='s-md'
                    dangerouslySetInnerHTML={{ __html: markdownRenderer.render(value) }}
                  />
                </div>
              )}
            />
          ))}
          {messages.length === 0 && (
            <div className='chatroom__empty'>
              <span className='shikitor-icon'>forum</span>
              <strong>{t('messenger.empty')}</strong>
              <span>{t('messenger.emptyHelp')}</span>
            </div>
          )}
        </div>
        <div className='message-sender'>
          <Avatar size='small'>Your</Avatar>
          <WithoutCoreEditor
            ref={shikitorRef}
            create={shikitorCreate}
            value={text}
            onChange={setText}
            options={composerOptions}
            plugins={composerPlugins}
            onColorChange={setComposerColors}
            onKeydown={event => {
              if (event.key === 'Enter' && event.metaKey && text.trim()) {
                event.preventDefault()
                sendMessage(text)
              }
            }}
          />
          <Button
            theme='primary'
            shape='square'
            size='small'
            disabled={!text.trim()}
            aria-label={t('messenger.send')}
            onClick={() => sendMessage(text)}
          >
            <span className='shikitor-icon'>arrow_upward</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
