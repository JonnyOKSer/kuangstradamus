// Two horizons for keeper and dynasty leagues: the rest of this season, and
// next season. A redraft league has only the first.
//
// This season is what the rest of the app already measures: rest-of-season
// points above a free replacement. Next season is estimated, never projected
// by anyone yet, so it is built from this season's full-season value,
// regressed toward the mean (year-over-year value above replacement keeps
// about two thirds), aged by position, and then weighted by the chance the
// player is actually kept and net of what keeping him costs. A pick for next
// season is worth its round's value, in full, on that horizon.
//
// The two horizons are combined with a weight per format, which stands in for
// uncertainty and for the fact that next season is further away.

export const NEXT_SEASON_WEIGHT = { redraft: 0, keeper: 0.6, dynasty: 0.85 };
export const VORP_REGRESSION = 0.65;
export const FORMAT_NAMES = { 0: 'redraft', 1: 'keeper', 2: 'dynasty' };

/** Expected change in value from one season to the next, by position and age. */
export function ageFactor(position, age, yearsExp) {
  if (age == null) return 1;
  const young = yearsExp != null && yearsExp <= 2 ? 1.05 : 1; // second- and third-year growth
  switch (position) {
    case 'RB': return young * (age <= 25 ? 1 : age <= 27 ? 0.92 : age <= 29 ? 0.78 : 0.6);
    case 'WR': return young * (age <= 26 ? 1.02 : age <= 30 ? 0.97 : age <= 32 ? 0.85 : 0.7);
    case 'TE': return young * (age <= 27 ? 1.02 : age <= 31 ? 0.97 : 0.8);
    case 'QB': return age <= 33 ? 1 : age <= 36 ? 0.92 : 0.8;
    default: return 1;
  }
}

/** Value above replacement next season before keeper effects. A bad season regresses to zero, not below: next year he is a free agent, not a liability. */
export function nextSeasonGross({ fullSeasonVorp, position, age, yearsExp }) {
  if (fullSeasonVorp == null) return null;
  return Number((Math.max(0, fullSeasonVorp) * VORP_REGRESSION * ageFactor(position, age, yearsExp)).toFixed(2));
}

/**
 * Chance a player is kept, from his league-wide rank by next-season value
 * against the keeper slots the league has. Rule-agnostic on purpose: Sleeper
 * does not publish keeper rules, but every rule keeps the valuable players.
 */
export function keepProbability({ rank, slots, format }) {
  if (format === 'dynasty') return 1;
  if (format !== 'keeper' || !slots || rank == null) return 0;
  const scale = Math.max(2, slots * 0.3);
  return Number((1 / (1 + Math.exp((rank - slots - 0.5) / scale))).toFixed(3));
}

/**
 * The same question asked of one roster: would this player be among its K
 * keepers? `teamRank` is his rank by next-season value among that roster's
 * players after the trade.
 */
export function keepProbabilityOnTeam({ teamRank, keepers, format }) {
  if (format === 'dynasty') return 1;
  if (format !== 'keeper' || !keepers || teamRank == null) return 0;
  const scale = Math.max(0.75, keepers * 0.5);
  return Number((1 / (1 + Math.exp((teamRank - keepers - 0.5) / scale))).toFixed(3));
}

/**
 * What the league actually is, from its declared type cross-checked against
 * how many players returning owners carried from last season.
 *
 * @param carryPerTeam players on this season's roster who were on the same owner's roster at the end of last season
 * @param keptPerTeam  those of them who were NOT selected in this season's draft (held outside the draft)
 */
export function detectFormat({ declaredType = 0, maxKeepers = 0, carryPerTeam = null, keptPerTeam = null, rosterSize = 16, teams = 12 } = {}) {
  const declared = FORMAT_NAMES[declaredType] || 'redraft';
  const coincidence = rosterSize / Math.max(1, teams); // a player who lands back on the same roster by chance
  const observedKeepers = carryPerTeam == null ? null : Math.max(0, carryPerTeam - coincidence);
  const carryRate = carryPerTeam == null ? null : carryPerTeam / rosterSize;

  let detected = declared;
  let basis = 'declared';
  if (carryRate != null) {
    if (carryRate >= 0.6 && declared !== 'dynasty') { detected = 'dynasty'; basis = 'observed'; }
    else if (declared === 'redraft' && observedKeepers >= 0.8) { detected = 'keeper'; basis = 'observed'; }
    else if (declared === 'dynasty' && carryRate < 0.3) { detected = 'keeper'; basis = 'observed'; }
  }

  let keepersPerTeam = 0;
  if (detected === 'dynasty') keepersPerTeam = rosterSize;
  else if (detected === 'keeper') keepersPerTeam = maxKeepers > 0 ? maxKeepers : Math.max(1, Math.round(observedKeepers ?? 1));

  // Keepers either come off the board before the draft ("held") or are
  // re-selected inside it at the cost of a round ("drafted").
  let mechanism = null;
  if (detected === 'keeper' && carryPerTeam != null && keptPerTeam != null) {
    mechanism = keptPerTeam < Math.max(0.5, 0.5 * (observedKeepers ?? 0)) ? 'drafted' : 'held';
  }

  return {
    declared,
    detected,
    basis,
    keepersPerTeam,
    maxKeepers: maxKeepers || null,
    carryRate: carryRate == null ? null : Number(carryRate.toFixed(2)),
    carryPerTeam: carryPerTeam == null ? null : Number(carryPerTeam.toFixed(1)),
    observedKeepers: observedKeepers == null ? null : Number(observedKeepers.toFixed(1)),
    mechanism,
    nextSeasonWeight: NEXT_SEASON_WEIGHT[detected],
  };
}

export const combine = (h0, h1, w1) => Number(((h0 || 0) + (w1 || 0) * (h1 || 0)).toFixed(2));

/** One sentence for the UI. */
export function describeFormat(f) {
  if (!f) return null;
  const name = f.detected.charAt(0).toUpperCase() + f.detected.slice(1);
  const parts = [`${name} league`];
  if (f.basis === 'observed') parts.push(`(declared ${f.declared}, but rosters say ${f.detected})`);
  if (f.detected === 'keeper') {
    parts.push(`${f.keepersPerTeam} keeper${f.keepersPerTeam === 1 ? '' : 's'} per team${f.maxKeepers ? '' : ' (observed)'}`);
    if (f.mechanism === 'drafted') parts.push(`keepers are re-selected in the draft at a round cost${f.keeperCostRound ? ` (about round ${Math.round(f.keeperCostRound)}, worth ${Math.round(f.keeperCostValue || 0)})` : ''}`);
    else if (f.mechanism === 'held') parts.push('keepers are held outside the draft');
  }
  if (f.carryRate != null) parts.push(`${Math.round(f.carryRate * 100)}% of rosters carried over from last season`);
  if (f.nextSeasonWeight) parts.push(`next season counted at ${Math.round(f.nextSeasonWeight * 100)}%`);
  return parts.join(' · ');
}
