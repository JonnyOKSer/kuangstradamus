import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyDates } from '../src/domain/calendar.js';

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'BN', 'BN', 'BN'];

/** Minimal context: keyDates only needs the league shape and per-player byes. */
function ctxWith(players, { rosterPositions = SLOTS, currentWeek = 5 } = {}) {
  const playersById = new Map();
  const leaguePts = new Map();
  for (const p of players) {
    playersById.set(p.id, { id: p.id, name: p.name, position: p.position, fantasyPositions: [p.position], team: 'SF', injuryStatus: null });
    leaguePts.set(p.id, { total: 100, byWeek: {}, position: p.position, byeWeeks: p.byeWeeks || [] });
  }
  return {
    imported: {
      currentWeek,
      league: { rosterPositions, playoffWeekStart: 15, playoffTeams: 6, tradeDeadline: 11, waiverType: 2, waiverBudget: 100, totalRosters: 10 },
      teams: [],
    },
    playersById,
    leaguePts,
    activePositions: ['QB', 'RB', 'WR', 'TE'],
    playoffWeeks: [15, 16, 17],
    levels: { replacementPoints: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 } },
  };
}

const team = (players) => ({
  rosterId: 1,
  players: players.map((p) => p.id),
  starters: [],
  reserve: [],
  record: { waiverBudgetUsed: 0, waiverPosition: 3 },
});

const P = (id, position, byeWeeks = []) => ({ id, name: `${position}-${id}`, position, byeWeeks });

// A full roster: one TE on bye in week 10, a second healthy TE, plenty of flex bodies.
const FULL = [
  P('qb1', 'QB'), P('qb2', 'QB'),
  P('rb1', 'RB'), P('rb2', 'RB'), P('rb3', 'RB'), P('rb4', 'RB'),
  P('wr1', 'WR'), P('wr2', 'WR'), P('wr3', 'WR'), P('wr4', 'WR'),
  P('te1', 'TE', [14]), P('te2', 'TE', [10]),
];

test('a tight end on bye is not a shortage when the lineup still fills', () => {
  const ctx = ctxWith(FULL);
  const d = keyDates(team(FULL), ctx, { freeAgents: [] });
  const wk10 = d.byeOutlook.find((b) => b.week === 10);
  assert.ok(wk10, 'week 10 should still be listed — a player is on bye');
  assert.deepEqual(wk10.shortages, [], 'one TE out of two, in a one-TE lineup, is not a hole');
  assert.equal(wk10.risk, 'low');
});

test('a genuinely unfillable slot is still reported, named by slot', () => {
  // only one TE, and he is on bye; no flex-eligible spares left over
  const thin = [
    P('qb1', 'QB'),
    P('rb1', 'RB'), P('rb2', 'RB'),
    P('wr1', 'WR'), P('wr2', 'WR'),
    P('te1', 'TE', [10]),
  ];
  const ctx = ctxWith(thin);
  const d = keyDates(team(thin), ctx, { freeAgents: [] });
  const wk10 = d.byeOutlook.find((b) => b.week === 10);
  const slots = wk10.shortages.map((s) => s.slot);
  assert.ok(slots.includes('TE'), `expected a TE hole, got ${JSON.stringify(slots)}`);
  assert.ok(wk10.shortages.every((s) => s.eligible?.length), 'each shortage names what can fill it');
});

test('cover suggestions match everything the slot accepts, not just one position', () => {
  const thin = [
    P('qb1', 'QB'), P('rb1', 'RB'), P('rb2', 'RB'),
    P('wr1', 'WR'), P('wr2', 'WR'), P('te1', 'TE', [10]),
  ];
  const freeAgents = [
    { id: 'fa1', name: 'Spare RB', position: 'RB', team: 'KC', byeWeeks: [], ros: 50, byWeek: { 10: 9 } },
    { id: 'fa2', name: 'Spare TE', position: 'TE', team: 'KC', byeWeeks: [], ros: 40, byWeek: { 10: 7 } },
    { id: 'fa3', name: 'Bye TE', position: 'TE', team: 'KC', byeWeeks: [10], ros: 45, byWeek: {} },
  ];
  const d = keyDates(team(thin), ctxWith(thin), { freeAgents });
  const wk10 = d.byeOutlook.find((b) => b.week === 10);
  const te = wk10.shortages.find((s) => s.slot === 'TE');
  const names = te.waiverCover.map((c) => c.name);
  assert.ok(names.includes('Spare TE'));
  assert.ok(!names.includes('Bye TE'), 'a free agent on bye that week cannot cover it');
  assert.ok(!names.includes('Spare RB'), 'a dedicated TE slot takes tight ends only');
});

test('the trade deadline and playoff dates come through', () => {
  const d = keyDates(team(FULL), ctxWith(FULL), { freeAgents: [] });
  assert.equal(d.tradeDeadline.week, 11);
  assert.equal(d.tradeDeadline.weeksAway, 6);
  assert.equal(d.tradeDeadline.passed, false);
  assert.equal(d.playoffs.startWeek, 15);
  assert.ok(d.milestones.some((m) => m.type === 'tradeDeadline'));
});

test('a passed deadline is reported as passed', () => {
  const ctx = ctxWith(FULL, { currentWeek: 13 });
  const d = keyDates(team(FULL), ctx, { freeAgents: [] });
  assert.equal(d.tradeDeadline.passed, true);
  assert.ok(d.alerts.some((a) => a.type === 'tradeDeadline' && /passed/i.test(a.text)));
});
