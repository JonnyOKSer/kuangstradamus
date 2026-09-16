'use client'

import { useRef, useState } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import Layout from '../components/Layout'
import Seal from '../components/Seal'
import { Button, Card, DataTable, Note, SectionTitle } from '../components/ui'
import { api, fmt } from '../lib/api'
import { useUI } from '../lib/ui'

const SCORING = [
  { value: 'ppr', en: 'PPR', zh: '每次接球 1 分' },
  { value: 'half_ppr', en: 'Half PPR', zh: '每次接球 0.5 分' },
  { value: 'std', en: 'Standard', zh: '标准计分' },
]

let nextId = 1

export default function Home() {
  const { t, lang } = useUI()
  const [input, setInput] = useState('')
  const [scoring, setScoring] = useState('ppr')
  const [consultations, setConsultations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const ask = async (e) => {
    e.preventDefault()
    const message = input.trim()
    if (!message || loading) return

    setLoading(true)
    setError('')
    try {
      const data = await api('/api/chat', { method: 'POST', body: { message, lang, scoring } })
      setConsultations((prev) => [
        { id: nextId++, query: message, reply: data.reply, proverb: data.proverb, analysis: data.analysis },
        ...prev,
      ])
      setInput('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const startOver = () => {
    setConsultations([])
    setError('')
    setInput('')
    inputRef.current?.focus()
  }

  return (
    <Layout>
      <Head>
        <title>{t('Kuangstradamus · Fantasy Football Insights', '诺查丹玛斯 · 梦幻橄榄球洞察')}</title>
      </Head>

      <Hero />

      <form onSubmit={ask} className="mb-6">
        <SectionTitle char="问">{t('Put a trade to the oracle', '向神谕提问')}</SectionTitle>

        <div className="rounded-sm border border-paper-300 dark:border-ink-700 bg-paper-100/70 dark:bg-ink-900/70 p-3 focus-within:border-cinnabar-500">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') ask(e)
            }}
            rows={3}
            placeholder={t(
              'Christian McCaffrey and Puka Nacua for Bijan Robinson, Jake Ferguson and a 2027 1st',
              '例如：Christian McCaffrey and Puka Nacua for Bijan Robinson（请用英文球员名）',
            )}
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed placeholder:text-ink-400 dark:placeholder:text-ink-500 focus:outline-none"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-paper-200 dark:border-ink-800 pt-2">
            <label className="sr-only" htmlFor="scoring">{t('Scoring format', '计分方式')}</label>
            <select
              id="scoring"
              value={scoring}
              onChange={(e) => setScoring(e.target.value)}
              className="min-h-10 rounded-sm border border-paper-300 dark:border-ink-700 bg-paper-50 dark:bg-ink-900 px-2 text-sm"
            >
              {SCORING.map((s) => (
                <option key={s.value} value={s.value}>{lang === 'zh' ? s.zh : s.en}</option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-2">
              {consultations.length > 0 && (
                <Button type="button" variant="ghost" onClick={startOver}>
                  ↺ {t('Ok, start over', '重新开始')}
                </Button>
              )}
              <Button type="submit" disabled={loading || !input.trim()}>
                {loading ? t('Consulting…', '占卜中……') : <><Seal char="卜" size={18} /> {t('Summon the Prophecy', '召唤预言')}</>}
              </Button>
            </div>
          </div>
        </div>

        <p className="mt-1.5 text-xs text-ink-400 dark:text-ink-500">
          {t('Name both sides, separated by “for”. ⌘↵ to send.', '两边球员之间用 “for” 分隔。⌘↵ 发送。')}
        </p>
      </form>

      {error && (
        <div className="mb-5">
          <Note level="high">⚠️ {error}</Note>
        </div>
      )}

      {loading && (
        <p className="mb-5 font-display text-lg text-ink-400 dark:text-ink-500">
          {t('The oracle consults the stars…', '神谕正在观星……')}
        </p>
      )}

      {consultations.map((c) => <Prophecy key={c.id} consultation={c} />)}

      <LeagueDoor />
    </Layout>
  )
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  const { t } = useUI()
  return (
    <div className="mb-8 flex flex-col items-center gap-5 text-center sm:flex-row sm:items-end sm:text-left">
      <div className="relative shrink-0">
        <Image
          src="/kuang.png"
          alt={t('Portrait of Kuangstradamus', '康斯特拉达姆斯画像')}
          width={420}
          height={420}
          unoptimized
          priority
          className="h-36 w-36 rounded-sm object-cover sm:h-44 sm:w-44"
        />
        <span className="pointer-events-none absolute inset-0 rounded-sm ring-1 ring-inset ring-paper-400/60 dark:ring-ink-700" />
        <Seal char="谕" size={30} className="absolute -bottom-2 -right-2" />
      </div>

      <div className="min-w-0">
        <p className="han text-xs tracking-[0.3em] text-cinnabar-600 dark:text-cinnabar-400">梦幻橄榄球神谕</p>
        <h1 className="mt-1 font-display text-3xl leading-tight tracking-[0.06em] sm:text-4xl">
          Fantasy Football Insights
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500 dark:text-ink-300">
          {t(
            'Two readings from one oracle: a verdict on any trade, and a full account of your league — lineups weighed against form, matchup and weather.',
            '一位神谕，两种解读：任何交易的判词，以及你所在联盟的全貌——阵容会结合状态、对位与天气一并权衡。',
          )}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------- one consultation */

const VERDICT_ZH = {
  even: '势均力敌',
  slight: '略占上风',
  clear: '明显获胜',
  lopsided: '大获全胜',
}

function Prophecy({ consultation }) {
  const { t, lang } = useUI()
  const [open, setOpen] = useState(false)
  const { query, reply, proverb, analysis } = consultation
  const a = analysis || {}
  const players = a.players || {}

  const names = (side) => (players[side] || []).map((p) => p.name).join(' + ') || '—'
  const belowReplacement = !a.incomplete && (a.teamAValue ?? 0) <= 0 && (a.teamBValue ?? 0) <= 0
  const aVal = belowReplacement ? Number(a.teamAPoints) : a.teamAValue
  const bVal = belowReplacement ? Number(a.teamBPoints) : a.teamBValue
  const peak = Math.max(aVal || 0, bVal || 0, 1)

  const verdictText = lang === 'zh' && !a.incomplete
    ? `${a.winner ? (a.winner === 'A' ? 'A 方' : 'B 方') : ''}${VERDICT_ZH[a.category] || ''}`.trim()
    : a.verdict

  return (
    <Card className="mb-5">
      <p className="mb-4 flex items-start gap-2 text-sm text-ink-500 dark:text-ink-400">
        <span className="han shrink-0 text-cinnabar-600 dark:text-cinnabar-400">问</span>
        <span className="italic">“{query}”</span>
      </p>

      {a.incomplete ? (
        <Note level="high">{reply}</Note>
      ) : (
        <>
          <p className="font-display text-2xl leading-tight sm:text-[28px]">{verdictText}</p>

          <div className="mt-4 space-y-3">
            <Side label="A" name={names('teamA')} value={aVal} peak={peak} points={a.teamAPoints} winner={a.winner === 'A'} belowReplacement={belowReplacement} />
            <Side label="B" name={names('teamB')} value={bVal} peak={peak} points={a.teamBPoints} winner={a.winner === 'B'} belowReplacement={belowReplacement} />
          </div>

          <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{reply}</p>
        </>
      )}

      {proverb?.[lang] && (
        <blockquote className="mt-5 border-l-2 border-cinnabar-600 pl-4">
          <p className="font-display text-lg italic leading-snug">{proverb[lang]}</p>
        </blockquote>
      )}

      {(players.teamA?.length || players.teamB?.length) > 0 && (
        <>
          <button
            onClick={() => setOpen(!open)}
            className="mt-5 inline-flex min-h-10 items-center gap-2 text-sm text-cinnabar-700 hover:opacity-80 dark:text-cinnabar-400"
            aria-expanded={open}
          >
            <span className="han text-xs">签</span>
            {open ? t('Close the Tenth Quatrain', '合上第十诗节') : t('Enter the Tenth Quatrain', '进入第十诗节')}
            <span aria-hidden="true">{open ? '↑' : '↓'}</span>
          </button>

          {open && (
            <div className="mt-3">
              <DataTable
                head={[t('Player', '球员'), t('Side', '方'), t('Pos', '位置'), t('Team', '球队'), t('ROS pts', '剩余分'), t('Value', '价值'), t('Rank', '排名'), t('Bye', '轮空'), t('Notes', '备注')]}
                rows={[
                  ...(players.teamA || []).map((p) => playerRow(p, 'A')),
                  ...(players.teamB || []).map((p) => playerRow(p, 'B')),
                ]}
                caption={a.context
                  ? t(
                    `Value = rest-of-season points above a free replacement. ${a.context.season} weeks ${a.context.fromWeek}–${a.context.throughWeek} · ${a.context.scoring} · ${a.context.source}`,
                    `价值 = 剩余赛季得分减去可免费获得的替补。${a.context.season} 赛季第 ${a.context.fromWeek}–${a.context.throughWeek} 周 · ${a.context.scoring}`,
                  )
                  : null}
              />
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function playerRow(p, side) {
  return [
    <span key="n">
      {p.name}
      {p.matchedFrom && p.matchedFrom.toLowerCase() !== p.name.toLowerCase() && (
        <span className="block text-xs text-ink-400">from “{p.matchedFrom}”</span>
      )}
    </span>,
    side,
    p.position,
    p.team || '—',
    fmt(p.points),
    <b key="v">{fmt(p.value)}</b>,
    p.rank || '—',
    p.byeWeek || '—',
    <span key="f" className="text-xs">
      {p.flags?.length ? p.flags.map((f) => f.text).join(' · ') : p.injuryStatus || '—'}
    </span>,
  ]
}

function Side({ label, name, value, peak, points, winner, belowReplacement }) {
  const { t } = useUI()
  const pct = Math.max(3, Math.round(((value || 0) / peak) * 100))
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm">
          <span className="mr-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-400">{label}</span>
          {name}
          {winner && <span className="han ml-1.5 text-cinnabar-600 dark:text-cinnabar-400">勝</span>}
        </span>
        <span className="nums shrink-0 text-sm">
          {fmt(value)}
          <span className="ml-1 text-xs text-ink-400">{belowReplacement ? t('pts', '分') : t('value', '价值')}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-200 dark:bg-ink-800">
        <div
          className={`h-full rounded-full ${winner ? 'bg-cinnabar-600' : 'bg-ink-400 dark:bg-ink-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-0.5 text-xs text-ink-400 dark:text-ink-500 nums">{points} {t('ROS pts', '剩余赛季分')}</p>
    </div>
  )
}

/* ------------------------------------------------------------ league door */

function LeagueDoor() {
  const { t } = useUI()
  return (
    <Link
      href="/league"
      className="group mt-2 block rounded-sm border border-paper-300 dark:border-ink-700 bg-paper-100/60 dark:bg-ink-900/60 p-5 transition-colors hover:border-cinnabar-500"
    >
      <div className="flex items-center gap-4">
        <Seal char="盟" size={40} />
        <div className="min-w-0 flex-1">
          <p className="han text-[11px] tracking-[0.25em] text-cinnabar-600 dark:text-cinnabar-400">联盟年鉴</p>
          <h2 className="font-display text-xl leading-tight">{t('The League Almanac', '联盟年鉴')}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-500 dark:text-ink-300">
            {t(
              'Import any Sleeper league: standings and luck, start/sit weighed against form, matchup and weather, deep waiver sleepers, and every date that matters.',
              '导入任意 Sleeper 联盟：战绩与运气、结合状态对位天气的先发建议、深度捡漏人选，以及所有关键日期。',
            )}
          </p>
        </div>
        <span className="hidden shrink-0 text-2xl text-ink-300 transition-colors group-hover:text-cinnabar-600 sm:block" aria-hidden="true">→</span>
      </div>
    </Link>
  )
}
