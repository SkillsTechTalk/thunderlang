// examplesOf(source) (src/examples.mjs): every example in a Thunder file, as data (ROADMAP-2.0.md D.1). OpenThunder's
// Check reads examples to make sure success is never silently redefined, so the shape and the syntax read are stable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { examplesOf, EXAMPLES_SCHEMA } from '../src/program.mjs';
import { findProjectRoot } from '../src/core/project.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('Core: Expect lines with their function, inputs as written, and the expected answer', () => {
  const r = examplesOf([
    'To calculate discount:', '  Receive total and member', '  Give 0', '',
    'Test "members get 20% off":',
    '  Expect calculate discount with 150 and yes to be 30',
    '  Expect calculate discount with [1, 2] and "a and b" to be at least 2',
    '  Expect calculate discount with -1, yes to fail with "no"',
    '  Expect 1 + 1 to be 2',
    '  Set x to 3', '',
  ].join('\n'));
  assert.equal(r.schema, EXAMPLES_SCHEMA);
  assert.equal(r.kind, 'program');
  assert.equal(r.examples.length, 4);
  const [a, b, c, d] = r.examples;
  assert.deepEqual([a.kind, a.block, a.line, a.subject, a.inputs.map((i) => i.text), a.expected], ['expect', 'members get 20% off', 6, { kind: 'function', name: 'calculate discount' }, ['150', 'yes'], { mode: 'equals', comparison: 'is', text: '30' }]);
  assert.deepEqual([b.inputs.map((i) => i.text), b.expected], [['[1, 2]', '"a and b"'], { mode: 'compares', comparison: 'is at least', text: '2' }]);
  assert.deepEqual([c.inputs.map((i) => i.text), c.expected], [['-1', 'yes'], { mode: 'fails', comparison: null, text: '"no"' }]);
  assert.deepEqual([d.subject, d.inputs, d.expected.text], [{ kind: 'expression', name: null }, [], '2']);
  assert.equal(a.raw, 'Expect calculate discount with 150 and yes to be 30');
});

test('examples are read even when another part of the program does not compile', () => {
  const r = examplesOf('To f:\n  Receive n\n  Give n +\nTest "t":\n  Expect f with 1 to be 2\n');
  assert.equal(r.problems, 1);
  assert.deepEqual(r.examples.map((e) => [e.subject.name, e.inputs.map((i) => i.text), e.expected.text]), [['f', ['1'], '2']]);
});

test('missions: decision cases with given names, lifecycle scenarios with events', () => {
  const spend = examplesOf(readFileSync(join(ROOT, 'examples', 'AgentSpendBudget.thunder'), 'utf8'));
  assert.equal(spend.kind, 'mission');
  const first = spend.examples[0];
  assert.deepEqual([first.kind, first.block, first.name, first.subject, first.inputs, first.expected], ['case', 'SpendAdmission', 'below the budget', { kind: 'decision', name: 'SpendAdmission' }, [{ name: 'remainingCents', text: '100' }, { name: 'reservedCents', text: '99' }], { mode: 'result', comparison: 'is', text: 'Admit' }]);
  assert.match(first.raw, /^case below the budget\ngiven remainingCents 100, reservedCents 99\nexpect Admit$/);
  const alerts = examplesOf(readFileSync(join(ROOT, 'examples', 'AlertRouting.thunder'), 'utf8'));
  const s = alerts.examples.find((e) => e.kind === 'scenario');
  assert.equal(s.subject.kind, 'lifecycle');
  assert.ok(s.inputs.length > 0 && s.inputs.every((i) => i.name === 'event'));
});

test('every .thunder file in the repository: each example has a line, a subject, and an expected answer', () => {
  const files = execFileSync('git', ['ls-files', '*.thunder'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  let total = 0;
  for (const f of files) {
    const path = join(ROOT, f);
    const r = examplesOf(readFileSync(path, 'utf8'), { file: f, kind: findProjectRoot(path) ? 'program' : null });
    for (const e of r.examples) {
      assert.ok(Number.isInteger(e.line) && e.line > 0, `${f}: ${JSON.stringify(e)}`);
      assert.ok(e.subject && e.expected && e.raw, `${f}: ${JSON.stringify(e)}`);
      assert.ok(!e.inputsUnread, `${f}, line ${e.line}: inputs could not be read from "${e.raw}"`);
      total++;
    }
  }
  assert.ok(total > 50, `only ${total} examples`);
});

test('a test file that calls functions from another file: its Expect lines are read from their text', () => {
  const r = examplesOf('Test "members get 20% off":\n  Expect calculate discount with 150 and yes to be 30\n  Expect withdraw with 10 and 30 to fail with "Insufficient funds"\n', { kind: 'program' });
  assert.deepEqual(r.examples.map((e) => [e.line, e.subject.name, e.inputs.map((i) => i.text), e.expected.mode, e.expected.text, e.fromText]), [
    [2, 'calculate discount', ['150', 'yes'], 'equals', '30', true],
    [3, 'withdraw', ['10', '30'], 'fails', '"Insufficient funds"', true],
  ]);
});
