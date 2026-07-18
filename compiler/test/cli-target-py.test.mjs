import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runPythonTarget, emitPythonModule, pythonAvailable } from '../src/target-py.mjs';
import { parseIntent } from '../src/parse.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-target-py-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const HAVE_PY = pythonAvailable();

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

test('emitted Python uses Python logical operators (and/or/not), not C-family', () => {
  const py = emitPythonModule(parseIntent(SRC));
  assert.match(py, /and/);
  assert.doesNotMatch(py, /&&|\|\||!\(/);
});

test('the Python adapter compiles + executes the generated decision', { skip: !HAVE_PY && 'python3 not available' }, () => {
  const out = runPythonTarget(parseIntent(SRC));
  assert.equal(out['CanEnroll / adult'], 'Eligible');
  assert.equal(out['CanEnroll / minor'], 'NotEligible');
});

test('runPythonTarget returns null when python3 is unavailable (no crash)', { skip: HAVE_PY && 'python3 is available here' }, () => {
  assert.equal(runPythonTarget(parseIntent(SRC)), null);
});

test('thunder test --target python runs the tests against generated Python', { skip: !HAVE_PY && 'python3 not available' }, () => {
  const res = spawnSync(process.execPath, [CLI, 'test', write('a.thunder', SRC), '--target', 'python'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /2\/2 passed \(executed generated code\)/);
});

test('thunder test --target python skips cleanly when python3 is absent', { skip: HAVE_PY && 'python3 is available here' }, () => {
  const res = spawnSync(process.execPath, [CLI, 'test', write('b.thunder', SRC), '--target', 'python'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /skipped/);
});

test('conform --run python fills the Python column from live execution', { skip: !HAVE_PY && 'python3 not available' }, () => {
  const out = JSON.parse(spawnSync(process.execPath, [CLI, 'conform', write('c.thunder', SRC), '--json', '--run', 'python'], { encoding: 'utf8' }).stdout);
  assert.equal(out.graded, true);
  assert.ok(out.cases.every((c) => c.targets.python.status === 'pass'), 'the faithful Python target conforms');
  assert.ok(out.cases.every((c) => c.targets.typescript.status === 'declared'), 'typescript stays declared (not run)');
});
