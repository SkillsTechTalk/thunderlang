// Writing in Thunder: every edit kind on TypeScript, Python, and Go, written as a minimal patch and proven.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { thunderWrite, EDIT_OPS, describeEdit } from '../src/write-steps.mjs';
import * as core from '../src/core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => ({ path: name, source: readFileSync(join(here, 'fixtures', 'write-steps', name), 'utf8') });

// The same refund module in three languages, and where each step is.
const L = {
  ts: { file: 'refunds.ts', can: 'canRefund', amt: 'refundAmount', tier: 'shippingTier', days: 'daysSince', ifStatus: 8, stop: 9, ifDays: 11, total: 15, audit: 16, ret: 17, amtIf: 22, amtNotify: 25, amtRet: 26, tier100: 33 },
  py: { file: 'refunds.py', can: 'can_refund', amt: 'refund_amount', tier: 'shipping_tier', days: 'days_since', ifStatus: 9, stop: 10, ifDays: 11, total: 13, audit: 14, ret: 15, amtIf: 20, amtNotify: 22, amtRet: 23, tier100: 29 },
  go: { file: 'refunds.go', can: 'CanRefund', amt: 'RefundAmount', tier: 'ShippingTier', days: 'daysSince', ifStatus: 13, stop: 14, ifDays: 16, total: 19, audit: 20, ret: 21, amtIf: 27, amtNotify: 30, amtRet: 31, tier100: 38 },
};

/** Lines that differ between two texts (as a count of removed and added lines). */
function changedLines(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  let s = 0; while (s < x.length && s < y.length && x[s] === y[s]) s++;
  let i = x.length, j = y.length; while (i > s && j > s && x[i - 1] === y[j - 1]) { i--; j--; }
  return { removed: x.slice(s, i), added: y.slice(s, j) };
}
function written(r) {
  assert.equal(r.status, 'written', `${r.says}\n${r.reason ?? ''}`);
  assert.equal(r.author, 'thunder');
  assert.equal(r.proof.edited.status, 'proven');
  assert.ok(r.proof.edited.checks.every((c) => c.result === 'exact'));
  assert.equal(r.proof.unchanged.status, 'same');
  assert.ok(r.proof.unchanged.items.every((i) => i.status === 'same'));
  return r;
}
const run = (k, edits, more = []) => thunderWrite([fx(L[k].file), ...more], edits);
const newSource = (k, r) => r.files[L[k].file];

