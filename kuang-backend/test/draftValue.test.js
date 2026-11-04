import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDraft, draftOutcomes, buildPickCurve, curveValue, thirdOf, describePickBasis, SHRINK_ROUND } from '../src/domain/draftValue.js';
import { pickValue } from '../src/domain/valuation.js';
import { parseItem } from '../src/domain/tradeParser.js';

const pick = (over, extra = {}) => ({ player_id: String(100 + over), pick_no: over, round: Math.ceil(over / 4), draft_slot: ((over - 1) % 4) + 1, roster_id: ((over - 1) % 4) + 1, metadata: { first_name: 'P', last_name: String(over), position: 'RB' }, ...extra });

test('snake drafts keep Sleeper rounds and slots and drop keeper slots', () => {
  const picks = [pick(1, { is_keeper: true }), pick(2), pick(3), pick(4), pick(5), pick(6)];
  const d = normalizeDraft({ draft_id: 'd', type: 'snake', season: '2025', settings: { teams: 4 } }, picks);
  assert.equal(d.teams, 4);
  assert.equal(d.keepers, 1);
  assert.equal(d.picks.length, 5);
  assert.deepEqual(d.picks.map((p) => [p.round, p.slot]), [[1, 2], [1, 3], [1, 4], [2, 1], [2, 2]]);
});

test('auction drafts are tiered by price, one pick per team per tier, keepers excluded', () => {
  const buys = [
    pick(1, { metadata: { amount: '12', position: 'WR' } }),
    pick(2, { metadata: { amount: '84', position: 'RB' } }),
    pick(3, { metadata: { amount: '3', position: 'TE' } }),
    pick(4, { metadata: { amount: '60', position: 'RB' } }),
    pick(5, { metadata: { amount: '99', position: 'QB' }, is_keeper: true }),
    pick(6, { metadata: { amount: '40', position: 'WR' } }),
  ];
  const d = normalizeDraft({ draft_id: 'a', type: 'auction', season: '2026', settings: { teams: 2 } }, buys);
  assert.equal(d.type, 'auction');
  assert.equal(d.keepers, 1);
  assert.deepEqual(d.picks.map((p) => [p.amount, p.round, p.slot]), [[84, 1, 1], [60, 1, 2], [40, 2, 1], [12, 2, 2], [3, 3, 1]]);
});

test('outcomes carry both measures, the third of the round, and whether the pick was a complete bust', () => {
  const d = normalizeDraft({ draft_id: 'd', type: 'snake', season: '2025', settings: { teams: 12 } }, [{ ...pick(1), draft_slot: 2 }, { ...pick(2), draft_slot: 11 }]);
  const out = draftOutcomes([d], (id) => (id === '101' ? { season: 50, now: 20, seasonPts: 150, replacement: 100 } : { season: -97, now: 20, seasonPts: 3, replacement: 100 }));
  assert.equal(out[0].third, 'early');
  assert.equal(out[1].third, 'late');
  assert.equal(out[0].seasonValue, 50);
  assert.equal(out[0].bust, false);
  assert.equal(out[1].bust, true, 'three points against a replacement of 100 is a complete bust');
  assert.equal(thirdOf(5, 12), 'mid');
});

test('the played average throws complete busts out; the option value still counts them at zero', () => {
  const outs = [
    ...Array.from({ length: 6 }, (_, i) => ({ round: 2, slot: i + 1, third: thirdOf(i + 1, 10), season: 2025, seasonValue: 30, nowValue: 0, bust: false })),
    ...Array.from({ length: 2 }, (_, i) => ({ round: 2, slot: 7 + i, third: thirdOf(7 + i, 10), season: 2025, seasonValue: -90, nowValue: 0, bust: true })),
  ];
  const c = buildPickCurve(outs, { prior: { rounds: { 2: { value: 30 } } }, scale: 1, maxRound: 2 });
  assert.equal(c.rounds[2].busts, 2);
  assert.equal(c.rounds[2].playedMean, 30);
  assert.equal(c.rounds[2].mean, 0);
  assert.equal(c.rounds[2].optionMean, 22.5); // 6 × 30 / 8
  assert.match(describePickBasis(2, curveValue(c, { round: 2 }), c), /Throwing out the 2 complete busts/);
});

const PRIOR = { rounds: { 1: { value: 100, usefulRate: 0.9 }, 2: { value: 60, usefulRate: 0.7 } } };

