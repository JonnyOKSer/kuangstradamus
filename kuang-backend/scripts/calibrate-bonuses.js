/**
 * Measure the scoring bonuses Sleeper does not project.
 *
 * Sleeper's weekly projections carry mean stat lines (rush_yd 64.0, pass_yd
 * 249.3) but not the milestone fields a lot of leagues actually score:
 * bonus_rush_yd_100, pts_allow_1_6, fgm_50_59 and friends. Because
 * scoreStats() multiplies stat by weight, a rule with no matching stat is
 * silently worth zero — so a league paying +3 for a 100-yard game has been
 * getting none of it in any projection, valuation, waiver or trade number.
 *
 * Rather than assume a distribution, this measures the real ones from
 * completed seasons and writes src/data/bonusCalibration.json:
 *
 *   thresholds  P(stat >= t) binned by the projected mean
 *   defTiers    P(points/yards allowed lands in each tier) by projected mean
 *   ratios      fixed splits we cannot see directly (long TDs, 60+ FGs)
 *
 * Usage: node scripts/calibrate-bonuses.js [seasons...]   (default 2023 2024 2025)
 */

import { writeFileSync } from 'node:fs';
import { getWeeklyProjections } from '../src/services/sleeper/projections.js';
import { getWeeklyStats } from '../src/services/nfl/usage.js';

const SEASONS = process.argv.slice(2).length ? process.argv.slice(2) : ['2023', '2024', '2025'];
const WEEKS = Array.from({ length: 17 }, (_, i) => i + 1);

// Milestone bonuses, expressed as "how often does this stat clear a threshold".
export const THRESHOLDS = {
  bonus_rush_yd_100: { stats: ['rush_yd'], t: 100 },
  bonus_rush_yd_200: { stats: ['rush_yd'], t: 200 },
  bonus_rec_yd_100: { stats: ['rec_yd'], t: 100 },
  bonus_rec_yd_200: { stats: ['rec_yd'], t: 200 },
  bonus_pass_yd_300: { stats: ['pass_yd'], t: 300 },
  bonus_pass_yd_400: { stats: ['pass_yd'], t: 400 },
  bonus_rush_rec_yd_100: { stats: ['rush_yd', 'rec_yd'], t: 100 },
  bonus_rush_rec_yd_200: { stats: ['rush_yd', 'rec_yd'], t: 200 },
  bonus_rush_att_20: { stats: ['rush_att'], t: 20 },
  bonus_pass_cmp_25: { stats: ['pass_cmp'], t: 25 },
};

// Ratios we cannot observe directly in a projection: what share of long plays
// are touchdowns, and what share of 50+ field goals are 60+.
const RATIOS = {
  rush_td_40p: { of: 'rush_40p' },
  rush_td_50p: { of: 'rush_40p' },
  rec_td_40p: { of: 'rec_40p' },
  rec_td_50p: { of: 'rec_40p' },
  pass_td_40p: { of: 'pass_cmp_40p' },
  pass_td_50p: { of: 'pass_cmp_40p' },
  fgm_50_59: { of: 'fgm_50p' },
};

export const PTS_ALLOW_TIERS = [
  ['pts_allow_0', 0, 0], ['pts_allow_1_6', 1, 6], ['pts_allow_7_13', 7, 13],
  ['pts_allow_14_20', 14, 20], ['pts_allow_21_27', 21, 27],
  ['pts_allow_28_34', 28, 34], ['pts_allow_35p', 35, Infinity],
];
export const YDS_ALLOW_TIERS = [
  ['yds_allow_0_100', 0, 99], ['yds_allow_100_199', 100, 199], ['yds_allow_200_299', 200, 299],
  ['yds_allow_300_349', 300, 349], ['yds_allow_350_399', 350, 399],
  ['yds_allow_400_449', 400, 449], ['yds_allow_450_499', 450, 499],
  ['yds_allow_500_549', 500, 549], ['yds_allow_550p', 550, Infinity],
];

const sum = (stats, keys) => keys.reduce((s, k) => s + (stats?.[k] ?? 0), 0);
const bucketOf = (mu, width) => Math.max(0, Math.floor(mu / width));

