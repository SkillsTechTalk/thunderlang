// Pure, dependency-free core of intent-ai-v1 , NO Node built-ins (no crypto/fs/path),
// so it is safe to import in a browser bundle (e.g. Repo Mastery's Vite app).
// Published as the subpath `@skillstech/intentlang/core`.
//
// The rest of ai.mjs (hashing, markers, manifest) needs Node crypto; these helpers
// do not. Everything here is re-exported from ai.mjs so the main API is unchanged.

// ── State model ─────────────────────────────────────────────────────────────
export const IMPLEMENTATION_STATES = [
  'PENDING', 'GENERATED', 'VERIFIED', 'VERIFIED_AWAITING_APPROVAL',
  'APPROVED', 'MODIFIED', 'INVALID', 'REJECTED', 'ADOPTED',
];

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'];
export const HIGH_RISK = new Set(['high', 'critical']);

/** True if a state means the implementation must block a production build. */
export function blocksProduction(status, { approvalRequired = false } = {}) {
  if (['PENDING', 'GENERATED', 'MODIFIED', 'INVALID', 'REJECTED'].includes(status)) return true;
  if (status === 'VERIFIED_AWAITING_APPROVAL') return true;
  if (status === 'VERIFIED' && approvalRequired) return true;
  return false; // APPROVED and ADOPTED ship
}

// ── Comment prefixes for managed-region markers ─────────────────────────────
export const COMMENT_PREFIX = {
  typescript: '//', javascript: '//', tsx: '//', jsx: '//',
  csharp: '//', java: '//', go: '//', rust: '//',
  python: '#', ruby: '#', perl: '#', shell: '#',
};

// ── Integration events (versioned; no shared-DB coupling) ───────────────────
export const INTENT_AI_EVENTS = [
  'IntentAiImplementationDeclared', 'IntentAiGenerationRequested', 'IntentAiCandidateImported',
  'IntentAiImplementationGenerated', 'IntentAiVerificationStarted', 'IntentAiVerificationPassed',
  'IntentAiVerificationFailed', 'IntentAiApprovalRequested', 'IntentAiImplementationApproved',
  'IntentAiImplementationRejected', 'IntentAiImplementationModified', 'IntentAiProofInvalidated',
  'IntentAiImplementationAdopted', 'IntentAiMasteryGenerated', 'IntentAiOwnershipUpdated',
];

/** Build a versioned integration event (payload shape per contract intent-ai-v1). */
export function makeEvent(type, fields = {}) {
  return {
    schemaVersion: '1.0',
    type,
    projectId: fields.projectId ?? null,
    repoId: fields.repoId ?? null,
    implementationId: fields.implementationId ?? null,
    missionId: fields.missionId ?? null,
    contractHash: fields.contractHash ?? null,
    implementationHash: fields.implementationHash ?? null,
    correlationId: fields.correlationId ?? null,
    timestamp: fields.timestamp ?? null,
    toolVersion: fields.toolVersion ?? null,
    actorType: fields.actorType ?? null,
    actorId: fields.actorId ?? null,
    previousStatus: fields.previousStatus ?? null,
    newStatus: fields.newStatus ?? null,
  };
}

// ── Canonical proof checks keys (locked; RM + OT read these exact strings) ───
// Note: "contracts" is plural (matches the proof JSON), values are passed|failed|skipped.
export const PROOF_CHECK_KEYS = [
  'regionIntegrity', 'syntax', 'types', 'contracts', 'effects',
  'architecture', 'security', 'tests', 'determinism',
];
