// Fill in the scoring fields Sleeper projects nothing for.
//
// scoreStats() multiplies stat by weight, so a scoring rule with no matching
// stat in the line is silently worth zero. Sleeper's projections carry means
// (rush_yd 64.0, pts_allow 16.3) but not the milestone fields many leagues
// actually pay for — bonus_rush_yd_100, pts_allow_1_6, fgm_50_59 — so those
// rules were quietly dropped from every projection, valuation, waiver and
// trade number.
//
// Three kinds of gap, handled three ways:
//
//   exact       arithmetic on fields we already have (fgmiss is the sum of the
//               fgmiss_* buckets; a first-down bonus is the first downs)
//   thresholds  P(stat >= t) given the projected mean, measured from three
//               seasons of actuals in scripts/calibrate-bonuses.js
//   tiers       defence points/yards allowed spread across their brackets by
//               the same measured distribution, replacing Sleeper's hard
//               "the mean landed here" indicator
//
// Everything is an expectation, so a 12% chance of a +3 bonus adds 0.36. That
// is the right number for ranking players even though no one ever scores it.

import CAL from '../data/bonusCalibration.json' with { type: 'json' };

const FIRST_DOWN_BONUS = {
  QB: ['pass_fd', 'rush_fd'],
  RB: ['rush_fd', 'rec_fd'],
  WR: ['rush_fd', 'rec_fd'],
  TE: ['rush_fd', 'rec_fd'],
};
const FD_KEY = { QB: 'bonus_fd_qb', RB: 'bonus_fd_rb', WR: 'bonus_fd_wr', TE: 'bonus_fd_te' };
const FG_MISS_BUCKETS = ['fgmiss_0_19', 'fgmiss_20_29', 'fgmiss_30_39', 'fgmiss_40_49', 'fgmiss_50p'];

const sum = (stats, keys) => keys.reduce((s, k) => s + (stats?.[k] ?? 0), 0);
const has = (stats, k) => typeof stats?.[k] === 'number';

/** Interpolated lookup into a [binStart, value, n] table. */
function lookup(table, mu) {
  if (!table?.length) return null;
  if (mu <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (mu >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1];
    const [x1, y1] = table[i];
    if (mu <= x1) {
      const w = x1 === x0 ? 0 : (mu - x0) / (x1 - x0);
      return Array.isArray(y0)
        ? y0.map((v, j) => v + (y1[j] - v) * w)
        : y0 + (y1 - y0) * w;
    }
  }
  return last[1];
}

/**
 * @param stats    a projected stat line
 * @param position the player's position
 * @returns a new stat line with derived fields added (never mutates the input)
 */
export function deriveStats(stats, position) {
  if (!stats) return stats;
  const out = { ...stats };

  // ---- exact arithmetic ----
  if (!has(out, 'fgmiss') && FG_MISS_BUCKETS.some((k) => has(out, k))) {
    out.fgmiss = sum(out, FG_MISS_BUCKETS);
  }
  const fdKey = FD_KEY[position];
  if (fdKey && !has(out, fdKey)) {
    const parts = FIRST_DOWN_BONUS[position];
    if (parts.some((k) => has(out, k))) out[fdKey] = sum(out, parts);
  }
  if (!has(out, 'fd')) {
    const parts = ['pass_fd', 'rush_fd', 'rec_fd'].filter((k) => has(out, k));
    if (parts.length) out.fd = sum(out, parts);
  }

  // ---- measured ratios (long touchdowns, 60-yard kicks) ----
  for (const [key, spec] of Object.entries(CAL.ratios || {})) {
    if (has(out, key) || !has(out, spec.of)) continue;
    out[key] = out[spec.of] * spec.ratio;
  }
  // 60+ is whatever is left of the 50+ makes
  if (!has(out, 'fgm_60p') && has(out, 'fgm_50p')) {
    out.fgm_60p = Math.max(0, out.fgm_50p - (out.fgm_50_59 ?? 0));
  }

  // ---- milestone thresholds ----
  for (const [key, spec] of Object.entries(CAL.thresholds || {})) {
    if (has(out, key)) continue;
    if (!spec.stats.some((k) => has(out, k))) continue;
    const mu = sum(out, spec.stats);
    const p = lookup(spec.table, mu);
    if (p != null) out[key] = p;
  }

  // ---- defence tiers ----
  if (position === 'DEF') {
    for (const spec of Object.values(CAL.defTiers || {})) {
      if (!has(out, spec.statKey)) continue;
      const probs = lookup(spec.table, out[spec.statKey]);
      if (!Array.isArray(probs)) continue;
      // Replace Sleeper's single hard indicator: a 31% chance of the 14-20
      // bracket and a 10% chance of 1-6 is a truer line than "14-20: 1".
      spec.tiers.forEach((tier, i) => { out[tier] = probs[i]; });
    }
  }

  return out;
}

/** Every scoring key this build can produce a value for. */
export const DERIVABLE_KEYS = new Set([
  'fgmiss', 'fd', 'fgm_60p',
  ...Object.values(FD_KEY),
  ...Object.keys(CAL.ratios || {}),
  ...Object.keys(CAL.thresholds || {}),
  ...Object.values(CAL.defTiers || {}).flatMap((s) => s.tiers),
]);

/**
 * Which of a league's scoring rules actually reach a projection, and which are
 * still worth nothing. Surfaced rather than swallowed: a league paying +6 for a
 * special-teams touchdown should be told we cannot forecast one, not shown a
 * number that quietly assumes zero.
 */
export function auditScoring(scoringSettings = {}, projectedKeys = new Set()) {
  const unscored = [];
  for (const [key, weight] of Object.entries(scoringSettings)) {
    if (!Number(weight)) continue;
    if (projectedKeys.has(key) || DERIVABLE_KEYS.has(key)) continue;
    unscored.push({ key, weight: Number(weight) });
  }
  unscored.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  return {
    unscored,
    unscoredCount: unscored.length,
    totalRules: Object.values(scoringSettings).filter((v) => Number(v)).length,
  };
}

export const calibrationInfo = () => ({
  seasons: CAL.seasons,
  sampleSize: CAL.pairs,
  generatedAt: CAL.generatedAt,
});
