import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResolver, normalize } from '../src/services/sleeper/players.js';

const mk = (id, name, position, team, extra = {}) => {
  const [firstName, ...rest] = name.split(' ');
  return {
    id, name, searchName: normalize(name), firstName, lastName: rest.join(' '), position,
    fantasyPositions: [position], team, active: true, status: 'Active', injuryStatus: null, searchRank: 1000, ...extra,
  };
};

const fixture = [
  mk('4034', 'Christian McCaffrey', 'RB', 'SF', { searchRank: 4 }),
  mk('6786', 'Mike Williams', 'WR', 'LAC', { searchRank: 200 }),
  mk('1111', 'Mike Williams', 'WR', null, { active: false, searchRank: 5000 }),
  mk('5555', 'Josh Allen', 'QB', 'BUF', { searchRank: 2 }),
  mk('7777', 'Jonathan Taylor', 'RB', 'IND', { searchRank: 10 }),
  mk('7778', 'Tyrod Taylor', 'QB', 'NYJ', { searchRank: 900 }),
  mk('CLE', 'Cleveland Browns', 'DEF', 'CLE', { searchRank: 3000 }),
  mk('SF', 'San Francisco 49ers', 'DEF', 'SF', { searchRank: 3000 }),
];

const resolve = createResolver(fixture);

test('exact and nickname matches', () => {
  assert.equal(resolve('Christian McCaffrey').player.id, '4034');
  assert.equal(resolve('christian mccaffrey jr.').player.id, '4034');
  assert.equal(resolve('CMC').player.id, '4034');
});

test('prefers the active player on duplicate names', () => {
  const r = resolve('Mike Williams');
  assert.equal(r.player.id, '6786');
});

test('last-name only resolves when unique, flags when ambiguous', () => {
  assert.equal(resolve('McCaffrey').player.id, '4034');
  const t = resolve('Taylor');
  assert.equal(t.method, 'last-name-ambiguous');
  assert.ok(t.confidence < 0.8);
  assert.equal(resolve('Taylor', { position: 'QB' }).player.id, '7778');
});

test('team defenses by nickname, abbreviation and D/ST suffix', () => {
  assert.equal(resolve('49ers D/ST').player.id, 'SF');
  assert.equal(resolve('Browns').player.id, 'CLE');
  assert.equal(resolve('CLE').player.id, 'CLE');
  assert.equal(resolve('Cleveland defense').player.id, 'CLE');
});

test('fuzzy matching tolerates typos and gives up on nonsense', () => {
  const r = resolve('Christain McCafrey');
  assert.equal(r.player.id, '4034');
  assert.ok(r.confidence >= 0.6);
  assert.equal(resolve('Zzzz Qqqqq'), null);
});
