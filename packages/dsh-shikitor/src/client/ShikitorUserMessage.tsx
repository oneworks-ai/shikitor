import type { ComponentType, MouseEvent, ReactNode } from 'react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { SessionId, UserMessageNode } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ChatNodeViewProps,
  ChatViewSlotProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives/src/markdown/JsonBlock.tsx'
import { MessageText } from '@deepseek-ai/dsh-client-ui-primitives/src/markdown/MessageText.tsx'
import {
  IconCheckOutline16,
  IconCopyOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives/src/icons/index.tsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives/src/Tooltip.tsx'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives/src/clipboard.ts'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { formatMessageClock } from '@deepseek-ai/dsh-client-ui-conversation/src/client/chat/message-chrome.ts'
import { useCalendarDay } from '@deepseek-ai/dsh-client-ui-conversation/src/client/chat/use-calendar-day.ts'
import messageCss from '../../../../vendors/deepseek-ai/deepseek-harness/packages/client/ui-conversation/src/client/chat/MessageItem.module.css'
import actionCss from '../../../../vendors/deepseek-ai/deepseek-harness/packages/client/ui-conversation/src/client/chat/MessageIconActions.module.css'
import imageCss from '../../../../vendors/deepseek-ai/deepseek-harness/packages/client/ui-attachment/src/MessageImage.module.css'

import { parseSessionLinks, type SessionLinkReference } from './sessionLinks.ts'
import { MaterialIcon } from './MaterialIcon.tsx'

type UserImage = Extract<UserMessageNode['content'][number], { type: 'image' }>

export type NativeUserMessageRenderer = ComponentType<ChatNodeViewProps<'user'>>

interface ShikitorUserMessageInjected {
  NativeUserMessage: NativeUserMessageRenderer
  openSession: (sessionId: SessionId) => void
}

type ShikitorUserMessageProps = ChatNodeViewProps<'user'> & InjectFace<ShikitorUserMessageInjected>

function contentParts(content: readonly unknown[]): {
  text: string
  images: { attachment: UserImage['attachment'] }[]
  rest: unknown[]
} {
  const texts: string[] = []
  const images: { attachment: UserImage['attachment'] }[] = []
  const rest: unknown[] = []
  for (const block of content) {
    const candidate = block as { type?: string; text?: string; attachment?: unknown }
    if (candidate.type === 'text' && typeof candidate.text === 'string') texts.push(candidate.text)
    else if (candidate.type === 'image' && candidate.attachment !== undefined) {
      images.push({ attachment: (candidate as UserImage).attachment })
    } else rest.push(block)
  }
  return { text: texts.join(''), images, rest }
}

function singleImageFit(attachment: UserImage['attachment']): {
  height: number
  objectPosition: string
  width: number
} {
  const natural = attachment.width / attachment.height
  const ratio = Math.min(4, Math.max(0.25, natural))
  const box = ratio >= 1 ? { width: 240, height: 240 / ratio } : { width: 240 * ratio, height: 240 }
  const scale = Math.min(1, attachment.width / box.width, attachment.height / box.height)
  return {
    width: Math.max(1, Math.round(box.width * scale)),
    height: Math.max(1, Math.round(box.height * scale)),
    objectPosition: natural < 0.25 ? 'center top' : natural > 4 ? 'left center' : 'center',
  }
}

function LinkedMessageImage({
  attachment,
  load,
  variant,
  t,
}: {
  attachment: UserImage['attachment']
  load: (attachment: UserImage['attachment']) => Promise<string>
  variant: 'single' | 'tile'
  t: ChatViewSlotProps['t']
}) {
  const [source, setSource] = useState<string>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const fit = variant === 'single' ? singleImageFit(attachment) : undefined
  useEffect(() => {
    let active = true
    setSource(undefined)
    setFailed(false)
    void load(attachment).then(value => {
      if (active) setSource(value)
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [attachment, attempt, load])

  const label = attachment.name ?? t('image.label')
  if (failed) {
    return (
      <button
        type="button"
        className={imageCss.error}
        data-variant={variant}
        onClick={() => { setAttempt(value => value + 1) }}
      >
        {t('image.loadFailed')}
      </button>
    )
  }
  return (
    <button
      type="button"
      className={imageCss.frame}
      data-variant={variant}
      style={fit === undefined ? undefined : { width: fit.width, height: fit.height }}
      title={t('image.openOriginal')}
      aria-label={t('image.openOriginalLabel', { label })}
      onClick={() => {
        if (source !== undefined) window.open(source, '_blank', 'noopener,noreferrer')
      }}
    >
      {source === undefined
        ? <span className={imageCss.loading}>{t('image.loading')}</span>
        : <img src={source} alt={label} style={fit === undefined ? undefined : { objectPosition: fit.objectPosition }} />}
    </button>
  )
}

function LinkedImageGallery({
  images,
  load,
  t,
}: {
  images: readonly { attachment: UserImage['attachment'] }[]
  load: (attachment: UserImage['attachment']) => Promise<string>
  t: ChatViewSlotProps['t']
}) {
  if (images.length === 0) return null
  const variant = images.length === 1 ? 'single' : 'tile'
  return (
    <div className={imageCss.gallery} data-align="end">
      {images.map((image, index) => (
        <LinkedMessageImage
          key={`${image.attachment.attachmentId}:${index}`}
          attachment={image.attachment}
          load={load}
          variant={variant}
          t={t}
        />
      ))}
    </div>
  )
}

function projectPlainText(text: string, keyPrefix: string): ReactNode {
  if (text === '') return null
  const pattern = /(^|\s)([/@][\w-]+)(?=\s|$)/gu
  const parts: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const tokenStart = match.index + (match[1]?.length ?? 0)
    const label = match[2] ?? ''
    if (tokenStart > cursor) {
      parts.push(<MessageText key={`${keyPrefix}:text:${cursor}`} text={text.slice(cursor, tokenStart)} />)
    }
    parts.push(
      <span
        key={`${keyPrefix}:ref:${tokenStart}`}
        className={messageCss.refChip}
        data-ref-chip={label.startsWith('@') ? 'subagent' : 'skill'}
      >
        {label}
      </span>,
    )
    cursor = tokenStart + label.length
  }
  if (parts.length === 0) return <MessageText text={text} />
  if (cursor < text.length) {
    parts.push(<MessageText key={`${keyPrefix}:text:${cursor}`} text={text.slice(cursor)} />)
  }
  return <>{parts}</>
}

function SessionMessageLink({
  reference,
  openSession,
}: {
  reference: SessionLinkReference
  openSession: (sessionId: SessionId) => void
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    openSession(reference.sessionId)
  }
  return (
    <a
      className="dsh-shikitor-message-session-link"
      href={reference.destination}
      title={reference.label}
      data-session-id={reference.sessionId}
      onClick={onClick}
    >
      <MaterialIcon name="chat_bubble" className="dsh-shikitor-message-session-link__icon" />
      <span className="dsh-shikitor-message-session-link__label">{reference.label}</span>
    </a>
  )
}

function UserMessageActions({
  text,
  time,
  t,
}: {
  text: string
  time?: number
  t: ChatViewSlotProps['t']
}) {
  const day = useCalendarDay()
  const [copied, setCopied] = useState(false)
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => {
    if (timer.current !== undefined) clearTimeout(timer.current)
  }, [])
  const copy = useCallback(() => {
    if (copied || pending.current) return
    pending.current = true
    void writeClipboard(text).then(ok => {
      pending.current = false
      if (!ok) return
      setCopied(true)
      timer.current = setTimeout(() => { setCopied(false) }, 1_000)
    })
  }, [copied, text])

  return (
    <div className={actionCss.actions}>
      {time !== undefined && (
        <span className={actionCss.timeStart}>{formatMessageClock(time, t, day)}</span>
      )}
      <Tooltip label={copied ? t('copied') : t('copy')} side="bottom">
        <button
          type="button"
          className={actionCss.action}
          aria-label={copied ? t('copied') : t('copy')}
          onClick={copy}
        >
          {copied ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
        </button>
      </Tooltip>
    </div>
  )
}

function projectUserText(
  text: string,
  references: readonly SessionLinkReference[],
  openSession: (sessionId: SessionId) => void,
): ReactNode {
  const parts: ReactNode[] = []
  let cursor = 0
  for (const reference of references) {
    if (reference.start > cursor) {
      parts.push(projectPlainText(text.slice(cursor, reference.start), `before:${cursor}`))
    }
    parts.push(
      <SessionMessageLink
        key={`session:${reference.start}`}
        reference={reference}
        openSession={openSession}
      />,
    )
    cursor = reference.end
  }
  if (cursor < text.length) parts.push(projectPlainText(text.slice(cursor), `after:${cursor}`))
  return <>{parts}</>
}

/** Shadow only linked user messages; all ordinary user nodes delegate to DSH's renderer. */
export const ShikitorUserMessage = memo(function ShikitorUserMessage({
  NativeUserMessage,
  openSession,
  ...nativeProps
}: ShikitorUserMessageProps) {
  const { node, loadImage, t } = nativeProps
  const { text, images, rest } = contentParts(node.data.content)
  const references = parseSessionLinks(text)
  if (references.length === 0) return <NativeUserMessage {...nativeProps} />

  const truncated = (total: number): string => t('json.truncated', { total })
  const showBubble = text !== '' || rest.length > 0
  return (
    <div className={messageCss.userRow} data-time-hover-root>
      <div className={messageCss.userStack}>
        <LinkedImageGallery
          images={images}
          load={loadImage}
          t={t}
        />
        {showBubble && (
          <div className={messageCss.bubble}>
            {projectUserText(text, references, openSession)}
            {rest.map((block, index) => (
              <JsonBlock
                key={index}
                label={t('message.extraBlock')}
                payload={block}
                truncatedLabel={truncated}
              />
            ))}
          </div>
        )}
      </div>
      <UserMessageActions
        text={text}
        time={node.data.time}
        t={t}
      />
    </div>
  )
})
