// League import over Sleeper's read-only league endpoints (no auth needed).
// https://docs.sleeper.com

import { fetchJson, TTL } from './client.js';
import { getState } from './projections.js';

const APP = 'https://api.sleeper.app/v1';

function notFound(what) {
  const err = new Error(`${what} not found on Sleeper`);
  err.status = 404;
  return err;
}

export async function getUser(usernameOrId) {
  const u = await fetchJson(`${APP}/user/${encodeURIComponent(usernameOrId)}`, { ttl: TTL.league });
  if (!u) throw notFound(`User "${usernameOrId}"`);
  return u;
}

export async function getUserLeagues(userId, season) {
  return (await fetchJson(`${APP}/user/${userId}/leagues/nfl/${season}`, { ttl: TTL.league })) || [];
}

export async function getLeague(leagueId) {
  const l = await fetchJson(`${APP}/league/${leagueId}`, { ttl: TTL.league });
  if (!l) throw notFound(`League ${leagueId}`);
  return l;
}

export const getRosters = (leagueId) => fetchJson(`${APP}/league/${leagueId}/rosters`, { ttl: TTL.league });
export const getLeagueUsers = (leagueId) => fetchJson(`${APP}/league/${leagueId}/users`, { ttl: TTL.league });
export const getMatchups = (leagueId, week) => fetchJson(`${APP}/league/${leagueId}/matchups/${week}`, { ttl: TTL.league });
export const getTransactions = (leagueId, round) => fetchJson(`${APP}/league/${leagueId}/transactions/${round}`, { ttl: TTL.league });
export const getTradedPicks = (leagueId) => fetchJson(`${APP}/league/${leagueId}/traded_picks`, { ttl: TTL.league });
export const getWinnersBracket = (leagueId) => fetchJson(`${APP}/league/${leagueId}/winners_bracket`, { ttl: TTL.league });

/** Sleeper's scoring_settings.rec value tells us the receiving format. */
export function scoringFormatOf(league) {
  const rec = Number(league?.scoring_settings?.rec ?? 1);
  if (rec >= 0.75) return 'ppr';
  if (rec >= 0.25) return 'half_ppr';
  return 'std';
}

/**
 * Pull everything needed for season analysis in one call: league settings,
 * rosters joined to owners, and matchups for every week of the season.
 */
export async function importLeague(leagueId) {
  const [league, rosters, users, state] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getLeagueUsers(leagueId),
    getState(),
  ]);

  const settings = league.settings || {};
  const playoffStart = settings.playoff_week_start || 15;
  const lastWeek = Math.max(17, playoffStart + 2);
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);
  const matchupLists = await Promise.all(weeks.map((w) => getMatchups(leagueId, w).catch(() => [])));
  const matchupsByWeek = {};
  weeks.forEach((w, i) => { matchupsByWeek[w] = matchupLists[i] || []; });

  const isCurrentSeason = String(league.season) === String(state.season);
  const currentWeek = isCurrentSeason ? state.week : lastWeek + 1;
  const lastScoredWeek = settings.last_scored_leg ?? (isCurrentSeason ? Math.max(0, state.week - 1) : lastWeek);

  const usersById = new Map((users || []).map((u) => [u.user_id, u]));
  const teams = (rosters || []).map((r) => {
    const owner = usersById.get(r.owner_id);
    return {
      rosterId: r.roster_id,
      ownerId: r.owner_id,
      ownerName: owner?.display_name || 'Unknown',
      teamName: owner?.metadata?.team_name || owner?.display_name || `Team ${r.roster_id}`,
      avatar: owner?.avatar || null,
      players: r.players || [],
      starters: (r.starters || []).filter(Boolean),
      reserve: r.reserve || [],
      taxi: r.taxi || [],
      record: {
        wins: r.settings?.wins ?? 0,
        losses: r.settings?.losses ?? 0,
        ties: r.settings?.ties ?? 0,
        pointsFor: Number(`${r.settings?.fpts ?? 0}.${String(r.settings?.fpts_decimal ?? 0).padStart(2, '0')}`),
        pointsAgainst: Number(`${r.settings?.fpts_against ?? 0}.${String(r.settings?.fpts_against_decimal ?? 0).padStart(2, '0')}`),
        maxPointsFor: Number(`${r.settings?.ppts ?? 0}.${String(r.settings?.ppts_decimal ?? 0).padStart(2, '0')}`),
        waiverBudgetUsed: r.settings?.waiver_budget_used ?? 0,
        waiverPosition: r.settings?.waiver_position ?? null,
      },
    };
  });

  return {
    league: {
      id: league.league_id,
      name: league.name,
      season: league.season,
      status: league.status,
      totalRosters: league.total_rosters,
      rosterPositions: league.roster_positions || [],
      scoringSettings: league.scoring_settings || {},
      scoringFormat: scoringFormatOf(league),
      playoffWeekStart: playoffStart,
      playoffTeams: settings.playoff_teams ?? 6,
      tradeDeadline: settings.trade_deadline ?? null,
      waiverType: settings.waiver_type ?? null,
      waiverBudget: settings.waiver_budget ?? null,
      type: settings.type ?? 0,
      leagueType: ({ 0: 'redraft', 1: 'keeper', 2: 'dynasty' })[settings.type ?? 0] || 'redraft',
      previousLeagueId: league.previous_league_id || null,
      avatar: league.avatar || null,
    },
    state: { season: state.season, week: state.week, seasonType: state.season_type },
    currentWeek,
    lastScoredWeek,
    regularSeasonWeeks: weeks.filter((w) => w < playoffStart),
    teams,
    matchupsByWeek,
  };
}
