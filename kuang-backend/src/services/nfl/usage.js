// Recent-form, usage and defence-vs-position trends built from Sleeper's free
// per-week stat lines:
//   GET api.sleeper.com/stats/nfl/{season}/{week}?season_type=regular
//
// One request per week returns every position (including DEF and K), so a
// five-week lookback costs five cached requests for the whole app.
//
// Everything here is scored with the *league's* scoring settings, so a
// TE-premium or 6-point-pass-TD league gets trends in its own currency.

import { fetchJson, TTL } from '../sleeper/client.js';
import { scoreStats } from '../../domain/scoring.js';

const API = 'https://api.sleeper.com';
export const TREND_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
export const DEFAULT_LOOKBACK = 5;

/** Raw stat rows for one completed week. */
export async function getWeeklyStats(season, week) {
  const rows = await fetchJson(`${API}/stats/nfl/${season}/${week}?season_type=regular`, { ttl: TTL.stats }).catch(() => []);
  return (rows || []).map((r) => ({
    playerId: String(r.player_id),
    week: Number(r.week ?? week),
    position: r.player?.position ?? null,
    team: r.team ?? r.player?.team ?? null,
    opponent: r.opponent ?? null,
    stats: r.stats || {},
  }));
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r2 = (x) => Number((x ?? 0).toFixed(2));

/**
 * Build form + matchup tables over the `lookback` weeks ending at `throughWeek`.
 *
 * @returns {{
 *   weeks: number[],
 *   form: Map<string, object>,          // playerId -> recent form & usage
 *   defense: Map<string, object>,       // `${team}|${pos}` -> points allowed
 *   defenseLeagueAvg: Record<string, number>,
 *   teamOffense: Map<string, object>,   // team -> recent scoring volume
 * }}
 */
export async function buildTrendTables({ season, throughWeek, lookback = DEFAULT_LOOKBACK, scoringSettings = {} }) {
  const weeks = [];
  for (let w = Math.max(1, throughWeek - lookback + 1); w <= throughWeek; w++) weeks.push(w);
  if (!weeks.length) {
    return { weeks: [], form: new Map(), defense: new Map(), defenseLeagueAvg: {}, teamOffense: new Map() };
  }

  const byWeek = await Promise.all(weeks.map((w) => getWeeklyStats(season, w)));

  const form = new Map();
  const allowed = new Map();     // `${defTeam}|${pos}` -> { pts: [], games: Set }
  const teamOffense = new Map(); // team -> { pts: [], weeks: Set }

  byWeek.forEach((rows, i) => {
    const week = weeks[i];
    for (const row of rows) {
      const { stats, position } = row;
      if (!position || !TREND_POSITIONS.includes(position)) continue;
      const played = (stats.gp ?? 0) > 0 || (stats.off_snp ?? 0) > 0 || position === 'DEF';
      const pts = scoreStats(stats, scoringSettings);

      // ---- player form & usage ----
      let f = form.get(row.playerId);
      if (!f) {
        f = { playerId: row.playerId, position, team: row.team, games: [], };
        form.set(row.playerId, f);
      }
      if (row.team) f.team = row.team;
      f.games.push({
        week,
        points: r2(pts),
        played,
        opponent: row.opponent,
        snaps: stats.off_snp ?? null,
        teamSnaps: stats.tm_off_snp ?? null,
        snapShare: stats.off_snp && stats.tm_off_snp ? stats.off_snp / stats.tm_off_snp : null,
        carries: stats.rush_att ?? 0,
        targets: stats.rec_tgt ?? 0,
        touches: (stats.rush_att ?? 0) + (stats.rec_tgt ?? 0),
        passAttempts: stats.pass_att ?? 0,
      });

      // ---- defence vs position (points this defence surrendered) ----
      if (row.opponent && played) {
        const key = `${row.opponent}|${position}`;
        let d = allowed.get(key);
        if (!d) { d = { team: row.opponent, position, pts: 0, weeks: new Set() }; allowed.set(key, d); }
        d.pts += pts;
        d.weeks.add(week);
      }

      // ---- team offensive output (game-script proxy) ----
      if (row.team && played && position !== 'DEF') {
        let t = teamOffense.get(row.team);
        if (!t) { t = { team: row.team, pts: 0, weeks: new Set() }; teamOffense.set(row.team, t); }
        t.pts += pts;
        t.weeks.add(week);
      }
    }
  });

  // finalise player form
  for (const f of form.values()) {
    f.games.sort((a, b) => a.week - b.week);
    const active = f.games.filter((g) => g.played);
    const pts = active.map((g) => g.points);
    f.gamesPlayed = active.length;
    f.recentPPG = r2(mean(pts));
    // last three vs the ones before them — the direction of travel
    const last3 = pts.slice(-3);
    const prior = pts.slice(0, -3);
    f.last3PPG = r2(mean(last3));
    f.priorPPG = prior.length ? r2(mean(prior)) : null;
    f.trend = f.priorPPG == null ? 0 : r2(f.last3PPG - f.priorPPG);

    const shares = active.map((g) => g.snapShare).filter((s) => typeof s === 'number');
    f.snapShare = shares.length ? r2(mean(shares)) : null;
    f.snapShareLast = shares.length ? r2(shares[shares.length - 1]) : null;
    f.snapShareTrend = shares.length >= 2 ? r2(mean(shares.slice(-2)) - mean(shares.slice(0, -2).length ? shares.slice(0, -2) : shares.slice(0, 1))) : 0;

    const touches = active.map((g) => g.touches);
    f.touchesPerGame = r2(mean(touches));
    f.touchesLast = touches.length ? touches[touches.length - 1] : 0;
    f.touchesTrend = touches.length >= 2 ? r2(mean(touches.slice(-2)) - mean(touches.slice(0, -2).length ? touches.slice(0, -2) : touches.slice(0, 1))) : 0;
    f.targetsPerGame = r2(mean(active.map((g) => g.targets)));
    f.carriesPerGame = r2(mean(active.map((g) => g.carries)));
  }

  // finalise defence vs position, with a league average per position
  const defense = new Map();
  const perPos = {};
  for (const d of allowed.values()) {
    const games = d.weeks.size || 1;
    const perGame = r2(d.pts / games);
    defense.set(`${d.team}|${d.position}`, { team: d.team, position: d.position, gamesSampled: games, pointsAllowedPerGame: perGame });
    (perPos[d.position] ||= []).push(perGame);
  }
  const defenseLeagueAvg = {};
  for (const [pos, list] of Object.entries(perPos)) defenseLeagueAvg[pos] = r2(mean(list));

  // rank 1 = most generous defence to face
  const byPos = {};
  for (const d of defense.values()) (byPos[d.position] ||= []).push(d);
  for (const [pos, list] of Object.entries(byPos)) {
    list.sort((a, b) => b.pointsAllowedPerGame - a.pointsAllowedPerGame);
    list.forEach((d, i) => {
      d.rank = i + 1;
      d.of = list.length;
      d.vsAvg = r2(d.pointsAllowedPerGame - (defenseLeagueAvg[pos] ?? 0));
    });
  }

  for (const t of teamOffense.values()) {
    t.gamesSampled = t.weeks.size || 1;
    t.pointsPerGame = r2(t.pts / t.gamesSampled);
    delete t.weeks;
  }
  const offAvg = r2(mean([...teamOffense.values()].map((t) => t.pointsPerGame)));
  for (const t of teamOffense.values()) t.vsAvg = r2(t.pointsPerGame - offAvg);

  return { weeks, form, defense, defenseLeagueAvg, teamOffense, teamOffenseAvg: offAvg };
}

/** Defence-vs-position lookup that degrades to null rather than throwing. */
export function defenseVs(trends, team, position) {
  if (!trends?.defense || !team || !position) return null;
  return trends.defense.get(`${team}|${position}`) || null;
}
