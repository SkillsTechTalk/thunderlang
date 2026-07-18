import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-conform-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const conform = (file, extra = []) => spawnSync(process.execPath, [CLI, 'conform', file, ...extra], { encoding: 'utf8' });

const SRC = `mission Enroll
decision CanEnroll
  inputs
    age
  rule adult
    when age >= 18
    return Eligible
  default
    return NotEligible
test CanEnroll
  case adult
    given age 20
    expect Eligible
  case minor
    given age 10
    expect NotEligible
target
  TypeScript
  Python
`;

test('conform without results reports the semantic contract and declared targets', () => {
  const out = JSON.parse(conform(write('a.thunder', SRC), ['--json']).stdout);
  assert.equal(out.total, 2);
  assert.deepEqual(out.columns, ['typescript', 'python']);
  assert.equal(out.semanticFailures, 0);
  assert.equal(out.graded, false);
  assert.ok(out.cases.every((c) => c.targets.typescript.status === 'declared'));
});

test('a target that matches the contract passes; a divergent one is a CONFORMANCE FAILURE', () => {
  const results = '{"typescript":{"CanEnroll / adult":"Eligible","CanEnroll / minor":"NotEligible"},"python":{"CanEnroll / adult":"Eligible","CanEnroll / minor":"Eligible"}}';
  const res = conform(write('b.thunder', SRC), ['--results', results]);
  assert.equal(res.status, 1, 'a divergent target fails the run');
  assert.match(res.stdout, /CONFORMANCE FAILURE/);
  assert.match(res.stdout, /Target:\s+Python/);
  const out = JSON.parse(conform(write('b2.thunder', SRC), ['--json', '--results', results]).stdout);
  assert.equal(out.failures.length, 1);
  assert.equal(out.failures[0].target, 'python');
  assert.equal(out.failures[0].expected, 'NotEligible');
  assert.equal(out.failures[0].actual, 'Eligible');
});

test('--targets overrides which targets are compared', () => {
  const out = JSON.parse(conform(write('c.thunder', SRC), ['--json', '--targets', 'python']).stdout);
  assert.deepEqual(out.columns, ['python']);
});
