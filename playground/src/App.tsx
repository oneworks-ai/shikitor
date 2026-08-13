import './App.scss'

import React, { type ComponentType, lazy, type LazyExoticComponent, Suspense, useMemo } from 'react'
import {
  ChatIcon,
  CheckCircleFilledIcon,
  ChevronDownIcon,
  CodeIcon,
  Edit1Icon,
  LogoGithubIcon,
  TranslateIcon
} from 'tdesign-icons-react'

import { useQueries } from './hooks/useQueries'
import { useI18n } from './i18n'

type ComponentId = 'Code Editor' | 'Markdown Editor' | 'Messenger'

interface ComponentItem {
  id: ComponentId
  titleKey: string
  descriptionKey: string
  icon: ComponentType
  component: LazyExoticComponent<ComponentType>
}

interface ComponentGroup {
  labelKey: string
  children: ComponentItem[]
}

const components: ComponentGroup[] = [
  {
    labelKey: 'nav.editors',
    children: [
      {
        id: 'Code Editor',
        titleKey: 'nav.codeEditor',
        descriptionKey: 'component.codeEditor.description',
        icon: CodeIcon,
        component: lazy(() => import('./examples/CodeEditor'))
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
  }
]

export default function App() {
  const { locale, setLocale, t } = useI18n()
  const {
    value: {
      active = 'Code Editor'
    },
    set
  } = useQueries<{
    active: ComponentId
  }>()
  const activeItem = useMemo(() => {
    return components.flatMap(group => group.children).find(item => item.id === active)
      ?? components[0].children[0]
  }, [active])
  const ActiveComponent = activeItem.component
  const switchLocale = () => {
    const anchorId = decodeURIComponent(location.hash.slice(1))
    setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')
    if (!anchorId) return
    requestAnimationFrame(() => document.getElementById(anchorId)?.scrollIntoView({ block: 'start' }))
  }

  return (
    <div className='playground-shell'>
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

        <nav className='component-tree' aria-label='Component catalog'>
          {components.map(group => (
            <section className='component-tree__group' key={group.labelKey}>
              <div className='component-tree__group-label'>
                <ChevronDownIcon />
                <span>{t(group.labelKey)}</span>
              </div>
              <div className='component-tree__items'>
                {group.children.map(item => {
                  const Icon = item.icon
                  const selected = item.id === activeItem.id
                  return (
                    <button
                      type='button'
                      key={item.id}
                      className={`component-tree__item${selected ? ' component-tree__item--active' : ''}`}
                      aria-current={selected ? 'page' : undefined}
                      onClick={() => set('active', item.id)}
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

      <main className='playground-main'>
        <header className='playground-header'>
          <div>
            <div className='playground-breadcrumb'>
              {t('breadcrumb.components')} <span>/</span> {t(activeItem.titleKey)}
            </div>
            <h1>{t(activeItem.titleKey)}</h1>
            <p>{t(activeItem.descriptionKey)}</p>
          </div>
          <div className='playground-header__actions'>
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

        <div className='playground-content'>
          <Suspense fallback={<div className='playground-loading'>{t('loading')}</div>}>
            <ActiveComponent />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
