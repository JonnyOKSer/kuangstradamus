'use client'

import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import Layout, { useMemory } from '../components/Layout'
import Seal from '../components/Seal'
import { Button, Card, DataTable, Note, PlayerChip, SectionTitle, VerdictSeal, verdictLabel } from '../components/ui'
import { api, fmt } from '../lib/api'
import { useUI } from '../lib/ui'
import { useQueryState, href } from '../lib/url'
import { recentConsults, rememberConsult, clearConsults } from '../lib/memory'

const SCORING = [
  { value: 'ppr', en: 'PPR', zh: '每次接球 1 分' },
  { value: 'half_ppr', en: 'Half PPR', zh: '每次接球 0.5 分' },
  { value: 'std', en: 'Standard', zh: '标准计分' },
]

let nextId = 1

export default function Home() {
  const { t, lang } = useUI()
  const { q, ready } = useQueryState()
  const { leagues, home } = useMemory()
  const [input, setInput] = useState('')
  const [scoring, setScoring] = useState('ppr')
  const [consultations, setConsultations] = useState([])
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const autoRan = useRef(false)

  useEffect(() => { setRecent(recentConsults()) }, [])

  // default scoring context: the league in the URL, else the remembered home league
  useEffect(() => {
    if (!ready) return
    if (q.l) setScoring(`league:${q.l}`)
    else if (home) setScoring(`league:${home.league.id}`)
  }, [ready, q.l, home])

  // deep links: ?q=message, or ?give=A&get=B from the Almanac's trade targets
  useEffect(() => {
    if (!ready || autoRan.current) return
    const message = q.q || (q.give || q.get ? `${q.give || ''} for ${q.get || ''}`.trim() : '')
    if (!message) return
    setInput(message)
    autoRan.current = true
    if (q.q || (q.give && q.get)) ask(message, q.l ? `league:${q.l}` : null)
    else inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const ask = async (message, ctx) => {
    const text = (message || '').trim()
    if (!text || loading) return
    const context = ctx || scoring
    setLoading(true)
    setError('')
    try {
      const body = { message: text, lang }
      if (context.startsWith('league:')) body.leagueId = context.slice(7)
      else body.scoring = context
      const data = await api('/api/chat', { method: 'POST', body })
      setConsultations((prev) => [{ id: nextId++, query: text, reply: data.reply, proverb: data.proverb, analysis: data.analysis, context }, ...prev])
      rememberConsult({ query: text, category: data.analysis?.category || 'general', context })
      setRecent(recentConsults())
      setInput('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const submit = (e) => { e.preventDefault(); ask(input) }
  const startOver = () => { setConsultations([]); setError(''); setInput(''); inputRef.current?.focus() }

  const contextLabel = (ctx) => {
    if (!ctx) return ''
    if (ctx.startsWith('league:')) return leagues.find((l) => l.id === ctx.slice(7))?.name || t('league rules', '联盟规则')
    return SCORING.find((s) => s.value === ctx)?.[lang === 'zh' ? 'zh' : 'en'] || ctx
  }

  return (
    <Layout>
      <Head><title>{t('Kuangstradamus · The Oracle', '诺查丹玛斯 · 神谕')}</title></Head>

      <Hero />

      <form onSubmit={submit} className="mb-5">
        <SectionTitle char="问">{t('Put a trade to the oracle', '向神谕提问')}</SectionTitle>
        <div className="rounded-[10px] border border-line bg-surface-1 p-3 focus-within:border-neon">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e) }}
            rows={3}
            placeholder={t('Christian McCaffrey and Puka Nacua for Bijan Robinson, Jake Ferguson and a 2027 1st', '例如：Christian McCaffrey and Puka Nacua for Bijan Robinson（请用英文球员名）')}
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-fg placeholder:text-fg-3 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
            <label className="sr-only" htmlFor="scoring">{t('Scored as', '计分方式')}</label>
            <span className="text-xs text-fg-2">{t('Scored as', '计分')}</span>
            <select
              id="scoring"
              value={scoring}
              onChange={(e) => setScoring(e.target.value)}
              className="min-h-9 max-w-[220px] rounded-[6px] border border-line bg-surface-2 px-2 text-sm text-fg"
            >
              {leagues.map((l) => <option key={l.id} value={`league:${l.id}`}>{l.name}</option>)}
              {scoring.startsWith('league:') && !leagues.some((l) => `league:${l.id}` === scoring) && (
                <option value={scoring}>{t('This league\'s rules', '本联盟规则')}</option>
              )}
              {SCORING.map((s) => <option key={s.value} value={s.value}>{lang === 'zh' ? s.zh : s.en}</option>)}
            </select>
            <div className="ml-auto flex items-center gap-2">
              {consultations.length > 0 && <Button variant="ghost" onClick={startOver}>↺ {t('Start over', '重新开始')}</Button>}
              <Button type="submit" disabled={loading || !input.trim()}>
                {loading ? t('Consulting…', '占卜中……') : <><span className="han">卜</span> {t('Summon the Prophecy', '召唤预言')}</>}
              </Button>
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-xs text-fg-3">
          {t('What you give, then “for”, then what you get. ⌘↵ to send.', '先写你给出的，再写 “for”，再写你得到的。⌘↵ 发送。')}
          {leagues.length === 0 && <> · <Link href="/league" className="text-neon">{t('Import your league', '导入你的联盟')}</Link> {t('to score trades in its rules.', '以按联盟规则计分。')}</>}
        </p>
      </form>

      {recent.length > 0 && consultations.length === 0 && (
        <div className="mb-5">
          <SectionTitle char="忆" right={<button type="button" onClick={() => { clearConsults(); setRecent([]) }} className="text-xs text-fg-3 hover:text-fg">{t('clear', '清除')}</button>}>{t('Recent', '最近')}</SectionTitle>
          <div className="rail flex gap-2 overflow-x-auto pb-1">
            {recent.map((c) => (
              <button key={c.query} type="button" onClick={() => { setInput(c.query); ask(c.query, c.context) }} className="flex shrink-0 items-center gap-2 rounded-[8px] border border-line bg-surface-1 px-3 py-2 text-left text-xs hover:border-line-2">
                <Chop category={c.category} />
                <span className="max-w-[220px] truncate">{c.query}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="mb-5"><Note level="high">⚠️ {error}</Note></div>}
      {loading && <p className="mb-5 font-display text-xl text-fg-3">{t('The oracle consults the stars…', '神谕正在观星……')}</p>}

      {consultations.map((c, i) => <Prophecy key={c.id} consultation={c} latest={i === 0} contextLabel={contextLabel} />)}

      <AlmanacDoor home={home} />
    </Layout>
  )
}

/** The verdict glyph for a remembered consultation. Literal characters per branch so the han guard can see them. */
function Chop({ category }) {
  if (category === 'even') return <span className="han text-neon">平</span>
  if (category === 'slight') return <span className="han text-neon">微</span>
  if (category === 'clear') return <span className="han text-neon">勝</span>
  if (category === 'lopsided') return <span className="han text-neon">掠</span>
  return <span className="han text-neon">卜</span>
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  const { t } = useUI()
  return (
    <div className="mb-7 flex items-center gap-4 sm:gap-5">
      <div className="relative shrink-0">
        <Image src="/kuang.png" alt={t('Portrait of Kuangstradamus', '康斯特拉达姆斯画像')} width={320} height={320} unoptimized priority className="h-24 w-24 rounded-[10px] object-cover sm:h-28 sm:w-28" />
        <span className="pointer-events-none absolute inset-0 rounded-[10px] ring-1 ring-inset ring-line-2" />
        <Seal char="谕" size={26} className="absolute -bottom-2 -right-2 bg-ground" />
      </div>
      <div className="min-w-0">
        <p className="han text-[11px] tracking-[0.3em] text-neon">梦幻橄榄球神谕</p>
        <h1 className="mt-0.5 text-3xl leading-tight sm:text-4xl">{t('The Oracle', '神谕')}</h1>
        <p className="mt-1.5 max-w-md text-sm text-fg-2">
          {t('A verdict on any trade, measured in points above a free replacement, in your league\'s own scoring.', '任何交易的判词，以高于免费替补的分数衡量，按你联盟的规则计分。')}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------- one consultation */

function Prophecy({ consultation, latest, contextLabel }) {
  const { t, lang } = useUI()
  const [slip, setSlip] = useState(false)
  const [ledger, setLedger] = useState(false)
  const { query, reply, proverb, analysis: a = {}, context } = consultation
  const players = a.players || {}
  const give = players.teamA || []
  const get = players.teamB || []

  const belowReplacement = !a.incomplete && (a.teamAValue ?? 0) <= 0 && (a.teamBValue ?? 0) <= 0
  const giveVal = belowReplacement ? Number(a.teamAPoints) : a.teamAValue
  const getVal = belowReplacement ? Number(a.teamBPoints) : a.teamBValue
  const peak = Math.max(giveVal || 0, getVal || 0, 1)

  const headline = a.incomplete ? null
    : a.winner === 'B' ? t('You get the better end', '你得到的更多')
      : a.winner === 'A' ? t('You give more than you get', '你付出的多于所得')
        : t('An even exchange', '势均力敌的交易')

  return (
    <Card className="mb-4">
      <p className="mb-3 flex items-start gap-2 text-sm text-fg-2">
        <span className="han shrink-0 text-neon">问</span>
        <span className="italic">“{query}”</span>
        {context && <span className="ml-auto shrink-0 text-[11px] text-fg-3">{contextLabel(context)}</span>}
      </p>

      {a.incomplete ? (
        <Note level="high">
          {reply}
          {a.unmatched?.some((u) => u.suggestions?.length) && (
            <span className="mt-1 block text-xs">{t('Did you mean:', '是否想找：')} {a.unmatched.flatMap((u) => u.suggestions || []).slice(0, 4).map((s) => s.name || s).join(', ')}</span>
          )}
        </Note>
      ) : (
        <>
          <div className="flex items-center gap-4">
            {latest ? <VerdictSeal category={a.category} /> : <VerdictSeal category={a.category} size={44} />}
            <div className="min-w-0">
              <p className="font-display text-2xl leading-tight sm:text-[28px]">{headline}</p>
              <p className="mt-0.5 text-xs text-fg-2">{verdictLabel(a.category, lang)}{a.winner && a.marginPct ? ` · ${fmt(a.marginPct, 0)}% ${t('more value', '价值差')}` : ''}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Side label={t('You give', '你给出')} items={give} value={giveVal} peak={peak} points={a.teamAPoints} tone={a.winner === 'A' ? 'violet' : a.winner === 'B' ? 'neutral' : 'neutral'} belowReplacement={belowReplacement} />
            <Side label={t('You get', '你得到')} items={get} value={getVal} peak={peak} points={a.teamBPoints} tone={a.winner === 'B' ? 'jade' : 'neutral'} belowReplacement={belowReplacement} />
          </div>

          <p className="mt-3 text-sm leading-relaxed text-fg-2">{reply}</p>
        </>
      )}

      {proverb?.[lang] && (
        <blockquote className="mt-4 border-l-2 border-neon pl-4">
          <p className="font-display text-lg italic leading-snug">{proverb[lang]}</p>
        </blockquote>
      )}

      {(give.length || get.length) > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <button type="button" onClick={() => setSlip(!slip)} aria-expanded={slip} className="inline-flex min-h-9 items-center gap-1.5 text-neon hover:opacity-80">
            <span className="han text-xs">签</span>{slip ? t('Close the slip', '合上签') : t('Open the slip', '拆签')}
          </button>
          {slip && (
            <button type="button" onClick={() => setLedger(!ledger)} aria-expanded={ledger} className="inline-flex min-h-9 items-center gap-1.5 text-fg-2 hover:text-fg">
              <span className="han text-xs">籍</span>{ledger ? t('Close the ledger', '合上记录') : t('Consult the ledger', '查记录')}
            </button>
          )}
        </div>
      )}

      {slip && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {[['give', give], ['get', get]].map(([side, list]) => (
            <ul key={side} className="space-y-1.5">
              {list.map((p) => (
                <li key={p.id || p.name} className="rounded-[8px] border border-line bg-surface-2 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {p.type === 'pick' ? <span className="font-medium">{p.name}</span> : <PlayerChip player={p} />}
                    <span className="nums"><b>{fmt(p.value)}</b> <span className="text-xs text-fg-2">{t('value', '价值')}</span></span>
                  </div>
                  <p className="nums mt-1 text-xs text-fg-2">
                    {p.type === 'pick' ? t(`counted at ${fmt(p.value)} of ${fmt(p.rawValue)} when used`, `按 ${fmt(p.value)} 计（使用时 ${fmt(p.rawValue)}）`) : <>{fmt(p.points)} {t('ROS pts', '剩余分')}{p.rank ? ` · ${p.rank}` : ''}{p.byeWeek ? ` · ${t('bye', '轮空')} ${p.byeWeek}` : ''}</>}
                  </p>
                  {p.flags?.length > 0 && <p className="mt-0.5 text-xs text-amber">{p.flags.map((f) => f.text).join(' · ')}</p>}
                </li>
              ))}
            </ul>
          ))}
        </div>
      )}

      {slip && ledger && (
        <div className="mt-3">
          <DataTable
            dense
            head={[t('Player', '球员'), t('Side', '方'), t('Pos', '位置'), t('Team', '球队'), t('ROS pts', '剩余分'), t('Value', '价值'), t('Rank', '排名'), t('Bye', '轮空'), t('Notes', '备注')]}
            rows={[...give.map((p) => row(p, t('give', '给'))), ...get.map((p) => row(p, t('get', '得')))]}
            caption={a.context ? t(`Value = rest-of-season points above a free replacement. ${a.context.season} weeks ${a.context.fromWeek}–${a.context.throughWeek} · ${a.context.scoring} · ${a.context.source}`, `价值 = 剩余赛季得分减去可免费获得的替补。${a.context.season} 赛季第 ${a.context.fromWeek}–${a.context.throughWeek} 周 · ${a.context.scoring}`) : null}
          />
        </div>
      )}
    </Card>
  )
}

function row(p, side) {
  return [p.name, side, p.position, p.team || '—', fmt(p.points), <b key="v">{fmt(p.value)}</b>, p.rank || '—', p.byeWeek || '—', <span key="f" className="text-xs">{p.flags?.length ? p.flags.map((f) => f.text).join(' · ') : p.injuryStatus || '—'}</span>]
}

function Side({ label, items, value, peak, points, tone, belowReplacement }) {
  const { t } = useUI()
  const pct = Math.max(3, Math.round(((value || 0) / peak) * 100))
  const bar = tone === 'jade' ? 'bg-jade shadow-glow-jade' : tone === 'violet' ? 'bg-violet' : 'bg-fg-3'
  const num = tone === 'jade' ? 'text-jade' : tone === 'violet' ? 'text-violet' : ''
  return (
    <div className={`rounded-[8px] border bg-surface-2 px-3 py-2.5 ${tone === 'jade' ? 'border-jade/50' : 'border-line'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-fg-2">{label}</span>
        <span className={`nums font-display text-2xl leading-none ${num}`}>{fmt(value)}<span className="ml-1 font-sans text-[10px] text-fg-3">{belowReplacement ? t('pts', '分') : t('value', '价值')}</span></span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {items.map((p) => <PlayerChip key={p.id || p.name} player={p.type === 'pick' ? { name: p.name } : p} />)}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} /></div>
      <p className="nums mt-1 text-[11px] text-fg-3">{points} {t('rest-of-season pts', '剩余赛季分')}</p>
    </div>
  )
}

/* ------------------------------------------------------------ almanac door */

function AlmanacDoor({ home }) {
  const { t } = useUI()
  const target = home ? href('/league', { l: home.league.id, t: home.team.rosterId }) : '/league'
  return (
    <Link href={target} className="group mt-2 block rounded-[10px] border border-line bg-surface-1 p-4 transition-colors hover:border-neon">
      <div className="flex items-center gap-4">
        <Seal char="盟" size={40} />
        <div className="min-w-0 flex-1">
          <p className="han text-[11px] tracking-[0.25em] text-neon">联盟年鉴</p>
          <h2 className="text-xl leading-tight">{home ? t(`${home.team.teamName}: this week's reading`, `${home.team.teamName}：本周签文`) : t('The Almanac', '年鉴')}</h2>
          <p className="mt-0.5 text-sm text-fg-2">
            {home
              ? t('Lineup, waivers and the next date that matters, scored in your league\'s rules.', '阵容、自由球员与下一个关键日期，按你联盟的规则计算。')
              : t('Import any Sleeper league: your week first, then standings, luck, playoff odds and deep waiver sleepers.', '导入任意 Sleeper 联盟：先看你的这一周，再看名次、运气、晋级概率与深度捡漏。')}
          </p>
        </div>
        <span className="hidden shrink-0 text-2xl text-fg-3 transition-colors group-hover:text-neon sm:block" aria-hidden="true">→</span>
      </div>
    </Link>
  )
}
