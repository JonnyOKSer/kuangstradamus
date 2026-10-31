import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Seal from './Seal'
import { useUI } from '../lib/ui'
import { api } from '../lib/api'
import { homeTeam, rememberedLeagues, MEMORY_EVENT } from '../lib/memory'
import { href } from '../lib/url'

let stateCache = null
/** Current NFL week, fetched once per page load and shared by the shell. */
export function useNflState() {
  const [state, setState] = useState(stateCache)
  useEffect(() => {
    if (stateCache) return
    api('/api/state').then((s) => { stateCache = s; setState(s) }).catch(() => {})
  }, [])
  return state
}

/** What the almanac remembers, re-read whenever memory changes. */
export function useMemory() {
  const [mem, setMem] = useState({ leagues: [], home: null })
  useEffect(() => {
    const read = () => setMem({ leagues: rememberedLeagues(), home: homeTeam() })
    read()
    window.addEventListener(MEMORY_EVENT, read)
    return () => window.removeEventListener(MEMORY_EVENT, read)
  }, [])
  return mem
}

export default function Layout({ children, wide = false }) {
  const { t, toggleLang, lang } = useUI()
  const { pathname } = useRouter()
  const state = useNflState()
  const { home } = useMemory()
  const width = wide ? 'max-w-6xl' : 'max-w-3xl'

  const almanacHref = home ? href('/league', { l: home.league.id, t: home.team.rosterId }) : '/league'
  const nav = [
    { href: '/', char: '易', en: 'Oracle', zh: '神谕', active: pathname === '/' },
    { href: almanacHref, char: '盟', en: 'Almanac', zh: '年鉴', active: pathname === '/league' },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-ground/90 backdrop-blur-md">
        <div className={`mx-auto flex items-center gap-3 px-4 py-2.5 ${width}`}>
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label={t('Kuangstradamus home', '康斯特拉达姆斯首页')}>
            <Seal char="谕" size={30} />
            <span className="min-w-0">
              <span className="block truncate font-display text-[17px] leading-none tracking-[0.02em]">Kuangstradamus</span>
              <span className="han block truncate text-[10px] leading-tight text-fg-2">诺查丹玛斯 · 梦幻橄榄球神谕</span>
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 sm:flex" aria-label={t('Sections', '栏目')}>
            {nav.map((item) => (
              <Link
                key={item.en}
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                className={`flex min-h-9 items-center gap-1.5 rounded-[6px] px-2.5 text-sm transition-colors ${item.active ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:text-fg'}`}
              >
                <span className={`han text-xs ${item.active ? 'text-neon' : 'text-fg-3'}`}>{item.char}</span>
                {t(item.en, item.zh)}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {home && (
              <Link href={almanacHref} className="hidden max-w-[180px] items-center gap-1.5 truncate rounded-[6px] border border-line bg-surface-1 px-2 py-1 text-xs text-fg-2 hover:border-line-2 md:flex" title={home.league.name}>
                <span className="h-1.5 w-1.5 rounded-full bg-jade" />
                <span className="truncate">{home.team.teamName}</span>
              </Link>
            )}
            {state?.week && (
              <span className="nums hidden text-right text-[11px] leading-tight text-fg-2 sm:block">
                <b className="block font-medium text-fg">{t('Week', '第')} {state.week}{lang === 'zh' ? ' 周' : ''}</b>
                {state.season} {state.season_type === 'regular' ? t('regular season', '常规赛') : state.season_type}
              </span>
            )}
            <button
              onClick={toggleLang}
              className="min-h-9 rounded-[6px] px-2 text-xs text-fg-2 hover:text-fg"
              aria-label={t('Switch to Chinese', '切换到英文')}
            >
              {lang === 'en' ? '中文' : 'EN'}
            </button>
          </div>
        </div>

        <nav className={`mx-auto flex gap-1 px-3 pb-1 sm:hidden ${width}`} aria-label={t('Sections', '栏目')}>
          {nav.map((item) => (
            <Link
              key={item.en}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[6px] text-sm ${item.active ? 'bg-surface-2 text-fg' : 'text-fg-2'}`}
            >
              <span className={`han text-xs ${item.active ? 'text-neon' : 'text-fg-3'}`}>{item.char}</span>
              {t(item.en, item.zh)}
            </Link>
          ))}
        </nav>
      </header>

      <main className={`mx-auto w-full flex-1 px-4 py-5 sm:py-7 ${width}`}>
        {children}
      </main>

      <footer className={`mx-auto w-full px-4 pb-8 pt-4 ${width}`}>
        <div className="trace mb-3" />
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-2">
          <span className="han text-neon">签</span>
          {t('Projections and league data from the free Sleeper API; forecasts from Open-Meteo.', '数据来自免费的 Sleeper API，天气来自 Open-Meteo。')}
        </p>
        <p className="mt-1 text-xs text-fg-3">
          {t('The oracle reads probabilities, not certainties. Set your own lineup.', '神谕读的是概率，不是定数。阵容仍由你决定。')}
        </p>
      </footer>
    </div>
  )
}
