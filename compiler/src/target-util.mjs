// Shared helpers for the compiled target adapters (Python/C#/Java/...). The statically typed targets
// (C#, Java) need a declared type for every decision parameter, which ThunderLang source leaves
// implicit, so we infer each input's type from the test-case values that will actually be passed.
import { spawnSync } from 'node:child_process';
import { buildCases, planDecision } from './target-types.mjs';
import { errorResult } from './target-result.mjs';
import { parseMoney, moneyLiteral } from './money.mjs';
export { inputNames, coerceVal, buildCases, inferInputTypes, strLit, litFor, planDecision, moneyInputs } from './target-types.mjs';
export { okResult, errorResult, finishRun, runFailure, classifySpawn, runValues, isCaseResult, ERROR_KINDS, GEN_UNTRANSLATED } from './target-result.mjs';

// Pick the last line of stdout that parses as a JSON object , build/tool chatter may precede it.
export function parseLastJsonObject(stdout) {
  if (!stdout) return null;
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].startsWith('{')) continue;
    try { return JSON.parse(lines[i]); } catch { /* keep scanning upward */ }
  }
  return null;
}

// Cached toolchain-availability smoke tests. Each actually exercises the exact invocation the
// adapter uses (single-file `java`, or scaffold + `dotnet run`) so a target is only reported
// runnable when it can genuinely compile and run, not merely because a binary is on PATH.
const _cache = {};
export function cachedSmoke(key, fn) {
  if (key in _cache) return _cache[key];
  let ok = false;
  try { ok = !!fn(); } catch { ok = false; }
  _cache[key] = ok;
  return ok;
}

export function toolOnPath(cmd, args = ['--version']) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

// ── Honest runs ──────────────────────────────────────────────────────────────
// Plan a live run: translate every decision for the target, refuse the cases of any decision with an
// untranslated rule (IL-GEN-001, kind 'not-translated'), and render each Money argument with the
// target's exact literal ('js-runtime' gives a real bigint for the in-process runner).
// Returns { plans: Map(name -> plan), cases, refused }.
export function prepareRun(ast, { translate, target, dialect }) {
  const plans = new Map((ast.decisions || []).map((d) => [d.name, planDecision(ast, d, { translate, target })]));
  const refused = {};
  const cases = [];
  for (const c of buildCases(ast)) {
    const p = plans.get(c.fn);
    if (!p) continue;
    if (p.refused) { refused[c.key] = errorResult('not-translated', p.refused); continue; }
    // A case that gives no value for an input is never run with a made-up one ("", false, 0, $0): a typed
    // target would answer for a value nobody wrote, and the reference engine reads "missing" differently.
    const missing = p.names.filter((n) => c.raw[n] === undefined || c.raw[n] === null);
    if (missing.length) {
      refused[c.key] = errorResult('missing-input', `${c.key} gives no value for ${missing.join(', ')}, so it cannot run in ${target} without making one up. Add ${missing.length === 1 ? 'it' : 'them'} to the case's "given".`);
      continue;
    }
    try {
      const moneyArgs = {};
      for (const [n, units] of Object.entries(p.money)) {
        const raw = c.raw[n];
        moneyArgs[n] = dialect === 'js-runtime' ? parseMoney(raw, { minorUnits: units }) : moneyLiteral(dialect, raw, units);
      }
      cases.push({ ...c, moneyArgs });
    } catch (e) {
      refused[c.key] = errorResult('not-translated', `Thunder could not pass the example value for ${c.key} to ${target} exactly: ${e.message}`);
    }
  }
  return { plans, cases, refused };
}

// The source text of an argument: the exact Money literal for Money inputs, else the typed literal.
export const argLit = (c, plan, n, lit) => (c.moneyArgs && c.moneyArgs[n] != null ? c.moneyArgs[n] : lit(plan.types[n], c.given[n]));

// Plans for display emitters that are called without a prepared run.
export function plansFor(ast, translate, target) {
  return new Map((ast.decisions || []).map((d) => [d.name, planDecision(ast, d, { translate, target })]));
}

// Run a child process and return { ok: true, stdout } or { ok: false, failure } (a classified run failure).
export function spawnStep(cmd, args, opts, classify) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status === 0 && !r.error) return { ok: true, stdout: r.stdout || '' };
  return { ok: false, failure: classify(r) };
}
