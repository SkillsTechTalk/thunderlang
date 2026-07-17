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
import { getCompletions, getHover } from '../src/intellisense.mjs';
import { liftSource, liftRepo } from '../src/lift.mjs';
import { approveIntent, checkDrift, intentHash, buildDriftHandoff } from '../src/drift.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const example = (name) => readFileSync(join(HERE, '..', '..', 'examples', name), 'utf8');
const FIXED = '2026-07-09T00:00:00.000Z';

test('parses the canonical CreateInvoice mission', () => {
  const ast = parseIntent(example('CreateInvoice.thunder'));
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
  const withKey = semanticDiagnostics(parseIntent(example('CreateInvoice.thunder')));
  assert.ok(!withKey.some((d) => d.code === 'duplicate-without-idempotency'),
    'should NOT warn when idempotencyKey is present');

  const stripped = example('CreateInvoice.thunder').split('\n').filter((l) => !/idempotencyKey/.test(l)).join('\n');
  const withoutKey = semanticDiagnostics(parseIntent(stripped));
  assert.ok(withoutKey.some((d) => d.code === 'duplicate-without-idempotency'),
    'should warn when idempotencyKey is absent');
});

test('diagnostics teach: each carries why + fix suggestions', () => {
  const stripped = example('CreateInvoice.thunder').split('\n').filter((l) => !/idempotencyKey/.test(l)).join('\n');
  const diags = semanticDiagnostics(parseIntent(stripped));
  const dup = diags.find((d) => d.code === 'duplicate-without-idempotency');
  assert.ok(dup, 'idempotency diagnostic present');
  assert.ok(typeof dup.why === 'string' && dup.why.length > 0, 'has a why');
  assert.ok(Array.isArray(dup.fix) && dup.fix.length > 0, 'has fix suggestions');
  const applyable = dup.fix.find((f) => f.insert && f.block);
  assert.ok(applyable, 'has an applyable fix with insert + block');
  assert.ok(dup.fix.some((f) => /idempotencyKey/.test(f.label) || /idempotencyKey/.test(f.insert || '')), 'fix mentions idempotencyKey');
});

test('ThunderLens: notes parse, attach to nodes, carry lens + span; # stays ignored', () => {
  const ast = parseIntent(example('CreateInvoice.thunder'));
  assert.ok(ast.notes.length >= 6, 'notes collected');
  // ignored # comments never become notes
  assert.ok(!ast.notes.some((n) => /Illustrative only/.test(n.text)), '# comments are ignored');
  const kinds = new Set(ast.notes.map((n) => n.targetKind));
  for (const k of ['mission', 'input', 'guarantee', 'never']) assert.ok(kinds.has(k), `has a ${k} note`);
  const beginner = ast.notes.find((n) => n.lens === 'beginner' && n.targetKind === 'input');
  assert.ok(beginner && beginner.sourceSpan.line > 0, 'input beginner note has a source line');
  assert.match(beginner.targetPath, /input\.idempotencyKey$/);
});

test('ThunderLens: unknown lens warns; notes are metadata, not verification', () => {
  const withBadLens = parseIntent('mission M\nnote pmm:\n  restated\n');
  const diags = semanticDiagnostics(withBadLens);
  assert.ok(diags.some((d) => d.code === 'INTENT_NOTE_UNKNOWN_LENS'), 'warns on unknown lens');

  const ast = parseIntent(example('CreateInvoice.thunder'));
  const proof = buildProof(ast, {
    sourceFile: 'CreateInvoice.thunder', sourceHash: sha256('x'), generatedAt: FIXED,
    targetsRequested: ast.targets, targetsGenerated: [], diagnostics: semanticDiagnostics(ast),
  });
  assert.equal(proof.notes.included, true);
  assert.ok(proof.notes.count >= 6);
  // notes never flip a guarantee to verified
  assert.ok(proof.guarantees.every((g) => g.status !== 'verified'));
});

