import { fmt } from '../lib/api'

/* ---------------------------------------------------------------- surfaces */

export function Card({ title, char, subtitle, children, className = '', action }) {
  return (
    <section className={`mb-5 rounded-sm border border-paper-300 dark:border-ink-700 bg-paper-100/70 dark:bg-ink-900/70 backdrop-blur-[1px] ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-paper-300 dark:border-ink-700 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg leading-tight">
              {char && <span className="han text-cinnabar-600 dark:text-cinnabar-400 text-base">{char}</span>}
              <span className="truncate">{title}</span>
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-300">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  )
}

/** A section heading with the hairline rule of a printed page. */
export function SectionTitle({ char, children, className = '' }) {
  return (
    <div className={`mb-3 flex items-center gap-3 ${className}`}>
      {char && <span className="han text-cinnabar-600 dark:text-cinnabar-400">{char}</span>}
      <h3 className="text-sm uppercase tracking-[0.18em] text-ink-500 dark:text-ink-300">{children}</h3>
      <span className="h-px flex-1 bg-paper-300 dark:bg-ink-700" />
    </div>
  )
}

/* ---------------------------------------------------------------- controls */

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-sm px-5 min-h-11 text-sm font-medium transition-opacity disabled:cursor-not-allowed'

export function Button({ variant = 'primary', className = '', children, ...rest }) {
  const styles = {
    primary: 'bg-cinnabar-600 text-paper-50 hover:opacity-90 shadow-sm disabled:bg-paper-200 disabled:text-ink-400 disabled:shadow-none dark:disabled:bg-ink-800 dark:disabled:text-ink-500',
    quiet: 'border border-paper-300 dark:border-ink-700 hover:bg-paper-200/60 dark:hover:bg-ink-800 disabled:opacity-40',
    ghost: 'text-ink-500 dark:text-ink-300 hover:text-ink-900 dark:hover:text-paper-100 px-2 disabled:opacity-40',
  }[variant]
  return <button className={`${BUTTON_BASE} ${styles} ${className}`} {...rest}>{children}</button>
}

export function Field({ className = '', ...rest }) {
  return (
    <input
      className={`w-full min-h-11 rounded-sm border border-paper-300 dark:border-ink-700 bg-paper-50 dark:bg-ink-900 px-3 py-2 placeholder:text-ink-400 dark:placeholder:text-ink-500 focus:border-cinnabar-500 focus:outline-none ${className}`}
      {...rest}
    />
  )
}

export function Tab({ active, children, ...rest }) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={`min-h-10 whitespace-nowrap border-b-2 px-3 text-sm transition-colors ${
        active
          ? 'border-cinnabar-600 text-ink-900 dark:text-paper-50'
          : 'border-transparent text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-paper-100'
      }`}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ---------------------------------------------------------------- data bits */

export function Delta({ v, digits = 0 }) {
  if (v == null) return <span className="text-ink-400">—</span>
  const cls = v > 0 ? 'text-jade-600 dark:text-jade-400' : v < 0 ? 'text-rust-600 dark:text-rust-400' : 'text-ink-400'
  return <span className={`nums ${cls}`}>{v > 0 ? '+' : ''}{fmt(v, digits)}</span>
}

export function Stat({ label, value, sub, char }) {
  return (
    <div className="rounded-sm border border-paper-300 dark:border-ink-700 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
        {char && <span className="han text-cinnabar-600 dark:text-cinnabar-400">{char}</span>}
        {label}
      </div>
      <div className="mt-0.5 font-display text-lg leading-tight">{value}</div>
      {sub && <div className="text-xs text-ink-500 dark:text-ink-300">{sub}</div>}
    </div>
  )
}

const TONE = {
  high: 'border-cinnabar-400 bg-cinnabar-500/10 dark:bg-cinnabar-500/15',
  medium: 'border-paper-400 dark:border-ink-600 bg-paper-200/60 dark:bg-ink-800/60',
  info: 'border-paper-300 dark:border-ink-700',
}

export function Note({ level = 'info', children }) {
  return <div className={`rounded-sm border px-3 py-2 text-sm ${TONE[level] || TONE.info}`}>{children}</div>
}

export function Pill({ tone = 'neutral', children }) {
  const cls = {
    neutral: 'bg-paper-200 dark:bg-ink-800 text-ink-600 dark:text-ink-300',
    accent: 'bg-cinnabar-500/15 text-cinnabar-700 dark:text-cinnabar-300',
    good: 'bg-jade-600/15 text-jade-700 dark:text-jade-400',
  }[tone]
  return <span className={`ml-1.5 rounded-sm px-1.5 py-0.5 text-[11px] align-middle ${cls}`}>{children}</span>
}

/**
 * One dataset, two shapes: a real table once there is room for it, and stacked
 * label/value cards on a phone. Fantasy data is wide — nine columns of it — and
 * a horizontally scrolling table is the fastest way to make a phone useless.
 */
export function DataTable({ head, rows, primary = 0, caption }) {
  if (!rows?.length) return null
  return (
    <>
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-paper-300 dark:border-ink-700">
              {head.map((h, i) => (
                <th
                  key={i}
                  scope="col"
                  className={`px-2 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400 ${i === primary ? '' : 'whitespace-nowrap'}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-paper-200 last:border-0 dark:border-ink-800 hover:bg-paper-200/50 dark:hover:bg-ink-800/50">
                {r.map((c, j) => (
                  <td key={j} className={`px-2 py-2 align-top ${j === primary ? '' : 'nums whitespace-nowrap'}`}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="sm:hidden space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="rounded-sm border border-paper-300 dark:border-ink-700 px-3 py-2">
            <div className="mb-1 font-medium">{r[primary]}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {r.map((c, j) => {
                if (j === primary) return null
                const label = head[j]
                if (!label || c === null || c === undefined || c === '' || c === '—') return null
                return (
                  <div key={j} className="flex justify-between gap-2 border-b border-paper-200/70 dark:border-ink-800/70 py-0.5 last:border-0">
                    <dt className="text-ink-500 dark:text-ink-400">{label}</dt>
                    <dd className="nums text-right">{c}</dd>
                  </div>
                )
              })}
            </dl>
          </li>
        ))}
      </ul>

      {caption && <p className="mt-2 text-xs text-ink-500 dark:text-ink-300">{caption}</p>}
    </>
  )
}
