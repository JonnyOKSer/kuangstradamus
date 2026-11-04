// Draft-pick values learned from this league's own drafts.
//
// For every draft in the league's history we look at what each pick actually
// turned into, scored in this league's rules, and build a value curve by round
// and by early / mid / late within the round. Small samples are shrunk toward
// a calibration measured over five seasons of standard leagues, so a one-year
// league gets a sensible number and a six-year league gets its own.
//
// Auction drafts have no meaningful rounds, so non-keeper buys are ranked by
// price and cut into tiers of one pick per team: the ten priciest buys in a
// ten-team league are "round 1". Keeper slots are not picks and are excluded
// everywhere.
//
// A pick is an option: you keep the hits and drop the busts, so the value of a
// round is the average of max(0, outcome), not the raw average. The raw
// average is kept for the record (it shows how often a round busts).

const r1 = (x) => Number((x ?? 0).toFixed(1));
const r2 = (x) => Number((x ?? 0).toFixed(2));
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** League picks that weigh as much as the prior. Eight picks of evidence = one prior. */
export const SHRINK_ROUND = 8;
export const SHRINK_THIRD = 4;
export const LEAGUE_BASIS_MIN = 12;

export const THIRDS = ['early', 'mid', 'late'];

export function thirdOf(slot, teams) {
  if (!slot || !teams) return null;
  const t = teams / 3;
  return slot <= t ? 'early' : slot <= 2 * t ? 'mid' : 'late';
}

const nameOf = (p) => [p.metadata?.first_name, p.metadata?.last_name].filter(Boolean).join(' ') || String(p.player_id);

/** Flatten one Sleeper draft and its picks into comparable picks. */
export function normalizeDraft(draft, picks = []) {
  const teams = Number(draft?.settings?.teams) || new Set(picks.map((p) => p.roster_id)).size || 12;
  const season = Number(draft?.season) || null;
  const real = picks.filter((p) => p?.player_id && !p.is_keeper);
  const base = { draftId: draft?.draft_id, season, teams, keepers: picks.length - real.length };

  if (draft?.type === 'auction') {
    const byPrice = [...real].sort((a, b) => Number(b.metadata?.amount || 0) - Number(a.metadata?.amount || 0));
    return {
      ...base,
      type: 'auction',
      picks: byPrice.map((p, i) => ({
        playerId: String(p.player_id),
        rosterId: p.roster_id,
        round: Math.floor(i / teams) + 1,
        slot: (i % teams) + 1,
        overall: i + 1,
        amount: Number(p.metadata?.amount || 0),
        name: nameOf(p),
        position: p.metadata?.position || null,
      })),
    };
  }
  return {
    ...base,
    type: draft?.type || 'snake',
    picks: real.map((p) => {
      const overall = Number(p.pick_no) || null;
      return {
        playerId: String(p.player_id),
        rosterId: p.roster_id,
        round: Number(p.round) || (overall ? Math.ceil(overall / teams) : 1),
        slot: Number(p.draft_slot) || (overall ? ((overall - 1) % teams) + 1 : 1),
        overall,
        amount: null,
        name: nameOf(p),
        position: p.metadata?.position || null,
      };
    }),
  };
}

/** A pick that produced under a tenth of replacement level is a complete bust: injured, cut, or never played. */
export const BUST_FRACTION = 0.1;

/**
 * Attach what each pick became.
 * @param valueOf (playerId, season, position) → { season, now, seasonPts, replacement }
 *   season = value above replacement the year he was drafted; now = value today;
 *   seasonPts / replacement let a complete bust be told apart from a merely bad pick
 */
export function draftOutcomes(drafts, valueOf) {
  const out = [];
  for (const d of drafts) {
    for (const p of d.picks) {
      const v = valueOf(p.playerId, d.season, p.position) || {};
      out.push({
        ...p,
        season: d.season,
        draftType: d.type,
        teams: d.teams,
        third: thirdOf(p.slot, d.teams),
        seasonValue: v.season == null ? null : r1(v.season),
        nowValue: v.now == null ? null : r1(v.now),
        seasonPts: v.seasonPts == null ? null : r1(v.seasonPts),
        bust: v.seasonPts != null && v.replacement != null ? v.seasonPts < BUST_FRACTION * v.replacement : null,
      });
    }
  }
  return out;
}

/**
 * Value curve by round, shrunk toward the prior.
 * @param measure 'season' (what the pick produced that year) | 'now' (what the player is worth today)
 * @param prior   { rounds: { [r]: { value, usefulRate } } } in PPR points
 * @param fallback { [r]: value } used where the prior has no round
 * @param scale   this league's scoring scale
 */
