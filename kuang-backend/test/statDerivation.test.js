import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStats, auditScoring, DERIVABLE_KEYS } from '../src/domain/statDerivation.js';
import { scoreStats } from '../src/domain/scoring.js';

test('first-down bonuses are exact arithmetic, not a guess', () => {
  const rb = deriveStats({ rush_fd: 6.4, rec_fd: 5.6 }, 'RB');
  assert.equal(Number(rb.bonus_fd_rb.toFixed(2)), 12);
  const qb = deriveStats({ pass_fd: 24.9, rush_fd: 4 }, 'QB');
  assert.equal(Number(qb.bonus_fd_qb.toFixed(2)), 28.9);
});

test('missed field goals are summed from their buckets', () => {
  const k = deriveStats({ fgmiss_30_39: 0.06, fgmiss_40_49: 0.06, fgmiss_50p: 0.19 }, 'K');
  assert.equal(Number(k.fgmiss.toFixed(2)), 0.31);
});

test('a bigger projection means a bigger chance of clearing the milestone', () => {
  const small = deriveStats({ rush_yd: 30 }, 'RB').bonus_rush_yd_100;
  const mid = deriveStats({ rush_yd: 70 }, 'RB').bonus_rush_yd_100;
  const big = deriveStats({ rush_yd: 95 }, 'RB').bonus_rush_yd_100;
  assert.ok(small < mid && mid < big, `expected monotonic, got ${small} ${mid} ${big}`);
  assert.ok(big > 0 && big < 1, 'a probability, not a certainty');
});

test('defence tiers become a distribution that sums to about one', () => {
  const d = deriveStats({ pts_allow: 16.25, pts_allow_14_20: 1 }, 'DEF');
  const tiers = ['pts_allow_0', 'pts_allow_1_6', 'pts_allow_7_13', 'pts_allow_14_20', 'pts_allow_21_27', 'pts_allow_28_34', 'pts_allow_35p'];
  const total = tiers.reduce((s, k) => s + (d[k] ?? 0), 0);
  assert.ok(Math.abs(total - 1) < 0.05, `tiers should sum to ~1, got ${total}`);
  assert.ok(d.pts_allow_14_20 < 1, "Sleeper's hard indicator must be replaced by a probability");
  assert.ok(d.pts_allow_1_6 > 0, 'a stingy outcome should carry some weight');
});

test('a stingier projection shifts weight toward the low-points tiers', () => {
  const stingy = deriveStats({ pts_allow: 14 }, 'DEF');
  const leaky = deriveStats({ pts_allow: 28 }, 'DEF');
  assert.ok(stingy.pts_allow_1_6 > leaky.pts_allow_1_6);
  assert.ok(leaky.pts_allow_35p > stingy.pts_allow_35p);
});

test('derivation never overwrites a real projected value', () => {
  const d = deriveStats({ rush_yd: 95, bonus_rush_yd_100: 0.42, rush_fd: 5, rec_fd: 5, bonus_fd_rb: 99 }, 'RB');
  assert.equal(d.bonus_rush_yd_100, 0.42);
  assert.equal(d.bonus_fd_rb, 99);
});

test('derivation does not mutate the input line', () => {
  const input = { rush_yd: 80, rush_fd: 4, rec_fd: 3 };
  const copy = { ...input };
  deriveStats(input, 'RB');
  assert.deepEqual(input, copy);
});

test('a bonus rule that used to score nothing now scores something', () => {
  const scoring = { rush_yd: 0.1, bonus_rush_yd_100: 3 };
  const line = { rush_yd: 85 };
  const before = scoreStats(line, scoring);
  const after = scoreStats(deriveStats(line, 'RB'), scoring);
  assert.equal(Number(before.toFixed(1)), 8.5, 'the bonus was silently worth zero');
  assert.ok(after > before, 'and now carries its expected value');
  assert.ok(after < before + 3, 'but only its expected value, not the full bonus');
});

test('the audit names the rules that still cannot be forecast', () => {
  const scoring = { rec: 1, bonus_rush_yd_100: 3, def_st_td: 6, st_ff: 1, unused: 0 };
  const projected = new Set(['rec']);
  const a = auditScoring(scoring, projected);
  assert.equal(a.totalRules, 4, 'a zero-weight rule is not a rule');
  const keys = a.unscored.map((u) => u.key);
  assert.ok(!keys.includes('rec'), 'projected directly');
  assert.ok(!keys.includes('bonus_rush_yd_100'), 'derivable');
  assert.deepEqual(keys, ['def_st_td', 'st_ff'], 'sorted by how much they are worth');
  assert.ok(DERIVABLE_KEYS.has('bonus_rush_yd_100'));
});
