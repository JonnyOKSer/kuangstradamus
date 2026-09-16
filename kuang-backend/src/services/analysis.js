// Glue between Sleeper data and the domain analytics. Builds a per-league
// context (import + projections scored with that league's rules + replacement
// levels) and exposes the report shapes the routes return.

import { importLeague, getTransactions } from './sleeper/league.js';
import { loadPlayers, getTrending } from './sleeper/players.js';
import { buildRosTable, DEFAULT_LAST_WEEK } from './sleeper/projections.js';
import { computeReplacementLevels, playerFlags, activePositions } from '../domain/valuation.js';
import { rosLeaguePoints, describeScoring } from '../domain/scoring.js';
import { auditScoring, calibrationInfo } from '../domain/statDerivation.js';
import { collectBidHistory, isFaabLeague, estimateFaab } from '../domain/faab.js';
import { playerValue } from '../domain/valuation.js';
import { buildTrendTables } from './nfl/usage.js';
import { byeWeeksByTeam } from './nfl/schedule.js';
import { weekContext } from './nfl/context.js';
import { findHandcuffSleepers } from '../domain/sleepers.js';
import { keyDates } from '../domain/calendar.js';
import * as season from '../domain/season.js';

const CTX_TTL = 10 * 60 * 1000;
const ctxCache = new Map(); // leagueId -> { expires, promise }

/** Drop every cached league context (used by the scheduled refresh). */
export function clearLeagueContexts() {
  const n = ctxCache.size;
  ctxCache.clear();
  return n;
}

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

  // Byes come from the schedule, not from gaps in the projection feed: Sleeper
  // projects every player in every week, bye weeks included.
  const byeByTeam = await byeWeeksByTeam(imported.league.season).catch(() => new Map());

  // Which stat keys the projections actually carry, so we can tell the user
  // which of their scoring rules we still cannot forecast.
  const projectedKeys = new Set();
  for (const e of ros.table.values()) {
    for (const line of Object.values(e.byWeekStats || {})) {
      for (const k of Object.keys(line || {})) projectedKeys.add(k);
    }
  }

  const leaguePts = new Map();
  for (const e of ros.table.values()) {
    const { total, byWeek } = rosLeaguePoints(e, scoring);
    const byeWeeks = byeByTeam.get(e.team) ?? e.byeWeeks ?? [];
    leaguePts.set(e.playerId, { total, byWeek, position: e.position, team: e.team, byeWeeks, injuryStatus: e.injuryStatus, opponents: e.opponents });
  }
  const levels = computeReplacementLevels({
    rosterPositions: imported.league.rosterPositions,
    numTeams: imported.league.totalRosters,
    players: [...leaguePts.values()].map((v) => ({ position: v.position, pts: v.total })),
  });
  const rounds = Math.max(1, Math.ceil(Math.log2(imported.league.playoffTeams || 6)));
  const playoffWeeks = Array.from({ length: rounds }, (_, i) => imported.league.playoffWeekStart + i);

  // Recent form, usage and defence-vs-position, scored in this league's rules.
  // Absent before any week has been played, in which case the gates that need
  // it report themselves as unknown rather than guessing.
  const trends = isCurrent && imported.lastScoredWeek >= 1
    ? await buildTrendTables({
      season: imported.league.season,
      throughWeek: imported.lastScoredWeek,
      scoringSettings: scoring,
    }).catch(() => null)
    : null;

  // What this league has actually paid on waivers this season. Only worth
  // fetching where bids exist — a rolling-priority league has none.
  const faab = isFaabLeague(imported.league) ? await loadBidHistory(imported, leaguePts, levels) : null;

  return {
    imported,
    faab,
    playersById: byId,
    ros,
    leaguePts,
    levels,
    scoring,
    playoffWeeks,
    isCurrent,
    trends,
    activePositions: activePositions(imported.league.rosterPositions),
    byeByTeam,
    scoringAudit: auditScoring(scoring, projectedKeys),
    scoringDescription: describeScoring(scoring),
    builtAt: Date.now(),
  };
}

