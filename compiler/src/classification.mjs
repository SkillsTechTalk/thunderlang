// Classification + evidence model (intent-graph-v1, Section 5).
// Every statement carries a classification so AI-generated content never silently
// becomes observed fact. Pure (no Node deps): browser-safe.

export const CLASSIFICATIONS = [
  'observed',  // directly supported by a source
  'inferred',  // derived from evidence, not explicitly stated
  'proposed',  // a recommendation / possible solution
  'assumed',   // treated as true, but requires validation
  'unknown',   // required information, not yet resolved
  'decided',   // a human-approved choice
  'verified',  // supported by deterministic verification evidence
];

// Confidence bands.
export const CONFIDENCE = ['low', 'medium', 'high'];

/** Classifications that are NOT established fact (must be surfaced with uncertainty). */
export const UNSETTLED = new Set(['inferred', 'proposed', 'assumed', 'unknown']);

/** Normalize a raw classification word; returns null if unrecognized. */
export function classify(word) {
  const w = String(word || '').trim().toLowerCase();
  return CLASSIFICATIONS.includes(w) ? w : null;
}

/** True if a statement of this classification may be presented as established fact. */
export function isFactual(classification) {
  const c = classify(classification);
  return c === 'observed' || c === 'decided' || c === 'verified';
}

/** Phases an unresolved unknown/question can block (Section 7.4). */
export const BLOCKABLE_PHASES = [
  'product-approval', 'ux-approval', 'implementation', 'verification', 'release',
];
