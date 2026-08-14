import './index.scss'

import MarkdownItPluginShiki from '@shikijs/markdown-it'
import type { InputShikitorPlugin, Shikitor } from '@shikitor/core'
import provideCompletions from '@shikitor/core/plugins/provide-completions'
import providePopup from '@shikitor/core/plugins/provide-popup'
import provideSelectionToolbox from '@shikitor/core/plugins/provide-selection-toolbox'
import selectionToolboxForMd from '@shikitor/core/plugins/selection-toolbox-for-md'
import { WithoutCoreEditor } from '@shikitor/react'
import MarkdownIt from 'markdown-it'
import type { ClientOptions } from 'openai'
import OpenAI from 'openai'
import React, { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import type { BundledTheme } from 'shiki'
import { Avatar, Button, Input, Select, Switch } from 'tdesign-react'

import { ComponentCase, ConfigField, SwitchField } from '../../components/ComponentCase'
import { useQueries } from '../../hooks/useQueries'
import { useI18n } from '../../i18n'
import { useShikitorCreate } from '../../hooks/useShikitorCreate'
import type { IMessage, IUser } from './components/Message'
import { Message } from './components/Message'
import atUser from './plugins/at-user'

type MessageItem = IMessage & {
  hidden?: boolean
}
type CustomProperties = CSSProperties & Record<`--${string}`, string | number>

const currentUser = {
  name: 'YiJie'
} as IUser

type Bot = IUser & {
  description: string
}

const bots = {
  documentHelper: {
    name: 'Document Helper',
    avatar: `${import.meta.env.BASE_URL}favicon.svg`,
    description: 'A bot that helps document code and editing workflows.'
  }
} satisfies Record<string, Bot>

const initialMessages: MessageItem[] = [{
  text: 'Hi! Mention **@Shikitor** or select text in the composer to try its plugins.',
  user: bots.documentHelper,
  ctime: Date.now()
}]

function messageTransform(bot: Bot, message: MessageItem): OpenAI.ChatCompletionMessageParam {
  const isBot = message.user?.name === bot.name
  return {
    role: isBot ? 'assistant' : 'user',
    content: `${isBot ? '' : `${message.user?.name}:\n`}${message.text}`
  }
}

function readStoredConfig(): ClientOptions {
  try {
    return JSON.parse(
      localStorage.getItem('openai-config') ?? '{ "baseURL": "https://api.openai.com/v1" }'
    ) as ClientOptions
  } catch {
    return { baseURL: 'https://api.openai.com/v1' }
  }
}

export default function Messenger() {
  const { t } = useI18n()
  const queries = useQueries<{
    'messenger.composer.theme': BundledTheme
    'messenger.composer.mentions': string
    'messenger.composer.model': string
  }>()
  const theme = queries.value['messenger.composer.theme'] ?? 'github-light'
  const mentions = queries.value['messenger.composer.mentions'] !== 'false'
  const model = queries.value['messenger.composer.model'] ?? 'gpt-4o-mini'
  const isDark = theme.includes('dark')
  const shikitorCreate = useShikitorCreate()

  const [text, setText] = useState('')
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages)
  const [composerColors, setComposerColors] = useState({ bg: '#fff', fg: '#24292f' })
  const [config, setConfig] = useState<ClientOptions>(() => ({
    ...readStoredConfig(),
    dangerouslyAllowBrowser: true
  }))
  const openaiRef = useRef<OpenAI | null>(null)
  const shikitorRef = useRef<Shikitor>(null)
  const mdRef = useRef(MarkdownIt())

  useEffect(() => {
    if (!config.apiKey || !config.baseURL) {
      openaiRef.current = null
      return
    }
    openaiRef.current = new OpenAI(config)
    localStorage.setItem('openai-config', JSON.stringify(config))
  }, [config])

  useEffect(() => {
    MarkdownItPluginShiki({
      // @ts-ignore upstream plugin accepts bundled Shiki themes
      fallbackLanguage: 'text',
      themes: {
        light: theme,
        dark: theme
      }
    }).then(plugin => mdRef.current.use(plugin))
  }, [theme])

  const composerPlugins = useMemo(() => {
    const plugins: InputShikitorPlugin[] = [
      providePopup,
      [provideCompletions, {
        popupPlacement: 'top',
        footer: false
      }],
      provideSelectionToolbox,
      selectionToolboxForMd
    ]
    if (mentions) {
      plugins.splice(2, 0, [atUser, {
        targets: ['Shikitor', 'YiJie', 'Document Helper']
      }])
    }
    return plugins
  }, [mentions])

  const composerOptions = useMemo(() => ({
    theme,
    language: 'markdown' as const,
    lineNumbers: 'off' as const,
    highlightCurrentLine: false,
    placeholder: 'Write a message…',
    hideSelfCursorUsername: true,
    autoSize: { maxRows: 8 }
  }), [theme])

  const sendMessage = async (message: string) => {
    const newMessages = [...messages, {
      text: message,
      user: currentUser,
      ctime: Date.now()
    }] satisfies MessageItem[]
    setMessages(newMessages)
    setText('')

    if (!openaiRef.current) {
      window.setTimeout(() => {
        setMessages(current => [...current, {
          text: 'The composer interaction is working. Add an API key in the configuration panel to connect the assistant.',
          user: bots.documentHelper,
          ctime: Date.now()
        }])
      }, 350)
      return
    }

    const bot = bots.documentHelper
    const completions = await openaiRef.current.chat.completions.create({
      model,
      // eslint-disable-next-line camelcase
      max_tokens: 4096,
      messages: [
        {
          content: `Your name is "${bot.name}" and your description is "${bot.description}".`,
          role: 'system'
        },
        ...newMessages.map(messageTransform.bind(null, bot))
      ],
      stream: true
    })
    const streamedMessages = [...newMessages, {
      text: '',
      user: bot,
      ctime: Date.now()
    }]
    const latestMessage = streamedMessages[streamedMessages.length - 1]
    let streamMessage = ''
    for await (const { choices: [{ delta }] } of completions) {
      streamMessage += delta.content ?? ''
      latestMessage.text = streamMessage
      setMessages([...streamedMessages])
    }
  }

  return (
    <div className='messenger-examples'>
      <ComponentCase
        id='messenger-composer'
        index='01'
        title={t('messenger.title')}
        description={t('messenger.description')}
        tags={['Pattern', 'Cordis']}
        preview={(
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
                <Avatar size='small' image={bots.documentHelper.avatar}>DH</Avatar>
                <div>
                  <strong>{t('messenger.room')}</strong>
                  <span><i /> {t('messenger.online')}</span>
                </div>
              </div>
              <Button
                variant='text'
                shape='square'
                disabled={messages.length === 0}
                aria-label='Clear messages'
                onClick={() => setMessages([])}
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
                        dangerouslySetInnerHTML={{ __html: mdRef.current.render(value) }}
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
                    void sendMessage(text)
                  }
                }}
              />
              <Button
                theme='primary'
                shape='square'
                size='small'
                disabled={!text.trim()}
                aria-label='Send message'
                onClick={() => void sendMessage(text)}
              >
                <span className='shikitor-icon'>arrow_upward</span>
              </Button>
            </div>
          </div>
        )}
      >
        <ConfigField label={t('messenger.theme')} description={t('messenger.themeHelp')}>
          <Select
            value={theme}
            options={[
              { label: 'GitHub Light', value: 'github-light' },
              { label: 'GitHub Dark', value: 'github-dark' },
              { label: 'Vitesse Light', value: 'vitesse-light' },
              { label: 'Vitesse Dark', value: 'vitesse-dark' }
            ]}
            onChange={value => queries.set('messenger.composer.theme', value as string)}
          />
        </ConfigField>
        <SwitchField label={t('messenger.mentions')} description={t('messenger.mentionsHelp')}>
          <Switch
            size='small'
            value={mentions}
            onChange={value => queries.set('messenger.composer.mentions', String(value))}
          />
        </SwitchField>
        <ConfigField label={t('messenger.model')} description={t('messenger.modelHelp')}>
          <Select
            value={model}
            options={[
              { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
              { label: 'GPT-4o', value: 'gpt-4o' },
              { label: 'GPT-4.1 mini', value: 'gpt-4.1-mini' }
            ]}
            onChange={value => queries.set('messenger.composer.model', value as string)}
          />
        </ConfigField>
        <ConfigField label={t('messenger.apiKey')} description={t('messenger.apiKeyHelp')}>
          <Input
            type='password'
            value={config.apiKey ?? ''}
            placeholder='sk-…'
            onChange={value => setConfig(current => ({ ...current, apiKey: value }))}
          />
        </ConfigField>
        <ConfigField label={t('messenger.baseUrl')} description={t('messenger.baseUrlHelp')}>
          <Select
            filterable
            creatable
            value={config.baseURL ?? ''}
            options={[
              { label: 'OpenAI', value: 'https://api.openai.com/v1' },
              { label: 'AIProxy', value: 'https://api.aiproxy.io/v1' }
            ]}
            onChange={value => setConfig(current => ({ ...current, baseURL: value as string }))}
          />
        </ConfigField>
      </ComponentCase>
    </div>
  )
}
