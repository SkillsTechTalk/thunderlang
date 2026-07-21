import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { liftRepo } from '../src/lift.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-lift-out-'));

test('thunder lift --out writes a canonical .thunder draft, not legacy .intent', () => {
  const src = join(tmp, 'charge.ts');
  writeFileSync(src, 'export function charge(amount: number, token: string) { return amount > 0; }\n');
  const out = join(tmp, 'intent');
  const res = spawnSync(process.execPath, [CLI, 'lift', src, '--out', out], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const files = readdirSync(out);
  assert.ok(files.some((f) => f.endsWith('.thunder')), `expected a .thunder file, got ${files.join(', ')}`);
  assert.ok(!files.some((f) => f.endsWith('.intent')), `should not emit legacy .intent, got ${files.join(', ')}`);
});

test('liftRepo outName uses the canonical .thunder extension', () => {
  const rep = liftRepo([{ file: 'billing/charge.ts', source: 'export function charge(x: number) { return x > 0; }' }], {});
  assert.ok(rep.missions.length >= 1);
  for (const m of rep.missions) assert.ok(m.outName.endsWith('.thunder'), `outName ${m.outName} should end with .thunder`);
});
