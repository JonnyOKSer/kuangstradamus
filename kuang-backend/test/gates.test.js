import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGates, challengeStarter } from '../src/domain/gates.js';

const base = { position: 'WR', projectedPoints: 12, opponent: 'BUF' };

test('a player who is out or on bye is blocked outright', () => {
  assert.equal(runGates({ ...base, injuryStatus: 'Out' }).blocked, true);
  assert.equal(runGates({ ...base, onBye: true }).adjusted, 0);
  assert.equal(runGates({ ...base, projectedPoints: 0 }).blocked, true);
});

test('missing context lowers confidence instead of inventing a factor', () => {
  const r = runGates(base);
  assert.equal(r.factor, 1);
  assert.equal(r.adjusted, 12);
  assert.ok(r.confidence < 1, 'unknown gates should cost confidence');
  assert.ok(r.gates.filter((g) => g.verdict === 'unknown').length >= 3);
});

test('a soft matchup raises the projection and a hard one lowers it', () => {
  const soft = runGates({ ...base, defense: { pointsAllowedPerGame: 30, vsAvg: 10, gamesSampled: 5, rank: 1, of: 32 }, leagueAvg: 20 });
  const hard = runGates({ ...base, defense: { pointsAllowedPerGame: 10, vsAvg: -10, gamesSampled: 5, rank: 32, of: 32 }, leagueAvg: 20 });
  assert.ok(soft.adjusted > 12, 'generous defence should help');
  assert.ok(hard.adjusted < 12, 'stingy defence should hurt');
});

test('a one-game sample moves the matchup less than a five-game sample', () => {
  const mk = (gamesSampled) => runGates({ ...base, defense: { pointsAllowedPerGame: 30, vsAvg: 10, gamesSampled, rank: 1, of: 32 }, leagueAvg: 20 });
  assert.ok(mk(1).adjusted < mk(5).adjusted);
});

test('wind and snow punish passing games but not runners', () => {
  const weather = { tempF: 22, windMph: 28, precipIn: 0, snowIn: 0.5, summary: '22°F, snow, wind 28 mph' };
  const wr = runGates({ ...base, position: 'WR', weather });
  const rb = runGates({ ...base, position: 'RB', weather });
  const k = runGates({ ...base, position: 'K', weather });
  assert.ok(wr.adjusted < 12);
  assert.ok(k.adjusted < wr.adjusted, 'kickers suffer most');
  assert.ok(rb.adjusted > wr.adjusted, 'runners are least affected');
});

test('indoor games skip the weather gate entirely', () => {
  const r = runGates({ ...base, sheltered: true, weather: null });
  const gate = r.gates.find((g) => g.name === 'weather');
  assert.equal(gate.verdict, 'pass');
  assert.equal(gate.factor, 1);
});

test('the total adjustment is clamped so no single signal runs away', () => {
  const r = runGates({
    ...base,
    position: 'K',
    weather: { tempF: 5, windMph: 45, precipIn: 1, snowIn: 3, summary: 'blizzard' },
    defense: { pointsAllowedPerGame: 2, vsAvg: -18, gamesSampled: 6, rank: 32, of: 32 },
    leagueAvg: 20,
    form: { gamesPlayed: 5, recentPPG: 4, last3PPG: 2, priorPPG: 9, snapShareLast: 0.2, snapShareTrend: -0.3, touchesTrend: -5 },
  });
  assert.ok(r.factor >= 0.6, `factor ${r.factor} should not fall below the floor`);
});

test('a challenger must clear a bar that widens as confidence falls', () => {
  const incumbent = { adjusted: 10, confidence: 1, blocked: false };
  const sure = { adjusted: 11.5, confidence: 1, blocked: false };
  const shaky = { adjusted: 11.5, confidence: 0.3, blocked: false };
  assert.equal(challengeStarter({ incumbent, challenger: sure }).swap, true);
  assert.equal(challengeStarter({ incumbent, challenger: shaky }).swap, false);
});

test('an unavailable starter is always replaced', () => {
  const out = challengeStarter({
    incumbent: { adjusted: 0, confidence: 1, blocked: true, reasonText: 'on bye this week' },
    challenger: { adjusted: 3, confidence: 0.4, blocked: false },
  });
  assert.equal(out.swap, true);
  assert.match(out.reason, /bye/);
});

test('a blocked challenger never enters the lineup', () => {
  const r = challengeStarter({
    incumbent: { adjusted: 1, confidence: 1, blocked: false },
    challenger: { adjusted: 30, confidence: 1, blocked: true },
  });
  assert.equal(r.swap, false);
});