test('IntelliSense: completions are context-aware and compiler-sourced', () => {
  assert.match(getCompletions('', { line: 1, column: 1 }).items[0].label, /mission/, 'empty file suggests a mission');
  const afterNote = getCompletions('mission M\nnote ', { line: 2, column: 6 }).items;
  assert.ok(afterNote.some((i) => i.label === 'note pm:'), 'after note suggests lenses');
  const inInput = getCompletions('mission M\ninput\n  x: ', { line: 3, column: 6 }).items;
  assert.ok(inInput.some((i) => i.kind === 'type' && i.label === 'Email'), 'input suggests semantic types');
  assert.ok(inInput.every((i) => i.source === 'compiler'), 'completions are marked compiler-sourced');
});

test('IntelliSense: hover explains semantic types and note lenses', () => {
  const src = 'input\n  idempotencyKey: IdempotencyKey';
  const h = getHover(src, { line: 2, column: 22 }).hover;
  assert.equal(h.kind, 'semantic_type');
  assert.match(h.description, /retry key/i);
  const lens = getHover('note pm:\n  x', { line: 1, column: 6 }).hover;
  assert.equal(lens.kind, 'note_lens');
  assert.match(lens.description, /business meaning/i);
});

test('IntentLift: lifts TypeScript into a humble, source-mapped, unverified draft', () => {
  const ts = [
    'export class DuplicateInvoice extends Error {}',
    'export async function createInvoice(orderId: OrderId, total: Money, key: IdempotencyKey): Promise<Result<Invoice, DuplicateInvoice>> {',
    '  if (exists) throw new DuplicateInvoice();',
    '  return ok(inv);',
    '}',
    "test('repeated order returns the same invoice', () => {});",
  ].join('\n');
  const r = liftSource(ts, { language: 'typescript', file: 'src/billing/invoice.ts' });
  assert.equal(r.ok, true);
  assert.equal(r.lifted.mission, 'CreateInvoice', 'mission name inferred from function');
  assert.deepEqual(r.lifted.inputs.map((i) => i.name), ['orderId', 'total', 'key'], 'inputs from parameters');
  assert.equal(r.lifted.output.type, 'Invoice', 'output unwrapped from Promise<Result<...>>');
  assert.ok(r.lifted.guarantees.some((g) => /repeated order/.test(g.statement)), 'guarantee inferred from a test name');
  assert.ok(r.lifted.neverRules.length >= 1, 'never rule inferred from the error');
  assert.equal(r.lifted.reviewed, false, 'draft is not reviewed');
  assert.equal(r.summary.reviewed, false);
  assert.ok(r.diagnostics.some((d) => d.code === 'INTENT_LIFT_NEEDS_HUMAN_REVIEW'), 'requires human review');
  // Source-mapped: the guarantee carries a file+line back to the test.
  assert.ok(r.lifted.guarantees[0].sourceSpan.line > 0);
  // The generated draft compiles cleanly (inferred blocks are recognized, not errors).
  const ast = parseIntent(r.intentText);
  assert.equal(ast.mission, 'CreateInvoice');
  assert.ok(!ast.diagnostics.some((d) => d.code === 'unknown-block'), 'inferred blocks are recognized');
});

