import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'il-validate-'));
const writeJson = (name, obj) => { const p = join(tmp, name); writeFileSync(p, JSON.stringify(obj)); return p; };
const run = (file, json) => spawnSync(process.execPath, [CLI, 'validate', file, ...(json ? ['--json'] : [])], { encoding: 'utf8' });

test('intent validate: a canonical graph is VALID (exit 0)', () => {
  const g = buildIntentGraph(parseIntent('mission M\nguarantees\n  a holds\n'));
  const res = run(writeJson('ok.json', g), true);
  assert.equal(res.status, 0, res.stderr);
  const v = JSON.parse(res.stdout);
  assert.equal(v.valid, true);
  assert.deepEqual(v.issues, []);
});

test('intent validate: noncanonical types and dangling edges fail (exit 1)', () => {
  const g = { schema: 'intent-graph-v1', nodes: [{ id: 'x', type: 'Frobnicator' }], relationships: [{ from: 'x', type: 'teleports', to: 'ghost' }] };
  const res = run(writeJson('bad.json', g), true);
  assert.equal(res.status, 1);
  const codes = JSON.parse(res.stdout).issues.map((i) => i.code);
  assert.ok(codes.includes('MIG-002') && codes.includes('MIG-003') && codes.includes('MIG-005'));
});

test('intent validate: rejects non-graph JSON', () => {
  const res = run(writeJson('nope.json', { hello: 'world' }), false);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /not an Intent Graph/);
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
