// Honest results for generated and executed code. Browser-safe (no Node imports).
//
// Two rules live here:
//   1. A rule condition Thunder cannot translate is never replaced by `false`. Generation reports
//      IL-GEN-001 for that rule; scaffolds emit code that throws with the same message; executable
//      targets refuse to run that decision and report "not translated", never an answer.
//   2. Running a target never turns a failure into a value. Every case comes back as
//      { status: 'ok', value } or { status: 'error', kind, message }, so a real null answer is
//      distinguishable from a missing toolchain, a compile failure, a crash, or a timeout.

export const GEN_UNTRANSLATED = 'IL-GEN-001';

export const ERROR_KINDS = ['missing-toolchain', 'compile-failed', 'runtime-error', 'timeout', 'assertion-failed', 'not-translated', 'missing-input'];

export const okResult = (value) => ({ status: 'ok', value: value === undefined ? null : value });
export const errorResult = (kind, message) => ({ status: 'error', kind, message: String(message || kind) });

/** True for a per-case result object ({status:'ok', value} | {status:'error', kind, message}). */
export function isCaseResult(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  if (v.status === 'ok') return 'value' in v;
  return v.status === 'error' && ERROR_KINDS.includes(v.kind);
}

/** The one wording every surface uses for an untranslated condition. */
export function untranslatedMessage(when, target, reason) {
  return `Thunder could not translate the condition '${when}' for ${target}: ${reason}`;
}

/**
 * Translate one rule condition. Returns { ok: true, code } or { ok: false, diagnostic } where the
 * diagnostic is an IL-GEN-001 error naming the decision, rule, target, and reason.
 */
export function translateRule(translate, rule, opts, { target, decision }) {
  try {
    return { ok: true, code: translate(rule.when, opts) };
  } catch (err) {
    const reason = String((err && err.message) || err || 'unknown error');
    const message = untranslatedMessage(rule.when, target, reason);
    return {
      ok: false,
      message,
      diagnostic: {
        code: GEN_UNTRANSLATED, severity: 'error', message,
        target, decision: decision ?? null, rule: rule.name ?? null, condition: rule.when ?? null, reason,
      },
    };
  }
}

/**
 * Every rule a target cannot translate, as IL-GEN-001 diagnostics. `optsFor(decision)` supplies the
 * translator options for a decision (inputs, money names).
 */
export function untranslatedRules(ast, translate, target, optsFor) {
  const out = [];
  for (const d of ast.decisions || []) {
    const opts = optsFor(d);
    for (const r of d.rules || []) {
      const t = translateRule(translate, r, opts, { target, decision: d.name });
      if (!t.ok) out.push(t.diagnostic);
    }
  }
  return out;
}

/** Map decision name -> first untranslated message, for runners that must refuse those decisions. */
export function untranslatedByDecision(diagnostics) {
  const m = new Map();
  for (const d of diagnostics) if (!m.has(d.decision)) m.set(d.decision, d.message);
  return m;
}

/**
 * Assemble a target run. `cases` are the cases the program actually ran; `parsed` is the JSON object
 * the program printed ({ key: value }), or null when it printed nothing usable; `refused` holds the
 * not-translated case results. A key the program did not report is an error, never a null answer.
 */
export function finishRun({ cases, parsed, refused = {}, target }) {
  const results = { ...refused };
  for (const c of cases) {
    if (parsed && Object.prototype.hasOwnProperty.call(parsed, c.key)) results[c.key] = okResult(parsed[c.key]);
    else results[c.key] = errorResult('runtime-error', `${target} ran but reported no result for ${c.key}.`);
  }
  return { status: 'ok', results };
}

/** A whole-run failure (the toolchain is missing, the program did not compile, it crashed or timed out). */
export const runFailure = (kind, message) => ({ status: 'error', kind, message: String(message || kind) });

/**
 * Classify a failed child process. `phase` is 'compile', 'run', or 'build+run' (one command that both
 * compiles and runs, such as `go run`); for that phase the output decides which half failed.
 */
export function classifySpawn(r, { tool, phase = 'build+run', runtimePattern = null } = {}) {
  const code = r && r.error && r.error.code;
  if (code === 'ENOENT') return runFailure('missing-toolchain', `${tool} is not installed or not on PATH.`);
  if (code === 'ETIMEDOUT' || (r && r.signal === 'SIGTERM' && r.status == null)) return runFailure('timeout', `${tool} did not finish in time${r.signal ? ` (stopped by ${r.signal})` : ''}.`);
  const tail = String((r && (r.stderr || r.stdout)) || (r && r.error && r.error.message) || '').trim().split('\n').slice(-12).join('\n').slice(-1200);
  let kind = phase === 'compile' ? 'compile-failed' : 'runtime-error';
  if (phase === 'build+run') kind = runtimePattern && runtimePattern.test(tail) ? 'runtime-error' : 'compile-failed';
  const what = kind === 'compile-failed' ? 'could not compile the generated code' : 'crashed while running the generated code';
  return runFailure(kind, `${tool} ${what}${r && r.status != null ? ` (exit ${r.status})` : ''}${tail ? `: ${tail}` : '.'}`);
}

/** Plain values for a run's ok cases ({ key: value }), dropping errors. For display and legacy callers. */
export function runValues(run) {
  if (!run || run.status !== 'ok') return null;
  const out = {};
  for (const [k, v] of Object.entries(run.results)) if (v.status === 'ok') out[k] = v.value;
  return out;
}
