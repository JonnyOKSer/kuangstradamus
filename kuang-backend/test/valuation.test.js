import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReplacementLevels, playerValue, classifyTrade, positionalRank, DEFAULT_ROSTER_POSITIONS } from '../src/domain/valuation.js';

function synthetic() {
  const players = [];
  const gen = (pos, n, top, step) => { for (let i = 0; i < n; i++) players.push({ position: pos, pts: top - i * step }); };
  gen('QB', 40, 380, 6);
  gen('RB', 90, 320, 3);
  gen('WR', 120, 310, 2.2);
  gen('TE', 50, 220, 4);
  gen('K', 32, 150, 2);
  gen('DEF', 32, 140, 2);
  return players;
}

test('replacement ranks follow roster slots, flex allocation and bench buffer', () => {
  const levels = computeReplacementLevels({ rosterPositions: DEFAULT_ROSTER_POSITIONS, numTeams: 12, players: synthetic() });
  // 12 QB starters + 2 bench buffer
  assert.equal(levels.replacementRank.QB, 14);
  // 2 RB + 2 WR slots ×12 = 24 each, plus 12 FLEX split between RB/WR/TE, plus buffer 6
  const flexTotal = (levels.startersByPosition.RB - 24) + (levels.startersByPosition.WR - 24) + (levels.startersByPosition.TE - 12);
  assert.equal(flexTotal, 12);
  assert.equal(levels.replacementRank.RB, levels.startersByPosition.RB + 6);
  assert.equal(levels.replacementRank.K, 12);
  // replacement points equal the player at that rank
  const rbs = synthetic().filter((p) => p.position === 'RB').sort((a, b) => b.pts - a.pts);
  assert.equal(levels.replacementPoints.RB, rbs[levels.replacementRank.RB - 1].pts);
});

test('superflex leagues push QB replacement deeper', () => {
  const sf = computeReplacementLevels({ rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'BN'], numTeams: 12, players: synthetic() });
  const std = computeReplacementLevels({ rosterPositions: DEFAULT_ROSTER_POSITIONS, numTeams: 12, players: synthetic() });
  assert.ok(sf.replacementRank.QB > std.replacementRank.QB);
});

test('playerValue floors VORP at zero but keeps the raw number', () => {
  const levels = { replacementPoints: { RB: 100 } };
  assert.deepEqual(playerValue(150, 'RB', levels), { ros: 150, replacement: 100, vorp: 50, rawVorp: 50 });
  const below = playerValue(80, 'RB', levels);
  assert.equal(below.vorp, 0);
  assert.equal(below.rawVorp, -20);
});

test('classifyTrade thresholds', () => {
  assert.equal(classifyTrade(100, 98).category, 'even');
  assert.equal(classifyTrade(100, 90).category, 'slight');
  assert.equal(classifyTrade(100, 75).category, 'clear');
  assert.equal(classifyTrade(100, 50).category, 'lopsided');
  assert.equal(classifyTrade(50, 100).winner, 'B');
  assert.equal(classifyTrade(0, 0).category, 'even');
});

test('positionalRank counts only same-position players ahead', () => {
  const players = [{ position: 'RB', pts: 300 }, { position: 'RB', pts: 250 }, { position: 'WR', pts: 400 }];
  assert.equal(positionalRank(250, 'RB', players), 2);
  assert.equal(positionalRank(300, 'RB', players), 1);
});
