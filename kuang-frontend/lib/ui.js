import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const UIContext = createContext(null)
const LANG_KEY = 'kuang_lang'

const read = (key, fallback) => {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
const write = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* private mode */ }
}

/** Language, lifted out of the pages so the whole shell shares it. The theme is dark-only now. */
export function UIProvider({ children }) {
  const [lang, setLang] = useState('en')

  useEffect(() => { setLang(read(LANG_KEY, 'en')) }, [])
  useEffect(() => { write(LANG_KEY, lang) }, [lang])

  const t = useCallback((en, zh) => (lang === 'zh' ? zh : en), [lang])

  const value = useMemo(() => ({
    lang,
    t,
    isZh: lang === 'zh',
    toggleLang: () => setLang((v) => (v === 'en' ? 'zh' : 'en')),
  }), [lang, t])

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used inside UIProvider')
  return ctx
}
