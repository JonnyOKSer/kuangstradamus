import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTradeInput, normalizeTradeRequest, parseItem } from '../src/domain/tradeParser.js';

test('splits sides on "for" and items on and / commas / &', () => {
  const t = parseTradeInput('CMC and Tyreek Hill for Bijan Robinson, a 2027 1st & Jake Ferguson');
  assert.deepEqual(t.teamA.map((i) => i.name), ['CMC', 'Tyreek Hill']);
  assert.equal(t.teamB.length, 3);
  assert.equal(t.teamB[0].name, 'Bijan Robinson');
  assert.deepEqual(t.teamB[1], { type: 'pick', year: 2027, round: 1, name: '2027 1st round pick' });
  assert.equal(t.teamB[2].name, 'Jake Ferguson');
});

test('supports "in exchange for" and plus signs', () => {
  const t = parseTradeInput('Josh Allen + Travis Kelce in exchange for Lamar Jackson');
  assert.deepEqual(t.teamA.map((i) => i.name), ['Josh Allen', 'Travis Kelce']);
  assert.deepEqual(t.teamB.map((i) => i.name), ['Lamar Jackson']);
});

test('does not split player names that merely contain "for"', () => {
  const t = parseTradeInput('Jerome Ford for Zach Charbonnet');
  assert.equal(t.teamA[0].name, 'Jerome Ford');
  assert.equal(t.teamB[0].name, 'Zach Charbonnet');
});

test('rejects input without two sides', () => {
  assert.throws(() => parseTradeInput('Christian McCaffrey and Tyreek Hill'), /A for B/);
  assert.throws(() => parseTradeInput(''), /Describe the trade/);
});

test('picks: round words and default year', () => {
  assert.deepEqual(parseItem('first round pick', { defaultPickYear: 2027 }), { type: 'pick', year: 2027, round: 1, name: '2027 1st round pick' });
  assert.equal(parseItem('2028 3rd').round, 3);
  assert.equal(parseItem('Bijan Robinson').type, 'player');
});

test('normalizeTradeRequest accepts arrays or a message', () => {
  const a = normalizeTradeRequest({ teamA: ['A. Player'], teamB: ['B Player', '2027 2nd'] });
  assert.equal(a.teamA[0].name, 'A. Player');
  assert.equal(a.teamB[1].type, 'pick');
  const b = normalizeTradeRequest({ message: 'X for Y' });
  assert.equal(b.teamB[0].name, 'Y');
  assert.throws(() => normalizeTradeRequest({}), /Provide/);
});
