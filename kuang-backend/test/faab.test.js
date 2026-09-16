import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectBidHistory, estimateFaab, isFaabLeague } from '../src/domain/faab.js';

test('only a FAAB league gets an estimate', () => {
  assert.equal(isFaabLeague({ waiverType: 2, waiverBudget: 100 }), true);
  assert.equal(isFaabLeague({ waiverType: 0, waiverBudget: 100 }), false, 'rolling priority has no bids');
  assert.equal(isFaabLeague({ waiverType: 1, waiverBudget: 100 }), false, 'reverse standings has none either');
  assert.equal(isFaabLeague({ waiverType: 2, waiverBudget: 0 }), false);
});

test('bid history reads winners and losers, and ignores priority claims', () => {
  const txns = {
    1: [
      { type: 'waiver', status: 'complete', settings: { waiver_bid: 12 }, adds: { p1: 1 } },
      { type: 'waiver', status: 'failed', settings: { waiver_bid: 8 }, adds: { p1: 2 } },
      { type: 'waiver', status: 'complete', settings: { seq: 0 }, adds: { p2: 3 } },
      { type: 'free_agent', status: 'complete', adds: { p3: 1 } },
    ],
  };
  const h = collectBidHistory(txns, (id) => ({ p1: 50, p2: 10, p3: 5 }[id] ?? null));
  assert.equal(h.length, 2, 'a claim with no bid is not a FAAB data point');
  assert.deepEqual(h.map((x) => [x.bid, x.won]), [[12, true], [8, false]]);
});

test('too little history says so rather than guessing', () => {
  const r = estimateFaab({ valuePct: 0.9, history: [{ bid: 5, won: true, value: 10 }], budget: 100 });
  assert.equal(r.low, null);
  assert.equal(r.basis, 'insufficient-history');
  assert.equal(r.confidence, 'none');
});

const history = [1, 1, 1, 2, 4, 6, 6, 8, 13, 15, 18].map((bid, i) => ({ bid, won: true, value: i }));

test('a better target is priced higher than a worse one', () => {
  const top = estimateFaab({ valuePct: 1, history, budget: 200 });
  const mid = estimateFaab({ valuePct: 0.5, history, budget: 200 });
  const low = estimateFaab({ valuePct: 0, history, budget: 200 });
  assert.ok(top.median > mid.median, `${top.median} should beat ${mid.median}`);
  assert.ok(mid.median > low.median, `${mid.median} should beat ${low.median}`);
  assert.ok(top.high <= 18, 'never above what the league has actually paid');
  assert.ok(low.low >= 1, 'a claim still costs at least a dollar');
});

test('the estimate never exceeds what the manager has left', () => {
  const r = estimateFaab({ valuePct: 1, history, budget: 200, remaining: 5 });
  assert.ok(r.high <= 5, `expected a cap at 5, got ${r.high}`);
  assert.equal(r.cappedByBudget, true);
});

test('a losing bid raises the floor for a comparable player', () => {
  const withLoss = [...history, { bid: 25, won: false, value: 10 }];
  const plain = estimateFaab({ valuePct: 0.9, history, budget: 200 });
  const raised = estimateFaab({ valuePct: 0.9, history: withLoss, budget: 200 });
  assert.ok(raised.low > plain.low, 'a $25 bid that lost means $25 was not enough');
});

test('confidence follows how much the league has actually bid', () => {
  assert.equal(estimateFaab({ valuePct: 0.5, history, budget: 200 }).confidence, 'medium');
  const many = Array.from({ length: 20 }, (_, i) => ({ bid: i + 1, won: true, value: i }));
  assert.equal(estimateFaab({ valuePct: 0.5, history: many, budget: 200 }).confidence, 'high');
});