test('a small league sample is shrunk toward the prior; a large one stands on its own', () => {
  const small = Array.from({ length: 4 }, (_, i) => ({ round: 1, slot: 1, third: 'early', season: 2025, seasonValue: 40, nowValue: 40 }));
  const c = buildPickCurve(small, { prior: PRIOR, scale: 1, maxRound: 2 });
  assert.equal(c.rounds[1].n, 4);
  assert.equal(c.rounds[1].mean, 40);
  assert.equal(c.rounds[1].value, Number(((4 * 40 + SHRINK_ROUND * 100) / (4 + SHRINK_ROUND)).toFixed(1)));
  assert.equal(c.rounds[1].basis, 'blend');
  assert.equal(c.rounds[2].basis, 'prior');
  assert.equal(c.rounds[2].value, 60);

  const big = Array.from({ length: 24 }, (_, i) => ({ round: 1, slot: (i % 12) + 1, third: thirdOf((i % 12) + 1, 12), season: 2024 + (i % 2), seasonValue: i % 2 ? 30 : 50, nowValue: 0 }));
  const c2 = buildPickCurve(big, { prior: PRIOR, scale: 1, maxRound: 1 });
  assert.equal(c2.rounds[1].basis, 'league');
  assert.equal(c2.rounds[1].hitRate, 1);
  assert.deepEqual(c2.seasons, [2024, 2025]);
  // n = 24 at a mean of 40 against a prior of 100: the prior still counts as eight picks
  assert.equal(c2.rounds[1].value, Number(((24 * 40 + SHRINK_ROUND * 100) / (24 + SHRINK_ROUND)).toFixed(1)));
});

test('scale converts the PPR prior into the league\'s own points', () => {
  const c = buildPickCurve([], { prior: PRIOR, scale: 1.3, maxRound: 1 });
  assert.equal(c.rounds[1].value, 130);
});

test('thirds within a round pull the value up or down when there is evidence', () => {
  const outs = [
    ...Array.from({ length: 8 }, () => ({ round: 1, slot: 1, third: 'early', season: 2025, seasonValue: 120, nowValue: 0 })),
    ...Array.from({ length: 8 }, () => ({ round: 1, slot: 12, third: 'late', season: 2025, seasonValue: 20, nowValue: 0 })),
  ];
  const c = buildPickCurve(outs, { prior: PRIOR, scale: 1, maxRound: 1 });
  const early = curveValue(c, { round: 1, third: 'early' });
  const late = curveValue(c, { round: 1, slot: 11, teams: 12 });
  assert.ok(early.value > c.rounds[1].value && late.value < c.rounds[1].value);
  assert.equal(late.third, 'late');
  assert.equal(curveValue(c, { round: 9 }), null);
});

test('pickValue uses the league curve and explains itself', () => {
  const outs = Array.from({ length: 12 }, (_, i) => ({ round: 1, slot: i + 1, third: thirdOf(i + 1, 12), season: 2025, seasonValue: 80, nowValue: 0 }));
  const curve = buildPickCurve(outs, { prior: PRIOR, scale: 1, maxRound: 1 });
  const pv = pickValue({ round: 1, year: 2027 }, { currentSeason: 2026, leagueType: 'dynasty', curve, teams: 12 });
  assert.equal(pv.whenUsed, 88); // (12 × 80 + 8 × 100) / 20
  assert.equal(pv.basis, 'league-league');
  assert.equal(pv.seasonsAway, 1);
  assert.ok(pv.value < pv.whenUsed && pv.value > 0);
  assert.match(pv.league.note, /In this league, 1st-round picks have been worth 80 on average across 12 picks/);
  const none = pickValue({ round: 1, year: 2027 }, { currentSeason: 2026, leagueType: 'redraft', curve, teams: 12 });
  assert.equal(none.value, 0, 'a future pick scores nothing this season in a redraft league');
  assert.match(describePickBasis(3, { basis: 'prior' }, curve), /no 3rd-round picks on record/);
});

test('a pick is an option: busts count as zero, hits count in full', () => {
  // half the picks bust badly, half return 40: the raw mean is -30, the option value is 20
  const outs = Array.from({ length: 20 }, (_, i) => ({ round: 6, slot: (i % 10) + 1, third: thirdOf((i % 10) + 1, 10), season: 2025, seasonValue: i % 2 ? 40 : -100, nowValue: 0, draftType: 'auction' }));
  const curve = buildPickCurve(outs, { prior: { rounds: { 6: { value: 10 } } }, scale: 1, maxRound: 6 });
  assert.equal(curve.auction, true);
  assert.equal(curve.rounds[6].mean, -30);
  assert.equal(curve.rounds[6].optionMean, 20);
  assert.equal(curve.rounds[6].value, Number(((20 * 20 + SHRINK_ROUND * 10) / 28).toFixed(1)));
  const pv = pickValue({ round: 6, year: 2026 }, { currentSeason: 2026, leagueType: 'keeper', curve, teams: 10 });
  assert.equal(pv.whenUsed, curve.rounds[6].value); // no slot given: the whole round
  assert.match(pv.league.note, /6th-tier auction buys/);
  assert.match(pv.league.note, /Valued as an option: hits in full, busts at zero/);
});

test('parser understands 1.05 notation and early/mid/late', () => {
  assert.deepEqual(parseItem('2027 1.05'), { type: 'pick', year: 2027, round: 1, slot: 5, name: '2027 pick 1.05' });
  assert.equal(parseItem('1.12 in 2028').year, 2028);
  const e = parseItem('early 2nd', { defaultPickYear: 2027 });
  assert.equal(e.round, 2);
  assert.equal(e.third, 'early');
  assert.equal(e.name, '2027 early 2nd round pick');
  assert.equal(parseItem('a 2027 1st round rookie pick').round, 1);
  assert.equal(parseItem('my 2027 1st').round, 1);
  assert.equal(parseItem('Jonathan Taylor').type, 'player');
  assert.equal(parseItem('8th').type, 'pick');
});
