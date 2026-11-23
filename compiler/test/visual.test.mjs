// thunder-visual-v1: the grammar is complete and consistent, and every reader item maps to exactly one element.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';
import { THUNDER_VISUAL, COLORS, ELEMENTS, STEP_MARKS, PROVENANCE, LANGUAGES, ZOOM, visualFor, visualForStep, thunderText } from '../src/visual.mjs';
import * as core from '../src/core.mjs';
import * as root from '../src/index.mjs';
import { READ_LANGUAGES } from '../src/read.mjs';

test('the grammar is exported from /core and the root, under thunder-visual-v1', () => {
  assert.equal(core.VISUAL_SCHEMA, 'thunder-visual-v1');
  assert.equal(root.THUNDER_VISUAL.schema, 'thunder-visual-v1');
  assert.equal(typeof core.visualFor, 'function');
});

test('green and red are reserved for checks that ran', () => {
  const byHex = new Map();
  for (const [role, c] of Object.entries(COLORS)) byHex.set(c.hex, [...(byHex.get(c.hex) || []), role]);
  for (const [role, c] of Object.entries(COLORS)) if (!['pass', 'fail'].includes(role)) assert.ok(!/^green$|^red$/.test(c.name), `${role} must not be green or red`);
  assert.deepEqual(byHex.get(COLORS.pass.hex), ['pass']);
  assert.deepEqual(byHex.get(COLORS.fail.hex), ['fail']);
});

test('every step kind and element points at a defined color, and every zoom level at an element', () => {
  for (const [k, m] of Object.entries(STEP_MARKS)) assert.ok(COLORS[m.color], `step ${k}`);
  for (const [k, e] of Object.entries(ELEMENTS)) if (e.color) assert.ok(COLORS[e.color], `element ${k}`);
  for (const z of ZOOM) assert.ok(ELEMENTS[z.element], `zoom ${z.level}`);
  for (const p of Object.values(PROVENANCE)) assert.ok(['solid', 'dashed'].includes(p.line));
  assert.equal(PROVENANCE['ai-summary'].line, 'dashed', 'an AI summary is never drawn as established');
});

test('every language the reader supports is in the grammar, and SQL is listed honestly as planned', () => {
  for (const l of READ_LANGUAGES) assert.equal(LANGUAGES[l]?.status, 'available', l);
  assert.equal(LANGUAGES.sql.status, 'planned');
  assert.ok(THUNDER_VISUAL.rules.some((r) => /Never draw a guess/.test(r)));
});

const PY = `@router.post("/refunds")
def create_refund(order, amount):
    """Start a refund for an order."""
    if amount <= 0:
        raise ValueError("amount must be positive")
    refund = Refund(order=order, amount=amount)
    db.add(refund)
    return refund

def refund_decision(amount: float, on_time: bool) -> str:
    if on_time and amount <= 100:
        return "Approve"
    return "Review"

def helper(x):
    return x + 1
`;

test('each reader item maps to one element: action, Thunder card, dashed not-read card, failure chip', () => {
  const items = readCode(PY, { language: 'python' }).items;
  const v = Object.fromEntries(items.map((i) => [i.name, visualFor(i)]));
  assert.equal(v.create_refund.element, 'action');
  assert.equal(v.create_refund.title, 'When someone calls POST /refunds');
  assert.deepEqual(v.create_refund.doc, { text: 'Start a refund for an order.', provenance: 'authors-note' });
  assert.equal(v.refund_decision.element, 'decision');
  assert.equal(v.refund_decision.shape, 'card');
  assert.equal(v.helper.element, 'not-read');
  assert.equal(v.helper.line, 'dashed');
  assert.equal(v.ValueError.element, 'error');
});

test('a step that only restates code is shown as code, dashed', () => {
  const s = visualForStep({ kind: 'return', says: 'Returns a computed value', code: 'return x + 1', restates: true });
  assert.deepEqual([s.show, s.line, s.text], ['code', 'dashed', 'return x + 1']);
  assert.equal(visualForStep({ kind: 'branch', says: 'If amount is at most 100' }).mark, '◇');
});

test('Thunder Text says the same thing as the picture, quoting code it cannot explain', () => {
  const items = readCode(PY, { language: 'python' }).items;
  const byName = (n) => items.find((i) => i.name === n);
  const endpoint = thunderText(byName('create_refund'));
  assert.match(endpoint, /^When someone calls POST \/refunds\n/);
  assert.match(endpoint, /Author's note: "Start a refund for an order\."/);
  assert.match(endpoint, /- If amount is at most 0\n {4}- Fails with ValueError: "amount must be positive"/);
  assert.match(thunderText(byName('refund_decision')), /Approve when/);
  assert.match(thunderText({ ...byName('refund_decision'), doc: 'Small refunds are approved.' }), /^Why: Small refunds are approved\.$/m);
  assert.doesNotMatch(thunderText(byName('refund_decision')), /Examples\s*$/);
  assert.match(thunderText(byName('helper')), /`return x \+ 1` \(code, not explained\)/);
});

test('the V1 specification names every element and language in the grammar, so the two cannot drift apart', async () => {
  const { readFileSync } = await import('node:fs');
  const spec = readFileSync(new URL('../../docs/spec.md', import.meta.url), 'utf8');
  for (const e of Object.values(ELEMENTS)) assert.ok(spec.includes(`**${e.name}**`), `spec is missing element ${e.name}`);
  for (const l of Object.values(LANGUAGES)) assert.ok(new RegExp(`^\\| \\**${l.name.replace('#', '\\#')}\\** \\|`, 'm').test(spec), `spec is missing language ${l.name}`);
  for (const k of Object.keys(STEP_MARKS)) assert.ok(spec.includes(k), `spec is missing step ${k}`);
});
