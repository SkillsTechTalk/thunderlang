import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-cov-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const cov = (file, extra = []) => spawnSync(process.execPath, [CLI, 'test', file, '--coverage', ...extra], { encoding: 'utf8' });

// rule a is exercised by the test; rule b is not. one guarantee is verified, one isn't.
const SRC = `mission Grade
goal
  Assign a grade
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
guarantee grade is valid
  verify grade test
guarantee score is never negative
never expose raw score
`;

test('semantic coverage measures decision-rule coverage (matched by a test)', () => {
  const out = JSON.parse(cov(write('a.thunder', SRC), ['--json']).stdout);
  const rules = out.metrics.find((m) => m.name === 'Decision rules');
  assert.equal(rules.covered, 1);
  assert.equal(rules.total, 2);
  assert.ok(out.unverified.some((u) => /rule Grade\/b/.test(u)), 'unmatched rule b is flagged');
});

test('guarantee + prohibition coverage reflect attached verifications', () => {
  const out = JSON.parse(cov(write('b.thunder', SRC), ['--json']).stdout);
  const g = out.metrics.find((m) => m.name === 'Guarantees');
  const p = out.metrics.find((m) => m.name === 'Prohibitions');
  assert.equal(g.covered, 1); assert.equal(g.total, 2);
  assert.equal(p.covered, 0); assert.equal(p.total, 1);
});

test('--coverage is informational by default, but --strict fails on any gap', () => {
  assert.equal(cov(write('c.thunder', SRC)).status, 0);
  assert.equal(cov(write('d.thunder', SRC), ['--strict']).status, 1);
});
