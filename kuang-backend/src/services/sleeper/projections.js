// Projections, stats and season state from Sleeper's free endpoints.
//
//   GET api.sleeper.app/v1/state/nfl
//   GET api.sleeper.com/projections/nfl/{season}?season_type=regular&position[]=RB...   (season totals)
//   GET api.sleeper.com/projections/nfl/{season}/{week}?season_type=regular&position[]=RB...
//   GET api.sleeper.com/projections/nfl/player/{id}?season=2026&season_type=regular&grouping=week
//   GET api.sleeper.com/stats/nfl/player/{id}?season=2025&season_type=regular[&grouping=week]
//
// Every response carries pts_ppr / pts_half_ppr / pts_std so scoring format is a lookup.

import { fetchJson, TTL } from './client.js';
import { FANTASY_POSITIONS } from './players.js';

const API = 'https://api.sleeper.com';
const APP = 'https://api.sleeper.app/v1';

export const SCORING_FORMATS = ['ppr', 'half_ppr', 'std'];
export const DEFAULT_LAST_WEEK = 17; // most fantasy seasons end week 17

export async function getState() {
  return fetchJson(`${APP}/state/nfl`, { ttl: TTL.state });
}

const posQuery = (positions) => positions.map((p) => `position[]=${encodeURIComponent(p)}`).join('&');

function mapRow(row) {
  const s = row.stats || {};
  return {
    playerId: String(row.player_id),
    week: row.week ?? null,
    position: row.player?.position ?? null,
    fantasyPositions: row.player?.fantasy_positions ?? null,
    team: row.team ?? row.player?.team ?? null,
    injuryStatus: row.player?.injury_status ?? null,
    opponent: row.opponent ?? null,
    date: row.date ?? null,
    gp: s.gp ?? null,
    pts: {
      ppr: s.pts_ppr ?? 0,
      half_ppr: s.pts_half_ppr ?? 0,
      std: s.pts_std ?? 0,
    },
    adp: { ppr: s.adp_ppr ?? null, half_ppr: s.adp_half_ppr ?? null, std: s.adp_std ?? null },
    stats: s,
  };
}

/** Full-season projections for every player at the given positions. */
export async function getSeasonProjections(season, positions = FANTASY_POSITIONS) {
  const url = `${API}/projections/nfl/${season}?season_type=regular&${posQuery(positions)}&order_by=pts_ppr`;
  const rows = await fetchJson(url, { ttl: TTL.projections });
  return (rows || []).map(mapRow);
}

/** Single-week projections for every player at the given positions. */
export async function getWeeklyProjections(season, week, positions = FANTASY_POSITIONS) {
  const url = `${API}/projections/nfl/${season}/${week}?season_type=regular&${posQuery(positions)}&order_by=pts_ppr`;
  const rows = await fetchJson(url, { ttl: TTL.projections });
  return (rows || []).map(mapRow);
}

/** { "1": row|null, ..., "18": row|null } — a null week is the bye. */
export async function getPlayerWeeklyProjections(playerId, season) {
  const url = `${API}/projections/nfl/player/${playerId}?season=${season}&season_type=regular&grouping=week`;
  const data = await fetchJson(url, { ttl: TTL.projections });
  const out = {};
  for (const [week, row] of Object.entries(data || {})) out[week] = row ? mapRow(row) : null;
  return out;
}

/** Actual stats. Without grouping: season totals. grouping='week': per-week map. */
export async function getPlayerStats(playerId, season, { grouping } = {}) {
  const url = `${API}/stats/nfl/player/${playerId}?season=${season}&season_type=regular${grouping ? `&grouping=${grouping}` : ''}`;
  const data = await fetchJson(url, { ttl: TTL.stats });
  if (!data) return null;
  if (grouping === 'week') {
    const out = {};
    for (const [week, row] of Object.entries(data)) out[week] = row ? mapRow(row) : null;
    return out;
  }
  return mapRow(data);
}

/**
 * Rest-of-season table: sum of weekly projections from `fromWeek` through
 * `throughWeek` for every fantasy player. One request per week (cached 1h), so
 * a full league analysis costs at most ~17 requests.
 *
 * Returns Map<playerId, { playerId, position, team, injuryStatus, pts, byWeek, weeks, byeWeeks }>
 */
export async function buildRosTable({ season, fromWeek, throughWeek = DEFAULT_LAST_WEEK, positions = FANTASY_POSITIONS }) {
  const start = Math.max(1, fromWeek);
  const weeks = [];
  for (let w = start; w <= throughWeek; w++) weeks.push(w);

  const weekly = await Promise.all(weeks.map((w) => getWeeklyProjections(season, w, positions)));
  const table = new Map();

  weekly.forEach((rows, i) => {
    const week = weeks[i];
    for (const r of rows) {
      let e = table.get(r.playerId);
      if (!e) {
        e = {
          playerId: r.playerId,
          position: r.position,
          team: r.team,
          injuryStatus: r.injuryStatus,
          pts: { ppr: 0, half_ppr: 0, std: 0 },
          byWeek: {},
          byWeekStats: {},
          opponents: {},
          weeks: [],
        };
        table.set(r.playerId, e);
      }
      e.pts.ppr += r.pts.ppr;
      e.pts.half_ppr += r.pts.half_ppr;
      e.pts.std += r.pts.std;
      e.byWeek[week] = r.pts;
      e.byWeekStats[week] = r.stats;
      e.opponents[week] = r.opponent;
      e.weeks.push(week);
      if (r.team) e.team = r.team;
      if (r.injuryStatus !== null) e.injuryStatus = r.injuryStatus;
    }
  });

  for (const e of table.values()) {
    e.byeWeeks = weeks.filter((w) => !(w in e.byWeek));
    for (const k of SCORING_FORMATS) e.pts[k] = Number(e.pts[k].toFixed(2));
  }

  return { season, fromWeek: start, throughWeek, weeks, table };
}

/** Points for one week from a ROS table entry (0 on bye / missing). */
export function weekPoints(entry, week, format = 'ppr') {
  return entry?.byWeek?.[week]?.[format] ?? 0;
}
