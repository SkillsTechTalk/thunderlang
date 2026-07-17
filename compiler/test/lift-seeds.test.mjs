// Seeded lift (OT intent-ir-v1 grounding). liftSource({ seeds }) makes the draft reference
// OT's exact node ids without a divergent second reading. Additive: no seeds => unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liftSource, normalizeSeeds, SEED_SCHEMA } from '../src/lift.mjs';
import { parseIntent } from '../src/parse.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';

const SRC = `export function createInvoice(orderId: OrderId, total: Money): Invoice {
  if (exists(orderId)) throw new DuplicateInvoice();
  return save(orderId, total);
}
export function test_no_duplicate() {}
`;

const SEEDS = [
  {
    nodeId: 'cap:invoicing',
    nodeType: 'Capability',
    title: 'Invoice creation',
    confidence: 'observed',
    evidenceRef: {
      signals: ['calls save()', 'throws DuplicateInvoice'],
      sourceLocations: [{ file: 'src/invoice.ts', line: 1 }],
      ledgerRef: { seq: 7, hash: 'sha256:abc' },
    },
  },
];

test('additive: no seeds => byte-identical intent text and no seeds field', () => {
  const a = liftSource(SRC, { language: 'typescript', file: 'src/invoice.ts' });
  const b = liftSource(SRC, { language: 'typescript', file: 'src/invoice.ts', seeds: undefined });
  assert.equal(a.ok, true);
  assert.equal(a.intentText, b.intentText);
  assert.deepEqual(a.seeds, []);
  assert.deepEqual(a.summary.seeds, []);
});

test('seeded: draft references OT node ids in maps_to and returns linkage', () => {
  const r = liftSource(SRC, { language: 'typescript', file: 'src/invoice.ts', seeds: SEEDS });
  assert.equal(r.ok, true);
  // structural linkage back to OT
  assert.deepEqual(r.summary.seeds, ['cap:invoicing']);
  assert.equal(r.seeds[0].nodeId, 'cap:invoicing');
  assert.equal(r.seeds[0].evidenceRef.ledgerRef.seq, 7);
  // parseable maps_to references OT's exact id
  assert.match(r.intentText, /node cap:invoicing \(Capability\)/);
  // grounding rendered as comments (never verification)
  assert.match(r.intentText, /# Seeded by OT intent-ir-v1 nodes/);
  assert.match(r.intentText, /#     at src\/invoice\.ts:1/);
  assert.match(r.intentText, /#     signal: calls save\(\)/);
  assert.match(r.intentText, /#     ledger: seq 7 sha256:abc/);
});

test('seeded draft still parses and checks clean (comments are safe)', () => {
  const r = liftSource(SRC, { language: 'typescript', file: 'src/invoice.ts', seeds: SEEDS });
  const ast = parseIntent(r.intentText);
  assert.equal(ast.mission, 'CreateInvoice');
  const errors = semanticDiagnostics(ast).filter((d) => d.level === 'error');
  assert.deepEqual(errors, []);
});

test('deterministic: same inputs => identical text', () => {
  const a = liftSource(SRC, { language: 'typescript', file: 'src/invoice.ts', seeds: SEEDS });
  const b = liftSource(SRC, { language: 'typescript', file: 'src/invoice.ts', seeds: SEEDS });
  assert.equal(a.intentText, b.intentText);
});

test('normalizeSeeds drops malformed entries, keeps order, is load-bearing on nodeId', () => {
  const out = normalizeSeeds([
    { nodeId: '  keep:1  ', evidenceRef: { signals: [' a ', 42, ''] } }, // trims, filters non-strings
    { nodeType: 'Capability' },                                          // no nodeId -> dropped
    null,                                                                // dropped
    'nope',                                                              // dropped
    { nodeId: 'keep:2', evidenceRef: { sourceLocations: [{ file: 'x.ts', line: 3 }, { line: 9 }] } },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].nodeId, 'keep:1');
  assert.deepEqual(out[0].evidenceRef.signals, ['a']);
  assert.equal(out[1].nodeId, 'keep:2');
  assert.deepEqual(out[1].evidenceRef.sourceLocations, [{ file: 'x.ts', line: 3 }]); // {line:9} lacks file -> dropped
});

test('normalizeSeeds tolerates non-array input', () => {
  assert.deepEqual(normalizeSeeds(undefined), []);
  assert.deepEqual(normalizeSeeds(null), []);
  assert.deepEqual(normalizeSeeds('x'), []);
  assert.deepEqual(normalizeSeeds({}), []);
});

test('SEED_SCHEMA is the published contract shape', () => {
  assert.equal(SEED_SCHEMA.$id, 'intent-seed-v1');
  assert.deepEqual(SEED_SCHEMA.required, ['nodeId', 'evidenceRef']);
});
