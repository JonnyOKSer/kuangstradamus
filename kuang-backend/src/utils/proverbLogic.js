// Proverbs come from a pregenerated bilingual bank (src/data/proverbs.json),
// keyed by how lopsided the trade is. No model call at runtime, no API key.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BANK = JSON.parse(readFileSync(path.join(here, '../data/proverbs.json'), 'utf8'));

export const PROVERB_CATEGORIES = Object.keys(BANK);
export const FALLBACK_PROVERB = { en: 'A silent river hides the deepest stones.', zh: '静水之下，藏最深之石。' };

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick a proverb for a trade category. Pass `seed` to make the choice
 * deterministic (same trade → same prophecy); omit it for a random one.
 */
export function pickProverb(category = 'general', seed) {
  const key = BANK[category]?.length ? category : 'general';
  const pool = BANK[key];
  if (!pool?.length) return { ...FALLBACK_PROVERB, category: 'general' };
  const idx = seed == null ? Math.floor(Math.random() * pool.length) : hash(String(seed)) % pool.length;
  return { ...pool[idx], category: key };
}

/** Kept for compatibility with older call sites. */
export async function generateProverb(tradeText, category = 'general') {
  return pickProverb(category);
}
