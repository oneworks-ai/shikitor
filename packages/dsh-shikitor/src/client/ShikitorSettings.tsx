import {
  IconChevronDownOutline14,
  IconDarkOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
  IconPlusOutline16,
  IconTrashOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives/src/icons/index.tsx'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives/src/Menu.tsx'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
  TranslateNS,
} from '@deepseek-ai/dsh-client-ui-slots'
import { useId, useRef, useState, type ReactNode } from 'react'

import {
  atomFileIconClasses,
  type ShikitorConfiguredFileIconRule,
  type ShikitorConfiguredFileIconSource,
} from './fileIcons.ts'
import { NS } from './locales.ts'
import {
  resolveSurfaceAppearance,
  type ShikitorAppearance,
  type ShikitorSurfaceAppearance,
  type ShikitorColorScheme,
  type ShikitorCursorStyle,
  type ShikitorFileIconMode,
  type ShikitorService,
  type ShikitorSurface,
  type ShikitorTheme,
} from './registry.ts'

interface SettingsInjected {
  hooks: {
    appearance: HostObservable<ShikitorAppearance>
    configuredFileIconRules: HostObservable<readonly ShikitorConfiguredFileIconRule[]>
  }
  runtime: ShikitorService
}

export type ShikitorSettingsProps = PropsRuntime<'settings.section'>
  & PropsLocale<typeof NS>
  & InjectFace<SettingsInjected>

function SelectField<T extends string>({
  id,
  label,
  hint,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: T
  options: readonly { icon?: ReactNode; label: string; value: T }[]
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.value === value)
  const selectedLabel = selected?.label ?? value
  return (
    <div className="dsh-shikitor-settings__field">
      <span className="dsh-shikitor-settings__field-copy">
        <strong id={`${id}-label`}>{label}</strong>
        <small id={`${id}-hint`}>{hint}</small>
      </span>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={options.map(option => ({
          id: option.value,
          label: option.label,
          ...(option.icon === undefined ? {} : { icon: option.icon }),
        }))}
        selectedId={value}
        onSelect={(next) => {
          setOpen(false)
          onChange(next as T)
        }}
        align="end"
        portal
        anchor={(
          <button
            id={id}
            type="button"
            className="dsh-shikitor-settings__selector"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-labelledby={`${id}-label ${id}-value ${id}-hint`}
            onClick={() => { setOpen(!open) }}
          >
            <span id={`${id}-value`} className="dsh-shikitor-settings__selector-value">
              {selected?.icon}
              {selectedLabel}
            </span>
            <IconChevronDownOutline14 className="dsh-shikitor-settings__selector-chevron" />
          </button>
        )}
      />
    </div>
  )
}

function TextField({
  id,
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <label className="dsh-shikitor-settings__field" htmlFor={id}>
      <span className="dsh-shikitor-settings__field-copy">
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <input
        id={id}
        className="dsh-shikitor-settings__input"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={event => { onChange(event.currentTarget.value) }}
      />
    </label>
  )
}