test('IntentLift Rust: strong types + error enums -> high-confidence draft', () => {
  const rust = [
    'pub enum BillingError { DuplicateInvoice, Unauthorized, InvalidOrder }',
    'pub async fn create_invoice(order_id: OrderId, total: Money, key: IdempotencyKey) -> Result<Invoice, BillingError> {',
    '  Ok(x)',
    '}',
    '#[tokio::test]',
    'async fn repeated_order_returns_same_invoice() {}',
  ].join('\n');
  const r = liftSource(rust, { language: 'rust', file: 'src/billing/invoice.rs' });
  assert.equal(r.ok, true);
  assert.equal(r.lifted.from, 'Rust');
  assert.equal(r.lifted.mission, 'CreateInvoice');
  assert.deepEqual(r.lifted.inputs.map((i) => i.name), ['order_id', 'total', 'key']);
  assert.equal(r.lifted.output.type, 'Invoice', 'output unwrapped from Result<Invoice, BillingError>');
  // never rules come from the error enum variants, not the enum name
  const nevers = r.lifted.neverRules.map((n) => n.statement);
  assert.ok(nevers.some((n) => /duplicate invoice/.test(n)));
  assert.ok(nevers.some((n) => /unauthorized/.test(n)));
  assert.ok(nevers.some((n) => /invalid order/.test(n)));
  // the test fn is not counted as a regular function
  assert.ok(r.lifted.guarantees.some((g) => /repeated order/.test(g.statement)));
  assert.match(r.intentText, /from Rust/);
});

test('IntentLift Perl: conservative, Unknown types, dynamic-language warning', () => {
  const perl = [
    'package Billing;',
    'sub create_invoice {',
    "    my ($order_id, $total, $key) = @_;",
    "    die 'duplicate invoice' if invoice_exists($order_id);",
    '    return save_invoice($order_id, $total);',
    '}',
  ].join('\n');
  const r = liftSource(perl, { language: 'perl', file: 'lib/Billing.pm' });
  assert.equal(r.ok, true);
  assert.equal(r.lifted.from, 'Perl');
  assert.equal(r.lifted.mission, 'CreateInvoice');
  assert.deepEqual(r.lifted.inputs.map((i) => i.name), ['order_id', 'total', 'key']);
  assert.ok(r.lifted.inputs.every((i) => i.type === 'Unknown'), 'dynamic types are Unknown');
  assert.equal(r.lifted.output, null, 'no output type inferred for dynamic Perl');
  assert.equal(r.lifted.confidence, 'low', 'conservative confidence');
  assert.ok(r.lifted.neverRules.some((n) => /duplicate invoice/.test(n.statement)), 'never from die');
  assert.ok(r.diagnostics.some((d) => d.code === 'INTENT_LIFT_DYNAMIC_LANGUAGE_LIMITATION'));
});

test('IntentLift repo: lifts many files, unique names, repo summary', () => {
  const files = [
    { file: 'src/billing/invoice.ts', source: 'export function createInvoice(orderId: OrderId): Result<Invoice, DuplicateInvoice> { return x; }\ntest("repeated order returns same invoice", ()=>{});' },
    { file: 'src/auth/reset.ts', source: 'export function resetPassword(token: Token, newPassword: Secret): Result<Ok, Expired> { return x; }' },
    { file: 'src/util/math.ts', source: 'const noop = 1;' }, // no functions -> skipped
  ];
  const res = liftRepo(files, { language: 'typescript' });
  assert.equal(res.ok, true);
  assert.equal(res.missionsGenerated, 2, 'two missions, math.ts skipped');
  assert.deepEqual(res.missions.map((m) => m.mission).sort(), ['CreateInvoice', 'ResetPassword']);
  assert.ok(res.missions.every((m) => m.summary.reviewed === false));
  assert.ok(res.confidenceSummary.high + res.confidenceSummary.medium + res.confidenceSummary.low === 2);
  assert.ok(res.unknowns > 0);
});

test('IntentLift: unsupported language fails safely, no functions handled gracefully', () => {
  assert.equal(liftSource('x', { language: 'cobol' }).ok, false);
  assert.equal(liftSource('const x = 1;', { language: 'typescript' }).ok, false);
});

const RUST_CODE = [
  'pub enum BillingError { DuplicateInvoice, Unauthorized }',
  'pub fn create_invoice(order_id: OrderId, total: Money) -> Result<Invoice, BillingError> { Ok(x) }',
  '#[test]',
  'fn repeated_order_returns_same_invoice() {}',
].join('\n');

