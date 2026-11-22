import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePlainContract, renderPlainContract, compilePlainContract, previewPlainContract, explainPlain } from '../src/plain-contract.mjs';
import { previewHumanContract } from '../src/human-contract.mjs';
import { parseIntent } from '../src/parse.mjs';
import { evaluateDecision } from '../src/runtime.mjs';

const source = readFileSync(fileURLToPath(new URL('../../examples/human/RefundApproval.thunder-plain', import.meta.url)), 'utf8');
const human = readFileSync(fileURLToPath(new URL('../../examples/human/RefundReview.thunder-human', import.meta.url)), 'utf8');

test('plain refund contract compiles and its five examples pass on the real runtime', () => {
  const p = previewPlainContract(source);
  assert.equal(p.tests.total, 5);
  assert.equal(p.tests.failed, 0);
  assert.match(p.canonicalSource, /when onTime == true and amount >= 0 and amount <= 100/);
  assert.doesNotMatch(p.canonicalSource, /condition_1/);
});

test('rendering the parsed model reproduces the source exactly', () => {
  assert.equal(renderPlainContract(parsePlainContract(source)), source);
});

test('plain and compact human notations decide every boundary identically', () => {
  const plain = parseIntent(compilePlainContract(source)).decisions[0];
  const compact = parseIntent(previewHumanContract(human).canonicalSource).decisions[0];
  for (const amount of [-1, 0, 0.5, 99, 100, 100.01, 101, 1e6]) for (const on of [true, false]) {
    assert.equal(evaluateDecision(plain, { amount, onTime: on }).result, evaluateDecision(compact, { amount, withinWindow: on }).result, `${amount}/${on}`);
  }
});

test('changing "at most" to "under" fails exactly the boundary example', () => {
  const p = previewPlainContract(source.replace('is at most $100', 'is under $100'));
  assert.deepEqual(p.tests.results.filter(r => !r.pass).map(r => r.name), ['exactly at the limit']);
});

test('the explanation names the condition that failed, in plain words', () => {
  const m = parsePlainContract(source);
  const e = explainPlain(m, { amount: 150, onTime: true });
  assert.equal(e.outcome, 'Review');
  assert.equal(e.ruleIndex, -1);
  assert.deepEqual(e.rules[0].checks.filter(c => !c.ok).map(c => c.text), ['the amount is at most $100']);
});

test('dollars are enforced in conditions and examples', () => {
  assert.throws(() => parsePlainContract(source.replace('at most $100', 'at most 100')), /Line 12: the amount is in dollars/);
  assert.throws(() => parsePlainContract(source.replace('$99, on time', '99, on time')), /Line 16: the amount is in dollars/);
});

test('unknown words are rejected instead of guessed', () => {
  assert.throws(() => parsePlainContract(source.replace('    it is on time', '    it is early')), /Line 10: This condition does not name an input/);
  assert.throws(() => parsePlainContract(source.replace('$50, late', '$50, maybe')), /Write "on time" or "late"/);
  assert.throws(() => parsePlainContract(source.replace('$50, late   ', '$50')), /Give 2 values in this order/);
  assert.throws(() => parsePlainContract(source.replace('  Otherwise, Review.\n', '')), /Otherwise/);
});

test('any-of rules and other comparisons lower to the same runtime', () => {
  const s = `Alert
We need
  the severity score, a number
  whether it is on call or off duty
When do we page?
  Page when any of these is true:
    the severity score is over 8
    it is on call
  Otherwise, Queue.
Examples
  9, off duty   gives Page    (severe)
  2, off duty   gives Queue   (minor)
  2, on call    gives Page    (on call)
`;
  const p = previewPlainContract(s);
  assert.equal(p.tests.failed, 0);
  assert.match(p.canonicalSource, /severityScore > 8 or onCall == true/);
  assert.equal(renderPlainContract(p.model), s.replace('Alert\n', 'Alert\n\n').replace('  Otherwise, Queue.\nExamples', '  Otherwise, Queue.\n\nExamples').replace('off duty\nWhen', 'off duty\n\nWhen'));
});

test('the code reader can "thunder" plain Python into the same picture, marked for review', async () => {
  const { readCode } = await import('../src/read.mjs');
  const { plainFromReading, conditionText } = await import('../src/plain-contract.mjs');
  const py = 'def Refund(amount: float, withinWindow: bool) -> str:\n    if (((amount >= 0) and (amount <= 100)) and withinWindow):\n        return "Approve"\n    return "Review"\n';
  const m = plainFromReading(readCode(py, { language: 'python' }).items[0]);
  assert.equal(m.provenance, 'inferred-from-code');
  assert.deepEqual(m.rules[0].conditions.map(c => conditionText(m, c)), ['the amount is at least 0', 'the amount is at most 100', 'it is within window']);
  assert.equal(m.otherwise, 'Review');
  assert.ok(m.needsReview.some(n => /money/.test(n)));
  // Mixed and/or is not guessed.
  assert.equal(plainFromReading({ kind: 'decision', name: 'X', inputs: [{ name: 'a', type: 'number' }], rules: [{ when: 'a > 1 and a < 3 or a == 9', result: 'Yes' }], otherwise: { result: 'No' } }), null);
});

test('untyped languages are thundered with inferred types, and the inference is flagged for review', async () => {
  const { readCode } = await import('../src/read.mjs');
  const { plainFromReading } = await import('../src/plain-contract.mjs');
  const js = 'function refund(amount, withinWindow) {\n  if (amount >= 0 && amount <= 100 && withinWindow) {\n    return "Approve";\n  }\n  return "Review";\n}\n';
  const m = plainFromReading(readCode(js, { language: 'javascript' }).items.find(i => i.kind === 'decision'));
  assert.deepEqual(m.inputs.map(i => i.kind), ['number', 'yesno']);
  assert.ok(m.needsReview.some(n => /inferred/.test(n)));
});
