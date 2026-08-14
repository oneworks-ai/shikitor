import './ComponentCase.scss'

import React, {
  Children,
  Fragment,
  isValidElement,
  type ReactNode,
  useEffect,
  useState
} from 'react'

import { useI18n } from '../i18n'

export interface ComponentCaseProps {
  id: string
  index: string
  title: string
  description: string
  preview: ReactNode
  children: ReactNode
  tags?: string[]
  plugins?: readonly string[]
}

type ComponentCasePanel = 'advanced' | 'configuration' | 'plugins'

function splitCaseChildren(children: ReactNode) {
  const configuration: ReactNode[] = []
  const advanced: ReactNode[] = []
  const visit = (child: ReactNode) => {
    if (isValidElement<{ children?: ReactNode }>(child)) {
      if (child.type === AdvancedConfig) {
        Children.forEach(child.props.children, item => advanced.push(item))
        return
      }
      if (child.type === Fragment) {
        Children.forEach(child.props.children, visit)
        return
      }
    }
    configuration.push(child)
  }
  Children.forEach(children, visit)
  return { advanced, configuration }
}

export function ComponentCase({
  id,
  index,
  title,
  description,
  preview,
  children,
  tags = [],
  plugins = []
}: ComponentCaseProps) {
  const { t } = useI18n()
  const { advanced, configuration } = splitCaseChildren(children)
  const hasAdvanced = advanced.length > 0
  const hasPlugins = plugins.length > 0
  const panels: ComponentCasePanel[] = [
    'configuration',
    ...(hasAdvanced ? ['advanced' as const] : []),
    ...(hasPlugins ? ['plugins' as const] : [])
  ]
  const [activePanel, setActivePanel] = useState<ComponentCasePanel>('configuration')
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
  useEffect(() => {
    const panelStillExists = activePanel === 'configuration'
      || (activePanel === 'advanced' && hasAdvanced)
      || (activePanel === 'plugins' && hasPlugins)
    if (!panelStillExists) setActivePanel('configuration')
  }, [activePanel, hasAdvanced, hasPlugins])
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
          {panels.length > 1 && (
            <div
              className={`component-case__tabs component-case__tabs--${panels.length}`}
              role='tablist'
            >
              <button
                type='button'
                role='tab'
                aria-selected={activePanel === 'configuration'}
                className={activePanel === 'configuration' ? 'is-active' : ''}
                onClick={() => setActivePanel('configuration')}
              >
                <span className='shikitor-icon' aria-hidden='true'>tune</span>
                {t('case.configuration')}
              </button>
              {hasAdvanced && (
                <button
                  type='button'
                  role='tab'
                  aria-selected={activePanel === 'advanced'}
                  className={activePanel === 'advanced' ? 'is-active' : ''}
                  onClick={() => setActivePanel('advanced')}
                >
                  <span className='shikitor-icon' aria-hidden='true'>settings_suggest</span>
                  {t('case.advanced')}
                </button>
              )}
              {hasPlugins && (
                <button
                  type='button'
                  role='tab'
                  aria-selected={activePanel === 'plugins'}
                  className={activePanel === 'plugins' ? 'is-active' : ''}
                  onClick={() => setActivePanel('plugins')}
                >
                  <span className='shikitor-icon' aria-hidden='true'>extension</span>
                  {t('case.plugins')}
                  <span className='component-case__tab-count'>{plugins.length}</span>
                </button>
              )}
            </div>
          )}
          <div
            className='component-case__panel'
            role={panels.length > 1 ? 'tabpanel' : undefined}
            hidden={panels.length > 1 && activePanel !== 'configuration'}
          >
            <div className='component-case__control-list'>{configuration}</div>
          </div>
          {hasAdvanced && (
            <div
              className='component-case__panel'
              role='tabpanel'
              hidden={activePanel !== 'advanced'}
            >
              <div className='component-case__control-list'>{advanced}</div>
            </div>
          )}
          {hasPlugins && (
            <div
              className='component-case__panel component-case__panel--plugins'
              role='tabpanel'
              hidden={activePanel !== 'plugins'}
            >
              <div className='component-case__plugin-list'>
                {plugins.map(plugin => (
                  <div className='component-case__plugin' key={plugin}>
                    <span className='shikitor-icon' aria-hidden='true'>extension</span>
                    <code>{plugin}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
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
