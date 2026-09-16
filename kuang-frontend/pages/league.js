'use client'

import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { api, fmt } from '../lib/api'

const isLeagueId = (s) => /^\d{12,}$/.test(s.trim())

export default function LeaguePage() {
  const [dark, setDark] = useState(false)
  const [query, setQuery] = useState('')
  const [leagues, setLeagues] = useState(null)
  const [summary, setSummary] = useState(null)
  const [season, setSeason] = useState(null)
  const [team, setTeam] = useState(null)
  const [tab, setTab] = useState('standings')
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('league')
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
    run('Finding leagues…', async () => {
      const data = await api(`/api/league/user/${encodeURIComponent(q)}`)
      setLeagues(data)
      setSummary(null)
      setTeam(null)
      setSeason(null)
    })
  }

  const loadLeague = (id) =>
    run('Importing league…', async () => {
      const data = await api(`/api/league/${id}`)
      setSummary(data)
      setTeam(null)
      setSeason(null)
      setTab('standings')
      const url = new URL(window.location.href)
      url.searchParams.set('league', id)
      window.history.replaceState({}, '', url)
    })

  const loadTeam = (rosterId) =>
    run('Analyzing roster…', async () => {
      setTeam(await api(`/api/league/${summary.league.id}/team/${rosterId}`))
      setTab('team')
    })

  const loadSeason = () =>
    run('Crunching the season…', async () => {
      if (!season) setSeason(await api(`/api/league/${summary.league.id}/season`))
      setTab('season')
    })

  const L = summary?.league
  const POS = L?.activePositions?.length ? L.activePositions : ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

  return (
    <div className="min-h-screen p-4 bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
      <Head>
        <title>Kuangstradamus · League</title>
      </Head>

      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <Link href="/" className="text-sm underline opacity-80 hover:opacity-100">← Trade oracle</Link>
          <button onClick={() => setDark(!dark)} className="border px-2 py-1 rounded text-sm">🌙 {dark ? 'Light' : 'Dark'}</button>
        </div>

        <h1 className="text-3xl font-bold mb-1">League analyzer</h1>
        <p className="text-sm opacity-70 mb-4">Import any Sleeper league. Standings, luck, playoff odds, lineup suggestions, trade and waiver targets, all scored with your league's exact rules.</p>

        <form onSubmit={lookup} className="flex gap-2 mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sleeper username or league ID"
            className="flex-1 border border-gray-400 dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-900"
          />
          <button type="submit" disabled={!!loading} className="bg-black dark:bg-white text-white dark:text-black px-4 rounded font-semibold disabled:opacity-50">
            Import
          </button>
        </form>

        {loading && <p className="italic opacity-70 mb-3">{loading}</p>}
        {error && <p className="text-red-600 dark:text-red-400 mb-3">⚠️ {error}</p>}

        {leagues && !summary && (
          <Card title={`${leagues.user.displayName}'s ${leagues.season} leagues`}>
            {leagues.leagues.length === 0 && <p className="opacity-70">No leagues found for {leagues.season}.</p>}
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {leagues.leagues.map((l) => (
                <li key={l.id} className="py-2 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{l.name}</div>
                    <div className="text-xs opacity-70">{l.totalRosters} teams · {l.scoringFormat.replace('_', ' ')} · {l.status}</div>
                  </div>
                  <button onClick={() => loadLeague(l.id)} className="border px-3 py-1 rounded text-sm">Open</button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {L && (
          <>
            <Card title={L.name}>
              <div className="text-sm grid sm:grid-cols-2 gap-1">
                <div>{L.season} season · {L.totalRosters} teams · week {L.currentWeek}{!L.isCurrentSeason && ' (past season)'}</div>
                <div>Scoring: {L.scoringDescription}</div>
                <div>Lineup: {L.rosterPositions.filter((s) => s !== 'BN').join(' · ')}</div>
                <div>Playoffs: {L.playoffTeams} teams from week {L.playoffWeekStart}</div>
              </div>
              <div className="flex gap-2 mt-3 text-sm">
                <Tab active={tab === 'standings'} onClick={() => setTab('standings')}>Standings</Tab>
                <Tab active={tab === 'strength'} onClick={() => setTab('strength')}>Positional strength</Tab>
                <Tab active={tab === 'season'} onClick={loadSeason}>Season report</Tab>
                {team && <Tab active={tab === 'team'} onClick={() => setTab('team')}>{team.team.teamName}</Tab>}
              </div>
            </Card>

            {tab === 'standings' && (
              <Card title="Standings">
                <Table
                  head={['#', 'Team', 'Record', 'PF', 'PA', 'All-play', 'Luck', 'Playoff %', 'Starter value', '']}
                  rows={summary.standings.map((s) => [
                    s.rank, <span key="n"><b>{s.teamName}</b><span className="block text-xs opacity-60">{s.ownerName}</span></span>,
                    `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}`, fmt(s.pointsFor), fmt(s.pointsAgainst), s.allPlay || '—',
                    <Luck key="l" v={s.luck} />, s.playoffPct == null ? '—' : `${fmt(s.playoffPct, 0)}%`, fmt(s.starterValue, 0),
                    <button key="b" onClick={() => loadTeam(s.rosterId)} className="border px-2 py-0.5 rounded text-xs">Analyze</button>,
                  ])}
                />
                <p className="text-xs opacity-60 mt-2">Luck = actual wins minus all-play expected wins. Starter value = rest-of-season points above replacement across the optimal starting lineup.</p>
              </Card>
            )}

            {tab === 'strength' && (
              <Card title="Positional strength (starter value vs league average)">
                <Table
                  head={['Team', ...POS, 'Total']}
                  rows={summary.positionalStrength.teams.map((t) => [
                    <b key="n">{t.teamName}</b>,
                    ...POS.map((p) => <Delta key={p} v={t.strength[p]?.vsAverage} />),
                    fmt(t.totalStarterValue, 0),
                  ])}
                />
                {!L.usesKicker && !L.usesDefense && (
                  <p className="text-xs opacity-60 mt-2">This league starts no kicker or defence, so neither is scored or recommended anywhere in the analyzer.</p>
                )}
              </Card>
            )}

            {tab === 'season' && season && (
              <>
                <Card title="Lineup efficiency (actual vs optimal starters, all scored weeks)">
                  <Table
                    head={['Team', 'Actual', 'Optimal', 'Left on bench', 'Efficiency', 'Worst week']}
                    rows={season.lineupEfficiency.map((e) => [<b key="n">{e.teamName}</b>, fmt(e.actual), fmt(e.optimal), fmt(e.pointsLeftOnBench), `${fmt(e.efficiencyPct)}%`, e.worstWeek ? `wk ${e.worstWeek.week} (−${fmt(e.worstWeek.left)})` : '—'])}
                  />
                </Card>
                <Card title="Luck (all-play)">
                  <Table
                    head={['Team', 'All-play', 'Expected W', 'Actual W', 'Luck', 'Avg pts', 'σ']}
                    rows={season.allPlay.map((a) => [<b key="n">{a.teamName}</b>, `${a.allPlayWins}-${a.allPlayLosses}`, fmt(a.expectedWins), a.actualWins, <Luck key="l" v={a.luck} />, fmt(a.avgPoints), fmt(a.sdPoints)])}
                  />
                </Card>
                {season.playoffOdds?.length > 0 && (
                  <Card title="Playoff odds (Monte Carlo over remaining schedule)">
                    <Table
                      head={['Team', 'Playoff %', 'Proj. wins', 'Current W', 'Games left']}
                      rows={season.playoffOdds.map((o) => [<b key="n">{o.teamName}</b>, `${fmt(o.playoffPct)}%`, fmt(o.projectedWins), o.currentWins, o.gamesLeft])}
                    />
                  </Card>
                )}
                {season.strengthOfSchedule?.length > 0 && (
                  <Card title="Remaining strength of schedule">
                    <Table
                      head={['Team', 'Games left', 'Avg opponent projection', 'Own avg projection']}
                      rows={season.strengthOfSchedule.map((s) => [<b key="n">{s.teamName}</b>, s.gamesLeft, fmt(s.avgOpponentProjection), fmt(s.avgOwnProjection)])}
                    />
                  </Card>
                )}
              </>
            )}

            {tab === 'team' && team && <TeamView team={team} positions={POS} />}
          </>
        )}
      </div>
    </div>
  )
}

function TeamView({ team, positions }) {
  const lineup = team.lineup
  const dates = team.keyDates
  const sleepers = team.waivers?.sleepers || []

  return (
    <>
      <Card title={`${team.team.teamName} · ${team.team.record.wins}-${team.team.record.losses} · starter value ${fmt(team.totalStarterValue, 0)}`}>
        <div className="flex flex-wrap gap-3 text-sm">
          {team.positionalStrength && positions.map((p) => (
            <span key={p} className="border rounded px-2 py-1">{p}: <Delta v={team.positionalStrength[p]?.vsAverage} /></span>
          ))}
        </div>
      </Card>

      {dates && <KeyDates dates={dates} tradeWindow={team.tradeWindow} />}

      {lineup && <LineupCard lineup={lineup} autoSet={team.autoSet} />}

      <Card title="Roster (rest of season)">
        <Table
          head={['Player', 'Pos', 'Team', 'ROS pts', 'Value', 'Next wk', 'Status', '']}
          rows={team.roster.map((p) => [
            <span key="n">{p.name}{p.isStarter && <span className="ml-1 text-xs bg-green-100 dark:bg-green-900 rounded px-1">S</span>}{p.onIR && <span className="ml-1 text-xs bg-red-100 dark:bg-red-900 rounded px-1">IR</span>}</span>,
            p.position, p.team || '—', fmt(p.ros), <b key="v">{fmt(p.vorp)}</b>, fmt(p.nextWeek), p.injuryStatus || '—',
            <span key="f" className="text-xs">{p.flags?.map((f) => f.text).join(' · ')}</span>,
          ])}
        />
      </Card>

      {team.tradeWindow?.passed && (
        <Card title="Trades">
          <p className="text-sm">🔒 {team.tradeWindow.note}</p>
        </Card>
      )}

      {team.tradeTargets?.length > 0 && (
        <Card title="Trade targets (ranked by positional need × rest-of-season value)">
          {team.tradeWindow && !team.tradeWindow.passed && (
            <p className="text-xs opacity-70 mb-2">{team.tradeWindow.note}</p>
          )}
          <ul className="space-y-2 text-sm">
            {team.tradeTargets.map((t, i) => (
              <li key={i} className="border rounded p-2">
                <b>{t.target.name}</b> ({t.position}, {t.target.team}) from <b>{t.partner.teamName}</b> · {fmt(t.target.ros)} ROS pts · value {fmt(t.target.vorp)} → +{fmt(t.gain)} over {t.upgradeOver?.name || 'your current starter'}
                {t.positionNeed < 0 && <span className="ml-1 text-xs bg-amber-100 dark:bg-amber-900 rounded px-1">fills a {fmt(Math.abs(t.positionNeed), 0)}-pt hole at {t.position}</span>}
                {t.offerIdeas?.length > 0 && <div className="text-xs opacity-70 mt-1">Offer ideas from your surplus: {t.offerIdeas.map((o) => `${o.name} (${fmt(o.vorp)})`).join(', ')}</div>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sleepers.length > 0 && <SleeperCard sleepers={sleepers} />}

      {team.waivers?.targets?.length > 0 && (
        <Card title="Waiver targets (ranked by positional need, then rest-of-season value)">
          <Table
            head={['Player', 'Pos', 'Team', 'ROS pts', 'vs repl.', 'Next wk', 'Need', 'Trending adds', 'Upgrade over']}
            rows={team.waivers.targets.map((w) => [
              <b key="n">{w.name}</b>, w.position, w.team, fmt(w.ros), <Delta key="d" v={w.rawVorp} />, fmt(w.nextWeekPoints),
              <Priority key="p" level={w.priority} />,
              w.trendingAdds ? w.trendingAdds.toLocaleString() : '—',
              w.upgradeOver ? `${w.upgradeOver.name} (+${fmt(w.upgradeOver.gain)})` : '—',
            ])}
          />
          {team.waivers.dropCandidates?.length > 0 && (
            <p className="text-xs opacity-70 mt-2">Drop candidates: {team.waivers.dropCandidates.map((d) => `${d.name} (${d.position}, ${fmt(d.vorp)})`).join(' · ')}</p>
          )}
        </Card>
      )}
    </>
  )
}

const LEVEL_STYLES = {
  high: 'bg-red-100 dark:bg-red-900 border-red-300 dark:border-red-700',
  medium: 'bg-amber-100 dark:bg-amber-900 border-amber-300 dark:border-amber-700',
  info: 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700',
}

function KeyDates({ dates, tradeWindow }) {
  const d = dates
  return (
    <Card title="Key dates & alerts">
      <div className="grid sm:grid-cols-3 gap-2 text-sm mb-3">
        <Stat label="Trade deadline" value={d.tradeDeadline.week ? `Week ${d.tradeDeadline.week}` : 'None set'} sub={d.tradeDeadline.week ? (d.tradeDeadline.passed ? 'passed' : `${d.tradeDeadline.weeksAway} weeks away`) : tradeWindow?.note} />
        <Stat label="Playoffs" value={`Week ${d.playoffs.startWeek}`} sub={`${d.playoffs.teams} teams · weeks ${d.playoffs.weeks.join(', ')}`} />
        <Stat label="FAAB" value={d.waivers.budget ? `$${d.waivers.remaining} left` : `Waiver #${d.waivers.position ?? '—'}`} sub={d.waivers.budget ? `of $${d.waivers.budget}` : 'rolling waiver priority'} />
      </div>

      {d.alerts?.length > 0 && (
        <ul className="space-y-2 mb-3">
          {d.alerts.map((a, i) => (
            <li key={i} className={`border rounded p-2 text-sm ${LEVEL_STYLES[a.level] || LEVEL_STYLES.info}`}>
              <div className="font-semibold">{a.level === 'high' ? '🚨' : a.level === 'medium' ? '⚠️' : 'ℹ️'} {a.text}</div>
              {a.action && <div className="text-xs opacity-80 mt-0.5">{a.action}</div>}
            </li>
          ))}
        </ul>
      )}

      {d.byeOutlook?.length > 0 && (
        <details className="text-sm" open={d.byeOutlook.some((b) => b.risk !== 'low')}>
          <summary className="cursor-pointer font-semibold">Bye weeks ahead</summary>
          <ul className="mt-2 space-y-2">
            {d.byeOutlook.map((b) => (
              <li key={b.week} className="border rounded p-2">
                <div>
                  <b>Week {b.week}</b> <span className="opacity-60 text-xs">({b.weeksAway} away)</span> — {b.playersOut} on bye:{' '}
                  {Object.entries(b.byPosition).map(([pos, names]) => `${pos}: ${names.join(', ')}`).join(' · ')}
                </div>
                {b.shortages.map((sh) => (
                  <div key={sh.position} className="text-xs mt-1">
                    ⚠️ {sh.short} short at {sh.position} (need {sh.required}, {sh.healthy} available).{' '}
                    {sh.waiverCover.length
                      ? <>Available now: {sh.waiverCover.map((c) => `${c.name} (${c.team}, ${fmt(c.weekPoints)} that week)`).join(', ')}</>
                      : 'No free agent covers it — trade or stash early.'}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}

      {d.milestones?.length > 0 && (
        <details className="text-sm mt-2">
          <summary className="cursor-pointer font-semibold">All milestones</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {d.milestones.map((m, i) => (
              <li key={i}>
                <b>Week {m.week}</b> — {m.label}
                {m.passed && <span className="opacity-60"> (passed)</span>}
                {m.urgency === 'high' && !m.passed && <span className="ml-1 text-red-600 dark:text-red-400">urgent</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}

function LineupCard({ lineup, autoSet }) {
  return (
    <Card title={`Start/sit · week ${lineup.week}`}>
      <p className="text-xs opacity-70 mb-2">
        Every projection is re-scored through {lineup.gatesApplied?.length || 6} gates — availability, role, form, matchup, weather and game script — before any change is suggested.
      </p>

      {lineup.moves.length === 0 ? (
        <p className="text-green-700 dark:text-green-400">✅ {lineup.note} ({fmt(lineup.currentTotal)} projected after gates)</p>
      ) : (
        <>
          <p className="mb-2">Projected gain <b>+{fmt(lineup.gain)}</b> ({fmt(lineup.currentTotal)} → {fmt(lineup.recommendedTotal)} after gates)</p>
          <ul className="space-y-2 text-sm">
            {lineup.moves.map((m, i) => (
              <li key={i} className="border rounded p-2">
                <div>
                  <b>{m.slot}</b>: ▶ start <b>{m.in.name}</b> ({m.in.position} {m.in.team}{m.in.opponent ? ` vs ${m.in.opponent}` : ''})
                  {m.out && <> · ⏸ bench <b>{m.out.name}</b></>}
                  <span className="ml-1 text-green-700 dark:text-green-400">+{fmt(m.gain)}</span>
                </div>
                <div className="text-xs opacity-75 mt-1">
                  {fmt(m.in.baseProjection)} raw → {fmt(m.in.projection)} after gates · confidence {Math.round((m.in.confidence ?? 0) * 100)}%
                  {m.bar != null && <> · cleared a {fmt(m.bar)}-pt bar</>}
                </div>
                {m.out?.reason && <div className="text-xs opacity-75">Benching {m.out.name}: {m.out.reason}</div>}
                {m.in.why?.length > 0 && <div className="text-xs opacity-75">Why: {m.in.why.join(' · ')}</div>}
                {m.in.weather && <div className="text-xs opacity-75">🌦 {m.in.weather}</div>}
              </li>
            ))}
          </ul>
        </>
      )}

      {lineup.held?.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer">Considered but held ({lineup.held.length})</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {lineup.held.map((h, i) => (
              <li key={i}>{h.slot}: kept <b>{h.keep}</b> over {h.over} — {h.reason}</li>
            ))}
          </ul>
        </details>
      )}

      {lineup.contextNotes?.length > 0 && (
        <div className="mt-2 text-xs opacity-80">
          {lineup.contextNotes.map((n, i) => <div key={i}>🌦 {n}</div>)}
        </div>
      )}

      {lineup.unfilled?.length > 0 && <p className="text-sm text-red-600 mt-2">No eligible player for: {lineup.unfilled.join(', ')}</p>}
      <p className="text-xs opacity-60 mt-2">{autoSet?.reason}</p>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer">Recommended lineup with gate detail</summary>
        <div className="mt-2 space-y-2">
          {lineup.recommended.map((s, i) => (
            <div key={i} className="border rounded p-2">
              <div className="flex justify-between">
                <span><b>{s.slot}</b> — {s.name} {s.position ? `(${s.position} ${s.team || ''}${s.opponent ? ` vs ${s.opponent}` : ''})` : ''}</span>
                <span>{fmt(s.baseProjection)} → <b>{fmt(s.points)}</b></span>
              </div>
              {s.gates && (
                <table className="w-full text-xs mt-1">
                  <tbody>
                    {s.gates.map((g) => (
                      <tr key={g.name} className={g.verdict === 'fail' ? 'text-red-600 dark:text-red-400' : g.verdict === 'pass' ? 'text-green-700 dark:text-green-400' : 'opacity-70'}>
                        <td className="pr-2 align-top">{g.name}</td>
                        <td className="pr-2 align-top">×{g.factor}</td>
                        <td className="align-top">{g.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </details>
    </Card>
  )
}

function SleeperCard({ sleepers }) {
  return (
    <Card title="Deep sleepers (handcuffs behind the league's workhorses)">
      <p className="text-xs opacity-70 mb-2">
        Free agents sitting directly behind a high-volume starter on their NFL depth chart, valued on what they would inherit — plus anyone whose own snap share is already climbing.
      </p>
      <ul className="space-y-2 text-sm">
        {sleepers.map((s) => (
          <li key={s.id} className="border rounded p-2">
            <div>
              <b>{s.name}</b> ({s.position} {s.team})
              {s.rising && <span className="ml-1 text-xs bg-green-100 dark:bg-green-900 rounded px-1">rising</span>}
              {s.type === 'handcuff' && !s.rising && <span className="ml-1 text-xs bg-blue-100 dark:bg-blue-900 rounded px-1">handcuff</span>}
              <span className="ml-2 opacity-70 text-xs">score {fmt(s.score)}</span>
            </div>
            <div className="text-xs opacity-80 mt-0.5">{s.why}</div>
            <div className="text-xs opacity-70 mt-0.5">
              Would inherit ~{fmt(s.contingentPointsPerGame)} pts/gm · own ROS {fmt(s.rosPoints)}
              {s.sampleGames ? ` · ${s.sampleGames}-game sample` : ''}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="border rounded p-2">
      <div className="text-xs opacity-60">{label}</div>
      <div className="font-semibold">{value}</div>
      {sub && <div className="text-xs opacity-70">{sub}</div>}
    </div>
  )
}

function Priority({ level }) {
  if (!level || level === 'low') return <span className="opacity-50">—</span>
  const cls = level === 'high' ? 'bg-red-100 dark:bg-red-900' : 'bg-amber-100 dark:bg-amber-900'
  return <span className={`text-xs rounded px-1 ${cls}`}>{level}</span>
}

function Card({ title, children }) {
  return (
    <section className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 mb-4 shadow-sm">
      <h2 className="font-semibold mb-2">{title}</h2>
      {children}
    </section>
  )
}

function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-3 py-1 rounded border ${active ? 'bg-black text-white dark:bg-white dark:text-black' : ''}`}>
      {children}
    </button>
  )
}

function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 dark:bg-gray-800">
            {head.map((h, i) => <th key={i} className="border px-2 py-1 text-left">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => <td key={j} className="border px-2 py-1">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Luck({ v }) {
  if (v == null) return '—'
  const cls = v > 0.5 ? 'text-green-700 dark:text-green-400' : v < -0.5 ? 'text-red-600 dark:text-red-400' : ''
  return <span className={cls}>{v > 0 ? '+' : ''}{fmt(v)}</span>
}

function Delta({ v }) {
  if (v == null) return '—'
  const cls = v > 0 ? 'text-green-700 dark:text-green-400' : v < 0 ? 'text-red-600 dark:text-red-400' : ''
  return <span className={cls}>{v > 0 ? '+' : ''}{fmt(v, 0)}</span>
}