async function main() {
  // playerId|season|week -> { proj, act }
  const pairs = [];
  for (const season of SEASONS) {
    for (const week of WEEKS) {
      const [proj, acts] = await Promise.all([
        getWeeklyProjections(season, week),
        getWeeklyStats(season, week),
      ]);
      const byId = new Map(acts.map((a) => [a.playerId, a.stats || {}]));
      for (const p of proj) {
        const a = byId.get(p.playerId);
        if (!a) continue;
        if ((a.gp ?? 0) <= 0 && (a.off_snp ?? 0) <= 0 && p.position !== 'DEF') continue;
        pairs.push({ season, position: p.position, proj: p.stats || {}, act: a });
      }
      process.stderr.write(`  ${season} wk ${week}: ${pairs.length} pairs\r`);
    }
  }
  process.stderr.write('\n');

  const out = { seasons: SEASONS, pairs: pairs.length, thresholds: {}, defTiers: {}, ratios: {}, generatedAt: new Date().toISOString() };

  // ---- milestone thresholds, binned by projected mean ----
  for (const [key, { stats, t }] of Object.entries(THRESHOLDS)) {
    const width = t >= 100 ? 20 : 4;                 // yards vs attempts
    const bins = new Map();
    for (const { proj, act } of pairs) {
      const mu = sum(proj, stats);
      if (mu <= 0) continue;
      const b = bucketOf(mu, width);
      if (!bins.has(b)) bins.set(b, { n: 0, hit: 0 });
      const rec = bins.get(b);
      rec.n++;
      if (sum(act, stats) >= t) rec.hit++;
    }
    const table = [...bins.entries()]
      .filter(([, v]) => v.n >= 25)                  // ignore bins too thin to trust
      .sort((a, b) => a[0] - b[0])
      .map(([b, v]) => [b * width, Number((v.hit / v.n).toFixed(4)), v.n]);
    if (table.length) out.thresholds[key] = { stats, threshold: t, binWidth: width, table };
  }

  // ---- defence tiers, binned by projected points/yards allowed ----
  for (const [name, tiers, statKey, width] of [
    ['pts', PTS_ALLOW_TIERS, 'pts_allow', 3],
    ['yds', YDS_ALLOW_TIERS, 'yds_allow', 25],
  ]) {
    const bins = new Map();
    for (const { position, proj, act } of pairs) {
      if (position !== 'DEF') continue;
      const mu = proj[statKey];
      const actual = act[statKey];
      if (typeof mu !== 'number' || typeof actual !== 'number') continue;
      const b = bucketOf(mu, width);
      if (!bins.has(b)) bins.set(b, { n: 0, counts: tiers.map(() => 0) });
      const rec = bins.get(b);
      rec.n++;
      const idx = tiers.findIndex(([, lo, hi]) => actual >= lo && actual <= hi);
      if (idx >= 0) rec.counts[idx]++;
    }
    const table = [...bins.entries()]
      .filter(([, v]) => v.n >= 20)
      .sort((a, b) => a[0] - b[0])
      .map(([b, v]) => [b * width, v.counts.map((c) => Number((c / v.n).toFixed(4))), v.n]);
    if (table.length) {
      out.defTiers[name] = { statKey, binWidth: width, tiers: tiers.map((t) => t[0]), table };
    }
  }

  // ---- fixed ratios, measured per season ----
  // Some fields simply are not tracked in some seasons (fgm_50_59 is empty in
  // 2023 while fgm_50p is not), and folding those in would read as "a third of
  // 50-yard kicks travel 60+". A season whose numerator never fires while the
  // denominator does is treated as untracked, not as zero.
  for (const [key, { of }] of Object.entries(RATIOS)) {
    const perSeason = [];
    for (const season of SEASONS) {
      let num = 0; let den = 0;
      for (const p of pairs) {
        if (p.season !== season) continue;
        const d = p.act[of] ?? 0;
        if (!d) continue;
        den += d;
        num += p.act[key] ?? 0;
      }
      if (den >= 25 && num > 0) perSeason.push({ season, ratio: num / den, den });
    }
    if (!perSeason.length) continue;
    const den = perSeason.reduce((s, x) => s + x.den, 0);
    const ratio = perSeason.reduce((s, x) => s + x.ratio * x.den, 0) / den;
    out.ratios[key] = {
      of,
      ratio: Number(ratio.toFixed(4)),
      observed: Math.round(den),
      seasonsUsed: perSeason.map((x) => x.season),
      skipped: SEASONS.filter((sn) => !perSeason.some((x) => x.season === sn)),
    };
  }

  const path = new URL('../src/data/bonusCalibration.json', import.meta.url);
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${path.pathname}`);
  console.log(`  pairs: ${out.pairs}  seasons: ${SEASONS.join(', ')}`);
  console.log(`  thresholds calibrated: ${Object.keys(out.thresholds).join(', ')}`);
  console.log(`  defence tiers: ${Object.keys(out.defTiers).join(', ')}`);
  for (const [k, v] of Object.entries(out.ratios)) {
    console.log(`  ratio ${k.padEnd(14)} = ${String(v.ratio).padEnd(7)} of ${v.of}  (n=${v.observed}, seasons ${v.seasonsUsed.join('/')}${v.skipped.length ? `, skipped ${v.skipped.join('/')} — field not tracked` : ''})`);
  }
}

await main();
