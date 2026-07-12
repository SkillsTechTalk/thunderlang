import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { buildProof, sha256 } from '../src/emit.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import {
  PROOF_SCHEMA, CLAIM_STATUSES, PROOF_STATUSES, intentProofJsonSchema, validateProof,
} from '../src/proof-schema.mjs';

const src = `mission CreateInvoice
use product

goal
  Create an invoice for an approved order.

guarantee invoice.total is never negative
  verify a test proving totals are non-negative

never
  expose the payment token in logs
`;

function realProof() {
  const ast = parseIntent(src);
  const diagnostics = semanticDiagnostics(ast);
  return buildProof(ast, {
    sourceFile: 'CreateInvoice.intent',
    sourceHash: sha256(src),
    targetsRequested: ['Proof'],
    targetsGenerated: ['x/.intent-proof.json'],
    diagnostics,
    generatedAt: '2026-07-12T00:00:00Z',
  });
}

test('a compiler-emitted proof validates against intent-proof-v1', () => {
  const r = validateProof(realProof());
  assert.equal(r.valid, true, JSON.stringify(r.errors));
  assert.deepEqual(r.errors, []);
});

test('the JSON Schema is well-formed and names the canonical id', () => {
  const s = intentProofJsonSchema();
  assert.equal(s.$id, `https://intentlanguage.dev/schema/${PROOF_SCHEMA}.json`);
  assert.equal(PROOF_SCHEMA, 'intent-proof-v1');
  assert.ok(s.required.includes('sourceHash'));
  assert.ok(s.required.includes('proofStatus'));
});

test('validateProof rejects a non-object', () => {
  for (const bad of [null, 42, 'x', [], undefined]) {
    assert.equal(validateProof(bad).valid, false);
  }
});

test('validateProof catches a bad sourceHash', () => {
  const p = realProof();
  p.sourceHash = 'not-a-hash';
  const r = validateProof(p);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.path === 'sourceHash'));
});

test('validateProof catches an out-of-enum claim status', () => {
  const p = realProof();
  p.guarantees[0].status = 'totally-verified';
  const r = validateProof(p);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.path === 'guarantees[0].status'));
});

test('validateProof catches an out-of-enum proofStatus and missing ai/humanApproval', () => {
  const p = realProof();
  p.proofStatus = 'bogus';
  delete p.ai;
  delete p.humanApproval;
  const r = validateProof(p);
  assert.equal(r.valid, false);
  const paths = r.errors.map((e) => e.path);
  assert.ok(paths.includes('proofStatus'));
  assert.ok(paths.includes('ai.used'));
  assert.ok(paths.some((x) => x.startsWith('humanApproval')));
});

test('claim + proof status vocabularies are the canonical sets', () => {
  assert.deepEqual(CLAIM_STATUSES, ['planned', 'needs_verification', 'verified', 'failed']);
  assert.deepEqual(PROOF_STATUSES, ['draft', 'approved', 'rejected']);
});

test('validation is deterministic', () => {
  const p = realProof();
  assert.deepEqual(validateProof(p), validateProof(p));
});
