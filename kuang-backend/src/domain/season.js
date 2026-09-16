// Season-level analytics over an imported league + league context.
// ctx shape (see services/analysis.js):
//   { imported, playersById, leaguePts: Map<id, {total, byWeek, position, byeWeeks, injuryStatus, team}>,
//     levels, playoffWeeks, isCurrent }

import { optimizeLineup, diffLineups } from './lineup.js';
import { playerValue, CORE_POSITIONS, FLEX_ELIGIBILITY, starterSlots } from './valuation.js';

const r2 = (x) => Number((x ?? 0).toFixed(2));
const MIN_LINEUP_GAIN = 1; // ignore lineup swaps worth less than a point
const r1 = (x) => Number((x ?? 0).toFixed(1));

// ---------- building blocks ----------

export function describePlayer(id, ctx) {
  const p = ctx.playersById.get(String(id));
  const proj = ctx.leaguePts.get(String(id));
  return {
    id: String(id),
    name: p?.name || String(id),
    position: p?.position || proj?.position || 'UNK',
    fantasyPositions: p?.fantasyPositions || [p?.position || proj?.position || 'UNK'],
    team: p?.team || proj?.team || null,
    injuryStatus: p?.injuryStatus || proj?.injuryStatus || null,
    byeWeeks: proj?.byeWeeks || [],
  };
}

/** Player object for one projected week (0 pts + onBye when no game). */
export function weeklyLineupPlayer(id, week, ctx) {
  const base = describePlayer(id, ctx);
  const proj = ctx.leaguePts.get(String(id));
  const has = proj && week in proj.byWeek;
  return { ...base, points: has ? proj.byWeek[week] : 0, onBye: !!proj && !has && proj.total > 0 };
}

export function valuedPlayer(id, ctx) {
  const base = describePlayer(id, ctx);
  const proj = ctx.leaguePts.get(String(id));
  const v = playerValue(proj?.total ?? 0, base.position, ctx.levels);
  return { ...base, ros: v.ros, vorp: v.vorp, rawVorp: v.rawVorp, replacement: v.replacement, projected: !!proj };
}

export function pairOpponents(matchups) {
  const byMatch = new Map();
  for (const m of matchups || []) {
    if (m.matchup_id == null) continue;
    const arr = byMatch.get(m.matchup_id) || [];
    arr.push(m);
    byMatch.set(m.matchup_id, arr);
  }
  const opp = new Map();
  for (const arr of byMatch.values()) {
    if (arr.length === 2) {
      opp.set(arr[0].roster_id, arr[1]);
      opp.set(arr[1].roster_id, arr[0]);
    }
  }
  return opp;
}

function scoredWeeks(imported, { regularOnly = false } = {}) {
  const weeks = [];
  for (let w = 1; w <= imported.lastScoredWeek; w++) {
    if (regularOnly && w >= imported.league.playoffWeekStart) break;
    const ms = imported.matchupsByWeek[w] || [];
    if (ms.some((m) => (m.points ?? 0) > 0)) weeks.push(w);
  }
  return weeks;
}

// ---------- reports ----------

/** Actual vs optimal lineups for every scored week. */
export function lineupEfficiency(ctx) {
  const { imported, playersById } = ctx;
  const out = new Map();
  for (const t of imported.teams) out.set(t.rosterId, { rosterId: t.rosterId, teamName: t.teamName, actual: 0, optimal: 0, weeks: 0, worstWeek: null, weekly: [] });

  for (const w of scoredWeeks(imported)) {
    for (const m of imported.matchupsByWeek[w] || []) {
      if (!m.players_points || !m.players?.length) continue;
      const players = m.players.map((id) => {
        const p = playersById.get(String(id));
        return { id: String(id), name: p?.name || id, position: p?.position || 'UNK', fantasyPositions: p?.fantasyPositions || [p?.position || 'UNK'], points: m.players_points[id] ?? 0 };
      });
      const optimal = optimizeLineup({ rosterPositions: imported.league.rosterPositions, players, excludeStatuses: new Set(), excludeBye: false });
      const actual = m.points ?? (m.starters_points || []).reduce((s, x) => s + (x || 0), 0);
      const left = Math.max(0, optimal.total - actual);
      const rec = out.get(m.roster_id);
      if (!rec) continue;
      rec.actual += actual;
      rec.optimal += optimal.total;
      rec.weeks++;
      rec.weekly.push({ week: w, actual: r2(actual), optimal: r2(optimal.total), left: r2(left) });
      if (!rec.worstWeek || left > rec.worstWeek.left) rec.worstWeek = { week: w, left: r2(left) };
    }
  }
  return [...out.values()]
    .map((r) => ({ ...r, actual: r2(r.actual), optimal: r2(r.optimal), pointsLeftOnBench: r2(r.optimal - r.actual), efficiencyPct: r.optimal ? r1((r.actual / r.optimal) * 100) : 100 }))
    .sort((a, b) => b.efficiencyPct - a.efficiencyPct);
}

