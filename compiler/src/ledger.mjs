// Intent Ledger (intent-ledger-v1) , the append-only, tamper-evident record of MEANING and history
// for a project: provenance, decisions, assumptions, approvals, rejections, corrections, candidate
// intent, confidence changes, evidence, findings, risk-acceptance, implementation hashes,
// verification results, lesson versions, ownership, and change. It answers the questions a project
// loses over time: why was this built, who approved it, what assumptions were made, which code
// implements it, which tests prove it, what changed, which lessons went stale, which risks were
// accepted, which inferred intent was corrected.
//
// Every entry is hash-chained (each hashes over the previous), so the ledger is tamper-evident ,
// you cannot quietly rewrite history. Deterministic; the caller supplies timestamps so the ledger
// is reproducible and testable.

import { sha256 } from './emit.mjs';

export const LEDGER_SCHEMA = 'intent-ledger-v1';

export const ENTRY_TYPES = [
  'intent-version', 'decision', 'assumption', 'approval', 'rejection', 'correction',
  'candidate-intent', 'confidence-change', 'evidence', 'finding', 'risk-acceptance',
  'implementation-hash', 'verification-result', 'lesson-version', 'ownership', 'change',
];

export function emptyLedger() {
  return { schema: LEDGER_SCHEMA, entries: [], head: null };
}

// Canonical, order-stable payload so the hash is reproducible.
function payloadOf(seq, entry, prev) {
  return {
    seq,
    type: entry.type,
    subject: entry.subject ?? null,
    actor: entry.actor ?? null,
    at: entry.at ?? null,
    note: entry.note ?? null,
    data: entry.data ?? {},
    prev,
  };
}

/** Append an entry to the ledger, hash-chained over the previous head. Returns a NEW ledger. */
export function record(ledger, entry) {
  if (!entry || !ENTRY_TYPES.includes(entry.type)) throw new Error(`intent ledger: unknown entry type "${entry?.type}"`);
  const base = ledger && Array.isArray(ledger.entries) ? ledger : emptyLedger();
  const payload = payloadOf(base.entries.length, entry, base.head);
  const hash = sha256(JSON.stringify(payload));
  const rec = { ...payload, hash };
  return { ...base, entries: [...base.entries, rec], head: hash };
}

/** Record several entries in order. */
export function recordAll(ledger, entries) {
  return (entries || []).reduce((l, e) => record(l, e), ledger || emptyLedger());
}

/** Verify the hash chain , tamper-evidence. Returns { valid, brokenAt }. */
export function verifyLedger(ledger) {
  let prev = null;
  const entries = ledger?.entries || [];
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    const expected = sha256(JSON.stringify(payloadOf(i, e, prev)));
    if (e.seq !== i) return { valid: false, brokenAt: i, reason: `entry ${i} has seq ${e.seq}` };
    if (e.prev !== prev) return { valid: false, brokenAt: i, reason: `entry ${i} prev-link does not match` };
    if (e.hash !== expected) return { valid: false, brokenAt: i, reason: `entry ${i} hash does not match its content (tampered)` };
    prev = e.hash;
  }
  if (entries.length && ledger.head !== prev) return { valid: false, brokenAt: entries.length - 1, reason: 'head does not match the last entry' };
  return { valid: true, brokenAt: null };
}

// ── Typed convenience recorders , the common facts a project preserves ────────
const rec = (type) => (ledger, subject, data = {}, meta = {}) => record(ledger, { type, subject, ...meta, data });
export const recordIntentVersion = rec('intent-version');   // data: { hash, version }
export const recordDecision = rec('decision');              // note: the rationale ("why")
export const recordAssumption = rec('assumption');
export const recordApproval = rec('approval');              // actor: approver
export const recordRejection = rec('rejection');
export const recordCorrection = rec('correction');          // data: { from, to } , inferred intent a human fixed
export const recordRiskAcceptance = rec('risk-acceptance'); // data: { finding, reason, expires }
export const recordVerification = rec('verification-result'); // data: { passed, evidence }
export const recordFinding = rec('finding');
export const recordLessonVersion = rec('lesson-version');   // data: { version, stale }

// ── Queries , the Ledger answers ─────────────────────────────────────────────
const of = (ledger) => ledger?.entries || [];
export const history = (ledger, subject) => of(ledger).filter((e) => !subject || e.subject === subject);
export const whyBuilt = (ledger, subject) => history(ledger, subject).filter((e) => e.type === 'decision');
export const approvalsFor = (ledger, subject) => history(ledger, subject).filter((e) => e.type === 'approval' || e.type === 'rejection');
export const assumptionsFor = (ledger, subject) => history(ledger, subject).filter((e) => e.type === 'assumption');
export const correctionsFor = (ledger, subject) => history(ledger, subject).filter((e) => e.type === 'correction');
export const acceptedRisks = (ledger) => of(ledger).filter((e) => e.type === 'risk-acceptance');
export const staleLessons = (ledger) => of(ledger).filter((e) => e.type === 'lesson-version' && e.data?.stale);
export const verificationsFor = (ledger, subject) => history(ledger, subject).filter((e) => e.type === 'verification-result');

/** A structured answer to the nine Ledger questions for one subject (mission). */
export function explain(ledger, subject) {
  return {
    schema: LEDGER_SCHEMA,
    subject,
    why: whyBuilt(ledger, subject).map((e) => e.note || e.data?.reason).filter(Boolean),
    approvedBy: approvalsFor(ledger, subject).filter((e) => e.type === 'approval').map((e) => e.actor).filter(Boolean),
    assumptions: assumptionsFor(ledger, subject).map((e) => e.note || e.data).filter(Boolean),
    verifications: verificationsFor(ledger, subject).map((e) => e.data),
    corrections: correctionsFor(ledger, subject).map((e) => e.data),
    acceptedRisks: acceptedRisks(ledger).filter((e) => !subject || e.subject === subject).map((e) => e.data),
    changeCount: history(ledger, subject).length,
  };
}