test('IntentLift round-trip: approve marks reviewed:true with a stable source hash', () => {
  const draft = liftSource(RUST_CODE, { language: 'rust' }).intentText;
  const { text, approval } = approveIntent(draft, { approvedBy: 'Jane', approvedAt: '2026-07-09T00:00:00Z' });
  assert.equal(approval.reviewed, true);
  assert.match(approval.source_hash, /^sha256:[0-9a-f]{64}$/);
  assert.match(text, /approval\n {2}reviewed true/);
  assert.match(text, /approved_by Jane/);
  // the hash recomputes from the written file (drift can rely on it)
  assert.equal(intentHash(text), approval.source_hash);
  // approving twice is idempotent (same hash)
  assert.equal(approveIntent(text).approval.source_hash, approval.source_hash);
});

test('IntentLift round-trip: drift is in_sync for matching code, drift when code changes', () => {
  const draft = liftSource(RUST_CODE, { language: 'rust' }).intentText;
  const approved = approveIntent(draft, { approvedAt: '2026-07-09T00:00:00Z' }).text;

  assert.equal(checkDrift(approved, RUST_CODE, { language: 'rust' }).status, 'in_sync');

  const broken = 'pub enum BillingError { Unauthorized }\npub fn create_invoice(order_id: OrderId) -> Result<Invoice, BillingError> { Ok(x) }';
  const d = checkDrift(approved, broken, { language: 'rust' });
  assert.equal(d.status, 'drift');
  const codes = d.findings.map((f) => f.code);
  assert.ok(codes.includes('INTENT_DRIFT_GUARANTEE_UNSUPPORTED'), 'removed test -> guarantee drift');
  assert.ok(codes.includes('INTENT_DRIFT_NEVER_RULE_UNSUPPORTED'), 'removed error -> never drift');
  assert.ok(codes.includes('INTENT_DRIFT_INPUT_REMOVED'), 'removed param -> input drift');
});

test('IntentLift handoff: emits an il-to-ot-drift-v1 pack for OpenThunder', () => {
  const draft = liftSource(RUST_CODE, { language: 'rust' }).intentText;
  const approved = approveIntent(draft, { approvedBy: 'Jane', approvedAt: '2026-07-09T00:00:00Z' }).text;
  const pack = buildDriftHandoff(approved, { generatedAt: '2026-07-09T00:00:00Z' });
  assert.equal(pack.kind, 'il-to-ot-drift-v1');
  assert.equal(pack.mission, 'CreateInvoice');
  assert.equal(pack.approved, true);
  assert.match(pack.approval.sourceHash, /^sha256:/);
  // expectations name the checks OpenThunder must run against real repo evidence
  assert.ok(pack.expectations.some((e) => e.kind === 'guarantee' && e.check === 'guarantee_has_passing_evidence'));
  assert.ok(pack.expectations.some((e) => e.kind === 'never' && e.check === 'never_rule_not_violated'));
  assert.ok(pack.expectations.some((e) => e.kind === 'input' && e.check === 'input_present_in_signature'));
  // deterministic given a fixed timestamp
  assert.deepEqual(pack, buildDriftHandoff(approved, { generatedAt: '2026-07-09T00:00:00Z' }));
});

test('IntentLift round-trip: editing the approved intent is flagged stale', () => {
  const draft = liftSource(RUST_CODE, { language: 'rust' }).intentText;
  const approved = approveIntent(draft, { approvedAt: '2026-07-09T00:00:00Z' }).text;
  const edited = approved.replace('reviewed true', 'reviewed true\n# tampered');
  const d = checkDrift(edited, RUST_CODE, { language: 'rust' });
  assert.ok(d.findings.some((f) => f.code === 'INTENT_DRIFT_STALE_PROOF'), 'edited intent is stale');
});

