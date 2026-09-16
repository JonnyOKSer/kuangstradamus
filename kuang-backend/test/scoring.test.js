import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreStats, scoringFormatOf, rosLeaguePoints, describeScoring } from '../src/domain/scoring.js';

const PPR = { pass_yd: 0.04, pass_td: 4, rec: 1, rec_yd: 0.1, rush_yd: 0.1, fum_lost: -2 };

test('scoreStats multiplies stats by league weights and ignores unknown keys', () => {
  const stats = { pass_yd: 300, pass_td: 2, rec: 5, rec_yd: 50, pts_ppr: 999, adp_ppr: 12 };
  assert.equal(scoreStats(stats, PPR), 12 + 8 + 5 + 5);
});

test('custom rules change the answer (TE premium, 6pt pass TD)', () => {
  const stats = { rec: 6, rec_yd: 60, bonus_rec_te: 6, pass_td: 3 };
  const tep = { ...PPR, bonus_rec_te: 0.5, pass_td: 6 };
  assert.equal(scoreStats(stats, PPR), 6 + 6 + 12);
  assert.equal(scoreStats(stats, tep), 6 + 6 + 3 + 18);
});

test('scoring format detection from rec weight', () => {
  assert.equal(scoringFormatOf({ rec: 1 }), 'ppr');
  assert.equal(scoringFormatOf({ rec: 0.5 }), 'half_ppr');
  assert.equal(scoringFormatOf({ rec: 0 }), 'std');
});

test('rosLeaguePoints sums league-scored weeks', () => {
  const entry = { byWeekStats: { 3: { rec: 5, rec_yd: 50 }, 4: { rec: 3, rec_yd: 30 } } };
  const r = rosLeaguePoints(entry, PPR);
  assert.equal(r.total, 10 + 6);
  assert.deepEqual(r.byWeek, { 3: 10, 4: 6 });
});

test('describeScoring surfaces distinctive rules', () => {
  const d = describeScoring({ rec: 1, bonus_rec_te: 0.5, pass_td: 6 });
  assert.match(d, /PPR/);
  assert.match(d, /TE premium/);
  assert.match(d, /6pt pass TD/);
});
