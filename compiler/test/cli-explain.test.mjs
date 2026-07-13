import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const explain = (...a) => spawnSync(process.execPath, [CLI, 'explain', ...a], { encoding: 'utf8' });

test('intent explain describes a cataloged code (case-insensitive)', () => {
  const res = explain('il-dist-001');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /IL-DIST-001/);
  assert.match(res.stdout, /area: distributed/);
  assert.match(res.stdout, /blocks: implementation/);
});

test('intent explain --json returns the rule object', () => {
  const out = JSON.parse(explain('IL-LIFE-001', '--json').stdout);
  assert.equal(out.ruleId, 'IL-LIFE-001');
  assert.equal(out.area, 'lifecycle');
  assert.equal(out.severity, 'error');
});

test('intent explain exits 1 on an unknown code', () => {
  const res = explain('IL-NOPE-999');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /not in the diagnostic catalog/);
});

const rules = (...a) => spawnSync(process.execPath, [CLI, 'rules', ...a], { encoding: 'utf8' });

test('intent rules lists the whole catalog grouped by area', () => {
  const res = rules();
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /diagnostics in \d+ areas/);
  assert.match(res.stdout, /IL-STYLE-001/);
  assert.match(res.stdout, /IL-OC-001/);
  assert.match(res.stdout, /missing-goal/);
});

test('intent rules --json returns the full DIAGNOSTIC_RULES array', () => {
  const out = JSON.parse(rules('--json').stdout);
  assert.ok(Array.isArray(out));
  assert.ok(out.length >= 46);
  assert.ok(out.every((r) => r.ruleId && r.area && r.severity));
});
