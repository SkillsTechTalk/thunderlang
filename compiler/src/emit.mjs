// IntentLang emit stage (deterministic, no AI). Turns an Intent AST into the artifacts the
// rest of the Skills Tech ecosystem consumes. Shapes match OpenThunder's confirmed consumer
// contract (contract-graph.json, architecture-graph.json) and the canonical .intent-proof.json.
// Stable IDs (slugs) let OpenThunder key Intent Drift precisely instead of fuzzy string-matching.

import { createHash } from 'node:crypto';
import { slug, KNOWN_LENSES } from './parse.mjs';
import { parseArchitectureRules } from './arch.mjs';
import { CLASSIFICATIONS } from './classification.mjs';
import { detectConflicts } from './conflict.mjs';
import { analyzeLifecycle } from './lifecycle.mjs';
import { analyzeDistributed } from './distributed.mjs';
import { analyzeDecision } from './decision.mjs';
import { analyzePrivacy } from './privacy.mjs';

// Notes metadata for proof / summaries. Notes explain meaning; they never verify.
export function notesSummary(ast) {
  const notes = ast.notes || [];
  const byLens = {};
  for (const n of notes) byLens[n.lens] = (byLens[n.lens] || 0) + 1;
  return {
    included: notes.length > 0,
    count: notes.length,
    lenses: Object.keys(byLens).sort(),
    byLens,
  };
}

