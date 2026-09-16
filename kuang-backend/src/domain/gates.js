// Challenger gates: the checks a projection must survive before it is allowed
// to drive a start/sit recommendation.
//
// Each gate asks one question, returns a bounded multiplier and says why.
// Whether that multiplier is allowed to move the projection is a separate
// decision, held in GATE_WEIGHT below and settled by measurement rather than
// taste — see scripts/backtest-gates.js.
//
// What the backtest found, over ~3,000 player-weeks in each of 2024 and 2025:
// the projection Sleeper publishes already prices in recent form, snap share
// and matchup, because it is rebuilt every week. Applying those a second time
// double-counts, and the first version of this file made projections about 4%
// WORSE than leaving them alone. Weather is the exception — projections seem
// to publish before the forecast firms up, and bad-weather games came in 10-15%
// under projection in both seasons.
//
// So form, role and game script are now computed and shown but not applied:
// a falling snap share is worth telling someone about, and is still not
// evidence that this week's projection is too high. Matchup survives at a
// quarter strength; weather is applied ~40% harder than it was.
//
// Nothing here invents data: a gate with no input returns factor 1 and
// reports itself as 'unknown'.

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r3 = (x) => Number((x ?? 0).toFixed(3));
const r2 = (x) => Number((x ?? 0).toFixed(2));

export const BLOCKING_STATUSES = new Set(['Out', 'IR', 'PUP', 'Sus', 'COV', 'NA', 'DNR']);

/**
 * How hard each gate is allowed to pull, as an exponent on its own factor.
 * Fitted in scripts/backtest-gates.js against 2024 and 2025 actuals:
 *   0   the signal did not survive measurement — shown, never applied
 *   1   scaled about right
 *  >1   real and previously under-applied
 * Availability is 1 by definition: a bye or an Out is a fact, not a forecast.
 */
export const GATE_WEIGHT = {
  availability: 1,
  weather: 1.4,     // fitted α 1.35 (2024) / 1.45 (2025)
  matchup: 0.25,    // fitted α 0.05 (2024) / 0.30 (2025) — weak but correctly signed
  role: 0,          // fitted α 0.05 / -0.35 — flips sign between seasons
  form: 0,          // fitted α 0.20 / -0.10 — recent form is already in the projection
  gameScript: 0,    // fitted α 0.30 / 0.35 but non-monotonic both years
};

export const isApplied = (name) => (GATE_WEIGHT[name] ?? 0) > 0;
export const TOTAL_FACTOR_FLOOR = 0.6;
export const TOTAL_FACTOR_CEIL = 1.4;

// Positions whose production runs through the passing game, so wind, cold and
// precipitation bite hardest.
const AIR_POSITIONS = new Set(['QB', 'WR', 'TE']);

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------------------------------------------------------------- gate 1
function availabilityGate({ injuryStatus, onBye, projectedPoints }) {
  if (onBye) return { name: 'availability', verdict: 'blocked', factor: 0, note: 'on bye this week' };
  if (injuryStatus && BLOCKING_STATUSES.has(injuryStatus)) {
    return { name: 'availability', verdict: 'blocked', factor: 0, note: `listed ${injuryStatus}` };
  }
  if (!projectedPoints) {
    return { name: 'availability', verdict: 'blocked', factor: 0, note: 'no projection for this week' };
  }
  if (injuryStatus === 'Doubtful') return { name: 'availability', verdict: 'fail', factor: 0.35, note: 'listed Doubtful' };
  if (injuryStatus === 'Questionable') return { name: 'availability', verdict: 'caution', factor: 0.88, note: 'listed Questionable' };
  return { name: 'availability', verdict: 'pass', factor: 1, note: 'active' };
}

// ---------------------------------------------------------------- gate 2
// Is he still being used like a starter? Snap share and touch trend answer the
// question the point projection cannot.
function roleGate({ form, position }) {
  if (!form || !form.gamesPlayed) {
    return { name: 'role', verdict: 'unknown', factor: 1, note: 'no recent usage on file' };
  }
  let factor = 1;
  const notes = [];
  const share = form.snapShareLast ?? form.snapShare;

  if (typeof share === 'number') {
    if (share >= 0.8) { factor *= 1.06; notes.push(`${Math.round(share * 100)}% of snaps`); }
    else if (share >= 0.6) { factor *= 1.02; notes.push(`${Math.round(share * 100)}% of snaps`); }
    else if (share <= 0.35) { factor *= 0.88; notes.push(`only ${Math.round(share * 100)}% of snaps`); }
    else if (share <= 0.5) { factor *= 0.95; notes.push(`${Math.round(share * 100)}% of snaps`); }
  }
  if (form.snapShareTrend > 0.08) { factor *= 1.04; notes.push('snap share rising'); }
  else if (form.snapShareTrend < -0.08) { factor *= 0.93; notes.push('snap share falling'); }

  if (position === 'RB' || position === 'WR' || position === 'TE') {
    if (form.touchesTrend > 2) { factor *= 1.04; notes.push('touches trending up'); }
    else if (form.touchesTrend < -2) { factor *= 0.94; notes.push('touches trending down'); }
  }

  factor = clamp(factor, 0.82, 1.14);
  const verdict = factor >= 1.03 ? 'pass' : factor <= 0.92 ? 'fail' : 'caution';
  return { name: 'role', verdict, factor: r3(factor), note: notes.join(', ') || 'usage steady' };
}