/** All-play record, expected wins and luck for regular-season scored weeks. */
export function allPlay(ctx) {
  const { imported } = ctx;
  const teams = new Map(imported.teams.map((t) => [t.rosterId, { rosterId: t.rosterId, teamName: t.teamName, allPlayWins: 0, allPlayLosses: 0, allPlayTies: 0, expectedWins: 0, actualWins: 0, actualLosses: 0, weeklyScores: [] }]));
  const weeks = scoredWeeks(imported, { regularOnly: true });
  for (const w of weeks) {
    const ms = (imported.matchupsByWeek[w] || []).filter((m) => teams.has(m.roster_id));
    const n = ms.length;
    const opp = pairOpponents(ms);
    for (const m of ms) {
      const rec = teams.get(m.roster_id);
      const pts = m.points ?? 0;
      rec.weeklyScores.push({ week: w, points: r2(pts) });
      let wins = 0; let ties = 0;
      for (const o of ms) {
        if (o.roster_id === m.roster_id) continue;
        if (pts > (o.points ?? 0)) wins++;
        else if (pts === (o.points ?? 0)) ties++;
      }
      rec.allPlayWins += wins;
      rec.allPlayTies += ties;
      rec.allPlayLosses += n - 1 - wins - ties;
      if (n > 1) rec.expectedWins += (wins + ties / 2) / (n - 1);
      const o = opp.get(m.roster_id);
      if (o) {
        if (pts > (o.points ?? 0)) rec.actualWins++;
        else if (pts < (o.points ?? 0)) rec.actualLosses++;
      }
    }
  }
  return [...teams.values()]
    .map((t) => {
      const scores = t.weeklyScores.map((s) => s.points);
      const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const sd = scores.length > 1 ? Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / (scores.length - 1)) : 0;
      return { ...t, expectedWins: r2(t.expectedWins), luck: r2(t.actualWins - t.expectedWins), avgPoints: r2(mean), sdPoints: r2(sd), weeksPlayed: weeks.length };
    })
    .sort((a, b) => b.allPlayWins - a.allPlayWins);
}

export function standings(ctx) {
  const ap = new Map(allPlay(ctx).map((t) => [t.rosterId, t]));
  return [...ctx.imported.teams]
    .sort((a, b) => b.record.wins - a.record.wins || a.record.losses - b.record.losses || b.record.pointsFor - a.record.pointsFor)
    .map((t, i) => ({
      rank: i + 1,
      rosterId: t.rosterId,
      teamName: t.teamName,
      ownerName: t.ownerName,
      avatar: t.avatar,
      ...t.record,
      allPlay: ap.get(t.rosterId) ? `${ap.get(t.rosterId).allPlayWins}-${ap.get(t.rosterId).allPlayLosses}` : null,
      expectedWins: ap.get(t.rosterId)?.expectedWins ?? null,
      luck: ap.get(t.rosterId)?.luck ?? null,
    }));
}

/** Optimal projected lineup for a team in a given week (current-season only). */
export function projectedTeamWeek(team, week, ctx) {
  const ids = [...new Set([...(team.players || [])])];
  const players = ids.map((id) => weeklyLineupPlayer(id, week, ctx));
  return optimizeLineup({ rosterPositions: ctx.imported.league.rosterPositions, players });
}

export function remainingSchedule(ctx) {
  const { imported } = ctx;
  const out = new Map(imported.teams.map((t) => [t.rosterId, []]));
  for (let w = imported.currentWeek; w < imported.league.playoffWeekStart; w++) {
    const opp = pairOpponents(imported.matchupsByWeek[w] || []);
    for (const t of imported.teams) {
      const o = opp.get(t.rosterId);
      if (o) out.get(t.rosterId).push({ week: w, opponentRosterId: o.roster_id });
    }
  }
  return out;
}