async function loadBidHistory(imported, leaguePts, levels) {
  const weeks = [];
  for (let w = 1; w <= Math.max(1, imported.currentWeek); w++) weeks.push(w);
  const lists = await Promise.all(weeks.map((w) => getTransactions(imported.league.id, w).catch(() => [])));
  const byWeek = {};
  weeks.forEach((w, i) => { byWeek[w] = lists[i] || []; });

  // A claim's "value" is the player's worth today, which is the best proxy
  // available for what he looked like when the bid was placed.
  const valueOf = (id) => {
    const proj = leaguePts.get(String(id));
    if (!proj) return null;
    return playerValue(proj.total, proj.position, levels).rawVorp;
  };
  const bids = collectBidHistory(byWeek, valueOf);
  return {
    bids,
    budget: imported.league.waiverBudget,
    claimsSeen: bids.length,
    wonSeen: bids.filter((b) => b.won).length,
  };
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

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
    replacementLevels: pick(ctx.levels.replacementPoints, ctx.activePositions),
    startersByPosition: pick(ctx.levels.startersByPosition, ctx.activePositions),
    playoffWeeks: ctx.playoffWeeks,
    activePositions: ctx.activePositions,
    usesKicker: ctx.activePositions.includes('K'),
    usesDefense: ctx.activePositions.includes('DEF'),
    scoringAudit: ctx.scoringAudit,
    faab: ctx.faab
      ? { budget: ctx.faab.budget, claimsSeen: ctx.faab.claimsSeen, wonSeen: ctx.faab.wonSeen, enabled: true }
      : { enabled: false },
    bonusCalibration: calibrationInfo(),
    dataFreshness: {
      leagueBuiltAt: new Date(ctx.builtAt).toISOString(),
      trendWeeks: ctx.trends?.weeks ?? [],
    },
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
  const weekCtx = ctx.isCurrent ? await weekContext(ctx.imported.league.season, targetWeek).catch(() => null) : null;
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
  })
    // A league with no K or DEF slot has no kickers or defences to report on.
    .filter((p) => ctx.activePositions.includes(p.position))
    .sort((a, b) => b.vorp - a.vorp);

  const trending = ctx.isCurrent ? await getTrending('add', { lookbackHours: 48, limit: 50 }).catch(() => []) : [];
  const strength = season.positionalStrength(ctx);

  // Deep waiver: workhorse starters league-wide, then the free agents directly
  // behind them on their NFL depth chart.
  const rostered = new Set();
  for (const t of ctx.imported.teams) {
    for (const id of [...(t.players || []), ...(t.reserve || []), ...(t.taxi || [])]) rostered.add(String(id));
  }
  const myStrength = strength.teams.find((t) => t.rosterId === team.rosterId)?.strength ?? {};
  const sleepers = ctx.isCurrent && ctx.trends
    ? findHandcuffSleepers({
      players: ctx.playersById,
      form: ctx.trends.form,
      leaguePts: ctx.leaguePts,
      rostered,
      activePositions: ctx.activePositions,
      needByPosition: myStrength,
      currentWeek: targetWeek,
    })
    : [];

  // A wide pool so the calendar can answer "who can cover that bye?" at any
  // position, even though only the top of it is shown as waiver targets.
  const waiverPool = ctx.isCurrent
    ? season.waiverTargets(ctx, team.rosterId, trending, 80, { needByPosition: myStrength })
    : { targets: [], dropCandidates: [] };
  // The percentile map covers the whole free-agent pool; sleepers are drawn
  // from the same pool, so they can be priced on the same scale.
  const { valuePctById, ...waiverRest } = waiverPool;
  const waivers = { ...waiverRest, targets: waiverPool.targets.slice(0, 12) };

  if (ctx.faab && valuePctById) {
    const remaining = ctx.imported.league.waiverBudget - (team.record?.waiverBudgetUsed ?? 0);
    for (const s of sleepers) {
      s.faab = estimateFaab({
        valuePct: valuePctById.get(s.id) ?? 0.5,
        history: ctx.faab.bids,
        budget: ctx.faab.budget,
        remaining,
      });
    }
  }

  const dates = ctx.isCurrent ? keyDates(team, ctx, { freeAgents: waiverPool.targets }) : null;
  const deadlinePassed = !!dates?.tradeDeadline?.passed;

  return {
    league: leagueHeader(ctx),
    team: { rosterId: team.rosterId, teamName: team.teamName, ownerName: team.ownerName, avatar: team.avatar, record: team.record },
    roster,
    totalStarterValue: strength.teams.find((t) => t.rosterId === team.rosterId)?.totalStarterValue ?? 0,
    positionalStrength: strength.teams.find((t) => t.rosterId === team.rosterId)?.strength ?? null,
    leagueAverage: strength.leagueAverage,
    lineup: ctx.isCurrent ? season.gatedLineupReport(team, targetWeek, ctx, weekCtx) : null,
    tradeTargets: ctx.isCurrent && !deadlinePassed ? season.tradeTargets(ctx, team.rosterId) : [],
    tradeWindow: dates
      ? {
        deadlineWeek: dates.tradeDeadline.week,
        weeksAway: dates.tradeDeadline.weeksAway,
        passed: deadlinePassed,
        note: deadlinePassed
          ? `The trade deadline passed in week ${dates.tradeDeadline.week}. Waivers and free agency only from here.`
          : dates.tradeDeadline.week
            ? `Trades close after week ${dates.tradeDeadline.week}${dates.tradeDeadline.weeksAway <= 2 ? ' — act now' : ''}.`
            : 'This league has no trade deadline set.',
      }
      : null,
    keyDates: dates,
    waivers: ctx.isCurrent ? { ...waivers, sleepers } : { targets: [], dropCandidates: [], sleepers: [] },
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
  const targetWeek = Number(week) || ctx.imported.currentWeek;
  const weekCtx = await weekContext(ctx.imported.league.season, targetWeek).catch(() => null);
  return season.gatedLineupReport(team, targetWeek, ctx, weekCtx);
}
