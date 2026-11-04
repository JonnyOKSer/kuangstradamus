import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageFactor, nextSeasonGross, keepProbability, keepProbabilityOnTeam, detectFormat, combine, describeFormat, NEXT_SEASON_WEIGHT, VORP_REGRESSION } from '../src/domain/horizon.js';
import { pickValue } from '../src/domain/valuation.js';

test('age factors decline with age and reward youth, by position', () => {
  assert.ok(ageFactor('RB', 24) > ageFactor('RB', 27));
  assert.ok(ageFactor('RB', 27) > ageFactor('RB', 30));
  assert.ok(ageFactor('WR', 29) > ageFactor('WR', 33));
  assert.ok(ageFactor('QB', 30) > ageFactor('QB', 38));
  assert.ok(ageFactor('WR', 23, 1) > ageFactor('WR', 23, 6), 'a second-year player gets the growth bump');
  assert.equal(ageFactor('K', 35), 1);
  assert.equal(ageFactor('RB', null), 1);
});

test('next-season gross regresses toward the mean and never goes below zero', () => {
  assert.equal(nextSeasonGross({ fullSeasonVorp: 100, position: 'WR', age: 25 }), Number((100 * VORP_REGRESSION * ageFactor('WR', 25)).toFixed(2)));
  assert.equal(nextSeasonGross({ fullSeasonVorp: -40, position: 'RB', age: 24 }), 0);
  assert.equal(nextSeasonGross({ fullSeasonVorp: null, position: 'RB' }), null);
});

test('keep probability follows the keeper slots and the format', () => {
  assert.equal(keepProbability({ rank: 1, slots: 14, format: 'keeper' }) > 0.95, true);
  assert.equal(keepProbability({ rank: 30, slots: 14, format: 'keeper' }) < 0.15, true);
  assert.equal(keepProbability({ rank: 60, slots: 14, format: 'keeper' }) < 0.01, true);
  // on a specific roster with one keeper slot, its best player is nearly certain and its third is not
  assert.ok(keepProbabilityOnTeam({ teamRank: 1, keepers: 1, format: 'keeper' }) > 0.6);
  assert.ok(keepProbabilityOnTeam({ teamRank: 3, keepers: 1, format: 'keeper' }) < 0.15);
  assert.equal(keepProbabilityOnTeam({ teamRank: 9, keepers: 1, format: 'dynasty' }), 1);
  const edge = keepProbability({ rank: 14, slots: 14, format: 'keeper' });
  assert.ok(edge > 0.4 && edge < 0.75, `at the cutoff it is a coin flip, got ${edge}`);
  assert.equal(keepProbability({ rank: 500, slots: 14, format: 'dynasty' }), 1);
  assert.equal(keepProbability({ rank: 1, slots: 14, format: 'redraft' }), 0);
  assert.equal(keepProbability({ rank: 1, slots: 0, format: 'keeper' }), 0);
});

test('format detection: declared settings win when rosters agree, and keepers re-drafted at a cost are noticed', () => {
  // Uncanny Fam: declared keeper, max 1, ~1.5 carried per team of which ~0.1 held outside the draft
  const f = detectFormat({ declaredType: 1, maxKeepers: 1, carryPerTeam: 1.5, keptPerTeam: 0.1, rosterSize: 16, teams: 14 });
  assert.equal(f.detected, 'keeper');
  assert.equal(f.basis, 'declared');
  assert.equal(f.keepersPerTeam, 1);
  assert.equal(f.mechanism, 'drafted');
  assert.equal(f.nextSeasonWeight, NEXT_SEASON_WEIGHT.keeper);
  assert.match(describeFormat(f), /Keeper league · 1 keeper per team · keepers are re-selected in the draft at a round cost/);
});

test('format detection: rosters override a wrong declaration', () => {
  const dyn = detectFormat({ declaredType: 1, maxKeepers: 0, carryPerTeam: 13, keptPerTeam: 12, rosterSize: 16, teams: 12 });
  assert.equal(dyn.detected, 'dynasty');
  assert.equal(dyn.basis, 'observed');
  assert.equal(dyn.keepersPerTeam, 16);

  const undeclared = detectFormat({ declaredType: 0, maxKeepers: 0, carryPerTeam: 3.5, keptPerTeam: 3, rosterSize: 16, teams: 12 });
  assert.equal(undeclared.detected, 'keeper');
  assert.equal(undeclared.basis, 'observed');
  assert.equal(undeclared.keepersPerTeam, 2); // 3.5 carried minus ~1.3 by chance
  assert.equal(undeclared.mechanism, 'held');

  const notDynasty = detectFormat({ declaredType: 2, maxKeepers: 0, carryPerTeam: 2, keptPerTeam: 2, rosterSize: 16, teams: 12 });
  assert.equal(notDynasty.detected, 'keeper');

  const redraft = detectFormat({ declaredType: 0, maxKeepers: 0, carryPerTeam: 1.2, keptPerTeam: 0, rosterSize: 16, teams: 12 });
  assert.equal(redraft.detected, 'redraft');
  assert.equal(redraft.nextSeasonWeight, 0);
});

test('combine weights next season by the format', () => {
  assert.equal(combine(40, 50, 0.6), 70);
  assert.equal(combine(40, 50, 0), 40);
  assert.equal(combine(null, 50, 0.85), 42.5);
});

test('a pick has two horizons: nothing this season when it is a year out, its round value next season', () => {
  const curve = { measure: 'season', seasons: [2025, 2026], rounds: { 1: { n: 26, value: 157.3, mean: 150, optionMean: 167, hitRate: 0.85, basis: 'league', thirds: {} } } };
  const next = pickValue({ round: 1, year: 2027 }, { currentSeason: 2026, leagueType: 'keeper', curve, teams: 14, nextSeasonWeight: 0.6 });
  assert.equal(next.h0, 0);
  assert.equal(next.h1, 157.3);
  assert.equal(next.value, Number((0.6 * 157.3).toFixed(2)));
  const now = pickValue({ round: 1, year: 2026 }, { currentSeason: 2026, leagueType: 'keeper', curve, teams: 14, nextSeasonWeight: 0.6 });
  assert.equal(now.h0, 157.3);
  assert.equal(now.h1, 0);
  const far = pickValue({ round: 1, year: 2028 }, { currentSeason: 2026, leagueType: 'dynasty', curve, teams: 14, nextSeasonWeight: 0.85 });
  assert.equal(far.h1, Number((157.3 * 0.85).toFixed(2)));
  const redraft = pickValue({ round: 1, year: 2027 }, { currentSeason: 2026, leagueType: 'redraft', curve, teams: 14 });
  assert.equal(redraft.value, 0);
});