export function strengthOfSchedule(ctx) {
  const { imported } = ctx;
  if (!ctx.isCurrent) return [];
  const sched = remainingSchedule(ctx);
  const teamsById = new Map(imported.teams.map((t) => [t.rosterId, t]));
  const projCache = new Map();
  const proj = (rid, w) => {
    const k = `${rid}:${w}`;
    if (!projCache.has(k)) projCache.set(k, projectedTeamWeek(teamsById.get(rid), w, ctx).total);
    return projCache.get(k);
  };
  return imported.teams.map((t) => {
    const games = sched.get(t.rosterId) || [];
    const oppAvg = games.length ? games.reduce((s, g) => s + proj(g.opponentRosterId, g.week), 0) / games.length : 0;
    const ownAvg = games.length ? games.reduce((s, g) => s + proj(t.rosterId, g.week), 0) / games.length : 0;
    return { rosterId: t.rosterId, teamName: t.teamName, gamesLeft: games.length, avgOpponentProjection: r2(oppAvg), avgOwnProjection: r2(ownAvg), schedule: games.map((g) => ({ ...g, opponent: teamsById.get(g.opponentRosterId)?.teamName, opponentProjection: r2(proj(g.opponentRosterId, g.week)) })) };
  }).sort((a, b) => b.avgOpponentProjection - a.avgOpponentProjection);
}

