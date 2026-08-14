import './index.scss'

import {
  formatAriaKeyShortcut,
  formatBinding,
  type InputShikitorPlugin,
  type InputPlatform,
  type Shikitor
} from '@shikitor/core'
import { WithoutCoreEditor } from '@shikitor/react'
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import { Button, Radio, Select, Switch } from 'tdesign-react'

import {
  AdvancedConfig,
  ComponentCase,
  ConfigField,
  ConfigOption,
  SwitchField
} from '../../components/ComponentCase'
import { useShikitorCreate } from '../../hooks/useShikitorCreate'
import { useQueries } from '../../hooks/useQueries'
import { useI18n } from '../../i18n'
import contextMenuPlugin, {
  type ContextMenuItem
} from '@shikitor/core/plugins/context-menu'
import provideKeyboard from '@shikitor/core/plugins/provide-keyboard'
import providePointer from '@shikitor/core/plugins/provide-pointer'
import provideTextInput from '@shikitor/core/plugins/provide-text-input'
import {
  createInputEventsRuntime,
  type InputEventsBindingOverride,
  type InputEventsConfig,
  type InputEventsPresetId,
  type InputEventsSnapshot,
  type InputEventsTraceEntry
} from './runtime'

const sampleCode = `type InputAction = {
  id: string
  run(): void
}

export function registerInput(action: InputAction) {
  return action.run()
}`

type TraceMode = 'normalized' | 'raw'
type EventChannel = 'pointer' | 'mouse' | 'both'
type CaseKind = 'pointer' | 'contextmenu' | 'keyboard' | 'combinations' | 'platform'

const caseMeta: Record<CaseKind, {
  id: string
  index: string
  title: string
  description: string
  tags: string[]
}> = {
  pointer: {
    id: 'input-events-pointer',
    index: '01',
    title: 'input.pointer.title',
    description: 'input.pointer.description',
    tags: ['Pointer', 'Mouse']
  },
  contextmenu: {
    id: 'input-events-context-menu',
    index: '02',
    title: 'input.contextmenu.title',
    description: 'input.contextmenu.description',
    tags: ['Context menu', 'Cordis']
  },
  keyboard: {
    id: 'input-events-keyboard',
    index: '03',
    title: 'input.keyboard.title',
    description: 'input.keyboard.description',
    tags: ['Keyboard', 'IME']
  },
  combinations: {
    id: 'input-events-combinations',
    index: '04',
    title: 'input.combinations.title',
    description: 'input.combinations.description',
    tags: ['Bindings', 'Cordis']
  },
  platform: {
    id: 'input-events-platform',
    index: '05',
    title: 'input.platform.title',
    description: 'input.platform.description',
    tags: ['Platform', 'Mod']
  }
}

function modifierText(entry: InputEventsTraceEntry) {
  const labels = [
    entry.modifiers.mod && 'Mod',
    entry.modifiers.control && 'Ctrl',
    entry.modifiers.meta && 'Meta',
    entry.modifiers.alt && 'Alt',
    entry.modifiers.shift && 'Shift',
    entry.modifiers.altGraph && 'AltGr'
  ].filter(Boolean)
  return labels.join('+') || '—'
}

function actionTranslationKey(actionId: string) {
  switch (actionId) {
    case 'go-to-definition': return 'input.action.goToDefinition'
    case 'inspect-context': return 'input.action.inspectContext'
    case 'open-command-palette': return 'input.action.commandPalette'
    case 'shikitor-context-menu.open': return 'input.action.contextMenu'
    default: return 'input.action.saveFile'
  }
}

function readQueryBoolean(
  query: Record<string, string>,
  key: string,
  fallback = true
) {
  return query[key] === undefined ? fallback : query[key] !== 'false'
}

