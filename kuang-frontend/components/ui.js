import { useEffect, useRef } from 'react'
import { fmt } from '../lib/api'
import { useUI } from '../lib/ui'

/* ---------------------------------------------------------------- surfaces */

export function Card({ title, char, subtitle, children, className = '', action, lead = false }) {
  return (
    <section className={`mb-4 rounded-[10px] border bg-surface-1 ${lead ? 'border-neon/70 glow' : 'border-line'} ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg leading-tight">
              {char && <span className="han text-base text-neon">{char}</span>}
              <span className="truncate">{title}</span>
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-fg-2">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="px-4 py-4">{children}</div>
    </section>
  )
}

export function SectionTitle({ char, children, className = '', right }) {
  return (
    <div className={`mb-3 flex items-center gap-3 ${className}`}>
      {char && <span className="han text-neon">{char}</span>}
      <h3 className="font-sans text-xs font-medium text-fg-2">{children}</h3>
      <span className="trace flex-1" />
      {right}
    </div>
  )
}

/** A lineup slot (QB, FLEX, DEF). Structural, so it gets a neutral badge. */
export function Slot({ children }) {
  return (
    <span className="nums mr-1.5 rounded-[4px] bg-surface-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-2">
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------- controls */

const BUTTON_BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[6px] px-4 min-h-11 text-sm font-medium transition-[opacity,box-shadow] disabled:cursor-not-allowed'

export function Button({ variant = 'primary', type = 'button', className = '', children, ...rest }) {
  const styles = {
    primary: 'bg-neon text-ground hover:glow-sm disabled:bg-surface-3 disabled:text-fg-3',
    quiet: 'border border-line-2 bg-surface-2 text-fg hover:border-fg-3 disabled:opacity-40',
    ghost: 'px-2 text-fg-2 hover:text-fg disabled:opacity-40',
  }[variant]
  return <button type={type} className={`${BUTTON_BASE} ${styles} ${className}`} {...rest}>{children}</button>
}

export function Field({ className = '', ...rest }) {
  return (
    <input
      className={`w-full min-h-11 rounded-[6px] border border-line-2 bg-surface-1 px-3 py-2 text-fg placeholder:text-fg-3 focus:border-neon focus:outline-none ${className}`}
      {...rest}
    />
  )
}

/** Segmented tabs. */
export function Tabs({ items, value, onChange, className = '' }) {
  return (
    <div className={`inline-flex max-w-full gap-1 overflow-x-auto rail rounded-[8px] border border-line bg-surface-1 p-1 ${className}`} role="tablist">
      {items.map((it) => {
        const active = it.id === value
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            className={`min-h-9 whitespace-nowrap rounded-[6px] px-3 text-sm transition-colors ${active ? 'bg-surface-3 text-fg' : 'text-fg-2 hover:text-fg'}`}
          >
            {it.char && <span className={`han mr-1.5 text-xs ${active ? 'text-neon' : 'text-fg-3'}`}>{it.char}</span>}
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- data bits */

export function Delta({ v, digits = 0, glow = false }) {
  if (v == null) return <span className="text-fg-3">—</span>
  const cls = v > 0 ? `text-jade ${glow ? 'text-glow-jade' : ''}` : v < 0 ? 'text-violet' : 'text-fg-3'
  return <span className={`nums ${cls}`}>{v > 0 ? '+' : ''}{fmt(v, digits)}</span>
}

const TONE = {
  high: 'border-neon/60 bg-neon-soft',
  medium: 'border-amber/50 bg-amber-soft',
  info: 'border-line bg-surface-2',
  good: 'border-jade/50 bg-jade-soft',
}

export function Note({ level = 'info', children }) {
  return <div className={`rounded-[8px] border px-3 py-2 text-sm ${TONE[level] || TONE.info}`}>{children}</div>
}

export function Pill({ tone = 'neutral', children, className = '' }) {
  const cls = {
    neutral: 'bg-surface-3 text-fg-2',
    neon: 'bg-neon-soft text-neon',
    jade: 'bg-jade-soft text-jade',
    violet: 'bg-violet-soft text-violet',
    amber: 'bg-amber-soft text-amber',
  }[tone]
  return <span className={`inline-block rounded-[4px] px-1.5 py-0.5 align-middle text-[11px] ${cls} ${className}`}>{children}</span>
}

export function Stat({ label, value, sub, char }) {
  return (
    <div className="rounded-[8px] border border-line bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-fg-2">
        {char && <span className="han text-neon">{char}</span>}
        {label}
      </div>
      <div className="mt-0.5 font-display text-xl leading-tight">{value}</div>
      {sub && <div className="text-xs text-fg-2">{sub}</div>}
    </div>
  )
}

/**
 * One dataset, two shapes: a real table once there is room for it, and stacked
 * label/value cards on a phone. Columns with no header are actions.
 */
export function DataTable({ head, rows, primary = 0, caption, dense = false }) {
  if (!rows?.length) return null
  const pad = dense ? 'px-2 py-1.5' : 'px-2 py-2'
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-2">
              {head.map((h, i) => (
                <th key={i} scope="col" className={`${pad} text-left text-[11px] font-medium text-fg-2 ${i === primary ? '' : 'whitespace-nowrap'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0 hover:bg-surface-2">
                {r.map((c, j) => (
                  <td key={j} className={`${pad} align-top ${j === primary ? '' : 'nums whitespace-nowrap'}`}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 sm:hidden">
        {rows.map((r, i) => {
          const actions = r.filter((c, j) => j !== primary && !head[j] && c)
          return (
            <li key={i} className="rounded-[8px] border border-line bg-surface-2 px-3 py-2">
              <div className="mb-1 font-medium">{r[primary]}</div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {r.map((c, j) => {
                  if (j === primary || !head[j]) return null
                  if (c === null || c === undefined || c === '' || c === '—') return null
                  return (
                    <div key={j} className="flex justify-between gap-2 border-b border-line/70 py-0.5 last:border-0">
                      <dt className="text-fg-2">{head[j]}</dt>
                      <dd className="nums text-right">{c}</dd>
                    </div>
                  )
                })}
              </dl>
              {actions.length > 0 && <div className="mt-2 flex flex-wrap gap-2 [&_button]:w-full">{actions}</div>}
            </li>
          )
        })}
      </ul>

      {caption && <p className="mt-2 text-xs text-fg-2">{caption}</p>}
    </>
  )
}

/* ---------------------------------------------------------- the almanac kit */

/**
 * Glance card: one number, one headline, one action. Three per screen.
 * `lead` spends the screen's glow budget.
 */
export function GlanceCard({ n, tone = 'neutral', title, sub, onClick, lead = false, char = '签' }) {
  const nCls = { neutral: 'text-fg', good: 'text-jade text-glow-jade', neon: 'text-neon text-glow-neon', violet: 'text-violet' }[tone]
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[10px] border bg-surface-1 px-3.5 py-3 text-left transition-colors ${
        lead ? 'border-neon/70 glow' : 'border-line hover:border-line-2'
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      <span className={`nums min-w-[64px] font-display text-[28px] leading-none ${nCls}`} style={{ fontFamily: 'var(--font-display)' }}>{n}</span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium leading-tight">{title}</span>
        {sub && <span className="mt-0.5 block text-[11.5px] leading-snug text-fg-2">{sub}</span>}
      </span>
      <span className="han text-base text-neon" aria-hidden="true">{char}</span>
    </Tag>
  )
}

/** Collapsible section with a one-line state. One open at a time, state in the URL. */
export function Slip({ id, char, title, state, open, onToggle, children, tone = 'neutral' }) {
  const stateCls = { neutral: 'text-fg-2', good: 'text-jade', neon: 'text-neon', amber: 'text-amber' }[tone]
  return (
    <section className={`mb-2 rounded-[10px] border bg-surface-1 ${open ? 'border-line-2' : 'border-line'}`}>
      <button
        type="button"
        onClick={() => onToggle(open ? null : id)}
        aria-expanded={open}
        aria-controls={`slip-${id}`}
        className="flex min-h-12 w-full items-center gap-3 px-3.5 text-left"
      >
        <span className="han w-4 text-neon">{char}</span>
        <span className="text-sm font-medium">{title}</span>
        <span className={`nums ml-auto max-w-[55%] truncate text-xs ${stateCls}`}>{state}</span>
        <span className="text-fg-3" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div id={`slip-${id}`} className="border-t border-line px-3.5 py-3">{children}</div>}
    </section>
  )
}

/** Bottom sheet on phones, right panel on desktop. Esc and backdrop close it. */
export function Sheet({ open, onClose, title, children }) {
  const closeRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl border border-line-2 bg-surface-1 shadow-sheet sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[440px] sm:max-h-none sm:rounded-none sm:border-y-0 sm:border-r-0">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface-1/95 px-4 py-3 backdrop-blur-md">
          <span className="mx-auto h-1 w-9 rounded-full bg-line-2 sm:hidden" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-base sm:text-lg">{title}</div>
          <button ref={closeRef} type="button" onClick={onClose} className="min-h-9 min-w-9 rounded-[6px] text-fg-2 hover:text-fg" aria-label="Close">✕</button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  )
}

const STATUS_DOT = (s) => {
  if (!s) return 'bg-jade'
  if (s === 'Questionable') return 'bg-amber'
  return 'bg-neon'
}

/** The universal tappable player reference. */
export function PlayerChip({ player, onClick, className = '' }) {
  if (!player) return null
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick ? () => onClick(player) : undefined}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-[6px] border border-line bg-surface-2 px-2 py-1 text-left text-[12.5px] leading-none ${onClick ? 'hover:border-fg-3' : ''} ${className}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT(player.injuryStatus)}`} aria-hidden="true" />
      <span className="truncate">{player.name}</span>
      {(player.position || player.team) && (
        <span className="nums shrink-0 text-[10.5px] text-fg-2">{[player.position, player.team].filter(Boolean).join(' · ')}</span>
      )}
    </Tag>
  )
}

/** Eighteen almanac day boxes. */
export function WeekRibbon({ currentWeek, lastWeek = 18, byes = {}, deadlineWeek, playoffWeeks = [], onWeek, selected }) {
  const { t } = useUI()
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1)
  return (
    <div>
      <div className="grid grid-cols-[repeat(18,minmax(0,1fr))] gap-[3px]" role="list" aria-label={t('Season weeks', '赛季周次')}>
        {weeks.map((w) => {
          const past = w < currentWeek
          const now = w === currentWeek
          const po = playoffWeeks.includes(w)
          const dl = w === deadlineWeek
          const marks = byes[w] || []
          const label = `${t('Week', '第')} ${w}${now ? ` · ${t('this week', '本周')}` : ''}${marks.length ? ` · ${marks.length} ${t('starters on bye', '名先发轮空')}` : ''}${dl ? ` · ${t('trade deadline', '交易截止')}` : ''}${po ? ` · ${t('playoffs', '季后赛')}` : ''}`
          const Tag = onWeek ? 'button' : 'div'
          return (
            <Tag
              key={w}
              role="listitem"
              type={onWeek ? 'button' : undefined}
              onClick={onWeek ? () => onWeek(w) : undefined}
              aria-label={label}
              title={label}
              className={`nums relative h-9 rounded-[3px] border px-1 pt-0.5 text-left text-[9px] leading-none ${
                po ? 'bg-neon-soft' : 'bg-surface-2'
              } ${now ? 'border-neon text-fg glow-sm' : selected === w ? 'border-fg-3 text-fg' : 'border-line text-fg-3'} ${past && !now ? 'opacity-45' : ''} ${dl ? 'shadow-[inset_2px_0_0_var(--color-neon)]' : ''}`}
            >
              {w}
              {marks.length > 0 && (
                <span className="absolute bottom-0.5 left-1 right-0.5 truncate text-[7.5px] text-fg">{marks.join('·')}</span>
              )}
            </Tag>
          )
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-fg-3">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-[2px] border border-neon align-[-1px]" />{t('this week', '本周')}</span>
        <span>{t('letters = starters on bye', '字母 = 先发轮空')}</span>
        {deadlineWeek && <span><i className="mr-1 inline-block h-2 w-2 rounded-[2px] border border-line align-[-1px] shadow-[inset_2px_0_0_var(--color-neon)]" />{t('deadline', '交易截止')} wk {deadlineWeek}</span>}
        {playoffWeeks.length > 0 && <span><i className="mr-1 inline-block h-2 w-2 rounded-[2px] bg-neon-soft align-[-1px]" />{t('playoffs', '季后赛')}</span>}
      </div>
    </div>
  )
}

/** Six-line meter, one per position: solid above the league average, broken below. */
export function Hexagram({ rows, compact = false }) {
  if (!rows?.length) return null
  return (
    <div className={`grid items-center gap-x-2 gap-y-1 ${compact ? 'grid-cols-[auto_36px_auto]' : 'grid-cols-[auto_56px_auto]'} text-[10.5px] text-fg-2`} aria-label="Positional strength versus league average">
      {rows.map(({ pos, v }) => {
        const up = (v ?? 0) >= 0
        return [
          <span key={`${pos}-l`} className="nums">{pos}</span>,
          <span key={`${pos}-m`} className="flex h-[3px] gap-1.5" aria-hidden="true">
            {up ? (
              <i className="block h-[3px] flex-1 rounded-sm bg-jade shadow-[0_0_6px_rgba(53,224,160,.6)]" />
            ) : (
              <>
                <i className="block h-[3px] flex-1 rounded-sm bg-violet" />
                <i className="block h-[3px] flex-1 rounded-sm bg-violet" />
              </>
            )}
          </span>,
          <span key={`${pos}-v`} className={`nums ${up ? 'text-jade' : 'text-violet'}`}>{v == null ? '—' : `${v > 0 ? '+' : ''}${fmt(v, 0)}`}</span>,
        ]
      })}
    </div>
  )
}

const VERDICT = {
  even: { char: '平', en: 'Even', zh: '持平' },
  slight: { char: '微', en: 'Slight edge', zh: '略胜' },
  clear: { char: '勝', en: 'Clear win', zh: '明胜' },
  lopsided: { char: '掠', en: 'Fleecing', zh: '大胜' },
  general: { char: '卜', en: '', zh: '' },
}

/** The verdict chop. Glows: it is the one glowing element on a result. */
export function VerdictSeal({ category = 'general', size = 56 }) {
  const v = VERDICT[category] || VERDICT.general
  return (
    <span
      className="stamp inline-flex shrink-0 items-center justify-center rounded-[6px] border-2 border-neon text-neon han glow-sm"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.52), lineHeight: 1 }}
      role="img"
      aria-label={v.en || 'verdict'}
    >
      {v.char}
    </span>
  )
}
export const verdictLabel = (category, lang) => (VERDICT[category] || VERDICT.general)[lang === 'zh' ? 'zh' : 'en']

export function OddsBar({ pct, glow = false }) {
  if (pct == null) return <span className="text-fg-3">—</span>
  return (
    <span className="flex min-w-[96px] items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
        <span className={`block h-full rounded-full ${pct >= 50 ? 'bg-jade' : 'bg-fg-2'} ${glow && pct >= 50 ? 'shadow-glow-jade' : ''}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </span>
      <span className="nums w-9 text-right text-xs">{fmt(pct, 0)}%</span>
    </span>
  )
}

/** Diverging bar for "vs league average": jade right, violet left. */
export function DivergeBar({ v, max }) {
  const m = Math.max(1, max || 1)
  const pct = Math.min(100, (Math.abs(v || 0) / m) * 100)
  return (
    <span className="relative block h-2 w-full overflow-hidden rounded-full bg-surface-3">
      <span className="absolute left-1/2 top-0 h-full w-px bg-line-2" />
      {v >= 0 ? (
        <span className="absolute left-1/2 top-0 h-full rounded-r-full bg-jade" style={{ width: `${pct / 2}%` }} />
      ) : (
        <span className="absolute right-1/2 top-0 h-full rounded-l-full bg-violet" style={{ width: `${pct / 2}%` }} />
      )}
    </span>
  )
}

/** Tabbed container for the full tables. Mounts a tab's content on first open. */
export function Ledger({ tabs, value, onChange }) {
  const active = tabs.find((t) => t.id === value) || tabs[0]
  return (
    <div>
      <Tabs items={tabs.map(({ id, label, char }) => ({ id, label, char }))} value={active.id} onChange={onChange} className="mb-3" />
      <div>{active.content}</div>
    </div>
  )
}
