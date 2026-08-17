import './App.scss'

import type { ComponentType, LazyExoticComponent } from 'react'
import React, {
  lazy,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef
} from 'react'
import {
  ChatIcon,
  ChartLineDataIcon,
  CheckCircleFilledIcon,
  ChevronDownIcon,
  CodeIcon,
  Edit1Icon,
  LogoGithubIcon,
  MoonIcon,
  MouseIcon,
  SunnyIcon,
  TranslateIcon
} from 'tdesign-icons-react'

import { useQueries } from './hooks/useQueries'
import { useI18n } from './i18n'

type ComponentId =
  | 'Code Editor'
  | 'code-editor-ux'
  | 'code-editor-live-renderer'
  | 'code-editor-input-events'
  | 'code-editor-diff'
  | 'code-editor-benchmark'
  | 'code-editor-typescript-lsp'
  | 'Markdown Editor'
  | 'Messenger'

interface ComponentItem {
  id: ComponentId
  titleKey: string
  navTitleKey?: string
  descriptionKey: string
  icon: ComponentType
  component: LazyExoticComponent<ComponentType>
  legacyIds?: ComponentId[]
  breadcrumbParentKey?: string
}

interface ComponentBranch {
  id: string
  titleKey: string
  icon: ComponentType
  children: ComponentItem[]
}

interface ComponentGroup {
  labelKey: string
  children: (ComponentItem | ComponentBranch)[]
}

const components: ComponentGroup[] = [
  {
    labelKey: 'nav.patterns',
    children: [
      {
        id: 'Messenger',
        titleKey: 'nav.messenger',
        descriptionKey: 'component.messenger.description',
        icon: ChatIcon,
        component: lazy(() => import('./examples/Messenger'))
      }
    ]
  },
  {
    labelKey: 'nav.editors',
    children: [
      {
        id: 'code-editor',
        titleKey: 'nav.codeEditor',
        icon: CodeIcon,
        children: [
          {
            id: 'code-editor-ux',
            legacyIds: ['Code Editor'],
            titleKey: 'nav.codeEditor',
            navTitleKey: 'nav.codeEditorUx',
            descriptionKey: 'component.codeEditor.description',
            breadcrumbParentKey: 'nav.codeEditor',
            icon: CodeIcon,
            component: lazy(() => import('./examples/CodeEditor'))
          },
          {
            id: 'code-editor-live-renderer',
            titleKey: 'nav.liveRenderer',
            descriptionKey: 'component.liveRenderer.description',
            breadcrumbParentKey: 'nav.codeEditor',
            icon: CodeIcon,
            component: lazy(() => import('./examples/LiveRenderer'))
          },
          {
            id: 'code-editor-input-events',
            titleKey: 'nav.inputEvents',
            descriptionKey: 'component.inputEvents.description',
            breadcrumbParentKey: 'nav.codeEditor',
            icon: MouseIcon,
            component: lazy(() => import('./examples/InputEvents'))
          },
          {
            id: 'code-editor-diff',
            titleKey: 'nav.diffEditor',
            descriptionKey: 'component.diffEditor.description',
            breadcrumbParentKey: 'nav.codeEditor',
            icon: CodeIcon,
            component: lazy(() => import('./examples/DiffEditor'))
          },
          {
            id: 'code-editor-typescript-lsp',
            titleKey: 'nav.typescriptLsp',
            descriptionKey: 'component.typescriptLsp.description',
            breadcrumbParentKey: 'nav.codeEditor',
            icon: CodeIcon,
            component: lazy(() => import('./examples/LanguageServices/TypeScript'))
          }
        ]
      },
      {
        id: 'Markdown Editor',
        titleKey: 'nav.markdownEditor',
        descriptionKey: 'component.markdownEditor.description',
        icon: Edit1Icon,
        component: lazy(() => import('./examples/MarkdownEditor'))
      }
    ]
  },
  {
    labelKey: 'nav.benchmarks',
    children: [
      {
        id: 'code-editor-benchmark',
        titleKey: 'nav.benchmark',
        descriptionKey: 'component.benchmark.description',
        icon: ChartLineDataIcon,
        component: lazy(() => import('./examples/Benchmark'))
      }
    ]
  }
]

const componentItems = components.flatMap(group => group.children.flatMap(item => (
  'children' in item ? item.children : [item]
)))
const defaultComponent = componentItems.find(item => item.id === 'Messenger')!

