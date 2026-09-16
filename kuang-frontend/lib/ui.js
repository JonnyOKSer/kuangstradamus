import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const UIContext = createContext(null)
const THEME_KEY = 'kuang_theme'
const LANG_KEY = 'kuang_lang'

const read = (key, fallback) => {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
const write = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* private mode */ }
}

/** Theme and language, lifted out of the pages so the whole shell shares them. */
export function UIProvider({ children }) {
  const [theme, setTheme] = useState('light')
  const [lang, setLang] = useState('en')

  useEffect(() => {
    setTheme(read(THEME_KEY, 'light'))
    setLang(read(LANG_KEY, 'en'))
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    write(THEME_KEY, theme)
  }, [theme])

  useEffect(() => { write(LANG_KEY, lang) }, [lang])

  const t = useCallback((en, zh) => (lang === 'zh' ? zh : en), [lang])

  const value = useMemo(() => ({
    theme,
    lang,
    t,
    isZh: lang === 'zh',
    toggleTheme: () => setTheme((v) => (v === 'dark' ? 'light' : 'dark')),
    toggleLang: () => setLang((v) => (v === 'en' ? 'zh' : 'en')),
  }), [theme, lang, t])

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used inside UIProvider')
  return ctx
}
