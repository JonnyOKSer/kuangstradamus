// Glue between Sleeper data and the domain analytics. Builds a per-league
// context (import + projections scored with that league's rules + replacement
// levels) and exposes the report shapes the routes return.

import { importLeague } from './sleeper/league.js';
import { loadPlayers, getTrending } from './sleeper/players.js';
import { buildRosTable, DEFAULT_LAST_WEEK } from './sleeper/projections.js';
import { computeReplacementLevels, playerFlags } from '../domain/valuation.js';
import { rosLeaguePoints, describeScoring } from '../domain/scoring.js';
import * as season from '../domain/season.js';

const CTX_TTL = 10 * 60 * 1000;
const ctxCache = new Map(); // leagueId -> { expires, promise }

export async function buildLeagueContext(leagueId) {
  const hit = ctxCache.get(leagueId);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const promise = build(leagueId).catch((err) => { ctxCache.delete(leagueId); throw err; });
  ctxCache.set(leagueId, { expires: Date.now() + CTX_TTL, promise });
  return promise;
}

async function build(leagueId) {
  const [imported, { byId }] = await Promise.all([importLeague(leagueId), loadPlayers()]);
  const isCurrent = String(imported.league.season) === String(imported.state.season) && imported.state.seasonType !== 'post';
  const fromWeek = isCurrent ? Math.max(1, imported.currentWeek) : DEFAULT_LAST_WEEK + 1;

  const ros = fromWeek <= DEFAULT_LAST_WEEK
    ? await buildRosTable({ season: imported.league.season, fromWeek })
    : { season: imported.league.season, fromWeek, throughWeek: DEFAULT_LAST_WEEK, weeks: [], table: new Map() };

  const scoring = imported.league.scoringSettings;
  const leaguePts = new Map();
  for (const e of ros.table.values()) {
    const { total, byWeek } = rosLeaguePoints(e, scoring);
    leaguePts.set(e.playerId, { total, byWeek, position: e.position, team: e.team, byeWeeks: e.byeWeeks, injuryStatus: e.injuryStatus, opponents: e.opponents });
  }
  const levels = computeReplacementLevels({
    rosterPositions: imported.league.rosterPositions,
    numTeams: imported.league.totalRosters,
    players: [...leaguePts.values()].map((v) => ({ position: v.position, pts: v.total })),
  });
  const rounds = Math.max(1, Math.ceil(Math.log2(imported.league.playoffTeams || 6)));
  const playoffWeeks = Array.from({ length: rounds }, (_, i) => imported.league.playoffWeekStart + i);

  return { imported, playersById: byId, ros, leaguePts, levels, scoring, playoffWeeks, isCurrent, scoringDescription: describeScoring(scoring) };
}

function leagueHeader(ctx) {
  const { imported } = ctx;
  return {
    ...imported.league,
    scoringDescription: ctx.scoringDescription,
    state: imported.state,
    currentWeek: imported.currentWeek,
    lastScoredWeek: imported.lastScoredWeek,
    isCurrentSeason: ctx.isCurrent,
    projectionWindow: ctx.isCurrent ? { fromWeek: ctx.ros.fromWeek, throughWeek: ctx.ros.throughWeek } : null,
    replacementLevels: ctx.levels.replacementPoints,
    startersByPosition: ctx.levels.startersByPosition,
    playoffWeeks: ctx.playoffWeeks,
  };
}

export async function leagueSummary(leagueId) {
  const ctx = await buildLeagueContext(leagueId);
  const strength = season.positionalStrength(ctx);
  const odds = season.playoffOdds(ctx);
  const oddsById = new Map(odds.map((o) => [o.rosterId, o]));
  const strengthById = new Map(strength.teams.map((s) => [s.rosterId, s]));
  return {
    league: leagueHeader(ctx),
    standings: season.standings(ctx).map((s) => ({
      ...s,
      playoffPct: oddsById.get(s.rosterId)?.playoffPct ?? null,
      projectedWins: oddsById.get(s.rosterId)?.projectedWins ?? null,
      starterValue: strengthById.get(s.rosterId)?.totalStarterValue ?? null,
    })),
    positionalStrength: strength,
  };
}

export async function seasonReport(leagueId) {
  const ctx = await buildLeagueContext(leagueId);
  return {
    league: leagueHeader(ctx),
    lineupEfficiency: season.lineupEfficiency(ctx),
    allPlay: season.allPlay(ctx),
    strengthOfSchedule: season.strengthOfSchedule(ctx),
    playoffOdds: season.playoffOdds(ctx),
  };
}

export async function teamReport(leagueId, rosterId, { week } = {}) {
  const ctx = await buildLeagueContext(leagueId);
  const team = ctx.imported.teams.find((t) => t.rosterId === Number(rosterId));
  if (!team) {
    const err = new Error(`Roster ${rosterId} not found in league ${leagueId}`);
    err.status = 404;
    throw err;
  }
  const targetWeek = Number(week) || ctx.imported.currentWeek;
  const roster = (team.players || []).map((id) => {
    const v = season.valuedPlayer(id, ctx);
    const proj = ctx.leaguePts.get(String(id));
    return {
      ...v,
      isStarter: team.starters.map(String).includes(String(id)),
      onIR: (team.reserve || []).map(String).includes(String(id)),
      nextWeek: proj?.byWeek?.[targetWeek] ?? 0,
      weeksLeft: proj ? Object.keys(proj.byWeek).length : 0,
      flags: playerFlags({ injuryStatus: v.injuryStatus, byeWeeks: v.byeWeeks, playoffWeeks: ctx.playoffWeeks, projected: v.projected }),
    };
  }).sort((a, b) => b.vorp - a.vorp);

  const trending = ctx.isCurrent ? await getTrending('add', { lookbackHours: 48, limit: 50 }).catch(() => []) : [];
  const strength = season.positionalStrength(ctx);

  return {
    league: leagueHeader(ctx),
    team: { rosterId: team.rosterId, teamName: team.teamName, ownerName: team.ownerName, avatar: team.avatar, record: team.record },
    roster,
    totalStarterValue: strength.teams.find((t) => t.rosterId === team.rosterId)?.totalStarterValue ?? 0,
    positionalStrength: strength.teams.find((t) => t.rosterId === team.rosterId)?.strength ?? null,
    leagueAverage: strength.leagueAverage,
    lineup: ctx.isCurrent ? season.lineupReport(team, targetWeek, ctx) : null,
    tradeTargets: ctx.isCurrent ? season.tradeTargets(ctx, team.rosterId) : [],
    waivers: ctx.isCurrent ? season.waiverTargets(ctx, team.rosterId, trending) : { targets: [], dropCandidates: [] },
    autoSet: {
      supported: false,
      reason: 'Sleeper has no official write API. Lineups here are suggestions; apply them in the Sleeper app. Yahoo auto-set is planned once API access is approved.',
    },
  };
}

export async function lineupForTeam(leagueId, rosterId, week) {
  const ctx = await buildLeagueContext(leagueId);
  const team = ctx.imported.teams.find((t) => t.rosterId === Number(rosterId));
  if (!team) {
    const err = new Error(`Roster ${rosterId} not found`);
    err.status = 404;
    throw err;
  }
  if (!ctx.isCurrent) return { week, unavailable: 'Projections are only available for the current season.' };
  return season.lineupReport(team, Number(week) || ctx.imported.currentWeek, ctx);
}
