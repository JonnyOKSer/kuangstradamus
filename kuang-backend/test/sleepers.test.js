import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findHandcuffSleepers, isWorkhorse, isRising } from '../src/domain/sleepers.js';
import { activePositions } from '../src/domain/valuation.js';

const player = (id, name, position, team, depthChartOrder) => ({ id, name, position, team, depthChartOrder, active: true, searchRank: Number(id), injuryStatus: null });
const form = (o) => ({ gamesPlayed: 4, recentPPG: 0, touchesPerGame: 0, targetsPerGame: 0, snapShareLast: 0, snapShareTrend: 0, touchesTrend: 0, trend: 0, ...o });

test('isWorkhorse keys off real volume, not name recognition', () => {
  assert.equal(isWorkhorse(form({ recentPPG: 18, touchesPerGame: 20 }), 'RB'), true);
  assert.equal(isWorkhorse(form({ recentPPG: 18, touchesPerGame: 4 }), 'RB'), false, 'big points on tiny volume is not a workhorse');
  assert.equal(isWorkhorse(form({ recentPPG: 3, touchesPerGame: 20 }), 'RB'), false, 'volume without production is not either');
});

test('isRising spots climbing usage', () => {
  assert.equal(isRising(form({ snapShareTrend: 0.12 })), true);
  assert.equal(isRising(form({ touchesTrend: 3 })), true);
  assert.equal(isRising(form()), false);
});

test('finds the free-agent backup behind a workhorse and values what he inherits', () => {
  const players = new Map([
    ['1', player('1', 'Star Back', 'RB', 'KC', 1)],
    ['2', player('2', 'Backup Back', 'RB', 'KC', 2)],
    ['3', player('3', 'Third Back', 'RB', 'KC', 3)],
  ]);
  const forms = new Map([
    ['1', form({ recentPPG: 20, touchesPerGame: 22, snapShareLast: 0.85 })],
    ['2', form({ recentPPG: 3, touchesPerGame: 4, snapShareLast: 0.3 })],
    ['3', form({ recentPPG: 1, touchesPerGame: 1, snapShareLast: 0.1 })],
  ]);
  const leaguePts = new Map([['2', { total: 60, byWeek: {} }], ['3', { total: 20, byWeek: {} }]]);

  const out = findHandcuffSleepers({
    players, form: forms, leaguePts,
    rostered: new Set(['1']), // the starter is owned, the backups are not
    activePositions: ['QB', 'RB', 'WR', 'TE'],
  });

  assert.ok(out.length >= 1);
  const top = out[0];
  assert.equal(top.name, 'Backup Back');
  assert.equal(top.blocks.name, 'Star Back');
  assert.equal(top.contingentPointsPerGame, 14, '70% of a 20 ppg back');
  assert.match(top.why, /behind Star Back/);
});

test('a rostered backup is not offered as a waiver sleeper', () => {
  const players = new Map([
    ['1', player('1', 'Star Back', 'RB', 'KC', 1)],
    ['2', player('2', 'Backup Back', 'RB', 'KC', 2)],
  ]);
  const forms = new Map([
    ['1', form({ recentPPG: 20, touchesPerGame: 22, snapShareLast: 0.85 })],
    ['2', form({ recentPPG: 3, touchesPerGame: 4, snapShareLast: 0.3 })],
  ]);
  const out = findHandcuffSleepers({
    players, form: forms, leaguePts: new Map(),
    rostered: new Set(['1', '2']),
    activePositions: ['RB'],
  });
  assert.equal(out.length, 0);
});

test('no workhorse in the room means no handcuff to chase', () => {
  const players = new Map([
    ['1', player('1', 'Committee A', 'RB', 'NYJ', 1)],
    ['2', player('2', 'Committee B', 'RB', 'NYJ', 2)],
  ]);
  const forms = new Map([
    ['1', form({ recentPPG: 6, touchesPerGame: 8, snapShareLast: 0.45 })],
    ['2', form({ recentPPG: 5, touchesPerGame: 7, snapShareLast: 0.4 })],
  ]);
  const out = findHandcuffSleepers({ players, form: forms, leaguePts: new Map(), rostered: new Set(), activePositions: ['RB'] });
  assert.equal(out.length, 0);
});

test('activePositions hides K and DEF when the league does not start them', () => {
  assert.deepEqual(activePositions(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN']), ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
  assert.deepEqual(activePositions(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'BN']), ['QB', 'RB', 'WR', 'TE']);
  assert.deepEqual(activePositions(['QB', 'RB', 'WR', 'TE', 'FLEX', 'DEF', 'BN']), ['QB', 'RB', 'WR', 'TE', 'DEF']);
  assert.ok(!activePositions(['QB', 'RB', 'WR', 'TE', 'SUPER_FLEX', 'BN']).includes('K'));
});