function eventDetail(entry: InputEventsTraceEntry, mode: TraceMode) {
  if (mode === 'raw') {
    return JSON.stringify(
      entry.keyboard ?? entry.pointer ?? entry.mouse ?? entry.wheel
        ?? entry.input ?? entry.composition ?? { type: entry.type }
    )
  }
  const parts = [
    entry.keyboard && `${entry.keyboard.key} · ${entry.keyboard.code}`,
    entry.pointer?.button && `${entry.pointer.pointerType ?? 'pointer'} · ${entry.pointer.button}`,
    entry.mouse?.button && `mouse · ${entry.mouse.button}`,
    entry.input && `${entry.input.inputType} · ${entry.input.data ?? '∅'}`,
    entry.composition && `composition · ${entry.composition.data || '∅'}`,
    entry.target.line !== undefined && `L${entry.target.line}`
  ].filter(Boolean)
  return parts.join(' · ') || entry.target.zone
}

function allowEntry(
  kind: CaseKind,
  entry: InputEventsTraceEntry,
  channel: EventChannel,
  motion: boolean,
  contextMenu: boolean,
  keyEvents: boolean,
  textInput: boolean,
  composition: boolean,
  repeat: boolean
) {
  if (kind === 'pointer') {
    if (!contextMenu && entry.type === 'contextmenu') return false
    if (!motion && ['pointermove', 'mousemove', 'pointerenter', 'pointerleave', 'mouseenter', 'mouseleave'].includes(entry.type)) return false
    if (channel === 'pointer') return entry.type.startsWith('pointer') || ['click', 'dblclick', 'auxclick', 'contextmenu', 'wheel'].includes(entry.type)
    if (channel === 'mouse') return entry.type.startsWith('mouse') || ['click', 'dblclick', 'auxclick', 'contextmenu', 'wheel'].includes(entry.type)
    return entry.type.startsWith('pointer') || entry.type.startsWith('mouse') || ['click', 'dblclick', 'auxclick', 'contextmenu', 'wheel'].includes(entry.type)
  }
  if (kind === 'keyboard') {
    if (entry.keyboard) return keyEvents && (repeat || !entry.keyboard.repeat)
    if (entry.input) return textInput
    if (entry.composition) return composition
    return false
  }
  if (kind === 'contextmenu') return entry.type === 'contextmenu'
  return true
}

function TracePanel({
  snapshot,
  paused,
  mode,
  entries,
  editor,
  onPause,
  onClear,
  t
}: {
  snapshot: InputEventsSnapshot
  paused: boolean
  mode: TraceMode
  entries: readonly InputEventsTraceEntry[]
  editor: React.ReactNode
  onPause(): void
  onClear(): void
  t(key: string, params?: Record<string, string | number>): string
}) {
  return (
    <div className='input-events-workbench'>
      <div className='input-events-editor'>
        <div className='input-events-editor__slot'>{editor}</div>
      </div>
      {snapshot.lastAction && (
        <div className='input-events-action' role='status' aria-live='polite'>
          <span className='shikitor-icon'>task_alt</span>
          <strong>{t(actionTranslationKey(snapshot.lastAction.actionId))}</strong>
          <span>{snapshot.lastAction.eventType} · {snapshot.lastAction.target}</span>
        </div>
      )}
      <section className='input-events-trace'>
        <header>
          <span><i className='shikitor-icon'>data_object</i>{t('input.common.trace')}</span>
          <span>{t('input.common.eventCount', { count: entries.length })}</span>
        </header>
        <div className='input-events-trace__toolbar'>
          <Button size='small' variant='text' icon={<span className='shikitor-icon'>{paused ? 'play_arrow' : 'pause'}</span>} onClick={onPause}>
            {t(paused ? 'input.common.resume' : 'input.common.pause')}
          </Button>
          <Button size='small' variant='text' icon={<span className='shikitor-icon'>delete_sweep</span>} onClick={onClear}>
            {t('input.common.clear')}
          </Button>
        </div>
        <div className='input-events-trace__list'>
          {entries.length === 0
            ? <div className='input-events-trace__empty'><span className='shikitor-icon'>gesture</span>{t('input.common.emptyTrace')}</div>
            : [...entries].reverse().slice(0, 14).map(entry => (
                <article key={entry.id} className={entry.handled ? 'is-handled' : ''}>
                  <span className='input-events-trace__type'>{entry.type}</span>
                  <strong>{eventDetail(entry, mode)}</strong>
                  <small>{entry.target.zone} · {modifierText(entry)}</small>
                  {entry.handledActionId && <em>{t(actionTranslationKey(entry.handledActionId))}</em>}
                </article>
              ))}
        </div>
      </section>
    </div>
  )
}

