import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';
import { readRepo } from '../src/read-repo.mjs';
import { promoteDecision } from '../src/promote.mjs';
import { previewHumanContract } from '../src/human-contract.mjs';
import { parseIntent } from '../src/parse.mjs';
import { evaluateDecision } from '../src/runtime.mjs';
import { READ_SAMPLES } from '../../src/app/read/samples.mjs';

test('every sample decision promotes to a contract whose examples all pass', () => {
  const idx = readRepo(READ_SAMPLES.map((s) => ({ path: s.file, source: s.source })));
  const decisions = idx.items.filter((i) => i.kind === 'decision');
  assert.equal(decisions.length, 11);
  for (const d of decisions) {
    const p = promoteDecision(d);
    assert.ok(p.ok, `${d.name}: ${p.reason}`);
    const report = previewHumanContract(p.source);
    assert.equal(report.tests.failed, 0, `${d.name}\n${p.source}`);
    assert.ok(report.tests.total >= d.rules.length + 1, `${d.name}: at least one example per rule and the fallback`);
  }
});

test('a promoted contract catches a boundary change made to the code later', () => {
  const java = READ_SAMPLES.find((s) => s.key === 'java-loans');
  const before = readCode(java.source, { file: java.file }).items.find((i) => i.name === 'decide');
  const contract = promoteDecision(before, { file: java.file });
  assert.match(contract.source, /case "creditScore exactly 500": \(amount: \d+, creditScore: 500, verifiedIncome: (true|false)\) -> Review/);
  // Someone "tidies" the code: < 500 becomes <= 500.
  const after = readCode(java.source.replace('creditScore < 500', 'creditScore <= 500'), { file: java.file }).items.find((i) => i.name === 'decide');
  const changed = parseIntent(after.thunder).decisions[0];
  const examples = parseIntent(previewHumanContract(contract.source).canonicalSource).tests[0].cases;
  const failing = examples.filter((c) => {
    const given = Object.fromEntries(Object.entries(c.given).map(([k, v]) => [k, v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v)]));
    return evaluateDecision(changed, given).result !== c.expect;
  });
  assert.ok(failing.some((c) => c.name === 'creditScore exactly 500'), 'the boundary example catches it');
  assert.ok(failing.every((c) => String(c.given.creditScore) === '500'), 'only examples at the changed boundary fail');
});

test('field paths become plain inputs, with a note mapping them back', () => {
  const r = readCode('export const fee = (order: Order): string => order.total >= 50 || order.member ? "Free" : "Standard";', { language: 'typescript' });
  const p = promoteDecision(r.items[0], { file: 'fee.ts' });
  assert.ok(p.ok, p.reason);
  assert.match(p.source, /decision Fee\(orderTotal: number, orderMember: boolean\)/);
  assert.match(p.source, /# orderTotal stands for order\.total in the code\./);
  assert.equal(previewHumanContract(p.source).tests.failed, 0);
});

test('refuses what a contract cannot hold, with the reason', () => {
  const nums = readCode('function code(ok: boolean) { return ok ? 200 : 500; }', { language: 'typescript' }).items[0];
  assert.match(promoteDecision(nums).reason, /200 is not a name/);
  const fn = readCode('function f(x: number) { log(x); return x * 2; }', { language: 'typescript' }).items[0];
  assert.match(promoteDecision(fn).reason, /Only decisions/);
});

test('switches over enum values promote with the enum members as text', async () => {
  const d = readCode(`class P { static String tier(Plan plan) {
    return switch (plan) { case FREE, TRIAL -> "Basic"; case PRO -> "Plus"; default -> "Custom"; };
  } }`, { language: 'java' }).items.find((i) => i.kind === 'decision');
  const p = promoteDecision(d);
  assert.ok(p.ok, p.reason);
  assert.match(p.source, /decision Tier\(plan: string\)/);
  assert.match(p.source, /when plan == "FREE" or plan == "TRIAL" -> Basic/);
  const report = previewHumanContract(p.source);
  assert.equal(report.tests.failed, 0);
  assert.equal(report.tests.total, 3);
});
