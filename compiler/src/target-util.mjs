// Shared helpers for the compiled target adapters (Python/C#/Java). The statically typed targets
// (C#, Java) need a declared type for every decision parameter, which ThunderLang source leaves
// implicit, so we infer each input's type from the test-case values that will actually be passed.
import { spawnSync } from 'node:child_process';

export const inputNames = (dec) => (dec.inputs || []).map((i) => String(i).split(':')[0].trim()).filter(Boolean);

export function coerceVal(v) {
  if (v == null || typeof v !== 'string') return v;
  const s = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  return v;
}

// Every case-call we will emit, in a stable order: { key, fn, given: {name: coercedValue} }.
export function buildCases(ast) {
  const cases = [];
  for (const t of ast.tests || []) {
    const dec = (ast.decisions || []).find((d) => d.name === t.name);
    if (!dec) continue;
    const names = inputNames(dec);
    for (const c of t.cases || []) {
      const given = {};
      for (const n of names) given[n] = coerceVal((c.given || {})[n]);
      cases.push({ key: `${t.name} / ${c.name || 'case'}`, fn: t.name, given });
    }
  }
  return cases;
}

// Infer one type per input for a decision, scanning every case that targets it. Numeric usage
// wins (a relational comparison must compile), then boolean, else string. Falls back to 'string'.
export function inferInputTypes(ast, dec) {
  const names = inputNames(dec);
  const types = {};
  for (const n of names) {
    let t = 'string';
    for (const test of (ast.tests || []).filter((x) => x.name === dec.name)) {
      for (const c of test.cases || []) {
        const raw = (c.given || {})[n];
        if (raw == null) continue;
        const cv = coerceVal(raw);
        if (typeof cv === 'number') { t = 'number'; break; }
        if (typeof cv === 'boolean' && t !== 'number') t = 'bool';
      }
      if (t === 'number') break;
    }
    types[n] = t;
  }
  return types;
}

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

// A source literal for a value at an inferred type. JSON string escaping is valid in Java and C#
// string literals too, so we reuse JSON.stringify for the string case.
export const strLit = (s) => JSON.stringify(String(s));
export function litFor(type, v) {
  if (v == null) return type === 'string' ? '""' : type === 'bool' ? 'false' : '0';
  if (type === 'number') return String(v);
  if (type === 'bool') return v === true || v === 'true' ? 'true' : 'false';
  return strLit(v);
}

export function toolOnPath(cmd, args = ['--version']) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000 });
    return r.status === 0;
  } catch {
    return false;
  }
}
