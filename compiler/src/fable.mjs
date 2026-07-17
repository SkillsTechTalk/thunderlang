// Fable (intent-fable-v1) , the versioned, explainable rule authority the Intent Scanner runs.
// Anti-fork: Fable is NOT a new rule engine. It is a rule-metadata layer OVER ThunderLang's shipped
// DIAGNOSTIC_RULES catalog (which already carries id/severity/blocks/area), adding what a Scanner
// finding needs: a risk category, detection strategy, remediation, required evidence, suggested
// ThunderLang, and suppression/risk-acceptance policy. Every finding is explainable , never
// "AI detected a possible issue." Pure ESM, browser-safe.

import { ALL_DIAGNOSTICS } from './intent-schema.mjs';

export const FABLE_SCHEMA = 'intent-fable-v1';

// The Scanner's risk taxonomy (directive Part 3). Every finding rolls up to exactly one.
export const RISK_CATEGORIES = [
  'Intent risk', 'Implementation risk', 'Architecture risk', 'Product risk', 'UX risk',
  'Security risk', 'Privacy risk', 'Reliability risk', 'Operational risk', 'Data risk',
  'Dependency risk', 'Knowledge risk', 'Verification risk', 'AI-generated-code risk',
  'Organizational-policy risk',
];

// Diagnostic area -> risk category. Deterministic; every catalog area is mapped.
const AREA_RISK = {
  product: 'Product risk', evidence: 'Intent risk', graph: 'Intent risk', experience: 'UX risk',
  conflict: 'Intent risk', governance: 'Organizational-policy risk', privacy: 'Privacy risk',
  outcome: 'Product risk', decision: 'Implementation risk', distributed: 'Reliability risk',
  lifecycle: 'Reliability risk', temporal: 'Verification risk', style: 'UX risk',
  security: 'Security risk', type: 'Implementation risk', core: 'Intent risk',
  architecture: 'Architecture risk', ai: 'AI-generated-code risk', note: 'Knowledge risk',
};

// Remediation + suggested-verification guidance per area (a finding says how to fix it).
const AREA_REMEDIATION = {
  security: 'Remove the secret from the surface, or gate it behind an auth requirement; add a never-rule and a scan test.',
  privacy: 'State the purpose, retention, and lawful basis for the data; restrict exposure.',
  core: 'Make the intent complete: state the goal, and attach a `verify` to each guarantee/never-rule.',
  outcome: 'Give the outcome a metric, a target better than baseline, and a measurement window.',
  decision: 'Add a default and resolve overlapping/contradictory rules.',
  distributed: 'Add an idempotency key, a timeout, duplicate handling, or a compensation as required.',
  lifecycle: 'Fix the transition/state so every state is reachable and can terminate.',
  conflict: 'Resolve the contradiction or record a governed decision.',
  style: 'Bind tokens to the canonical address space; declare the accessibility target as a proposed claim.',
  type: 'Use a known semantic type or a PascalCase entity name.',
};

/**
 * The Fable rule for a diagnostic code , the shipped catalog entry augmented with Scanner
 * metadata. Returns a synthetic rule for unknown codes so a finding is always explainable.
 */
export function fableRuleFor(code) {
  const base = ALL_DIAGNOSTICS.find((r) => r.ruleId === code);
  const area = base?.area || 'core';
  return {
    ruleId: code,
    ruleVersion: '1',
    title: base?.summary || code,
    category: AREA_RISK[area] || 'Intent risk',
    area,
    detection: 'deterministic', // every catalog check is deterministic, no AI
    severity: base?.severity || 'warning',
    defaultConfidence: 'Observed',
    blocks: base?.blocks || [],
    requiredEvidence: 'the source location(s) where the check fired',
    remediation: AREA_REMEDIATION[area] || (base?.summary ? `Address: ${base.summary}` : 'Review and resolve.'),
    suggestedVerification: area === 'core' || area === 'outcome' ? 'Add a test that proves the property, then re-scan.' : 'Add a check that would catch a regression.',
    suppressible: base?.severity !== 'blocker',
    riskAcceptable: true,
    deprecated: false,
  };
}

/** The universal Fable rule pack , every check-surface catalog rule as a Fable rule. */
export function universalPack() {
  return {
    schema: FABLE_SCHEMA,
    pack: 'universal',
    version: '1',
    rules: ALL_DIAGNOSTICS.map((r) => fableRuleFor(r.ruleId)),
  };
}

// Map an intent-graph classification/provenance-free deterministic diagnostic to a confidence.
const confidenceFor = (rule) => (rule.detection === 'deterministic' ? 'Observed' : 'Inferred');

/**
 * Turn a compiler diagnostic (from semanticDiagnostics) into a rich Fable Finding , the directive's
 * finding model: what/why/evidence/affected/severity/confidence/detection/remediation/... Every
 * field is present so a finding is never unexplained.
 */
export function toFinding(diag, { file = null, index = 0, affectedNodes = [] } = {}) {
  const rule = fableRuleFor(diag.code);
  const isBlocker = diag.severity === 'blocker';
  return {
    findingId: `${(diag.code || 'FINDING').toLowerCase()}-${file ? file.replace(/[^a-z0-9]+/gi, '-') : 'x'}-${index}`,
    ruleId: rule.ruleId,
    ruleVersion: rule.ruleVersion,
    category: rule.category,
    detected: diag.message,
    why: diag.why || rule.title,
    evidence: [{ file, line: diag.line ?? null, kind: 'diagnostic', detail: diag.message }],
    affectedNodes,
    severity: isBlocker ? 'blocker' : (diag.level || 'warning'),
    confidence: confidenceFor(rule),
    detectionType: rule.detection,
    potentialImpact: isBlocker ? 'Blocks a phase (e.g. release) until resolved.' : 'Weakens the intent; not blocking.',
    remediation: rule.remediation,
    suggestedVerification: rule.suggestedVerification,
    humanReviewRequired: rule.detection !== 'deterministic',
    suppressed: false,
    riskAccepted: false,
  };
}
