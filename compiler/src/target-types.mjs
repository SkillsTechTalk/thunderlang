// Browser-safe helpers shared by the target adapters and the in-browser translator.
// No Node imports here, so the website can bundle this file.

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

// A source literal for a value at an inferred type. JSON string escaping is valid in Java and C#
// string literals too, so we reuse JSON.stringify for the string case.
export const strLit = (s) => JSON.stringify(String(s));
export function litFor(type, v) {
  if (v == null) return type === 'string' ? '""' : type === 'bool' ? 'false' : '0';
  if (type === 'number') return String(v);
  if (type === 'bool') return v === true || v === 'true' ? 'true' : 'false';
  return strLit(v);
}

