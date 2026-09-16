import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allPlay, standings, lineupEfficiency, playoffOdds, positionalStrength } from '../src/domain/season.js';
import { computeReplacementLevels } from '../src/domain/valuation.js';

// 4 teams, 2 scored weeks, tiny rosters: QB + RB + BN
const players = new Map([
  ['q1', { name: 'QB One', position: 'QB', fantasyPositions: ['QB'], team: 'A', active: true }],
  ['q2', { name: 'QB Two', position: 'QB', fantasyPositions: ['QB'], team: 'B', active: true }],
  ['q3', { name: 'QB Three', position: 'QB', fantasyPositions: ['QB'], team: 'C', active: true }],
  ['q4', { name: 'QB Four', position: 'QB', fantasyPositions: ['QB'], team: 'D', active: true }],
  ['r1', { name: 'RB One', position: 'RB', fantasyPositions: ['RB'], team: 'A', active: true }],
  ['r2', { name: 'RB Two', position: 'RB', fantasyPositions: ['RB'], team: 'B', active: true }],
  ['r3', { name: 'RB Three', position: 'RB', fantasyPositions: ['RB'], team: 'C', active: true }],
  ['r4', { name: 'RB Four', position: 'RB', fantasyPositions: ['RB'], team: 'D', active: true }],
  ['b1', { name: 'Bench One', position: 'RB', fantasyPositions: ['RB'], team: 'A', active: true }],
]);

const team = (rosterId, ids, starters, wins, losses, pf) => ({ rosterId, teamName: `T${rosterId}`, players: ids, starters, reserve: [], taxi: [], record: { wins, losses, ties: 0, pointsFor: pf, pointsAgainst: 0 } });
const m = (roster_id, matchup_id, points, starters, players_points) => ({ roster_id, matchup_id, points, starters, players: Object.keys(players_points), players_points });

const imported = {
  league: { id: '1', season: '2026', rosterPositions: ['QB', 'RB', 'BN'], totalRosters: 4, playoffWeekStart: 3, playoffTeams: 2 },
  state: { season: '2026', week: 3 },
  currentWeek: 3,
  lastScoredWeek: 2,
  teams: [
    team(1, ['q1', 'r1', 'b1'], ['q1', 'r1'], 2, 0, 220),
    team(2, ['q2', 'r2'], ['q2', 'r2'], 1, 1, 190),
    team(3, ['q3', 'r3'], ['q3', 'r3'], 1, 1, 180),
    team(4, ['q4', 'r4'], ['q4', 'r4'], 0, 2, 150),
  ],
  matchupsByWeek: {
    1: [
      m(1, 1, 110, ['q1', 'r1'], { q1: 20, r1: 90, b1: 5 }), m(2, 1, 100, ['q2', 'r2'], { q2: 50, r2: 50 }),
      m(3, 2, 90, ['q3', 'r3'], { q3: 45, r3: 45 }), m(4, 2, 80, ['q4', 'r4'], { q4: 40, r4: 40 }),
    ],
    2: [
      // team 1 benched a 30-point RB (b1) for a 10-point one
      m(1, 1, 110, ['q1', 'r1'], { q1: 100, r1: 10, b1: 30 }), m(3, 1, 90, ['q3', 'r3'], { q3: 45, r3: 45 }),
      m(2, 2, 90, ['q2', 'r2'], { q2: 45, r2: 45 }), m(4, 2, 70, ['q4', 'r4'], { q4: 35, r4: 35 }),
    ],
    3: [],
  },
};

const leaguePts = new Map([
  ['q1', { total: 100, byWeek: {}, position: 'QB' }], ['q2', { total: 90, byWeek: {}, position: 'QB' }],
  ['q3', { total: 80, byWeek: {}, position: 'QB' }], ['q4', { total: 70, byWeek: {}, position: 'QB' }],
  ['r1', { total: 100, byWeek: {}, position: 'RB' }], ['r2', { total: 90, byWeek: {}, position: 'RB' }],
  ['r3', { total: 80, byWeek: {}, position: 'RB' }], ['r4', { total: 70, byWeek: {}, position: 'RB' }],
  ['b1', { total: 60, byWeek: {}, position: 'RB' }],
]);
const levels = computeReplacementLevels({ rosterPositions: imported.league.rosterPositions, numTeams: 4, players: [...leaguePts.values()].map((v) => ({ position: v.position, pts: v.total })) });
const ctx = { imported, playersById: players, leaguePts, levels, playoffWeeks: [3], isCurrent: false };

test('all-play record and luck', () => {
  const ap = allPlay(ctx);
  const t1 = ap.find((t) => t.rosterId === 1);
  assert.equal(t1.allPlayWins, 6); // beat everyone both weeks
  assert.equal(t1.actualWins, 2);
  assert.equal(t1.expectedWins, 2);
  const t4 = ap.find((t) => t.rosterId === 4);
  assert.equal(t4.allPlayLosses, 6);
});

test('standings order and lineup efficiency spots the benched RB', () => {
  const s = standings(ctx);
  assert.deepEqual(s.map((x) => x.rosterId), [1, 2, 3, 4]);
  const eff = lineupEfficiency(ctx);
  const t1 = eff.find((t) => t.rosterId === 1);
  assert.equal(t1.pointsLeftOnBench, 20); // week 2: optimal 130 vs actual 110
  assert.equal(t1.worstWeek.week, 2);
});

test('playoff odds with no remaining games are decided by the standings', () => {
  const odds = playoffOdds(ctx, { sims: 10 });
  assert.equal(odds.find((o) => o.rosterId === 1).playoffPct, 100);
  assert.equal(odds.find((o) => o.rosterId === 4).playoffPct, 0);
});

test('positional strength compares starters to the league average', () => {
  const ps = positionalStrength(ctx);
  const t1 = ps.teams.find((t) => t.rosterId === 1);
  assert.ok(t1.strength.QB.vsAverage > 0);
  assert.equal(ps.teams[0].rosterId, 1);
});
