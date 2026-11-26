import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findSameRule, writeRuleAcross, writeAcrossEvidence, WRITE_ACROSS_SCHEMA } from '../src/write-across.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '../src/cli.mjs');

// One rule (free shipping from $50) written three times, in three languages, each in its own style.
const WEB = `// The cart page.
export function shippingNote(orderSubtotal: number): string {
  if (orderSubtotal >= 50) {   // keep this comment
    return "Free shipping";
  }
  return "Shipping: $5.99";
}
`;
const ORDERS = `namespace Shop;

public static class Shipping
{
    public static decimal ShippingFee(decimal orderSubtotal)
    {
        if (orderSubtotal >= 50.0m) return 0m;
        return 5.99m;
    }
}
`;
const BILLING = `def shipping_fee(order_subtotal):
    """Shipping on the receipt."""
    if order_subtotal >= 50:
        return 0
    return 5.99


def gift_wrap(order_subtotal):
    if order_subtotal >= 500:
        return "Free gift wrap"
    return "Gift wrap $3"


def freight(weight):
    if weight >= 50:
        return "Freight"
    return "Parcel"
`;
const TEST = `from billing import shipping_fee\nassert shipping_fee(50) == 0\nassert shipping_fee(10) == 5.99\n`;
const UNRELATED_TEST = `def test_timeout():\n    assert 50 > 1\n`;

const files = () => [
  { part: 'web', path: 'shipping.ts', source: WEB },
  { part: 'orders', path: 'Shipping.cs', source: ORDERS },
  { part: 'billing', path: 'billing.py', source: BILLING },
  { part: 'billing', path: 'test_billing.py', source: TEST },
  { part: 'billing', path: 'test_other.py', source: UNRELATED_TEST },
];

/** The new text equals the old text with only the listed spans replaced: nothing else moved, by a byte. */
function onlySpansChanged(before, after, changes) {
  const lines = before.split('\n');
  for (const c of [...changes].sort((a, b) => b.line - a.line || b.column - a.column)) {
    const l = lines[c.line - 1];
    assert.equal(l.slice(c.column - 1, c.column - 1 + c.before.length), c.before);
    lines[c.line - 1] = l.slice(0, c.column - 1) + c.after + l.slice(c.column - 1 + c.before.length);
  }
  assert.equal(after, lines.join('\n'));
}

test('one rule change is written into TypeScript, C#, and Python, and only its characters change', () => {
  const r = writeRuleAcross(files(), { decision: 'shippingNote', rule: 1, when: 'orderSubtotal >= 75' });
  assert.equal(r.schema, WRITE_ACROSS_SCHEMA);
  assert.equal(r.ok, true, r.problems.join('\n'));
  assert.deepEqual(r.plan.map((p) => `${p.part}/${p.file}:${p.language}`), ['billing/billing.py:python', 'orders/Shipping.cs:csharp', 'web/shipping.ts:typescript']);
  assert.deepEqual(r.rule, { before: 'orderSubtotal is at least 50', after: 'orderSubtotal is at least 75' });
  const at = (k) => r.plan.find((p) => `${p.part}/${p.file}` === k);
  assert.deepEqual(at('orders/Shipping.cs').change.map((c) => [c.before, c.after]), [['50.0m', '75.0m']]); // the file's own spelling
  assert.match(at('billing/billing.py').why, /same condition/);
  onlySpansChanged(WEB, r.files['web/shipping.ts'], at('web/shipping.ts').change);
  onlySpansChanged(ORDERS, r.files['orders/Shipping.cs'], at('orders/Shipping.cs').change);
  onlySpansChanged(BILLING, r.files['billing/billing.py'], at('billing/billing.py').change);
  assert.match(r.files['web/shipping.ts'], /\/\/ keep this comment/);
  // Test files are never edited; the one that calls the rule and mentions 50 is listed; the unrelated one is not.
  assert.equal(Object.keys(r.files).some((k) => k.includes('test_')), false);
  assert.deepEqual(r.tests.map((t) => `${t.file}:${t.line}`), ['test_billing.py:2']);
});

test('lookalikes are listed as not included, never changed', () => {
  const f = findSameRule(files(), { decision: 'shippingNote', rule: 1 });
  assert.equal(f.ok, true);
  assert.equal(f.same.length, 3);
  const not = Object.fromEntries(f.notIncluded.map((n) => [n.decision, n.why]));
  assert.match(not.gift_wrap, /same names but a different limit/);
  assert.match(not.freight, /same limit but different names/);
  const r = writeRuleAcross(files(), { decision: 'shippingNote', rule: 1, when: 'orderSubtotal >= 75' });
  assert.match(r.files['billing/billing.py'], /order_subtotal >= 500/);
  assert.match(r.files['billing/billing.py'], /weight >= 50/);
});

test('all or nothing: if one implementation cannot be written exactly, no file changes', () => {
  const ts = `export function tierNote(tier: string): string {\n  if (tier == "gold") {\n    return "Free shipping";\n  }\n  return "Standard";\n}\n`;
  const py = `def tier_fee(tier):\n    if tier == 'gold':\n        return 0\n    return 5\n`;
  const r = writeRuleAcross([{ part: 'web', path: 'tier.ts', source: ts }, { part: 'billing', path: 'tier.py', source: py }], { decision: 'tierNote', rule: 1, when: `tier == "o'neil"` });
  assert.equal(r.ok, false);
  assert.deepEqual(r.files, {});
  assert.match(r.problems[0], /every implementation must be written exactly, or none is/);
  assert.ok(r.problems.some((p) => p.includes('billing/tier.py') && /quote/.test(p)), r.problems.join('\n'));
});

