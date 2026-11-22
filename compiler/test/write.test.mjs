import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeRule } from '../src/write.mjs';
import { readCode } from '../src/read.mjs';

// The same refund rule in every language the reader supports: VIP first, then an amount limit.
const REFUND = {
  python: 'def approve_refund(amount, is_vip):\n    if is_vip:\n        return "Approve"\n    if amount <= 100.0:\n        return "Approve"\n    return "Review"\n',
  typescript: 'export function approveRefund(amount: number, isVip: boolean): string {\n  if (isVip) return "Approve";\n  if (amount <= 100) {\n    return "Approve";\n  }\n  return "Review";\n}\n',
  javascript: 'function approveRefund(amount, isVip) {\n  if (isVip) return "Approve";\n  if (amount <= 100) return "Approve";\n  return "Review";\n}\n',
  go: 'func ApproveRefund(amount float64, isVip bool) Decision {\n\tif isVip {\n\t\treturn Approve\n\t}\n\tif amount <= 100 {\n\t\treturn Approve\n\t}\n\treturn Review\n}\n',
  rust: 'fn approve_refund(amount: f64, is_vip: bool) -> &\'static str {\n    if is_vip { return "Approve"; }\n    if amount <= 100.0 { return "Approve"; }\n    "Review"\n}\n',
  csharp: 'class R {\n  public string ApproveRefund(decimal amount, bool isVip) {\n    if (isVip) return "Approve";\n    if (amount <= 100m) return "Approve";\n    return "Review";\n  }\n}\n',
  java: 'class R {\n  Decision approveRefund(double amount, boolean isVip) {\n    if (isVip) return Decision.APPROVE;\n    if (amount <= 100) return Decision.APPROVE;\n    return Decision.REVIEW;\n  }\n}\n',
  kotlin: 'fun approveRefund(amount: Double, isVip: Boolean): String {\n    if (isVip) return "Approve"\n    if (amount <= 100) return "Approve"\n    return "Review"\n}\n',
  php: '<?php\nfunction approve_refund($amount, $is_vip) {\n    if ($is_vip) return "Approve";\n    if ($amount <= 100) return "Approve";\n    return "Review";\n}\n',
  ruby: 'def approve_refund(amount, is_vip)\n  return "Approve" if is_vip\n  return "Approve" if amount <= 100\n  "Review"\nend\n',
};

const decisionOf = (source, language) => readCode(source, { language }).items.find((i) => i.kind === 'decision');
const changedLines = (a, b) => a.split('\n').map((l, i) => [l, b.split('\n')[i]]).filter(([x, y]) => x !== y);

test('changing a limit and its comparison edits only those characters, in every language', () => {
  for (const [language, source] of Object.entries(REFUND)) {
    const d = decisionOf(source, language);
    const rule = d.rules.findIndex((r) => /amount/.test(r.when)) + 1;
    assert.ok(rule > 0, `${language}: the amount rule is read`);
    const r = writeRule({ source, language, decision: d.name, rule, when: 'amount < 75'.replace('amount', d.rules[rule - 1].when.split(' ')[0]) });
    assert.ok(r.ok, `${language}: ${r.problems?.join(' ')}`);
    const lines = changedLines(source, r.source);
    assert.equal(lines.length, 1, `${language}: exactly one line changes`);
    assert.equal(lines[0][0].replace(/<=/, '<').replace(/100(\.0|m)?/, (m) => m.replace('100', '75')), lines[0][1], `${language}: only the operator and the number change`);
    assert.equal(r.source.length, source.length - 2, `${language}: nothing else is added or removed`);
    assert.match(r.after, /less than 75/);
    assert.ok(r.cases.changed.length > 0 && r.cases.changed.every((c) => c.before === 'Approve' || c.before === 'APPROVE'), language);
  }
});

