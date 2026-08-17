import './index.scss'

import type { InputShikitorPlugin, Shikitor } from '@shikitor/core'
import codeFolding from '@shikitor/core/plugins/code-folding'
import codeStyler from '@shikitor/core/plugins/code-styler'
import gutterDecorations, { type GutterDecoration } from '@shikitor/core/plugins/gutter-decorations'
import lineWidgets, { type LineWidget } from '@shikitor/core/plugins/line-widgets'
import provideCompletions from '@shikitor/core/plugins/provide-completions'
import providePopup from '@shikitor/core/plugins/provide-popup'
import { WithoutCoreEditor } from '@shikitor/react'
import React, {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { BundledLanguage, BundledTheme } from 'shiki'
import { bundledLanguagesInfo } from 'shiki'
import { ColorPicker, Input, Radio, Select, Slider, Switch } from 'tdesign-react'

import {
  AdvancedConfig,
  ComponentCase,
  ConfigField,
  ConfigOption,
  SwitchField
} from '../../components/ComponentCase'
import { useQueries } from '../../hooks/useQueries'
import { useI18n } from '../../i18n'
import { useShikitorCreate } from '../../hooks/useShikitorCreate'
import { analyzeHash, DEFAULT_CODE } from '../../utils/analyzeHash'
import bracketMatcher from '../../../../packages/core/src/plugins/bracket-matcher'
import symmetryOperator from '../../../../packages/core/src/plugins/symmetry-operator'
import demoCompletions from './plugins/demo-completions'
import ghostText from './plugins/ghost-text'
import HighlightsCase from './components/HighlightsCase'
import InlineReplacementsCase from './components/InlineReplacementsCase'

const noPlugins: InputShikitorPlugin[] = []

function withAlpha(color: string, alpha: number) {
  const hex = color.trim().match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)
  if (hex) {
    const [, red, green, blue] = hex
    return `rgba(${Number.parseInt(red, 16)}, ${Number.parseInt(green, 16)}, ${Number.parseInt(blue, 16)}, ${alpha})`
  }
  const rgb = color.trim().match(
    /^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)/i
  )
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
  return `rgba(127, 127, 127, ${alpha})`
}

function loadedPluginNames(plugins: readonly InputShikitorPlugin[]) {
  return [...new Set(plugins.flatMap(input => {
    const plugin = Array.isArray(input) ? input[0] : input
    const name = (plugin as { name?: unknown }).name
    return typeof name === 'string' && name ? [name] : []
  }))]
}

const themePairs = {
  github: {
    icon: 'code',
    label: 'GitHub',
    light: 'github-light',
    dark: 'github-dark'
  },
  vitesse: {
    icon: 'bolt',
    label: 'Vitesse',
    light: 'vitesse-light',
    dark: 'vitesse-dark'
  },
  min: {
    icon: 'horizontal_rule',
    label: 'Minimal',
    light: 'min-light',
    dark: 'min-dark'
  }
} as const

type ThemeFamily = keyof typeof themePairs
type ThemeMode = 'light' | 'dark'
type CursorType = 'line' | 'block' | 'underline'
type PopupPlacement = 'top' | 'bottom'
type LineWidgetKind = 'comment' | 'usages'
type GutterDecorationPosition = 'left' | 'right'
type CustomProperties = CSSProperties & Record<`--${string}`, string | number>

function EditorFrame({
  colors,
  className = '',
  style,
  children
}: {
  colors: { bg: string; fg: string }
  className?: string
  style?: CustomProperties
  children: ReactNode
}) {
  return (
    <div
      className={`editor-frame ${className}`}
      style={{
        '--editor-bg': colors.bg || '#0d1117',
        '--editor-fg': colors.fg || '#e6edf3',
        ...style
      } as CustomProperties}
    >
      {children}
    </div>
  )
}

const { code: hashCode } = analyzeHash()