// ---------------------------------------------------------------- gate 3
// Recent scoring vs his own baseline, shrunk toward neutral by sample size so
// one big game cannot promote a bench player into the lineup.
function formGate({ form }) {
  if (!form || form.gamesPlayed < 2 || form.priorPPG == null) {
    return { name: 'form', verdict: 'unknown', factor: 1, note: 'not enough games to judge form' };
  }
  const baseline = Math.max(form.recentPPG, 1);
  const rel = clamp((form.last3PPG - form.priorPPG) / baseline, -0.5, 0.5);
  const weight = 0.45 * clamp(form.gamesPlayed / 4, 0, 1); // trust grows with games
  const factor = clamp(1 + weight * rel, 0.85, 1.15);
  const verdict = factor >= 1.03 ? 'pass' : factor <= 0.95 ? 'fail' : 'caution';
  const dir = rel > 0.05 ? 'heating up' : rel < -0.05 ? 'cooling off' : 'steady';
  return {
    name: 'form',
    verdict,
    factor: r3(factor),
    note: `${dir} (last 3: ${form.last3PPG} vs ${form.priorPPG} before)`,
  };
}

// ---------------------------------------------------------------- gate 4
// What the opponent's defence has actually surrendered to this position,
// scored in the league's own rules.
function matchupGate({ defense, leagueAvg, position, opponent }) {
  if (!defense || !leagueAvg) {
    return { name: 'matchup', verdict: 'unknown', factor: 1, note: opponent ? `no matchup history vs ${opponent}` : 'opponent unknown' };
  }
  const rel = clamp(defense.vsAvg / Math.max(leagueAvg, 1), -0.35, 0.35);
  // Early in the season a defence has one or two games on file; trust the
  // signal in proportion to how much of it there is.
  const trust = clamp((defense.gamesSampled ?? 1) / 3, 0.33, 1);
  const factor = clamp(1 + 0.5 * rel * trust, 0.88, 1.12);
  const verdict = factor >= 1.03 ? 'pass' : factor <= 0.97 ? 'fail' : 'caution';
  const rankText = defense.rank
    ? `, ${ordinal(defense.rank)} most generous of ${defense.of}`
    : '';
  const sample = `${defense.gamesSampled} game${defense.gamesSampled === 1 ? '' : 's'}`;
  return {
    name: 'matchup',
    verdict,
    factor: r3(factor),
    note: `${opponent} allows ${defense.pointsAllowedPerGame}/gm to ${position}s${rankText} (${sample})`,
  };
}

// ---------------------------------------------------------------- gate 5
// Wind, cold and precipitation. Indoor and retractable-roof games skip this
// entirely rather than guessing.
function weatherGate({ weather, position, sheltered }) {
  if (sheltered) return { name: 'weather', verdict: 'pass', factor: 1, note: 'indoors — weather is not a factor' };
  if (!weather) return { name: 'weather', verdict: 'unknown', factor: 1, note: 'no forecast available yet' };

  const { tempF, windMph, precipIn, snowIn } = weather;
  const air = AIR_POSITIONS.has(position);
  const isK = position === 'K';
  let factor = 1;
  const notes = [];

  // Wind is the single biggest weather effect on fantasy scoring.
  if (windMph >= 15) {
    const over = windMph - 15;
    if (isK) factor *= clamp(1 - over * 0.018, 0.72, 1);
    else if (air) factor *= clamp(1 - over * 0.012, 0.8, 1);
    else factor *= clamp(1 - over * 0.004, 0.94, 1);
    notes.push(`${windMph} mph wind`);
  }

  // Cold: passing and kicking suffer, running is closer to neutral.
  if (tempF <= 25) {
    if (isK) factor *= 0.9;
    else if (air) factor *= 0.93;
    else factor *= 1.02;
    notes.push(`${tempF}°F`);
  } else if (tempF <= 35) {
    if (air || isK) factor *= 0.97;
    notes.push(`${tempF}°F`);
  }

  // Snow and heavy rain push offences toward the run.
  if (snowIn > 0.1) {
    if (isK) factor *= 0.88;
    else if (air) factor *= 0.9;
    else factor *= 1.04;
    notes.push(`${snowIn}" snow`);
  } else if (precipIn > 0.15) {
    if (air || isK) factor *= 0.95;
    else factor *= 1.02;
    notes.push(`${precipIn}" rain`);
  }

  factor = clamp(factor, 0.7, 1.06);
  const verdict = factor <= 0.95 ? 'fail' : factor >= 1.02 ? 'pass' : 'caution';
  return {
    name: 'weather',
    verdict,
    factor: r3(factor),
    note: notes.length ? `${weather.summary}` : `${weather.summary} — no material effect`,
  };
}

