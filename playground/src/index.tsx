import './index.scss'
import './polyfill'
import './tdesign.fix.d'
import 'tdesign-react/es/style/index.css'

import React from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { QueriesProvider } from './hooks/useQueries'
import { I18nProvider } from './i18n'

// Vite can invalidate a hashed dynamic import while Shiki is loading a
// language grammar. The current editor already keeps a plaintext fallback;
// recover the highlighted view automatically instead of leaving that fallback
// mounted until the user refreshes manually. The URL (including playground
// query state and case hash) is retained by reload().
if (import.meta.hot) {
  const recoveryKey = 'shikitor:hmr-preload-recovery'
  const recoverPreload = (event: Event) => {
    event.preventDefault()
    const now = Date.now()
    const previous = Number(sessionStorage.getItem(recoveryKey) ?? 0)
    if (now - previous < 5000) return
    sessionStorage.setItem(recoveryKey, String(now))
    location.reload()
  }
  window.addEventListener('vite:preloadError', recoverPreload)
  import.meta.hot.dispose(() => {
    window.removeEventListener('vite:preloadError', recoverPreload)
  })
}

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