// deterministic RNG so the same league state yields the same odds
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng) {
  let u = 0; let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Monte Carlo playoff odds over the remaining regular season. */
export function playoffOdds(ctx, { sims = 2000 } = {}) {
  const { imported } = ctx;
  const teams = imported.teams;
  const n = teams.length;
  const K = Math.min(imported.league.playoffTeams || 6, n);
  const ap = new Map(allPlay(ctx).map((t) => [t.rosterId, t]));
  const idx = new Map(teams.map((t, i) => [t.rosterId, i]));

  const remaining = [];
  if (ctx.isCurrent) {
    for (let w = imported.currentWeek; w < imported.league.playoffWeekStart; w++) {
      const seen = new Set();
      for (const m of imported.matchupsByWeek[w] || []) {
        if (m.matchup_id == null || seen.has(m.matchup_id)) continue;
        const pair = (imported.matchupsByWeek[w] || []).filter((x) => x.matchup_id === m.matchup_id);
        if (pair.length === 2 && idx.has(pair[0].roster_id) && idx.has(pair[1].roster_id)) {
          remaining.push({ week: w, a: idx.get(pair[0].roster_id), b: idx.get(pair[1].roster_id) });
          seen.add(m.matchup_id);
        }
      }
    }
  }

  const means = teams.map(() => ({}));
  const sds = teams.map((t) => {
    const s = ap.get(t.rosterId);
    return s && s.weeklyScores.length >= 3 ? Math.max(8, s.sdPoints) : null;
  });
  const weeksNeeded = [...new Set(remaining.map((g) => g.week))];
  for (const w of weeksNeeded) {
    teams.forEach((t, i) => { means[i][w] = projectedTeamWeek(t, w, ctx).total; });
  }
  teams.forEach((t, i) => {
    if (sds[i] == null) {
      const vals = Object.values(means[i]);
      const m = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 100;
      sds[i] = Math.max(12, m * 0.2);
    }
  });

  const baseWins = teams.map((t) => t.record.wins + t.record.ties * 0.5);
  const basePF = teams.map((t) => t.record.pointsFor);
  const madeIt = new Array(n).fill(0);
  const finalWins = new Array(n).fill(0);
  const rng = mulberry32(Number(String(imported.league.id).slice(-8)) + imported.currentWeek);

  const runs = remaining.length ? sims : 1;
  for (let s = 0; s < runs; s++) {
    const wins = baseWins.slice();
    const pf = basePF.slice();
    for (const g of remaining) {
      const sa = means[g.a][g.week] + gaussian(rng) * sds[g.a];
      const sb = means[g.b][g.week] + gaussian(rng) * sds[g.b];
      pf[g.a] += sa; pf[g.b] += sb;
      if (sa > sb) wins[g.a]++; else if (sb > sa) wins[g.b]++; else { wins[g.a] += 0.5; wins[g.b] += 0.5; }
    }
    const order = teams.map((_, i) => i).sort((x, y) => wins[y] - wins[x] || pf[y] - pf[x]);
    for (let k = 0; k < K; k++) madeIt[order[k]]++;
    for (let i = 0; i < n; i++) finalWins[i] += wins[i];
  }

  return teams.map((t, i) => ({
    rosterId: t.rosterId,
    teamName: t.teamName,
    playoffPct: r1((madeIt[i] / runs) * 100),
    projectedWins: r1(finalWins[i] / runs),
    currentWins: t.record.wins,
    gamesLeft: remaining.filter((g) => g.a === i || g.b === i).length,
    weeklySd: r1(sds[i]),
  })).sort((a, b) => b.playoffPct - a.playoffPct || b.projectedWins - a.projectedWins);
}

// ---------- roster construction & targets ----------

/** How many starters each position gets on one team (flex allotted greedily to the roster). */
function startersByPositionFor(team, ctx) {
  const slots = starterSlots(ctx.imported.league.rosterPositions);
  const counts = Object.fromEntries(CORE_POSITIONS.map((p) => [p, 0]));
  for (const s of slots) if (counts[s] !== undefined) counts[s]++;
  const flexSlots = slots.filter((s) => FLEX_ELIGIBILITY[s]);
  if (flexSlots.length) {
    const byPos = {};
    for (const id of team.players || []) {
      const v = valuedPlayer(id, ctx);
      (byPos[v.position] ||= []).push(v.vorp);
    }
    for (const arr of Object.values(byPos)) arr.sort((a, b) => b - a);
    for (const slot of flexSlots) {
      let best = null; let bestV = -Infinity;
      for (const pos of FLEX_ELIGIBILITY[slot]) {
        const v = byPos[pos]?.[counts[pos]] ?? -Infinity;
        if (v > bestV) { bestV = v; best = pos; }
      }
      if (best) counts[best]++;
    }
  }
  return counts;
}

export function positionalStrength(ctx) {
  const { imported } = ctx;
  const rows = imported.teams.map((t) => {
    const need = startersByPositionFor(t, ctx);
    const byPos = {};
    for (const id of t.players || []) {
      const v = valuedPlayer(id, ctx);
      (byPos[v.position] ||= []).push(v);
    }
    const strength = {};
    for (const pos of CORE_POSITIONS) {
      const list = (byPos[pos] || []).sort((a, b) => b.vorp - a.vorp);
      const starters = list.slice(0, need[pos]);
      const bench = list.slice(need[pos]);
      strength[pos] = {
        starters: r2(starters.reduce((s, p) => s + p.vorp, 0)),
        bench: r2(bench.reduce((s, p) => s + p.vorp, 0)),
        need: need[pos],
        count: list.length,
        weakestStarter: starters.length ? { id: starters[starters.length - 1].id, name: starters[starters.length - 1].name, vorp: starters[starters.length - 1].vorp, rawVorp: starters[starters.length - 1].rawVorp } : null,
      };
    }
    const total = r2(Object.values(strength).reduce((s, x) => s + x.starters, 0));
    return { rosterId: t.rosterId, teamName: t.teamName, strength, totalStarterValue: total };
  });
  const avg = {};
  for (const pos of CORE_POSITIONS) avg[pos] = r2(rows.reduce((s, r) => s + r.strength[pos].starters, 0) / (rows.length || 1));
  for (const r of rows) for (const pos of CORE_POSITIONS) r.strength[pos].vsAverage = r2(r.strength[pos].starters - avg[pos]);
  return { teams: rows.sort((a, b) => b.totalStarterValue - a.totalStarterValue), leagueAverage: avg };
}

export function tradeTargets(ctx, rosterId, limit = 6) {
  const { teams } = positionalStrength(ctx);
  const me = teams.find((t) => t.rosterId === Number(rosterId));
  if (!me) return [];
  const myTeam = ctx.imported.teams.find((t) => t.rosterId === Number(rosterId));
  const deficits = CORE_POSITIONS.filter((p) => !['K', 'DEF'].includes(p)).map((p) => ({ pos: p, delta: me.strength[p].vsAverage })).sort((a, b) => a.delta - b.delta).filter((d) => d.delta < 0).slice(0, 2);
  const surpluses = CORE_POSITIONS.filter((p) => !['K', 'DEF'].includes(p)).map((p) => ({ pos: p, delta: me.strength[p].vsAverage })).filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta);
  const myPlayers = (myTeam.players || []).map((id) => valuedPlayer(id, ctx));

  const targets = [];
  for (const d of deficits) {
    const weakest = me.strength[d.pos].weakestStarter?.rawVorp ?? 0;
    for (const other of teams) {
      if (other.rosterId === me.rosterId) continue;
      if (other.strength[d.pos].vsAverage <= 0 && other.strength[d.pos].bench <= 0) continue;
      const otherTeam = ctx.imported.teams.find((t) => t.rosterId === other.rosterId);
      const theirs = (otherTeam.players || []).map((id) => valuedPlayer(id, ctx)).filter((p) => p.position === d.pos).sort((a, b) => b.vorp - a.vorp);
      const need = other.strength[d.pos].need;
      // depth pieces first (they can spare them), then their weakest starter if they are deep
      const candidates = [...theirs.slice(need), ...(other.strength[d.pos].vsAverage > 0 ? theirs.slice(Math.max(0, need - 1), need) : [])];
      for (const c of candidates) {
        if (c.rawVorp <= weakest || c.vorp <= 0) continue;
        const offerIdeas = myPlayers
          .filter((p) => surpluses.some((s) => s.pos === p.position) && p.vorp > 0 && Math.abs(p.vorp - c.vorp) <= Math.max(15, c.vorp * 0.35))
          .sort((a, b) => Math.abs(a.vorp - c.vorp) - Math.abs(b.vorp - c.vorp))
          .slice(0, 3)
          .map((p) => ({ id: p.id, name: p.name, position: p.position, vorp: p.vorp }));
        targets.push({
          position: d.pos,
          partner: { rosterId: other.rosterId, teamName: other.teamName, surplusAtPosition: other.strength[d.pos].vsAverage },
          target: { id: c.id, name: c.name, team: c.team, ros: c.ros, vorp: c.vorp, injuryStatus: c.injuryStatus },
          upgradeOver: me.strength[d.pos].weakestStarter,
          gain: r2(c.rawVorp - weakest),
          offerIdeas,
        });
      }
    }
  }
  return targets.sort((a, b) => b.gain - a.gain).slice(0, limit);
}

