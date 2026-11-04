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

test('outcomes carry both measures and the third of the round', () => {
  const d = normalizeDraft({ draft_id: 'd', type: 'snake', season: '2025', settings: { teams: 12 } }, [{ ...pick(1), draft_slot: 2 }, { ...pick(2), draft_slot: 11 }]);
  const out = draftOutcomes([d], (id) => ({ season: id === '101' ? 50 : -10, now: 20 }));
  assert.equal(out[0].third, 'early');
  assert.equal(out[1].third, 'late');
  assert.equal(out[0].seasonValue, 50);
  assert.equal(out[1].nowValue, 20);
  assert.equal(thirdOf(5, 12), 'mid');
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
  assert.match(pv.league.note, /In this league, 1st-round picks produced 80 value on average across 12 picks/);
  const none = pickValue({ round: 1, year: 2027 }, { currentSeason: 2026, leagueType: 'redraft', curve, teams: 12 });
  assert.equal(none.value, 0, 'a future pick scores nothing this season in a redraft league');
  assert.match(describePickBasis(3, { basis: 'prior' }, curve), /no 3rd-round picks on record/);
});

test('a round whose typical pick is below replacement is worth zero, not negative', () => {
  const outs = Array.from({ length: 20 }, (_, i) => ({ round: 6, slot: (i % 10) + 1, third: thirdOf((i % 10) + 1, 10), season: 2025, seasonValue: -30, nowValue: 0, draftType: 'auction' }));
  const curve = buildPickCurve(outs, { prior: { rounds: { 6: { value: 10 } } }, scale: 1, maxRound: 6 });
  assert.equal(curve.auction, true);
  const pv = pickValue({ round: 6, year: 2026 }, { currentSeason: 2026, leagueType: 'keeper', curve, teams: 10 });
  assert.equal(pv.whenUsed, 0);
  assert.equal(pv.value, 0);
  assert.match(pv.league.note, /6th-tier auction buys/);
  assert.match(pv.league.note, /counted at zero/);
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
