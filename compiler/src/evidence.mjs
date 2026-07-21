// ThunderLang -> shared evidence graph projection.
//
// Maps ThunderLang's verification artifacts into evidence-event-v1 events for the SkillsTech proof
// spine (owned by STW: siblings emit evidence-event-v1, STW composes proof-bundle-v1). ThunderLang is
// the deterministic, machine-checked layer, so its evidence is evidenceType `tool_verified`.
//
// These projections are PURE and OFFLINE. They perform no network I/O: the transport (POST to the
// spine) belongs to the hosted org-layer / CI, never the end-user CLI, so the compiler stays
// deterministic and phone-home-free. They are also SAFE-DERIVED: events carry only ids, hashes,
// verdicts, diagnostic codes, and counts , never source code, never secret values, never claim
// statement text, never data-element contents (no finding `message`, no expected/actual values).
//
// NOTE: the evidence-event-v1 envelope below is ThunderLang's PROPOSED shape, pending STW's canonical
// schema (see the TL->STW proposal on the comms bus). Field names may adjust once STW confirms.

const COUNTED_STATUSES = ['verified', 'failed', 'planned', 'needs_verification'];
const stripHash = (h) => String(h || '').replace(/^sha256:/, '');
const short = (h, n = 16) => stripHash(h).slice(0, n);

// The shared evidence-event-v1 envelope. `ctx` carries the cross-artifact context the individual
// artifacts do not all include (missionName, intentHash, compilerVersion, occurredAt).
function envelope(eventType, evidenceId, ctx = {}, payload = {}) {
  return {
    schema: 'evidence-event-v1',
    sourceProduct: 'thunderlang',
    producer: { name: 'thunderlang', version: ctx.compilerVersion || null },
    eventType,
    evidenceType: 'tool_verified',
    evidenceId,
    occurredAt: ctx.occurredAt || null,
    visibility: ctx.visibility || 'private',
    subject: { missionName: ctx.missionName || null, intentHash: ctx.intentHash || null },
    payload,
  };
}

const safeClaim = (kind, c) => ({ id: c.id, kind, status: c.status, provenBy: c.provenBy || null });
function countByStatus(claims) {
  const counts = Object.fromEntries(COUNTED_STATUSES.map((s) => [s, 0]));
  for (const c of claims) if (c && Object.prototype.hasOwnProperty.call(counts, c.status)) counts[c.status]++;
  return counts;
}
// Safe-derived finding: diagnostic code + level (+ flags), never the human message (which can quote code).
const safeFinding = (f) => ({ code: f.code, level: f.level, ...(f.regression !== undefined ? { regression: !!f.regression } : {}), ...(f.line !== undefined ? { line: f.line } : {}) });

// intent.proven , from an intent-proof-v1 artifact.
export function toEvidenceEvents(proof) {
  if (!proof || typeof proof !== 'object') return [];
  const guarantees = Array.isArray(proof.guarantees) ? proof.guarantees : [];
  const neverRules = Array.isArray(proof.neverRules) ? proof.neverRules : [];
  const claims = [
    ...guarantees.map((c) => safeClaim('guarantee', c)),
    ...neverRules.map((c) => safeClaim('prohibition', c)),
  ];
  const fr = proof.freshness || {};
  const intentHash = proof.freshness?.intentHash || proof.sourceHash || null;
  return [envelope('intent.proven', `tl-proof-${short(intentHash)}`, {
    compilerVersion: proof.compilerVersion, occurredAt: proof.generatedAt, missionName: proof.missionName, intentHash,
  }, {
    proofStatus: proof.proofStatus || null,
    total: claims.length,
    counts: countByStatus(claims),
    freshness: { implementation: fr.implementation || null, dependencies: fr.dependencies ? fr.dependencies.hash || null : null, environment: fr.environment || null },
    claims,
  })];
}

// change.gated , from a verify-diff verdict ({ verdict, ok, findings, blocking, summary }).
export function verifyDiffToEvidence(verdict, ctx = {}) {
  if (!verdict || typeof verdict !== 'object') return [];
  const findings = Array.isArray(verdict.findings) ? verdict.findings : [];
  const id = `tl-verifydiff-${short(ctx.intentHash)}${ctx.changeHash ? `-${short(ctx.changeHash, 8)}` : ''}`;
  return [envelope('change.gated', id, ctx, {
    verdict: verdict.verdict || null,
    ok: !!verdict.ok,
    blocking: verdict.blocking || 0,
    regressions: verdict.summary?.regressions ?? findings.filter((f) => f.regression).length,
    findings: findings.map(safeFinding),
  })];
}

// conformance.verified , from a thunder-conformance-v1 report.
export function conformToEvidence(report, ctx = {}) {
  if (!report || typeof report !== 'object') return [];
  const cases = Array.isArray(report.cases) ? report.cases : [];
  const columns = Array.isArray(report.columns) ? report.columns : [];
  // Per-target pass/fail/declared counts, derived without leaking any expected/actual values.
  const targets = {};
  for (const col of columns) {
    const t = { pass: 0, fail: 0, declared: 0 };
    for (const c of cases) { const s = c.targets?.[col]?.status; if (s === 'pass') t.pass++; else if (s === 'fail') t.fail++; else t.declared++; }
    targets[col] = t;
  }
  return [envelope('conformance.verified', `tl-conform-${short(ctx.intentHash)}`, ctx, {
    total: report.total || cases.length,
    columns,
    semanticFailures: report.semanticFailures || 0,
    graded: !!report.graded,
    targets,
    // failure locations by name only (case + target), never expected/actual values.
    failures: (Array.isArray(report.failures) ? report.failures : []).map((f) => ({ target: f.target, case: f.case })),
  })];
}

// intent.drift , from a checkDrift report ({ status, findings, summary }).
export function driftToEvidence(report, ctx = {}) {
  if (!report || typeof report !== 'object') return [];
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const id = `tl-drift-${short(ctx.intentHash)}${ctx.codeHash ? `-${short(ctx.codeHash, 8)}` : ''}`;
  return [envelope('intent.drift', id, ctx, {
    status: report.status || null,
    total: findings.length,
    blocking: report.summary?.blocking ?? 0,
    findings: findings.map(safeFinding),
  })];
}
