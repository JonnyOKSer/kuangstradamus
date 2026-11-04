// Trade analysis: parse → resolve names on Sleeper → rest-of-season points →
// value over replacement → verdict. Works standalone (default 12-team league,
// PPR / half / standard) or against an imported Sleeper league, in which case
// the league's exact scoring rules and roster slots are used.

import PICK_CAL from '../data/pickCalibration.json' with { type: 'json' };
import { normalizeTradeRequest } from '../domain/tradeParser.js';
import { loadPlayers } from '../services/sleeper/players.js';
import { buildRosTable, getState, DEFAULT_LAST_WEEK, SCORING_FORMATS } from '../services/sleeper/projections.js';
import {
  computeReplacementLevels, playerValue, pickValue, classifyTrade, playerFlags, positionalRank,
  DEFAULT_ROSTER_POSITIONS, DEFAULT_NUM_TEAMS,
} from '../domain/valuation.js';
import { buildLeagueContext } from '../services/analysis.js';
import { nextSeasonGross, keepProbability, keepProbabilityOnTeam, combine, detectFormat } from '../domain/horizon.js';
import { ordinal } from '../domain/draftValue.js';

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
    leagueType: 'redraft',   // no league given: assume the common case
    scale: 1,
    curve: null,
    teams: 12,
    format: detectFormat({ declaredType: 0 }),
    nextSeason: null,
    seasonTable: null,
    rosters: null,
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
    leagueType: ctx.imported.league.leagueType || 'redraft',
    scale: ctx.scale ?? 1,
    curve: ctx.draft?.curve || null,
    teams: ctx.imported.league.totalRosters || 12,
    format: ctx.format,
    nextSeason: ctx.nextSeason,
    seasonTable: ctx.seasonTable,
    teams: ctx.imported.league.totalRosters || 12,
    rosters: ctx.imported.teams,
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
  // Keeper and dynasty leagues are judged on this season plus next; redraft on this season alone.
  const format = ctx.format || detectFormat({ declaredType: 0 });
  const lens = format.detected && format.detected !== 'redraft' ? 'combined' : 'thisSeason';
  const w1 = lens === 'combined' ? (format.nextSeasonWeight || 0) : 0;

  // The asker's roster, when known, decides whether an incoming player would
  // actually be one of its keepers. Outgoing players go to a roster we do not
  // know, so they are judged league-wide.
  const myRoster = options.rosterId && ctx.rosters ? ctx.rosters.find((t) => String(t.rosterId) === String(options.rosterId)) : null;
  const outgoingIds = new Set(teamA.filter((i) => i.type === 'player').map((i) => resolve(i.name)?.player?.id).filter(Boolean));
  const myKeepRank = (playerId, gross) => {
    if (!myRoster || !ctx.nextSeason) return null;
    const pool = (myRoster.players || []).map(String).filter((id) => !outgoingIds.has(id) && id !== String(playerId)).map((id) => ctx.nextSeason.gross.get(id) ?? 0);
    return 1 + pool.filter((g) => g > gross).length;
  };

  const unmatched = [];
  const valueSide = (items, label) => items.map((item) => {
    if (item.type === 'pick') {
      const pv = pickValue(item, {
        calibration: PICK_CAL,
        currentSeason: Number(ctx.season) || undefined,
        leagueType: ctx.leagueType || 'redraft',
        scale: ctx.scale ?? 1,
        curve: ctx.curve,
        teams: ctx.teams,
        nextSeasonWeight: w1,
      });
      const flags = [];
      if (pv.league?.note) flags.push({ type: 'pick', level: 'info', text: pv.league.note });
      if (pv.seasonsAway > 0 && (ctx.leagueType || 'redraft') === 'redraft') {
        flags.push({
          type: 'pick',
          level: 'medium',
          text: `A ${item.year} pick scores nothing for this season in a redraft league. Worth ${pv.whenUsed} above replacement once used, useful ${Math.round((pv.usefulRate ?? 0) * 100)}% of the time.`,
        });
      } else if (pv.seasonsAway > 0) {
        flags.push({
          type: 'pick',
          level: 'low',
          text: `Counted at ${r1(pv.value)} of its ${pv.whenUsed} value, ${pv.seasonsAway} season${pv.seasonsAway === 1 ? '' : 's'} out in a ${pv.leagueType} league.`,
        });
      }
      const picked = lens === 'combined' ? pv.value : pv.h0;
      return {
        type: 'pick',
        name: item.name,
        round: item.round ?? null,
        year: item.year ?? null,
        position: 'PICK',
        team: null,
        points: 0,
        value: picked,
        vorp: picked,
        rawValue: pv.whenUsed,
        horizons: { thisSeason: pv.h0, nextSeason: pv.h1, combined: pv.value },
        pick: pv,
        flags,
      };
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

    // next season: this season's full value (to date + ROS) regressed and
    // aged, times the chance he is kept, net of what keeping him costs
    const full = ctx.seasonTable?.pts.get(p.id);
    const fullVorp = full ? playerValue(full.pts, full.position || p.position, ctx.seasonTable.levels).rawVorp : null;
    const gross = ctx.nextSeason?.gross.get(p.id) ?? nextSeasonGross({ fullSeasonVorp: fullVorp, position: p.position, age: p.age, yearsExp: p.yearsExp });
    const keepRank = ctx.nextSeason?.rank.get(p.id) ?? null;
    const teamRank = label === 'B' && gross != null ? myKeepRank(p.id, gross) : null;
    const kept = teamRank != null
      ? keepProbabilityOnTeam({ teamRank, keepers: format.keepersPerTeam, format: format.detected })
      : keepProbability({ rank: keepRank, slots: ctx.nextSeason?.slots, format: format.detected });
    const cost = format.detected === 'keeper' ? (format.keeperCostValue ?? 0) : 0;
    const h1 = gross == null ? 0 : Number((kept * Math.max(0, gross - cost)).toFixed(2));
    const h0 = v.vorp;
    const combined = combine(h0, h1, w1);
    const primary = lens === 'combined' ? combined : h0;
    return {
      type: 'player',
      id: p.id,
      name: p.name,
      matchedFrom: item.name,
      confidence: match.confidence,
      team: p.team,
      position: p.position,
      points: v.ros,
      value: primary,
      vorp: v.vorp,
      replacement: v.replacement,
      horizons: { thisSeason: h0, nextSeason: h1, combined },
      nextSeason: gross == null ? null : { gross, kept, cost, rank: keepRank, teamRank, onMyRoster: teamRank != null, fullSeasonValue: fullVorp == null ? null : r1(fullVorp), age: p.age ?? null },
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
  const hsum = (arr, k) => r1(arr.reduce((s, p) => s + (p.horizons?.[k] ?? 0), 0));
  const totalA = sum(sideA, 'points');
  const totalB = sum(sideB, 'points');
  const valueA = sum(sideA, 'value');
  const valueB = sum(sideB, 'value');
  const horizons = {
    thisSeason: { A: hsum(sideA, 'thisSeason'), B: hsum(sideB, 'thisSeason') },
    nextSeason: { A: hsum(sideA, 'nextSeason'), B: hsum(sideB, 'nextSeason') },
    combined: { A: hsum(sideA, 'combined'), B: hsum(sideB, 'combined') },
  };

  // VORP floors at zero, so two sides of bench-level players both come out at
  // 0 and would read as "even" however far apart their projections are. When
  // neither side clears replacement, judge on raw projected points instead.
  const belowReplacement = valueA <= 0 && valueB <= 0;
  // A gap only counts once it is worth something on this league's own scale:
  // 5% of the bigger side's rest-of-season points. Without it the verdict is a
  // bare ratio, and two near-worthless players read as a fleecing.
  const noiseFloor = 0.05 * Math.max(totalA, totalB);
  const { category, winner, marginPct } = classifyTrade(
    belowReplacement ? totalA : valueA,
    belowReplacement ? totalB : valueB,
    { noiseFloor },
  );

  // the same trade judged on this season alone, for the record
  const thisSeasonVerdict = classifyTrade(horizons.thisSeason.A, horizons.thisSeason.B, { noiseFloor });
  const names = (arr) => arr.map((p) => p.name).join(' + ') || '—';
  // Side A is what the asker gives, side B what they get.
  const label = { A: 'What you give', B: 'What you get' };
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
    const youGet = winner === 'B';
    verdict = verdictWords(category, winner);
    const detail = belowReplacement
      ? (winner
        ? ` Neither side clears replacement level, so this is judged on raw projected points: ${winLabel.toLowerCase()} has ${marginPct}% more.`
        : ' Neither side clears replacement level, and their projected points are near identical.')
      : winner
        ? ` ${winLabel} carries ${marginPct}% more value over replacement.`
        : ' The value gap is inside the noise of the projections.';
    const rosLabel = (arr) => (arr.some((p) => p.type === 'pick') ? 'ROS pts from the players (a pick scores nothing this season)' : 'ROS pts');
    // A side with several pieces is spelled out piece by piece, so a pick's
    // share of the total is never hidden inside the sum.
    const itemized = (arr) => (arr.length > 1 && !belowReplacement ? arr.map((p) => `${p.name} (${r1(p.value)})`).join(' + ') : names(arr));
    const horizonNote = lens === 'combined'
      ? ` Judged on this season plus next (${format.detected} league, next season counted at ${Math.round(w1 * 100)}%). This season alone: ${horizons.thisSeason.A} vs ${horizons.thisSeason.B}, ${verdictWords(thisSeasonVerdict.category, thisSeasonVerdict.winner).toLowerCase()}. Next season: ${horizons.nextSeason.A} vs ${horizons.nextSeason.B}.`
      : '';
    const picks = [...sideA, ...sideB].filter((p) => p.type === 'pick');
    const pickNotes = picks.map((p) => pickSentence(p, { lens, weight: w1, format: format.detected })).join(' ');
    summary = `You give ${itemized(sideA)}: ${valueA} value / ${totalA} ${rosLabel(sideA)}. You get ${itemized(sideB)}: ${valueB} value / ${totalB} ${rosLabel(sideB)}. Verdict: ${verdict}.${detail}${pickNotes ? ` ${pickNotes}` : ''}${horizonNote}`;
    const zhVerdict = { even: '势均力敌', slight: youGet ? '你得到的略多' : '你给出的略多', clear: youGet ? '你明显占优' : '你明显吃亏', lopsided: youGet ? '你大赚一笔' : '你被狠狠宰了' }[category];
    const zhRos = (arr) => (arr.some((p) => p.type === 'pick') ? '球员剩余赛季预计' : '剩余赛季预计');
    const zhPickNotes = picks.map((p) => pickSentenceZh(p, { lens, weight: w1 })).join('');
    summaryZh = `你给出 ${itemized(sideA)}：价值 ${valueA}，${zhRos(sideA)} ${totalA} 分；你得到 ${itemized(sideB)}：价值 ${valueB}，${zhRos(sideB)} ${totalB} 分。判定：${zhVerdict}。${zhPickNotes}`;
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
    lens,
    format: { ...format, nextSeasonWeight: w1 },
    horizons,
    verdicts: {
      thisSeason: { ...thisSeasonVerdict, verdict: verdictWords(thisSeasonVerdict.category, thisSeasonVerdict.winner) },
      combined: lens === 'combined' ? { category, winner, marginPct, verdict } : null,
    },
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

/**
 * One plain sentence on what a pick is worth and why: the when-used figure
 * and where it came from, then how much of it counts given when the pick is
 * usable. "The 2027 5th round pick is valued at 32.5: 5th-round picks in this
 * league have returned 54.1 above replacement when used (26 picks, 2025–2026
 * drafts, 62% hit); one season out in a keeper league, it counts at 60%."
 */
function pickSentence(p, { lens, weight }) {
  const pv = p.pick || {};
  const round = p.round ? `${ordinal(p.round)}-round pick` : 'pick';
  const rounds = p.round ? `${ordinal(p.round)}-round picks` : 'picks';
  const L = pv.league;
  const span = L?.seasons?.length ? (L.seasons.length === 1 ? `the ${L.seasons[0]} draft` : `the ${L.seasons[0]}–${L.seasons[L.seasons.length - 1]} drafts`) : null;
  const hit = pv.usefulRate != null ? `, ${Math.round(pv.usefulRate * 100)}% hit` : '';
  const basis = L
    ? `${rounds} in this league have returned ${pv.whenUsed} above replacement when used (${L.n} picks${span ? ` from ${span}` : ''}${hit})`
    : `a ${round} is worth ${pv.whenUsed} above replacement when used (standard-league calibration${hit})`;
  const away = pv.seasonsAway ?? 0;
  const share = pv.whenUsed > 0 ? Math.round((pv.value / pv.whenUsed) * 100) : 0;
  const timing = away === 0
    ? 'it is usable this season, so it counts in full'
    : lens === 'combined'
      ? `${away} season${away === 1 ? '' : 's'} out in a ${pv.leagueType} league, it counts at ${share}%`
      : 'it cannot score this season, so it counts for nothing in a redraft league';
  return `The ${p.name} is valued at ${r1(p.value)}: ${basis}; ${timing}.`;
}

function pickSentenceZh(p, { lens }) {
  const pv = p.pick || {};
  const L = pv.league;
  const hit = pv.usefulRate != null ? `，命中率 ${Math.round(pv.usefulRate * 100)}%` : '';
  const basis = L
    ? `本联盟第 ${p.round ?? '?'} 轮签使用时平均高于替补 ${pv.whenUsed}（${L.n} 个样本${hit}）`
    : `第 ${p.round ?? '?'} 轮签使用时约高于替补 ${pv.whenUsed}（标准联盟校准${hit}）`;
  const away = pv.seasonsAway ?? 0;
  const share = pv.whenUsed > 0 ? Math.round((pv.value / pv.whenUsed) * 100) : 0;
  const timing = away === 0 ? '本季可用，全额计入' : lens === 'combined' ? `距今 ${away} 季，按 ${share}% 计入` : '本季无法得分，重选联盟中不计价值';
  return `${p.name} 估值 ${r1(p.value)}：${basis}；${timing}。`;
}

function verdictWords(category, winner) {
  const youGet = winner === 'B';
  return {
    even: 'Pretty even trade 🤝',
    slight: youGet ? 'You get slightly more than you give' : 'You give slightly more than you get',
    clear: youGet ? 'You get the better end 💪' : 'You give more than you get',
    lopsided: youGet ? 'You fleece the other side 🏆' : 'You get fleeced',
  }[category] || 'Pretty even trade 🤝';
}
