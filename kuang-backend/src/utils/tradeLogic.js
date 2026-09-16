// Trade analysis: parse → resolve names on Sleeper → rest-of-season points →
// value over replacement → verdict. Works standalone (default 12-team league,
// PPR / half / standard) or against an imported Sleeper league, in which case
// the league's exact scoring rules and roster slots are used.

import { normalizeTradeRequest } from '../domain/tradeParser.js';
import { loadPlayers } from '../services/sleeper/players.js';
import { buildRosTable, getState, DEFAULT_LAST_WEEK, SCORING_FORMATS } from '../services/sleeper/projections.js';
import {
  computeReplacementLevels, playerValue, pickValue, classifyTrade, playerFlags, positionalRank,
  DEFAULT_ROSTER_POSITIONS, DEFAULT_NUM_TEAMS,
} from '../domain/valuation.js';
import { buildLeagueContext } from '../services/analysis.js';

const r1 = (x) => Number((x ?? 0).toFixed(1));

async function standaloneContext({ scoring, season, playoffWeeks }) {
  const state = await getState();
  const targetSeason = season || state.season;
  const inSeason = String(targetSeason) === String(state.season) && state.season_type === 'regular';
  const fromWeek = inSeason ? Math.max(1, state.week) : 1;
  if (fromWeek > DEFAULT_LAST_WEEK) {
    throw Object.assign(new Error('The fantasy regular season is over; rest-of-season projections are not available.'), { status: 409 });
  }
  const ros = await buildRosTable({ season: targetSeason, fromWeek });
  const format = SCORING_FORMATS.includes(scoring) ? scoring : 'ppr';
  const leaguePts = new Map();
  for (const e of ros.table.values()) {
    leaguePts.set(e.playerId, { total: e.pts[format], byWeek: Object.fromEntries(Object.entries(e.byWeek).map(([w, p]) => [w, p[format]])), position: e.position, team: e.team, byeWeeks: e.byeWeeks, injuryStatus: e.injuryStatus });
  }
  const levels = computeReplacementLevels({
    rosterPositions: DEFAULT_ROSTER_POSITIONS,
    numTeams: DEFAULT_NUM_TEAMS,
    players: [...leaguePts.values()].map((v) => ({ position: v.position, pts: v.total })),
  });
  return {
    leaguePts,
    levels,
    playoffWeeks: playoffWeeks || [15, 16, 17],
    season: targetSeason,
    fromWeek: ros.fromWeek,
    throughWeek: ros.throughWeek,
    scoringLabel: { ppr: 'PPR', half_ppr: 'Half PPR', std: 'Standard' }[format],
    leagueName: null,
  };
}

async function leagueContext(leagueId) {
  const ctx = await buildLeagueContext(leagueId);
  if (!ctx.isCurrent) {
    throw Object.assign(new Error(`League ${leagueId} is a past season; trade analysis needs the current season.`), { status: 409 });
  }
  return {
    leaguePts: ctx.leaguePts,
    levels: ctx.levels,
    playoffWeeks: ctx.playoffWeeks,
    season: ctx.imported.league.season,
    fromWeek: ctx.ros.fromWeek,
    throughWeek: ctx.ros.throughWeek,
    scoringLabel: ctx.scoringDescription,
    leagueName: ctx.imported.league.name,
  };
}

/**
 * @param body  string | { message } | { teamA: string[], teamB: string[] }
 * @param options { scoring?: 'ppr'|'half_ppr'|'std', leagueId?: string, season?: string }
 */
