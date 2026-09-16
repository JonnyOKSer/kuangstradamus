// NFL schedule from Sleeper's free schedule feed:
//   GET api.sleeper.com/schedule/nfl/regular/{season}
//   -> [{ status, date, home, away, week, game_id }, ...]
//
// The feed carries the date but not the kickoff time, which is why the weather
// service samples a window of hours rather than a single kickoff hour.

import { fetchJson, TTL } from '../sleeper/client.js';
import { stadiumFor, isSheltered } from '../../domain/stadiums.js';

const API = 'https://api.sleeper.com';

export async function getSchedule(season, seasonType = 'regular') {
  return (await fetchJson(`${API}/schedule/nfl/${seasonType}/${season}`, { ttl: TTL.schedule })) || [];
}

/**
 * Game context for one week, keyed by team abbreviation.
 * Map<team, { gameId, week, date, opponent, isHome, venueTeam, stadium, sheltered, status }>
 */
export async function gamesByTeam(season, week, seasonType = 'regular') {
  const games = await getSchedule(season, seasonType);
  const out = new Map();
  for (const g of games) {
    if (Number(g.week) !== Number(week)) continue;
    const base = { gameId: g.game_id, week: Number(g.week), date: g.date, status: g.status };
    if (g.home) {
      out.set(g.home, { ...base, opponent: g.away, isHome: true, venueTeam: g.home, stadium: stadiumFor(g.home), sheltered: isSheltered(g.home) });
    }
    if (g.away) {
      out.set(g.away, { ...base, opponent: g.home, isHome: false, venueTeam: g.home, stadium: stadiumFor(g.home), sheltered: isSheltered(g.home) });
    }
  }
  return out;
}

/** Every game a team plays, in week order — used for bye detection and trends. */
export async function teamWeeks(season, seasonType = 'regular') {
  const games = await getSchedule(season, seasonType);
  const out = new Map();
  for (const g of games) {
    for (const [team, opp, isHome] of [[g.home, g.away, true], [g.away, g.home, false]]) {
      if (!team) continue;
      if (!out.has(team)) out.set(team, []);
      out.get(team).push({ week: Number(g.week), opponent: opp, isHome, date: g.date, status: g.status, gameId: g.game_id });
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.week - b.week);
  return out;
}

/**
 * Bye weeks per team, derived from the schedule.
 *
 * Sleeper's weekly projection feed carries a row for every player in every
 * week, including bye weeks, so "no projection that week" does not identify a
 * bye. The schedule does: a team with no game in a week is on bye.
 *
 * @returns Map<team, number[]>
 */
export async function byeWeeksByTeam(season, seasonType = 'regular') {
  const byTeam = await teamWeeks(season, seasonType);
  const allWeeks = new Set();
  for (const games of byTeam.values()) for (const g of games) allWeeks.add(g.week);
  const weeks = [...allWeeks].sort((a, b) => a - b);

  const out = new Map();
  for (const [team, games] of byTeam) {
    const played = new Set(games.map((g) => g.week));
    out.set(team, weeks.filter((w) => !played.has(w)));
  }
  return out;
}
