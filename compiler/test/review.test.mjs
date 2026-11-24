// thunder review: what a change did to the meaning of the code, per change kind, on realistic before/after code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thunderReview, renderReview, codeTokens, localRenames, REVIEW_MARKER } from '../src/review.mjs';
import * as core from '../src/core.mjs';

const ADMIN = readFileSync(new URL('./fixtures/handlers/admin-cron.ts', import.meta.url), 'utf8');
const ADMIN_OPEN = ADMIN.replace(/  if \(req\.headers[\s\S]*?\n  \}\n/, ''); // the same handler before the secret check
const review = (before, after) => thunderReview(Object.entries(before).map(([path, source]) => ({ path, source })), Object.entries(after).map(([path, source]) => ({ path, source })));
const kinds = (r) => r.items.map((x) => `${x.severity}:${x.kind}`);
const find = (r, kind) => r.items.find((x) => x.kind === kind);

const FEE = (limit, extra = '') => `def late_fee(days_late: int) -> str:
    """Small fines for late books."""
    if days_late <= 0:
        return "NoFee"
    if days_late <= ${limit}:
        return "SmallFee"${extra}
    return "BigFee"
`;

test('a new Stop: the founder\'s admin cron handler gains its secret check', () => {
  const r = review({ 'server.ts': ADMIN_OPEN }, { 'server.ts': ADMIN });
  const stop = find(r, 'stop-added');
  assert.equal(stop.says, 'Now stops with 403 Forbidden ("forbidden") when the x-admin-secret header is not the ADMIN_SECRET setting.');
  assert.equal(stop.severity, 'meaning');
  assert.deepEqual(stop.where, { file: 'server.ts', line: 4 });
  assert.deepEqual(stop.evidence.after, ['Is the x-admin-secret header the ADMIN_SECRET setting? No', 'Stop: 403 Forbidden ("forbidden")']);
  assert.equal(find(r, 'input-added').says, 'Now also takes the x-admin-secret header.');
  assert.equal(stop.subject, 'POST /api/admin/cron-generate-calibration-transcripts');
  // The new check guards the 500 Stop and the answer too, but that is the same check, said once: not a change each.
  assert.ok(!r.items.some((x) => x.kind === 'stop-changed' || x.kind === 'gives-back-changed'), kinds(r).join(', '));
  assert.equal(r.says, '2 changes in meaning, 0 risks, 0 form-only.');
});

test('a removed Stop is a risk: the secret check taken away', () => {
  const r = review({ 'server.ts': ADMIN }, { 'server.ts': ADMIN_OPEN });
  const stop = find(r, 'stop-removed');
  assert.equal(stop.severity, 'risk');
  assert.match(stop.says, /^No longer stops with 403 Forbidden \("forbidden"\) when the x-admin-secret header is not the ADMIN_SECRET setting\./);
  assert.equal(r.items[0], stop, 'risks come first');
  assert.equal(find(r, 'input-removed').says, 'No longer takes the x-admin-secret header.');
});

test('a Stop under different conditions, and a Stop whose message changed', () => {
  const before = `app.get('/orders/:id', async (req, res) => {
  const order = await db.order.findUnique({ where: { id: req.params.id } })
  if (!order) {
    return res.status(404).json({ error: 'not found' })
  }
  res.json(order)
})
`;
  const after = before.replace("if (!order) {", "if (!order || order.deleted) {").replace("'not found'", "'no such order'");
  const r = review({ 'orders.ts': before }, { 'orders.ts': after });
  const changed = r.items.filter((x) => x.kind === 'stop-changed');
  assert.ok(changed.some((x) => x.severity === 'risk' && /^Stops with 404 Not Found under different conditions: now when .*deleted.* \(was when .*order.*\)\.$/.test(x.says)), JSON.stringify(changed));
  assert.ok(changed.some((x) => x.says === 'When it stops with 404 Not Found, it now says "no such order" (was "not found").'));
});