for (const k of ['ts', 'py', 'go']) {
  const l = L[k];
  const m = l.can;

  test(`${k}: setValue changes only that number, keeps the comment, and nothing else changes`, () => {
    const r = written(run(k, { op: 'setValue', member: m, step: `line:${l.ifDays}`, to: 10 }));
    const d = changedLines(fx(l.file).source, newSource(k, r));
    assert.equal(d.removed.length, 1);
    assert.equal(d.added.length, 1);
    assert.equal(d.added[0], d.removed[0].replace('> 7', '> 10'));
    assert.match(r.says, /Changed 7 to 10/);
    assert.match(r.says, /now reads "If (daysSince|days_since) is more than 10"/);
    assert.match(r.says, /nothing else changed: 2 other functions in the file mean exactly the same/);
    assert.match(r.after, /more than 10/);
    assert.match(r.before, /more than 7/);
    assert.match(r.patch, /^--- a\/refunds\./);
  });

  test(`${k}: setCondition — comparison, one side, negation, add and remove a clause`, () => {
    let r = written(run(k, { op: 'setCondition', member: m, step: `line:${l.ifDays}`, compare: '>=' }));
    assert.match(newSource(k, r), new RegExp(`${l.days} >= 7`));
    r = written(run(k, { op: 'setCondition', member: m, step: `line:${l.ifStatus}`, clause: 0, operand: { side: 'right', to: '"settled"' } }));
    assert.match(newSource(k, r), /settled/);
    r = written(run(k, { op: 'setCondition', member: m, step: `line:${l.ifDays}`, negate: true }));
    assert.match(r.says, /turned the question around/);
    r = written(run(k, { op: 'setCondition', member: m, step: `line:${l.ifStatus}`, removeClause: 1 }));
    assert.doesNotMatch(newSource(k, r).split('\n')[l.ifStatus - 1], /[Gg]ift/);
    r = written(run(k, { op: 'setCondition', member: m, step: `line:${l.ifDays}`, addClause: { join: 'and', when: 'order.opened' } }));
    assert.match(newSource(k, r).split('\n')[l.ifDays - 1], /opened/);
  });

  test(`${k}: addStep, removeStep, moveStep keep the indentation and every other line`, () => {
    let r = written(run(k, { op: 'addStep', member: m, after: `line:${l.audit}`, step: 'notify(order.customer)' }));
    let d = changedLines(fx(l.file).source, newSource(k, r));
    assert.equal(d.removed.length, 0);
    assert.equal(d.added.length, 1);
    assert.equal(d.added[0].match(/^\s*/)[0], fx(l.file).source.split('\n')[l.audit - 1].match(/^\s*/)[0]);
    r = written(run(k, { op: 'removeStep', member: m, step: `line:${l.audit}` }));
    d = changedLines(fx(l.file).source, newSource(k, r));
    assert.equal(d.removed.length, 1);
    assert.equal(d.added.length, 0);
    r = written(run(k, { op: 'moveStep', member: m, step: `line:${l.total}`, before: `line:${l.ifDays}` }));
    assert.match(r.says, /^Moved/);
    assert.ok(newSource(k, r).indexOf('order.Amount * 2'.replace('Amount', k === 'go' ? 'Amount' : 'amount')) < newSource(k, r).indexOf(`${l.days} > 7`));
  });

  test(`${k}: addStop as a new question, and on a question's side; removeStop removes its question too`, () => {
    let r = written(run(k, { op: 'addStop', member: m, before: `line:${l.total}`, when: k === 'go' ? 'order.Amount <= 0' : 'order.amount <= 0', message: 'nothing to refund' }));
    assert.match(newSource(k, r), /nothing to refund/);
    assert.match(r.says, /Added a Stop: if order\.[Aa]mount <= 0/);
    if (k === 'ts') assert.match(newSource(k, r), /throw new Error\('nothing to refund'\);/, 'the file\'s quote style');
    if (k === 'py') assert.match(newSource(k, r), /raise ValueError\("nothing to refund"\)/);
    if (k === 'go') assert.match(newSource(k, r), /return false, errors\.New\("nothing to refund"\)/);
    r = written(run(k, { op: 'removeStop', member: m, step: `line:${l.stop}` }));
    const d = changedLines(fx(l.file).source, newSource(k, r));
    assert.equal(d.added.length, 0);
    assert.equal(d.removed.length, k === 'py' ? 2 : 3);
    assert.match(r.says, /and its question/);
    // A Stop on the no side of a question adds that side.
    // (Go: only a function that gives back an error can stop.)
    r = written(run(k, k === 'go' ? { op: 'addStop', member: m, step: `line:${l.ifDays}`, side: 'no', message: 'no refund due' } : { op: 'addStop', member: l.amt, step: `line:${l.amtIf}`, side: 'no', message: 'no refund due' }));
    assert.match(newSource(k, r), /else/);
  });

  test(`${k}: addInput, removeInput (refused while it is used), setGivesBack`, () => {
    let r = written(run(k, { op: 'addInput', member: m, name: 'limit', ...(k === 'go' ? { type: 'int' } : k === 'ts' ? { type: 'number', default: 7 } : { default: 7 }) }));
    assert.match(newSource(k, r).split('\n').find((x) => x.includes(`${m}(`)), /limit/);
    r = run(k, { op: 'removeInput', member: m, name: l.days });
    assert.equal(r.status, 'refused');
    assert.match(r.reason, /still used/);
    // Changing the question first, then removing the input it no longer uses, is one change.
    r = written(run(k, [{ op: 'setCondition', member: m, step: `line:${l.ifDays}`, when: k === 'go' ? 'order.Age > 7' : 'order.age > 7' }, { op: 'removeInput', member: m, name: l.days }]));
    assert.doesNotMatch(newSource(k, r).split('\n').find((x) => x.includes(`${m}(`)), new RegExp(l.days));
    r = written(run(k, { op: 'setGivesBack', member: l.amt, step: `line:${l.amtRet}`, value: 'amount * 100' }));
    assert.match(newSource(k, r), /return amount \* 100/);
  });

  test(`${k}: rename an input, and the function with its calls`, () => {
    let r = written(run(k, { op: 'rename', member: m, from: l.days, to: 'daysLate' }));
    assert.equal((newSource(k, r).match(/daysLate/g) || []).length, 2);
    assert.doesNotMatch(newSource(k, r), new RegExp(`\\b${l.days}\\b`));
    const caller = k === 'ts' ? { path: 'caller.ts', source: `import { refundAmount } from './refunds';\n\nexport function pay(o: Order) {\n  return refundAmount(o, 5);\n}\n` }
      : k === 'py' ? { path: 'caller.py', source: 'from refunds import refund_amount\n\n\ndef pay(o):\n    return refund_amount(o, 5)\n' }
        : { path: 'caller.go', source: 'package refunds\n\nfunc Pay(o Order) int {\n\treturn RefundAmount(o, 5)\n}\n' };
    r = written(run(k, { op: 'rename', member: l.amt, to: k === 'go' ? 'ComputeRefund' : k === 'py' ? 'compute_refund' : 'computeRefund' }, [caller]));
    assert.match(r.files[caller.path], /ompute_?[Rr]efund\(o, 5\)/);
  });

  test(`${k}: addFunction from Thunder steps`, () => {
    const r = written(run(k, { op: 'addFunction', file: l.file, name: k === 'go' ? 'IsLate' : k === 'py' ? 'is_late' : 'isLate', inputs: [k === 'py' ? 'days' : { name: 'days', type: k === 'go' ? 'int' : 'number' }], ...(k === 'go' ? { returns: 'bool' } : {}), steps: [{ if: 'days > 30', then: [k === 'py' ? 'return True' : 'return true'] }, k === 'py' ? 'return False' : 'return false'] }));
    assert.match(r.says, /with 2 steps/);
    assert.equal(r.proof.unchanged.checked, 3);
  });

  test(`${k}: a decision (a rule) is edited by its steps too, and still reads as a rule`, () => {
    const r = written(run(k, { op: 'setValue', member: l.tier, step: `line:${l.tier100}`, to: 150 }));
    assert.match(newSource(k, r), /total >= 150/);
  });

  test(`${k}: refusals say why and change nothing`, () => {
    for (const [e, why] of [
      [{ op: 'setValue', member: m, step: 'line:999', to: 1 }, /no step/],
      [{ op: 'setValue', member: m, step: `line:${l.ifDays}`, to: 7 }, /already 7/],
      [{ op: 'setValue', member: 'nope', step: 1, to: 1 }, /No function named nope/],
      [{ op: 'fly', member: m }, /not a Thunder edit/],
      [{ op: 'setCondition', member: m, step: `line:${l.total}`, negate: true }, /not a question/],
      [{ op: 'addStop', member: m, step: `line:${l.ifDays}`, side: 'yes', message: 'x' }, /already ends/],
      [{ op: 'rename', member: m, from: l.days, to: 'total' }, /already used/],
    ]) {
      const r = run(k, e);
      assert.equal(r.status, 'refused', JSON.stringify(e));
      assert.match(r.reason, why);
      assert.equal(r.patch, undefined);
    }
  });
}

