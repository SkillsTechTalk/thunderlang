// Scanner query views (intent-scan-view-v1) , the deterministic answers behind the Part 3
// CLI verbs: `intent risks | gaps | unverified | coverage | unknowns | contradictions`.
// These are pure derivations over a scanProject() result (its Intent IR + Fable findings) ,
// no new analysis, no AI. They exist so a person can ask one focused question ("what is
// unverified?", "what contradicts?") instead of reading the whole scan report.
//
// IntentLang owns this because it owns the Scanner spine + Intent IR. It deliberately does
// NOT own learning/mastery (RepoMastery) or code verification (OpenThunder); those consume
// these same artifacts.

export const VIEW_SCHEMA = 'intent-scan-view-v1';

const nodes = (scan) => scan?.ir?.nodes || [];
const rels = (scan) => scan?.ir?.relationships || [];
const findings = (scan) => scan?.findings || [];
const claimNodes = (scan) => nodes(scan).filter((n) => n.type === 'Guarantee' || n.type === 'Never');

// Node ids that a `verified_by` edge touches (robust to edge direction).
function verifiedIds(scan) {
  const s = new Set();
  for (const e of rels(scan)) if (e.type === 'verified_by') { s.add(e.from); s.add(e.to); }
  return s;
}

/** Risk themes + the highest-impact remediation order (the scan report's risk half, focused). */
export function risksView(scan) {
  return {
    schema: VIEW_SCHEMA, view: 'risks',
    bySeverity: scan?.bySeverity || {},
    themes: scan?.risks || [],
    remediationSequence: scan?.remediationSequence || [],
    count: (scan?.risks || []).length,
  };
}

/** Intent gaps: missing goal, unverified guarantees, and other "something required is absent" findings. */
export function gapsView(scan) {
  const GAP = /(^missing-|-without-|-missing$|^no-)/;
  const gaps = findings(scan).filter((f) => f.category === 'Intent risk' || GAP.test(f.ruleId));
  return {
    schema: VIEW_SCHEMA, view: 'gaps', count: gaps.length,
    gaps: gaps.map((f) => ({ ruleId: f.ruleId, severity: f.severity, detected: f.detected, why: f.why, remediation: f.remediation })),
  };
}

/** Unverified claims: guarantees / never-rules with no verification behind them (IR + findings). */
export function unverifiedView(scan) {
  const verified = verifiedIds(scan);
  const claims = claimNodes(scan).filter((c) => !verified.has(c.id));
  return {
    schema: VIEW_SCHEMA, view: 'unverified', count: claims.length,
    claims: claims.map((c) => ({ id: c.id, type: c.type, title: c.title })),
    findings: findings(scan).filter((f) => /-without-verification$/.test(f.ruleId)).map((f) => ({ ruleId: f.ruleId, detected: f.detected })),
  };
}

/** Verification coverage: share of guarantees + never-rules that have a verification. */
export function coverageView(scan) {
  const claims = claimNodes(scan);
  const verified = verifiedIds(scan);
  const covered = claims.filter((c) => verified.has(c.id));
  const coverage = claims.length ? Math.round((covered.length / claims.length) * 100) : 100;
  return {
    schema: VIEW_SCHEMA, view: 'coverage',
    total: claims.length, verified: covered.length, coverage,
    unverified: claims.filter((c) => !verified.has(c.id)).map((c) => ({ id: c.id, type: c.type, title: c.title })),
  };
}

/** Unknowns: nodes that are open questions, assumptions, or low-confidence (never shown as fact). */
export function unknownsView(scan) {
  const LOW = new Set(['Inferred', 'Speculative', 'Conflicted']);
  const open = nodes(scan).filter((n) => ['Unknown', 'Question', 'Assumption'].includes(n.type) || LOW.has(n.confidence));
  return {
    schema: VIEW_SCHEMA, view: 'unknowns', count: open.length,
    unknowns: open.map((n) => ({ id: n.id, type: n.type, title: n.title, confidence: n.confidence || null, provenance: n.provenance || null })),
  };
}

/** Contradictions: explicit Conflict nodes, contradicts/conflicts edges, and conflict-shaped findings. */
export function contradictionsView(scan) {
  const conflictNodes = nodes(scan).filter((n) => n.type === 'Conflict');
  const conflictRels = rels(scan).filter((e) => e.type === 'contradicts' || e.type === 'conflicts_with');
  const conflictFindings = findings(scan).filter((f) => /(contradict|conflict)/.test(f.ruleId));
  return {
    schema: VIEW_SCHEMA, view: 'contradictions',
    count: conflictNodes.length + conflictRels.length + conflictFindings.length,
    conflicts: conflictNodes.map((n) => ({ id: n.id, title: n.title })),
    links: conflictRels.map((e) => ({ from: e.from, to: e.to, type: e.type })),
    findings: conflictFindings.map((f) => ({ ruleId: f.ruleId, detected: f.detected })),
  };
}

export const VIEWS = {
  risks: risksView, gaps: gapsView, unverified: unverifiedView,
  coverage: coverageView, unknowns: unknownsView, contradictions: contradictionsView,
};