export const COMPILER_VERSION = '0.1.0';
export const PROOF_SCHEMA_VERSION = '0.1.0';
// Identifies which ecosystem product emitted this proof. Consumed by SkillsTech
// Certified to key cert proofs to the compiler. Stable slug per the coordination bus.
export const SOURCE_PRODUCT = 'skillstech-compiler';

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
    // Structured architecture rules OpenThunder's Architecture Lens checks against.
    architecture: parseArchitectureRules(ast.architecture).rules,
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
// Every diagnostic teaches: `message` (what), `why` (why it matters), and `fix`
// (how). Each fix is { label, insert?, block? }. When `insert`/`block` are set,
// tools (the playground) can apply the fix by inserting `insert` into `block`
// (`top` = a new top-level block). Advisory fixes carry only a `label`.
export function semanticDiagnostics(ast) {
  const d = [...(ast.diagnostics || [])];
  const warn = (code, message, why, fix = []) => d.push({ level: 'warning', code, message, why, fix });
  const err = (code, message, why, fix = []) => d.push({ level: 'error', code, message, why, fix });

  // The subject of an intent may be a mission or any first-class architecture
  // kind (service, event, api, database). Only error when none is declared.
  const hasSubject = !!ast.mission
    || (ast.services && ast.services.length > 0)
    || (ast.events && ast.events.length > 0)
    || (ast.apis && ast.apis.length > 0)
    || (ast.databases && ast.databases.length > 0)
    || (ast.experiences && ast.experiences.length > 0)
    || (ast.patterns && ast.patterns.length > 0);
  if (!hasSubject) {
    err('missing-subject', 'No mission, service, event, api, database, or experience declared.',
      'Every file must declare one subject so the compiler knows what it is reasoning about.',
      [{ label: 'Add a mission declaration', insert: 'mission MyMission', block: 'top' }]);
  }
  // Only missions warrant a goal; experience/pattern-only files do not.
  if (!ast.goal && ast.mission) {
    warn('missing-goal', 'Mission has no goal block.',
      'The goal is the outcome the mission exists to achieve. Without it the intent is ambiguous to humans and tools.',
      [{ label: 'Add a goal block', insert: 'goal\n  Describe the outcome', block: 'top' }]);
  }

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
      warn('duplicate-without-idempotency',
        `Guarantee "${g.statement}" declares no idempotency key, unique reference, or lookup rule to enforce it.`,
        'Duplicate billing is a high-trust finance failure. IntentLang expects a prevention strategy, not just a promise.',
        [
          { label: 'Add idempotencyKey: IdempotencyKey to the input', insert: 'idempotencyKey: IdempotencyKey', block: 'input' },
          { label: 'Add a duplicate prevention test under verify', insert: 'duplicate prevention test', block: 'verify' },
          { label: 'Or declare a unique order reference / lookup rule' },
        ]);
    }
    if (g.verify.length === 0 && !verifyText.includes(slug(g.statement).replace(/-/g, ' '))) {
      warn('guarantee-without-verification',
        `Guarantee "${g.statement}" has no explicit verification.`,
        'A guarantee is only trustworthy when something proves it. Unverified guarantees are exactly where Intent Drift hides.',
        [{ label: `Attach a verify check to "${g.statement}"`, insert: `guarantee ${g.statement}\n  verify ${g.statement} check`, block: 'top' }]);
    }
  }
  for (const n of ast.neverRules) {
    if (n.verify.length === 0) {
      warn('never-without-verification',
        `Never rule "${n.statement}" has no explicit verification.`,
        'A never rule forbids behavior, but without a check nothing enforces it in the real implementation.',
        [{ label: 'Attach a verify check (for example a security scan)', insert: `never ${n.statement}\n  verify security scan`, block: 'top' }]);
    }
  }

  // Secret field with no never-log/never-return protection.
  const neverText = ast.neverRules.map((n) => n.statement.toLowerCase()).join(' ');
  const secretFields = [...ast.inputs, ...ast.outputs].filter(
    (f) => /secret|token|password|jwt/i.test(`${f.name} ${f.type || ''} ${(f.modifiers || []).join(' ')}`),
  );
  for (const f of secretFields) {
    if (!(neverText.includes('log') && (neverText.includes(f.name.toLowerCase()) || /secret|token|password/.test(neverText)))) {
      warn('secret-without-never-log',
        `Sensitive field "${f.name}" has no matching never-log / never-return rule.`,
        'Secrets leak through logs, traces, and responses. IntentLang expects an explicit rule that forbids it, near the field.',
        [
          { label: `Add never log ${f.name}`, insert: `log ${f.name}`, block: 'never' },
          { label: `Add never return ${f.name} to client`, insert: `return ${f.name} to client`, block: 'never' },
        ]);
    }
  }

  // ── IntentLens note checks (understanding, never verification) ──
  for (const note of ast.notes || []) {
    if (!KNOWN_LENSES.includes(note.lens)) {
      warn('INTENT_NOTE_UNKNOWN_LENS',
        `Unknown note lens "${note.lens}".`,
        `Notes target a known reader lens so tools can group and prioritize them. Known lenses: ${KNOWN_LENSES.join(', ')}.`,
        [{ label: 'Use a known lens (for example pm, beginner, qa, security)' }]);
    }
    if (!note.text || !note.text.trim()) {
      warn('INTENT_NOTE_EMPTY',
        `Note (${note.lens}) has no text.`,
        'An empty note adds noise without meaning. Explain the meaning, risk, usage, or verification for that reader.',
        [{ label: 'Add a sentence explaining the meaning for this reader' }]);
    }
  }

  // ── architecture rules: flag lines the rule parser cannot understand ──
  for (const u of parseArchitectureRules(ast.architecture).unparsed) {
    warn('INTENT-ARCH-001', `Architecture rule not understood: "${u}".`,
      'Architecture rules must be dependency constraints so tools can enforce them. Supported forms: "A must not depend on B", "A may depend on B", "A may implement B [ports]".',
      [{ label: 'Rephrase as "<layer> must not depend on <layer>"' }]);
  }

  // ── AI implementation declaration (intent-ai-v1) ──
  // An intentionally deferred AI implementation is NOT accidentally-missing code.
  const impl = ast.implementation;
  if (impl) {
    const SCOPES = ['expression', 'function_body', 'method', 'test', 'adapter'];
    const RISKS = ['low', 'medium', 'high', 'critical'];
    const EDITS = ['managed', 'collaborative', 'adopted'];
    d.push({
      level: 'info', code: 'INTENT-AI-001',
      message: `Mission declares an AI implementation "${impl.id || 'implementation'}" (risk ${impl.risk || 'low'}, ${impl.pending ? 'pending' : 'declared'}).`,
      why: 'This is an intentionally deferred, AI-assisted implementation, not missing code. OpenThunder verifies it and gates production; the compiler tracks its state.',
      fix: [],
    });
    if (impl.scope && !SCOPES.includes(impl.scope)) warn('INTENT-AI-010', `Unsupported implementation scope "${impl.scope}".`, `MVP scopes: ${SCOPES.join(', ')}.`);
    if (impl.risk && !RISKS.includes(impl.risk)) warn('INTENT-AI-011', `Unknown risk level "${impl.risk}".`, `Use one of: ${RISKS.join(', ')}.`);
    if (impl.editing && !EDITS.includes(impl.editing)) warn('INTENT-AI-012', `Unknown editing policy "${impl.editing}".`, `Use one of: ${EDITS.join(', ')}.`);
    if (['high', 'critical'].includes(impl.risk) && (!impl.approval || impl.approval === 'none')) {
      warn('INTENT-AI-013', `High-risk implementation "${impl.id || ''}" should require approval.`,
        'High and critical risk must require human approval even after automated verification passes.',
        [{ label: 'Add approval: required' }]);
    }
  }

  // ── errors block: PascalCase failure-mode names ──
  for (const e of ast.errors || []) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(e.name)) {
      warn('error-name-not-pascalcase',
        `Failure mode "${e.name}" is not PascalCase.`,
        'Failure modes become status/result union members and per-error tests, so they read best as PascalCase names (for example OrderNotFound).',
        [{ label: `Rename to PascalCase (for example ${e.name.replace(/[^A-Za-z0-9]+/g, ' ').replace(/(?:^|\s)(\w)/g, (_, c) => c.toUpperCase()).replace(/\s+/g, '') || 'FailureName'})` }]);
    }
  }

  // ── Product / intent-graph diagnostics (intent-graph-v1) ──
  // Role-aware. Kept at warning/info so `intent check` stays valid; `severity` +
  // `blocks` drive phase gates (a valid spec can still be not-ready-to-proceed).
  for (const m of ast.metrics || []) {
    if (!m.window) d.push({
      level: 'warning', code: 'IL-PM-001', severity: 'blocker', blocks: ['release'],
      message: `Metric "${m.name}" has no measurement window.`,
      why: 'A success metric without a measurement period cannot be evaluated after release.',
      roles: { product: `The success metric "${m.name}" has no measurement period. Add when the team should evaluate the result.` },
      fix: [{ label: 'Add a window (for example: window 30 days after release)' }],
    });
  }
  for (const e of ast.evidence || []) {
    if (!e.classification) d.push({
      level: 'info', code: 'IL-EV-001', message: `Evidence "${e.name}" has no classification.`,
      why: 'Classify evidence (observed / inferred / proposed / assumed) so AI-generated content never silently becomes fact.',
      fix: [{ label: 'Add: classification observed' }],
    });
    else if (!CLASSIFICATIONS.includes(e.classification)) d.push({
      level: 'warning', code: 'IL-EV-002', message: `Evidence "${e.name}" has an unknown classification "${e.classification}".`,
      why: `Use one of: ${CLASSIFICATIONS.join(', ')}.`,
    });
  }
  for (const u of ast.unknowns || []) {
    if (u.resolveBefore) d.push({
      level: 'warning', code: 'IL-GRAPH-010', severity: 'blocker', blocks: [String(u.resolveBefore).toLowerCase()],
      message: `Unknown "${u.name}" must be resolved before ${u.resolveBefore}.`,
      why: 'An unresolved unknown that blocks a declared phase is a blocker for that phase, not an ordinary warning.',
      roles: { product: `"${u.name}" is unresolved and blocks ${u.resolveBefore}.`, engineer: `Unknown "${u.name}" gates ${u.resolveBefore}.` },
    });
  }
  for (const q of ast.questions || []) {
    if (q.blocks) d.push({
      level: 'warning', code: 'IL-GRAPH-011', severity: 'blocker', blocks: [String(q.blocks).toLowerCase()],
      message: `Open question "${q.name}" blocks ${q.blocks}.`,
      why: 'An open question that blocks a phase must be answered before that phase proceeds.',
    });
  }
  for (const o of ast.outcomes || []) {
    const hasMetric = (ast.metrics || []).length > 0;
    if (!hasMetric) d.push({
      level: 'warning', code: 'IL-PM-003', message: `Outcome "${o.name}" has no metric.`,
      why: 'An outcome without a metric cannot be measured, so success cannot be proven.',
      roles: { product: `Outcome "${o.name}" needs a metric to know whether it worked.` },
    });
  }

  // ── Experience Contract diagnostics (intent-graph-v1) ──
  for (const exp of ast.experiences || []) {
    for (const st of exp.states || []) {
      const isFailure = /(fail|error|denied|timeout|offline|reject)/i.test(st.name || '');
      if (isFailure && !st.hasRecovery) d.push({
        level: 'warning', code: 'IL-EXP-004', severity: 'blocker', blocks: ['experience-approval', 'release'],
        message: `Experience "${exp.name}" state "${st.name}" is a failure state with no recovery path.`,
        why: 'A failure state that does not explain how the user recovers strands them.',
        roles: {
          ux: `The ${st.name} state defines a failure, but it does not explain how the user can recover.`,
          engineer: `Experience state \`${st.name}\` has no transition to a recoverable state.`,
        },
        fix: [{ label: 'Add a recovery affordance (for example: offer Retry)' }],
      });
    }
    if ((exp.states || []).length === 0) d.push({
      level: 'info', code: 'IL-EXP-001', message: `Experience "${exp.name}" declares no states.`,
      why: 'Experiences should declare their states (empty, loading, success, failure, recovery) so completeness can be checked.',
    });
  }

  // ── Constraint conflicts (Gap 1) , the reconciliation layer ──
  for (const c of detectConflicts(ast)) {
    if (c.type === 'declared' && c.status === 'resolved') continue; // a recorded human choice clears it
    if (c.type === 'declared') d.push({
      level: 'warning', code: 'IL-CONFLICT-001', severity: 'blocker', blocks: c.before ? [String(c.before).toLowerCase()] : ['implementation'],
      owners: c.resolveBy || [],
      message: `Unresolved conflict "${c.name}" between ${(c.between || []).join(' and ')}.`,
      why: 'Roles disagree about what must be true. The conflict must be resolved before the blocked phase, or implementation will satisfy one constraint by violating another.',
      roles: {
        product: `"${c.name}": ${(c.between || []).join(' vs ')} conflict. Resolve with ${(c.resolveBy || ['the owners']).join(', ')} before ${c.before || 'implementation'}.`,
      },
      fix: (c.options || []).map((o) => ({ label: `Option: ${o}` })),
    });
    else if (c.type === 'scope-contradiction') d.push({
      level: 'warning', code: 'IL-CONFLICT-010', severity: 'blocker', blocks: ['implementation'],
      message: `Scope both includes and excludes "${c.name}".`,
      why: 'A single item cannot be in and out of scope. One of the two declarations is wrong.',
    });
    else if (c.type === 'negation') d.push({
      level: 'warning', code: 'IL-CONFLICT-012', severity: 'blocker', blocks: ['implementation'],
      message: `Contradictory constraints: ${c.name}.`,
      why: `${(c.between || []).join(' and ')} directly contradict each other.`,
    });
    else if (c.type === 'redundant') d.push({
      level: 'info', code: 'IL-CONFLICT-011', message: `Redundant constraint "${c.name}" declared by ${(c.between || []).join(', ')}.`,
      why: 'The same constraint is contributed by more than one role. Harmless, but consolidate for clarity.',
    });
  }

  // ── Temporal + lifecycle (Gap 2) , static state-machine analysis ──
  for (const lc of ast.lifecycles || []) {
    for (const f of analyzeLifecycle(lc).findings) {
      const isError = f.code === 'IL-LIFE-001'; // undefined-state reference is a real bug
      d.push({
        level: isError ? 'error' : 'warning', code: f.code,
        message: `Lifecycle "${lc.name}": ${f.message}`,
        why: 'The declared state machine is not well-formed. OpenThunder verifies the implementation against this same model.',
        roles: { engineer: `Lifecycle \`${lc.name}\`: ${f.message}` },
      });
    }
  }
  for (const e of ast.eventually || []) {
    if (!e.within) d.push({
      level: 'warning', code: 'IL-TEMP-001', severity: 'blocker', blocks: ['verification'],
      message: `Eventually "${e.statement}" has no time bound.`,
      why: 'An eventual guarantee with no "within" cannot be verified or alerted on; it may never complete.',
      fix: [{ label: 'Add a bound (for example: within 2 minutes)' }],
    });
  }

  // ── Distributed + failure semantics (Gap 3) , static failure-policy checks ──
  const DIST_WHY = {
    'IL-DIST-001': 'Retrying a non-idempotent command duplicates work (double charges, duplicate records).',
    'IL-DIST-002': 'A retried or remote command with no timeout can hang forever and exhaust resources.',
    'IL-DIST-003': 'At-least-once delivery WILL redeliver; without duplicate handling the effect happens twice.',
    'IL-DIST-004': 'A permanent failure with no compensation leaves partial state behind.',
    'IL-DIST-005': 'A handler references an event that is not declared (likely a typo).',
  };
  // ── Decisions / rules (Gap 4) , conflict + coverage on the declared decision ──
  for (const dec of ast.decisions || []) {
    for (const f of analyzeDecision(dec)) {
      const isBlocker = f.code === 'IL-DEC-001' || f.code === 'IL-DEC-002';
      d.push({
        level: 'warning', code: f.code,
        severity: isBlocker ? 'blocker' : undefined, blocks: isBlocker ? ['implementation'] : undefined,
        message: f.message,
        why: f.code === 'IL-DEC-001' ? 'Without a default, the decision is undefined when no rule matches.'
          : f.code === 'IL-DEC-002' ? 'Two rules fire on the same condition with different results, so the outcome is ambiguous.'
          : f.code === 'IL-DEC-003' ? 'Two rules are identical; one is dead.'
          : 'A decision with no rules cannot decide anything.',
        roles: { product: f.message, engineer: f.message },
        fix: f.code === 'IL-DEC-001' ? [{ label: 'Add a default (for example: default\\n  return NotEligible)' }] : [],
      });
    }
  }

  for (const f of analyzeDistributed(ast)) {
    const isError = f.code === 'IL-DIST-005';
    d.push({
      level: isError ? 'error' : 'warning', code: f.code,
      severity: isError ? undefined : 'blocker', blocks: isError ? undefined : ['implementation'],
      message: f.message, why: DIST_WHY[f.code],
      roles: { engineer: f.message, product: f.message },
      fix: f.code === 'IL-DIST-001' ? [{ label: 'Add: idempotency_key <field>' }] : f.code === 'IL-DIST-003' ? [{ label: `Add: on duplicate ${f.target} ... ignore when ...` }] : [],
    });
  }

  // ── Data purpose + privacy (Gap 6) , purpose limitation on declared data elements ──
  const PRIVACY_WHY = {
    'IL-DATA-001': 'Personal data with no stated purpose cannot be limited to that purpose; purpose limitation is the core privacy duty.',
    'IL-DATA-002': 'Personal data with no retention rule is kept indefinitely, which is a storage-limitation violation.',
    'IL-DATA-003': 'Holding personal data requires a lawful basis (consent, contract, legitimate interest, ...).',
    'IL-DATA-004': 'An unknown classification cannot be governed; use one of public/internal/confidential/pii/sensitive.',
    'IL-DATA-005': 'The lawful basis is not one of the recognized GDPR Art. 6 bases.',
    'IL-DATA-006': 'Sensitive data returned to a caller with no "never expose" guard risks over-exposure.',
  };
  for (const f of analyzePrivacy(ast)) {
    const isBlocker = f.severity === 'blocker';
    d.push({
      level: 'warning', code: f.code,
      severity: isBlocker ? 'blocker' : undefined, blocks: isBlocker ? ['release'] : undefined,
      message: f.message, why: PRIVACY_WHY[f.code],
      roles: { product: f.message, engineer: f.message, legal: f.message },
    });
  }

  return d;
}

// ── .intent-proof.json ───────────────────────────────────────────────────────
export function buildProof(ast, { sourceFile, sourceHash, targetsRequested, targetsGenerated, diagnostics, generatedAt }) {
  const passedSemantic = !diagnostics.some((x) => x.level === 'error');
  const verifiedText = ast.verify.join(' ').toLowerCase();
  return {
    schemaVersion: PROOF_SCHEMA_VERSION,
    sourceProduct: SOURCE_PRODUCT,
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
    errors: (ast.errors || []).map((e) => ({ name: e.name })),
    examples: (ast.examples || []).map((ex) => ({ given: ex.given, expect: ex.expect })),
    verification: { syntaxPassed: true, semanticPassed: passedSemantic, targetsGenerated: targetsGenerated.length > 0 },
    // Notes are understanding metadata only; they never mark a guarantee verified.
    notes: notesSummary(ast),
    diagnostics,
    ai: { used: false },
    humanApproval: { required: true, approved: false },
    proofStatus: 'draft',
  };
}
