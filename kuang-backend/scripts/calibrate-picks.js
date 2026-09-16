/**
 * What is a draft pick actually worth?
 *
 * PICK_VALUES in domain/valuation.js (1st = 45, 2nd = 18, …) were my estimate
 * of a pick's points above replacement. Nothing measured them. This measures
 * them from Sleeper's own history.
 *
 * These are season-redraft leagues, so a "2027 3rd" is a slot in next year's
 * draft, not a rookie pick. The value of holding that slot is the production
 * of the player you take with it, above what you could have had for free —
 * so the currency is points above replacement, floored at zero. A pick you
 * would not use is worth nothing, not minus a hundred: you can always decline
 * to roster the player and sign a free agent instead. Getting that floor
 * wrong is what made the first run of this script report a fourth-rounder at
 * -146 points.
 *
 * Method, per season:
 *   1. Rank every player by that season's preseason ADP — the draft board as
 *      it actually looked, before anyone knew anything.
 *   2. Cut the board into rounds of twelve.
 *   3. Measure what each pick actually returned that season, above the
 *      replacement level for his position, floored at zero.
 *
 * Both directions are reported: what a pick returned in its own season, and
 * what the same slot returned the following year, which is what a pick one
 * season out is really buying.
 *
 * Usage: node scripts/calibrate-picks.js [firstSeason] [lastSeason] [teams]
 */

import { writeFileSync } from 'node:fs';
import { fetchJson, TTL } from '../src/services/sleeper/client.js';
import { getSeasonProjections } from '../src/services/sleeper/projections.js';
import { computeReplacementLevels } from '../src/domain/valuation.js';

const API = 'https://api.sleeper.com';
const FIRST = Number(process.argv[2] || 2021);
const LAST = Number(process.argv[3] || 2025);
const TEAMS = Number(process.argv[4] || 12);
const ROUNDS = 16;
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

const seasonStats = (season) => fetchJson(`${API}/stats/nfl/${season}?season_type=regular`, { ttl: TTL.stats });
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (x) => Number(x.toFixed(1));

async function main() {
  const seasons = [];
  for (let s = FIRST; s <= LAST; s++) seasons.push(s);

  const statRows = await Promise.all(seasons.map(seasonStats));
  const points = new Map();
  const levels = new Map();
  seasons.forEach((season, i) => {
    const pts = new Map();
    const pool = [];
    for (const r of statRows[i] || []) {
      const pos = r.player?.position;
      if (!POSITIONS.includes(pos)) continue;
      const p = r.stats?.pts_ppr ?? 0;
      pts.set(String(r.player_id), { pts: p, position: pos });
      pool.push({ position: pos, pts: p });
    }
    points.set(season, pts);
    levels.set(season, computeReplacementLevels({ numTeams: TEAMS, players: pool }));
  });

  /** Points above replacement, floored: an unused pick is worth nothing. */
  const valueIn = (id, season) => {
    const rec = points.get(season)?.get(id);
    if (!rec) return 0;
    const repl = levels.get(season)?.replacementPoints?.[rec.position] ?? 0;
    return Math.max(0, rec.pts - repl);
  };

  const picks = [];
  for (const season of seasons) {
    const proj = await getSeasonProjections(String(season), POSITIONS);
    const board = proj
      .filter((p) => p.adp?.ppr != null)
      .sort((a, b) => a.adp.ppr - b.adp.ppr)
      .slice(0, TEAMS * ROUNDS);

    board.forEach((p, i) => {
      picks.push({
        season,
        slot: i + 1,
        round: Math.floor(i / TEAMS) + 1,
        thisYear: valueIn(p.playerId, season),
        nextYear: season + 1 <= LAST ? valueIn(p.playerId, season + 1) : null,
      });
    });
    process.stderr.write(`  ${season}: ${board.length} picks on the board\n`);
  }

  const out = { seasons: [FIRST, LAST], teams: TEAMS, rounds: {}, generatedAt: new Date().toISOString() };
  console.log(`\n${'='.repeat(80)}`);
  console.log(`DRAFT PICK VALUE — ${FIRST}-${LAST}, ${TEAMS}-team redraft, PPR points above replacement`);
  console.log('='.repeat(80));
  console.log('round    n     in its own season      same slot a year later     started >0');
  console.log('              mean    median          mean    median');

  for (let round = 1; round <= ROUNDS; round++) {
    const g = picks.filter((p) => p.round === round);
    if (!g.length) continue;
    const now = g.map((p) => p.thisYear);
    const next = g.filter((p) => p.nextYear !== null).map((p) => p.nextYear);
    const useful = now.filter((v) => v > 0).length / now.length;
    out.rounds[round] = {
      n: g.length,
      value: r1(mean(now)),
      median: r1(median(now)),
      nextYear: r1(mean(next)),
      usefulRate: Number(useful.toFixed(3)),
    };
    const o = out.rounds[round];
    console.log(
      `  ${String(round).padStart(2)}   ${String(g.length).padStart(3)}   ${String(o.value).padStart(6)}  ${String(o.median).padStart(6)}`
      + `          ${String(o.nextYear).padStart(6)}  ${String(r1(median(next))).padStart(6)}        ${(useful * 100).toFixed(0)}%`,
    );
  }

  const path = new URL('../src/data/pickCalibration.json', import.meta.url);
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\nWrote ${path.pathname}\n`);
}

await main();
