import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickProverb, PROVERB_CATEGORIES } from '../src/utils/proverbLogic.js';

const bank = JSON.parse(readFileSync(new URL('../src/data/proverbs.json', import.meta.url), 'utf8'));

test('bank has every trade category with bilingual entries', () => {
  for (const cat of ['even', 'slight', 'clear', 'lopsided', 'general']) {
    assert.ok(PROVERB_CATEGORIES.includes(cat), cat);
    assert.ok(bank[cat].length >= 20, `${cat} has ${bank[cat].length}`);
    for (const p of bank[cat]) {
      assert.ok(p.en?.trim().length > 10, `en missing in ${cat}`);
      assert.ok(/[一-鿿]/.test(p.zh || ''), `zh missing Chinese in ${cat}: ${p.en}`);
    }
  }
});

test('seeded picks are deterministic and unknown categories fall back to general', () => {
  const a = pickProverb('lopsided', 'seed-1');
  const b = pickProverb('lopsided', 'seed-1');
  assert.deepEqual(a, b);
  assert.equal(a.category, 'lopsided');
  assert.equal(pickProverb('nope').category, 'general');
});
