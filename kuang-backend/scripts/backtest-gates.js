/**
 * Do the challenger gates actually predict anything?
 *
 * The gate coefficients in src/domain/gates.js were chosen by judgement, not
 * measured. This replays them over completed seasons and asks, for each gate,
 * whether its factor moved in the same direction the projection error did.
 *
 * Method, per player-week:
 *   1. Take the projection Sleeper published for that week.
 *   2. Build the gate inputs from data available BEFORE that week only
 *      (trends through week-1), so there is no look-ahead.
 *   3. Run the gates, then compare projection × factor against what the
 *      player actually scored.
 *
 * The headline test is whether the gated projection beats the raw projection
 * on absolute error. The per-gate test fits an exponent α to each factor:
 *   α ≈ 0  the gate carries no signal
 *   α ≈ 1  the gate is scaled about right
 *   α > 1  the effect is real and we are under-applying it
 *   α < 0  the gate points the wrong way
 *
 * Usage: node scripts/backtest-gates.js [season] [fromWeek] [toWeek]
 */

import { getWeeklyProjections } from '../src/services/sleeper/projections.js';
import { getWeeklyStats, buildTrendTables, defenseVs } from '../src/services/nfl/usage.js';
import { gamesByTeam } from '../src/services/nfl/schedule.js';
import { archiveWeather } from '../src/services/weather/archive.js';
import { runGates } from '../src/domain/gates.js';

const SEASON = process.argv[2] || '2025';
const FROM_WEEK = Number(process.argv[3] || 4);   // needs prior weeks for trends
const TO_WEEK = Number(process.argv[4] || 17);
const LOOKBACK = Number(process.argv[5] || 5);
const MIN_PROJECTION = 5;                          // below this the ratio is noise
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];
const GATES = ['role', 'form', 'matchup', 'weather', 'gameScript'];

// PPR, taken straight off the row so the backtest is not entangled with any
// one league's scoring rules.
const ppr = (stats) => stats?.pts_ppr ?? 0;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r3 = (x) => Number(x.toFixed(3));

async function collect() {
  const rows = [];
  let skippedNoActual = 0;
  const benchWatch = { lowRole: [], normalRole: [] };

  for (let week = FROM_WEEK; week <= TO_WEEK; week++) {
    const [projections, actuals, trends, games] = await Promise.all([
      getWeeklyProjections(SEASON, week),
      getWeeklyStats(SEASON, week),
      buildTrendTables({ season: SEASON, throughWeek: week - 1, lookback: LOOKBACK, scorer: ppr }),
      gamesByTeam(SEASON, week),
    ]);

    // one archive request per distinct game date
    const venues = new Map();
    for (const g of games.values()) {
      if (!g.stadium || g.sheltered) continue;
      const key = `${g.venueTeam}:${g.date}`;
      if (!venues.has(key)) {
        venues.set(key, { key, lat: g.stadium.lat, lon: g.stadium.lon, tz: g.stadium.tz, date: g.date });
      }
    }
    const weatherByVenue = await archiveWeather([...venues.values()]);

    const actualById = new Map(actuals.map((a) => [a.playerId, a]));

    for (const p of projections) {
      if (!POSITIONS.includes(p.position)) continue;
      const projected = p.pts?.ppr ?? 0;
      if (projected < MIN_PROJECTION) continue;

      const game = games.get(p.team) || null;
      if (!game) continue; // bye week: nothing for the other gates to predict
      const weather = game.sheltered ? null : weatherByVenue.get(`${game.venueTeam}:${game.date}`) || null;
      const form = trends.form.get(p.playerId) || null;

      const result = runGates({
        position: p.position,
        projectedPoints: projected,
        injuryStatus: null,   // historical injury tags are not retrievable
        onBye: false,
        form,
        defense: defenseVs(trends, game.opponent, p.position),
        leagueAvg: trends.defenseLeagueAvg?.[p.position] ?? null,
        opponent: game.opponent,
        weather,
        sheltered: game.sheltered,
        teamOffense: trends.teamOffense.get(p.team) || null,
        teamOffenseAvg: trends.teamOffenseAvg ?? null,
        isHome: game.isHome,
      });

      const factors = Object.fromEntries(result.gates.map((g) => [g.name, g.factor]));
      const actualRow = actualById.get(p.playerId);

      if (!actualRow) {
        // projected to play, no stat line: inactive or a healthy scratch
        skippedNoActual++;
        (factors.role < 0.97 ? benchWatch.lowRole : benchWatch.normalRole).push(1);
        continue;
      }
      (factors.role < 0.97 ? benchWatch.lowRole : benchWatch.normalRole).push(0);

      const st = actualRow.stats || {};
      const played = (st.gp ?? 0) > 0 || (st.off_snp ?? 0) > 0;
      rows.push({
        week,
        position: p.position,
        projected,
        actual: ppr(st),
        played,
        factors,
        combined: result.factor,
      });
    }
    process.stderr.write(`  week ${week}: ${rows.length} rows so far\n`);
  }
  return { rows, skippedNoActual, benchWatch };
}

