import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-all-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

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
  C#
  Java
`;

test('test --all-targets runs every live adapter and always includes the four targets', () => {
  const res = run(['test', write('a.thunder', SRC), '--all-targets', '--json']);
  const out = JSON.parse(res.stdout);
  assert.equal(out.schema, 'thunder-all-targets-v1');
  assert.deepEqual(out.targets.map((t) => t.target), ['typescript', 'python', 'csharp', 'java']);
  // TypeScript runs in-process, so it is always executed and must pass the faithful decision.
  const ts = out.targets.find((t) => t.target === 'typescript');
  assert.equal(ts.status, 'pass');
  assert.equal(ts.passed, ts.total);
  // Every entry is either executed (pass/fail) or skipped when its toolchain is absent.
  for (const t of out.targets) assert.ok(['pass', 'fail', 'skipped'].includes(t.status), t.target);
});

test('test --all-targets exits 0 when no available target fails', () => {
  const res = run(['test', write('b.thunder', SRC), '--all-targets']);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /target\(s\) executed/);
  assert.match(res.stdout, /PASS  Typescript/);
});

test('conform --all-targets shows every live target as a column and grades the available ones', () => {
  const out = JSON.parse(run(['conform', write('c.thunder', SRC), '--all-targets', '--json']).stdout);
  assert.equal(out.graded, true);
  assert.deepEqual(out.columns, ['typescript', 'python', 'csharp', 'java']);
  assert.ok(out.cases.every((c) => c.targets.typescript.status === 'pass'), 'TS conforms');
  // Absent toolchains stay declared and are listed under skipped.
  for (const c of out.cases) for (const col of ['csharp', 'java']) {
    assert.ok(['pass', 'declared'].includes(c.targets[col].status), col);
  }
});

test('conform --all-targets unions declared targets with all runnable targets (no --targets given)', () => {
  // A mission that declares only TypeScript still gets every runnable target as a column.
  const minimal = SRC.replace(/target\n(  .+\n)+/, 'target\n  TypeScript\n');
  const out = JSON.parse(run(['conform', write('d.thunder', minimal), '--all-targets', '--json']).stdout);
  assert.deepEqual(out.columns, ['typescript', 'python', 'csharp', 'java']);
});
