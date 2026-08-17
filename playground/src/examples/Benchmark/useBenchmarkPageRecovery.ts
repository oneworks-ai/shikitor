import { useEffect } from 'react'
import type { MutableRefObject } from 'react'

const PRELOAD_REFRESH_KEY = 'shikitor-benchmark-preload-refresh'

export function useBenchmarkPageRecovery(
  abortRef: MutableRefObject<AbortController | undefined>
) {
  useEffect(() => {
    const recoverStaleBuild = (event: Event) => {
      event.preventDefault()
      const now = Date.now()
      const previousRefresh = Number(sessionStorage.getItem(PRELOAD_REFRESH_KEY))
      if (now - previousRefresh < 15_000) return
      sessionStorage.setItem(PRELOAD_REFRESH_KEY, String(now))
      location.reload()
    }
    const guard = window.setTimeout(
      () => sessionStorage.removeItem(PRELOAD_REFRESH_KEY),
      15_000
    )
    window.addEventListener('vite:preloadError', recoverStaleBuild)
    return () => {
      window.clearTimeout(guard)
      window.removeEventListener('vite:preloadError', recoverStaleBuild)
    }
  }, [])
  useEffect(() => () => abortRef.current?.abort(), [])
}