test('a change to the rule\'s shape is refused before anything is written', () => {
  const r = writeRuleAcross(files(), { decision: 'shippingNote', rule: 1, when: 'orderSubtotal >= 75 and member == true' });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /changes the rule's shape/);
  const missing = writeRuleAcross(files(), { decision: 'nope', rule: 1, when: 'x >= 1' });
  assert.match(missing.problems[0], /No decision named nope/);
});

test('a name used in two places must be named with its file', () => {
  const twice = [{ part: 'a', path: 'x.py', source: 'def fee(total):\n    if total >= 5:\n        return 0\n    return 1\n' }, { part: 'b', path: 'x.py', source: 'def fee(total):\n    if total >= 5:\n        return 0\n    return 2\n' }];
  assert.match(findSameRule(twice, { decision: 'fee', rule: 1 }).problems[0], /Name one as "part\/file:fee"/);
  const r = writeRuleAcross(twice, { decision: 'a/x.py:fee', rule: 1, when: 'total >= 6' });
  assert.equal(r.ok, true);
  assert.equal(r.plan.length, 2);
});

test('passport evidence: one item per implementation, plus the lookalikes left for a person', () => {
  const r = writeRuleAcross(files(), { decision: 'shippingNote', rule: 1, when: 'orderSubtotal >= 75' });
  const ev = writeAcrossEvidence(r);
  assert.equal(ev.length, 4);
  assert.ok(ev.every((e) => e.kind === 'rule-write' && e.claim && e.basis && e.scope && e.inputs.length));
  assert.match(ev[3].claim, /2 similar rules were not changed/);
  assert.deepEqual(writeAcrossEvidence({ ok: false }), []);
});

test('thunder write <folders…>: the plan changes nothing; --write changes every file; --json for tools', () => {
  const root = mkdtempSync(join(tmpdir(), 'thunder-write-across-'));
  const put = (p, s) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), s); };
  put('web/shipping.ts', WEB); put('orders/Shipping.cs', ORDERS); put('billing/billing.py', BILLING); put('billing/test_billing.py', TEST);
  const run = (...args) => spawnSync(process.execPath, [cli, 'write', 'web', 'orders', 'billing', '--decision', 'shippingNote', '--rule', '1', '--when', 'orderSubtotal >= 75', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const plan = run();
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /One rule, 3 implementations: orderSubtotal is at least 50 {2}→ {2}orderSubtotal is at least 75/);
  assert.match(plan.stdout, /line 7, column 30: 50\.0m {2}-> {2}75\.0m/);
  assert.match(plan.stdout, /Not included \(similar, but Thunder cannot tell it is the same rule; check by hand\)/);
  assert.match(plan.stdout, /Plan only; nothing was saved/);
  assert.equal(readFileSync(join(root, 'web/shipping.ts'), 'utf8'), WEB);
  const json = JSON.parse(run('--json').stdout);
  assert.equal(json.schema, WRITE_ACROSS_SCHEMA);
  assert.equal(json.written, false);
  const w = run('--write', '--run', 'billing: python3 -c "import sys; sys.exit(0)"');
  assert.equal(w.status, 0, w.stderr + w.stdout);
  assert.match(w.stdout, /Saved 3 files/);
  assert.match(w.stdout, /✓ passed {2}billing:/);
  assert.match(readFileSync(join(root, 'web/shipping.ts'), 'utf8'), /orderSubtotal >= 75/);
  assert.match(readFileSync(join(root, 'orders/Shipping.cs'), 'utf8'), /orderSubtotal >= 75\.0m/);
  assert.match(readFileSync(join(root, 'billing/billing.py'), 'utf8'), /order_subtotal >= 75:/);
  // A test that fails on the change is reported and the exit code says so.
  const fail = spawnSync(process.execPath, [cli, 'write', 'web', 'orders', 'billing', '--decision', 'shippingNote', '--rule', '1', '--when', 'orderSubtotal >= 80', '--write', '--run', 'billing: python3 -c "import sys; sys.exit(3)"'], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(fail.status, 1);
  assert.match(fail.stdout, /✗ failed \(exit 3\)/);
  // --answer is refused across folders, and --run needs --write.
  assert.equal(run('--answer', 'Review').status, 2);
  assert.equal(spawnSync(process.execPath, [cli, 'write', 'web', 'orders', '--decision', 'shippingNote', '--rule', '1', '--when', 'orderSubtotal >= 9', '--run', 'x: true'], { cwd: root, encoding: 'utf8' }).status, 2);
});

test('the same condition in a decision with an unrelated name is listed, never changed', () => {
  const files = [
    { part: 'web', path: 'shipping.ts', source: 'export function shippingFee(subtotal: number): number {\n  if (subtotal >= 50) return 0;\n  return 5.99;\n}\n' },
    { part: 'billing', path: 'receipt.py', source: 'def get_shipping_fee(subtotal):\n    if subtotal >= 50:\n        return 0\n    return 5.99\n\n\ndef coupon_allowed(subtotal):\n    if subtotal >= 50:\n        return True\n    return False\n' },
  ];
  const r = writeRuleAcross(files, { decision: 'shippingFee', rule: 1, when: 'subtotal >= 40' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.plan.map((p) => p.decision).sort(), ['get_shipping_fee', 'shippingFee']);
  assert.deepEqual(r.notIncluded.map((n) => n.decision), ['coupon_allowed']);
  assert.match(r.notIncluded[0].why, /shares no word/);
  assert.match(r.files['billing/receipt.py'], /def coupon_allowed\(subtotal\):\n    if subtotal >= 50:/);
});
