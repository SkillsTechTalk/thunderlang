// Guards for how fast Thunder starts (scripts/speed.mjs measures it). Each guards a cost that was measured and removed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { byText } from '../src/text-order.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const all = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? all(p) : p.endsWith('.mjs') ? [p] : []; });

test('no localeCompare in the compiler: its order depends on the machine, and its first call costs ~250 ms', () => {
  const uses = all(SRC).filter((f) => !f.endsWith('text-order.mjs')).filter((f) => /\.localeCompare\(/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(uses, [], 'use byText from src/text-order.mjs');
  assert.deepEqual(['b', 'B', 'a', 'é', 'A', '10', '9'].sort(byText), ['10', '9', 'A', 'B', 'a', 'b', 'é']);
});

test('the thunder command turns on Node\'s compile cache before the CLI loads', () => {
  const entry = readFileSync(join(SRC, 'cli.mjs'), 'utf8');
  assert.match(entry, /module\.enableCompileCache\?\.\(\)/);
  assert.match(entry, /await import\('\.\/cli-main\.mjs'\)/);
  // Nothing heavy may be imported statically before the cache is on.
  assert.deepEqual([...entry.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]), ['node:module']);
  const r = spawnSync(process.execPath, [join(SRC, 'cli.mjs'), '--version'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^thunder \d+\.\d+\.\d+/);
});
