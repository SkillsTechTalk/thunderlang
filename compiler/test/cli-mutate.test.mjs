import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-mut-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const mutate = (file, extra = []) => spawnSync(process.execPath, [CLI, 'test', file, '--mutate', ...extra], { encoding: 'utf8' });

const STRONG = `mission Enroll
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
  case qualified
    given age 20, score 90
    expect Eligible
  case minor
    given age 10, score 90
    expect NotEligible
  case lowscore
    given age 20, score 50
    expect NotEligible
`;

const WEAK = `mission Grade
decision Grade
  inputs
    score
  rule a
    when score >= 90
    return A
  rule b
    when score >= 80
    return B
  default
    return C
test Grade
  case high
    given score 95
    expect A
`;

test('a well-tested decision kills every mutant (score 100)', () => {
  const out = JSON.parse(mutate(write('strong.thunder', STRONG), ['--json']).stdout);
  assert.equal(out.survived, 0);
  assert.equal(out.score, 100);
});

test('mutations of an untested rule SURVIVE and are reported as weak spots', () => {
  const out = JSON.parse(mutate(write('weak.thunder', WEAK), ['--json']).stdout);
  assert.ok(out.survived > 0, 'uncovered rule b leaves surviving mutants');
  assert.ok(out.results.some((r) => !r.killed && /\bb\b/.test(r.describe)), 'a rule-b mutant survives');
  // strict mode fails the run when mutants survive
  const strict = mutate(write('weak2.thunder', WEAK), ['--strict']);
  assert.equal(strict.status, 1);
});

test('--mutate reports nothing to do when there are no passing decision tests', () => {
  const out = JSON.parse(mutate(write('none.thunder', 'mission M\nguarantee x holds\n'), ['--json']).stdout);
  assert.equal(out.total, 0);
  assert.equal(out.score, null);
});
