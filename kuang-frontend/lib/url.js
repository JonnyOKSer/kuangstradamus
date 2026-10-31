import { useCallback, useEffect, useState } from 'react'

// Query-string state. The site is a static export, so every view (league,
// team, open slip, player sheet) lives in the URL: shareable, reload-safe,
// and the browser back button retraces each step.

const parse = () => {
  if (typeof window === 'undefined') return {}
  return Object.fromEntries(new URLSearchParams(window.location.search))
}

export function useQueryState() {
  const [q, setQ] = useState({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setQ(parse())
    setReady(true)
    const onPop = () => setQ(parse())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /** Merge a patch into the query. null / '' removes a key. */
  const set = useCallback((patch, { replace = false } = {}) => {
    const next = { ...parse(), ...patch }
    for (const k of Object.keys(next)) {
      if (next[k] === null || next[k] === undefined || next[k] === '') delete next[k]
    }
    const qs = new URLSearchParams(next).toString()
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url)
    setQ(next)
  }, [])

  return { q, set, ready }
}

/** Build a link to a view without navigating. */
export const href = (path, params) => {
  const clean = Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== null && v !== undefined && v !== ''))
  const qs = new URLSearchParams(clean).toString()
  return `${path}${qs ? `?${qs}` : ''}`
}