test('every edit kind is listed and described in plain words', () => {
  assert.deepEqual(EDIT_OPS, ['setValue', 'setCondition', 'addStep', 'removeStep', 'moveStep', 'addStop', 'removeStop', 'addInput', 'removeInput', 'setGivesBack', 'rename', 'addFunction']);
  assert.match(describeEdit({ op: 'setValue', member: 'can_refund', step: 'line:11', from: 7, to: 10 }), /Change the value 7 to 10 \(step line:11\) in can_refund/);
});

test('needs-ai: a language the writers do not cover gets a precise, self-contained instruction', () => {
  const java = { path: 'Refunds.java', source: 'public class Refunds {\n  public static boolean canRefund(Order order, int daysSince) {\n    if (daysSince > 7) {\n      return false;\n    }\n    return true;\n  }\n}\n' };
  const r = thunderWrite([java], { op: 'setValue', member: 'canRefund', step: 'line:3', to: 10 });
  assert.equal(r.status, 'needs-ai');
  assert.equal(r.patch, undefined);
  assert.match(r.prompt, /File: Refunds\.java \(Java\)\. Function canRefund, lines 2–7/);
  assert.match(r.prompt, /3 \|     if \(daysSince > 7\) \{/);
  assert.match(r.prompt, /Change the value to 10/);
  assert.match(r.prompt, /Keep every other line exactly as it is/);
  assert.match(r.prompt, /labeled "AI-written"/);
});

test('needs-ai: an edit that does not fit the code shape is never a broken patch', () => {
  // A Go function that gives back no error cannot stop without changing its signature.
  const r = thunderWrite([fx('refunds.go')], { op: 'addStop', member: 'RefundAmount', before: 'line:26', when: 'fee < 0', message: 'fee cannot be negative' });
  assert.equal(r.status, 'needs-ai');
  assert.match(r.reason, /does not give back an error/);
  assert.match(r.prompt, /func RefundAmount\(order Order, fee int\) int \{/);
  assert.equal(r.patch, undefined);
  // A one-line arrow function: the step shares its line with the function's head.
  const ts = { path: 'is.ts', source: 'export const isBig = (n: number): boolean => n > 100;\n' };
  const r2 = thunderWrite([ts], { op: 'addStop', member: 'isBig', before: 'line:1', when: 'n < 0', message: 'negative' });
  assert.equal(r2.status, 'needs-ai');
  assert.match(r2.prompt, /isBig/);
});

test('the proof catches a wrong patch: an AI-written change is checked and labeled, never trusted', () => {
  const f = fx('refunds.py');
  const edit = { op: 'setValue', member: 'can_refund', step: 'line:11', to: 10 };
  // Right: the same change, written by someone else.
  const good = f.source.replace('days_since > 7', 'days_since > 10');
  let r = thunderWrite([f], edit, { candidate: { 'refunds.py': good } });
  assert.equal(r.status, 'written');
  assert.equal(r.author, 'ai');
  assert.equal(r.label, 'AI-written');
  assert.match(r.says, /^AI-written:/);
  // Wrong value.
  r = thunderWrite([f], edit, { candidate: { 'refunds.py': f.source.replace('days_since > 7', 'days_since > 11') } });
  assert.equal(r.status, 'refused');
  assert.match(r.reason, /can_refund: step 2 reads "if days_since > 11", not "if days_since > 10"/);
  // Right value, but something else changed too (another function's limit).
  r = thunderWrite([f], edit, { candidate: { 'refunds.py': good.replace('total >= 100', 'total >= 99') } });
  assert.equal(r.status, 'refused');
  assert.match(r.reason, /shipping_tier \(refunds\.py\) reads differently after the change/);
  assert.equal(r.proof.unchanged.status, 'failed');
  // A change that only renames a name used in another function is not "the same" either.
  r = thunderWrite([f], edit, { candidate: { 'refunds.py': good.replace('amount = order.amount - fee', 'amount = order.amount + fee') } });
  assert.equal(r.status, 'refused');
  assert.match(r.reason, /refund_amount/);
});

test('formatting is preserved byte for byte outside the edited lines (CRLF-free, tabs, comments)', () => {
  const f = fx('refunds.go');
  const r = written(thunderWrite([f], [{ op: 'setValue', member: 'CanRefund', step: 'line:16', to: 14 }, { op: 'addStep', member: 'RefundAmount', after: 'line:30', step: 'audit("refund", amount)' }]));
  const after = r.files['refunds.go'].split('\n');
  const before = f.source.split('\n');
  assert.equal(after.length, before.length + 1);
  assert.equal(after[15], '\tif daysSince > 14 { // policy: one week for opened items');
  assert.equal(after[30], '\taudit("refund", amount)');
  assert.deepEqual(after.filter((_, i) => i !== 15 && i !== 30), before.filter((_, i) => i !== 15));
});

test('both are exported from /core (browser-safe), and the decision writer still works', () => {
  assert.equal(typeof core.thunderWrite, 'function');
  assert.equal(core.WRITE_STEPS_SCHEMA, 'thunder-write-steps-v1');
  const w = core.writeRule({ source: fx('refunds.ts').source, language: 'typescript', decision: 'shippingTier', rule: 2, when: 'total >= 150' });
  assert.equal(w.ok, true);
});

test('CLI: thunder write --edit is a dry run by default; --apply saves; --test runs a command', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-write-'));
  const file = join(dir, 'refunds.py');
  copyFileSync(join(here, 'fixtures', 'write-steps', 'refunds.py'), file);
  const cli = join(here, '..', 'src', 'cli.mjs');
  const edit = JSON.stringify({ op: 'setValue', member: 'can_refund', step: 'line:11', to: 10 });
  let out = execFileSync(process.execPath, [cli, 'write', file, '--edit', edit], { encoding: 'utf8' });
  assert.match(out, /Dry run; nothing was saved/);
  assert.match(out, /edited     can_refund: reads exactly as the edit says/);
  assert.equal(readFileSync(file, 'utf8'), readFileSync(join(here, 'fixtures', 'write-steps', 'refunds.py'), 'utf8'));
  out = execFileSync(process.execPath, [cli, 'write', file, '--edit', edit, '--json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(out).status, 'written');
  const check = join(dir, 'check.cjs');
  writeFileSync(check, `process.exit(require('fs').readFileSync(${JSON.stringify(file)}, 'utf8').includes('> 10') ? 0 : 1);\n`);
  out = execFileSync(process.execPath, [cli, 'write', file, '--edit', edit, '--test', `"${process.execPath}" "${check}"`, '--apply'], { encoding: 'utf8' });
  assert.match(out, /run .*: passed/);
  assert.match(out, /Saved/);
  assert.match(readFileSync(file, 'utf8'), /days_since > 10:  # policy/);
  // A failing test command leaves the file as it was, even with --apply.
  const was = readFileSync(file, 'utf8');
  const edit2 = JSON.stringify({ op: 'setValue', member: 'can_refund', step: 'line:11', to: 12 });
  assert.throws(() => execFileSync(process.execPath, [cli, 'write', file, '--edit', edit2, '--test', `"${process.execPath}" -e "process.exit(3)"`, '--apply'], { encoding: 'utf8' }));
  assert.equal(readFileSync(file, 'utf8'), was);
});
