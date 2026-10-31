'use client'

import { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Layout from '../components/Layout'
import Entry from '../components/almanac/Entry'
import LeaguePage from '../components/almanac/LeaguePage'
import DayPage from '../components/almanac/DayPage'
import SeasonLedger from '../components/almanac/SeasonLedger'
import PlayerSheet from '../components/almanac/PlayerSheet'
import { Note } from '../components/ui'
import { api } from '../lib/api'
import { useUI } from '../lib/ui'
import { useQueryState } from '../lib/url'
import { rememberLeague, myTeam } from '../lib/memory'

/**
 * The Almanac route. All state is in the query string:
 *   l=LEAGUE  t=ROSTER  view=league|season  open=SLIP  p=PLAYER
 * so every view is a link and the back button retraces each step.
 */
export default function AlmanacRoute() {
  const { t } = useUI()
  const { q, set, ready } = useQueryState()
  const { l: leagueId, t: rosterId, view, open, p: playerId } = q

  const [summary, setSummary] = useState(null)
  const [team, setTeam] = useState(null)
  const [season, setSeason] = useState(null)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')

  // league summary
  useEffect(() => {
    if (!ready || !leagueId) return undefined
    if (summary?.league?.id === leagueId) return undefined
    let alive = true
    setLoading('league')
    setError('')
    setSummary(null)
    setSeason(null)
    api(`/api/league/${leagueId}`)
      .then((d) => { if (!alive) return; setSummary(d); rememberLeague(d.league) })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(''))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, leagueId])

  // the remembered team is the front door, unless the league view was asked for explicitly
  useEffect(() => {
    if (!ready || !leagueId || rosterId || view) return
    const mine = myTeam(leagueId)
    if (mine) set({ t: String(mine.rosterId) }, { replace: true })
  }, [ready, leagueId, rosterId, view, set])

  // team report
  useEffect(() => {
    if (!ready || !leagueId || !rosterId) return undefined
    if (team?.league?.id === leagueId && String(team.team?.rosterId) === String(rosterId)) return undefined
    let alive = true
    setLoading('team')
    setError('')
    setTeam(null)
    api(`/api/league/${leagueId}/team/${rosterId}`)
      .then((d) => alive && setTeam(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(''))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, leagueId, rosterId])

  // season ledger
  useEffect(() => {
    if (!ready || !leagueId || view !== 'season' || season) return undefined
    let alive = true
    setLoading('season')
    api(`/api/league/${leagueId}/season`)
      .then((d) => alive && setSeason(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(''))
    return () => { alive = false }
  }, [ready, leagueId, view, season])

  const openLeague = useCallback((id) => set({ l: id, t: null, view: null, open: null, p: null }), [set])
  const openTeam = useCallback((rid) => set({ t: String(rid), view: null, open: null, p: null }), [set])
  const toLeagueView = useCallback(() => set({ t: null, view: 'league', open: null, p: null }), [set])
  const toSeason = useCallback(() => set({ t: null, view: 'season', open: null, p: null }), [set])
  const toEntry = useCallback(() => set({ l: null, t: null, view: null, open: null, p: null }), [set])
  const setOpen = useCallback((id) => set({ open: id || null }), [set])
  const setPlayer = useCallback((id) => set({ p: id ? String(id) : null }), [set])
  const closePlayer = useCallback(() => set({ p: null }), [set])

  const title = team ? `${team.team.teamName} · Kuangstradamus` : summary ? `${summary.league.name} · Kuangstradamus` : t('Almanac · Kuangstradamus', '年鉴 · 诺查丹玛斯')

  let body = null
  if (!ready) body = null
  else if (!leagueId) body = <Entry onOpen={openLeague} />
  else if (!summary) body = loading ? <p className="font-display text-xl text-fg-3">{t('Importing league…', '正在导入联盟……')}</p> : null
  else if (rosterId) body = <DayPage summary={summary} team={team} loading={loading === 'team'} open={open} onOpen={setOpen} onPlayer={setPlayer} onLeague={toLeagueView} onSeason={toSeason} leagueId={leagueId} />
  else if (view === 'season') body = <SeasonLedger summary={summary} season={season} loading={loading === 'season'} onBack={toLeagueView} onTeam={openTeam} />
  else body = <LeaguePage summary={summary} onTeam={openTeam} onSeason={toSeason} onEntry={toEntry} />

  return (
    <Layout wide>
      <Head><title>{title}</title></Head>
      {error && <div className="mb-4"><Note level="high">⚠️ {error}</Note></div>}
      {body}
      <PlayerSheet playerId={playerId} team={team} leagueId={leagueId} onClose={closePlayer} />
    </Layout>
  )
}
