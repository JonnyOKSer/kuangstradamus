import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTrade, leagueScale, replacementPerWeek, PPR_REPLACEMENT_PER_WEEK } from '../src/domain/valuation.js';
import { productionFloors, isWorkhorse } from '../src/domain/sleepers.js';

/* --- a percentage needs a denominator big enough to carry meaning --- */

test('a tiny gap between two worthless players is not a fleecing', () => {
  const floor = 0.05 * 25;
  const r = classifyTrade(0.1, 0.2, { noiseFloor: floor });
  assert.equal(r.category, 'even');
  assert.equal(r.winner, null);
  assert.equal(r.belowNoiseFloor, true);
});

test('a real gap still gets a real verdict', () => {
  const r = classifyTrade(137.9, 174.7, { noiseFloor: 0.05 * 317 });
  assert.equal(r.category, 'clear');
  assert.equal(r.winner, 'B');
  assert.ok(!r.belowNoiseFloor);
});

test('without a floor the old ratio behaviour is unchanged', () => {
  assert.equal(classifyTrade(1, 2).category, 'lopsided');
  assert.equal(classifyTrade(0, 0).category, 'even');
});

/* --- constants in points mean different things in different leagues --- */

const levels = (pts) => ({ replacementPoints: pts });

test('the league scale is 1 for a standard PPR league', () => {
  const standard = levels({ RB: 9.4 * 17, WR: 10.2 * 17, TE: 9.3 * 17, QB: 17.1 * 17 });
  const scale = leagueScale(standard, ['QB', 'RB', 'WR', 'TE'], 17);
  assert.ok(Math.abs(scale - 1) < 0.05, `expected about 1, got ${scale}`);
});

test('a higher-scoring league scales constants up, a lower one down', () => {
  const rich = levels({ RB: 13 * 17, WR: 14 * 17, TE: 13 * 17, QB: 24 * 17 });
  const lean = levels({ RB: 6 * 17, WR: 7 * 17, TE: 6 * 17, QB: 13 * 17 });
  assert.ok(leagueScale(rich, ['QB', 'RB', 'WR', 'TE'], 17) > 1.2);
  assert.ok(leagueScale(lean, ['QB', 'RB', 'WR', 'TE'], 17) < 0.85);
});

test('the scale falls back rather than dividing by nothing', () => {
  assert.equal(replacementPerWeek(null, ['RB'], 17), PPR_REPLACEMENT_PER_WEEK);
  assert.equal(replacementPerWeek(levels({}), ['RB'], 0), PPR_REPLACEMENT_PER_WEEK);
  assert.equal(leagueScale(levels({}), [], 17), 1);
});

/* --- a production floor measured, not assumed --- */

const formMap = (ppgs, position) => new Map(
  ppgs.map((ppg, i) => [`${position}${i}`, { position, gamesPlayed: 4, recentPPG: ppg }]),
);

test('the workhorse floor is a percentile of who actually played', () => {
  const lean = formMap([2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 'RB');
  const rich = formMap([2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((x) => x * 1.4), 'RB');
  const a = productionFloors(lean, ['RB']).RB;
  const b = productionFloors(rich, ['RB']).RB;
  assert.ok(b > a * 1.3, `a richer league should demand more: ${a} vs ${b}`);
});

test('too thin a sample falls back to the PPR default instead of a wild percentile', () => {
  const thin = formMap([3, 20], 'RB');
  assert.equal(productionFloors(thin, ['RB']).RB, undefined);
  // and the caller then uses the built-in default
  assert.equal(isWorkhorse({ gamesPlayed: 3, recentPPG: 18, touchesPerGame: 20 }, 'RB', undefined), true);
  assert.equal(isWorkhorse({ gamesPlayed: 3, recentPPG: 4, touchesPerGame: 20 }, 'RB', undefined), false);
});

test('a measured floor overrides the default in both directions', () => {
  const f = { gamesPlayed: 4, recentPPG: 10, touchesPerGame: 20 };
  assert.equal(isWorkhorse(f, 'RB', 9), true, 'clears a low floor');
  assert.equal(isWorkhorse(f, 'RB', 14), false, 'fails a high one');
});

/* --- draft picks, measured rather than assumed --- */

import { pickValue } from '../src/domain/valuation.js';
import { parseItem } from '../src/domain/tradeParser.js';
import PICK_CAL from '../src/data/pickCalibration.json' with { type: 'json' };

test('pick rounds parse past the fifth', () => {
  const eighth = parseItem('a 2027 8th', { defaultPickYear: 2027 });
  assert.equal(eighth.type, 'pick');
  assert.equal(eighth.round, 8);
  assert.equal(eighth.year, 2027);
  assert.equal(parseItem('round 12 pick in 2027').round, 12);
  assert.equal(parseItem('eleventh round pick', { defaultPickYear: 2027 }).round, 11);
  assert.equal(parseItem('Jauan Jennings').type, 'player', 'a name is still a name');
});

test('pick value falls monotonically by round', () => {
  const at = (round) => pickValue({ round, year: 2026 }, { calibration: PICK_CAL, currentSeason: 2026 }).whenUsed;
  assert.ok(at(1) > at(3), `${at(1)} should beat ${at(3)}`);
  assert.ok(at(3) > at(8));
  assert.ok(at(8) > at(16));
  assert.ok(at(1) > 80, 'a first-rounder is a starter, not a lottery ticket');
});

test('a future pick scores nothing this season in a redraft league', () => {
  const r = pickValue({ round: 8, year: 2027 }, { calibration: PICK_CAL, currentSeason: 2026, leagueType: 'redraft' });
  assert.equal(r.value, 0);
  assert.ok(r.whenUsed > 0, 'but it is still worth something when it converts');
  assert.equal(r.seasonsAway, 1);
});

test('keeper and dynasty carry a future pick forward, redraft does not', () => {
  const opts = { calibration: PICK_CAL, currentSeason: 2026 };
  const redraft = pickValue({ round: 1, year: 2027 }, { ...opts, leagueType: 'redraft' }).value;
  const keeper = pickValue({ round: 1, year: 2027 }, { ...opts, leagueType: 'keeper' }).value;
  const dynasty = pickValue({ round: 1, year: 2027 }, { ...opts, leagueType: 'dynasty' }).value;
  assert.equal(redraft, 0);
  assert.ok(dynasty > keeper && keeper > redraft);
});

test("this season's own pick counts in full regardless of league type", () => {
  const r = pickValue({ round: 2, year: 2026 }, { calibration: PICK_CAL, currentSeason: 2026, leagueType: 'redraft' });
  assert.equal(r.value, r.whenUsed);
  assert.equal(r.seasonsAway, 0);
});

test('pick values scale with the league like every other constant', () => {
  const base = pickValue({ round: 1, year: 2026 }, { calibration: PICK_CAL, currentSeason: 2026, scale: 1 }).whenUsed;
  const rich = pickValue({ round: 1, year: 2026 }, { calibration: PICK_CAL, currentSeason: 2026, scale: 1.3 }).whenUsed;
  assert.ok(Math.abs(rich - base * 1.3) < 0.1);
});