test('a rule\'s limit moved: said as the limit, with a whole-number example that was run', () => {
  const r = review({ 'fees.py': FEE(7) }, { 'fees.py': FEE(10) });
  assert.deepEqual(kinds(r), ['meaning:rule-limit']);
  const it = r.items[0];
  assert.equal(it.says, 'Late fee: the limit between Small fee and Big fee moved from 7 to 10 days late: Small fee now goes up to 10 (was 7).');
  assert.deepEqual({ ...it.evidence.counterexample, values: undefined }, { facts: 'days late is 8', before: 'Big fee', after: 'Small fee', values: undefined });
  assert.deepEqual(it.evidence.before, ['No fee when the days late is at most 0', 'Small fee when the days late is at most 7', 'Big fee otherwise']);
});

test('a rule with a new answer, and a rule whose answer changed for some facts', () => {
  const r = review({ 'fees.py': FEE(7) }, { 'fees.py': FEE(7, '\n    if days_late <= 30:\n        return "MediumFee"') });
  assert.ok(r.items.some((x) => x.kind === 'rule-new-answer' && x.says === 'Late fee: can now answer Medium fee.'), kinds(r).join(', '));
  const yn = (op) => `def can_borrow(books_out: int, has_late_book: bool) -> bool:\n    return books_out ${op} 3 and not has_late_book\n`;
  const r2 = review({ 'lib.py': yn('<') }, { 'lib.py': yn('<=') });
  const a = find(r2, 'rule-answer');
  assert.ok(a, kinds(r2).join(', '));
  assert.match(a.says, /^Can borrow\?: when books out is 3 and not has late book, it now gives Yes \(was No\)\.$/);
});

test('a rule rewritten with the same answers is form only, because both were run on every edge case', () => {
  const rewritten = `def late_fee(days_late: int) -> str:
    """Small fines for late books."""
    if days_late > 7:
        return "BigFee"
    if days_late > 0:
        return "SmallFee"
    return "NoFee"
`;
  const r = review({ 'fees.py': FEE(7) }, { 'fees.py': rewritten });
  assert.deepEqual(kinds(r), ['form:form']);
  assert.match(r.items[0].says, /^Only the form changed: same answer on all \d+ edge cases, run on both versions\.$/);
});

test('spacing and comments only: form, and the same code is said to be identical apart from them', () => {
  const after = ADMIN.replace("const force = req.query.force === '1' || req.query.force === 'true'", "// '1' or 'true' turn it on\n    const force =\n      req.query.force === '1' ||\n      req.query.force === 'true'");
  const r = review({ 'server.ts': ADMIN }, { 'server.ts': after });
  assert.deepEqual(kinds(r), ['form:form']);
  assert.equal(r.items[0].says, 'Only the form changed: spacing, line breaks, or comments; the code is otherwise identical.');
});

test('local names renamed consistently: form; a field or an outside name renamed: not form', () => {
  const py = (v) => `def total(price, tax):\n    ${v} = price - tax * 1.2\n    return ${v}\n`;
  const r = review({ 'calc.py': py('t') }, { 'calc.py': py('amount') });
  assert.deepEqual(kinds(r), ['form:form']);
  assert.match(r.items[0].says, /only names it declares itself changed \(t is now amount\)/);
  // A field (order.total -> order.sum) changes what the code reads: never accepted as a rename.
  const ts = (f) => `export function pay(order: Order) {\n  return charge(order.${f})\n}\n`;
  assert.equal(localRenames(codeTokens(ts('total'), 'typescript'), codeTokens(ts('sum'), 'typescript'), 'typescript'), null);
  // A name the function does not declare (a setting from outside) is not a local rename either.
  const g = (n) => `def fee(x):\n    return x * ${n}\n`;
  assert.equal(localRenames(codeTokens(g('RATE'), 'python'), codeTokens(g('OTHER_RATE'), 'python'), 'python'), null);
  const r2 = review({ 'calc.py': g('RATE') }, { 'calc.py': g('OTHER_RATE') });
  assert.ok(!r2.items.some((x) => x.severity === 'form'), kinds(r2).join(', '));
});