// ---------------------------------------------------------------- gate 6
// Game script: how much this offence has been scoring lately, and how hard the
// opponent has been to score on overall.
function gameScriptGate({ teamOffense, teamOffenseAvg, isHome, opponent }) {
  if (!teamOffense || !teamOffenseAvg) {
    return { name: 'gameScript', verdict: 'unknown', factor: 1, note: 'no recent team output on file' };
  }
  const rel = clamp(teamOffense.vsAvg / Math.max(teamOffenseAvg, 1), -0.3, 0.3);
  let factor = 1 + 0.35 * rel;
  if (isHome === true) factor *= 1.01;
  else if (isHome === false) factor *= 0.99;
  factor = clamp(factor, 0.9, 1.1);
  const verdict = factor >= 1.02 ? 'pass' : factor <= 0.98 ? 'fail' : 'caution';
  return {
    name: 'gameScript',
    verdict,
    factor: r3(factor),
    note: `offence averaging ${teamOffense.pointsPerGame} (${teamOffense.vsAvg >= 0 ? '+' : ''}${teamOffense.vsAvg} vs league)${isHome === false && opponent ? `, away at ${opponent}` : ''}`,
  };
}

/**
 * Run every gate for one player-week.
 *
 * @returns {{
 *   base: number, adjusted: number, factor: number, confidence: number,
 *   blocked: boolean, gates: object[], reasons: string[]
 * }}
 */
export function runGates({ position, projectedPoints, injuryStatus, onBye, form, defense, leagueAvg, opponent, weather, sheltered, teamOffense, teamOffenseAvg, isHome }) {
  const base = Number(projectedPoints ?? 0);

  const availability = availabilityGate({ injuryStatus, onBye, projectedPoints: base });
  if (availability.factor === 0) {
    return {
      base: r2(base),
      adjusted: 0,
      factor: 0,
      confidence: 1,
      blocked: true,
      gates: [{ ...availability, weight: 1, applied: true, effect: 0 }],
      reasons: [availability.note],
    };
  }

  const gates = [
    availability,
    roleGate({ form, position }),
    formGate({ form }),
    matchupGate({ defense, leagueAvg, position, opponent }),
    weatherGate({ weather, position, sheltered }),
    gameScriptGate({ teamOffense, teamOffenseAvg, isHome, opponent }),
  ];

  // Each gate contributes factor^weight, so an unweighted gate is inert.
  for (const g of gates) {
    g.weight = GATE_WEIGHT[g.name] ?? 0;
    g.applied = g.weight > 0;
    g.effect = g.applied && g.factor > 0 ? r3(g.factor ** g.weight) : 1;
  }
  const raw = gates.reduce((f, g) => f * g.effect, 1);
  const factor = clamp(raw, TOTAL_FACTOR_FLOOR, TOTAL_FACTOR_CEIL);

  // Confidence tracks only the gates that actually move the number: an
  // unmeasurable signal we never apply is not a reason to doubt the answer.
  const scored = gates.filter((g) => g.applied);
  const unknowns = scored.filter((g) => g.verdict === 'unknown').length;
  let confidence = 1 - 0.12 * unknowns;
  if (injuryStatus === 'Questionable') confidence -= 0.15;
  if (injuryStatus === 'Doubtful') confidence -= 0.3;
  confidence = clamp(confidence, 0.2, 1);

  const reasons = gates
    .filter((g) => g.applied && (g.verdict === 'pass' || g.verdict === 'fail'))
    .map((g) => `${g.name}: ${g.note}`);

  return {
    base: r2(base),
    adjusted: r2(base * factor),
    factor: r3(factor),
    confidence: r2(confidence),
    blocked: false,
    gates,
    reasons,
  };
}

/**
 * Should the challenger actually replace the incumbent starter?
 *
 * The bar rises as confidence falls, so a shaky read has to be clearly better
 * before it is allowed to change a lineup. This is the last gate.
 */
export function challengeStarter({ incumbent, challenger, minGain = 1 }) {
  if (!challenger || challenger.blocked) return { swap: false, reason: 'challenger is unavailable' };
  if (!incumbent) return { swap: true, reason: 'slot is empty', gain: r2(challenger.adjusted) };
  if (incumbent.blocked) {
    return { swap: true, reason: incumbent.reasonText || 'starter unavailable', gain: r2(challenger.adjusted - incumbent.adjusted) };
  }

  const gain = challenger.adjusted - incumbent.adjusted;
  // An uncertain call needs a bigger edge: up to ~2.5x the base threshold.
  const pairConfidence = Math.min(challenger.confidence, incumbent.confidence);
  const bar = minGain * (1 + 1.5 * (1 - pairConfidence));
  if (gain < bar) {
    return { swap: false, gain: r2(gain), bar: r2(bar), reason: `edge of ${r2(gain)} does not clear the ${r2(bar)} confidence bar` };
  }
  return { swap: true, gain: r2(gain), bar: r2(bar), reason: `projects ${r2(gain)} more after gates` };
}
