import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeLineup, diffLineups } from '../src/domain/lineup.js';

const ROSTER = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN'];
const P = (id, position, points, extra = {}) => ({ id, name: id, position, fantasyPositions: [position], points, ...extra });

const players = [
  P('QB1', 'QB', 20),
  P('A', 'RB', 15), P('B', 'RB', 12), P('C', 'RB', 8),
  P('D', 'WR', 14), P('E', 'WR', 10), P('F', 'WR', 9),
  P('G', 'TE', 11), P('H', 'TE', 6),
  P('K1', 'K', 8), P('DEF1', 'DEF', 7),
];

test('optimal lineup fills dedicated slots and picks the best flex', () => {
  const r = optimizeLineup({ rosterPositions: ROSTER, players });
  assert.equal(r.total, 106);
  const flex = r.starters.find((s) => s.slot === 'FLEX');
  assert.equal(flex.player.id, 'F');
  assert.deepEqual(r.unfilled, []);
  assert.equal(r.bench.length, 2);
});

test('excludes players who are Out or on bye', () => {
  const injured = players.map((p) => (p.id === 'A' ? { ...p, injuryStatus: 'Out' } : p.id === 'F' ? { ...p, onBye: true } : p));
  const r = optimizeLineup({ rosterPositions: ROSTER, players: injured });
  const ids = r.starters.map((s) => s.player?.id);
  assert.ok(!ids.includes('A'));
  assert.ok(!ids.includes('F'));
  // both remaining RBs are needed for the RB slots, so FLEX falls to the best leftover (TE H)
  assert.equal(r.starters.find((s) => s.slot === 'FLEX').player.id, 'H');
  assert.equal(r.total, 96);
});

test('reports unfilled slots when nobody is eligible', () => {
  const noK = players.filter((p) => p.position !== 'K');
  const r = optimizeLineup({ rosterPositions: ROSTER, players: noK });
  assert.deepEqual(r.unfilled, ['K']);
});

test('a TE can be better used in FLEX than a weak WR', () => {
  const tePremium = [P('QB1', 'QB', 20), P('A', 'RB', 15), P('B', 'RB', 12), P('D', 'WR', 14), P('E', 'WR', 10), P('G', 'TE', 11), P('H', 'TE', 10.5), P('F', 'WR', 3), P('K1', 'K', 8), P('DEF1', 'DEF', 7)];
  const r = optimizeLineup({ rosterPositions: ROSTER, players: tePremium });
  assert.equal(r.starters.find((s) => s.slot === 'FLEX').player.id, 'H');
});

test('diffLineups describes swaps and the gain', () => {
  const optimal = optimizeLineup({ rosterPositions: ROSTER, players });
  const byId = new Map(players.map((p) => [p.id, p]));
  const current = ['QB1', 'A', 'B', 'D', 'E', 'G', 'C', 'K1', 'DEF1']; // C in FLEX instead of F
  const d = diffLineups(current, optimal, byId);
  assert.equal(d.gain, 1);
  assert.deepEqual(d.moves.map((m) => `${m.action}:${m.playerId}`).sort(), ['bench:C', 'start:F']);
});
