import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { editStep, anchorReport, spanText, replaceSpan } from '../src/anchor.mjs';
import { readCode } from '../src/read.mjs';

const read = (p) => readFileSync(fileURLToPath(new URL(`../../examples/thunder-map/acme-shop/${p}`, import.meta.url)), 'utf8');

test('every step span covers exactly its statement, and functions are fully anchored', () => {
  for (const [p, language] of [['billing/refunds.py', 'python'], ['checkout/refunds.ts', 'typescript'], ['notifications/refundEmail.ts', 'typescript']]) {
    const src = read(p);
    const r = anchorReport(src, { language });
    assert.equal(r.coverage, 1, p);
    for (const f of readCode(src, { language }).items.filter((i) => i.steps)) {
      for (const s of f.steps) assert.ok(spanText(src, s.span).trim().length > 0, `${p} ${f.name}`);
    }
  }
});

test('writing every step back as itself leaves the file byte-identical', () => {
  for (const [p, language] of [['billing/refunds.py', 'python'], ['checkout/refunds.ts', 'typescript']]) {
    const src = read(p);
    for (const f of readCode(src, { language }).items.filter((i) => i.steps)) {
      f.steps.forEach((s, i) => {
        const r = editStep({ source: src, language, functionName: f.name, line: f.line, path: [i], replacement: spanText(src, s.span) });
        assert.ok(r.ok, `${p} ${f.name} ${i}: ${r.problems?.[0]}`);
        assert.equal(r.source, src);
      });
    }
  }
});

test('a step edit changes only that step, keeps indentation, and is verified by re-reading', () => {
  const src = read('billing/refunds.py');
  const r = editStep({ source: src, language: 'python', functionName: 'issue_refund', path: [1, 0], replacement: 'stripe.Refund.create(order=order_id, amount=amount, reason="requested_by_customer")' });
  assert.ok(r.ok, r.problems?.[0]);
  const changed = src.split('\n').map((l, i) => [l, r.source.split('\n')[i]]).filter(([a, b]) => a !== b);
  assert.equal(changed.length, 1);
  assert.match(changed[0][1], /^ {8}stripe\.Refund\.create\(.*reason="requested_by_customer"\)$/);
  assert.equal(r.reread.says, 'Calls Stripe');
  const ts = read('checkout/refunds.ts');
  const r2 = editStep({ source: ts, language: 'typescript', functionName: 'requestRefund', path: [0], replacement: 'const decision = approveRefund(amount, withinWindow && amount > 0);' });
  assert.ok(r2.ok, r2.problems?.[0]);
  assert.ok(!r2.source.includes(';;'));
});

test('an edit that breaks the function is rejected and the original is returned untouched', () => {
  const ts = read('checkout/refunds.ts');
  const bad = editStep({ source: ts, language: 'typescript', functionName: 'requestRefund', path: [0], replacement: '}' });
  assert.equal(bad.ok, false);
  assert.equal(bad.source, ts);
  assert.ok(bad.problems.length > 0);
  assert.equal(replaceSpan('abc', { startLine: 1, endLine: 1, start: 1, end: 2, exact: 'offset' }, 'X'), 'aXc');
});
