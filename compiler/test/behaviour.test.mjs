// The behaviour check (src/behaviour.mjs): run a Python function before and after a change on inputs made from its
// code, and list the answers that changed. Used by thunder write --behaviour, intent_write, and the read/write page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { behaviourCheck, pythonParams, probeValues, inputKinds, typedInputs, generatedArgs } from '../src/behaviour.mjs';
import { findPython } from '../src/core/project.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const PY = findPython();
const skip = PY.error ? `Python 3.10+ not found: ${PY.error}` : false;

const REFUND = [
  'def can_refund(amount, days, refunded):',
  '    if refunded:',
  '        return "review"',
  '    if amount <= 100 and days <= 30:',
  '        return "approve"',
  '    return "review"',
  '',
].join('\n');

test('inputs come from the code: its numbers and one either side, and what each input is used as', () => {
  const sig = pythonParams(REFUND, 'can_refund');
  assert.deepEqual(sig.params.map((p) => p.name), ['amount', 'days', 'refunded']);
  assert.deepEqual(pythonParams('def f(a, *rest):\n  pass', 'f'), { unsupported: 'it takes extra values (*rest)' });
  assert.equal(pythonParams('class A:\n  def f(self): pass', 'f'), null);
  const values = probeValues(REFUND);
  for (const v of [99, 100, 101, 29, 30, 31, 0, true, false, null, 'review', 'approve', '']) assert.ok(values.some((x) => JSON.stringify(x) === JSON.stringify(v)), `missing ${v}`);
  assert.deepEqual(inputKinds(REFUND, sig.params), { amount: 'number', days: 'number', refunded: 'bool' });
  assert.deepEqual(inputKinds('def g(tier):\n    if tier == "gold":\n        return 1', [{ name: 'tier' }]), { tier: 'text' });
  const inputs = typedInputs(sig.params, values, inputKinds(REFUND, sig.params));
  assert.ok(inputs.some((a) => a[0] === 100 && a[1] === 30 && a[2] === false), 'the boundary case is tried');
  assert.ok(inputs.some((a) => a[2] === null), 'odd values are tried one input at a time');
  // The same code always gets the same inputs.
  assert.deepEqual(typedInputs(sig.params, values, inputKinds(REFUND, sig.params)), inputs);
  // A round trip uses typed inputs only, as Python source.
  const args = generatedArgs(REFUND, 'can_refund');
  assert.ok(args.includes('100, 30, False'));
  assert.ok(!args.some((a) => a.includes('None')));
});

test('a changed boundary is reported with the clearest input first', { skip }, () => {
  const r = behaviourCheck({ path: 'refund.py', name: 'can_refund', before: REFUND, after: REFUND.replace('amount <= 100', 'amount <= 99') });
  assert.equal(r.status, 'changed');
  assert.ok(r.inputs > 100);
  assert.ok(r.changes.every((c) => c.inputs.amount === 100), JSON.stringify(r.changes.slice(0, 3)));
  assert.match(r.examples[0], /^amount 100, days \d+, refunded False: before 'approve', after 'review'$/);
  assert.match(r.says, /gave a different answer/);
});

test('no change, a broken file, errors, printing, and what is not run', { skip }, () => {
  assert.equal(behaviourCheck({ path: 'refund.py', name: 'can_refund', before: REFUND, after: REFUND }).status, 'same');
  const broken = behaviourCheck({ path: 'refund.py', name: 'can_refund', before: REFUND, after: REFUND.replace('return "review"\n', 'return "review"\n  oops(\n') });
  assert.equal(broken.status, 'broken');
  assert.match(broken.reason, /Error/);
  const before = 'def half(n):\n    return n / 2\n';
  const r = behaviourCheck({ path: 'm.py', name: 'half', before, after: 'def half(n):\n    print("halving")\n    return n // 2\n' });
  assert.equal(r.status, 'changed');
  assert.ok(r.changes.some((c) => /printed "halving"/.test(c.after)));
  const slow = behaviourCheck({ path: 'm.py', name: 'half', before, after: 'def half(n):\n    while True:\n        pass\n' });
  assert.equal(slow.status, 'changed');
  assert.match(slow.changes[0].after, /took longer than a second/);
  assert.equal(behaviourCheck({ path: 'a.ts', name: 'f', before: '', after: '' }).status, 'not-run');
  assert.equal(behaviourCheck({ path: 'm.py', name: 'nope', before, after: before }).status, 'not-run');
});

test('thunder write --behaviour prints the changed answers and is a dry run', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-behaviour-'));
  try {
    writeFileSync(join(dir, 'refund.py'), REFUND);
    const r = spawnSync(process.execPath, [CLI, 'write', 'refund.py', '--edit', '{"op":"setValue","member":"can_refund","step":"line:4","from":"100","to":99}', '--behaviour'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /behaviour {2}refund\.py#can_refund: \d+ of \d+ inputs give a different answer/);
    assert.match(r.stdout, /amount 100, days \d+, refunded False: before 'approve', after 'review'/);
    assert.match(r.stdout, /tested on these inputs only; not a proof/);
    assert.equal(readFileSync(join(dir, 'refund.py'), 'utf8'), REFUND);
    const j = spawnSync(process.execPath, [CLI, 'write', 'refund.py', '--edit', '{"op":"setValue","member":"can_refund","step":"line:4","from":"100","to":99}', '--behaviour', '--json'], { cwd: dir, encoding: 'utf8' });
    const out = JSON.parse(j.stdout);
    assert.equal(out.proof.behaviour[0].status, 'changed');
    assert.equal(out.proof.behaviour[0].schema, 'thunder-behaviour-v1');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
