// Canonical proof envelope schema (intent-proof-v1) , the shape of a `.intent-proof.json`
// document. IL owns this: it is what the compiler emits (`buildProof`), what `thunder verify`
// re-derives against, and the "shared envelope" siblings sign (STW) and re-verify (RM/OT)
// rather than each re-describing the proof shape. Pure ESM, ZERO Node deps , browser-safe so
// a signing service or a cert renderer can validate an envelope without a Node build.
//
// This DESCRIBES the existing emitted proof (additive, non-breaking); it does not change the
// bytes `buildProof` produces. `schemaVersion` is the content revision carried in the
// document; `PROOF_SCHEMA` is the canonical schema name this JSON Schema is published under.

export const PROOF_SCHEMA = 'intent-proof-v1';

// A claim (guarantee / never-rule) may be in exactly one of these states.
export const CLAIM_STATUSES = ['planned', 'needs_verification', 'verified', 'failed'];
// The proof as a whole is draft until a human approves (or rejects) it.
export const PROOF_STATUSES = ['draft', 'approved', 'rejected'];

/** The canonical JSON Schema (draft-07) for an intent-proof document. */
export function intentProofJsonSchema() {
  const claim = {
    type: 'object',
    required: ['text', 'status'],
    properties: {
      id: { type: ['string', 'null'] },
      text: { type: 'string' },
      status: { enum: CLAIM_STATUSES },
      evidence: { type: 'array', items: { type: 'string' } },
    },
  };
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `https://thunderlang.dev/schema/${PROOF_SCHEMA}.json`,
    title: 'Intent Proof',
    type: 'object',
    required: [
      'schemaVersion', 'missionName', 'sourceFile', 'sourceHash',
      'guarantees', 'neverRules', 'verification', 'ai', 'humanApproval', 'proofStatus',
    ],
    properties: {
      schemaVersion: { type: 'string' },
      sourceProduct: { type: 'string' },
      missionName: { type: ['string', 'null'] },
      sourceFile: { type: 'string' },
      // sha256:<hex> , the source fingerprint `thunder verify` re-checks for drift/tampering.
      sourceHash: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
      compilerVersion: { type: 'string' },
      generatedAt: { type: ['string', 'null'] },
      targetsRequested: { type: 'array', items: { type: 'string' } },
      targetsGenerated: { type: 'array', items: { type: 'string' } },
      guarantees: { type: 'array', items: claim },
      neverRules: { type: 'array', items: claim },
      errors: { type: 'array' },
      examples: { type: 'array' },
      verification: {
        type: 'object',
        required: ['syntaxPassed', 'semanticPassed'],
        properties: {
          syntaxPassed: { type: 'boolean' },
          semanticPassed: { type: 'boolean' },
          targetsGenerated: { type: 'boolean' },
        },
      },
      diagnostics: { type: 'array' },
      ai: {
        type: 'object',
        required: ['used'],
        properties: { used: { type: 'boolean' } },
      },
      humanApproval: {
        type: 'object',
        required: ['required', 'approved'],
        properties: { required: { type: 'boolean' }, approved: { type: 'boolean' } },
      },
      proofStatus: { enum: PROOF_STATUSES },
    },
  };
}

// Deterministic, dependency-free structural validation , the same style the rest of the
// compiler uses (no JSON-Schema runtime). Returns { valid, errors: [{ path, message }] }.
// A signer/verifier calls this to reject a malformed envelope before trusting its claims.
export function validateProof(proof) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });
  const isStr = (v) => typeof v === 'string';
  const isBool = (v) => typeof v === 'boolean';

  if (proof === null || typeof proof !== 'object' || Array.isArray(proof)) {
    return { valid: false, errors: [{ path: '', message: 'proof must be an object' }] };
  }

  for (const k of ['schemaVersion', 'sourceFile', 'sourceHash']) {
    if (!isStr(proof[k])) err(k, `${k} must be a string`);
  }
  if (isStr(proof.sourceHash) && !/^sha256:[0-9a-f]{64}$/.test(proof.sourceHash)) {
    err('sourceHash', 'sourceHash must be "sha256:<64 hex chars>"');
  }

  for (const key of ['guarantees', 'neverRules']) {
    const list = proof[key];
    if (!Array.isArray(list)) { err(key, `${key} must be an array`); continue; }
    list.forEach((c, i) => {
      if (c === null || typeof c !== 'object') { err(`${key}[${i}]`, 'claim must be an object'); return; }
      if (!isStr(c.text)) err(`${key}[${i}].text`, 'claim text must be a string');
      if (!CLAIM_STATUSES.includes(c.status)) err(`${key}[${i}].status`, `status must be one of ${CLAIM_STATUSES.join(', ')}`);
      if (c.evidence !== undefined && !Array.isArray(c.evidence)) err(`${key}[${i}].evidence`, 'evidence must be an array');
    });
  }

  const v = proof.verification;
  if (v === null || typeof v !== 'object') err('verification', 'verification must be an object');
  else {
    if (!isBool(v.syntaxPassed)) err('verification.syntaxPassed', 'must be a boolean');
    if (!isBool(v.semanticPassed)) err('verification.semanticPassed', 'must be a boolean');
  }

  if (proof.ai === null || typeof proof.ai !== 'object' || !isBool(proof.ai.used)) err('ai.used', 'ai.used must be a boolean');

  const h = proof.humanApproval;
  if (h === null || typeof h !== 'object') err('humanApproval', 'humanApproval must be an object');
  else {
    if (!isBool(h.required)) err('humanApproval.required', 'must be a boolean');
    if (!isBool(h.approved)) err('humanApproval.approved', 'must be a boolean');
  }

  if (!PROOF_STATUSES.includes(proof.proofStatus)) err('proofStatus', `proofStatus must be one of ${PROOF_STATUSES.join(', ')}`);

  return { valid: errors.length === 0, errors };
}