/* ------------------------------------------------------------- analysis */

function bestConstant(rows) {
  let best = { k: 1, sse: Infinity };
  for (let k = 0.6; k <= 1.4001; k += 0.005) {
    let sse = 0;
    for (const r of rows) sse += (r.actual - r.projected * k) ** 2;
    if (sse < best.sse) best = { k: Number(k.toFixed(3)), sse };
  }
  return best;
}

const errors = (rows, predict) => rows.map((r) => Math.abs(r.actual - predict(r)));
const mae = (rows, predict) => mean(errors(rows, predict));
const rmse = (rows, predict) => Math.sqrt(mean(rows.map((r) => (r.actual - predict(r)) ** 2)));

/** Best exponent for one gate, holding the others at the given exponents. */
function fitExponent(rows, gate, held = {}) {
  let best = { alpha: 0, sse: Infinity };
  for (let alpha = -1.5; alpha <= 2.5001; alpha += 0.05) {
    let sse = 0;
    for (const r of rows) {
      let pred = r.projected;
      for (const g of GATES) {
        const f = r.factors[g] ?? 1;
        if (f <= 0) continue;
        pred *= f ** (g === gate ? alpha : (held[g] ?? 0));
      }
      sse += (r.actual - pred) ** 2;
    }
    if (sse < best.sse) best = { alpha: Number(alpha.toFixed(2)), sse };
  }
  return best;
}

function jointFit(rows) {
  const alphas = Object.fromEntries(GATES.map((g) => [g, 1]));
  for (let pass = 0; pass < 6; pass++) {
    for (const g of GATES) {
      alphas[g] = fitExponent(rows, g, alphas).alpha;
    }
  }
  return alphas;
}

function buckets(rows, gate) {
  const band = (f) => (f < 0.97 ? 'gate says worse' : f > 1.03 ? 'gate says better' : 'gate neutral');
  const out = {};
  for (const r of rows) {
    const f = r.factors[gate] ?? 1;
    const b = band(f);
    (out[b] ||= []).push(r.actual / r.projected);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { n: v.length, meanRatio: r3(mean(v)) }]));
}

function pearsonLog(rows, gate) {
  const pairs = rows
    .filter((r) => (r.factors[gate] ?? 1) > 0 && r.actual > 0 && Math.abs((r.factors[gate] ?? 1) - 1) > 0.005)
    .map((r) => [Math.log(r.factors[gate]), Math.log(r.actual / r.projected)]);
  if (pairs.length < 30) return { n: pairs.length, r: null };
  const mx = mean(pairs.map((p) => p[0]));
  const my = mean(pairs.map((p) => p[1]));
  let num = 0; let dx = 0; let dy = 0;
  for (const [x, y] of pairs) { num += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2; }
  return { n: pairs.length, r: dx && dy ? r3(num / Math.sqrt(dx * dy)) : null };
}

/* ----------------------------------------------------------------- run */

const { rows, skippedNoActual, benchWatch } = await collect();

if (rows.length < 200) {
  console.error(`Only ${rows.length} rows — not enough to conclude anything.`);
  process.exit(1);
}

const raw = (r) => r.projected;
const gated = (r) => r.projected * r.combined;