export function buildPickCurve(outcomes, { measure = 'season', prior = null, fallback = {}, scale = 1, maxRound = 20 } = {}) {
  const key = measure === 'now' ? 'nowValue' : 'seasonValue';
  const byRound = {};
  const seasons = new Set();
  for (const o of outcomes) {
    if (o[key] == null || !o.round || o.round > maxRound) continue;
    seasons.add(o.season);
    const r = (byRound[o.round] ||= { values: [], played: [], busts: 0, thirds: { early: [], mid: [], late: [] } });
    r.values.push(o[key]);
    if (o.bust) r.busts++; else r.played.push(o[key]);
    if (o.third) r.thirds[o.third].push(o[key]);
  }
  const last = Math.min(maxRound, Math.max(0, ...Object.keys(byRound).map(Number), ...Object.keys(prior?.rounds || {}).map(Number), ...Object.keys(fallback).map(Number)));
  const rounds = {};
  for (let r = 1; r <= last; r++) {
    const priorValue = (prior?.rounds?.[r]?.value ?? fallback[r] ?? 0) * scale;
    const d = byRound[r];
    const n = d?.values.length || 0;
    const m = n ? mean(d.values) : null;
    const om = n ? mean(d.values.map((v) => Math.max(0, v))) : null;   // option value: busts cut at zero
    const value = n ? (n * om + SHRINK_ROUND * priorValue) / (n + SHRINK_ROUND) : priorValue;
    const thirds = {};
    for (const t of THIRDS) {
      const vs = d?.thirds[t] || [];
      const tm = mean(vs.map((v) => Math.max(0, v)));
      thirds[t] = { n: vs.length, mean: tm == null ? null : r1(tm), value: r1(vs.length ? (vs.length * tm + SHRINK_THIRD * value) / (vs.length + SHRINK_THIRD) : value) };
    }
    rounds[r] = {
      n,
      mean: m == null ? null : r1(m),
      optionMean: om == null ? null : r1(om),
      playedMean: d?.played.length ? r1(mean(d.played)) : null,   // complete busts thrown out
      busts: d?.busts ?? 0,
      median: n ? r1(median(d.values)) : null,
      hitRate: n ? r2(d.values.filter((v) => v > 0).length / n) : null,
      prior: r1(priorValue),
      priorHitRate: prior?.rounds?.[r]?.usefulRate ?? null,
      value: r1(value),
      basis: n >= LEAGUE_BASIS_MIN ? 'league' : n > 0 ? 'blend' : 'prior',
      thirds,
    };
  }
  const types = new Set(outcomes.map((o) => o.draftType).filter(Boolean));
  return {
    measure,
    auction: types.size > 0 && [...types].every((t) => t === 'auction'),
    seasons: [...seasons].filter(Boolean).sort(),
    picks: outcomes.filter((o) => o[key] != null).length,
    rounds,
  };
}

/** Look a pick up on the curve: by round, and by third of the round when a slot or third is known. */
export function curveValue(curve, { round, slot, third, teams }) {
  const r = curve?.rounds?.[round];
  if (!r) return null;
  const t = third || thirdOf(slot, teams || 12);
  const base = { n: r.n, hitRate: r.hitRate, basis: r.basis, mean: r.mean, optionMean: r.optionMean, playedMean: r.playedMean, busts: r.busts, median: r.median, prior: r.prior, round };
  if (t && r.thirds?.[t]) return { ...base, value: r.thirds[t].value, third: t, nThird: r.thirds[t].n };
  return { ...base, value: r.value, third: null, nThird: 0 };
}

export const ordinal = (n) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`;
};

/** One sentence on where a pick's number comes from. */
export function describePickBasis(round, cv, curve) {
  if (!cv) return null;
  const span = curve?.seasons?.length ? (curve.seasons.length === 1 ? `the ${curve.seasons[0]} draft` : `the ${curve.seasons[0]}–${curve.seasons[curve.seasons.length - 1]} drafts`) : 'this league';
  const what = curve?.measure === 'now' ? 'are worth' : 'have been worth';
  const unit = curve?.auction ? `${ordinal(round)}-tier auction buys (one per team, by price)` : `${ordinal(round)}-round picks`;
  if (cv.basis === 'prior') return `This league has no ${unit} on record, so the number comes from five seasons of standard leagues.`;
  const hit = cv.hitRate != null ? `${Math.round(cv.hitRate * 100)}% finished above replacement` : '';
  const third = cv.third && cv.nThird ? ` (${cv.third} in the ${curve?.auction ? 'tier' : 'round'}: ${cv.nThird})` : '';
  const busts = cv.busts ? ` Throwing out the ${cv.busts} complete bust${cv.busts === 1 ? '' : 's'} (injured, cut, or never played), the picks that played averaged ${cv.playedMean}.` : '';
  const option = cv.mean != null && cv.optionMean != null && cv.mean < cv.optionMean - 1 ? ` Valued as an option: hits in full, busts at zero.` : '';
  // End on the number actually used, and say why it differs from the raw average.
  const one = curve?.auction ? `a ${ordinal(round)}-tier buy` : `a ${ordinal(round)}-round pick`;
  const where = cv.third ? ` ${cv.third} in the ${curve?.auction ? 'tier' : 'round'}` : '';
  const steadied = cv.value != null && cv.optionMean != null && Math.abs(cv.value - cv.optionMean) > 0.5;
  const used = cv.value == null ? ''
    : steadied
      ? ` Steadied toward the standard-league figure of ${cv.prior}${cv.basis === 'blend' ? ' because the sample is small' : ''}, ${one}${where} here is worth ${cv.value}.`
      : ` So ${one}${where} here is worth ${cv.value}.`;
  return `In this league, ${unit} ${what} ${cv.optionMean} on average across ${cv.n} picks from ${span}${third}; ${hit}.${busts}${option}${used}`;
}