export default function CodeEditor() {
  const { locale, t } = useI18n()
  const queries = useQueries<{
    theme: ThemeMode
    'code-editor.theme.family': ThemeFamily
    'code-editor.theme.mode': ThemeMode
    'code-editor.theme.language': BundledLanguage
    'code-editor.theme.line-numbers': string
    'code-editor.theme.current-line': string
    'code-editor.theme.current-line-color': string
    'code-editor.cursor.bubble': string
    'code-editor.cursor.color': string
    'code-editor.cursor.size': string
    'code-editor.cursor.type': CursorType
    'code-editor.cursor.blink': string
    'code-editor.completion.popup': string
    'code-editor.completion.ghost-text': string
    'code-editor.completion.placement': PopupPlacement
    'code-editor.editing.bracket-matcher': string
    'code-editor.editing.code-styler': string
    'code-editor.editing.symmetry-operator': string
    'code-editor.editing.code-folding': string
    'code-editor.widgets.visible': string
    'code-editor.widgets.kind': LineWidgetKind
    'code-editor.widgets.line': string
    'code-editor.gutter.visible': string
    'code-editor.gutter.position': GutterDecorationPosition
    'code-editor.states.line-numbers': string
    'code-editor.states.auto-focus': string
    'code-editor.states.read-only': string
    'code-editor.states.empty': string
    'code-editor.states.placeholder': string
  }>()
  const query = queries.value
  const shikitorCreate = useShikitorCreate()

  const themeFamily = query['code-editor.theme.family'] in themePairs
    ? query['code-editor.theme.family'] as ThemeFamily
    : 'github'
  const configuredThemeMode = query['code-editor.theme.mode']
  const themeMode: ThemeMode = configuredThemeMode === 'light' || configuredThemeMode === 'dark'
    ? configuredThemeMode
    : query.theme === 'dark' ? 'dark' : 'light'
  const language = query['code-editor.theme.language'] ?? 'typescript'
  const theme = themePairs[themeFamily][themeMode] as BundledTheme
  const themeLineNumbers = query['code-editor.theme.line-numbers'] !== 'false'
  const themeCurrentLine = query['code-editor.theme.current-line'] !== 'false'
  const configuredCurrentLineColor = query['code-editor.theme.current-line-color']
  const themeCurrentLineColorOverride = configuredCurrentLineColor
    && !['#4b5568', '#e5eaf2'].includes(configuredCurrentLineColor)
    ? configuredCurrentLineColor
    : undefined

  const cursorBubble = query['code-editor.cursor.bubble'] === 'true'
  const cursorColor = query['code-editor.cursor.color'] ?? '#7c6cf2'
  const cursorSize = Math.min(8, Math.max(1, Number(query['code-editor.cursor.size']) || 2))
  const cursorType: CursorType = ['line', 'block', 'underline'].includes(query['code-editor.cursor.type'])
    ? query['code-editor.cursor.type']
    : 'line'
  const cursorBlink = Math.min(1600, Math.max(200, Number(query['code-editor.cursor.blink']) || 700))

  const completionPopup = query['code-editor.completion.popup'] !== 'false'
  const completionGhostText = query['code-editor.completion.ghost-text'] !== 'false'
  const completionPlacement: PopupPlacement = query['code-editor.completion.placement'] === 'top'
    ? 'top'
    : 'bottom'

  const editingBracketMatcher = query['code-editor.editing.bracket-matcher'] !== 'false'
  const editingCodeStyler = query['code-editor.editing.code-styler'] !== 'false'
  const editingSymmetryOperator = query['code-editor.editing.symmetry-operator'] !== 'false'
  const editingCodeFolding = query['code-editor.editing.code-folding'] !== 'false'

  const lineWidgetVisible = query['code-editor.widgets.visible'] !== 'false'
  const lineWidgetKind: LineWidgetKind = query['code-editor.widgets.kind'] === 'comment'
    ? 'comment'
    : 'usages'
  const lineWidgetLine = query['code-editor.widgets.line'] === '6' ? 6 : 2
  const gutterDecorationsVisible = query['code-editor.gutter.visible'] !== 'false'
  const gutterDecorationPosition: GutterDecorationPosition = query['code-editor.gutter.position'] === 'right'
    ? 'right'
    : 'left'

  const behaviorLineNumbers = query['code-editor.states.line-numbers'] !== 'false'
  const behaviorAutoFocus = query['code-editor.states.auto-focus'] === 'true'
  const behaviorReadOnly = query['code-editor.states.read-only'] === 'true'
  const behaviorEmpty = query['code-editor.states.empty'] === 'true'
  const behaviorPlaceholder = query['code-editor.states.placeholder']
    ?? (locale === 'zh-CN' ? '从这里开始输入…' : 'Start writing something useful…')

  const [themeCode, setThemeCode] = useState(hashCode ?? DEFAULT_CODE)
  const [cursorCode, setCursorCode] = useState(
    'const presence = createPresence({\n  user: "YiJie",\n  status: "editing"\n})'
  )
  const [completionCode, setCompletionCode] = useState(
    'const editor = shikitor\n\neditor.'
  )
  const [editingCode, setEditingCode] = useState(
    'import React from "react"\nimport {\n  definePlugin,\n  type Shikitor\n} from "@shikitor/core"\n\n/* Runtime integration */\nimport { Context } from "cordis"\n\nconst pluginName = "editor"\n\n// Optional development tooling\nimport { createLogger } from "./logger"\nimport "./editor.css"\n\n// Highlight matching brackets\n// Indent paired characters\n// Wrap selected text\n\nfunction configureEditor(editor: Shikitor, context: Context) {\n  createLogger(context, pluginName)\n  return definePlugin({ name: pluginName })\n}\n\nexport { configureEditor }'
  )
  const [behaviorCode, setBehaviorCode] = useState(
    'export function greet(name: string) {\n  return `Hello, ${name}!`\n}'
  )
  const [lineWidgetCode, setLineWidgetCode] = useState(
    'type User = { displayName: string }\nexport function formatUser(user: User) {\n  return user.displayName.trim()\n}\n\nconst label = formatUser(currentUser)'
  )
  const [gutterCode, setGutterCode] = useState(
    'type User = { displayName: string }\nexport function formatUser(user: User) {\n  return user.displayName.trim()\n}\n\nconst label = formatUser(currentUser)'
  )
  const [themeColors, setThemeColors] = useState({ bg: '#0d1117', fg: '#e6edf3' })
  const [cursorColors, setCursorColors] = useState({ bg: '#0d1117', fg: '#e6edf3' })
  const [completionColors, setCompletionColors] = useState({ bg: '#0d1117', fg: '#e6edf3' })
  const [editingColors, setEditingColors] = useState({ bg: '#0d1117', fg: '#e6edf3' })
  const [behaviorColors, setBehaviorColors] = useState({ bg: '#0d1117', fg: '#e6edf3' })
  const [lineWidgetColors, setLineWidgetColors] = useState({ bg: '#0d1117', fg: '#e6edf3' })
  const [gutterColors, setGutterColors] = useState({ bg: '#0d1117', fg: '#e6edf3' })
  const themeCurrentLineColor = themeCurrentLineColorOverride ?? withAlpha(themeColors.fg, 0.12)
  const cursorEditorRef = useRef<Shikitor>(null)
  const gutterCounterRef = useRef(3)
  const gutterEditorMountCountRef = useRef(0)
  const gutterDecorationRenderCountRef = useRef(0)
  const gutterProbeRef = useRef<HTMLDivElement>(null)

  const updateGutterProbe = useCallback(() => {
    const probe = gutterProbeRef.current
    if (!probe) return
    const values = {
      counter: gutterCounterRef.current,
      editor: gutterEditorMountCountRef.current,
      decoration: gutterDecorationRenderCountRef.current
    }
    for (const [name, value] of Object.entries(values)) {
      const target = probe.querySelector<HTMLElement>(`[data-gutter-probe="${name}"]`)
      if (target) target.textContent = String(value)
    }
  }, [])

  const handleGutterMounted = useCallback(() => {
    gutterEditorMountCountRef.current += 1
    updateGutterProbe()
  }, [updateGutterProbe])

  useEffect(updateGutterProbe)

  const themeOptions = useMemo(() => ({
    language,
    theme,
    lineNumbers: themeLineNumbers ? 'on' as const : 'off' as const,
    highlightCurrentLine: themeCurrentLine,
    currentLineHighlightColor: themeCurrentLineColorOverride
  }), [language, theme, themeCurrentLine, themeCurrentLineColorOverride, themeLineNumbers])
  const cursorOptions = useMemo(() => ({
    language: 'typescript' as const,
    theme,
    hideSelfCursorUsername: !cursorBubble,
    cursor: { line: 3, character: 10 }
  }), [cursorBubble, theme])
  const completionOptions = useMemo(() => ({
    language: 'typescript' as const,
    theme,
    hideSelfCursorUsername: true,
    cursor: { line: 3, character: 7 }
  }), [theme])
  const completionPlugins = useMemo(() => {
    const plugins: InputShikitorPlugin[] = []
    if (completionPopup) {
      plugins.push(
        providePopup,
        [provideCompletions, {
          popupPlacement: completionPlacement,
          emptyText: locale === 'zh-CN' ? '暂无可用补全' : 'No completions available',
          tooltip: locale === 'zh-CN'
            ? '使用 <kbd>↑</kbd> <kbd>↓</kbd> 选择，按 <kbd>↵</kbd> 确认'
            : true
        }],
        [demoCompletions, { locale }]
      )
    }
    if (completionGhostText) plugins.push(ghostText)
    return plugins
  }, [completionGhostText, completionPlacement, completionPopup, locale])
  const editingOptions = useMemo(() => ({
    language: 'typescript' as const,
    theme,
    hideSelfCursorUsername: true,
    cursor: { line: 1, character: 0 }
  }), [theme])
  const editingPlugins = useMemo(() => {
    const plugins: InputShikitorPlugin[] = []
    if (editingBracketMatcher) plugins.push(bracketMatcher)
    if (editingCodeStyler) plugins.push(codeStyler)
    if (editingSymmetryOperator) plugins.push(symmetryOperator)
    if (editingCodeFolding) {
      plugins.push([codeFolding, {
        defaultCollapsed: true,
        collapseLabel: locale === 'zh-CN' ? '折叠区块' : 'Collapse block',
        expandLabel: locale === 'zh-CN' ? '展开区块' : 'Expand block'
      }])
    }
    return plugins
  }, [editingBracketMatcher, editingCodeFolding, editingCodeStyler, editingSymmetryOperator, locale])
  const behaviorOptions = useMemo(() => ({
    language: 'typescript' as const,
    theme,
    lineNumbers: behaviorLineNumbers ? 'on' as const : 'off' as const,
    autoFocus: behaviorAutoFocus,
    readOnly: behaviorReadOnly,
    placeholder: behaviorPlaceholder
  }), [behaviorAutoFocus, behaviorLineNumbers, behaviorPlaceholder, behaviorReadOnly, theme])
  const lineWidgetOptions = useMemo(() => ({
    language: 'typescript' as const,
    theme,
    hideSelfCursorUsername: true,
    cursor: { line: 2, character: 16 },
    readOnly: true
  }), [theme])
  const gutterOptions = useMemo(() => ({
    language: 'typescript' as const,
    theme,
    hideSelfCursorUsername: true,
    readOnly: true
  }), [theme])
  const widgetDefinitions = useMemo<LineWidget[]>(() => {
    if (!lineWidgetVisible) return []
    const isChinese = locale === 'zh-CN'
    return [{
      id: lineWidgetKind,
      afterLine: lineWidgetLine,
      minHeight: lineWidgetKind === 'comment' ? 118 : 132,
      className: `demo-line-widget demo-line-widget--${lineWidgetKind}`,
      render(container) {
        container.innerHTML = lineWidgetKind === 'comment'
          ? `<div class="demo-line-widget__surface">
              <div class="demo-line-widget__header">
                <span class="shikitor-icon">comment</span>
                <strong>${isChinese ? '代码评论' : 'Review comment'}</strong>
                <small>YiJie · 2m</small>
              </div>
              <p>${isChinese ? '这里是否可以复用现有的格式化逻辑？' : 'Could this reuse the existing formatting path?'}</p>
              <div class="demo-line-widget__actions">
                <button type="button">${isChinese ? '回复' : 'Reply'}</button>
                <button type="button">${isChinese ? '解决' : 'Resolve'}</button>
              </div>
            </div>`
          : `<div class="demo-line-widget__surface">
              <div class="demo-line-widget__header">
                <span class="shikitor-icon">manage_search</span>
                <strong>${isChinese ? '找到 3 处引用' : '3 usages found'}</strong>
                <small>${isChinese ? '2 个文件' : '2 files'}</small>
              </div>
              <div class="demo-line-widget__usage"><code>profile.ts</code><span>18:12</span><b>formatUser(account.owner)</b></div>
              <div class="demo-line-widget__usage"><code>header.tsx</code><span>42:9</span><b>formatUser(currentUser)</b></div>
              <div class="demo-line-widget__usage"><code>header.tsx</code><span>68:16</span><b>formatUser(member)</b></div>
            </div>`
      },
    }]
  }, [lineWidgetKind, lineWidgetLine, lineWidgetVisible, locale])
  const lineWidgetPlugins = useMemo<InputShikitorPlugin[]>(() => (
    lineWidgetVisible ? [[lineWidgets, { widgets: widgetDefinitions }]] : []
  ), [lineWidgetVisible, widgetDefinitions])
  const gutterDecorationDefinitions = useMemo<GutterDecoration[]>(() => {
    if (!gutterDecorationsVisible) return []
    const isChinese = locale === 'zh-CN'
    return [
      {
        id: 'review-comment',
        line: 2,
        position: gutterDecorationPosition,
        className: 'demo-gutter-decoration',
        render(container) {
          container.innerHTML = `<button type="button" class="demo-gutter-action" title="${
            isChinese ? '打开评论' : 'Open comment'
          }"><span class="shikitor-icon">comment</span></button>`
        }
      },
      {
        id: 'usage-count',
        line: 6,
        position: gutterDecorationPosition,
        className: 'demo-gutter-decoration',
        render(container) {
          gutterDecorationRenderCountRef.current += 1
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'demo-gutter-badge'
          button.title = isChinese ? '点击增加引用计数' : 'Increment usage count'
          const label = document.createTextNode(String(gutterCounterRef.current))
          button.append(label)
          const increment = () => {
            gutterCounterRef.current += 1
            // Updating Text.data avoids a child-list mutation, so this probe
            // does not cause the gutter plugin to remount its own decoration.
            label.data = String(gutterCounterRef.current)
            updateGutterProbe()
          }
          button.addEventListener('click', increment)
          container.append(button)
          updateGutterProbe()
          return () => button.removeEventListener('click', increment)
        }
      }
    ]
  }, [gutterDecorationPosition, gutterDecorationsVisible, locale, updateGutterProbe])
  const gutterDecorationPlugins = useMemo<InputShikitorPlugin[]>(() => (
    gutterDecorationsVisible
      ? [[gutterDecorations, { decorations: gutterDecorationDefinitions }]]
      : []
  ), [gutterDecorationDefinitions, gutterDecorationsVisible])

  return (
    <div className='code-editor-examples'>
      <ComponentCase
        id='code-editor-theme'
        index='01'
        title={t('code.theme.title')}
        description={t('code.theme.description')}
        tags={['Appearance', 'Shiki']}
        preview={(
          <EditorFrame colors={themeColors}>
            <WithoutCoreEditor
              create={shikitorCreate}
              value={themeCode}
              onChange={setThemeCode}
              options={themeOptions}
              plugins={noPlugins}
              onColorChange={setThemeColors}
            />
          </EditorFrame>
        )}
      >
        <ConfigField
          icon='data_object'
          label={t('code.theme.language')}
          description={t('code.theme.languageHelp')}
        >
          <Select
            filterable
            value={language}
            onChange={value => queries.set('code-editor.theme.language', value as string)}
            options={bundledLanguagesInfo.map(item => ({
              label: item.name,
              value: item.id
            }))}
          />
        </ConfigField>
        <ConfigField
          icon='palette'
          label={t('code.theme.preset')}
          description={t('code.theme.presetHelp')}
        >
          <Radio.Group
            variant='default-filled'
            value={themeFamily}
            options={Object.entries(themePairs).map(([value, pair]) => ({
              label: <ConfigOption icon={pair.icon}>{pair.label}</ConfigOption>,
              value
            }))}
            onChange={value => queries.set('code-editor.theme.family', value as string)}
          />
        </ConfigField>
        <ConfigField
          icon='contrast'
          label={t('code.theme.mode')}
          description={t('code.theme.resolved', { theme })}
        >
          <Radio.Group
            variant='default-filled'
            value={themeMode}
            options={[
              {
                label: <ConfigOption icon='light_mode'>{t('code.theme.light')}</ConfigOption>,
                value: 'light'
              },
              {
                label: <ConfigOption icon='dark_mode'>{t('code.theme.dark')}</ConfigOption>,
                value: 'dark'
              }
            ]}
            onChange={value => queries.set('code-editor.theme.mode', value as string)}
          />
        </ConfigField>
        <AdvancedConfig label={t('case.advanced')}>
          <SwitchField
            icon='format_list_numbered'
            label={t('code.lineNumbers')}
            description={t('code.lineNumbersHelp')}
          >
            <Switch
              size='small'
              value={themeLineNumbers}
              onChange={value => queries.set('code-editor.theme.line-numbers', String(value))}
            />
          </SwitchField>
          <SwitchField
            icon='view_agenda'
            label={t('code.currentLine')}
            description={t('code.currentLineHelp')}
          >
            <Switch
              size='small'
              value={themeCurrentLine}
              onChange={value => queries.set('code-editor.theme.current-line', String(value))}
            />
          </SwitchField>
          <ConfigField
            icon='format_color_fill'
            label={t('code.currentLineColor')}
            description={t('code.currentLineColorHelp')}
            value={themeCurrentLineColor}
          >
            <ColorPicker
              value={themeCurrentLineColor}
              enableAlpha
              format='RGBA'
              colorModes={['monochrome']}
              onChange={value => queries.set('code-editor.theme.current-line-color', value)}
            />
          </ConfigField>
        </AdvancedConfig>
      </ComponentCase>

      <ComponentCase
        id='code-editor-states'
        index='02'
        title={t('code.states.title')}
        description={t('code.states.description')}
        tags={['Behavior']}
        preview={(
          <EditorFrame colors={behaviorColors}>
            <WithoutCoreEditor
              create={shikitorCreate}
              value={behaviorEmpty ? '' : behaviorCode}
              onChange={setBehaviorCode}
              options={behaviorOptions}
              plugins={noPlugins}
              onColorChange={setBehaviorColors}
            />
          </EditorFrame>
        )}
      >
        <SwitchField label={t('code.lineNumbers')} description={t('code.states.lineNumbersHelp')}>
          <Switch
            size='small'
            value={behaviorLineNumbers}
            onChange={value => queries.set('code-editor.states.line-numbers', String(value))}
          />
        </SwitchField>
        <SwitchField label={t('code.states.autoFocus')} description={t('code.states.autoFocusHelp')}>
          <Switch
            size='small'
            value={behaviorAutoFocus}
            onChange={value => queries.set('code-editor.states.auto-focus', String(value))}
          />
        </SwitchField>
        <SwitchField label={t('code.states.readOnly')} description={t('code.states.readOnlyHelp')}>
          <Switch
            size='small'
            value={behaviorReadOnly}
            onChange={value => queries.set('code-editor.states.read-only', String(value))}
          />
        </SwitchField>
        <SwitchField label={t('code.states.empty')} description={t('code.states.emptyHelp')}>
          <Switch
            size='small'
            value={behaviorEmpty}
            onChange={value => queries.set('code-editor.states.empty', String(value))}
          />
        </SwitchField>
        <ConfigField label={t('code.states.placeholder')} description={t('code.states.placeholderHelp')}>
          <Input
            value={behaviorPlaceholder}
            onChange={value => queries.set('code-editor.states.placeholder', value)}
          />
        </ConfigField>
      </ComponentCase>

      <ComponentCase
        id='code-editor-cursor'
        index='03'
        title={t('code.cursor.title')}
        description={t('code.cursor.description')}
        tags={['Presence', 'Interaction']}
        preview={(
          <EditorFrame
            colors={cursorColors}
            className={`editor-frame--cursor editor-frame--cursor-${cursorType}`}
            style={{
              '--demo-cursor-color': cursorColor,
              '--demo-cursor-size': `${cursorSize}px`,
              '--demo-cursor-blink': `${cursorBlink}ms`
            }}
          >
            <WithoutCoreEditor
              ref={cursorEditorRef}
              create={shikitorCreate}
              value={cursorCode}
              onChange={setCursorCode}
              options={cursorOptions}
              plugins={noPlugins}
              onColorChange={setCursorColors}
              onMounted={editor => {
                const username = editor.element.querySelector('.shikitor-cursor__username')
                username?.setAttribute('data-username', 'YiJie · editing')
              }}
            />
          </EditorFrame>
        )}
      >
        <SwitchField
          icon='person_pin_circle'
          label={t('code.cursor.bubble')}
          description={t('code.cursor.bubbleHelp')}
        >
          <Switch
            size='small'
            value={cursorBubble}
            onChange={value => queries.set('code-editor.cursor.bubble', String(value))}
          />
        </SwitchField>
        <ConfigField
          icon='text_fields'
          label={t('code.cursor.type')}
          description={t('code.cursor.typeHelp')}
        >
          <Radio.Group
            variant='default-filled'
            value={cursorType}
            options={[
              {
                label: <ConfigOption icon='border_vertical'>{t('code.cursor.line')}</ConfigOption>,
                value: 'line'
              },
              {
                label: <ConfigOption icon='crop_square'>{t('code.cursor.block')}</ConfigOption>,
                value: 'block'
              },
              {
                label: <ConfigOption icon='horizontal_rule'>{t('code.cursor.underline')}</ConfigOption>,
                value: 'underline'
              }
            ]}
            onChange={value => queries.set('code-editor.cursor.type', value as string)}
          />
        </ConfigField>
        <AdvancedConfig label={t('case.advanced')}>
          <ConfigField
            icon='palette'
            label={t('code.cursor.color')}
            description={t('code.cursor.colorHelp')}
            value={cursorColor}
          >
            <span className='color-control'>
              <input
                type='color'
                value={cursorColor}
                aria-label={t('code.cursor.color')}
                onChange={event => queries.set('code-editor.cursor.color', event.target.value)}
              />
              <Input
                value={cursorColor}
                onChange={value => queries.set('code-editor.cursor.color', value)}
              />
            </span>
          </ConfigField>
          <ConfigField
            icon='line_weight'
            label={t('code.cursor.size')}
            description={t('code.cursor.sizeHelp')}
            value={`${cursorSize}px`}
          >
            <Slider
              min={1}
              max={8}
              value={cursorSize}
              label={false}
              onChange={value => queries.set('code-editor.cursor.size', String(value))}
            />
          </ConfigField>
          <ConfigField
            icon='animation'
            label={t('code.cursor.blink')}
            description={t('code.cursor.blinkHelp')}
            value={`${cursorBlink}ms`}
          >
            <Slider
              min={200}
              max={1600}
              step={100}
              value={cursorBlink}
              label={false}
              onChange={value => queries.set('code-editor.cursor.blink', String(value))}
            />
          </ConfigField>
        </AdvancedConfig>
      </ComponentCase>

      <ComponentCase
        id='code-editor-completions'
        index='04'
        title={t('code.completion.title')}
        description={t('code.completion.description')}
        tags={['Completion', 'Cordis']}
        plugins={loadedPluginNames(completionPlugins)}
        preview={(
          <EditorFrame colors={completionColors} className='editor-frame--completion'>
            <WithoutCoreEditor
              create={shikitorCreate}
              value={completionCode}
              onChange={setCompletionCode}
              plugins={completionPlugins}
              onColorChange={setCompletionColors}
              options={completionOptions}
            />
          </EditorFrame>
        )}
      >
        <SwitchField label={t('code.completion.popup')} description={t('code.completion.popupHelp')}>
          <Switch
            size='small'
            value={completionPopup}
            onChange={value => queries.set('code-editor.completion.popup', String(value))}
          />
        </SwitchField>
        <SwitchField label={t('code.completion.ghost')} description={t('code.completion.ghostHelp')}>
          <Switch
            size='small'
            value={completionGhostText}
            onChange={value => queries.set('code-editor.completion.ghost-text', String(value))}
          />
        </SwitchField>
        <ConfigField label={t('code.completion.placement')} description={t('code.completion.placementHelp')}>
          <Radio.Group
            variant='default-filled'
            value={completionPlacement}
            options={[
              { label: t('code.completion.top'), value: 'top' },
              { label: t('code.completion.bottom'), value: 'bottom' }
            ]}
            onChange={value => queries.set('code-editor.completion.placement', value as string)}
          />
        </ConfigField>
        <div className='case-tip'>
          <span className='shikitor-icon'>keyboard</span>
          {t('code.completion.hint')}
        </div>
      </ComponentCase>

      <ComponentCase
        id='code-editor-editing'
        index='05'
        title={t('code.editing.title')}
        description={t('code.editing.description')}
        tags={['Keyboard', 'Plugin']}
        plugins={loadedPluginNames(editingPlugins)}
        preview={(
          <EditorFrame
            colors={editingColors}
            className={editingCodeFolding ? 'editor-frame--folding' : ''}
          >
            <WithoutCoreEditor
              create={shikitorCreate}
              value={editingCode}
              onChange={setEditingCode}
              plugins={editingPlugins}
              onColorChange={setEditingColors}
              options={editingOptions}
            />
          </EditorFrame>
        )}
      >
        <SwitchField label={t('code.editing.brackets')} description={t('code.editing.bracketsHelp')}>
          <Switch
            size='small'
            value={editingBracketMatcher}
            onChange={value => queries.set('code-editor.editing.bracket-matcher', String(value))}
          />
        </SwitchField>
        <SwitchField label={t('code.editing.styler')} description={t('code.editing.stylerHelp')}>
          <Switch
            size='small'
            value={editingCodeStyler}
            onChange={value => queries.set('code-editor.editing.code-styler', String(value))}
          />
        </SwitchField>
        <SwitchField label={t('code.editing.symmetry')} description={t('code.editing.symmetryHelp')}>
          <Switch
            size='small'
            value={editingSymmetryOperator}
            onChange={value => queries.set('code-editor.editing.symmetry-operator', String(value))}
          />
        </SwitchField>
        <SwitchField label={t('code.editing.folding')} description={t('code.editing.foldingHelp')}>
          <Switch
            size='small'
            value={editingCodeFolding}
            onChange={value => queries.set('code-editor.editing.code-folding', String(value))}
          />
        </SwitchField>
        <div className='case-tip'>
          <span className='shikitor-icon'>lightbulb</span>
          {t('code.editing.hint')}
        </div>
      </ComponentCase>

      <ComponentCase
        id='code-editor-line-widgets'
        index='06'
        title={t('code.widgets.title')}
        description={t('code.widgets.description')}
        tags={['View zone', 'Cordis']}
        plugins={loadedPluginNames(lineWidgetPlugins)}
        preview={(
          <EditorFrame colors={lineWidgetColors}>
            <WithoutCoreEditor
              create={shikitorCreate}
              value={lineWidgetCode}
              onChange={setLineWidgetCode}
              plugins={lineWidgetPlugins}
              onColorChange={setLineWidgetColors}
              options={lineWidgetOptions}
            />
          </EditorFrame>
        )}
      >
        <SwitchField label={t('code.widgets.visible')} description={t('code.widgets.visibleHelp')}>
          <Switch
            size='small'
            value={lineWidgetVisible}
            onChange={value => queries.set('code-editor.widgets.visible', String(value))}
          />
        </SwitchField>
        <ConfigField label={t('code.widgets.kind')} description={t('code.widgets.kindHelp')}>
          <Radio.Group
            variant='default-filled'
            value={lineWidgetKind}
            options={[
              { label: t('code.widgets.usages'), value: 'usages' },
              { label: t('code.widgets.comment'), value: 'comment' }
            ]}
            onChange={value => queries.set('code-editor.widgets.kind', value as string)}
          />
        </ConfigField>
        <ConfigField label={t('code.widgets.line')} description={t('code.widgets.lineHelp')}>
          <Radio.Group
            variant='default-filled'
            value={String(lineWidgetLine)}
            options={[
              { label: t('code.widgets.line2'), value: '2' },
              { label: t('code.widgets.line6'), value: '6' }
            ]}
            onChange={value => queries.set('code-editor.widgets.line', value as string)}
          />
        </ConfigField>
        <div className='case-tip'>
          <span className='shikitor-icon'>vertical_align_center</span>
          {t('code.widgets.hint')}
        </div>
      </ComponentCase>

      <ComponentCase
        id='code-editor-gutter-decorations'
        index='07'
        title={t('code.gutter.title')}
        description={t('code.gutter.description')}
        tags={['Gutter', 'Cordis']}
        plugins={loadedPluginNames(gutterDecorationPlugins)}
        preview={(
          <EditorFrame colors={gutterColors}>
            <WithoutCoreEditor
              create={shikitorCreate}
              value={gutterCode}
              onChange={setGutterCode}
              options={gutterOptions}
              plugins={gutterDecorationPlugins}
              onMounted={handleGutterMounted}
              onColorChange={setGutterColors}
            />
          </EditorFrame>
        )}
      >
        <SwitchField label={t('code.gutter.visible')} description={t('code.gutter.visibleHelp')}>
          <Switch
            size='small'
            value={gutterDecorationsVisible}
            onChange={value => queries.set('code-editor.gutter.visible', String(value))}
          />
        </SwitchField>
        <ConfigField label={t('code.gutter.position')} description={t('code.gutter.positionHelp')}>
          <Radio.Group
            variant='default-filled'
            value={gutterDecorationPosition}
            options={[
              { label: t('code.gutter.left'), value: 'left' },
              { label: t('code.gutter.right'), value: 'right' }
            ]}
            onChange={value => queries.set('code-editor.gutter.position', value as string)}
          />
        </ConfigField>
        <div ref={gutterProbeRef} className='case-tip case-tip--render-probe'>
          <span className='shikitor-icon'>view_sidebar</span>
          <div>
            <strong>{t('code.gutter.probeTitle')}</strong>
            <span>
              {t('code.gutter.probeCounter')} <b data-gutter-probe='counter'>3</b>
              {' · '}{t('code.gutter.probeEditor')} <b data-gutter-probe='editor'>0</b>
              {' · '}{t('code.gutter.probeDecoration')} <b data-gutter-probe='decoration'>0</b>
            </span>
            <small>{t('code.gutter.probeHint')}</small>
          </div>
        </div>
      </ComponentCase>

      <HighlightsCase theme={theme} />
      <InlineReplacementsCase theme={theme} />

    </div>
  )
}
