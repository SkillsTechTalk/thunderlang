// ThunderLang -> shared evidence graph projection.
//
// Maps an intent-proof-v1 artifact into evidence-event-v1 events for the SkillsTech proof spine
// (owned by STW: siblings emit evidence-event-v1, STW composes proof-bundle-v1). ThunderLang is the
// deterministic, machine-checked layer, so its evidence is evidenceType `tool_verified`.
//
// This projection is PURE and OFFLINE. It performs no network I/O: the transport (POST to the spine)
// belongs to the hosted org-layer / CI, never the end-user CLI, so the compiler stays deterministic
// and phone-home-free. It is also SAFE-DERIVED: events carry only ids, hashes, verdicts, counts, and
// the compiler version , never source code, never secret values, never data-element contents.
//
// NOTE: the evidence-event-v1 envelope below is ThunderLang's PROPOSED shape, pending STW's canonical
// schema (see the TL->STW proposal on the comms bus). Field names may adjust once STW confirms.

const COUNTED_STATUSES = ['verified', 'failed', 'planned', 'needs_verification'];

const stripHash = (h) => String(h || '').replace(/^sha256:/, '');

// Safe-derived per-claim projection: id + kind + status + provenBy (a test/decision name).
// Deliberately omits the claim's free-text statement and its evidence details.
const safeClaim = (kind, c) => ({ id: c.id, kind, status: c.status, provenBy: c.provenBy || null });

function countByStatus(claims) {
  const counts = Object.fromEntries(COUNTED_STATUSES.map((s) => [s, 0]));
  for (const c of claims) if (c && Object.prototype.hasOwnProperty.call(counts, c.status)) counts[c.status]++;
  return counts;
}

// Project an intent-proof-v1 into evidence-event-v1 events. Returns [] for a non-proof input.
// Today this emits a single `intent.proven` event; change.gated / conformance.verified / intent.drift
// events (from verify-diff / conform / drift artifacts) are planned follow-ons.
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
  const event = {
    schema: 'evidence-event-v1',
    sourceProduct: 'thunderlang',
    producer: { name: 'thunderlang', version: proof.compilerVersion || null },
    eventType: 'intent.proven',
    evidenceType: 'tool_verified',
    // Idempotent per intent version: re-proving the same intent overwrites, not duplicates.
    evidenceId: `tl-proof-${stripHash(intentHash).slice(0, 16)}`,
    occurredAt: proof.generatedAt || null,
    visibility: 'private',
    subject: {
      missionName: proof.missionName || null,
      intentHash: intentHash,
    },
    payload: {
      proofStatus: proof.proofStatus || null,
      total: claims.length,
      counts: countByStatus(claims),
      // The freshness tuple `thunder verify` recomputes to mark a proof STALE later. Hashes only.
      freshness: {
        implementation: fr.implementation || null,
        dependencies: fr.dependencies ? fr.dependencies.hash || null : null,
        environment: fr.environment || null,
      },
      claims,
    },
  };
  return [event];
}
