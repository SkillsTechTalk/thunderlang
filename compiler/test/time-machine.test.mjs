// The Thunder Time Machine: thunder run --record, then thunder replay steps forward and back through the recording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compileCore } from '../src/core/index.mjs';
import { recordedRun } from '../src/core/engine-core.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const PROGRAM = `To delivery fee:
  Receive total
  When total is at least $20:
    Give $0
  Otherwise:
    Give $3.99

Set total to $12.50
Increase total by $10
Set fee to delivery fee with total
say "Delivery: {fee}"
`;
const cli = (args, opts = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', input: '', ...opts });
const project = (src) => {
  const d = mkdtempSync(join(tmpdir(), 'thunder-tm-'));
  spawnSync(process.execPath, [CLI, 'new', 'shop'], { cwd: d, encoding: 'utf8' });
  writeFileSync(join(d, 'shop', 'src', 'main.thunder'), src);
  return d;
};

test('a recording keeps each step in order: what changed, calls, what a function gave back, and what was said', () => {
  const r = recordedRun({ entry: compileCore(PROGRAM, { file: 'main.thunder' }) });
  assert.equal(r.stdout, 'Delivery: $0.00\n');
  assert.deepEqual(r.steps.map((s) => [s.line, s.depth, s.fn ?? '']), [[8, 1, ''], [9, 1, ''], [10, 1, ''], [3, 2, 'delivery fee'], [4, 2, 'delivery fee'], [11, 1, '']]);
  assert.deepEqual(r.steps[1].changes, [{ name: 'total', before: '$12.50', after: '$22.50' }]);
  assert.deepEqual(r.steps[2].changes, [{ name: 'fee', after: '$0.00' }]);
  assert.equal(r.steps[3].next, 4);
  assert.equal(r.steps[4].gives, '$0.00');
  assert.equal(r.steps[5].said, 'Delivery: $0.00\n');
  assert.deepEqual(recordedRun({ entry: compileCore(PROGRAM, { file: 'main.thunder' }) }).steps, r.steps, 'the same run records the same steps');
});

test('thunder run --record saves the recording (the output is the same as a normal run); thunder replay shows each step', () => {
  const d = project(PROGRAM);
  try {
    const run = cli(['run', 'shop', '--record', 'run.json'], { cwd: d });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, 'Delivery: $0.00\n');
    assert.match(run.stderr, /^Recorded 6 steps in run\.json\.\nStep through it: thunder replay run\.json\n$/);
    const trace = JSON.parse(readFileSync(join(d, 'run.json'), 'utf8'));
    assert.equal(trace.schema, 'thunder-time-machine-v1');
    assert.equal(trace.engine, 'thunder');
    assert.ok(trace.files['src/main.thunder'].includes('Give $3.99'));
    assert.equal(cli(['replay', 'run.json', '--step', '2'], { cwd: d }).stdout, '⏱ Step 2 of 6 · src/main.thunder, line 9 · in the program\n  Increase total by $10\n  total: $12.50 → $22.50\n');
    assert.match(cli(['replay', 'run.json', '--step', '3'], { cwd: d }).stdout, /Calls "delivery fee" \(steps 4–5\), then:\n {2}fee: → \$0\.00/);
    assert.match(cli(['replay', 'run.json', '--step', '4'], { cwd: d }).stdout, /When total is at least \$20:\n {2}→ yes\n$/);
    assert.match(cli(['replay', 'run.json', '--step', '5'], { cwd: d }).stdout, /gives back \$0\.00/);
    // Forward, back, jump, quit, from piped keys.
    const walk = cli(['replay', 'run.json'], { cwd: d, input: '\nb\nj 6\nq\n' });
    assert.equal(walk.status, 0);
    assert.match(walk.stdout, /it never undoes anything the program did\./i);
    const order = [...walk.stdout.matchAll(/⏱ Step (\d+) of 6/g)].map((m) => Number(m[1]));
    assert.deepEqual(order, [1, 2, 1, 6]);
    assert.match(walk.stdout, /says: Delivery: \$0\.00/);
  } finally { rmSync(d, { recursive: true }); }
});

test('a decision that goes the other way says so: "no, so the Otherwise steps"', () => {
  const d = project(PROGRAM.replace('$12.50', '$2.50'));
  try {
    cli(['run', 'shop', '--record', 'r.json'], { cwd: d });
    assert.match(cli(['replay', 'r.json', '--step', '4'], { cwd: d }).stdout, /→ no, so the Otherwise steps \(line 5\)/);
  } finally { rmSync(d, { recursive: true }); }
});

test('a program that stops with a problem is recorded up to that step, and says why', () => {
  const d = project('Set count to 3\nSet left to 10 / (count - 3)\nsay left\n');
  try {
    const run = cli(['run', 'shop', '--record', 'r.json'], { cwd: d });
    assert.equal(run.status, 1);
    const last = cli(['replay', 'r.json', '--step', '2'], { cwd: d }).stdout;
    assert.match(last, /✗ stopped here: /);
    assert.equal(JSON.parse(readFileSync(join(d, 'r.json'), 'utf8')).steps.length, 2);
  } finally { rmSync(d, { recursive: true }); }
});

test('mistakes say what to do', () => {
  const d = project(PROGRAM);
  try {
    assert.match(cli(['run', 'shop', '--record'], { cwd: d }).stderr, /--record needs a file/);
    assert.match(cli(['run', 'shop', '--record', 'x.json', '--target', 'typescript'], { cwd: d }).stderr, /a recording is made on the Thunder engine; leave out --engine and --target/);
    assert.match(cli(['test', 'shop', '--record', 'x.json'], { cwd: d }).stderr, /--record is for thunder run/);
    assert.match(cli(['replay', 'nope.json'], { cwd: d }).stderr, /couldn't read nope\.json: there is no such file\. Make one with: thunder run <program> --record nope\.json/);
    writeFileSync(join(d, 'other.json'), '{"hello": 1}');
    assert.match(cli(['replay', 'other.json'], { cwd: d }).stderr, /other\.json is not a Thunder recording/);
    cli(['run', 'shop', '--record', 'ok.json'], { cwd: d });
    assert.match(cli(['replay', 'ok.json', '--step', '99'], { cwd: d }).stderr, /--step needs a number from 1 to 6/);
  } finally { rmSync(d, { recursive: true }); }
});