export function waiverTargets(ctx, rosterId, trending = [], limit = 12) {
  const { imported, leaguePts, playersById } = ctx;
  const rostered = new Set();
  for (const t of imported.teams) for (const id of [...(t.players || []), ...(t.reserve || []), ...(t.taxi || [])]) rostered.add(String(id));
  const trendMap = new Map((trending || []).map((t) => [String(t.player_id), t.count]));
  const myTeam = imported.teams.find((t) => t.rosterId === Number(rosterId));
  const mine = (myTeam?.players || []).map((id) => valuedPlayer(id, ctx));
  const need = myTeam ? startersByPositionFor(myTeam, ctx) : {};
  const weakestStarterAt = {};
  const byPos = {};
  for (const p of mine) (byPos[p.position] ||= []).push(p);
  for (const pos of CORE_POSITIONS) {
    const list = (byPos[pos] || []).sort((a, b) => b.vorp - a.vorp);
    weakestStarterAt[pos] = list[Math.min(list.length, need[pos] || 0) - 1] || null;
  }
  const dropCandidates = mine.filter((p) => !['K', 'DEF'].includes(p.position) || mine.filter((x) => x.position === p.position).length > 1).sort((a, b) => a.vorp - b.vorp).slice(0, 3);

  const fa = [];
  for (const [id, proj] of leaguePts) {
    if (rostered.has(id)) continue;
    const p = playersById.get(id);
    if (!p || !p.active || !p.team || !CORE_POSITIONS.includes(p.position)) continue;
    const v = valuedPlayer(id, ctx);
    if (v.ros <= 0) continue;
    const weakest = weakestStarterAt[v.position];
    const trendingAdds = trendMap.get(id) || 0;
    const nextWeekPoints = proj.byWeek[imported.currentWeek] ?? 0;
    // Sleeper's trending counts are app-wide (millions), so they only nudge the order.
    const score = r2(v.rawVorp + 0.5 * nextWeekPoints + Math.min(8, 2 * Math.log10(1 + trendingAdds)));
    fa.push({
      ...v,
      score,
      trendingAdds,
      upgradeOver: weakest && v.rawVorp > weakest.rawVorp ? { id: weakest.id, name: weakest.name, vorp: weakest.vorp, gain: r2(v.rawVorp - weakest.rawVorp) } : null,
      nextWeekPoints,
    });
  }
  fa.sort((a, b) => b.score - a.score);
  return { targets: fa.slice(0, limit), dropCandidates: dropCandidates.map((p) => ({ id: p.id, name: p.name, position: p.position, vorp: p.vorp, ros: p.ros })) };
}

/** Current vs optimal lineup for a team and week. */
export function lineupReport(team, week, ctx) {
  const players = (team.players || []).map((id) => weeklyLineupPlayer(id, week, ctx));
  const optimal = optimizeLineup({ rosterPositions: ctx.imported.league.rosterPositions, players });
  const byId = new Map(players.map((p) => [p.id, p]));
  const diff = diffLineups(team.starters, optimal, byId);
  const significant = diff.gain >= MIN_LINEUP_GAIN;
  return {
    week,
    current: team.starters.map((id) => byId.get(String(id)) || { id, name: id, points: 0 }),
    optimal: optimal.starters,
    bench: optimal.bench,
    unfilled: optimal.unfilled,
    ...diff,
    moves: significant ? diff.moves : [],
    note: significant ? null : `Current starters are within ${MIN_LINEUP_GAIN} projected point${MIN_LINEUP_GAIN === 1 ? '' : 's'} of optimal.`,
  };
}
