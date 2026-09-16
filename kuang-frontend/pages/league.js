'use client'

import { useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../components/Layout'
import Seal from '../components/Seal'
import { Button, Card, DataTable, Delta, Field, Note, Pill, SectionTitle, Stat, Tab } from '../components/ui'
import { api, fmt } from '../lib/api'
import { useUI } from '../lib/ui'

const isLeagueId = (s) => /^\d{12,}$/.test(s.trim())
const DEFAULT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export default function LeaguePage() {
  const { t } = useUI()
  const [query, setQuery] = useState('')
  const [leagues, setLeagues] = useState(null)
  const [summary, setSummary] = useState(null)
  const [season, setSeason] = useState(null)
  const [team, setTeam] = useState(null)
  const [tab, setTab] = useState('standings')
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('league')
    if (id) loadLeague(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = async (label, fn) => {
    setLoading(label)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading('')
    }
  }

  const lookup = (e) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    if (isLeagueId(q)) return loadLeague(q)
    run(t('Finding leagues…', '正在查找联盟……'), async () => {
      setLeagues(await api(`/api/league/user/${encodeURIComponent(q)}`))
      setSummary(null); setTeam(null); setSeason(null)
    })
  }

  const loadLeague = (id) =>
    run(t('Importing league…', '正在导入联盟……'), async () => {
      const data = await api(`/api/league/${id}`)
      setSummary(data); setTeam(null); setSeason(null); setTab('standings')
      const url = new URL(window.location.href)
      url.searchParams.set('league', id)
      window.history.replaceState({}, '', url)
    })

  const loadTeam = (rosterId) =>
    run(t('Reading the roster…', '正在解读阵容……'), async () => {
      setTeam(await api(`/api/league/${summary.league.id}/team/${rosterId}`))
      setTab('team')
    })

  const loadSeason = () =>
    run(t('Crunching the season…', '正在推演赛季……'), async () => {
      if (!season) setSeason(await api(`/api/league/${summary.league.id}/season`))
      setTab('season')
    })

  const L = summary?.league
  const POS = L?.activePositions?.length ? L.activePositions : DEFAULT_POSITIONS

  return (
    <Layout wide>
      <Head>
        <title>{t('League Almanac · Kuangstradamus', '联盟年鉴 · 诺查丹玛斯')}</title>
      </Head>

      <div className="mb-6 flex items-start gap-4">
        <Seal char="盟" size={40} className="mt-1" />
        <div className="min-w-0">
          <p className="han text-[11px] tracking-[0.25em] text-cinnabar-600 dark:text-cinnabar-400">联盟年鉴</p>
          <h1 className="font-display text-3xl leading-tight">{t('The League Almanac', '联盟年鉴')}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500 dark:text-ink-300">
            {t(
              "Standings and luck, start/sit weighed against form, matchup and weather, deep waiver sleepers, and every date that matters — all scored with your league's own rules.",
              '战绩与运气、结合状态对位天气的先发建议、深度捡漏人选，以及所有关键日期——全部按你联盟的计分规则计算。',
            )}
          </p>
        </div>
      </div>

      <form onSubmit={lookup} className="mb-6">
        <SectionTitle char="求">{t('Consult a league', '查询联盟')}</SectionTitle>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Field
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Sleeper username or league ID', 'Sleeper 用户名或联盟 ID')}
            aria-label={t('Sleeper username or league ID', 'Sleeper 用户名或联盟 ID')}
          />
          <Button type="submit" disabled={!!loading || !query.trim()} className="sm:w-auto">
            <Seal char="卜" size={18} /> {t('Import', '导入')}
          </Button>
        </div>
      </form>

      {loading && <p className="mb-5 font-display text-lg text-ink-400 dark:text-ink-500">{loading}</p>}
      {error && <div className="mb-5"><Note level="high">⚠️ {error}</Note></div>}

      {leagues && !summary && (
        <Card title={t(`${leagues.user.displayName}'s ${leagues.season} leagues`, `${leagues.user.displayName} 的 ${leagues.season} 赛季联盟`)} char="册">
          {leagues.leagues.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-300">{t('No leagues found for that season.', '该赛季没有找到联盟。')}</p>
          ) : (
            <ul className="divide-y divide-paper-200 dark:divide-ink-800">
              {leagues.leagues.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {l.totalRosters} {t('teams', '队')} · {l.scoringFormat.replace('_', ' ')} · {l.status}
                    </p>
                  </div>
                  <Button variant="quiet" onClick={() => loadLeague(l.id)}>{t('Open', '打开')}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {L && (
        <>
          <Card title={L.name} char="盟" subtitle={L.scoringDescription}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat char="季" label={t('Season', '赛季')} value={`${L.season}`} sub={L.isCurrentSeason ? t(`Week ${L.currentWeek}`, `第 ${L.currentWeek} 周`) : t('past season', '往季')} />
              <Stat char="队" label={t('Teams', '队伍')} value={L.totalRosters} sub={L.rosterPositions.filter((s) => s !== 'BN').length + t(' starters', ' 个先发位')} />
              <Stat char="位" label={t('Positions', '位置')} value={POS.join(' ')} sub={!L.usesKicker && !L.usesDefense ? t('no K or DEF', '无 K 与 DEF') : undefined} />
              <Stat char="季" label={t('Playoffs', '季后赛')} value={t(`Week ${L.playoffWeekStart}`, `第 ${L.playoffWeekStart} 周`)} sub={t(`${L.playoffTeams} teams`, `${L.playoffTeams} 队`)} />
            </div>

            <div className="mt-4 flex gap-1 overflow-x-auto border-b border-paper-300 dark:border-ink-700">
              <Tab active={tab === 'standings'} onClick={() => setTab('standings')}>{t('Standings', '名次')}</Tab>
              <Tab active={tab === 'strength'} onClick={() => setTab('strength')}>{t('Positional strength', '位置强弱')}</Tab>
              <Tab active={tab === 'season'} onClick={loadSeason}>{t('Season report', '赛季报告')}</Tab>
              {team && <Tab active={tab === 'team'} onClick={() => setTab('team')}>{team.team.teamName}</Tab>}
            </div>
          </Card>

          {tab === 'standings' && (
            <Card title={t('Standings', '名次')} char="名">
              <DataTable
                head={['#', t('Team', '队伍'), t('Record', '战绩'), t('PF', '得分'), t('PA', '失分'), t('All-play', '全联对战'), t('Luck', '运气'), t('Playoff %', '晋级率'), t('Starter value', '先发价值'), '']}
                primary={1}
                rows={summary.standings.map((s) => [
                  s.rank,
                  <span key="n"><b>{s.teamName}</b><span className="block text-xs text-ink-400">{s.ownerName}</span></span>,
                  `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}`,
                  fmt(s.pointsFor), fmt(s.pointsAgainst), s.allPlay || '—',
                  <Delta key="l" v={s.luck} digits={1} />,
                  s.playoffPct == null ? '—' : `${fmt(s.playoffPct, 0)}%`,
                  fmt(s.starterValue, 0),
                  <Button key="b" variant="quiet" className="px-3 min-h-9" onClick={() => loadTeam(s.rosterId)}>{t('Analyze', '分析')}</Button>,
                ])}
                caption={t(
                  'Luck = actual wins minus all-play expected wins. Starter value = rest-of-season points above replacement across the optimal lineup.',
                  '运气 = 实际胜场减去全联对战期望胜场。先发价值 = 最优阵容剩余赛季高于替补水平的分数。',
                )}
              />
            </Card>
          )}

          {tab === 'strength' && (
            <Card title={t('Positional strength', '位置强弱')} char="势" subtitle={t('Starter value vs league average', '先发价值与联盟平均之差')}>
              <DataTable
                head={[t('Team', '队伍'), ...POS, t('Total', '合计')]}
                rows={summary.positionalStrength.teams.map((x) => [
                  <b key="n">{x.teamName}</b>,
                  ...POS.map((p) => <Delta key={p} v={x.strength[p]?.vsAverage} />),
                  fmt(x.totalStarterValue, 0),
                ])}
              />
              {!L.usesKicker && !L.usesDefense && (
                <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
                  {t('This league starts no kicker or defence, so neither is scored or recommended anywhere.', '本联盟不设 K 与 DEF 先发位，因此各处均不计算、不推荐。')}
                </p>
              )}
            </Card>
          )}

          {tab === 'season' && season && <SeasonReport season={season} />}
          {tab === 'team' && team && <TeamView team={team} positions={POS} />}
        </>
      )}
    </Layout>
  )
}

/* ---------------------------------------------------------- season report */

function SeasonReport({ season }) {
  const { t } = useUI()
  return (
    <>
      <Card title={t('Lineup efficiency', '阵容效率')} char="效" subtitle={t('Actual vs optimal starters, all scored weeks', '各周实际先发与最优先发对比')}>
        <DataTable
          head={[t('Team', '队伍'), t('Actual', '实际'), t('Optimal', '最优'), t('Left on bench', '板凳浪费'), t('Efficiency', '效率'), t('Worst week', '最差周')]}
          rows={season.lineupEfficiency.map((e) => [
            <b key="n">{e.teamName}</b>, fmt(e.actual), fmt(e.optimal), fmt(e.pointsLeftOnBench), `${fmt(e.efficiencyPct)}%`,
            e.worstWeek ? t(`wk ${e.worstWeek.week} (−${fmt(e.worstWeek.left)})`, `第${e.worstWeek.week}周 (−${fmt(e.worstWeek.left)})`) : '—',
          ])}
        />
      </Card>

      <Card title={t('Luck', '运气')} char="运" subtitle={t('All-play record against the whole league', '与全联盟逐队对战的战绩')}>
        <DataTable
          head={[t('Team', '队伍'), t('All-play', '全联对战'), t('Expected W', '期望胜'), t('Actual W', '实际胜'), t('Luck', '运气'), t('Avg pts', '场均'), 'σ']}
          rows={season.allPlay.map((a) => [
            <b key="n">{a.teamName}</b>, `${a.allPlayWins}-${a.allPlayLosses}`, fmt(a.expectedWins), a.actualWins,
            <Delta key="l" v={a.luck} digits={1} />, fmt(a.avgPoints), fmt(a.sdPoints),
          ])}
        />
      </Card>

      {season.playoffOdds?.length > 0 && (
        <Card title={t('Playoff odds', '季后赛概率')} char="卜" subtitle={t('Monte Carlo over the remaining schedule', '对剩余赛程的蒙特卡洛模拟')}>
          <DataTable
            head={[t('Team', '队伍'), t('Playoff %', '晋级率'), t('Proj. wins', '预计胜场'), t('Current W', '当前胜场'), t('Games left', '剩余场次')]}
            rows={season.playoffOdds.map((o) => [<b key="n">{o.teamName}</b>, `${fmt(o.playoffPct)}%`, fmt(o.projectedWins), o.currentWins, o.gamesLeft])}
          />
        </Card>
      )}

      {season.strengthOfSchedule?.length > 0 && (
        <Card title={t('Remaining strength of schedule', '剩余赛程强度')} char="程">
          <DataTable
            head={[t('Team', '队伍'), t('Games left', '剩余场次'), t('Avg opponent projection', '对手场均预计'), t('Own avg projection', '自身场均预计')]}
            rows={season.strengthOfSchedule.map((s) => [<b key="n">{s.teamName}</b>, s.gamesLeft, fmt(s.avgOpponentProjection), fmt(s.avgOwnProjection)])}
          />
        </Card>
      )}
    </>
  )
}

/* ------------------------------------------------------------- team view */

function TeamView({ team, positions }) {
  const { t } = useUI()
  const { lineup, keyDates: dates } = team
  const sleepers = team.waivers?.sleepers || []

  return (
    <>
      <Card
        title={team.team.teamName}
        char="队"
        subtitle={t(
          `${team.team.record.wins}-${team.team.record.losses} · starter value ${fmt(team.totalStarterValue, 0)}`,
          `${team.team.record.wins}胜${team.team.record.losses}负 · 先发价值 ${fmt(team.totalStarterValue, 0)}`,
        )}
      >
        <div className="flex flex-wrap gap-2">
          {team.positionalStrength && positions.map((p) => (
            <span key={p} className="rounded-sm border border-paper-300 dark:border-ink-700 px-2.5 py-1 text-sm">
              <span className="text-ink-500 dark:text-ink-400">{p}</span>{' '}
              <Delta v={team.positionalStrength[p]?.vsAverage} />
            </span>
          ))}
        </div>
      </Card>

      {dates && <KeyDates dates={dates} tradeWindow={team.tradeWindow} />}
      {lineup && <LineupCard lineup={lineup} autoSet={team.autoSet} />}

      <Card title={t('Roster', '阵容')} char="册" subtitle={t('Rest of season', '剩余赛季')}>
        <DataTable
          head={[t('Player', '球员'), t('Pos', '位置'), t('Team', '球队'), t('ROS pts', '剩余分'), t('Value', '价值'), t('Next wk', '下周'), t('Status', '状态'), t('Flags', '提示')]}
          rows={team.roster.map((p) => [
            <span key="n">
              {p.name}
              {p.isStarter && <Pill tone="good">S</Pill>}
              {p.onIR && <Pill tone="accent">IR</Pill>}
            </span>,
            p.position, p.team || '—', fmt(p.ros), <b key="v">{fmt(p.vorp)}</b>, fmt(p.nextWeek), p.injuryStatus || '—',
            p.flags?.length ? <span key="f" className="text-xs">{p.flags.map((f) => f.text).join(' · ')}</span> : null,
          ])}
        />
      </Card>

      {team.tradeWindow?.passed && (
        <Card title={t('Trades', '交易')} char="易"><Note>🔒 {team.tradeWindow.note}</Note></Card>
      )}

      {team.tradeTargets?.length > 0 && (
        <Card title={t('Trade targets', '交易目标')} char="易" subtitle={t('Ranked by positional need × rest-of-season value', '按位置需求 × 剩余赛季价值排序')}>
          {team.tradeWindow && !team.tradeWindow.passed && (
            <p className="mb-3 text-xs text-ink-500 dark:text-ink-400">{team.tradeWindow.note}</p>
          )}
          <ul className="space-y-2">
            {team.tradeTargets.map((x, i) => (
              <li key={i} className="rounded-sm border border-paper-300 dark:border-ink-700 px-3 py-2 text-sm">
                <div>
                  <b>{x.target.name}</b> <span className="text-ink-500 dark:text-ink-400">({x.position}, {x.target.team})</span>{' '}
                  {t('from', '来自')} <b>{x.partner.teamName}</b>
                  {x.positionNeed < 0 && <Pill tone="accent">{t(`fills a ${fmt(Math.abs(x.positionNeed), 0)}-pt hole`, `补 ${fmt(Math.abs(x.positionNeed), 0)} 分缺口`)}</Pill>}
                </div>
                <div className="mt-0.5 text-xs text-ink-500 dark:text-ink-300 nums">
                  {fmt(x.target.ros)} {t('ROS pts', '剩余分')} · {t('value', '价值')} {fmt(x.target.vorp)} → +{fmt(x.gain)} {t('over', '优于')} {x.upgradeOver?.name || t('your starter', '你的先发')}
                </div>
                {x.offerIdeas?.length > 0 && (
                  <div className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                    {t('Offer from your surplus:', '可用余量报价：')} {x.offerIdeas.map((o) => `${o.name} (${fmt(o.vorp)})`).join(', ')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sleepers.length > 0 && <SleeperCard sleepers={sleepers} />}

      {team.waivers?.targets?.length > 0 && (
        <Card title={t('Waiver targets', '自由球员')} char="补" subtitle={t('Ranked by positional need, then rest-of-season value', '按位置需求与剩余赛季价值排序')}>
          <DataTable
            head={[t('Player', '球员'), t('Pos', '位置'), t('Team', '球队'), t('ROS pts', '剩余分'), t('vs repl.', '高于替补'), t('Next wk', '下周'), t('Need', '需求'), t('Trending', '热度'), t('Upgrade over', '可替换')]}
            rows={team.waivers.targets.map((w) => [
              <b key="n">{w.name}</b>, w.position, w.team, fmt(w.ros), <Delta key="d" v={w.rawVorp} />, fmt(w.nextWeekPoints),
              w.priority === 'low' ? '—' : <Pill key="p" tone="accent">{w.priority}</Pill>,
              w.trendingAdds ? w.trendingAdds.toLocaleString() : '—',
              w.upgradeOver ? `${w.upgradeOver.name} (+${fmt(w.upgradeOver.gain)})` : '—',
            ])}
            caption={team.waivers.dropCandidates?.length
              ? `${t('Drop candidates:', '可考虑释出：')} ${team.waivers.dropCandidates.map((d) => `${d.name} (${d.position}, ${fmt(d.vorp)})`).join(' · ')}`
              : null}
          />
        </Card>
      )}
    </>
  )
}

/* -------------------------------------------------------------- key dates */

function KeyDates({ dates: d, tradeWindow }) {
  const { t } = useUI()
  return (
    <Card title={t('Key dates & alerts', '关键日期与提醒')} char="历">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Stat
          char="易"
          label={t('Trade deadline', '交易截止')}
          value={d.tradeDeadline.week ? t(`Week ${d.tradeDeadline.week}`, `第 ${d.tradeDeadline.week} 周`) : t('None set', '未设置')}
          sub={d.tradeDeadline.week ? (d.tradeDeadline.passed ? t('passed', '已过') : t(`${d.tradeDeadline.weeksAway} weeks away`, `还有 ${d.tradeDeadline.weeksAway} 周`)) : tradeWindow?.note}
        />
        <Stat char="季" label={t('Playoffs', '季后赛')} value={t(`Week ${d.playoffs.startWeek}`, `第 ${d.playoffs.startWeek} 周`)} sub={t(`${d.playoffs.teams} teams · weeks ${d.playoffs.weeks.join(', ')}`, `${d.playoffs.teams} 队 · 第 ${d.playoffs.weeks.join('、')} 周`)} />
        <Stat char="金" label="FAAB" value={d.waivers.budget ? `$${d.waivers.remaining}` : t(`Waiver #${d.waivers.position ?? '—'}`, `顺位 #${d.waivers.position ?? '—'}`)} sub={d.waivers.budget ? t(`of $${d.waivers.budget}`, `共 $${d.waivers.budget}`) : t('rolling priority', '轮转顺位')} />
      </div>

      {d.alerts?.length > 0 && (
        <ul className="mt-4 space-y-2">
          {d.alerts.map((a, i) => (
            <li key={i}>
              <Note level={a.level}>
                <p className="font-medium">{a.level === 'high' ? '🚨' : a.level === 'medium' ? '⚠️' : 'ℹ️'} {a.text}</p>
                {a.action && <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-300">{a.action}</p>}
              </Note>
            </li>
          ))}
        </ul>
      )}

      {d.byeOutlook?.length > 0 && (
        <details className="mt-4" open={d.byeOutlook.some((b) => b.risk !== 'low')}>
          <summary className="cursor-pointer text-sm text-cinnabar-700 dark:text-cinnabar-400">{t('Bye weeks ahead', '未来轮空周')}</summary>
          <ul className="mt-2 space-y-2">
            {d.byeOutlook.map((b) => (
              <li key={b.week} className="rounded-sm border border-paper-300 dark:border-ink-700 px-3 py-2 text-sm">
                <p>
                  <b>{t(`Week ${b.week}`, `第 ${b.week} 周`)}</b>{' '}
                  <span className="text-xs text-ink-400">({t(`${b.weeksAway} away`, `还有 ${b.weeksAway} 周`)})</span> —{' '}
                  {t(`${b.playersOut} on bye`, `${b.playersOut} 人轮空`)}:{' '}
                  {Object.entries(b.byPosition).map(([pos, names]) => `${pos}: ${names.join(', ')}`).join(' · ')}
                </p>
                {b.shortages.map((sh) => (
                  <p key={sh.position} className="mt-1 text-xs text-ink-500 dark:text-ink-300">
                    ⚠️ {t(`${sh.short} short at ${sh.position} (need ${sh.required}, ${sh.healthy} available).`, `${sh.position} 缺 ${sh.short} 人（需 ${sh.required}，可用 ${sh.healthy}）。`)}{' '}
                    {sh.waiverCover.length
                      ? `${t('Available now:', '现可签下：')} ${sh.waiverCover.map((c) => `${c.name} (${c.team}, ${fmt(c.weekPoints)})`).join(', ')}`
                      : t('No free agent covers it — trade or stash early.', '自由市场无人可补，宜提前交易或囤人。')}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}

      {d.milestones?.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-cinnabar-700 dark:text-cinnabar-400">{t('All milestones', '全部节点')}</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {d.milestones.map((m, i) => (
              <li key={i}>
                <b>{t(`Week ${m.week}`, `第 ${m.week} 周`)}</b> — {m.label}
                {m.passed && <span className="text-ink-400"> ({t('passed', '已过')})</span>}
                {m.urgency === 'high' && !m.passed && <Pill tone="accent">{t('urgent', '紧急')}</Pill>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------- lineup */

function LineupCard({ lineup, autoSet }) {
  const { t } = useUI()
  return (
    <Card
      title={t(`Start / sit · week ${lineup.week}`, `先发建议 · 第 ${lineup.week} 周`)}
      char="阵"
      subtitle={t(
        'Every projection re-scored through six gates — availability, role, form, matchup, weather, game script.',
        '每份预测都经过六道关卡：可用性、角色、状态、对位、天气、比赛走向。',
      )}
    >
      {lineup.moves.length === 0 ? (
        <Note level="info">
          <span className="text-jade-700 dark:text-jade-400">✓</span> {lineup.note}{' '}
          <span className="nums text-ink-500 dark:text-ink-400">({fmt(lineup.currentTotal)} {t('projected after gates', '经关卡调整后预计')})</span>
        </Note>
      ) : (
        <>
          <p className="mb-3">
            {t('Projected gain', '预计收益')}{' '}
            <b className="text-jade-700 dark:text-jade-400 nums">+{fmt(lineup.gain)}</b>{' '}
            <span className="nums text-sm text-ink-500 dark:text-ink-400">({fmt(lineup.currentTotal)} → {fmt(lineup.recommendedTotal)})</span>
          </p>
          <ul className="space-y-2">
            {lineup.moves.map((m, i) => (
              <li key={i} className="rounded-sm border border-paper-300 dark:border-ink-700 px-3 py-2 text-sm">
                <p>
                  <span className="han mr-1.5 text-xs text-cinnabar-600 dark:text-cinnabar-400">{m.slot}</span>
                  {t('start', '先发')} <b>{m.in.name}</b>
                  <span className="text-ink-500 dark:text-ink-400"> ({m.in.position} {m.in.team}{m.in.opponent ? ` vs ${m.in.opponent}` : ''})</span>
                  {m.out && <> · {t('bench', '替补')} <b>{m.out.name}</b></>}
                  <span className="ml-1.5 nums text-jade-700 dark:text-jade-400">+{fmt(m.gain)}</span>
                </p>
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-300 nums">
                  {fmt(m.in.baseProjection)} {t('raw', '原始')} → {fmt(m.in.projection)} {t('after gates', '关卡后')} · {t('confidence', '置信度')} {Math.round((m.in.confidence ?? 0) * 100)}%
                  {m.bar != null && <> · {t(`cleared a ${fmt(m.bar)}-pt bar`, `越过 ${fmt(m.bar)} 分门槛`)}</>}
                </p>
                {m.out?.reason && <p className="text-xs text-ink-500 dark:text-ink-400">{t('Benching', '替下')} {m.out.name}: {m.out.reason}</p>}
                {m.in.why?.length > 0 && <p className="text-xs text-ink-500 dark:text-ink-400">{t('Why:', '理由：')} {m.in.why.join(' · ')}</p>}
                {m.in.weather && <p className="text-xs text-ink-500 dark:text-ink-400">🌦 {m.in.weather}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      {lineup.held?.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-cinnabar-700 dark:text-cinnabar-400">
            {t(`Considered but held (${lineup.held.length})`, `考虑后未采纳（${lineup.held.length}）`)}
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-ink-500 dark:text-ink-300">
            {lineup.held.map((h, i) => (
              <li key={i}>{h.slot}: {t('kept', '保留')} <b>{h.keep}</b> {t('over', '而非')} {h.over} — {h.reason}</li>
            ))}
          </ul>
        </details>
      )}

      {lineup.unfilled?.length > 0 && (
        <p className="mt-3 text-sm text-cinnabar-700 dark:text-cinnabar-400">
          {t('No eligible player for:', '无人可填：')} {lineup.unfilled.join(', ')}
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-cinnabar-700 dark:text-cinnabar-400">{t('Recommended lineup, gate by gate', '推荐阵容与各关卡明细')}</summary>
        <div className="mt-2 space-y-2">
          {lineup.recommended.map((s, i) => (
            <div key={i} className="rounded-sm border border-paper-300 dark:border-ink-700 px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>
                  <span className="han mr-1.5 text-xs text-cinnabar-600 dark:text-cinnabar-400">{s.slot}</span>
                  {s.name}
                  {s.position && <span className="text-ink-500 dark:text-ink-400"> ({s.position} {s.team || ''}{s.opponent ? ` vs ${s.opponent}` : ''})</span>}
                </span>
                <span className="nums">{fmt(s.baseProjection)} → <b>{fmt(s.points)}</b></span>
              </div>
              {s.gates && (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {s.gates.map((g) => (
                    <li key={g.name} className={`flex gap-2 ${g.verdict === 'fail' ? 'text-rust-600 dark:text-rust-400' : g.verdict === 'pass' ? 'text-jade-700 dark:text-jade-400' : 'text-ink-400 dark:text-ink-500'}`}>
                      <span className="w-20 shrink-0">{g.name}</span>
                      <span className="nums w-12 shrink-0">×{g.factor}</span>
                      <span className="min-w-0">{g.note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </details>

      <p className="mt-3 text-xs text-ink-400 dark:text-ink-500">{autoSet?.reason}</p>
    </Card>
  )
}

/* -------------------------------------------------------------- sleepers */

function SleeperCard({ sleepers }) {
  const { t } = useUI()
  return (
    <Card
      title={t('Deep sleepers', '深度捡漏')}
      char="潜"
      subtitle={t(
        "Free agents behind the league's workhorses, valued on what they would inherit.",
        '排在主力身后的自由球员，按其可继承的产量估值。',
      )}
    >
      <ul className="space-y-2">
        {sleepers.map((s) => (
          <li key={s.id} className="rounded-sm border border-paper-300 dark:border-ink-700 px-3 py-2 text-sm">
            <p>
              <b>{s.name}</b> <span className="text-ink-500 dark:text-ink-400">({s.position} {s.team})</span>
              {s.rising ? <Pill tone="good">{t('rising', '上升')}</Pill> : <Pill>{t('handcuff', '替补保险')}</Pill>}
            </p>
            <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-300">{s.why}</p>
            <p className="mt-0.5 text-xs text-ink-400 dark:text-ink-500 nums">
              {t('Would inherit', '可继承')} ~{fmt(s.contingentPointsPerGame)} {t('pts/gm', '分/场')} · {t('own ROS', '自身剩余分')} {fmt(s.rosPoints)}
              {s.sampleGames ? ` · ${t(`${s.sampleGames}-game sample`, `${s.sampleGames} 场样本`)}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )
}
