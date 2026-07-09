// IntentLang emit stage (deterministic, no AI). Turns an Intent AST into the artifacts the
// rest of the Skills Tech ecosystem consumes. Shapes match OpenThunder's confirmed consumer
// contract (contract-graph.json, architecture-graph.json) and the canonical .intent-proof.json.
// Stable IDs (slugs) let OpenThunder key Intent Drift precisely instead of fuzzy string-matching.

import { createHash } from 'node:crypto';
import { slug } from './parse.mjs';

export const COMPILER_VERSION = '0.1.0';
export const PROOF_SCHEMA_VERSION = '0.1.0';

export const sha256 = (s) => 'sha256:' + createHash('sha256').update(s).digest('hex');

// ── contract-graph.json ──────────────────────────────────────────────────────
// missions[].guarantees / neverRules / apis / events / services , the declared contract.
export function buildContractGraph(ast, generatedAt) {
  const mission = {
    id: slug(ast.mission || 'mission'),
    name: ast.mission,
    title: ast.mission,
    goal: ast.goal || null,
    why: ast.why || null,
    targets: ast.targets,
    guarantees: ast.guarantees.map((g) => ({
      id: g.id, statement: g.statement, verified: false, because: g.because, verify: g.verify,
    })),
    neverRules: ast.neverRules.map((n) => ({
      id: n.id, statement: n.statement, because: n.because, verify: n.verify,
    })),
    apis: ast.apis.map((a) => ({ id: a.id, name: a.name, method: a.method, path: a.path })),
    events: ast.events.map((e) => ({ id: e.id, name: e.name })),
    services: ast.services.map((s) => ({ id: s.id, name: s.name, owner: s.owner })),
    verify: ast.verify,
  };
  return { compilerVersion: COMPILER_VERSION, generatedAt, missions: [mission] };
}

// ── architecture-graph.json ──────────────────────────────────────────────────
export function buildArchitectureGraph(ast, generatedAt) {
  const dependencies = [];
  for (const s of ast.services) {
    for (const c of s.consumes) dependencies.push({ from: s.id, to: slug(c), kind: 'consumes' });
    for (const p of s.publishes) dependencies.push({ from: s.id, to: slug(p), kind: 'publishes' });
  }
  return {
    compilerVersion: COMPILER_VERSION, generatedAt,
    services: ast.services, apis: ast.apis, events: ast.events, databases: ast.databases,
    dependencies,
  };
}

// ── implementation-plan.json ─────────────────────────────────────────────────
// Deterministic, ordered plan derived from the contract (no AI). Foundation, not code gen.
export function buildImplementationPlan(ast, generatedAt) {
  const steps = [];
  for (const a of ast.apis) steps.push(`Add ${a.method || 'HTTP'} ${a.path || a.name} endpoint`);
  for (const r of ast.requires) steps.push(`Validate precondition: ${r}`);
  for (const g of ast.guarantees) steps.push(`Enforce guarantee: ${g.statement}`);
  for (const n of ast.neverRules) steps.push(`Prevent forbidden behavior: ${n.statement}`);
  for (const e of ast.events) steps.push(`Publish event: ${e.name}`);
  for (const v of ast.verify) steps.push(`Add verification: ${v}`);
  return {
    compilerVersion: COMPILER_VERSION, generatedAt,
    mission: ast.mission,
    steps: steps.map((description, i) => ({ order: i + 1, description })),
  };
}

// ── semantic diagnostics (a slice of stage 2) ────────────────────────────────
export function semanticDiagnostics(ast) {
  const d = [...(ast.diagnostics || [])];
  const warn = (code, message) => d.push({ level: 'warning', code, message });
  const err = (code, message) => d.push({ level: 'error', code, message });

  if (!ast.mission) err('missing-mission', 'No mission name declared.');
  if (!ast.goal) warn('missing-goal', 'Mission has no goal block.');

  const verifyText = [
    ...ast.verify,
    ...ast.guarantees.flatMap((g) => g.verify),
    ...ast.neverRules.flatMap((n) => n.verify),
  ].join(' ').toLowerCase();

  // Guarantee that promises duplicate prevention but shows no idempotency mechanism.
  const idempotencySignals = [
    ...ast.requires, ...ast.inputs.map((f) => `${f.name} ${f.type || ''}`),
  ].join(' ').toLowerCase();
  for (const g of ast.guarantees) {
    if (/duplicate/.test(g.statement.toLowerCase()) && !/idempotenc|unique|order ?reference|lookup/.test(idempotencySignals + ' ' + g.statement.toLowerCase())) {
      warn('duplicate-without-idempotency', `Guarantee "${g.statement}" declares no idempotency key, unique reference, or lookup rule to enforce it.`);
    }
    if (g.verify.length === 0 && !verifyText.includes(slug(g.statement).replace(/-/g, ' '))) {
      warn('guarantee-without-verification', `Guarantee "${g.statement}" has no explicit verification.`);
    }
  }
  for (const n of ast.neverRules) {
    if (n.verify.length === 0) warn('never-without-verification', `Never rule "${n.statement}" has no explicit verification.`);
  }

  // Secret field with no never-log/never-return protection.
  const neverText = ast.neverRules.map((n) => n.statement.toLowerCase()).join(' ');
  const secretFields = [...ast.inputs, ...ast.outputs].filter(
    (f) => /secret|token|password|jwt/i.test(`${f.name} ${f.type || ''} ${(f.modifiers || []).join(' ')}`),
  );
  for (const f of secretFields) {
    if (!(neverText.includes('log') && (neverText.includes(f.name.toLowerCase()) || /secret|token|password/.test(neverText)))) {
      warn('secret-without-never-log', `Sensitive field "${f.name}" has no matching never-log / never-return rule.`);
    }
  }
  return d;
}

// ── .intent-proof.json ───────────────────────────────────────────────────────
export function buildProof(ast, { sourceFile, sourceHash, targetsRequested, targetsGenerated, diagnostics, generatedAt }) {
  const passedSemantic = !diagnostics.some((x) => x.level === 'error');
  const verifiedText = ast.verify.join(' ').toLowerCase();
  return {
    schemaVersion: PROOF_SCHEMA_VERSION,
    missionName: ast.mission,
    sourceFile,
    sourceHash,
    compilerVersion: COMPILER_VERSION,
    generatedAt,
    targetsRequested,
    targetsGenerated,
    guarantees: ast.guarantees.map((g) => ({
      id: g.id, text: g.statement,
      status: g.verify.length > 0 || verifiedText ? 'planned' : 'needs_verification',
      evidence: g.verify,
    })),
    neverRules: ast.neverRules.map((n) => ({
      id: n.id, text: n.statement,
      status: n.verify.length > 0 ? 'planned' : 'needs_verification',
      evidence: n.verify,
    })),
    verification: { syntaxPassed: true, semanticPassed: passedSemantic, targetsGenerated: targetsGenerated.length > 0 },
    diagnostics,
    ai: { used: false },
    humanApproval: { required: true, approved: false },
    proofStatus: 'draft',
  };
}
