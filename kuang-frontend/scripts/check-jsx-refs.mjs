/**
 * Fail the build when a component is used but never defined or imported.
 *
 * `next build` compiles a file that references an undefined component without
 * complaint — the identifier is only resolved at render time. That shipped a
 * `<Faab />` with no `function Faab` behind it, and the team view died with
 * "ReferenceError: Faab is not defined" in production while the build stayed
 * green. This is the cheap guard: no dependencies, runs before every build.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['pages', 'components', 'lib'];
// provided by the runtime or by React itself, never imported explicitly
const AMBIENT = new Set(['Fragment']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(jsx?|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

function scan(file) {
  const src = readFileSync(file, 'utf8');
  const used = new Set([...src.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]));
  if (!used.size) return [];

  const defined = new Set([
    ...[...src.matchAll(/(?:export\s+)?function\s+([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]),
    ...[...src.matchAll(/(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=/g)].map((m) => m[1]),
  ]);

  // names bound by destructuring — props like ({ Component, pageProps })
  for (const [, names] of src.matchAll(/function\s+\w+\s*\(\s*\{([^}]*)\}/g)) {
    for (const part of names.split(',')) {
      const name = part.trim().split(/[:=]/)[0].trim();
      if (/^[A-Z]/.test(name)) defined.add(name);
    }
  }
  for (const [, names] of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of names.split(',')) {
      const name = part.trim().split(/[:=]/).pop().trim();
      if (/^[A-Z]/.test(name)) defined.add(name);
    }
  }

  const imported = new Set();
  for (const [, names] of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const part of names.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) imported.add(name);
    }
  }
  for (const [, name] of src.matchAll(/import\s+([A-Z][A-Za-z0-9_]*)\s*(?:,|from)/g)) imported.add(name);

  return [...used].filter((n) => !defined.has(n) && !imported.has(n) && !AMBIENT.has(n)).sort();
}

let failed = false;
for (const root of ROOTS) {
  let files = [];
  try { files = walk(root); } catch { continue; }
  for (const file of files) {
    const missing = scan(file);
    if (missing.length) {
      failed = true;
      console.error(`✗ ${relative('.', file)}: used but never defined or imported — ${missing.join(', ')}`);
    }
  }
}

if (failed) {
  console.error('\nA component is referenced with nothing behind it. This would be a blank page at runtime.');
  process.exit(1);
}
console.log('✓ every component referenced in JSX is defined or imported');
