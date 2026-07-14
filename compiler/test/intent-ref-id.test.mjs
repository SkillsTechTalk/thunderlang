// intentRefId , the canonical cross-ecosystem intent reference id that OT/RM/STT/Certified put
// in evidence-event-v1 / proof-bundle-v1 `intentReferences[]`. Stable, deterministic, browser-safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intentRefId, skillRefId, parseIntent } from '../src/parse.mjs';
import { compileSource } from '../src/compile.mjs';
import { sha256 } from '../src/hash.mjs';

test('subject-level id from a name or an AST is stable and slugged', () => {
  assert.equal(intentRefId('Create Invoice'), 'intent:create-invoice');
  const ast = parseIntent('mission CreateInvoice\ngoal "x"\n');
  assert.equal(intentRefId(ast), 'intent:createinvoice');
});

test('version-pinned id appends the 8-char source hash', () => {
  const hash = sha256('some source'); // "sha256:...."
  const id = intentRefId('Create Invoice', { sourceHash: hash });
  assert.match(id, /^intent:create-invoice@[0-9a-f]{8}$/);
  // strips the sha256: prefix before slicing
  assert.equal(id, `intent:create-invoice@${hash.replace(/^sha256:/, '').slice(0, 8)}`);
});

test('deterministic: same input => same id', () => {
  assert.equal(intentRefId('Order Fulfilment'), intentRefId('Order Fulfilment'));
});

test('empty/unknown falls back to intent:mission', () => {
  assert.equal(intentRefId(''), 'intent:mission');
  assert.equal(intentRefId({}), 'intent:mission');
  assert.equal(intentRefId(null), 'intent:mission');
});

test('skillRefId: IL owns the skill: namespace (id shape), deterministic + slugged', () => {
  assert.equal(skillRefId('TypeScript'), 'skill:typescript');
  assert.equal(skillRefId('Distributed Systems'), 'skill:distributed-systems');
  assert.equal(skillRefId('TypeScript'), skillRefId('TypeScript'));
  assert.equal(skillRefId(''), 'skill:unknown');
  assert.equal(skillRefId(null), 'skill:unknown');
});

test('compileSource surfaces both ids for producers to emit', () => {
  const r = compileSource('mission PlaceOrder\ngoal "ship"\n', { generatedAt: '2026-07-14T00:00:00Z' });
  assert.equal(r.intentRef, 'intent:placeorder');
  assert.match(r.intentRefPinned, /^intent:placeorder@[0-9a-f]{8}$/);
  // pinned id is derived from the same source hash the proof uses
  assert.ok(r.intentRefPinned.startsWith(r.intentRef + '@'));
});
