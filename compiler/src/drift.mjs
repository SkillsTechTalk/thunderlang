// IntentLift round-trip: approve an inferred draft, then check whether the code
// still matches the approved intent. Deterministic, no AI. This is the
// compiler-side drift check; OpenThunder does the deeper repo-wide version later.
//
//   lift code -> .intent draft -> intent approve -> (code changes) -> intent drift

import { createHash } from 'node:crypto';
import { parseIntent, slug } from './parse.mjs';
import { liftSource } from './lift.mjs';
import { COMPILER_VERSION } from './emit.mjs';

const sha256 = (s) => 'sha256:' + createHash('sha256').update(s).digest('hex');

// Remove a top-level block (header + indented body + one trailing blank).
function stripBlock(text, keyword) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!/^\s/.test(l) && (l.trim() === keyword || l.startsWith(keyword + ' '))) {
      i++;
      while (i < lines.length && /^\s+\S/.test(lines[i])) i++;
      if (i < lines.length && lines[i].trim() === '') i++;
      continue;
    }
    out.push(l);
    i++;
  }
  return out.join('\n');
}

/** Hash of the intent content, excluding the approval block, so it is stable. */
export function intentHash(intentText) {
  return sha256(stripBlock(intentText, 'approval').trim());
}

/**
 * Approve an intent: flip `reviewed` to true, add an `approval` block with the
 * source hash (of the intent content), reviewer, and time. `approvedAt` is
 * passed in (never Date.now here) so approval is reproducible in tests.
 */
export function approveIntent(intentText, { approvedBy, approvedAt } = {}) {
  const base = stripBlock(intentText, 'approval')
    .replace(/^(\s*)reviewed\s+false\b/m, '$1reviewed true')
    .replace(/\s+$/, '');
  // Hash the exact content that gets written (post reviewed-flip), so a later
  // `intent drift` recomputes the same hash when nothing has changed.
  const hash = sha256(base.trim());
  const lines = ['approval', '  reviewed true'];
  if (approvedBy) lines.push(`  approved_by ${approvedBy}`);
  if (approvedAt) lines.push(`  approved_at ${approvedAt}`);
  lines.push(`  source_hash ${hash}`);
  lines.push(`  approved_with SkillsTech Compiler ${COMPILER_VERSION}`);
  return {
    text: `${base}\n\n${lines.join('\n')}\n`,
    approval: { reviewed: true, approvedBy, approvedAt, source_hash: hash },
  };
}

/**
 * Emit the drift handoff pack that OpenThunder consumes. The compiler states the
 * expectations (what must be true) and the checks OpenThunder should run against
 * REAL repo evidence (tests executed, routes present, logs/events scanned).
 * The compiler does not perform repo-wide verification; OpenThunder does, and it
 * emits `intent-drift-report-v1` in return.
 */
export function buildDriftHandoff(approvedIntentText, { generatedAt = null } = {}) {
  const ast = parseIntent(approvedIntentText);
  const expectations = [
    ...ast.guarantees.map((g) => ({
      kind: 'guarantee', id: g.id, statement: g.statement,
      expectedEvidence: g.verify, check: 'guarantee_has_passing_evidence',
    })),
    ...ast.neverRules.map((n) => ({
      kind: 'never', id: n.id, statement: n.statement,
      expectedEvidence: n.verify, check: 'never_rule_not_violated',
    })),
    ...ast.inputs.map((f) => ({
      kind: 'input', name: f.name, type: f.type || 'Unknown',
      check: 'input_present_in_signature',
    })),
    ...(ast.apis || []).map((a) => ({
      kind: 'api', id: a.id, method: a.method, path: a.path,
      check: 'route_present',
    })),
  ];
  return {
    schemaVersion: '0.1.0',
    kind: 'il-to-ot-drift-v1',
    generatedBy: `SkillsTech Compiler ${COMPILER_VERSION}`,
    generatedAt,
    mission: ast.mission || 'mission',
    approved: !!(ast.approval && ast.approval.reviewed),
    approval: ast.approval
      ? {
          reviewed: !!ast.approval.reviewed,
          approvedBy: ast.approval.approved_by || null,
          approvedAt: ast.approval.approved_at || null,
          sourceHash: ast.approval.source_hash || null,
        }
      : null,
    mapsTo: (ast.lift && ast.lift.maps_to) || [],
    expectations,
    handoff:
      'OpenThunder verifies these expectations against real repo evidence and emits intent-drift-report-v1. The compiler does not perform repo-wide verification.',
  };
}

function verdict(findings) {
  const blocking = findings.filter(
    (f) => f.level === 'warning' && /UNSUPPORTED|INPUT_REMOVED|STALE/.test(f.code),
  ).length;
  const status = blocking > 0
    ? 'drift'
    : findings.some((f) => f.code === 'INTENT_DRIFT_NEW_BEHAVIOR')
      ? 'review'
      : 'in_sync';
  return {
    status,
    findings,
    summary: { status, findings: findings.length, blocking },
  };
}

/**
 * Check whether `codeSource` still satisfies the approved `intentText`. Re-lifts
 * the code and compares guarantees, never rules, and inputs by normalized slug.
 */
export function checkDrift(intentText, codeSource, { language = 'typescript' } = {}) {
  const ast = parseIntent(intentText);
  const findings = [];
  const add = (level, code, message) => findings.push({ level, code, message });

  if (ast.approval?.source_hash) {
    if (intentHash(intentText) !== ast.approval.source_hash) {
      add('warning', 'INTENT_DRIFT_STALE_PROOF', 'The approved intent was edited after approval (hash mismatch). Re-approve it.');
    }
  } else {
    add('info', 'INTENT_DRIFT_NOT_APPROVED', 'This intent has no approval block. Approve it first: intent approve <file>.');
  }

  const lift = liftSource(codeSource, { language });
  if (!lift.ok) {
    add('warning', 'INTENT_DRIFT_NO_CODE_EVIDENCE', lift.error || 'Could not analyze the implementation.');
    return verdict(findings);
  }
  const li = lift.lifted;
  const norm = (s) => slug(s);
  const codeGuar = new Set(li.guarantees.map((g) => norm(g.statement)));
  const codeNever = new Set(li.neverRules.map((n) => norm(n.statement)));
  const codeInputs = new Set(li.inputs.map((i) => norm(i.name)));
  const intentGuar = new Set(ast.guarantees.map((g) => norm(g.statement)));

  for (const g of ast.guarantees) {
    if (!codeGuar.has(norm(g.statement))) {
      add('warning', 'INTENT_DRIFT_GUARANTEE_UNSUPPORTED', `Guarantee "${g.statement}" has no matching evidence in the code (test removed or renamed?).`);
    }
  }
  for (const n of ast.neverRules) {
    if (!codeNever.has(norm(n.statement))) {
      add('warning', 'INTENT_DRIFT_NEVER_RULE_UNSUPPORTED', `Never rule "${n.statement}" has no matching error or guard in the code.`);
    }
  }
  for (const f of ast.inputs) {
    if (!codeInputs.has(norm(f.name))) {
      add('warning', 'INTENT_DRIFT_INPUT_REMOVED', `Input "${f.name}" is declared in the intent but not found in the code signature.`);
    }
  }
  for (const g of li.guarantees) {
    if (!intentGuar.has(norm(g.statement))) {
      add('info', 'INTENT_DRIFT_NEW_BEHAVIOR', `The code has behavior "${g.statement}" that the approved intent does not declare.`);
    }
  }

  return verdict(findings);
}