function SchemeField({
  id,
  value,
  onChange,
  t,
}: {
  id: string
  value: ShikitorColorScheme
  onChange: (value: ShikitorColorScheme) => void
  t: TranslateNS<typeof NS>
}) {
  const options = [
    { value: 'light', label: t('scheme.light'), Icon: IconLightOutline16 },
    { value: 'dark', label: t('scheme.dark'), Icon: IconDarkOutline16 },
    { value: 'auto', label: t('scheme.auto'), Icon: IconFollowsystemOutline16 },
  ] as const
  return (
    <div className="dsh-shikitor-settings__scheme" role="group" aria-labelledby={`${id}-label`}>
      <span className="dsh-shikitor-settings__field-copy">
        <strong id={`${id}-label`}>{t('scheme.label')}</strong>
        <small>{t('scheme.hint')}</small>
      </span>
      <div className="dsh-shikitor-settings__scheme-options">
        {options.map(({ value: option, label, Icon }) => (
          <button
            key={option}
            type="button"
            className="dsh-shikitor-settings__scheme-choice"
            aria-pressed={value === option}
            onClick={() => { onChange(option) }}
          >
            <Icon />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SwitchField({
  id,
  label,
  hint,
  checked,
  onChange,
  t,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
  t: TranslateNS<typeof NS>
}) {
  return (
    <div className="dsh-shikitor-settings__field">
      <span className="dsh-shikitor-settings__field-copy">
        <strong id={`${id}-label`}>{label}</strong>
        <small>{hint}</small>
      </span>
      <button
        id={id}
        className="dsh-shikitor-settings__toggle"
        type="button"
        role="switch"
        aria-labelledby={`${id}-label`}
        aria-checked={checked}
        onClick={() => { onChange(!checked) }}
      >
        {checked ? t('toggle.on') : t('toggle.off')}
      </button>
    </div>
  )
}

function SurfaceFields({
  idPrefix,
  value,
  onChange,
  t,
}: {
  idPrefix: string
  value: ShikitorSurfaceAppearance
  onChange: (update: Partial<ShikitorSurfaceAppearance>) => void
  t: TranslateNS<typeof NS>
}) {
  const themeOptions: readonly { label: string; value: ShikitorTheme }[] = [
    { label: t('theme.github'), value: 'github' },
    { label: t('theme.vitesse'), value: 'vitesse' },
    { label: t('theme.min'), value: 'min' },
  ]
  const cursorOptions: readonly { label: string; value: ShikitorCursorStyle }[] = [
    { label: t('cursor.line'), value: 'line' },
    { label: t('cursor.block'), value: 'block' },
    { label: t('cursor.underline'), value: 'underline' },
  ]
  return (
    <>
      <SchemeField
        id={`${idPrefix}-scheme`}
        value={value.colorScheme}
        t={t}
        onChange={colorScheme => { onChange({ colorScheme }) }}
      />
      <SelectField
        id={`${idPrefix}-theme`}
        label={t('theme.label')}
        hint={t('theme.hint')}
        value={value.theme}
        options={themeOptions}
        onChange={theme => { onChange({ theme }) }}
      />
      <SelectField
        id={`${idPrefix}-cursor`}
        label={t('cursor.label')}
        hint={t('cursor.hint')}
        value={value.cursor}
        options={cursorOptions}
        onChange={cursor => { onChange({ cursor }) }}
      />
    </>
  )
}

function OverrideReset({
  onReset,
  t,
}: {
  onReset: () => void
  t: TranslateNS<typeof NS>
}) {
  return (
    <div className="dsh-shikitor-settings__override-actions">
      <button type="button" className="dsh-shikitor-settings__reset" onClick={onReset}>
        {t('inherit.reset')}
      </button>
    </div>
  )
}

function newFileIconRule(): ShikitorConfiguredFileIconRule {
  const suffix = typeof crypto === 'undefined'
    ? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    : crypto.randomUUID()
  return { id: `rule-${suffix}`, pattern: '', source: 'atom', value: 'text-icon' }
}

function FileIconRules({
  rules,
  onChange,
  t,
}: {
  rules: readonly ShikitorConfiguredFileIconRule[]
  onChange: (rules: readonly ShikitorConfiguredFileIconRule[]) => void
  t: TranslateNS<typeof NS>
}) {
  const sourceOptions: readonly {
    label: string
    value: ShikitorConfiguredFileIconSource
  }[] = [
    { label: t('fileIconRule.source.atom'), value: 'atom' },
    { label: t('fileIconRule.source.image'), value: 'image' },
  ]
  const atomOptions = atomFileIconClasses.map(value => ({
    value,
    label: value.replace(/-icon$/u, ''),
    icon: <i className={`dsh-shikitor-file-icon icon ${value}`} aria-hidden="true" />,
  }))
  const update = (id: string, patch: Partial<ShikitorConfiguredFileIconRule>): void => {
    onChange(rules.map(rule => rule.id === id ? { ...rule, ...patch } : rule))
  }
  return (
    <div className="dsh-shikitor-settings__rules">
      <div className="dsh-shikitor-settings__rules-heading">
        <span className="dsh-shikitor-settings__field-copy">
          <strong>{t('fileIconRules.label')}</strong>
          <small>{t('fileIconRules.hint')}</small>
        </span>
        <button
          type="button"
          className="dsh-shikitor-settings__rule-add"
          onClick={() => { onChange([...rules, newFileIconRule()]) }}
        >
          <IconPlusOutline16 />
          {t('fileIconRules.add')}
        </button>
      </div>
      {rules.length === 0 && (
        <p className="dsh-shikitor-settings__rules-empty">{t('fileIconRules.empty')}</p>
      )}
      {rules.map((rule, index) => {
        const prefix = `dsh-shikitor-file-icon-rule-${index}`
        return (
          <section key={rule.id} className="dsh-shikitor-settings__rule-card">
            <header className="dsh-shikitor-settings__rule-header">
              <strong>{rule.pattern.trim() || t('fileIconRule.untitled', { index: index + 1 })}</strong>
              <button
                type="button"
                className="dsh-shikitor-settings__rule-remove"
                aria-label={t('fileIconRule.remove')}
                title={t('fileIconRule.remove')}
                onClick={() => { onChange(rules.filter(candidate => candidate.id !== rule.id)) }}
              >
                <IconTrashOutline16 />
              </button>
            </header>
            <TextField
              id={`${prefix}-pattern`}
              label={t('fileIconRule.pattern.label')}
              hint={t('fileIconRule.pattern.hint')}
              placeholder="apps/**/AGENTS.md"
              value={rule.pattern}
              onChange={pattern => { update(rule.id, { pattern }) }}
            />
            <SelectField
              id={`${prefix}-source`}
              label={t('fileIconRule.source.label')}
              hint={t('fileIconRule.source.hint')}
              value={rule.source}
              options={sourceOptions}
              onChange={(source) => {
                update(rule.id, {
                  source,
                  value: source === 'atom' ? 'text-icon' : '',
                })
              }}
            />
            {rule.source === 'atom'
              ? (
                  <SelectField
                    id={`${prefix}-atom`}
                    label={t('fileIconRule.atom.label')}
                    hint={t('fileIconRule.atom.hint')}
                    value={rule.value}
                    options={atomOptions}
                    onChange={value => { update(rule.id, { value }) }}
                  />
                )
              : (
                  <TextField
                    id={`${prefix}-image`}
                    label={t('fileIconRule.image.label')}
                    hint={t('fileIconRule.image.hint')}
                    placeholder=".icons/agent.svg"
                    value={rule.value}
                    onChange={value => { update(rule.id, { value }) }}
                  />
                )}
          </section>
        )
      })}
    </div>
  )
}

type SettingsTab = 'editor' | 'general' | 'sender'

/** Shikitor-owned settings page registered through DSH's public section slot. */
export function ShikitorSettings({
  runtime,
  t,
  useAppearance,
  useConfiguredFileIconRules,
}: ShikitorSettingsProps) {
  const tabsId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const appearance = useAppearance(value => value)
  const configuredFileIconRules = useConfiguredFileIconRules(value => value)
  const fileIconOptions: readonly { label: string; value: ShikitorFileIconMode }[] = [
    { label: t('fileIcons.colored'), value: 'colored' },
    { label: t('fileIcons.monochrome'), value: 'monochrome' },
    { label: t('fileIcons.hidden'), value: 'hidden' },
  ]
  const tabs: readonly { id: SettingsTab; label: string }[] = [
    { id: 'general', label: t('tab.general') },
    { id: 'sender', label: t('tab.sender') },
    { id: 'editor', label: t('tab.editor') },
  ]
  const surfacePanel = (surface: ShikitorSurface) => {
    const custom = surface === 'sender'
      ? appearance.sender !== null
      : appearance.editor.surface !== null
    return (
      <>
        <SurfaceFields
          idPrefix={`dsh-shikitor-${surface}`}
          value={resolveSurfaceAppearance(appearance, surface)}
          t={t}
          onChange={update => { runtime.configureSurface(surface, update) }}
        />
        {surface === 'editor' && (
          <>
            <SwitchField
              id="dsh-shikitor-editor-line-numbers"
              label={t('lineNumbers.label')}
              hint={t('lineNumbers.hint')}
              t={t}
              checked={appearance.editor.lineNumbers}
              onChange={lineNumbers => { runtime.configureAppearance({ editor: { lineNumbers } }) }}
            />
            <SwitchField
              id="dsh-shikitor-editor-current-line"
              label={t('currentLine.label')}
              hint={t('currentLine.hint')}
              t={t}
              checked={appearance.editor.highlightCurrentLine}
              onChange={highlightCurrentLine => {
                runtime.configureAppearance({ editor: { highlightCurrentLine } })
              }}
            />
          </>
        )}
        {custom && (
          <OverrideReset t={t} onReset={() => { runtime.resetSurface(surface) }} />
        )}
      </>
    )
  }

  return (
    <section className="dsh-shikitor-settings">
      <h2>{t('title')}</h2>
      <p className="dsh-shikitor-settings__intro">{t('intro')}</p>
      <div className="dsh-shikitor-settings__tabs" role="tablist" aria-label={t('tabs.label')}>
        {tabs.map((tab, index) => {
          const selected = tab.id === activeTab
          return (
            <button
              key={tab.id}
              ref={(element) => { tabRefs.current[index] = element }}
              id={`${tabsId}-tab-${tab.id}`}
              type="button"
              role="tab"
              className="dsh-shikitor-settings__tab"
              aria-selected={selected}
              aria-controls={`${tabsId}-panel-${tab.id}`}
              data-active={selected ? 'true' : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => { setActiveTab(tab.id) }}
              onKeyDown={(event) => {
                let nextIndex: number
                switch (event.key) {
                  case 'ArrowRight': nextIndex = (index + 1) % tabs.length; break
                  case 'ArrowLeft': nextIndex = (index - 1 + tabs.length) % tabs.length; break
                  case 'Home': nextIndex = 0; break
                  case 'End': nextIndex = tabs.length - 1; break
                  default: return
                }
                event.preventDefault()
                const next = tabs[nextIndex]!
                setActiveTab(next.id)
                tabRefs.current[nextIndex]?.focus()
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div
        id={`${tabsId}-panel-${activeTab}`}
        className="dsh-shikitor-settings__panel"
        role="tabpanel"
        aria-labelledby={`${tabsId}-tab-${activeTab}`}
      >
        {activeTab === 'general' && (
          <>
            <SurfaceFields
              idPrefix="dsh-shikitor-general"
              value={appearance.general}
              t={t}
              onChange={general => { runtime.configureAppearance({ general }) }}
            />
            <SelectField
              id="dsh-shikitor-file-icons"
              label={t('fileIcons.label')}
              hint={t('fileIcons.hint')}
              value={appearance.fileIcons}
              options={fileIconOptions}
              onChange={fileIcons => { runtime.configureAppearance({ fileIcons }) }}
            />
            <FileIconRules
              rules={configuredFileIconRules}
              t={t}
              onChange={rules => { runtime.configureFileIconRules(rules) }}
            />
          </>
        )}
        {activeTab === 'sender' && surfacePanel('sender')}
        {activeTab === 'editor' && surfacePanel('editor')}
      </div>
    </section>
  )
}