test('contract-graph.json shape + stable slug IDs (OT consumer contract)', () => {
  const ast = parseIntent(example('CreateInvoice.thunder'));
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
  const source = example('CreateInvoice.thunder');
  const ast = parseIntent(source);
  const proof = buildProof(ast, {
    sourceFile: 'CreateInvoice.thunder', sourceHash: sha256(source), generatedAt: FIXED,
    targetsRequested: ast.targets, targetsGenerated: ['contract-graph.json'],
    diagnostics: semanticDiagnostics(ast),
  });
  assert.equal(proof.schemaVersion, PROOF_SCHEMA_VERSION);
  assert.equal(proof.sourceProduct, 'skillstech-compiler'); // ecosystem source id (STCE cert keying)
  assert.equal(proof.compilerVersion, COMPILER_VERSION);
  assert.match(proof.sourceHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(proof.ai.used, false);
  assert.equal(proof.proofStatus, 'draft');
  assert.ok(proof.guarantees.every((g) => 'id' in g && 'status' in g));
});

test('deterministic: same input + fixed timestamp => identical artifacts', () => {
  const ast1 = parseIntent(example('CreateInvoice.thunder'));
  const ast2 = parseIntent(example('CreateInvoice.thunder'));
  assert.deepEqual(buildContractGraph(ast1, FIXED), buildContractGraph(ast2, FIXED));
  assert.deepEqual(buildArchitectureGraph(ast1, FIXED), buildArchitectureGraph(ast2, FIXED));
  assert.deepEqual(buildImplementationPlan(ast1, FIXED), buildImplementationPlan(ast2, FIXED));
});

test('all four example missions parse without throwing', () => {
  for (const f of ['CreateInvoice.thunder', 'ResetPassword.thunder', 'BillingService.thunder', 'InvoiceCreated.thunder']) {
    const ast = parseIntent(example(f));
    assert.ok(ast, `${f} parsed`);
    // architecture examples should populate services/apis/events where present
    buildContractGraph(ast, FIXED);
    buildArchitectureGraph(ast, FIXED);
  }
});

// ── errors + examples blocks (ST-ratified, additive) ────────────────────────
import { renderTestplan } from '../src/compile.mjs';

test('errors and examples blocks parse, land in proof + testplan', () => {
  const src = [
    'mission PlaceOrder',
    'goal',
    '  place an order',
    'errors',
    '  OrderNotFound',
    '  PaymentDeclined',
    'examples',
    '  given a valid cart -> expect an order is created',
    '  given an empty cart -> expect OrderNotFound',
  ].join('\n');
  const ast = parseIntent(src);

  assert.deepEqual(ast.errors.map((e) => e.name), ['OrderNotFound', 'PaymentDeclined']);
  assert.equal(ast.examples.length, 2);
  assert.deepEqual(ast.examples[0], { given: 'a valid cart', expect: 'an order is created', line: ast.examples[0].line });
  assert.equal(ast.examples[1].expect, 'OrderNotFound');

  const proof = buildProof(ast, { sourceFile: 'x.thunder', sourceHash: sha256('x'), diagnostics: semanticDiagnostics(ast), generatedAt: '2026-01-01T00:00:00Z', targetsGenerated: [], targetsRequested: [] });
  assert.deepEqual(proof.errors, [{ name: 'OrderNotFound' }, { name: 'PaymentDeclined' }]);
  assert.equal(proof.examples.length, 2);

  const plan = renderTestplan(ast);
  assert.match(plan, /Failure mode handled: OrderNotFound/);
  assert.match(plan, /Example: given a valid cart -> expect an order is created/);
});

test('non-PascalCase error name warns (not an error)', () => {
  const ast = parseIntent('mission M\ngoal\n  g\nerrors\n  order_not_found\n');
  const diags = semanticDiagnostics(ast);
  const d = diags.find((x) => x.code === 'error-name-not-pascalcase');
  assert.ok(d, 'expected a pascalcase warning');
  assert.equal(d.level, 'warning');
  assert.equal(diags.filter((x) => x.level === 'error').length, 0);
});
