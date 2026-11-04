import { useEffect, useMemo, useState } from 'react'
import { Button, Card, DataTable, DivergeBar, GlanceCard, Hexagram, Ledger, Note, Pill, PlayerChip, SectionTitle, Slip, Slot, WeekRibbon } from '../ui'
import { api, fmt } from '../../lib/api'
import { useUI } from '../../lib/ui'
import { href } from '../../lib/url'
import { myTeam, setMyTeam } from '../../lib/memory'

const DEFAULT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

/** The heart of the almanac: today's reading, slips, ledger. */
export default function DayPage({ summary, team, loading, open, onOpen, onPlayer, onLeague, onSeason, leagueId, ledger }) {
  const { t, lang } = useUI()
  const [ledgerTab, setLedgerTab] = useState(ledger || 'roster')
  const [ledgerOpen, setLedgerOpen] = useState(!!ledger)
  const [week, setWeek] = useState(null)
  const showLedger = (tab) => { setLedgerTab(tab); setLedgerOpen(true); scrollToLedger() }

  // ?ledger=draft (from the Oracle's pick valuation) lands on that ledger tab
  useEffect(() => {
    if (!ledger || !team) return
    setLedgerTab(ledger); setLedgerOpen(true)
    const id = setTimeout(scrollToLedger, 150)
    return () => clearTimeout(id)
  }, [ledger, team])

  const L = team?.league || summary?.league
  const POS = L?.activePositions?.length ? L.activePositions : DEFAULT_POSITIONS
  const mine = myTeam(leagueId)
  const isMine = team && mine?.rosterId === team.team.rosterId
  const row = summary?.standings?.find((s) => s.rosterId === team?.team.rosterId)

  const byes = useMemo(() => {
    const out = {}
    for (const p of team?.roster || []) {
      if (!p.isStarter) continue
      for (const w of p.byeWeeks || []) (out[w] ||= []).push(p.position)
    }
    return out
  }, [team])

  if (!team) {
    return (
      <p className="font-display text-xl text-fg-3">{loading ? t('Reading the roster…', '正在解读阵容……') : t('No team selected.', '未选择队伍。')}</p>
    )
  }

  const { lineup, waivers, keyDates: dates, tradeTargets, tradeWindow } = team
  const hexRows = POS.map((p) => ({ pos: p, v: team.positionalStrength?.[p]?.vsAverage ?? null }))
  const glances = buildGlances({ team, row, t })
  const askHref = (give, get) => href('/', { give, get, l: leagueId, t: team.team.rosterId })

  const weekInfo = week ? dates?.byeOutlook?.find((b) => b.week === week) : null

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] lg:gap-6">
      <div className="min-w-0">
        {/* masthead */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs text-fg-2">
              <span className="han text-neon">队</span>
              <button type="button" onClick={onLeague} className="truncate hover:text-fg">{L.name}</button>
            </p>
            <h1 className="mt-0.5 text-[28px] leading-tight sm:text-3xl">{team.team.teamName}</h1>
            <p className="nums mt-1 text-sm text-fg-2">
              {team.team.record.wins}-{team.team.record.losses}{team.team.record.ties ? `-${team.team.record.ties}` : ''}
              {row && <> · {ordinal(row.rank, lang)} {t('of', '/')} {L.totalRosters}</>}
              {row?.playoffPct != null && <> · {fmt(row.playoffPct, 0)}% {t('playoff odds', '晋级率')}</>}
              <> · {t('starter value', '先发价值')} {fmt(team.totalStarterValue, 0)}</>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {isMine ? (
                <Pill tone="jade">{t('my team', '我的队伍')}</Pill>
              ) : (
                <button type="button" onClick={() => setMyTeam(leagueId, { rosterId: team.team.rosterId, teamName: team.team.teamName })} className="rounded-[6px] border border-line px-2 py-1 text-[11px] text-fg-2 hover:border-line-2 hover:text-fg">
                  {t('Make this my team', '设为我的队伍')}
                </button>
              )}
              <button type="button" onClick={onLeague} className="rounded-[6px] px-2 py-1 text-[11px] text-fg-2 hover:text-fg">{t('League', '联盟')} →</button>
              <button type="button" onClick={onSeason} className="rounded-[6px] px-2 py-1 text-[11px] text-fg-2 hover:text-fg">{t('Season ledger', '赛季记录')} →</button>
            </div>
          </div>
          <Hexagram rows={hexRows} />
        </div>

        {/* week ribbon */}
        <div className="mb-5">
          <WeekRibbon
            currentWeek={L.currentWeek}
            byes={byes}
            deadlineWeek={dates?.tradeDeadline?.week || null}
            playoffWeeks={L.playoffWeeks || []}
            onWeek={(w) => setWeek(w === week ? null : w)}
            selected={week}
          />
          {week && (
            <div className="mt-2 rounded-[8px] border border-line bg-surface-1 px-3 py-2 text-sm">
              <p className="font-medium">{t(`Week ${week}`, `第 ${week} 周`)}{week === L.currentWeek && <span className="ml-1 text-xs text-neon">{t('this week', '本周')}</span>}</p>
              {weekInfo ? (
                <>
                  <p className="mt-1 text-xs text-fg-2">
                    {t(`${weekInfo.playersOut} on bye`, `${weekInfo.playersOut} 人轮空`)}: {Object.entries(weekInfo.byPosition).map(([pos, names]) => `${pos}: ${names.join(', ')}`).join(' · ')}
                  </p>
                  {weekInfo.shortages.map((sh) => (
                    <p key={sh.position} className="mt-1 text-xs text-amber">
                      {t(`${sh.short} short at ${sh.position}.`, `${sh.position} 缺 ${sh.short} 人。`)}{' '}
                      {sh.waiverCover.length
                        ? `${t('Available now:', '现可签下：')} ${sh.waiverCover.map((c) => `${c.name} (${c.team}, ${fmt(c.weekPoints)})`).join(', ')}`
                        : t('No free agent covers it; trade or stash early.', '自由市场无人可补，宜提前交易或囤人。')}
                    </p>
                  ))}
                </>
              ) : (
                <p className="mt-1 text-xs text-fg-2">
                  {week < L.currentWeek ? t('Already played.', '已结束。') : (byes[week]?.length ? t(`${byes[week].length} starter(s) on bye, covered.`, `${byes[week].length} 名先发轮空，可覆盖。`) : t('No starters on bye.', '无先发轮空。'))}
                  {L.playoffWeeks?.includes(week) && ` · ${t('fantasy playoffs', '季后赛')}`}
                  {dates?.tradeDeadline?.week === week && ` · ${t('trade deadline', '交易截止')}`}
                </p>
              )}
            </div>
          )}
        </div>

        {/* today's reading */}
        <SectionTitle char="签">{t("Today's reading", '今日签文')}</SectionTitle>
        <div className="mb-5 grid gap-2">
          {glances.map((g, i) => (
            <GlanceCard key={g.id} lead={i === 0} n={g.n} tone={g.tone} title={g.title} sub={g.sub} onClick={() => onOpen(g.slip)} />
          ))}
        </div>

        {/* slips */}
        <Slip id="lineup" char="阵" title={t('Start / sit', '先发建议')} open={open === 'lineup'} onToggle={onOpen}
          state={lineup ? (lineup.moves.length ? t(`${lineup.moves.length} move${lineup.moves.length === 1 ? '' : 's'} · +${fmt(lineup.gain)}`, `${lineup.moves.length} 项调整 · +${fmt(lineup.gain)}`) : t('set', '已就绪')) : t('past season', '往季')}
          tone={lineup?.moves.length ? 'good' : 'neutral'}>
          {lineup ? <LineupSlip lineup={lineup} onPlayer={onPlayer} onLedger={() => showLedger('trace')} /> : <p className="text-sm text-fg-2">{t('Projections are only available for the current season.', '仅当前赛季提供预测。')}</p>}
        </Slip>

        <Slip id="waivers" char="补" title={t('Waivers', '自由球员')} open={open === 'waivers'} onToggle={onOpen}
          state={waivers?.targets?.length ? t(`${waivers.targets.length} targets${waivers.targets.filter((w) => w.priority && w.priority !== 'low').length ? ` · ${waivers.targets.filter((w) => w.priority && w.priority !== 'low').length} fill a need` : ''}`, `${waivers.targets.length} 个目标`) : '—'}>
          <WaiverSlip team={team} onPlayer={onPlayer} onLedger={() => showLedger('waivers')} />
        </Slip>

        <Slip id="trades" char="易" title={t('Trades', '交易')} open={open === 'trades'} onToggle={onOpen}
          state={tradeWindow?.passed ? t('deadline passed', '已过截止') : (tradeTargets?.length ? t(`${tradeTargets.length} targets${tradeWindow?.deadlineWeek ? ` · closes wk ${tradeWindow.deadlineWeek}` : ''}`, `${tradeTargets.length} 个目标`) : '—')}
          tone={tradeWindow?.passed ? 'neutral' : (tradeWindow?.weeksAway != null && tradeWindow.weeksAway <= 2 ? 'amber' : 'neutral')}>
          <TradeSlip team={team} onPlayer={onPlayer} askHref={askHref} />
        </Slip>

        <Slip id="calendar" char="历" title={t('Calendar', '日历')} open={open === 'calendar'} onToggle={onOpen}
          state={calendarState(dates, t)} tone={dates?.alerts?.some((a) => a.level === 'high') ? 'neon' : 'neutral'}>
          <CalendarSlip dates={dates} tradeWindow={tradeWindow} />
        </Slip>

        <Slip id="strength" char="势" title={t('Strength', '强弱')} open={open === 'strength'} onToggle={onOpen}
          state={strengthState(hexRows, t)}>
          <StrengthSlip rows={hexRows} team={team} onPlayer={onPlayer} />
        </Slip>

        <div className="lg:hidden">
          <div id="ledger" className="mt-6">
            <SectionTitle char="籍" right={<button type="button" onClick={() => setLedgerOpen(!ledgerOpen)} aria-expanded={ledgerOpen} className="text-xs text-neon">{ledgerOpen ? t('close', '收起') : t('open', '展开')}</button>}>{t('Ledger', '记录')}</SectionTitle>
            {ledgerOpen ? (
              <LedgerBlock team={team} tab={ledgerTab} onTab={setLedgerTab} onPlayer={onPlayer} leagueId={leagueId} />
            ) : (
              <button type="button" onClick={() => setLedgerOpen(true)} className="w-full rounded-[10px] border border-line bg-surface-1 px-3.5 py-3 text-left text-sm text-fg-2 hover:border-line-2">
                {t(`Roster (${team.roster.length}), lineup trace, held decisions, all waivers, method`, `阵容（${team.roster.length}）、阵容明细、未采纳、全部自由球员、方法`)} <span className="text-neon">→</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <SectionTitle char="籍">{t('Ledger', '记录')}</SectionTitle>
          <LedgerBlock team={team} tab={ledgerTab} onTab={setLedgerTab} onPlayer={onPlayer} compact leagueId={leagueId} />
        </div>
      </aside>
    </div>
  )
}

/* ------------------------------------------------------------ glances */

function buildGlances({ team, row, t }) {
  const { lineup, waivers, keyDates: dates, tradeWindow } = team
  const out = []

  if (lineup) {
    if (lineup.moves.length) {
      const m = lineup.moves[0]
      out.push({
        id: 'lineup', slip: 'lineup', tone: 'good', n: `+${fmt(lineup.gain)}`,
        title: t(`Start ${m.in.name}${m.out ? ` over ${m.out.name}` : ''}${lineup.moves.length > 1 ? ` and ${lineup.moves.length - 1} more` : ''}`, `先发 ${m.in.name}${m.out ? `，替下 ${m.out.name}` : ''}${lineup.moves.length > 1 ? `，另有 ${lineup.moves.length - 1} 项` : ''}`),
        sub: [m.slot, m.in.why?.[0], m.in.confidence != null ? t(`confidence ${Math.round(m.in.confidence * 100)}%`, `置信度 ${Math.round(m.in.confidence * 100)}%`) : null].filter(Boolean).join(' · '),
      })
    } else {
      out.push({ id: 'lineup', slip: 'lineup', tone: 'good', n: '✓', title: t('Lineup is set', '阵容已就绪'), sub: `${lineup.note || ''} ${t('·', '·')} ${fmt(lineup.currentTotal)} ${t('projected', '预计')}` })
    }
  }

  const w = waivers?.targets?.[0]
  if (w) {
    const faab = w.faab?.low != null ? `$${w.faab.low}${w.faab.high !== w.faab.low ? `–${w.faab.high}` : ''}` : null
    out.push({
      id: 'waivers', slip: 'waivers', tone: 'neutral', n: faab || fmt(w.nextWeekPoints),
      title: t(`${faab ? 'Bid on' : 'Add'} ${w.name}, ${w.position} ${w.team}`, `${faab ? '竞价' : '签下'} ${w.name}（${w.position} ${w.team}）`),
      sub: [w.upgradeOver ? t(`upgrade over ${w.upgradeOver.name} (+${fmt(w.upgradeOver.gain)})`, `优于 ${w.upgradeOver.name}（+${fmt(w.upgradeOver.gain)}）`) : null, w.coverageAdd ? t('best available at the position', '该位置最佳') : null, !faab ? t(`${fmt(w.nextWeekPoints)} projected this week`, `本周预计 ${fmt(w.nextWeekPoints)} 分`) : null].filter(Boolean).join(' · '),
    })
  }

  // next date: a high alert, else a bye shortage, else the deadline if close, else playoffs
  const high = dates?.alerts?.find((a) => a.level === 'high')
  const shortage = dates?.byeOutlook?.find((b) => b.shortages?.length)
  if (high) {
    out.push({ id: 'date', slip: 'calendar', tone: 'neon', n: '!', title: high.text, sub: high.action || '' })
  } else if (shortage) {
    const sh = shortage.shortages[0]
    out.push({ id: 'date', slip: 'calendar', tone: 'neon', n: t(`${sh.short} short`, `缺 ${sh.short}`), title: t(`Week ${shortage.week}: ${shortage.playersOut} starters on bye`, `第 ${shortage.week} 周：${shortage.playersOut} 名先发轮空`), sub: sh.waiverCover?.length ? t(`${sh.waiverCover[0].name} covers it from waivers`, `${sh.waiverCover[0].name} 可从自由市场补上`) : t('No free agent covers it', '自由市场无人可补') })
  } else if (tradeWindow?.deadlineWeek && !tradeWindow.passed && tradeWindow.weeksAway <= 3) {
    out.push({ id: 'date', slip: 'trades', tone: 'violet', n: t(`${tradeWindow.weeksAway} wk`, `${tradeWindow.weeksAway} 周`), title: t(`Trade deadline after week ${tradeWindow.deadlineWeek}`, `交易截止于第 ${tradeWindow.deadlineWeek} 周后`), sub: team.tradeTargets?.[0] ? t(`${team.tradeTargets[0].target.name} from ${team.tradeTargets[0].partner.teamName} fills your ${team.tradeTargets[0].position} hole`, `${team.tradeTargets[0].partner.teamName} 的 ${team.tradeTargets[0].target.name} 可补 ${team.tradeTargets[0].position}`) : '' })
  } else if (dates?.playoffs) {
    out.push({ id: 'date', slip: 'calendar', tone: 'neutral', n: row?.playoffPct != null ? `${fmt(row.playoffPct, 0)}%` : t(`${dates.playoffs.weeksAway} wk`, `${dates.playoffs.weeksAway} 周`), title: t(`Playoffs start week ${dates.playoffs.startWeek}`, `季后赛第 ${dates.playoffs.startWeek} 周开始`), sub: t(`${dates.playoffs.teams} teams qualify · ${dates.playoffs.weeksAway} weeks away`, `${dates.playoffs.teams} 队晋级 · 还有 ${dates.playoffs.weeksAway} 周`) })
  }

  return out.slice(0, 3)
}

const calendarState = (d, t) => {
  if (!d) return '—'
  const sh = d.byeOutlook?.find((b) => b.shortages?.length)
  if (sh) return t(`wk ${sh.week}: ${sh.playersOut} out, ${sh.shortages[0].short} short`, `第${sh.week}周：${sh.playersOut} 人轮空，缺 ${sh.shortages[0].short}`)
  if (d.tradeDeadline?.week && !d.tradeDeadline.passed) return t(`deadline wk ${d.tradeDeadline.week}`, `截止第 ${d.tradeDeadline.week} 周`)
  return t(`playoffs wk ${d.playoffs?.startWeek}`, `季后赛第 ${d.playoffs?.startWeek} 周`)
}

const strengthState = (rows, t) => {
  const sorted = [...rows].filter((r) => r.v != null).sort((a, b) => b.v - a.v)
  if (!sorted.length) return '—'
  return t(`${sorted[0].pos} rich · ${sorted[sorted.length - 1].pos} poor`, `${sorted[0].pos} 强 · ${sorted[sorted.length - 1].pos} 弱`)
}

const ordinal = (n, lang) => {
  if (lang === 'zh') return `第 ${n}`
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const scrollToLedger = () => {
  if (typeof document === 'undefined') return
  document.getElementById('ledger')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/* ------------------------------------------------------------ slips */

function Confidence({ v }) {
  const n = Math.round((v ?? 0) * 4)
  return (
    <span className="inline-flex gap-0.5" aria-label={`confidence ${Math.round((v ?? 0) * 100)}%`}>
      {[0, 1, 2, 3].map((i) => <i key={i} className={`h-1.5 w-1.5 rounded-full ${i < n ? 'bg-fg' : 'bg-line-2'}`} />)}
    </span>
  )
}

function LineupSlip({ lineup, onPlayer, onLedger }) {
  const { t } = useUI()
  return (
    <>
      {lineup.moves.length === 0 ? (
        <Note level="good">
          <span className="text-jade">✓</span> {lineup.note}{' '}
          <span className="nums text-fg-2">({fmt(lineup.currentTotal)} {t('projected after gates', '关卡调整后预计')})</span>
        </Note>
      ) : (
        <>
          <p className="mb-2 text-sm">
            {t('Projected gain', '预计收益')} <b className="nums text-jade">+{fmt(lineup.gain)}</b>{' '}
            <span className="nums text-xs text-fg-2">({fmt(lineup.currentTotal)} → {fmt(lineup.recommendedTotal)})</span>
          </p>
          <ul className="divide-y divide-line">
            {lineup.moves.map((m, i) => (
              <li key={i} className="py-2">
                <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 text-sm">
                  <Slot>{m.slot}</Slot>
                  <span className="min-w-0 truncate">
                    <button type="button" onClick={() => onPlayer(m.in.id)} className="font-medium hover:text-neon">{m.in.name}</button>
                    {m.out && <> <span className="text-fg-3">▸</span> <button type="button" onClick={() => onPlayer(m.out.id)} className="text-fg-2 hover:text-neon">{m.out.name}</button></>}
                  </span>
                  <span className="nums font-medium text-jade">+{fmt(m.gain)}</span>
                  <Confidence v={m.in.confidence} />
                </div>
                <p className="nums mt-1 text-xs text-fg-2">
                  {fmt(m.in.baseProjection)} → {fmt(m.in.projection)} {t('after gates', '关卡后')}
                  {m.in.why?.[0] && <> · {m.in.why[0]}</>}
                  {m.out?.reason && <> · {t('bench', '替下')} {m.out.name}: {m.out.reason}</>}
                </p>
                {m.usageConflict && <p className="mt-1 text-xs text-amber">⚠ {m.usageConflict.text}</p>}
                {m.in.weather && <p className="mt-0.5 text-xs text-fg-3">🌦 {m.in.weather}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
      {lineup.unfilled?.length > 0 && <p className="mt-2 text-sm text-neon">{t('No eligible player for:', '无人可填：')} {lineup.unfilled.join(', ')}</p>}
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-3">
        <button type="button" onClick={onLedger} className="text-neon hover:opacity-80">{t('Lineup, gate by gate', '逐关卡阵容明细')} →</button>
        {lineup.held?.length > 0 && <span>{t(`${lineup.held.length} swap${lineup.held.length === 1 ? '' : 's'} considered but held`, `${lineup.held.length} 项考虑后未采纳`)}</span>}
        <span title={t('Availability, weather and matchup adjust the projection. Role, form and game script are shown as context; backtesting says the projection already prices them in.', '可用性、天气与对位会调整预测；角色、状态与比赛走向仅作参考。')}>ⓘ {t('how gates work', '关卡说明')}</span>
      </p>
    </>
  )
}

function Faab({ est }) {
  if (!est || est.low == null) return null
  return (
    <span className="nums" title={`median $${est.median} · ${est.pctOfBudget}% of budget · ${est.sampleSize} winning bids`}>
      ${est.low}{est.low !== est.high && <>–${est.high}</>}{est.cappedByBudget && <span className="text-neon">*</span>}
    </span>
  )
}

function WaiverSlip({ team, onPlayer, onLedger }) {
  const { t } = useUI()
  const { waivers } = team
  const faabOn = team.league?.faab?.enabled
  const targets = (waivers?.targets || []).slice(0, 5)
  const sleepers = (waivers?.sleepers || []).slice(0, 3)
  if (!targets.length && !sleepers.length) return <p className="text-sm text-fg-2">{t('No free agents worth a claim right now.', '目前没有值得签下的自由球员。')}</p>
  return (
    <>
      <ul className="grid gap-2 sm:grid-cols-2">
        {targets.map((w) => (
          <li key={w.id} className="rounded-[8px] border border-line bg-surface-2 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <PlayerChip player={w} onClick={() => onPlayer(w.id)} />
              {w.priority && w.priority !== 'low' && <Pill tone="neon">{t('need', '需求')}</Pill>}
              {w.coverageAdd && <Pill>{t('best at pos', '位置最佳')}</Pill>}
            </div>
            <p className="nums mt-1.5 text-xs text-fg-2">
              {fmt(w.ros)} {t('ROS', '剩余分')} · {t('this week', '本周')} {fmt(w.nextWeekPoints)}
              {faabOn && w.faab?.low != null && <> · FAAB <Faab est={w.faab} /></>}
              {w.trendingAdds ? <> · {w.trendingAdds.toLocaleString()} {t('adds', '签入')}</> : null}
            </p>
            {w.upgradeOver && <p className="mt-0.5 text-xs text-jade">{t('upgrade over', '优于')} {w.upgradeOver.name} (+{fmt(w.upgradeOver.gain)})</p>}
          </li>
        ))}
      </ul>

      {waivers?.dropCandidates?.length > 0 && (
        <p className="mt-3 text-xs text-fg-2">
          <span className="han text-neon">舍</span> {t('Drop first:', '优先释出：')}{' '}
          {waivers.dropCandidates.map((d, i) => (
            <span key={d.id}>{i > 0 && ' · '}<button type="button" onClick={() => onPlayer(d.id)} className="hover:text-fg">{d.name}</button>{d.replacedBy ? ` → ${d.replacedBy.name} (+${fmt(d.replacedBy.gain)})` : ''}</span>
          ))}
        </p>
      )}

      {sleepers.length > 0 && (
        <div className="mt-4">
          <SectionTitle char="潜">{t('Deep sleepers', '深度捡漏')}</SectionTitle>
          <ul className="space-y-1.5">
            {sleepers.map((s) => (
              <li key={s.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <PlayerChip player={s} onClick={() => onPlayer(s.id)} />
                  <Pill tone={s.rising ? 'jade' : 'neutral'}>{s.rising ? t('rising', '上升') : t('handcuff', '替补保险')}</Pill>
                  <span className="nums text-xs text-fg-2">{t('would inherit', '可继承')} ~{fmt(s.contingentPointsPerGame)}/{t('gm', '场')}{faabOn && s.faab?.low != null && <> · <Faab est={s.faab} /></>}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-fg-3">{s.why}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-xs">
        <button type="button" onClick={onLedger} className="text-neon hover:opacity-80">{t(`All ${waivers?.targets?.length || 0} targets`, `全部 ${waivers?.targets?.length || 0} 个目标`)} →</button>
        {faabOn && <span className="ml-3 text-fg-3">{t(`FAAB from ${team.league.faab.wonSeen} winning bids in this league this season.`, `FAAB 估价依据本季联盟 ${team.league.faab.wonSeen} 次成交出价。`)}</span>}
      </p>
    </>
  )
}

function TradeSlip({ team, onPlayer, askHref }) {
  const { t } = useUI()
  const { tradeTargets, tradeWindow } = team
  if (tradeWindow?.passed) return <Note>🔒 {tradeWindow.note}</Note>
  if (!tradeTargets?.length) return <p className="text-sm text-fg-2">{t('No trade clearly improves your starters right now.', '目前没有明显提升先发的交易。')}</p>
  return (
    <>
      {tradeWindow?.note && <p className="mb-2 text-xs text-fg-2">{tradeWindow.note}</p>}
      <ul className="grid gap-2">
        {tradeTargets.slice(0, 3).map((x, i) => {
          const give = x.offerIdeas?.map((o) => o.name).join(' and ') || ''
          return (
            <li key={i} className="rounded-[8px] border border-line bg-surface-2 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <PlayerChip player={x.target} onClick={() => onPlayer(x.target.id)} />
                <span className="text-xs text-fg-2">{t('from', '来自')} <b className="text-fg">{x.partner.teamName}</b></span>
                {x.positionNeed < 0 && <Pill tone="neon">{t(`fills a ${fmt(Math.abs(x.positionNeed), 0)}-pt ${x.position} hole`, `补 ${x.position} ${fmt(Math.abs(x.positionNeed), 0)} 分缺口`)}</Pill>}
              </div>
              <p className="nums mt-1.5 text-xs text-fg-2">
                {t('value', '价值')} {fmt(x.target.vorp)} · <span className="text-jade">+{fmt(x.gain)}</span> {t('over', '优于')} {x.upgradeOver?.name || t('your starter', '你的先发')}
                {give && <> · {t('offer', '报价')}: {give}</>}
              </p>
              <a href={askHref(give, x.target.name)} className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-[6px] border border-line px-2 text-xs text-neon hover:border-neon">
                <span className="han">易</span> {t('Ask the Oracle', '问神谕')}
              </a>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function CalendarSlip({ dates: d, tradeWindow }) {
  const { t } = useUI()
  if (!d) return <p className="text-sm text-fg-2">{t('Calendar is only available for the current season.', '仅当前赛季提供日历。')}</p>
  const upcoming = (d.byeOutlook || []).slice(0, 4)
  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <Mini label={t('Deadline', '交易截止')} value={d.tradeDeadline.week ? `wk ${d.tradeDeadline.week}` : t('none', '无')} sub={d.tradeDeadline.week ? (d.tradeDeadline.passed ? t('passed', '已过') : t(`${d.tradeDeadline.weeksAway} wk away`, `还有 ${d.tradeDeadline.weeksAway} 周`)) : tradeWindow?.note} />
        <Mini label={t('Playoffs', '季后赛')} value={`wk ${d.playoffs.startWeek}`} sub={t(`${d.playoffs.teams} teams`, `${d.playoffs.teams} 队`)} />
        <Mini label={d.waivers.budget ? 'FAAB' : t('Waiver', '顺位')} value={d.waivers.budget ? `$${d.waivers.remaining}` : `#${d.waivers.position ?? '—'}`} sub={d.waivers.budget ? t(`of $${d.waivers.budget}`, `共 $${d.waivers.budget}`) : t('rolling', '轮转')} />
      </div>
      {d.alerts?.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {d.alerts.map((a, i) => (
            <li key={i}><Note level={a.level}><span className="text-sm">{a.text}</span>{a.action && <span className="block text-xs text-fg-2">{a.action}</span>}</Note></li>
          ))}
        </ul>
      )}
      {upcoming.length > 0 && (
        <ul className="divide-y divide-line text-sm">
          {upcoming.map((b) => (
            <li key={b.week} className="py-2">
              <p><b className="nums">{t(`Week ${b.week}`, `第 ${b.week} 周`)}</b> <span className="text-xs text-fg-3">({t(`${b.weeksAway} away`, `还有 ${b.weeksAway} 周`)})</span> · {t(`${b.playersOut} on bye`, `${b.playersOut} 人轮空`)}: <span className="text-fg-2">{Object.entries(b.byPosition).map(([pos, names]) => `${pos}: ${names.join(', ')}`).join(' · ')}</span></p>
              {b.shortages.map((sh) => (
                <p key={sh.position} className="mt-0.5 text-xs text-amber">
                  {t(`${sh.short} short at ${sh.position} (need ${sh.required}, ${sh.healthy} available).`, `${sh.position} 缺 ${sh.short} 人（需 ${sh.required}，可用 ${sh.healthy}）。`)}{' '}
                  {sh.waiverCover.length ? `${t('Available:', '可签：')} ${sh.waiverCover.map((c) => `${c.name} (${c.team}, ${fmt(c.weekPoints)})`).join(', ')}` : t('No free agent covers it.', '自由市场无人可补。')}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
      {d.milestones?.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-neon">{t('All milestones', '全部节点')}</summary>
          <ul className="mt-1 space-y-0.5 text-fg-2">
            {d.milestones.map((m, i) => <li key={i}><b className="nums text-fg">wk {m.week}</b> — {m.label}{m.passed && ` (${t('passed', '已过')})`}</li>)}
          </ul>
        </details>
      )}
    </>
  )
}

function Mini({ label, value, sub }) {
  return (
    <div className="rounded-[8px] border border-line bg-surface-2 px-2 py-2">
      <div className="text-[10.5px] text-fg-2">{label}</div>
      <div className="nums font-display text-lg leading-tight">{value}</div>
      {sub && <div className="truncate text-[10.5px] text-fg-3">{sub}</div>}
    </div>
  )
}

function StrengthSlip({ rows, team, onPlayer }) {
  const { t } = useUI()
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.v ?? 0)), ...Object.values(team.leagueAverage || {}).map((x) => Math.abs(x)))
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const s = team.positionalStrength?.[r.pos]
        return (
          <li key={r.pos} className="grid grid-cols-[36px_1fr_56px] items-center gap-3 text-sm">
            <span className="nums text-fg-2">{r.pos}</span>
            <div>
              <DivergeBar v={r.v ?? 0} max={max} />
              <p className="mt-1 text-[11px] text-fg-3">
                {s?.weakestStarter ? <>{t('weakest starter', '最弱先发')}: <button type="button" onClick={() => onPlayer(s.weakestStarter.id)} className="text-fg-2 hover:text-fg">{s.weakestStarter.name}</button> ({fmt(s.weakestStarter.vorp, 0)})</> : t('no starter', '无先发')}
                {s && <> · {s.count} {t('rostered', '在册')}</>}
              </p>
            </div>
            <span className={`nums text-right ${r.v >= 0 ? 'text-jade' : 'text-violet'}`}>{r.v == null ? '—' : `${r.v > 0 ? '+' : ''}${fmt(r.v, 0)}`}</span>
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------ ledger */

function LedgerBlock({ team, tab, onTab, onPlayer, compact = false, leagueId }) {
  const { t } = useUI()
  const { lineup, waivers } = team
  const L = team.league
  const faab = L?.faab?.enabled ? L.faab : null

  const tabs = [
    {
      id: 'roster', char: '册', label: t('Roster', '阵容'),
      content: (
        <DataTable
          dense={compact}
          head={compact ? [t('Player', '球员'), t('ROS', '剩余'), t('Value', '价值'), t('Wk', '本周')] : [t('Player', '球员'), t('Pos', '位置'), t('Team', '球队'), t('ROS pts', '剩余分'), t('Value', '价值'), t('Next wk', '下周'), t('Status', '状态'), t('Flags', '提示')]}
          rows={team.roster.map((p) => {
            const name = (
              <span key="n" className="flex flex-wrap items-center gap-1">
                <button type="button" onClick={() => onPlayer(p.id)} className="text-left hover:text-neon">{p.name}</button>
                {compact && <span className="nums text-[10px] text-fg-3">{p.position}</span>}
                {p.isStarter && <Pill tone="jade">S</Pill>}
                {p.onIR && <Pill tone="neon">IR</Pill>}
              </span>
            )
            return compact
              ? [name, fmt(p.ros, 0), <b key="v">{fmt(p.vorp, 0)}</b>, fmt(p.nextWeek)]
              : [name, p.position, p.team || '—', fmt(p.ros), <b key="v">{fmt(p.vorp)}</b>, fmt(p.nextWeek), p.injuryStatus || '—', p.flags?.length ? <span key="f" className="text-xs">{p.flags.map((f) => f.text).join(' · ')}</span> : null]
          })}
        />
      ),
    },
    {
      id: 'trace', char: '阵', label: t('Lineup trace', '阵容明细'),
      content: lineup ? (
        <div className="space-y-2">
          {lineup.recommended.map((s, i) => (
            <div key={i} className="rounded-[8px] border border-line bg-surface-2 px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span><Slot>{s.slot}</Slot>{s.id ? <button type="button" onClick={() => onPlayer(s.id)} className="hover:text-neon">{s.name}</button> : s.name}{s.position && <span className="text-fg-2"> ({s.position} {s.team || ''}{s.opponent ? ` vs ${s.opponent}` : ''})</span>}</span>
                <span className="nums">{fmt(s.baseProjection)} → <b>{fmt(s.points)}</b></span>
              </div>
              {s.gates && (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {s.gates.map((g) => (
                    <li key={g.name} className={`flex gap-2 ${!g.applied ? 'text-fg-3' : g.verdict === 'fail' ? 'text-violet' : g.verdict === 'pass' ? 'text-jade' : 'text-fg-2'}`}>
                      <span className="w-20 shrink-0">{g.name}</span>
                      <span className="nums w-14 shrink-0">{g.applied ? `×${fmt(g.effect, 2)}` : t('context', '参考')}</span>
                      <span className="min-w-0">{g.note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-fg-2">{t('No current-season lineup.', '无当前赛季阵容。')}</p>,
    },
    {
      id: 'held', char: '留', label: t('Held', '未采纳'),
      content: lineup?.held?.length ? (
        <ul className="space-y-1 text-sm">
          {lineup.held.map((h, i) => <li key={i} className="text-fg-2"><Slot>{h.slot}</Slot>{t('kept', '保留')} <b className="text-fg">{h.keep || t('the empty slot', '空位')}</b> {t('over', '而非')} {h.over} — {h.reason}</li>)}
        </ul>
      ) : <p className="text-sm text-fg-2">{t('Nothing was held back this week.', '本周没有被搁置的调整。')}</p>,
    },
    {
      id: 'waivers', char: '补', label: t('Waivers', '自由球员'),
      content: (
        <DataTable
          dense={compact}
          head={[t('Player', '球员'), t('Pos', '位置'), t('ROS', '剩余'), t('vs repl.', '高于替补'), t('Wk', '本周'), ...(faab ? ['FAAB'] : []), t('Need', '需求'), t('Trend', '热度'), t('Upgrade over', '可替换')]}
          rows={(waivers?.targets || []).map((w) => [
            <button key="n" type="button" onClick={() => onPlayer(w.id)} className="text-left hover:text-neon">{w.name}<span className="nums ml-1 text-[10px] text-fg-3">{w.team}</span></button>,
            w.position, fmt(w.ros, 0), <span key="d" className={`nums ${w.rawVorp > 0 ? 'text-jade' : w.rawVorp < 0 ? 'text-violet' : ''}`}>{w.rawVorp > 0 ? '+' : ''}{fmt(w.rawVorp, 0)}</span>, fmt(w.nextWeekPoints),
            ...(faab ? [<Faab key="f" est={w.faab} /> || '—'] : []),
            w.priority && w.priority !== 'low' ? <Pill key="p" tone="neon">{w.priority}</Pill> : '—',
            w.trendingAdds ? w.trendingAdds.toLocaleString() : '—',
            w.upgradeOver ? `${w.upgradeOver.name} (+${fmt(w.upgradeOver.gain)})` : '—',
          ])}
        />
      ),
    },
    {
      id: 'draft', char: '选', label: t('Draft', '选秀'),
      content: <DraftLedger leagueId={leagueId} pickCurve={L?.pickCurve} onPlayer={onPlayer} compact={compact} currentSeason={L?.isCurrentSeason ? Number(L.season) : null} />,
    },
    {
      id: 'method', char: '法', label: t('Method', '方法'),
      content: (
        <div className="space-y-3 text-xs text-fg-2">
          <p><b className="text-fg">{t('Scoring.', '计分。')}</b> {L?.scoringDescription}. {L?.scoringAudit && t(`${L.scoringAudit.totalRules} rules applied to every projection${L.scoringAudit.unscoredCount ? `; ${L.scoringAudit.unscoredCount} rare special-teams rules cannot be forecast and count as zero` : ''}.`, `已对每份预测应用 ${L.scoringAudit.totalRules} 条规则${L.scoringAudit.unscoredCount ? `；${L.scoringAudit.unscoredCount} 条罕见特勤组规则无法预测，按零计` : ''}。`)}</p>
          {L?.bonusCalibration && <p><b className="text-fg">{t('Bonuses.', '奖励分。')}</b> {t(`Milestone bonuses and defence tiers are expected values measured from ${L.bonusCalibration.sampleSize.toLocaleString()} player-weeks (${L.bonusCalibration.seasons.join(', ')}).`, `里程碑奖励与防守分段为基于 ${L.bonusCalibration.sampleSize.toLocaleString()} 个球员周实测的期望值。`)}</p>}
          {L?.format?.description && <p><b className="text-fg">{t('Format.', '联盟类型。')}</b> {L.format.description}. {t('Trades in keeper and dynasty leagues are judged on this season plus next; next season is this season\'s full value regressed, aged by position, weighted by the chance a player is kept and net of the keeper cost.', '保留与王朝联盟的交易按本赛季加下赛季评估。')}</p>}
          <p><b className="text-fg">{t('Gates.', '关卡。')}</b> {t('Availability, weather and matchup adjust a projection; role, form and game script are shown as context because a two-season backtest found the published projection already prices them in.', '可用性、天气与对位会调整预测；角色、状态与比赛走向仅作参考，因为两个赛季的回测显示预测已包含这些因素。')}</p>
          {faab && <p><b className="text-fg">FAAB.</b> {t(`Estimates come from the ${faab.wonSeen} winning bids in this league this season (budget $${faab.budget}), matched by where each target ranks among free agents available now. Early-season bidding runs hot.`, `估价来自本季联盟 ${faab.wonSeen} 次成交出价（预算 $${faab.budget}）。赛季初出价偏高。`)}</p>}
          <p><b className="text-fg">{t('Value.', '价值。')}</b> {t('Rest-of-season points above a free replacement at the position, with replacement level derived from this league\'s roster slots and team count.', '剩余赛季高于同位置可免费获得的替补的分数；替补水平由本联盟的阵容位与队数推算。')}</p>
          <p className="text-fg-3">{team.autoSet?.reason}</p>
          {L?.dataFreshness && <p className="nums text-fg-3">{t('League data built', '联盟数据生成于')} {new Date(L.dataFreshness.leagueBuiltAt).toLocaleString()}</p>}
        </div>
      ),
    },
  ]
  return <Ledger tabs={tabs} value={tab} onChange={onTab} />
}

/** What every pick in this league's history became, and the value curve picks are priced on. */
function DraftLedger({ leagueId, pickCurve, onPlayer, compact, currentSeason }) {
  const { t } = useUI()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!leagueId || data) return undefined
    let alive = true
    api(`/api/league/${leagueId}/draft`).then((d) => alive && setData(d.draft)).catch((e) => alive && setError(e.message))
    return () => { alive = false }
  }, [leagueId, data])

  if (!pickCurve && !data) return <p className="text-sm text-fg-2">{t('No completed drafts found for this league.', '未找到本联盟已完成的选秀。')}</p>
  const curve = data?.curve || pickCurve
  const auction = curve?.auction || data?.drafts?.every((d) => d.type === 'auction')
  const rounds = Object.entries(curve?.rounds || {}).filter(([, v]) => v.n > 0 || Number(v.value) > 0).slice(0, 10)
  const unit = auction ? t('tier', '档') : t('round', '轮')
  const seasons = curve?.seasons || []

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-fg-2">
        {t(
          `Picks are priced on what this league's own picks became: ${curve?.picks || 0} ${auction ? 'auction buys' : 'picks'} from ${seasons.length} draft${seasons.length === 1 ? '' : 's'} (${seasons.join(', ')}), each scored by what the player ${curve?.measure === 'now' ? 'is worth today' : 'produced that season'} in this league's rules.${currentSeason && seasons.includes(currentSeason) && curve?.measure !== 'now' ? ` The ${currentSeason} season is still being played, so its picks count points to date plus the rest-of-season projection.` : ''} Keeper slots are excluded.${auction ? ' Auction buys are ranked by price and cut into tiers of one per team, so tier 1 is the priciest buy on every roster.' : ''} Small samples lean on a five-season standard-league calibration.`,
          `选秀签按本联盟历史选秀的实际结果估值：${seasons.length} 次选秀共 ${curve?.picks || 0} 个选择，按本联盟规则计算球员${curve?.measure === 'now' ? '当前价值' : '当季产出'}。保留球员不计入。`,
        )}
      </p>
      <DataTable
        dense
        head={compact
          ? [unit, t('Value', '采用值'), t('Avg played', '出场均值'), t('Busts', '报废'), t('Hit', '命中')]
          : [unit, t('Value used', '采用值'), t('Avg when played', '出场均值'), t('Busts', '报废'), t('Picks', '样本'), t('Hit rate', '命中率'), t('Standard', '标准联盟'), t('Basis', '依据')]}
        rows={rounds.map(([r, v]) => {
          const avg = v.playedMean == null ? '—' : <span key="m" title={v.mean != null ? `all picks incl. busts: ${fmt(v.mean, 0)} · busts at zero: ${fmt(v.optionMean, 0)}` : undefined} className={v.playedMean >= 0 ? '' : 'text-violet'}>{fmt(v.playedMean, 0)}</span>
          const hit = v.hitRate == null ? '—' : `${Math.round(v.hitRate * 100)}%`
          return compact
            ? [<b key="r">{r}</b>, fmt(Math.max(0, v.value), 0), avg, v.busts || '—', hit]
            : [<b key="r">{r}</b>, fmt(Math.max(0, v.value), 0), avg, v.busts || '—', v.n, hit, fmt(v.prior, 0), <Pill key="b" tone={v.basis === 'league' ? 'jade' : v.basis === 'blend' ? 'amber' : 'neutral'}>{v.basis}</Pill>]
        })}
        caption={t('Value = points above a free replacement. "Avg when played" throws out complete busts (under a tenth of replacement: injured, cut, never played). The value used counts those busts at zero, because a pick is an option: you keep the hits and drop the rest. Hover an average for the other versions.', '价值 = 高于替补的分数。"出场均值" 剔除完全报废的选择（产出不足替补的十分之一）。采用值将报废按零计，因为选秀签是期权。')}
      />
      {error && <p className="text-xs text-neon">{error}</p>}
      {!data && !error && <p className="text-xs text-fg-3">{t('Loading every pick…', '正在加载所有选择……')}</p>}
      {data?.drafts?.map((d) => {
        const picks = data.outcomes.filter((o) => o.season === d.season).sort((a, b) => (a.overall ?? 0) - (b.overall ?? 0))
        return (
          <details key={d.draftId} className="rounded-[8px] border border-line bg-surface-2 px-3 py-2">
            <summary className="cursor-pointer text-sm">
              <b className="nums">{d.season}</b> · {d.type} · {t(`${d.picks} picks, ${d.keepers} keeper slots excluded`, `${d.picks} 个选择，排除 ${d.keepers} 个保留位`)}
            </summary>
            <div className="mt-2">
              <DataTable
                dense
                head={[
                  auction ? '$' : t('Pick', '签位'), t('Player', '球员'), t('Pos', '位置'),
                  d.season === currentSeason ? t(`${d.season} (to date + ROS)`, `${d.season}（至今 + 剩余预测）`) : t(`${d.season} (actual)`, `${d.season}（实际）`),
                  t('ROS now', '当前剩余'), '',
                ]}
                rows={picks.slice(0, compact ? 40 : 200).map((o) => [
                  auction ? <span key="a" className="nums whitespace-nowrap">{o.round}.{String(o.slot).padStart(2, '0')} · ${o.amount}</span> : <span key="a" className="nums whitespace-nowrap">{o.round}.{String(o.slot).padStart(2, '0')}</span>,
                  <button key="n" type="button" onClick={() => onPlayer(o.playerId)} className="text-left hover:text-neon">{o.name}</button>,
                  o.position || '—',
                  <span key="s" className={`nums ${o.seasonValue > 0 ? 'text-jade' : o.seasonValue < 0 ? 'text-violet' : ''}`}>{o.seasonValue == null ? '—' : `${o.seasonValue > 0 ? '+' : ''}${fmt(o.seasonValue, 0)}`}</span>,
                  <span key="w" className={`nums ${o.nowValue > 0 ? 'text-jade' : o.nowValue < 0 ? 'text-violet' : ''}`}>{o.nowValue == null ? '—' : `${o.nowValue > 0 ? '+' : ''}${fmt(o.nowValue, 0)}`}</span>,
                  o.bust ? <Pill key="b" tone="violet">{t('bust', '报废')}</Pill> : null,
                ])}
              />
              {picks.length > (compact ? 40 : 200) && <p className="mt-1 text-xs text-fg-3">{t(`Showing the first ${compact ? 40 : 200}.`, `仅显示前 ${compact ? 40 : 200} 个。`)}</p>}
            </div>
          </details>
        )
      })}
    </div>
  )
}

export { Faab }
