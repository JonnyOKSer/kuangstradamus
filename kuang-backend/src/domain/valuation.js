// Trade valuation: value over replacement (VORP) using rest-of-season points.
//
// A player's value is the points he produces above what a free replacement at
// his position would produce. Replacement level comes from the league's
// roster slots and team count, so a 2-for-1 is judged by how much the empty
// slot's free fill-in is worth, not by raw point sums. Points are already
// league-scored by the caller (see scoring.js), so custom rules flow through.

export const DEFAULT_ROSTER_POSITIONS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'];
export const DEFAULT_NUM_TEAMS = 12;

export const FLEX_ELIGIBILITY = {
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
};
export const NON_STARTING_SLOTS = new Set(['BN', 'IR', 'TAXI']);
export const CORE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

// Rough pick values expressed in "ROS points above replacement".
// Only used when a trade includes draft picks.
export const PICK_VALUES = { 1: 45, 2: 18, 3: 7, 4: 3, 5: 1 };

export function starterSlots(rosterPositions) {
  return rosterPositions.filter((s) => !NON_STARTING_SLOTS.has(s));
}

/**
 * The positions a league actually starts. A league with no K or DEF slot has
 * no kickers or defences to analyse, so every report filters through this
 * instead of assuming the traditional nine-slot lineup.
 */
export function activePositions(rosterPositions = DEFAULT_ROSTER_POSITIONS) {
  const slots = starterSlots(rosterPositions);
  const active = new Set();
  for (const slot of slots) {
    if (CORE_POSITIONS.includes(slot)) active.add(slot);
    for (const pos of FLEX_ELIGIBILITY[slot] || []) active.add(pos);
  }
  return CORE_POSITIONS.filter((p) => active.has(p));
}

function benchBuffer(pos, numTeams, hasSuperFlex) {
  switch (pos) {
    case 'QB': return hasSuperFlex ? Math.round(numTeams * 0.5) : (numTeams >= 12 ? 2 : 1);
    case 'RB':
    case 'WR': return Math.round(numTeams * 0.5);
    case 'TE': return Math.round(numTeams * 0.25);
    default: return 0;
  }
}

/**
 * Replacement-level points per position for a league shape.
 * @param players iterable of { position, pts } — every projected player, already league-scored
 */
export function computeReplacementLevels({
  rosterPositions = DEFAULT_ROSTER_POSITIONS,
  numTeams = DEFAULT_NUM_TEAMS,
  players,
}) {
  const byPos = Object.fromEntries(CORE_POSITIONS.map((p) => [p, []]));
  for (const p of players) {
    if (byPos[p.position]) byPos[p.position].push(p.pts ?? 0);
  }
  for (const pos of CORE_POSITIONS) byPos[pos].sort((a, b) => b - a);

  const slots = starterSlots(rosterPositions);
  const taken = Object.fromEntries(CORE_POSITIONS.map((p) => [p, 0]));

  for (const slot of slots) {
    if (taken[slot] !== undefined) taken[slot] += numTeams;
  }
  for (const slot of slots) {
    const elig = FLEX_ELIGIBILITY[slot];
    if (!elig) continue;
    for (let i = 0; i < numTeams; i++) {
      let bestPos = null;
      let bestPts = -Infinity;
      for (const pos of elig) {
        const pts = byPos[pos]?.[taken[pos]] ?? -Infinity;
        if (pts > bestPts) { bestPts = pts; bestPos = pos; }
      }
      if (bestPos) taken[bestPos]++;
    }
  }

  const hasSuperFlex = slots.includes('SUPER_FLEX');
  const replacementRank = {};
  const replacementPoints = {};
  for (const pos of CORE_POSITIONS) {
    const rank = taken[pos] + benchBuffer(pos, numTeams, hasSuperFlex);
    replacementRank[pos] = rank;
    const list = byPos[pos];
    replacementPoints[pos] = rank > 0 && list.length
      ? Number((list[Math.min(rank, list.length) - 1] ?? 0).toFixed(2))
      : 0;
  }

  return { numTeams, rosterPositions, startersByPosition: taken, replacementRank, replacementPoints };
}

