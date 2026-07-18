import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runTypescriptTarget } from '../src/target-ts.mjs';
import { parseIntent } from '../src/parse.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-target-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };

const SRC = `mission Enroll
decision CanEnroll
  inputs
    age
    score
  rule adult
    when age >= 18 and score >= 70
    return Eligible
  default
    return NotEligible
test CanEnroll
  case adult
    given age 20, score 90
    expect Eligible
  case minor
    given age 10, score 90
    expect NotEligible
target
  TypeScript
  Python
`;

test('the adapter compiles + executes the generated decision', () => {
  const out = runTypescriptTarget(parseIntent(SRC));
  assert.equal(out['CanEnroll / adult'], 'Eligible');
  assert.equal(out['CanEnroll / minor'], 'NotEligible');
});

test('thunder test --target typescript runs the tests against generated code', () => {
  const res = spawnSync(process.execPath, [CLI, 'test', write('a.thunder', SRC), '--target', 'typescript'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /2\/2 passed \(executed generated code\)/);
});

test('conform --run typescript fills the TypeScript column from live execution', () => {
  const out = JSON.parse(spawnSync(process.execPath, [CLI, 'conform', write('b.thunder', SRC), '--json', '--run', 'typescript'], { encoding: 'utf8' }).stdout);
  assert.equal(out.graded, true);
  assert.ok(out.cases.every((c) => c.targets.typescript.status === 'pass'), 'the faithful TS target conforms');
  assert.ok(out.cases.every((c) => c.targets.python.status === 'declared'), 'python stays declared (not run)');
});
