// Emit-stage tests. Run: `node --test` from compiler/.
// These lock the artifact SHAPES OpenThunder consumes so they can't silently regress, and prove the
// compiler is deterministic (same input + fixed timestamp -> byte-identical output).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseIntent } from '../src/parse.mjs';
import {
  buildContractGraph, buildArchitectureGraph, buildImplementationPlan,
  semanticDiagnostics, buildProof, sha256, COMPILER_VERSION, PROOF_SCHEMA_VERSION,
} from '../src/emit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const example = (name) => readFileSync(join(HERE, '..', '..', 'examples', name), 'utf8');
const FIXED = '2026-07-09T00:00:00.000Z';

test('parses the canonical CreateInvoice mission', () => {
  const ast = parseIntent(example('CreateInvoice.intent'));
  assert.equal(ast.mission, 'CreateInvoice');
  assert.equal(ast.goal, 'Generate an invoice from approved orders');
  assert.equal(ast.guarantees.length, 3);
  assert.equal(ast.neverRules.length, 2);
  assert.ok(ast.inputs.some((f) => f.name === 'idempotencyKey'));
  // detail block attaches rationale + verification to the right guarantee
  const dup = ast.guarantees.find((g) => g.id === 'duplicate-invoices-are-not-created');
  assert.equal(dup.because, 'duplicate billing damages customer trust');
  assert.deepEqual(dup.verify, ['duplicate prevention test']);
});

test('semantic pass: idempotency diagnostic fires only when the key is absent', () => {
  const withKey = semanticDiagnostics(parseIntent(example('CreateInvoice.intent')));
  assert.ok(!withKey.some((d) => d.code === 'duplicate-without-idempotency'),
    'should NOT warn when idempotencyKey is present');

  const stripped = example('CreateInvoice.intent').split('\n').filter((l) => !/idempotencyKey/.test(l)).join('\n');
  const withoutKey = semanticDiagnostics(parseIntent(stripped));
  assert.ok(withoutKey.some((d) => d.code === 'duplicate-without-idempotency'),
    'should warn when idempotencyKey is absent');
});

test('diagnostics teach: each carries why + fix suggestions', () => {
  const stripped = example('CreateInvoice.intent').split('\n').filter((l) => !/idempotencyKey/.test(l)).join('\n');
  const diags = semanticDiagnostics(parseIntent(stripped));
  const dup = diags.find((d) => d.code === 'duplicate-without-idempotency');
  assert.ok(dup, 'idempotency diagnostic present');
  assert.ok(typeof dup.why === 'string' && dup.why.length > 0, 'has a why');
  assert.ok(Array.isArray(dup.fix) && dup.fix.length > 0, 'has fix suggestions');
  assert.ok(dup.fix.some((f) => /idempotencyKey/.test(f)), 'fix mentions idempotencyKey');
});

test('contract-graph.json shape + stable slug IDs (OT consumer contract)', () => {
  const ast = parseIntent(example('CreateInvoice.intent'));
  const cg = buildContractGraph(ast, FIXED);
  assert.equal(cg.compilerVersion, COMPILER_VERSION);
  assert.equal(cg.missions.length, 1);
  const m = cg.missions[0];
  assert.equal(m.id, 'createinvoice');
  assert.ok(m.guarantees.every((g) => typeof g.id === 'string' && typeof g.statement === 'string'));
  assert.ok(m.guarantees.some((g) => g.id === 'duplicate-invoices-are-not-created'));
  assert.ok(m.neverRules.some((n) => n.id === 'expose-payment-token-in-logs'));
});

test('.intent-proof.json carries schema/version/hash for stale-proof detection', () => {
  const source = example('CreateInvoice.intent');
  const ast = parseIntent(source);
  const proof = buildProof(ast, {
    sourceFile: 'CreateInvoice.intent', sourceHash: sha256(source), generatedAt: FIXED,
    targetsRequested: ast.targets, targetsGenerated: ['contract-graph.json'],
    diagnostics: semanticDiagnostics(ast),
  });
  assert.equal(proof.schemaVersion, PROOF_SCHEMA_VERSION);
  assert.equal(proof.compilerVersion, COMPILER_VERSION);
  assert.match(proof.sourceHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(proof.ai.used, false);
  assert.equal(proof.proofStatus, 'draft');
  assert.ok(proof.guarantees.every((g) => 'id' in g && 'status' in g));
});

test('deterministic: same input + fixed timestamp => identical artifacts', () => {
  const ast1 = parseIntent(example('CreateInvoice.intent'));
  const ast2 = parseIntent(example('CreateInvoice.intent'));
  assert.deepEqual(buildContractGraph(ast1, FIXED), buildContractGraph(ast2, FIXED));
  assert.deepEqual(buildArchitectureGraph(ast1, FIXED), buildArchitectureGraph(ast2, FIXED));
  assert.deepEqual(buildImplementationPlan(ast1, FIXED), buildImplementationPlan(ast2, FIXED));
});

test('all four example missions parse without throwing', () => {
  for (const f of ['CreateInvoice.intent', 'ResetPassword.intent', 'BillingService.intent', 'InvoiceCreated.intent']) {
    const ast = parseIntent(example(f));
    assert.ok(ast, `${f} parsed`);
    // architecture examples should populate services/apis/events where present
    buildContractGraph(ast, FIXED);
    buildArchitectureGraph(ast, FIXED);
  }
});
