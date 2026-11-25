// Browser-safe helpers shared by the target adapters and the in-browser translator.
// No Node imports here, so the website can bundle this file.
import { moneyTypeMinorUnits } from './money.mjs';
import { translateRule } from './target-result.mjs';

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
      const given = {}; const raw = {};
      for (const n of names) { raw[n] = (c.given || {})[n]; given[n] = coerceVal(raw[n]); }
      cases.push({ key: `${t.name} / ${c.name || 'case'}`, fn: t.name, given, raw });
    }
  }
  return cases;
}

// A declared input type (`amount: number`, `Money`, `Flag`) as number, bool, string, or money; null
// when none. Money stays its own type so no target turns it into binary floating point.
const NUMBER_TYPES = /^(number|int|integer|long|short|float|double|decimal|Percentage|Count|Duration)$/i;
const BOOL_TYPES = /^(boolean|bool|Flag)$/i;
export function declaredInputType(raw) {
  const t = String(raw).includes(':') ? String(raw).slice(String(raw).indexOf(':') + 1).trim() : '';
  if (moneyTypeMinorUnits(t) != null) return 'money';
  const m = String(raw).match(/:\s*([A-Za-z][\w<>]*)\s*$/);
  if (!m) return null;
  if (NUMBER_TYPES.test(m[1])) return 'number';
  if (BOOL_TYPES.test(m[1])) return 'bool';
  return 'string';
}

// How each input is used in the decision's rules: compared with a number, compared with text, or on its own (a yes/no).
function usageTypes(dec, names) {
  const out = {};
  const NUM = /^-?\d+(\.\d+)?$/, STR = /^"[^"]*"$|^'[^']*'$/, CMP = /^(<|<=|>|>=|==|!=)$/;
  for (const r of dec.rules || []) {
    const toks = String(r.when || '').match(/"[^"]*"|'[^']*'|[A-Za-z_][\w.]*|-?\d+(?:\.\d+)?|<=|>=|==|!=|[<>()]/g) || [];
    toks.forEach((t, i) => {
      if (!names.includes(t)) return;
      const op = CMP.test(toks[i + 1] || '') ? toks[i + 1] : CMP.test(toks[i - 1] || '') ? toks[i - 1] : null;
      const other = op === toks[i + 1] ? toks[i + 2] : op ? toks[i - 2] : null;
      if (op && NUM.test(other || '')) out[t] = 'number';
      else if (op && /^[<>]=?$/.test(op) && names.includes(other || '')) out[t] = out[t] ?? 'number';
      else if (op && STR.test(other || '') && out[t] !== 'number') out[t] = 'string';
      else if (!op && out[t] == null) out[t] = 'bool';
    });
  }
  return out;
}

// Infer one type per input for a decision. A declared type wins; then the values the decision's examples give
// (numeric wins, so a relational comparison compiles, then boolean); then how the rules use the input.
// Falls back to 'string'.
export function inferInputTypes(ast, dec) {
  const names = inputNames(dec);
  const declared = Object.fromEntries((dec.inputs || []).map((raw) => [String(raw).split(':')[0].trim(), declaredInputType(raw)]));
  const usage = usageTypes(dec, names);
  const types = {};
  for (const n of names) {
    if (declared[n]) { types[n] = declared[n]; continue; }
    let t = null;
    for (const test of (ast.tests || []).filter((x) => x.name === dec.name)) {
      for (const c of test.cases || []) {
        const raw = (c.given || {})[n];
        if (raw == null) continue;
        const cv = coerceVal(raw);
        if (typeof cv === 'number') { t = 'number'; break; }
        if (typeof cv === 'boolean' && t !== 'number') t = 'bool';
        if (typeof cv === 'string' && t == null) t = 'string';
      }
      if (t === 'number') break;
    }
    types[n] = t ?? usage[n] ?? 'string';
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


/** Money inputs of a decision: { name: minorUnits } (Money = 2, Money(JPY) = 0, Money(KWD) = 3). */
export function moneyInputs(dec) {
  const out = {};
  for (const raw of dec.inputs || []) {
    const s = String(raw);
    if (!s.includes(':')) continue;
    const units = moneyTypeMinorUnits(s.slice(s.indexOf(':') + 1).trim());
    if (units != null) out[s.split(':')[0].trim()] = units;
  }
  return out;
}

/**
 * Everything a generator needs for one decision: input names and types, Money minor units, each
 * rule's translated condition (or the IL-GEN-001 message when it cannot be translated), and
 * `refused`: the first untranslated message, set when this decision must not be run.
 */
export function planDecision(ast, d, { translate, target }) {
  const names = inputNames(d);
  const types = inferInputTypes(ast, d);
  const money = moneyInputs(d);
  const opts = { inputs: names, money };
  const rules = []; const diagnostics = []; let refused = null;
  for (const r of d.rules || []) {
    const t = translateRule(translate, r, opts, { target, decision: d.name });
    if (t.ok) rules.push({ rule: r, code: t.code });
    else { rules.push({ rule: r, code: null, message: t.message }); diagnostics.push(t.diagnostic); refused = refused ?? t.message; }
  }
  return { decision: d, names, types, money, rules, diagnostics, refused };
}
