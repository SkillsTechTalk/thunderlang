// Runtime enforcement (intent-guard-v1) , turn intent into a guard that runs IN the application
// and actually blocks a forbidden action, so intent is load-bearing, not advisory. Deterministic,
// no AI. Pure ESM (parse + the pure runtime), so it is browser-safe , the same guard runs in a
// Node service or a browser app.
//
// Two things are deterministically enforceable at runtime, and this compiles both:
//   1. Decisions ARE policy. `assertAllowed(name, inputs)` runs the declared decision and throws
//      if its result denies the action , the intent's rules become a hard gate in production.
//   2. Secrets must not leak. `redact(obj)` masks every field the intent declares secret (a
//      Secret/Password/Token type, a pii/sensitive data element, or a secret-looking name), so
//      wrapping a logger or a response with it enforces "never expose the token" at runtime.

import { parseIntent } from './parse.mjs';
import { evaluateDecision } from './runtime.mjs';

export const GUARD_SCHEMA = 'intent-guard-v1';

const SECRET_TYPES = new Set(['secret', 'password', 'passwd', 'jwt', 'token', 'apikey', 'api_key', 'privatekey', 'private_key', 'credential', 'cvv']);
const SENSITIVE_NAME = /^(.*[._-])?(pass(word|wd)?|secret|token|jwt|ssn|api[-_]?key|apikey|credential|cvv|private[-_]?key|card(number)?|cvc)([._-].*)?$/i;
// Decision results that mean "block" when the caller has not specified an explicit deny set.
const DENY_RE = /^(deny|denied|block|blocked|refuse|refused|reject|rejected|forbid|forbidden|escalate|escalated|review|needsreview|no)$/i;

/**
 * Compile an intent AST into a runtime guard.
 * @param {object} ast
 * @param {{ denyResults?: string[], mask?: string }} [opts] explicit deny-list + mask token
 */
export function buildGuard(ast, { denyResults, mask = '[redacted]' } = {}) {
  const secretFields = new Set();
  const consider = (f) => {
    if (!f || !f.name) return;
    if (SECRET_TYPES.has(String(f.type || '').toLowerCase()) || SENSITIVE_NAME.test(f.name)) secretFields.add(f.name);
  };
  for (const f of ast.inputs || []) consider(f);
  for (const f of ast.outputs || []) consider(f);
  for (const ev of ast.events || []) for (const f of ev.payload || []) consider(f);
  for (const d of ast.dataElements || []) {
    if (/pii|sensitive/i.test(d.classification || '')) {
      const leaf = String(d.path || '').split('.').pop();
      if (leaf) secretFields.add(leaf);
    }
  }

  const denySet = denyResults ? new Set(denyResults.map(String)) : null;
  const isDenied = (result) => (denySet ? denySet.has(String(result)) : DENY_RE.test(String(result ?? '').replace(/[^A-Za-z]/g, '')));
  const isSecretKey = (k) => secretFields.has(k) || SENSITIVE_NAME.test(k);
  const decisions = new Map((ast.decisions || []).map((d) => [d.name, d]));

  // Deep-mask any field the intent declares secret. Cycle-safe AND depth-bounded: this runs in
  // production (wrapping a logger), so it must never throw. Beyond MAX_DEPTH it stops descending
  // rather than overflowing the stack on a pathologically deep object.
  const MAX_DEPTH = 100;
  function redact(value, seen = new WeakSet(), depth = 0) {
    if (depth > MAX_DEPTH) return value;
    if (Array.isArray(value)) return value.map((v) => redact(v, seen, depth + 1));
    if (value && typeof value === 'object') {
      if (seen.has(value)) return value;
      seen.add(value);
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = isSecretKey(k) ? mask : redact(v, seen, depth + 1);
      return out;
    }
    return value;
  }

  function decide(name, inputs) {
    const d = decisions.get(name);
    if (!d) throw new Error(`intent guard: no decision "${name}"`);
    const r = evaluateDecision(d, inputs || {});
    return { ...r, allowed: !isDenied(r.result) };
  }

  function assertAllowed(name, inputs) {
    const r = decide(name, inputs);
    if (!r.allowed) {
      const e = new Error(`intent guard: decision "${name}" denied the action (result: ${r.result})`);
      e.code = 'INTENT_GUARD_DENIED';
      e.decision = name;
      e.result = r.result;
      throw e;
    }
    return r;
  }

  return {
    schema: GUARD_SCHEMA,
    secretFields: [...secretFields],
    decisions: [...decisions.keys()],
    neverRules: (ast.neverRules || []).map((n) => n.statement),
    redact,
    decide,
    assertAllowed,
  };
}

/** Compile intent SOURCE into a runtime guard. */
export function compileGuard(intentText, opts) {
  return buildGuard(parseIntent(String(intentText ?? '')), opts);
}

/** A JSON-able summary of what a guard would enforce (for `intent guard` / audits). */
export function guardSummary(ast) {
  const g = buildGuard(ast);
  return { schema: GUARD_SCHEMA, redactsFields: g.secretFields, enforcesDecisions: g.decisions, neverRules: g.neverRules };
}