test('Thunder reads the same but a value changed: "changed, check", never "same"', () => {
  const ts = (amount) => `export async function checkout(order: Order) {\n  const charge = await stripe.charges.create({ amount: ${amount}, currency: 'usd' })\n  return charge\n}\n`;
  const r = review({ 'pay.ts': ts('order.total') }, { 'pay.ts': ts('order.total * 2') });
  const h = find(r, 'hidden');
  assert.ok(h, kinds(r).join(', '));
  assert.equal(h.severity, 'meaning');
  assert.match(h.says, /^Changed, check: Thunder reads the same, but the code differs in details Thunder's words leave out/);
  assert.ok(h.evidence.after.some((l) => l.includes('order.total * 2')));
});

test('a new call to another service is a risk: "Now also creates a Stripe charge"', () => {
  const before = `export async function checkout(order: Order) {\n  await db.order.update({ where: { id: order.id }, data: { status: 'paid' } })\n  return order\n}\n`;
  const after = `export async function checkout(order: Order) {\n  await stripe.charges.create({ amount: order.total, currency: 'usd' })\n  await db.order.update({ where: { id: order.id }, data: { status: 'paid' } })\n  return order\n}\n`;
  const r = review({ 'pay.ts': before }, { 'pay.ts': after });
  const e = find(r, 'effect-added');
  assert.equal(e.severity, 'risk');
  assert.equal(e.says, 'Now also creates a Stripe charge.');
  const back = review({ 'pay.ts': after }, { 'pay.ts': before });
  assert.equal(find(back, 'effect-removed').says, 'No longer creates a Stripe charge.');
});

test('inputs and what it gives back: "Now also takes coupon (in the address)"', () => {
  const before = `app.get('/price', (req, res) => {\n  res.json({ total: price() })\n})\n`;
  const after = `app.get('/price', (req, res) => {\n  const coupon = req.query.coupon\n  res.json({ total: price(), coupon: coupon })\n})\n`;
  const r = review({ 'price.ts': before }, { 'price.ts': after });
  assert.ok(r.items.some((x) => x.kind === 'input-added' && x.says === 'Now also takes coupon (in the address).'), JSON.stringify(r.items.map((x) => x.says)));
  assert.ok(r.items.some((x) => x.kind === 'gives-back-added' && /^Now also gives back .*coupon/.test(x.says)));
  assert.ok(r.items.some((x) => x.kind === 'gives-back-removed'));
});

test('an address change is a risk', () => {
  const r = review({ 'h.ts': "app.get('/price', (req, res) => {\n  res.json({ ok: true })\n})\n" }, { 'h.ts': "app.get('/prices', (req, res) => {\n  res.json({ ok: true })\n})\n" });
  // Paired by file, method, and the same code apart from the address; said once, as the address.
  assert.deepEqual(kinds(r), ['risk:address']);
  assert.equal(r.items[0].says, 'The address changed: GET /price is now GET /prices. Anything calling the old address must change too.');
});

test('members added and removed, renamed by meaning, and a moved file in one line', () => {
  const a = `def late_fee(days_late: int) -> str:\n    if days_late <= 7:\n        return "Small"\n    return "Big"\n\n\ndef helper(x):\n    return x + 1\n`;
  const b = `def overdue_fee(days_late: int) -> str:\n    if days_late <= 7:\n        return "Small"\n    return "Big"\n\n\ndef greet(name):\n    return "hi " + name\n`;
  const r = review({ 'fees.py': a }, { 'fees.py': b });
  assert.ok(r.items.some((x) => x.kind === 'renamed' && x.severity === 'form' && /^Renamed from Late fee to Overdue fee\. Only the form changed/.test(x.says)), JSON.stringify(r.items.map((x) => x.says)));
  assert.ok(r.items.some((x) => x.kind === 'removed' && x.says === 'Removed function: Helper.'));
  assert.ok(r.items.some((x) => x.kind === 'added' && /^New function: Greet: takes name/.test(x.says)));
  const moved = review({ 'app/fees.py': a }, { 'billing/fees.py': a });
  assert.deepEqual(kinds(moved), ['form:moved']);
  assert.equal(moved.items[0].says, 'Moved from app/fees.py to billing/fees.py. Only the form changed: 2 actions, rules, or functions have the same code.');
});

test('a change outside every function (a value set at the top) is never silent', () => {
  const src = (n) => `LIMIT = ${n}\n\n\ndef too_late(days: int) -> bool:\n    return days > LIMIT\n`;
  const r = review({ 'fees.py': src(7) }, { 'fees.py': src(10) });
  const o = find(r, 'outside');
  assert.ok(o, kinds(r).join(', '));
  assert.equal(o.where.line, 1);
  assert.deepEqual(o.evidence, { before: ['> LIMIT = 7'], after: ['> LIMIT = 10'] });
});

test('records: a new fact, and a new choice', () => {
  const py = (extra, choice) => `from dataclasses import dataclass\nfrom enum import Enum\n\n\nclass Status(Enum):\n    ON_SHELF = "on shelf"\n    BORROWED = "borrowed"${choice}\n\n\n@dataclass\nclass Book:\n    title: str${extra}\n`;
  const r = review({ 'lib.py': py('', '') }, { 'lib.py': py('\n    times_borrowed: int = 0', '\n    LOST = "lost"') });
  const says = r.items.filter((x) => x.kind === 'thing').map((x) => x.says);
  assert.ok(says.includes('Book now also knows times borrowed (0 at first).'), says.join(' | '));
  assert.ok(says.some((s) => /^Status can now also be /.test(s)), says.join(' | '));
});

test('files Thunder does not read: infrastructure is a risk to check; other files are listed', () => {
  const r = review({ 'infra/main.tf': 'resource "x" "y" {}\n', 'README.md': 'a' }, { 'infra/main.tf': 'resource "x" "y" { public = true }\n', 'README.md': 'b' });
  assert.equal(find(r, 'infrastructure').severity, 'risk');
  assert.match(find(r, 'infrastructure').says, /Thunder does not read these in this version, so check it yourself\./);
  assert.deepEqual(r.notRead, [{ path: 'README.md', status: 'changed' }]);
});

test('nothing changed: no items and no claims', () => {
  const r = review({ 'fees.py': FEE(7) }, { 'fees.py': FEE(7) });
  assert.deepEqual(r.items, []);
  assert.equal(r.summary.unchanged, 1);
  assert.equal(r.says, 'Nothing changed.');
});

test('tokens: comments and spacing are not code; Python indentation is', () => {
  const t = (s, l) => codeTokens(s, l).map((x) => x.t).join(' ');
  assert.equal(t('a = 1 // one\n/* two */ b = 2', 'typescript'), t('a=1\nb=2', 'typescript'));
  assert.notEqual(t('if a:\n    b()\n    c()\n', 'python'), t('if a:\n    b()\nc()\n', 'python'));
  assert.equal(t('def f():\n    """Doc."""\n    return 1\n', 'python'), t('def f():\n    """Other doc."""\n    return 1\n', 'python'));
});

test('Markdown for a pull request: marker, summary first, risks before meaning, form folded away', () => {
  const r = review({ 'server.ts': ADMIN, 'fees.py': FEE(7) }, { 'server.ts': ADMIN_OPEN, 'fees.py': FEE(10) });
  const md = renderReview(r);
  assert.ok(md.startsWith(REVIEW_MARKER));
  assert.match(md, /\*\*\d+ changes? in meaning, 1 risk, 0 form-only\.\*\*/);
  assert.ok(md.indexOf('Needs a careful look') < md.indexOf('Changes in meaning'));
  assert.match(md, /<details><summary>Before and after<\/summary>/);
  assert.ok(!/\bsafe\b/i.test(md), 'never says safe');
  assert.ok(renderReview(r, { maxChars: 600 }).length <= 700);
});

test('/core exports thunderReview and renderReview (browser-safe)', () => {
  assert.equal(core.thunderReview, thunderReview);
  assert.equal(core.renderReview, renderReview);
  assert.equal(core.REVIEW_SCHEMA, 'thunder-review-v1');
});
