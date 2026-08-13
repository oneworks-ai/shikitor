import './ComponentCase.scss'

import React, { type ReactNode, useEffect } from 'react'

export interface ComponentCaseProps {
  id: string
  index: string
  title: string
  description: string
  preview: ReactNode
  children: ReactNode
  tags?: string[]
}

export function ComponentCase({
  id,
  index,
  title,
  description,
  preview,
  children,
  tags = []
}: ComponentCaseProps) {
  useEffect(() => {
    if (decodeURIComponent(location.hash.slice(1)) !== id) return
    const target = document.getElementById(id)
    if (!target) return
    const scrollToTarget = () => target.scrollIntoView({ block: 'start' })
    const frame = requestAnimationFrame(scrollToTarget)
    const layout = target.parentElement
    const observer = layout && new ResizeObserver(scrollToTarget)
    if (layout) observer?.observe(layout)
    const settleTimers = [250, 900, 1800].map(delay => window.setTimeout(scrollToTarget, delay))
    const disconnectTimer = window.setTimeout(() => observer?.disconnect(), 2000)
    return () => {
      cancelAnimationFrame(frame)
      settleTimers.forEach(clearTimeout)
      clearTimeout(disconnectTimer)
      observer?.disconnect()
    }
  }, [id])
  return (
    <section className='component-case' id={id}>
      <a className='component-case__header' href={`#${id}`}>
        <div className='component-case__index'>{index}</div>
        <div className='component-case__heading'>
          <div className='component-case__title-row'>
            <h2>{title}</h2>
            {tags.map(tag => <span className='component-case__tag' key={tag}>{tag}</span>)}
          </div>
          <p>{description}</p>
        </div>
      </a>
      <div className='component-case__body'>
        <div className='component-case__preview'>{preview}</div>
        <aside className='component-case__controls'>
          <div className='component-case__control-list'>{children}</div>
        </aside>
      </div>
    </section>
  )
}

export function ConfigField({
  icon,
  label,
  description,
  value,
  children
}: {
  icon?: string
  label: string
  description?: string
  value?: ReactNode
  children: ReactNode
}) {
  return (
    <label className='config-field'>
      <span className='config-field__label'>
        <span className='config-field__label-main'>
          {icon && <span className='config-field__icon shikitor-icon' aria-hidden='true'>{icon}</span>}
          <span className='config-field__copy'>
            <strong>{label}</strong>
            {description && <small>{description}</small>}
          </span>
        </span>
        {value !== undefined && <code>{value}</code>}
      </span>
      <span className='config-field__control'>{children}</span>
    </label>
  )
}

export function SwitchField({
  icon,
  label,
  description,
  children
}: {
  icon?: string
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className='config-field config-field--inline'>
      <span className='config-field__label'>
        <span className='config-field__label-main'>
          {icon && <span className='config-field__icon shikitor-icon' aria-hidden='true'>{icon}</span>}
          <span className='config-field__copy'>
            <strong>{label}</strong>
            {description && <small>{description}</small>}
          </span>
        </span>
      </span>
      <span className='config-field__control'>{children}</span>
    </div>
  )
}

export function AdvancedConfig({
  label,
  children,
  defaultOpen = false
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details className='advanced-config' open={defaultOpen || undefined}>
      <summary className='advanced-config__summary'>
        <span className='advanced-config__summary-icon shikitor-icon' aria-hidden='true'>settings_suggest</span>
        <span>{label}</span>
        <span className='advanced-config__chevron shikitor-icon' aria-hidden='true'>expand_more</span>
      </summary>
      <div className='advanced-config__content'>{children}</div>
    </details>
  )
}

export function ConfigOption({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <span className='config-option'>
      <span className='config-option__icon shikitor-icon' aria-hidden='true'>{icon}</span>
      <span>{children}</span>
    </span>
  )
}