/**
 * A league-invariant unit of value: what a replacement starter produces in a
 * week, averaged over the skill positions the league actually starts.
 *
 * Constants expressed in raw points mean different things in different
 * leagues — 25 points of VORP is two weeks of replacement production in a
 * standard PPR league and three in a low-scoring one — so thresholds are
 * written as multiples of this instead of as bare numbers.
 */
export const PPR_REPLACEMENT_PER_WEEK = 11.5; // measured in a standard 10-12 team PPR league

export function replacementPerWeek(levels, activePositions = CORE_POSITIONS, weeks = 17) {
  const core = ['RB', 'WR', 'TE', 'QB'].filter((p) => activePositions.includes(p));
  if (!core.length || !weeks) return PPR_REPLACEMENT_PER_WEEK;
  const avg = core.reduce((s, p) => s + (levels?.replacementPoints?.[p] ?? 0) / weeks, 0) / core.length;
  return avg > 0 ? avg : PPR_REPLACEMENT_PER_WEEK;
}

/** Multiply a PPR-calibrated constant by this to get its equivalent here. */
export const leagueScale = (levels, activePositions, weeks) =>
  replacementPerWeek(levels, activePositions, weeks) / PPR_REPLACEMENT_PER_WEEK;

export function playerValue(rosPts, position, levels) {
  const replacement = levels.replacementPoints[position] ?? 0;
  const rawVorp = Number(((rosPts ?? 0) - replacement).toFixed(2));
  return { ros: Number((rosPts ?? 0).toFixed(2)), replacement, vorp: Math.max(0, rawVorp), rawVorp };
}

export function pickValue(pick) {
  return PICK_VALUES[pick.round] ?? 0;
}

/** Positional rank of a points total among all players at that position. */
export function positionalRank(pts, position, players) {
  let rank = 1;
  for (const p of players) if (p.position === position && (p.pts ?? 0) > pts) rank++;
  return rank;
}

/**
 * Classify a trade from the two sides' total values.
 * Returns { category, winner, marginPct }.
 */
/**
 * @param noiseFloor the smallest gap worth calling a winner over. Without one
 *   the verdict is pure ratio, so two waiver scrubs worth 0.1 and 0.2 came out
 *   as "fleeces the other side" on a 50% margin.
 */
export function classifyTrade(valueA, valueB, { noiseFloor = 0 } = {}) {
  const max = Math.max(valueA, valueB);
  if (max <= 0) return { category: 'even', winner: null, marginPct: 0 };
  const gap = Math.abs(valueA - valueB);
  if (gap < noiseFloor) {
    return { category: 'even', winner: null, marginPct: Number(((gap / max) * 100).toFixed(1)), belowNoiseFloor: true };
  }
  const marginPct = Number((gap / max * 100).toFixed(1));
  const winner = valueA === valueB ? null : valueA > valueB ? 'A' : 'B';
  let category = 'even';
  if (marginPct >= 40) category = 'lopsided';
  else if (marginPct >= 18) category = 'clear';
  else if (marginPct >= 6) category = 'slight';
  return { category, winner: category === 'even' ? null : winner, marginPct };
}

const RISKY_STATUSES = new Set(['Out', 'IR', 'PUP', 'Sus', 'Doubtful', 'COV', 'NA']);

/** Human-readable flags for a valued player. */
export function playerFlags({ injuryStatus, byeWeeks = [], playoffWeeks = [], confidence = 1, alternatives = [], projected = true }) {
  const flags = [];
  if (!projected) flags.push({ type: 'projection', level: 'high', text: 'No remaining projections (out for season or inactive)' });
  if (injuryStatus && RISKY_STATUSES.has(injuryStatus)) flags.push({ type: 'injury', level: 'high', text: `Listed ${injuryStatus}` });
  else if (injuryStatus === 'Questionable') flags.push({ type: 'injury', level: 'medium', text: 'Questionable' });
  const playoffByes = byeWeeks.filter((w) => playoffWeeks.includes(w));
  if (playoffByes.length) flags.push({ type: 'bye', level: 'medium', text: `Bye during fantasy playoffs (week ${playoffByes.join(', ')})` });
  if (confidence < 0.8) {
    const alt = alternatives.length ? ` (did you mean ${alternatives.slice(0, 2).join(' or ')}?)` : '';
    flags.push({ type: 'match', level: 'low', text: `Name match ${Math.round(confidence * 100)}%${alt}` });
  }
  return flags;
}