test("the file's own spelling is kept: ===, decimals, number suffixes, and quote style", () => {
  const ts = "export function plan(tier: string, seats: number): string {\n  if (tier === 'gold') return 'Priority';\n  if (seats >= 10.5) return 'Priority';\n  return 'Standard';\n}\n";
  const a = writeRule({ source: ts, language: 'typescript', decision: 'plan', rule: 1, when: 'tier != "platinum"' });
  assert.ok(a.ok, a.problems?.join(' '));
  assert.match(a.source, /if \(tier !== 'platinum'\)/);
  const b = writeRule({ source: ts, language: 'typescript', decision: 'plan', rule: 2, when: 'seats >= 12' });
  assert.ok(b.ok, b.problems?.join(' '));
  assert.match(b.source, /seats >= 12\.0\)/);
  const cs = writeRule({ source: REFUND.csharp, language: 'csharp', decision: 'ApproveRefund', rule: 2, when: 'amount <= 250' });
  assert.match(cs.source, /amount <= 250m\)/);
});

test('changing an answer reuses a spelling the function already returns, or the text of a string answer', () => {
  const java = writeRule({ source: REFUND.java, language: 'java', decision: 'approveRefund', rule: 2, answer: 'REVIEW' });
  assert.ok(java.ok, java.problems?.join(' '));
  assert.match(java.source, /if \(amount <= 100\) return Decision\.REVIEW;/);
  const go = writeRule({ source: REFUND.go, language: 'go', decision: 'ApproveRefund', rule: 'otherwise', answer: 'Approve' });
  assert.ok(go.ok, go.problems?.join(' '));
  assert.match(go.source, /\treturn Approve\n}\n$/);
  const py = writeRule({ source: REFUND.python, language: 'python', decision: 'approve_refund', rule: 2, answer: 'Escalate' });
  assert.ok(py.ok, py.problems?.join(' '));
  assert.equal(changedLines(REFUND.python, py.source).length, 1);
  assert.match(py.source, /return "Escalate"/);
  assert.equal(py.after, 'If amount is at most 100, the answer is Escalate');
});

test('it refuses, and leaves the file untouched, when the change is not safe to write', () => {
  const ts = REFUND.typescript;
  const cases = [
    [{ rule: 2, when: 'amount < 75 and isVip == false' }, /shape/],
    [{ rule: 9, when: 'amount < 75' }, /no rule 9/],
    [{ rule: 'otherwise', when: 'amount < 75' }, /no condition/],
    [{ rule: 2, when: 'amount <= 100' }, /Nothing would change/],
    [{ rule: 2, when: 'amount < 75)' }, /could not be read|shape/],
  ];
  for (const [args, why] of cases) {
    const r = writeRule({ source: ts, language: 'typescript', decision: 'approveRefund', ...args });
    assert.equal(r.ok, false, JSON.stringify(args));
    assert.equal(r.source, ts);
    assert.match(r.problems.join(' '), why);
  }
  const invent = writeRule({ source: REFUND.java, language: 'java', decision: 'approveRefund', rule: 2, answer: 'DENY' });
  assert.equal(invent.ok, false);
  assert.match(invent.problems[0], /will not invent one/);
  assert.equal(writeRule({ source: ts, language: 'typescript', decision: 'missing', rule: 1, answer: 'Review' }).ok, false);
});

test('the changed cases are exactly the boundary inputs whose answer moves', () => {
  const r = writeRule({ source: REFUND.typescript, language: 'typescript', decision: 'approveRefund', rule: 2, when: 'amount < 75' });
  const moved = r.cases.changed.map((c) => [c.inputs.amount, c.inputs.isVip, c.before, c.after]);
  assert.deepEqual(moved, [[75, false, 'Approve', 'Review'], [76, false, 'Approve', 'Review'], [99, false, 'Approve', 'Review'], [100, false, 'Approve', 'Review']]);
  assert.match(r.cases.note, /not every possible input/);
  // VIP customers are approved before the limit is checked, so none of their answers move.
  assert.ok(r.cases.checked > moved.length);
});

test('other functions in the file are checked too, and stay byte-identical', () => {
  const source = `${REFUND.typescript}\nexport function shipping(weight: number): string {\n  if (weight > 100) return "Freight";\n  return "Parcel";\n}\n`;
  const r = writeRule({ source, language: 'typescript', decision: 'approveRefund', rule: 2, when: 'amount < 75' });
  assert.ok(r.ok, r.problems?.join(' '));
  assert.ok(r.source.endsWith('export function shipping(weight: number): string {\n  if (weight > 100) return "Freight";\n  return "Parcel";\n}\n'));
  assert.deepEqual(r.change.map((c) => c.line), [3, 3]);
});
