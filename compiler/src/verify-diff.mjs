// Verify a code change against its intent (intent-verify-diff-v1) , the keystone of the AI loop.
// A human (or an agent) states intent; an AI proposes a code change; THIS proves, deterministically
// and with no AI, which of the intent's guarantees and never-rules the change upholds or breaks,
// and returns a gate verdict (PASS / BLOCK). It is honest: it does not claim to prove correctness
// (that needs tests + humans), but it catches the mechanical violations AI diffs actually ship ,
// a secret written to a log, a declared input dropped from a signature, a guarantee whose evidence
// the change removed.
//
//   verifyDiff(intentText, { before?, after, language }) -> { verdict, ok, findings, blocking }
//
// The two signals that make this a DIFF check, not just a snapshot:
//   1. Regressions , a claim that held on `before` but is broken on `after` (the change's fault).
//   2. Guardrail hits , lines the change ADDED that match a never-rule's sensitive term reaching a
//      sink (log/print/response/...). This is the active check that catches AI-introduced leaks.

import { parseIntent } from './parse.mjs';
import { checkDrift } from './drift.mjs';

export const VERIFY_DIFF_SCHEMA = 'intent-verify-diff-v1';

// A value reaching an output sink , where a leak would happen.
const SINK_RE = /\b(log|logger|logging|console|print|println|printf|echo|write|send|res|response|reply|render|fmt\.Print\w*|System\.out|puts|p\b)\b|\bconsole\.\w+|\bres\.\w+|\bresponse\.\w+/i;
// Sensitive nouns a never-rule might protect. If the rule names one and an added line sends it to
// a sink, that is a probable violation.
const SENSITIVE_TERMS = ['token', 'secret', 'password', 'passwd', 'credential', 'ssn', 'pii', 'card', 'cvv', 'apikey', 'api_key', 'privatekey', 'private_key', 'session', 'jwt', 'email', 'address', 'phone', 'dob', 'birthdate'];

function sensitiveTermsOf(statement) {
  const s = String(statement).toLowerCase();
  return SENSITIVE_TERMS.filter((t) => new RegExp(`\\b${t.replace('_', '[_ ]?')}`, 'i').test(s));
}

// Split a code line into identifier words, breaking camelCase and snake_case, so a term like
// "token" matches `paymentToken`, `payment_token`, and `paymenttoken` , the common ways an AI
// diff names a secret variable.
function identifierWords(text) {
  return String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}
const lineHitsTerm = (text, terms) => {
  const words = identifierWords(text);
  return terms.some((term) => words.some((w) => w === term || w.endsWith(term)));
};

// Lines present in `after` but not in `before` (exact-text set diff , enough to spot an added
// sink line). When there is no `before`, every non-trivial line is "added" (verifying fresh code).
function addedLines(before, after) {
  const afterLines = String(after ?? '').split(/\r?\n/);
  if (before == null) return afterLines.map((text, i) => ({ line: i + 1, text })).filter((l) => l.text.trim());
  const beforeSet = new Set(String(before).split(/\r?\n/).map((l) => l.trim()));
  return afterLines.map((text, i) => ({ line: i + 1, text })).filter((l) => l.text.trim() && !beforeSet.has(l.text.trim()));
}

/**
 * Verify a proposed code change against its intent. Returns a gate verdict + findings.
 * @param {string} intentText the .intent source (the contract)
 * @param {{ before?: string|null, after: string, language?: string }} change
 */
export function verifyDiff(intentText, { before = null, after, language = 'typescript' } = {}) {
  const ast = parseIntent(intentText);
  const findings = [];

  // 1. Contract drift on the AFTER code (guarantee/never/input support vs the intent).
  const driftAfter = checkDrift(intentText, String(after ?? ''), { language });
  // 2. What held BEFORE, so we can tell a pre-existing gap from a regression the change introduced.
  const beforeKeys = before != null
    ? new Set(checkDrift(intentText, before, { language }).findings.map((f) => `${f.code}|${f.message}`))
    : null;
  for (const f of driftAfter.findings) {
    if (f.code === 'INTENT_DRIFT_NOT_APPROVED' || f.code === 'INTENT_DRIFT_NEW_BEHAVIOR') { findings.push({ ...f, regression: false }); continue; }
    const regression = beforeKeys ? !beforeKeys.has(`${f.code}|${f.message}`) : false;
    findings.push({ ...f, regression });
  }

  // 3. Guardrail scan: added lines that push a never-rule's sensitive term into a sink.
  const added = addedLines(before, after);
  for (const n of ast.neverRules || []) {
    const terms = sensitiveTermsOf(n.statement);
    if (!terms.length) continue;
    const wantsSink = /\b(log|logs|logged|logging|expose|exposed|leak|print|return|respond|response|send|output)\b/i.test(n.statement);
    for (const { line, text } of added) {
      const hitsTerm = lineHitsTerm(text, terms);
      if (hitsTerm && (SINK_RE.test(text) || wantsSink && /=|\(|:/.test(text))) {
        findings.push({
          level: 'error', code: 'INTENT_VERIFY_NEVER_VIOLATED', regression: true, line,
          message: `Added code may violate never-rule "${n.statement}": ${text.trim().slice(0, 90)}`,
        });
      }
    }
  }

  // Verdict: block on any guardrail violation, or any regression of a contract claim.
  const blocking = findings.filter((f) => f.code === 'INTENT_VERIFY_NEVER_VIOLATED' || (f.regression && f.level === 'warning'));
  return {
    schema: VERIFY_DIFF_SCHEMA,
    ok: blocking.length === 0,
    verdict: blocking.length ? 'BLOCK' : 'PASS',
    findings,
    blocking: blocking.length,
    summary: { verdict: blocking.length ? 'BLOCK' : 'PASS', findings: findings.length, blocking: blocking.length, regressions: findings.filter((f) => f.regression).length },
  };
}