export default function App() {
  const { locale, setLocale, t } = useI18n()
  const mainRef = useRef<HTMLElement>(null)
  const {
    value: {
      active = 'Messenger',
      theme = 'light'
    },
    set
  } = useQueries<{
    active: ComponentId
    theme: 'dark' | 'light'
  }>()
  const activeItem = useMemo(() => {
    return componentItems.find(item => item.id === active || item.legacyIds?.includes(active))
      ?? defaultComponent
  }, [active])
  const ActiveComponent = activeItem.component
  const selectComponent = (id: ComponentId) => {
    if (location.hash) {
      history.replaceState(null, '', `${location.pathname}${location.search}`)
    }
    set('active', id)
    mainRef.current?.scrollTo({ top: 0 })
  }
  const switchLocale = () => {
    const anchorId = decodeURIComponent(location.hash.slice(1))
    setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')
    if (!anchorId) return
    requestAnimationFrame(() => document.getElementById(anchorId)?.scrollIntoView({ block: 'start' }))
  }
  useLayoutEffect(() => {
    if (location.hash) return
    mainRef.current?.scrollTo({ top: 0 })
  }, [activeItem.id])
  useLayoutEffect(() => {
    const root = document.documentElement
    const previousThemeMode = root.getAttribute('theme-mode')
    root.setAttribute('theme-mode', theme)
    return () => {
      if (previousThemeMode === null) root.removeAttribute('theme-mode')
      else root.setAttribute('theme-mode', previousThemeMode)
    }
  }, [theme])

  return (
    <div className='playground-shell' data-theme={theme}>
      <aside className='playground-sidebar'>
        <div className='playground-brand'>
          <div className='playground-brand__mark'>
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt='' />
          </div>
          <div>
            <strong>Shikitor</strong>
            <span>{t('brand.subtitle')}</span>
          </div>
        </div>

        <nav className='component-tree' aria-label={t('nav.catalog')}>
          {components.map(group => (
            <section className='component-tree__group' key={group.labelKey}>
              <div className='component-tree__group-label'>
                <ChevronDownIcon />
                <span>{t(group.labelKey)}</span>
              </div>
              <div className='component-tree__items'>
                {group.children.map(item => {
                  if ('children' in item) {
                    const BranchIcon = item.icon
                    const branchSelected = item.children.includes(activeItem)
                    return (
                      <div
                        key={item.id}
                        className={`component-tree__branch${branchSelected ? ' component-tree__branch--active' : ''}`}
                      >
                        <div className='component-tree__branch-label'>
                          <ChevronDownIcon className='component-tree__branch-chevron' />
                          <BranchIcon />
                          <span>{t(item.titleKey)}</span>
                        </div>
                        <div className='component-tree__subitems'>
                          {item.children.map(child => {
                            const ChildIcon = child.icon
                            const selected = child === activeItem
                            return (
                              <button
                                type='button'
                                key={child.id}
                                className={`component-tree__item component-tree__item--sub${selected ? ' component-tree__item--active' : ''}`}
                                aria-current={selected ? 'page' : undefined}
                                aria-label={t(child.navTitleKey ?? child.titleKey)}
                                onClick={() => selectComponent(child.id)}
                              >
                                <ChildIcon />
                                <span>{t(child.navTitleKey ?? child.titleKey)}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }
                  const Icon = item.icon
                  const selected = item.id === activeItem.id
                  return (
                    <button
                      type='button'
                      key={item.id}
                      className={`component-tree__item${selected ? ' component-tree__item--active' : ''}`}
                      aria-current={selected ? 'page' : undefined}
                      aria-label={t(item.titleKey)}
                      onClick={() => selectComponent(item.id)}
                    >
                      <Icon />
                      <span>{t(item.titleKey)}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className='playground-runtime'>
          <CheckCircleFilledIcon />
          <div>
            <strong>{t('runtime.title')}</strong>
            <span>{t('runtime.ready')}</span>
          </div>
        </div>
      </aside>

      <main className='playground-main' ref={mainRef}>
        <header className='playground-header'>
          <div>
            <div className='playground-breadcrumb'>
              {t('breadcrumb.components')}
              {activeItem.breadcrumbParentKey && (
                <> <span>/</span> {t(activeItem.breadcrumbParentKey)}</>
              )}
              <span>/</span> {t(activeItem.navTitleKey ?? activeItem.titleKey)}
            </div>
            <h1>{t(activeItem.titleKey)}</h1>
          </div>
          <div className='playground-header__actions'>
            <button
              type='button'
              className='playground-theme'
              aria-label={t(theme === 'dark' ? 'header.switchLight' : 'header.switchDark')}
              onClick={() => set('theme', theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <SunnyIcon /> : <MoonIcon />}
            </button>
            <button
              type='button'
              className='playground-locale'
              aria-label={t('header.switchLanguage')}
              onMouseDown={event => event.preventDefault()}
              onClick={switchLocale}
            >
              <TranslateIcon />
              <span>{locale === 'zh-CN' ? 'EN' : '中文'}</span>
            </button>
            <a
              className='playground-github'
              href='https://github.com/NWYLZW/shikitor'
              target='_blank'
              rel='noreferrer'
              aria-label='Open Shikitor on GitHub'
            >
              <LogoGithubIcon />
            </a>
          </div>
        </header>

        <div
          className={`playground-content${activeItem.id === 'Messenger' ? ' playground-content--flush' : ''}`}
        >
          <Suspense fallback={<div className='playground-loading'>{t('loading')}</div>}>
            <ActiveComponent />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
