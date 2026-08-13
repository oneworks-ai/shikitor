import './index.scss'
import './polyfill'
import './tdesign.fix.d'
import 'tdesign-react/es/style/index.css'

import React from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { QueriesProvider } from './hooks/useQueries'
import { I18nProvider } from './i18n'

createRoot(document.getElementById('app')!)
  .render(
    <React.StrictMode>
      <QueriesProvider>
        <I18nProvider>
          <App />
        </I18nProvider>
      </QueriesProvider>
    </React.StrictMode>
  )
