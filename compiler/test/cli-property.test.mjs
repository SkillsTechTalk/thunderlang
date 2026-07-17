import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-prop-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const props = (file, extra = []) => spawnSync(process.execPath, [CLI, 'test', file, '--properties', ...extra], { encoding: 'utf8' });

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
property AdultsHighScoreEligible
  forAll
    age: Integer where age >= 18 and age <= 60
    score: Integer where score >= 70 and score <= 100
  decide CanEnroll
  expect
    result == Eligible
property EveryoneEligible
  forAll
    age: Integer where age >= 0 and age <= 100
    score: Integer where score >= 0 and score <= 100
  decide CanEnroll
  expect
    result == Eligible
`;

test('a true property passes over many generated cases', () => {
  const out = JSON.parse(props(write('p.thunder', SRC), ['--json']).stdout);
  const good = out.results.find((r) => r.property === 'AdultsHighScoreEligible');
  assert.equal(good.ok, true);
  assert.equal(good.cases, 100);
});

test('a false property fails and shrinks to the smallest input', () => {
  const res = props(write('p2.thunder', SRC));
  assert.equal(res.status, 1, 'a failing property fails the run');
  assert.match(res.stdout, /FAIL {2}EveryoneEligible/);
  const out = JSON.parse(props(write('p3.thunder', SRC), ['--json']).stdout);
  const bad = out.results.find((r) => r.property === 'EveryoneEligible');
  assert.equal(bad.ok, false);
  // binary shrink drives both inputs to their lower bound
  assert.equal(bad.failure.inputs.age, 0);
  assert.equal(bad.failure.inputs.score, 0);
});

test('results are deterministic for a fixed seed', () => {
  const a = props(write('p4.thunder', SRC), ['--json', '--seed', '7']).stdout;
  const b = props(write('p5.thunder', SRC), ['--json', '--seed', '7']).stdout;
  assert.equal(JSON.parse(a).passed, JSON.parse(b).passed);
});

test('an unsatisfiable forAll constraint errors instead of hanging or false-passing', () => {
  const file = write('unsat.thunder', `mission E
decision D
  inputs
    age
  rule a
    when age >= 18
    return Yes
  default
    return No
property Bad
  forAll
    age: Integer where age >= 100 and age <= 0
  decide D
  expect
    result == Yes
`);
  const out = JSON.parse(props(file, ['--json']).stdout);
  assert.equal(out.results[0].ok, false);
  assert.match(out.results[0].error, /unsatisfiable constraint/);
});

test('a non-numeric --cases falls back to the default (never 0 cases = false pass)', () => {
  const out = JSON.parse(props(write('p6.thunder', SRC), ['--json', '--cases', 'abc']).stdout);
  assert.equal(out.results[0].cases, 100);
});