console.log(`\n${'='.repeat(74)}`);
console.log(`GATE BACKTEST — ${SEASON}, weeks ${FROM_WEEK}–${TO_WEEK}`);
console.log('='.repeat(74));
console.log(`player-weeks analysed : ${rows.length}`);
console.log(`projected but no stat line (inactive): ${skippedNoActual}`);
console.log(`positions: ${POSITIONS.join(', ')}   ·   min projection: ${MIN_PROJECTION} PPR`);

const playedRows = rows.filter((r) => r.played);
console.log(`  of which actually took the field: ${playedRows.length} (${rows.length - playedRows.length} were projected but did not play)`);

for (const [label, set] of [['ALL ROWS', rows], ['PLAYED ONLY', playedRows]]) {
  const maeR = mae(set, raw);
  const maeG = mae(set, gated);
  const k = bestConstant(set);
  const maeK = mae(set, (r) => r.projected * k.k);
  const delta = (1 - maeG / maeR) * 100;
  console.log(`\n--- HEADLINE (${label}, n=${set.length}) ---`);
  console.log(`  MAE raw projection        : ${maeR.toFixed(3)}`);
  console.log(`  MAE gated (as shipped)    : ${maeG.toFixed(3)}   ${delta >= 0 ? `${delta.toFixed(2)}% BETTER` : `${(-delta).toFixed(2)}% WORSE`}`);
  console.log(`  MAE flat ×${k.k} baseline   : ${maeK.toFixed(3)}   ${((1 - maeK / maeR) * 100).toFixed(2)}% better than raw`);
  console.log(`  RMSE raw / gated          : ${rmse(set, raw).toFixed(3)} / ${rmse(set, gated).toFixed(3)}`);
  console.log(`  mean actual/projected     : ${r3(mean(set.map((r) => r.actual / r.projected)))}`);
}

const fitRows = rows.filter((r) => r.played);
console.log(`\n--- PER-GATE (played only, n=${fitRows.length}): fitted exponent (0 = no signal, 1 = correctly scaled, <0 = backwards) ---`);
const solo = {};
for (const g of GATES) {
  const active = fitRows.filter((r) => Math.abs((r.factors[g] ?? 1) - 1) > 0.005);
  const fit = fitExponent(fitRows, g, Object.fromEntries(GATES.map((x) => [x, 0])));
  solo[g] = fit.alpha;
  const corr = pearsonLog(fitRows, g);
  console.log(`  ${g.padEnd(11)} α=${String(fit.alpha).padStart(6)}   active on ${String(active.length).padStart(5)} rows   log-corr r=${corr.r ?? 'n/a'} (n=${corr.n})`);
}

console.log(`\n--- JOINT FIT (all gates together) ---`);
const joint = jointFit(fitRows);
for (const g of GATES) console.log(`  ${g.padEnd(11)} α=${String(joint[g]).padStart(6)}`);
const maeJoint = mae(fitRows, (r) => {
  let p = r.projected;
  for (const g of GATES) { const f = r.factors[g] ?? 1; if (f > 0) p *= f ** joint[g]; }
  return p;
});
const maeRawFit = mae(fitRows, raw);
console.log(`  MAE with fitted exponents: ${maeJoint.toFixed(3)}   (${((1 - maeJoint / maeRawFit) * 100).toFixed(2)}% better than raw on the same rows)`);

console.log(`\n--- DIRECTION CHECK: mean actual/projected by what the gate said ---`);
for (const g of GATES) {
  const b = buckets(fitRows, g);
  const parts = ['gate says worse', 'gate neutral', 'gate says better']
    .filter((k) => b[k])
    .map((k) => `${k}: ${b[k].meanRatio} (n=${b[k].n})`);
  console.log(`  ${g.padEnd(11)} ${parts.join('   ')}`);
}

const lowN = benchWatch.lowRole.length;
const normN = benchWatch.normalRole.length;
if (lowN > 30 && normN > 30) {
  console.log(`\n--- BONUS: does a failing role gate predict not playing at all? ---`);
  console.log(`  role gate failing : ${(mean(benchWatch.lowRole) * 100).toFixed(1)}% did not play (n=${lowN})`);
  console.log(`  role gate ok      : ${(mean(benchWatch.normalRole) * 100).toFixed(1)}% did not play (n=${normN})`);
}

console.log(`\nNote: the availability gate is not tested — Sleeper's player dump carries`);
console.log(`only current injury tags, so historical ones cannot be reconstructed.\n`);
