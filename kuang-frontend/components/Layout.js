import Link from 'next/link'
import { useRouter } from 'next/router'
import Seal from './Seal'
import { useUI } from '../lib/ui'

const NAV = [
  { href: '/', char: '易', en: 'Trade Oracle', zh: '交易神谕' },
  { href: '/league', char: '盟', en: 'League Almanac', zh: '联盟年鉴' },
]

export default function Layout({ children, wide = false }) {
  const { t, theme, toggleTheme, toggleLang, lang } = useUI()
  const { pathname } = useRouter()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b border-paper-300 dark:border-ink-800 bg-paper-50/95 dark:bg-ink-950/95 backdrop-blur-md">
        <div className={`mx-auto flex items-center gap-3 px-4 py-2.5 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
          <Link href="/" className="flex items-center gap-2.5 min-w-0" aria-label={t('Kuangstradamus home', '康斯特拉达姆斯首页')}>
            <Seal char="谕" size={30} />
            <span className="min-w-0">
              <span className="block font-display text-[15px] leading-none tracking-[0.14em] truncate">KUANGSTRADAMUS</span>
              <span className="block han text-[10px] leading-tight text-ink-500 dark:text-ink-400 truncate">诺查丹玛斯 · 梦幻橄榄球神谕</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={toggleLang}
              className="min-h-9 rounded-sm px-2 text-xs text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-paper-100"
              aria-label={t('Switch to Chinese', '切换到英文')}
            >
              {lang === 'en' ? '中文' : 'EN'}
            </button>
            <button
              onClick={toggleTheme}
              className="min-h-9 min-w-9 rounded-sm text-sm text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-paper-100"
              aria-label={t(theme === 'dark' ? 'Light mode' : 'Dark mode', theme === 'dark' ? '浅色模式' : '深色模式')}
            >
              {theme === 'dark' ? '☼' : '☾'}
            </button>
          </div>
        </div>

        <nav className={`mx-auto flex gap-1 px-3 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`} aria-label={t('Sections', '栏目')}>
          {NAV.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-1.5 border-b-2 px-2 pb-1.5 text-sm transition-colors ${
                  active
                    ? 'border-cinnabar-600 text-ink-900 dark:text-paper-50'
                    : 'border-transparent text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-paper-100'
                }`}
              >
                <span className="han text-xs text-cinnabar-600 dark:text-cinnabar-400">{item.char}</span>
                {t(item.en, item.zh)}
              </Link>
            )
          })}
        </nav>
      </header>

      <main className={`mx-auto w-full flex-1 px-4 py-6 sm:py-8 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
        {children}
      </main>

      <footer className={`mx-auto w-full px-4 pb-8 pt-4 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <div className="rule-double pt-3 text-xs text-ink-500 dark:text-ink-400">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="han text-cinnabar-600 dark:text-cinnabar-400">签</span>
            {t(
              'Projections and league data from the free Sleeper API; forecasts from Open-Meteo.',
              '数据来自免费的 Sleeper API，天气来自 Open-Meteo。',
            )}
          </p>
          <p className="mt-1 opacity-80">
            {t(
              'The oracle reads probabilities, not certainties. Set your own lineup.',
              '神谕读的是概率，不是定数。阵容仍由你决定。',
            )}
          </p>
        </div>
      </footer>
    </div>
  )
}