export async function analyzeTrade(body, options = {}) {
  const { teamA, teamB } = normalizeTradeRequest(body, { defaultPickYear: Number(options.season) + 1 || undefined });
  const [{ resolve, byId }, ctx] = await Promise.all([
    loadPlayers(),
    options.leagueId ? leagueContext(options.leagueId) : standaloneContext(options),
  ]);
  const allPlayers = [...ctx.leaguePts.values()].map((v) => ({ position: v.position, pts: v.total }));

  const unmatched = [];
  const valueSide = (items, label) => items.map((item) => {
    if (item.type === 'pick') {
      const v = pickValue(item);
      return { type: 'pick', name: item.name, position: 'PICK', team: null, points: 0, value: v, vorp: v, flags: [] };
    }
    const match = resolve(item.name);
    if (!match?.player) {
      unmatched.push({ side: label, name: item.name, suggestions: match?.suggestions || [] });
      return null;
    }
    const p = match.player;
    const proj = ctx.leaguePts.get(p.id);
    const total = proj?.total ?? 0;
    const v = playerValue(total, p.position, ctx.levels);
    const weeksLeft = proj ? Object.keys(proj.byWeek).length : 0;
    const byeWeeks = proj?.byeWeeks ?? [];
    const rank = proj ? positionalRank(total, p.position, allPlayers) : null;
    return {
      type: 'player',
      id: p.id,
      name: p.name,
      matchedFrom: item.name,
      confidence: match.confidence,
      team: p.team,
      position: p.position,
      points: v.ros,
      value: v.vorp,
      vorp: v.vorp,
      replacement: v.replacement,
      rank: rank ? `${p.position}${rank}` : null,
      byeWeek: byeWeeks[0] ?? null,
      byeWeeks,
      injuryStatus: p.injuryStatus,
      stats: { perGame: weeksLeft ? r1(total / weeksLeft) : 0, gamesLeft: weeksLeft },
      flags: playerFlags({ injuryStatus: p.injuryStatus, byeWeeks, playoffWeeks: ctx.playoffWeeks, confidence: match.confidence, alternatives: match.alternatives || [], projected: !!proj }),
    };
  }).filter(Boolean);

  const sideA = valueSide(teamA, 'A');
  const sideB = valueSide(teamB, 'B');

  const sum = (arr, k) => r1(arr.reduce((s, p) => s + (p[k] ?? 0), 0));
  const totalA = sum(sideA, 'points');
  const totalB = sum(sideB, 'points');
  const valueA = sum(sideA, 'value');
  const valueB = sum(sideB, 'value');

  // VORP floors at zero, so two sides of bench-level players both come out at
  // 0 and would read as "even" however far apart their projections are. When
  // neither side clears replacement, judge on raw projected points instead.
  const belowReplacement = valueA <= 0 && valueB <= 0;
  const { category, winner, marginPct } = classifyTrade(
    belowReplacement ? totalA : valueA,
    belowReplacement ? totalB : valueB,
  );

  const names = (arr) => arr.map((p) => p.name).join(' + ') || '—';
  const label = { A: 'Side A', B: 'Side B' };
  const incomplete = unmatched.length > 0;

  let verdict;
  let summary;
  let summaryZh;
  if (incomplete) {
    const missing = unmatched.map((u) => `"${u.name}"`).join(', ');
    const hints = unmatched
      .filter((u) => u.suggestions?.length)
      .map((u) => `"${u.name}" → ${u.suggestions.slice(0, 3).map((s) => `${s.name} (${s.position}${s.team ? `, ${s.team}` : ''})`).join(', ')}`);
    verdict = 'Incomplete — unknown player(s)';
    summary = hints.length
      ? `I could not find ${missing} on any NFL roster. Did you mean: ${hints.join('; ')}?`
      : `I could not find ${missing} on any NFL roster. Check the spelling (or use the player's full name) and summon again.`;
    summaryZh = hints.length
      ? `找不到球员 ${missing}。您是否想找：${unmatched.filter((u) => u.suggestions?.length).map((u) => u.suggestions.slice(0, 3).map((s) => s.name).join('、')).join('；')}？`
      : `找不到球员 ${missing}，请检查拼写后重试。`;
  } else {
    const winLabel = winner ? label[winner] : null;
    const verdictText = {
      even: 'Pretty even trade 🤝',
      slight: `${winLabel} edges it`,
      clear: `${winLabel} wins clearly 💪`,
      lopsided: `${winLabel} fleeces the other side 🏆`,
    }[category];
    verdict = verdictText;
    const detail = belowReplacement
      ? (winner
        ? ` Neither side clears replacement level, so this is judged on raw projected points: ${winLabel} has ${marginPct}% more.`
        : ' Neither side clears replacement level, and their projected points are near identical.')
      : winner
        ? ` ${winLabel} carries ${marginPct}% more value over replacement, so whoever receives ${winLabel} gets the better end.`
        : ' The value gap is inside the noise of the projections.';
    summary = `Side A (${names(sideA)}): ${valueA} value / ${totalA} ROS pts vs Side B (${names(sideB)}): ${valueB} value / ${totalB} ROS pts. Verdict: ${verdict}.${detail}`;
    const zhVerdict = { even: '势均力敌', slight: `${winner === 'A' ? 'A方' : 'B方'}略占上风`, clear: `${winner === 'A' ? 'A方' : 'B方'}明显获胜`, lopsided: `${winner === 'A' ? 'A方' : 'B方'}大获全胜` }[category];
    summaryZh = `A方（${names(sideA)}）价值 ${valueA}，剩余赛季预计 ${totalA} 分；B方（${names(sideB)}）价值 ${valueB}，剩余赛季预计 ${totalB} 分。判定：${zhVerdict}。`;
  }

  return {
    summary,
    summaryZh,
    verdict,
    category: incomplete ? 'general' : category,
    winner: incomplete ? null : winner,
    marginPct,
    incomplete,
    unmatched,
    teamAPoints: totalA.toFixed(1),
    teamBPoints: totalB.toFixed(1),
    teamAValue: valueA,
    teamBValue: valueB,
    players: { teamA: sideA, teamB: sideB },
    context: {
      season: ctx.season,
      fromWeek: ctx.fromWeek,
      throughWeek: ctx.throughWeek,
      scoring: ctx.scoringLabel,
      league: ctx.leagueName,
      replacementLevels: ctx.levels.replacementPoints,
      source: 'Sleeper projections (free public API)',
    },
  };
}
