import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/scan.mjs';
import {
  coverageView, unverifiedView, gapsView, risksView, unknownsView, contradictionsView, VIEW_SCHEMA,
} from '../src/scan-queries.mjs';
import * as barrel from '../src/index.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');

const CLEAN = `mission Clean
goal
  Do the thing
guarantee it holds
  verify it holds test
never leak a secret
  verify secret scan
`;
const LEAKY = `mission Leaky
goal
  Do the thing
guarantee it holds
never leak a secret
`;

const scan = (src) => scanProject([{ file: 'X.intent', source: src }]);

test('coverage: every guarantee/never with a verify counts as covered (never included)', () => {
  const v = coverageView(scan(CLEAN));
  assert.equal(v.schema, VIEW_SCHEMA);
  assert.equal(v.total, 2);
  assert.equal(v.verified, 2);
  assert.equal(v.coverage, 100);
  assert.equal(v.unverified.length, 0);
});

test('coverage: unverified guarantee AND never are both surfaced', () => {
  const v = coverageView(scan(LEAKY));
  assert.equal(v.total, 2);
  assert.equal(v.verified, 0);
  assert.equal(v.coverage, 0);
  const types = v.unverified.map((u) => u.type).sort();
  assert.deepEqual(types, ['Guarantee', 'Never']);
});

test('unverified + gaps derive from the same scan', () => {
  const s = scan(LEAKY);
  assert.equal(unverifiedView(s).count, 2);
  assert.ok(gapsView(s).count >= 2);
  assert.ok(gapsView(s).gaps.every((g) => g.ruleId && g.detected));
});

test('risks view exposes themes + remediation, clean project has none', () => {
  assert.equal(risksView(scan(CLEAN)).count, 0);
  const r = risksView(scan(LEAKY));
  assert.ok(r.themes.length >= 1);
  assert.ok(Array.isArray(r.remediationSequence));
});

test('unknowns and contradictions are empty for a plain factual mission', () => {
  assert.equal(unknownsView(scan(CLEAN)).count, 0);
  assert.equal(contradictionsView(scan(CLEAN)).count, 0);
});

test('barrel exports the views', () => {
  assert.equal(typeof barrel.coverageView, 'function');
  assert.equal(typeof barrel.VIEWS.gaps, 'function');
});

test('CLI: intent coverage exits non-zero below 100% and 0 when complete', () => {
  const mk = (src) => {
    const dir = mkdtempSync(join(tmpdir(), 'intent-q-'));
    const f = join(dir, 'M.intent'); writeFileSync(f, src); return f;
  };
  const leaky = spawnSync(process.execPath, [CLI, 'coverage', mk(LEAKY)], { encoding: 'utf8' });
  assert.equal(leaky.status, 1);
  assert.match(leaky.stdout, /0\/2 claims verified \(0%\)/);
  const clean = spawnSync(process.execPath, [CLI, 'coverage', mk(CLEAN)], { encoding: 'utf8' });
  assert.equal(clean.status, 0);
  assert.match(clean.stdout, /2\/2 claims verified \(100%\)/);
});

test('CLI: intent unverified --json emits the view schema', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intent-q2-'));
  const f = join(dir, 'M.intent'); writeFileSync(f, LEAKY);
  const out = JSON.parse(spawnSync(process.execPath, [CLI, 'unverified', f, '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(out.schema, VIEW_SCHEMA);
  assert.equal(out.view, 'unverified');
  assert.equal(out.count, 2);
});