function InputEventCase({ kind }: { kind: CaseKind }) {
  const { t } = useI18n()
  const queries = useQueries<Record<string, string>>()
  const query = queries.value
  const create = useShikitorCreate()
  const runtime = useMemo(() => createInputEventsRuntime(), [])
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  const [value, setValue] = useState(sampleCode)
  const [contextMenuAction, setContextMenuAction] = useState<string>()
  const [editorColors, setEditorColors] = useState({
    bg: query.theme === 'light' ? '#fff' : '#0d1117',
    fg: query.theme === 'light' ? '#24292f' : '#e6edf3'
  })
  const [paused, setPaused] = useState(false)
  const [pausedTrace, setPausedTrace] = useState<readonly InputEventsTraceEntry[]>([])
  const mode: TraceMode = query[`code-editor.events.${kind}.trace`] === 'raw' ? 'raw' : 'normalized'
  const channel: EventChannel = ['pointer', 'mouse'].includes(query['code-editor.events.pointer.channel'])
    ? query['code-editor.events.pointer.channel'] as EventChannel
    : 'both'
  const pointerButton = ['secondary', 'auxiliary', 'back', 'forward'].includes(query['code-editor.events.pointer.button'])
    ? query['code-editor.events.pointer.button'] as 'secondary' | 'auxiliary' | 'back' | 'forward'
    : 'primary'
  const motion = readQueryBoolean(query, 'code-editor.events.pointer.motion')
  const contextMenu = readQueryBoolean(query, 'code-editor.events.pointer.context')
  const contextMenuEnabled = readQueryBoolean(query, 'code-editor.events.contextmenu.enabled')
  const contextMenuKeyboard = readQueryBoolean(query, 'code-editor.events.contextmenu.keyboard')
  const keyEvents = readQueryBoolean(query, 'code-editor.events.keyboard.keys')
  const textInput = readQueryBoolean(query, 'code-editor.events.keyboard.text')
  const composition = readQueryBoolean(query, 'code-editor.events.keyboard.composition')
  const repeat = readQueryBoolean(query, 'code-editor.events.keyboard.repeat', false)
  const consume = readQueryBoolean(query, 'code-editor.events.combinations.consume')
  const enabled = useMemo<Record<InputEventsPresetId, boolean>>(() => {
    const active = kind === 'combinations'
      ? (id: InputEventsPresetId) => readQueryBoolean(
          query,
          `code-editor.events.combinations.${id}`
        )
      : () => true
    return {
      'mod-primary-click': active('mod-primary-click'),
      'control-context-menu': active('control-context-menu'),
      'command-palette': active('command-palette'),
      'save-file': active('save-file')
    }
  }, [kind, query])
  const previewPlatform = ['macos', 'windows', 'linux', 'unknown'].includes(query['code-editor.events.platform.preview'])
    ? query['code-editor.events.platform.preview'] as InputPlatform
    : 'auto'
  const selectedPlatform = previewPlatform === 'auto' ? snapshot.platform : previewPlatform
  const contextMenuItems = useMemo<readonly ContextMenuItem[]>(() => [
    {
      id: 'definition',
      icon: 'arrow_circle_right',
      label: t('input.contextmenu.definition'),
      shortcut: 'F12',
      onSelect: () => setContextMenuAction(t('input.contextmenu.definition'))
    },
    {
      id: 'references',
      icon: 'manage_search',
      label: t('input.contextmenu.references'),
      shortcut: '⇧ F12',
      onSelect: () => setContextMenuAction(t('input.contextmenu.references'))
    },
    {
      id: 'copy-symbol',
      icon: 'content_copy',
      label: t('input.contextmenu.copySymbol'),
      shortcut: 'Mod C',
      onSelect: () => setContextMenuAction(t('input.contextmenu.copySymbol'))
    }
  ], [t])
  const plugins = useMemo<InputShikitorPlugin[]>(() => [
    ...(kind === 'pointer'
      ? [providePointer]
      : kind === 'keyboard'
        ? [provideKeyboard, provideTextInput]
        : [providePointer, provideKeyboard]),
    runtime.plugin,
    ...(kind === 'contextmenu' && contextMenuEnabled
      ? [[contextMenuPlugin, {
          ariaLabel: t('input.contextmenu.ariaLabel'),
          items: contextMenuItems,
          sources: contextMenuKeyboard ? ['pointer', 'keyboard'] : ['pointer']
        }] as const]
      : [])
  ], [contextMenuEnabled, contextMenuItems, contextMenuKeyboard, kind, runtime, t])
  const options = useMemo(() => ({
    language: 'typescript' as const,
    theme: query.theme === 'light' ? 'github-light' as const : 'github-dark' as const,
    lineNumbers: 'on' as const,
    hideSelfCursorUsername: true,
    input: kind === 'platform' && previewPlatform !== 'auto'
      ? { platform: previewPlatform }
      : undefined
  }), [kind, previewPlatform, query.theme])
  const editorRef = useRef<Shikitor>()
  const ariaKeyShortcuts = useMemo(() => snapshot.bindings
    .filter(binding => binding.enabled)
    .map(({ binding }) => formatAriaKeyShortcut(binding, snapshot.platform))
    .filter((value): value is string => !!value)
    .join(' '), [snapshot.bindings, snapshot.platform])

  useEffect(() => {
    const relevant = kind === 'pointer'
      ? new Set<InputEventsPresetId>(['mod-primary-click'])
      : kind === 'keyboard'
        ? new Set<InputEventsPresetId>(['command-palette', 'save-file'])
        : kind === 'contextmenu'
          ? new Set<InputEventsPresetId>()
          : new Set<InputEventsPresetId>(['mod-primary-click', 'control-context-menu', 'command-palette', 'save-file'])
    const config: InputEventsConfig = {
      bindings: Object.entries(enabled).map(([id, active]) => ({
        id: id as InputEventsPresetId,
        enabled: active && relevant.has(id as InputEventsPresetId),
        ...(kind === 'combinations'
          ? {
              policy: consume
                ? { preventDefault: 'handled' as const, stopPropagation: 'handled' as const }
                : { preventDefault: 'never' as const, stopPropagation: 'never' as const }
            }
          : {})
      })) as InputEventsBindingOverride[]
    }
    if (kind === 'pointer') {
      config.bindings = [
        ...(config.bindings ?? []),
        {
          id: 'mod-primary-click',
          enabled: enabled['mod-primary-click'],
          trigger: channel === 'pointer'
            ? { type: 'pointerdown', button: pointerButton }
            : channel === 'mouse'
              ? { type: 'mousedown', button: pointerButton }
              : pointerButton === 'secondary'
                ? { type: 'contextmenu', source: 'pointer' }
                : pointerButton === 'auxiliary'
                  ? { type: 'auxclick', button: 'auxiliary', source: 'pointer' }
                  : { type: 'click', button: pointerButton, source: 'pointer' }
        }
      ]
    }
    if (kind === 'keyboard') {
      config.bindings = [
        ...(config.bindings ?? []),
        {
          id: 'command-palette',
          trigger: { type: 'keydown', key: 'p', code: 'KeyP', repeat: repeat ? 'allow' : 'ignore', composing: 'ignore' }
        },
        {
          id: 'save-file',
          trigger: { type: 'keydown', key: 's', code: 'KeyS', repeat: repeat ? 'allow' : 'ignore', composing: 'ignore' }
        }
      ]
    }
    runtime.updateConfig(config)
  }, [channel, consume, enabled, kind, pointerButton, repeat, runtime])

  const handleMounted = useCallback((editor: Shikitor) => {
    editorRef.current = editor
    const shortcuts = runtime.getSnapshot().bindings
      .filter(binding => binding.enabled)
      .map(({ binding }) => formatAriaKeyShortcut(binding, editor.input.platform))
      .filter((value): value is string => !!value)
    const textarea = editor.element.querySelector('textarea')
    if (shortcuts.length) textarea?.setAttribute('aria-keyshortcuts', shortcuts.join(' '))
    else textarea?.removeAttribute('aria-keyshortcuts')
  }, [runtime])
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const textarea = editor.element.querySelector('textarea')
    if (ariaKeyShortcuts) textarea?.setAttribute('aria-keyshortcuts', ariaKeyShortcuts)
    else textarea?.removeAttribute('aria-keyshortcuts')
  }, [ariaKeyShortcuts])
  const togglePaused = () => {
    if (!paused) setPausedTrace(snapshot.trace)
    setPaused(value => !value)
  }
  const visibleTrace = (paused ? pausedTrace : snapshot.trace).filter(entry => allowEntry(
    kind, entry, channel, motion, contextMenu, keyEvents, textInput, composition, repeat
  ))
  const meta = caseMeta[kind]
  const updatePreset = (id: InputEventsPresetId, active: boolean) => {
    queries.set(`code-editor.events.combinations.${id}`, String(active))
  }
  const editorNode = (
    <WithoutCoreEditor
      key={kind === 'platform' ? previewPlatform : kind}
      className='input-events-editor__core'
      create={create}
      value={value}
      onChange={setValue}
      options={options}
      plugins={plugins}
      onMounted={handleMounted}
      onColorChange={setEditorColors}
    />
  )

  return (
    <ComponentCase
      id={meta.id}
      index={meta.index}
      title={t(meta.title)}
      description={t(meta.description)}
      tags={meta.tags}
      plugins={kind === 'contextmenu'
        ? ['provide-pointer', 'provide-keyboard', 'shikitor-context-menu']
        : kind === 'pointer'
          ? ['provide-pointer']
          : kind === 'keyboard'
            ? ['provide-keyboard', 'provide-text-input']
            : ['provide-pointer', 'provide-keyboard']}
      preview={(
        <div
          className='input-events-preview'
          style={{
            '--editor-bg': editorColors.bg || (query.theme === 'light' ? '#fff' : '#0d1117'),
            '--editor-fg': editorColors.fg || (query.theme === 'light' ? '#24292f' : '#e6edf3')
          } as React.CSSProperties & Record<`--${string}`, string>}
        >
          <TracePanel
            snapshot={snapshot}
            paused={paused}
            mode={mode}
            entries={visibleTrace}
            editor={editorNode}
            onPause={togglePaused}
            onClear={() => {
              runtime.clearTrace()
              setPausedTrace([])
            }}
            t={t}
          />
        </div>
      )}
    >
      {kind === 'pointer' && <>
        <ConfigField icon='conversion_path' label={t('input.pointer.eventChannel')} description={t('input.pointer.eventChannelHelp')}>
          <Radio.Group variant='default-filled' value={channel} onChange={value => queries.set('code-editor.events.pointer.channel', value as string)} options={[
            { label: <ConfigOption icon='ads_click'>{t('input.pointer.pointer')}</ConfigOption>, value: 'pointer' },
            { label: <ConfigOption icon='mouse'>{t('input.pointer.mouse')}</ConfigOption>, value: 'mouse' },
            { label: <ConfigOption icon='join'>{t('input.pointer.both')}</ConfigOption>, value: 'both' }
          ]} />
        </ConfigField>
        <ConfigField icon='ads_click' label={t('input.pointer.button')} description={t('input.pointer.buttonHelp')}>
          <Radio.Group variant='default-filled' value={pointerButton} onChange={value => queries.set('code-editor.events.pointer.button', value as string)} options={[
            { label: <ConfigOption icon='left_click'>{t('input.pointer.primary')}</ConfigOption>, value: 'primary' },
            { label: <ConfigOption icon='right_click'>{t('input.pointer.secondary')}</ConfigOption>, value: 'secondary' },
            { label: <ConfigOption icon='mouse'>{t('input.pointer.auxiliary')}</ConfigOption>, value: 'auxiliary' }
          ]} />
        </ConfigField>
        <SwitchField icon='open_with' label={t('input.pointer.motion')} description={t('input.pointer.motionHelp')}><Switch size='small' value={motion} onChange={value => queries.set('code-editor.events.pointer.motion', String(value))} /></SwitchField>
        <AdvancedConfig label={t('input.common.advanced')}>
          <SwitchField icon='menu_open' label={t('input.pointer.contextMenu')} description={t('input.pointer.contextMenuHelp')}><Switch size='small' value={contextMenu} onChange={value => queries.set('code-editor.events.pointer.context', String(value))} /></SwitchField>
          <ConfigField icon='visibility' label={t('input.common.trace')}>
            <Radio.Group variant='default-filled' value={mode} onChange={value => queries.set(`code-editor.events.${kind}.trace`, value as string)} options={[
              { label: t('input.common.normalized'), value: 'normalized' },
              { label: t('input.common.raw'), value: 'raw' }
            ]} />
          </ConfigField>
        </AdvancedConfig>
      </>}
      {kind === 'contextmenu' && <>
        <SwitchField icon='menu_open' label={t('input.contextmenu.enabled')} description={t('input.contextmenu.enabledHelp')}>
          <Switch size='small' value={contextMenuEnabled} onChange={value => queries.set('code-editor.events.contextmenu.enabled', String(value))} />
        </SwitchField>
        <SwitchField icon='keyboard' label={t('input.contextmenu.keyboard')} description={t('input.contextmenu.keyboardHelp')}>
          <Switch size='small' value={contextMenuKeyboard} onChange={value => queries.set('code-editor.events.contextmenu.keyboard', String(value))} />
        </SwitchField>
        <ConfigField icon='task_alt' label={t('input.contextmenu.lastAction')} description={t('input.contextmenu.hint')}>
          <div className={`input-events-context-result${contextMenuAction ? ' is-active' : ''}`}>
            <span className='shikitor-icon'>{contextMenuAction ? 'check_circle' : 'right_click'}</span>
            {contextMenuAction ?? t('input.contextmenu.waiting')}
          </div>
        </ConfigField>
        <AdvancedConfig label={t('input.common.advanced')}>
          <ConfigField icon='visibility' label={t('input.common.trace')}>
            <Radio.Group variant='default-filled' value={mode} onChange={value => queries.set(`code-editor.events.${kind}.trace`, value as string)} options={[
              { label: t('input.common.normalized'), value: 'normalized' },
              { label: t('input.common.raw'), value: 'raw' }
            ]} />
          </ConfigField>
        </AdvancedConfig>
      </>}
      {kind === 'keyboard' && <>
        <SwitchField icon='keyboard' label={t('input.keyboard.keyEvents')} description={t('input.keyboard.keyEventsHelp')}><Switch size='small' value={keyEvents} onChange={value => queries.set('code-editor.events.keyboard.keys', String(value))} /></SwitchField>
        <SwitchField icon='text_fields' label={t('input.keyboard.textInput')} description={t('input.keyboard.textInputHelp')}><Switch size='small' value={textInput} onChange={value => queries.set('code-editor.events.keyboard.text', String(value))} /></SwitchField>
        <AdvancedConfig label={t('input.common.advanced')}>
          <SwitchField icon='translate' label={t('input.keyboard.composition')} description={t('input.keyboard.compositionHelp')}><Switch size='small' value={composition} onChange={value => queries.set('code-editor.events.keyboard.composition', String(value))} /></SwitchField>
          <SwitchField icon='keyboard_double_arrow_down' label={t('input.keyboard.repeat')} description={t('input.keyboard.repeatHelp')}><Switch size='small' value={repeat} onChange={value => queries.set('code-editor.events.keyboard.repeat', String(value))} /></SwitchField>
          <ConfigField icon='visibility' label={t('input.common.trace')}><Radio.Group variant='default-filled' value={mode} onChange={value => queries.set(`code-editor.events.${kind}.trace`, value as string)} options={[{ label: t('input.common.normalized'), value: 'normalized' }, { label: t('input.common.raw'), value: 'raw' }]} /></ConfigField>
        </AdvancedConfig>
      </>}
      {kind === 'combinations' && <>
        {([
          ['mod-primary-click', 'ads_click', 'input.combinations.modClick', 'input.combinations.modClickHelp'],
          ['control-context-menu', 'contextual_token', 'input.combinations.controlMenu', 'input.combinations.controlMenuHelp'],
          ['command-palette', 'terminal', 'input.combinations.commandPalette', 'input.combinations.commandPaletteHelp'],
          ['save-file', 'save', 'input.combinations.save', 'input.combinations.saveHelp']
        ] as const).map(([id, icon, label, help]) => (
          <SwitchField key={id} icon={icon} label={t(label)} description={t(help)}><Switch size='small' value={enabled[id]} onChange={value => updatePreset(id, value)} /></SwitchField>
        ))}
        <AdvancedConfig label={t('input.common.advanced')}>
          <SwitchField icon='block' label={t('input.combinations.preventDefault')} description={t('input.combinations.preventDefaultHelp')}><Switch size='small' value={consume} onChange={value => queries.set('code-editor.events.combinations.consume', String(value))} /></SwitchField>
          <ConfigField icon='rule' label={t('input.common.actions')}>
            <div className='input-events-binding-list'>{snapshot.bindings.map(binding => (
              <code key={binding.id} className={binding.enabled ? '' : 'is-disabled'}>
                <strong>{t(actionTranslationKey(binding.action))}</strong>
                <span>{binding.label}</span>
              </code>
            ))}</div>
          </ConfigField>
          <Button variant='outline' block onClick={runtime.resetCounts}>{t('input.common.clear')} · {t('input.common.actions')}</Button>
        </AdvancedConfig>
      </>}
      {kind === 'platform' && <>
        <ConfigField icon='devices' label={t('input.platform.override')} description={t('input.platform.overrideHelp')}>
          <Select value={previewPlatform} onChange={value => queries.set('code-editor.events.platform.preview', value as string)} options={[
            { label: t('input.platform.auto'), value: 'auto' },
            { label: t('input.platform.macos'), value: 'macos' },
            { label: t('input.platform.windows'), value: 'windows' },
            { label: t('input.platform.linux'), value: 'linux' },
            { label: t('input.platform.unknown'), value: 'unknown' }
          ]} />
        </ConfigField>
        <ConfigField icon='hub' label={t('input.platform.current')} description={t('input.platform.currentHelp')} value={snapshot.platform}>
          <div className='input-events-platform-note'>
            {t(`input.platform.${snapshot.platform}`)} · {t(
              ['macos', 'ios'].includes(snapshot.platform)
                ? 'input.platform.modCommand'
                : snapshot.platform === 'unknown'
                  ? 'input.platform.modEither'
                  : 'input.platform.modControl'
            )}
          </div>
        </ConfigField>
        <AdvancedConfig label={t('input.common.advanced')} defaultOpen>
          <ConfigField icon='keyboard_command_key' label={t('input.platform.modMapping')} description={t('input.platform.modMappingHelp')}>
            <div className='input-events-binding-list'>{snapshot.bindings.map(({ binding }) => (
              <code
                key={binding.id}
                aria-label={formatBinding(binding, selectedPlatform)}
              >{formatBinding(binding, selectedPlatform)}</code>
            ))}</div>
          </ConfigField>
        </AdvancedConfig>
      </>}
    </ComponentCase>
  )
}

export default function InputEvents() {
  return <div className='input-events-examples'>{(['pointer', 'contextmenu', 'keyboard', 'combinations', 'platform'] as const).map(kind => <InputEventCase key={kind} kind={kind} />)}</div>
}
