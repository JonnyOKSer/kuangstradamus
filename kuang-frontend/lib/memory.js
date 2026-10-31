// What the almanac remembers about you, on this device only.
//   kuang_leagues        [{ id, name, season, totalRosters }]
//   kuang_team:<league>  { rosterId, teamName }
//   kuang_consults       last five Oracle questions
// localStorage throws in private-mode Safari and when cookies are blocked, so
// every access is guarded and a failure just means "nothing remembered".

const LEAGUES = 'kuang_leagues'
const TEAM = (leagueId) => `kuang_team:${leagueId}`
const CONSULTS = 'kuang_consults'
export const MEMORY_EVENT = 'kuang:memory'

const get = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}
const put = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(MEMORY_EVENT))
  } catch { /* nothing to do */ }
}

export const rememberedLeagues = () => get(LEAGUES, [])

export function rememberLeague(league) {
  const list = rememberedLeagues().filter((l) => l.id !== league.id)
  list.unshift({ id: league.id, name: league.name, season: league.season, totalRosters: league.totalRosters })
  put(LEAGUES, list.slice(0, 8))
}

export function forgetLeague(leagueId) {
  put(LEAGUES, rememberedLeagues().filter((l) => l.id !== leagueId))
  put(TEAM(leagueId), null)
}

export const myTeam = (leagueId) => (leagueId ? get(TEAM(leagueId), null) : null)
export const setMyTeam = (leagueId, team) => put(TEAM(leagueId), team ? { rosterId: team.rosterId, teamName: team.teamName } : null)

/** The most recently opened league that has a remembered team, if any. */
export function homeTeam() {
  for (const l of rememberedLeagues()) {
    const t = myTeam(l.id)
    if (t) return { league: l, team: t }
  }
  return null
}

export const recentConsults = () => get(CONSULTS, [])
export function rememberConsult(entry) {
  const list = recentConsults().filter((c) => c.query !== entry.query)
  list.unshift(entry)
  put(CONSULTS, list.slice(0, 5))
}
export const clearConsults = () => put(CONSULTS, null)
