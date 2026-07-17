import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-eval-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const evals = (file, extra = []) => spawnSync(process.execPath, [CLI, 'test', file, '--evals', ...extra], { encoding: 'utf8' });

const SRC = `mission SupportAgent
evaluation SupportAgentSafety
  dataset support-safety-v3
  require
    prohibitedDisclosureRate == 0
    escalationRecall >= 0.95
    groundedAnswerRate >= 0.90
`;

test('an evaluation without results is DECLARED (never a silent pass)', () => {
  const out = JSON.parse(evals(write('a.thunder', SRC), ['--json']).stdout);
  assert.equal(out.total, 1);
  assert.equal(out.results[0].status, 'declared');
  assert.equal(out.results[0].requires.length, 3);
});

test('metrics that meet every threshold PASS', () => {
  const res = evals(write('b.thunder', SRC), ['--results', '{"prohibitedDisclosureRate":0,"escalationRecall":0.97,"groundedAnswerRate":0.93}']);
  assert.equal(res.status, 0, res.stdout);
  assert.match(res.stdout, /PASS.*SupportAgentSafety/);
});

test('a metric under threshold FAILS the run', () => {
  const res = evals(write('c.thunder', SRC), ['--results', '{"prohibitedDisclosureRate":0,"escalationRecall":0.97,"groundedAnswerRate":0.88}']);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /FAIL.*SupportAgentSafety/);
  const out = JSON.parse(evals(write('c2.thunder', SRC), ['--json', '--results', '{"prohibitedDisclosureRate":0,"escalationRecall":0.97,"groundedAnswerRate":0.88}']).stdout);
  const bad = out.results[0].checks.find((c) => c.metric === 'groundedAnswerRate');
  assert.equal(bad.pass, false);
  assert.equal(bad.actual, 0.88);
});

test('--strict fails when an evaluation is only declared (no results)', () => {
  const res = evals(write('d.thunder', SRC), ['--strict']);
  assert.equal(res.status, 1);
});
