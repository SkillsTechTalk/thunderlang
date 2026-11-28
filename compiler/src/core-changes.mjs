// Behaviour changes in Thunder™ programs: what a change to Thunder Core code does, rule by rule, and what to look at
// again because of it (roadmap 3.4 + D.5). The Core side of `thunder review`, and the library calls
// coreChanges(oldFiles, newFiles) and affectedBy(files, change).
//
//   before ─┐  1. rules, each with a stable name   ┌─ "decide refund: now a review Refund instead of an approved
//           ├─ 2. paired by name, then compared ───┤   Refund when amount is from $50.00 to $99.99 (tried)"
//   after ──┘  3. both versions run on inputs      └─ look again at: POST /orders/{number}/refunds, test "…"
//
// 1. A rule's name comes from what it is, never from its line: `function:decide refund`, `endpoint:POST /orders`,
//    `keep:review limit`, `never:Product: Never allow a negative stock`, `record:Product`, `store:products`,
//    `test:the refund rule`. Moving, reformatting, or commenting code keeps the name; a function renamed with the
//    same steps is paired as a rename.
// 2. What each rule uses (functions it calls, kept values, data types and their Never rules, stored lists,
//    endpoints a test calls) is read from the checked program, so a change reaches everything that depends on it.
// 3. A function whose steps changed, or that uses something that changed, is run before and after on the same
//    inputs, made from the numbers and text in both versions (each number with one step either side) and the usual
//    edges. Answers that differ are grouped ("approved -> review") and, where one input decides it, given as the
//    range of values tried. Tested evidence, never a proof: it covers the inputs it tried. A function that reads
//    saved data or calls another service is not run, and says so. Each call has a step limit.
//
// Pure and browser-safe: takes [{ path, source }] for each side; the caller reads files and git.

import { compileCore } from './core/index.mjs';
import { isCoreProgram } from './core/kind.mjs';
import { engineForCalls, OutOfSteps } from './core/engine-core.mjs';
import { inputValue, dataJson } from './core/store-format.mjs';
import { RecordVal, Dec, asPyErr, explain, show } from './core/engine-values.mjs';
import { byText } from './text-order.mjs';

export const CORE_CHANGES_SCHEMA = 'thunder-core-changes-v1';
export const AFFECTED_SCHEMA = 'thunder-affected-v1';

const MAX_RUNS = 3000; // inputs per function and side (a call is fast: thousands take well under a second)
const MAX_SHOWN_GROUPS = 4;
// Time limits, so a review stays quick however many functions changed: each function's runs, and the whole
// comparison. A comparison that stops early says how many inputs it tried.
const MS_PER_FUNCTION = 2000;
const MS_IN_ALL = 20000;

export { isCoreProgram };
const isTestPath = (p) => /(^|\/)tests\//.test(p);
const projectRoot = (p, dir) => { const m = new RegExp(`(^|/)${dir}/`).exec(p); return m ? p.slice(0, m.index + m[1].length) : null; };
const moduleName = (p) => p.replace(/^.*\//, '').replace(/\.thunder$/i, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'program';

// ── 1. A side: its files compiled, and its rules with what each uses ────────────────────────────────────────────

function side(files) {
  const core = (files ?? []).filter((f) => f && isCoreProgram(f.path, f.source));
  const results = [];
  const srcs = core.filter((f) => !isTestPath(f.path));
  for (const f of srcs) results.push(Object.assign(compileCore(f.source, { file: f.path }), { path: f.path, source: f.source, kind: 'src' }));
  for (const f of core.filter((x) => isTestPath(x.path))) {
    // A test sees the src/ files of its own project (the folder above tests/), as in thunder test.
    const root = projectRoot(f.path, 'tests') ?? '';
    const seen = results.filter((r) => r.kind === 'src' && r.ok && r.path.startsWith(root));
    results.push(Object.assign(compileCore(f.source, { file: f.path, imported: seen, srcModules: seen.map((r) => moduleName(r.path)) }), { path: f.path, source: f.source, kind: 'test' }));
  }
  const units = new Map();
  const records = new Map(); // a data type's name (lowercase) -> its unit id
  for (const r of results) for (const u of unitsOf(r)) {
    let id = u.id;
    if (units.has(id)) id = `${u.id} (${r.path})`; // the same name in two files: told apart by the file
    units.set(id, { ...u, id });
    if (u.kind === 'record') records.set(u.node.name, id);
  }
  for (const u of units.values()) u.uses = usesOf(u, units, records);
  // Who uses each rule, for impact.
  const usedBy = new Map();
  for (const u of units.values()) for (const d of u.uses) { if (!usedBy.has(d)) usedBy.set(d, new Set()); usedBy.get(d).add(u.id); }
  return { files: core, results, units, usedBy, records, engine: null };
}

const KIND_WORD = { function: 'function', endpoint: 'endpoint', keep: 'kept value', record: 'data type', never: 'rule', store: 'stored list', test: 'test', main: 'main program' };

/** The rules of one compiled file: each top-level block, with its own lines (comments and blank lines left out). */
function unitsOf(r) {
  const body = r.program?.body ?? [];
  if (!body.length) return [];
  const lines = r.source.split(/\r?\n/);
  const starts = body.map((s) => s.line).filter((n) => n != null);
  const endOf = (s) => { const next = starts.filter((n) => n > s.line); return next.length ? Math.min(...next) - 1 : lines.length; };
  const clean = (from, to, skip = new Set()) => {
    const out = [];
    for (let n = from; n <= to; n++) { if (skip.has(n)) continue; const t = (lines[n - 1] ?? '').replace(/\s+$/, ''); if (t.trim() && !t.trim().startsWith('#')) out.push(t); }
    return out;
  };
  const out = [];
  const main = [];
  for (const s of body) {
    const base = { file: r.path, line: s.line, node: s, result: r };
    if (s.k === 'func' && s.endpoint) out.push({ ...base, id: `endpoint:${s.endpoint.method} ${s.endpoint.path}`, kind: 'endpoint', subject: `${s.endpoint.method} ${s.endpoint.path}`, text: clean(s.line, endOf(s)) });
    else if (s.k === 'func') out.push({ ...base, id: `function:${s.text}`, kind: 'function', subject: s.text, text: clean(s.line, endOf(s)) });
    else if (s.k === 'keep') out.push({ ...base, id: `keep:${s.text}`, kind: 'keep', subject: s.text, text: clean(s.line, endOf(s)) });
    else if (s.k === 'store') out.push({ ...base, id: `store:${s.text}`, kind: 'store', subject: `stored list ${s.text}`, text: clean(s.line, endOf(s)) });
    else if (s.k === 'test') out.push({ ...base, id: `test:${s.title}`, kind: 'test', subject: `test "${s.title}"`, text: clean(s.line, endOf(s)) });
    else if (s.k === 'record') {
      const nevers = (s.rules ?? []).filter((x) => x.k === 'never');
      out.push({ ...base, id: `record:${s.text}`, kind: 'record', subject: s.text, text: clean(s.line, endOf(s), new Set(nevers.map((x) => x.line))) });
      for (const n of nevers) out.push({ ...base, line: n.line, node: n, record: s, id: `never:${s.text}: ${n.text}`, kind: 'never', subject: `${s.text}: ${n.text}`, text: [n.text] });
    } else main.push(s);
  }
  if (main.length) {
    const text = main.flatMap((s) => clean(s.line, endOf(s)));
    out.push({ file: r.path, line: main[0].line, node: { k: 'main', body: main }, result: r, id: `main:${r.path}`, kind: 'main', subject: `the main program of ${r.path}`, text });
  }
  return out;
}

const SKIP_KEYS = new Set(['type', 'ref', 'rulesToCheck', 'records', 'fieldMap', 'record', 'mod', 'f']);

/** What a rule uses, as rule ids: functions it calls, kept values, stored lists, data types and their rules. */
function usesOf(u, units, records) {
  const uses = new Set();
  const addRecord = (name) => {
    const id = records.get(name);
    if (!id) return;
    uses.add(id);
    const rec = units.get(id);
    for (const n of rec.node.rules ?? []) if (n.k === 'never') uses.add(`never:${rec.node.text}: ${n.text}`);
  };
  const recordType = (t) => { while (t && (t.k === 'optional' || t.k === 'list')) t = t.of; return t?.k === 'record' ? t.name : null; };
  const seen = new Set();
  const walk = (x) => {
    if (!x || typeof x !== 'object' || seen.has(x)) return;
    seen.add(x);
    if (Array.isArray(x)) { for (const y of x) walk(y); return; }
    const ref = x.ref;
    if (ref?.kind === 'const') uses.add(`keep:${ref.text ?? x.text}`);
    else if (ref?.kind === 'store') uses.add(`store:${ref.text ?? x.text}`);
    if (x.k === 'call' && x.method) { const e = endpointFor(units, x.method, x.path); if (e) uses.add(e); } // a test's "calling POST /orders/1"
    else if (x.k === 'call' && x.text) uses.add(`function:${x.text}`);
    else if (x.k === 'new' && x.record) addRecord(x.record);
    else if (x.k === 'httpCall') uses.add('http');
    else if (x.k === 'callEndpoint') { const e = endpointFor(units, x.method, x.path); if (e) uses.add(e); }
    else if (x.k === 'field' && x.obj?.type) { const r = recordType(x.obj.type); if (r) addRecord(r); }
    if (Array.isArray(x.params)) for (const p of x.params) { const r = recordType(p.type); if (r) addRecord(r); }
    for (const [k, v] of Object.entries(x)) if (!SKIP_KEYS.has(k)) walk(v);
  };
  walk(u.kind === 'never' ? u.node.cond : u.node);
  uses.delete(u.id);
  // Only rules this side has (and "http", a call to another service), so a built-in name is not a dependency.
  return new Set([...uses].filter((d) => d === 'http' || units.has(d)));
}

/** The endpoint answering METHOD /path (a test's "calling POST /orders/1/refunds" -> POST /orders/{number}/refunds). */
function endpointFor(units, method, path) {
  const got = String(path).split('/').filter(Boolean);
  for (const u of units.values()) {
    if (u.kind !== 'endpoint' || u.node.endpoint.method !== method) continue;
    const parts = u.node.endpoint.path.split('/').filter(Boolean);
    if (parts.length === got.length && parts.every((p, i) => /^\{.*\}$/.test(p) || p === got[i])) return u.id;
  }
  return null;
}

/** Everything a rule uses, all the way down. */
function reach(s, id) {
  const out = new Set();
  const todo = [id];
  while (todo.length) { const x = todo.pop(); for (const d of s.units.get(x)?.uses ?? []) if (!out.has(d)) { out.add(d); todo.push(d); } }
  return out;
}

/** Everything that uses one of `ids`, all the way up, each with the chain that reaches it: Map(id -> [via ids]). */
function dependents(s, ids) {
  const via = new Map();
  const todo = [...ids].map((id) => [id, [id]]);
  while (todo.length) {
    const [x, chain] = todo.shift();
    for (const u of s.usedBy.get(x) ?? []) if (!via.has(u) && !ids.has(u)) { via.set(u, chain); todo.push([u, [...chain, u]]); }
  }
  return via;
}

// ── 2. Pairing and comparing ───────────────────────────────────────────────────────────────────────────────────

const sameText = (a, b) => a.length === b.length && a.every((l, i) => l.trim() === b[i].trim());

/** Pairs by name, then a function or endpoint renamed with the same steps. Gives [[old, new]] (either may be null). */
function pair(A, B) {
  const pairs = [];
  const usedB = new Set();
  for (const [id, a] of A.units) { const b = B.units.get(id); if (b) { pairs.push([a, b]); usedB.add(id); } }
  const leftA = [...A.units.values()].filter((a) => !B.units.has(a.id));
  const leftB = [...B.units.values()].filter((b) => !usedB.has(b.id));
  for (const a of leftA) {
    const b = leftB.find((x) => !usedB.has(x.id) && x.kind === a.kind && (a.kind === 'function' || a.kind === 'endpoint' || a.kind === 'test') && sameText(a.text.slice(1), x.text.slice(1)) && a.text.length > 1);
    if (b) { usedB.add(b.id); pairs.push([a, b]); } else pairs.push([a, null]);
  }
  for (const b of leftB) if (!usedB.has(b.id)) pairs.push([null, b]);
  return pairs;
}

// ── 3. Running both versions ───────────────────────────────────────────────────────────────────────────────────

function engineOf(s) {
  if (!s.engine) {
    const ok = s.results.every((r) => r.ok);
    s.engine = ok ? engineForCalls({ results: s.results }) : { failed: 'the program has problems' };
  }
  return s.engine;
}
const modOf = (s, u) => engineOf(s).mods?.[s.results.indexOf(u.result)];

/** Numbers and text written in a program: the values the inputs are made from. */
function literals(sides) {
  // kept: the numbers written in kept values (Keep review limit at $100): limits, so they and their neighbours come first.
  const lit = { money: new Set(), whole: new Set(), number: new Set(), text: new Set(), date: new Set(), kept: new Set() };
  const seen = new Set();
  const walk = (x, inKeep = false) => {
    if (!x || typeof x !== 'object' || seen.has(x)) return;
    seen.add(x);
    if (Array.isArray(x)) { for (const y of x) walk(y, inKeep); return; }
    if (x.k === 'keep') inKeep = true;
    if ((x.k === 'money' || x.k === 'num') && x.text && inKeep) lit.kept.add(String(x.text).replace(/[$,]/g, ''));
    if (x.k === 'money' && x.text) lit.money.add(String(x.text).replace(/[$,]/g, ''));
    else if (x.k === 'num' && x.text) (x.whole ? lit.whole : lit.number).add(String(x.text).replace(/,/g, ''));
    else if (x.k === 'str' && Array.isArray(x.parts) && x.parts.every((p) => typeof p === 'string')) { const t = x.parts.join(''); if (t.length <= 40) lit.text.add(t); }
    else if (x.k === 'date' && x.text) lit.date.add(String(x.text));
    for (const [k, v] of Object.entries(x)) if (!SKIP_KEYS.has(k)) walk(v, inKeep);
  };
  for (const s of sides) for (const r of s.results) walk(r.program);
  return lit;
}

const decStr = (d) => d.toString();
const sortDec = (xs) => [...new Map(xs.map((x) => [decStr(x), x])).values()].sort((a, b) => Dec.cmp(a, b));
/**
 * At most `n` values, in order: kept values and their neighbours, the edges, then the other numbers written in the
 * program and their neighbours, in the order they are written. Given back sorted.
 */
function capped(groups, n) {
  const out = new Map();
  for (const g of groups) for (const d of g) { if (out.size >= n) break; if (!out.has(decStr(d))) out.set(decStr(d), d); }
  return sortDec([...out.values()]);
}

function candidates(kind, lit) {
  switch (kind) {
    case 'money': {
      const step = Dec.parse('0.01');
      const near = (ts) => ts.map((t) => Dec.parse(t)).filter(Boolean).flatMap((d) => [Dec.sub(d, step), d, Dec.add(d, step)]).filter((d) => !d.s || d.isZero());
      const kept = near([...lit.kept].filter((t) => lit.money.has(t)));
      const edges = ['0', '1000', '0.01', '1'].map((t) => Dec.parse(t));
      return capped([kept, edges, near([...lit.money])], 24).map((d) => d.toFixed(2));
    }
    case 'whole': case 'number': {
      const one = Dec.parse('1');
      const pool = [...lit.whole, ...(kind === 'number' ? lit.number : [])];
      const near = (ts) => ts.map((t) => Dec.parse(t)).filter(Boolean).flatMap((d) => [Dec.sub(d, one), d, Dec.add(d, one)]);
      const kept = near([...lit.kept].filter((t) => pool.includes(t)));
      const edges = ['0', '1', '1000', '-1', '2'].map((t) => Dec.parse(t));
      return capped([kept, edges, near(pool)], 18).map((d) => (kind === 'whole' ? Number(decStr(d)) : decStr(d)));
    }
    case 'text': return [...new Set(['', 'x', ...lit.text])].slice(0, 10);
    case 'bool': return [false, true];
    case 'date': return [...new Set(['2026-01-01', '2026-12-31', ...lit.date])].slice(0, 6);
    default: return null;
  }
}

const SCALAR = new Set(['money', 'whole', 'number', 'text', 'bool', 'date']);

/**
 * The inputs a function takes, as slots that each take one value: a plain input is one slot; a data type is one
 * slot per field (an either/or type also chooses its alternative). Gives { slots, build(rawValues) -> rows } or
 * { why } when an input has a kind the comparison doesn't make values for yet.
 */
function slotsFor(params, recordsInfo, lit) {
  const slots = [];
  const plan = [];
  for (const p of params) {
    let t = p.type;
    const optional = t?.k === 'optional';
    if (optional) t = t.of;
    if (SCALAR.has(t?.k)) {
      const values = candidates(t.k, lit);
      slots.push({ label: p.text, kind: t.k, values: optional ? [null, ...values] : values });
      plan.push({ p, at: slots.length - 1 });
    } else if (t?.k === 'record') {
      const rec = recordsInfo.get(t.name);
      if (!rec) return { why: `its input "${p.text}" is a data type this version does not have` };
      const fields = [];
      for (const f of rec.fields) {
        let ft = f.type, opt = ft?.k === 'optional';
        if (opt) ft = ft.of;
        if (rec.alts && f.py === 'which') { slots.push({ label: `${p.text}'s alternative`, kind: 'which', values: rec.alts.map((a) => a.name) }); fields.push({ f, at: slots.length - 1 }); continue; }
        if (SCALAR.has(ft?.k)) { slots.push({ label: `${p.text}'s ${f.name}`, kind: ft.k, values: candidates(ft.k, lit) }); fields.push({ f, at: slots.length - 1 }); continue; }
        if (opt) { fields.push({ f, fixed: null }); continue; }
        if (ft?.k === 'list') { fields.push({ f, fixed: [] }); continue; }
        return { why: `its input "${p.text}" has a field (${f.text}) the comparison does not make values for yet` };
      }
      plan.push({ p, rec, fields });
    } else if (t?.k === 'list' && SCALAR.has(t.of?.k)) {
      const one = candidates(t.of.k, lit);
      slots.push({ label: p.text, kind: 'list', values: [[], [one[Math.floor(one.length / 2)]], one.slice(0, 3)] });
      plan.push({ p, at: slots.length - 1 });
    } else if (optional) plan.push({ p, fixed: null });
    else return { why: `its input "${p.text}" is a kind the comparison does not make values for yet` };
  }
  return { slots, plan };
}

/** Seeded, so the same function always gets the same inputs. */
function seeded(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Which values to try: every combination when there are few; otherwise each slot swept from several starting points, and a fixed sample. */
function inputsFor(slots, seedText) {
  const total = slots.reduce((n, s) => n * s.values.length, 1);
  const out = [], seen = new Set();
  const push = (idx) => { const k = idx.join(','); if (!seen.has(k) && out.length < MAX_RUNS) { seen.add(k); out.push(idx); } };
  if (total <= MAX_RUNS) {
    const idx = slots.map(() => 0);
    for (let n = 0; n < total; n++) { push([...idx]); for (let i = slots.length - 1; i >= 0; i--) { if (++idx[i] < slots[i].values.length) break; idx[i] = 0; } }
    return out;
  }
  const rnd = seeded(seedText);
  const pick = () => slots.map((s) => Math.floor(rnd() * s.values.length));
  // Starting points: each slot at its lowest or highest value, in every combination (a large total with nothing
  // refunded is one), in a fixed shuffled order; then a few chosen at random.
  const combos = [];
  const k = Math.min(slots.length, 8);
  for (let m = 0; m < 2 ** k; m++) combos.push(slots.map((s, i) => (i < k && (m >> i) & 1 ? s.values.length - 1 : 0)));
  const bases = [slots.map((s) => Math.floor(s.values.length / 2)), ...combos.map((c) => [rnd(), c]).sort((x, y) => x[0] - y[0]).map((x) => x[1])];
  for (let i = 0; i < 8; i++) bases.push(pick());
  for (const b of bases) for (let si = 0; si < slots.length; si++) for (let vi = 0; vi < slots[si].values.length; vi++) { const x = [...b]; x[si] = vi; push(x); }
  for (let tries = 0; out.length < MAX_RUNS && tries < MAX_RUNS * 4; tries++) push(pick());
  return out;
}

const article = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const stopShape = (m) => m.replace(/\$?-?\d[\d,]*(\.\d+)?/g, '…');

/** What one call did, in words, with a key that says exactly what it gave (and its fields, for a record). */
function outcome(fn) {
  try {
    const v = fn();
    let key;
    try { key = dataJson(v); } catch { key = show(v); }
    if (v instanceof RecordVal) {
      const which = v.cls.alts ? v.f.get('which') : null;
      const label = which ? `${article(which)} ${which} ${v.cls.py}` : `${article(v.cls.py)} ${v.cls.py}`;
      let fields = null;
      try { fields = JSON.parse(key); } catch { /* not JSON: compared whole */ }
      return { key, label, group: label, fields };
    }
    const label = Array.isArray(v) ? `a list of ${v.length}` : typeof v === 'string' ? JSON.stringify(v) : show(v);
    return { key, label, group: label };
  } catch (e) {
    if (e instanceof OutOfSteps || e instanceof RangeError) return { unknown: true };
    const err = asPyErr(e);
    const msg = explain(err);
    if (err.pyType === 'Stop') return { key: `stop:${msg}`, label: `stops with "${msg}"`, group: `stops with "${stopShape(msg)}"` };
    if (err.pyType === 'RuleBroken') return { key: `rule:${msg}`, label: `breaks a rule (${msg})`, group: `breaks a rule (${stopShape(msg)})` };
    return { key: `fail:${msg}`, label: `fails (${msg})`, group: `fails (${stopShape(msg)})` };
  }
}

const fieldWords = (k) => k.replace(/_/g, ' ');
const fieldValue = (v) => (typeof v === 'string' ? JSON.stringify(v) : v === null ? 'nothing' : String(v));

/**
 * How two different answers differ, as a group key and words: another kind of answer ("now a review Refund
 * instead of an approved Refund"), or the same kind with fields that changed ("its reason is now …").
 */
function difference(oa, ob) {
  if (oa.group !== ob.group) return { key: `${oa.group} -> ${ob.group}`, says: `now ${ob.group} instead of ${oa.group}`, otherKind: true };
  if (oa.fields && ob.fields) {
    const names = [...new Set([...Object.keys(oa.fields), ...Object.keys(ob.fields)])].filter((k) => JSON.stringify(oa.fields[k]) !== JSON.stringify(ob.fields[k]));
    if (names.length) {
      const shown = names.slice(0, 2).map((k) => `its ${fieldWords(k)} is now ${fieldValue(ob.fields[k])} instead of ${fieldValue(oa.fields[k])}`);
      return { key: `${ob.group}: ${names.join(',')}`, says: `still ${ob.group}, but ${shown.join(', and ')}${names.length > 2 ? ` (and ${names.length - 2} more fields)` : ''}` };
    }
  }
  return { key: `${oa.label} -> ${ob.label}`, says: `now ${ob.label} instead of ${oa.label}` };
}

const recordsInfoOf = (u) => new Map((u.result.info?.records ?? []).map((r) => [r.name, r]));

/** The arguments for one input on one side, or { refused } when this side can't make them (a Never rule, say). */
function argsFor(api, mod, plan, slots, idx) {
  const args = [];
  for (const step of plan) {
    if ('fixed' in step && !step.rec) { args.push(step.fixed); continue; }
    if (!step.rec) { const raw = slots[step.at].values[idx[step.at]]; args.push(raw === null ? null : step.p.type.k === 'list' ? raw.map((x) => inputValue(x, step.p.type.of, step.p.text, false)) : inputValue(raw, step.p.type.k === 'optional' ? step.p.type.of : step.p.type, step.p.text, false)); continue; }
    const row = {};
    const altAt = step.fields.find((x) => x.f.py === 'which' && 'at' in x);
    const alt = altAt ? step.rec.alts.find((a) => a.name === slots[altAt.at].values[idx[altAt.at]]) : null;
    for (const x of step.fields) {
      if (x.f.py === 'which') { row.which = alt?.name; continue; }
      if (alt && !alt.fields.some((af) => af.py === x.f.py)) { row[x.f.py] = null; continue; }
      row[x.f.py] = 'fixed' in x ? x.fixed : slots[x.at].values[idx[x.at]];
    }
    const cls = mod.globals.get(step.rec.py);
    try { args.push(api.record(cls, row)); } catch (e) { return { refused: explain(asPyErr(e)) }; }
  }
  return { args };
}

const fmtSlot = (s, v) => (v === null ? 'nothing' : s.kind === 'money' ? `$${v}` : s.kind === 'text' ? JSON.stringify(v) : s.kind === 'bool' ? (v ? 'yes' : 'no') : Array.isArray(v) ? `[${v.join(', ')}]` : String(v));

/** The inputs a function reads ("order's total", "amount"): shown first in an example. */
function readSlots(u, slots) {
  const read = new Set();
  const seen = new Set();
  const walk = (x) => {
    if (!x || typeof x !== 'object' || seen.has(x)) return;
    seen.add(x);
    if (Array.isArray(x)) { for (const y of x) walk(y); return; }
    if (x.k === 'field' && x.obj?.ref?.kind === 'param') read.add(`${x.obj.text}'s ${x.name}`);
    if (x.k === 'name' && x.ref?.kind === 'param') read.add(x.text);
    for (const [k, v] of Object.entries(x)) if (!SKIP_KEYS.has(k)) walk(v);
  };
  walk(u.node.body);
  return slots.map((sl, i) => (read.has(sl.label) ? i : -1)).filter((i) => i >= 0);
}

/** Run a function before and after on the same inputs. Gives { tried, unknown, changed, groups } or { why } when it isn't run. */
function compareRuns(A, B, a, b, lit, until = Infinity) {
  for (const [s, u] of [[A, a], [B, b]]) {
    const r = reach(s, u.id);
    if ([...r].some((d) => d.startsWith('store:'))) return { why: 'it reads or changes saved data (a stored list), so it is not run here' };
    if (r.has('http')) return { why: 'it calls another service, so it is not run here' };
    if (engineOf(s).failed) return { why: `the ${s === A ? 'old' : 'new'} version has problems, so it can't be run` };
  }
  const sig = (u) => u.node.params.map((p) => JSON.stringify(p.type, ['k', 'of', 'name'])).join('|');
  if (sig(a) !== sig(b)) return { why: 'its inputs changed, so the two versions take different values' };
  const made = slotsFor(b.node.params, recordsInfoOf(b), lit);
  if (made.why) return { why: made.why };
  const madeA = slotsFor(a.node.params, recordsInfoOf(a), lit);
  if (madeA.why) return { why: madeA.why };
  const { slots, plan } = made;
  const inputs = inputsFor(slots, b.id);
  const apiA = engineOf(A), apiB = engineOf(B), modA = modOf(A, a), modB = modOf(B, b);
  let unknown = 0, stopped = false;
  const done = []; // [idx, group key or null (the same answer)]
  const groups = new Map();
  const deadline = Math.min(until, Date.now() + MS_PER_FUNCTION);
  for (const idx of inputs) {
    if (Date.now() > deadline) { stopped = true; break; }
    const ga = argsFor(apiA, modA, madeA.plan, slots, idx), gb = argsFor(apiB, modB, plan, slots, idx);
    if (ga.refused && gb.refused) continue;
    const oa = ga.refused ? { key: `refused:${ga.refused}`, label: `not allowed (${ga.refused})`, group: 'not allowed' } : outcome(() => apiA.call(modA, a.node, ga.args));
    const ob = gb.refused ? { key: `refused:${gb.refused}`, label: `not allowed (${gb.refused})`, group: 'not allowed' } : outcome(() => apiB.call(modB, b.node, gb.args));
    if (oa.unknown || ob.unknown) { unknown++; continue; }
    if (oa.key === ob.key) { done.push([idx, null]); continue; }
    const d = difference(oa, ob);
    if (!groups.has(d.key)) groups.set(d.key, { says: d.says, otherKind: !!d.otherKind, inputs: [] });
    groups.get(d.key).inputs.push(idx);
    done.push([idx, d.key]);
  }
  const read = readSlots(b, slots);
  // Another kind of answer first (approved -> review), then changed fields; the most inputs first within each.
  const list = [...groups.entries()].sort((x, y) => (y[1].otherKind - x[1].otherKind) || y[1].inputs.length - x[1].inputs.length).map(([key, g]) => ({ says: g.says, ...describeGroup(key, g, slots, done, read) }));
  return { tried: done.length, unknown, stopped, changed: list.reduce((n, g) => n + g.count, 0), groups: list };
}

/**
 * Where a group of changed answers happens. An input decides it when, with every other input held still, the
 * changed answers are one unbroken run of its values with unchanged answers on at least one side; the run seen
 * most often is given as the range tried ("amount is from $50.00 to $99.99"). And one example.
 */
function describeGroup(key, g, slots, done, read) {
  let best = null;
  slots.forEach((s, si) => {
    if (!['money', 'whole', 'number'].includes(s.kind)) return;
    const lines = new Map();
    for (const [idx, k] of done) {
      const lineKey = idx.filter((_, i) => i !== si).join(',');
      if (!lines.has(lineKey)) lines.set(lineKey, []);
      lines.get(lineKey).push([idx[si], k === key]);
    }
    const runs = new Map();
    for (const pts of lines.values()) {
      if (pts.length < 3 || !pts.some((x) => x[1])) continue;
      pts.sort((x, y) => x[0] - y[0]);
      const inside = pts.map((x, i) => (x[1] ? i : -1)).filter((i) => i >= 0);
      const lo = inside[0], hi = inside[inside.length - 1];
      if (hi - lo + 1 !== inside.length || (lo === 0 && hi === pts.length - 1)) continue; // broken up, or the whole line
      // open: the run reaches the lowest (or highest) value tried on its line, so it may go on past it.
      const k = [pts[lo][0], pts[hi][0], lo === 0 ? 1 : 0, hi === pts.length - 1 ? 1 : 0, inside.length].join(' ');
      runs.set(k, (runs.get(k) ?? 0) + 1);
    }
    const [top, n] = [...runs.entries()].sort((x, y) => y[1] - x[1])[0] ?? [];
    if (!top) return;
    const [lo, hi, openLo, openHi, width] = top.split(' ').map(Number);
    // The input that explains the most: the widest run of values, then the run seen on the most lines.
    if (!best || width > best.width || (width === best.width && n > best.n)) best = { si, n, lo, hi, openLo, openHi, width };
  });
  const first = g.inputs[0];
  const order = [...new Set([...(best ? [best.si] : []), ...read, ...slots.map((_, i) => i)])];
  const example = order.slice(0, 4).map((i) => `${slots[i].label} ${fmtSlot(slots[i], slots[i].values[first[i]])}`).join(', ');
  let where = null;
  if (best) {
    const s = slots[best.si];
    const lo = fmtSlot(s, s.values[best.lo]), hi = fmtSlot(s, s.values[best.hi]);
    where = best.openHi && !best.openLo ? `${s.label} is ${lo} or more` : best.openLo && !best.openHi ? `${s.label} is ${hi} or less`
      : lo === hi ? `${s.label} is ${lo}` : `${s.label} is from ${lo} to ${hi}`;
  }
  return { count: g.inputs.length, where, example };
}

function behaviourWords(run) {
  if (run.why) return `Not run: ${run.why}.`;
  const tried = `${run.tried} input${run.tried === 1 ? '' : 's'} tried`;
  const notDone = [run.unknown ? `${run.unknown} more did not finish within the step limit` : '', run.stopped ? 'stopped there to stay within the time limit' : ''].filter(Boolean).map((x) => ` (${x})`).join('');
  if (!run.changed) return `The same answer before and after on all ${tried}${notDone}.`;
  const shown = run.groups.slice(0, MAX_SHOWN_GROUPS).map((g) => `${g.says}${g.where ? ` when ${g.where}` : ''} (${g.count} input${g.count === 1 ? '' : 's'}; for example ${g.example})`);
  const more = run.groups.length > MAX_SHOWN_GROUPS ? `; and ${run.groups.length - MAX_SHOWN_GROUPS} more kinds of change` : '';
  return `On ${tried}, ${run.changed} answer${run.changed === 1 ? '' : 's'} changed${notDone}: ${shown.join('; ')}${more}.`;
}

/** Run a test on one side: { passed, problem }, or null when it can't run. */
function runTest(s, u) {
  const api = engineOf(s);
  if (api.failed) return null;
  const mod = modOf(s, u);
  try { api.test(mod, u.node); return { passed: true }; } catch (e) {
    if (e instanceof OutOfSteps) return null;
    return { passed: false, problem: explain(asPyErr(e)) };
  }
}

// ── The comparison ─────────────────────────────────────────────────────────────────────────────────────────────

const whereOf = (u) => ({ file: u.file, line: u.line });
const ref = (s, id) => { const u = s.units.get(id); return u ? { id, subject: u.subject, kind: u.kind, ...whereOf(u) } : null; };

/**
 * What changed between two versions of a Thunder program, rule by rule (thunder-core-changes-v1):
 * { schema, files, changes: [{ id, kind, subject, change, severity, file, line, says, before, after, behaviour?,
 *   through?, affects: [{ id, subject, kind, file, line, via, test? }] }], unchanged, problems }.
 * change: added | removed | renamed | changed | affected (its own steps are the same, but something it uses changed)
 * | not-compiled. severity: risk | meaning, as in thunder review. Only spacing changed: counted as unchanged.
 */
export function coreChanges(oldFiles, newFiles) {
  const A = side(oldFiles), B = side(newFiles);
  const lit = literals([A, B]);
  const changes = [];
  // While a src/ file has problems, the tests that use it would only repeat them as names they can't find.
  const srcBroken = B.results.some((r) => r.kind === 'src' && !r.ok);
  const problems = B.results.filter((r) => !r.ok && !(srcBroken && r.kind === 'test')).map((r) => ({ file: r.path, diagnostics: (r.diagnostics ?? []).filter((d) => d.severity !== 'warning').map((d) => ({ line: d.line, code: d.code, message: d.message })) }));
  for (const p of problems) {
    const d = p.diagnostics[0];
    changes.push({ id: `file:${p.file}`, kind: 'file', subject: p.file, change: 'not-compiled', severity: 'risk', file: p.file, line: d?.line ?? 1, before: null, after: null, affects: [],
      says: `The new version has ${p.diagnostics.length} problem${p.diagnostics.length === 1 ? '' : 's'} (${d ? `line ${d.line}: ${d.message}` : 'it does not compile'}), so its behaviour can't be compared: fix ${p.diagnostics.length === 1 ? 'it' : 'them'} first.` });
  }
  const direct = new Set(); // new-side ids that changed themselves (or were added)
  let unchanged = 0;
  const entries = [];
  for (const [a, b] of pair(A, B)) {
    if (a && b && a.id === b.id && sameText(a.text, b.text)) { unchanged++; continue; }
    if (a && b) { direct.add(b.id); entries.push({ a, b, change: a.id === b.id ? 'changed' : 'renamed' }); continue; }
    if (b) { direct.add(b.id); entries.push({ a: null, b, change: 'added' }); continue; }
    entries.push({ a, b: null, change: 'removed' });
  }
  // What depends on each change, on the new side (for a removed rule, what used it on the old side).
  const affectsOf = (id, s) => [...dependents(s, new Set([id]))].map(([d, chain]) => ({ ...ref(s, d), via: chain.slice(1).map((x) => s.units.get(x)?.subject ?? x) }));
  const runs = new Map();
  const until = Date.now() + MS_IN_ALL;
  const runOf = (a, b) => {
    if (!runs.has(b.id)) runs.set(b.id, Date.now() > until ? { why: 'the comparison reached its time limit before this function' } : compareRuns(A, B, a, b, lit, until));
    return runs.get(b.id);
  };
  for (const { a, b, change } of entries) {
    const u = b ?? a;
    const s = b ? B : A;
    const affects = affectsOf(u.id, s);
    let severity = 'meaning';
    let says;
    const kw = KIND_WORD[u.kind];
    if (change === 'added') says = `New ${kw}${u.kind === 'never' ? `: values it refuses are no longer allowed` : ''}.`;
    else if (change === 'removed') {
      says = u.kind === 'never' ? `${u.record.text} no longer has this rule, so values it refused are now allowed.` : `Removed ${kw}.`;
      if (u.kind === 'never' || u.kind === 'test' || affects.length) severity = 'risk';
      if (affects.length && u.kind !== 'never') says += ` It was used by ${affects.slice(0, 3).map((x) => x.subject).join(', ')}${affects.length > 3 ? `, and ${affects.length - 3} more` : ''}.`;
    } else if (change === 'renamed') says = `Renamed from ${a.subject}, with the same steps.`;
    else if (u.kind === 'keep') { const value = (x) => x.text.join(' ').trim().replace(/^Keep\s+/i, '').replace(new RegExp(`^${x.node.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(at|as|to)\\s+`, 'i'), ''); says = `Now ${value(b)} (was ${value(a)}).`; }
    else if (u.kind === 'never') says = `The rule changed: "${a.node.text}" is now "${b.node.text}".`;
    else if (u.kind === 'record') says = recordWords(a, b);
    else says = 'Its steps changed.';
    const entry = { id: u.id, kind: u.kind, subject: u.subject, change, severity, file: u.file, line: u.line, before: a?.text ?? null, after: b?.text ?? null, says, affects };
    if ((change === 'changed' || change === 'renamed') && u.kind === 'function') {
      const run = runOf(a, b);
      entry.behaviour = run;
      entry.says = `${says} ${behaviourWords(run)}`;
    }
    changes.push(entry);
  }
  // Functions whose own steps are the same, but which use something that changed: run them too.
  const reached = dependents(B, direct);
  for (const [id, chain] of reached) {
    const b = B.units.get(id), a = A.units.get(id);
    if (!a || b.kind !== 'function') continue;
    const run = runOf(a, b);
    if (!run.why && !run.changed) continue; // the same answers: it stays in the "look again" list of what changed
    const through = chain.map((x) => B.units.get(x)?.subject ?? x);
    changes.push({ id, kind: 'function', subject: b.subject, change: 'affected', severity: 'meaning', file: b.file, line: b.line, before: null, after: null, through,
      says: `Its own steps are the same, but it uses ${through.slice().reverse().join(', which uses ')}, which changed. ${behaviourWords(run)}`, behaviour: run, affects: affectsOf(id, B) });
  }
  // Tests that reach a change: run before and after.
  const touched = new Set([...direct, ...reached.keys()]);
  for (const [id, u] of B.units) {
    if (u.kind !== 'test' || !touched.has(id) || !A.units.has(id)) continue;
    const before = runTest(A, A.units.get(id)), after = runTest(B, u);
    if (!before || !after) continue;
    const entry = changes.find((c) => c.id === id);
    if (before.passed && !after.passed) {
      if (entry) Object.assign(entry, { severity: 'risk', says: `${entry.says} It passed before and fails now: ${after.problem}` });
      else changes.push({ id, kind: 'test', subject: u.subject, change: 'affected', severity: 'risk', file: u.file, line: u.line, before: null, after: null, affects: [], says: `Passed before and fails now: ${after.problem}` });
    } else if (!before.passed && after.passed) {
      if (entry) entry.says = `${entry.says} It failed before and passes now.`;
      else changes.push({ id, kind: 'test', subject: u.subject, change: 'affected', severity: 'meaning', file: u.file, line: u.line, before: null, after: null, affects: [], says: `Failed before (${before.problem}) and passes now.` });
    }
    for (const c of changes) for (const x of c.affects ?? []) if (x.id === id) x.test = after.passed ? 'passes' : 'fails';
  }
  const order = { risk: 0, meaning: 1 };
  changes.sort((x, y) => order[x.severity] - order[y.severity] || byText(String(x.file), String(y.file)) || x.line - y.line);
  return { schema: CORE_CHANGES_SCHEMA, files: [...new Set([...A.files, ...B.files].map((f) => f.path))], changes, unchanged, problems };
}

function recordWords(a, b) {
  const fa = new Map(a.node.fields.map((f) => [f.name, f])), fb = new Map(b.node.fields.map((f) => [f.name, f]));
  const kind = (f) => JSON.stringify(f.type, ['k', 'of', 'name']);
  const parts = [];
  const added = [...fb.keys()].filter((k) => !fa.has(k) && k !== 'which'), removed = [...fa.keys()].filter((k) => !fb.has(k) && k !== 'which');
  const changed = [...fb.keys()].filter((k) => fa.has(k) && kind(fa.get(k)) !== kind(fb.get(k)));
  if (added.length) parts.push(`new field${added.length === 1 ? '' : 's'} ${added.map((k) => fb.get(k).text).join(', ')}`);
  if (removed.length) parts.push(`field${removed.length === 1 ? '' : 's'} ${removed.map((k) => fa.get(k).text).join(', ')} removed`);
  if (changed.length) parts.push(`${changed.map((k) => fb.get(k).text).join(', ')} changed kind`);
  return parts.length ? `${parts.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()) : 'Its fields changed.';
}

// ── affectedBy ─────────────────────────────────────────────────────────────────────────────────────────────────

/** A rule named the way a person would: its id, its subject ("decide refund", "POST /orders"), or a kept value's name. */
function resolve(s, name) {
  if (s.units.has(name)) return [name];
  const want = String(name).trim().toLowerCase();
  return [...s.units.values()].filter((u) => u.subject.toLowerCase() === want || u.id.slice(u.id.indexOf(':') + 1).toLowerCase() === want).map((u) => u.id);
}

/**
 * What to look at again when `change` changes (thunder-affected-v1): the functions and endpoints that use it, all
 * the way up; the tests and the examples (Expect lines) that reach it; the Never rules and stored lists those
 * functions rely on. `change` is a rule's id or name ("decide refund", "keep:review limit"), or a list of them.
 * Each item cites its file and line and says how it is reached (via).
 */
export function affectedBy(files, change) {
  const s = side(files);
  const names = Array.isArray(change) ? change : [change];
  const roots = new Set();
  const unknown = [];
  for (const n of names) { const ids = resolve(s, n); if (ids.length) ids.forEach((id) => roots.add(id)); else unknown.push(String(n)); }
  const via = dependents(s, roots);
  const list = (kind) => [...via].filter(([id]) => s.units.get(id)?.kind === kind).map(([id, chain]) => ({ ...ref(s, id), via: chain.map((x) => s.units.get(x)?.subject ?? x) }));
  const reachedIds = new Set([...roots, ...via.keys()]);
  // Examples: each Expect line in an affected test that itself reaches a changed or affected rule.
  const examples = [];
  for (const [id] of via) {
    const u = s.units.get(id);
    if (u.kind !== 'test') continue;
    for (const st of u.node.body ?? []) {
      if (st.k !== 'expect') continue;
      const uses = usesOf({ id: '', kind: 'expect', node: st }, s.units, s.records);
      const hit = [...uses].find((d) => reachedIds.has(d));
      if (hit) examples.push({ file: u.file, line: st.line, test: u.subject, says: st.raw ?? null, reaches: s.units.get(hit)?.subject ?? hit });
    }
  }
  // The Never rules and stored lists the affected functions and endpoints rely on (not the tests: they only check).
  const relied = new Map();
  for (const id of reachedIds) for (const d of s.units.get(id)?.kind === 'test' ? [] : s.units.get(id)?.uses ?? []) {
    const k = s.units.get(d)?.kind;
    if ((k === 'never' || k === 'store') && !relied.has(d)) relied.set(d, { ...ref(s, d), usedBy: s.units.get(id).subject });
  }
  return {
    schema: AFFECTED_SCHEMA,
    of: [...roots].map((id) => ref(s, id)),
    unknown,
    functions: list('function'),
    endpoints: list('endpoint'),
    tests: list('test'),
    examples,
    rules: [...relied.values()].filter((x) => x.kind === 'never'),
    stored: [...relied.values()].filter((x) => x.kind === 'store'),
  };
}

/** affectedBy's answer as text for a terminal. */
export function renderAffected(r) {
  const out = [];
  for (const n of r.unknown) out.push(`No rule called "${n}" in these files. Name a function, endpoint ("POST /orders"), kept value, data type, stored list, or test.`);
  if (!r.of.length) return out.join('\n');
  out.push(`What to look at again if ${r.of.map((x) => `${x.subject} (${x.file}:${x.line})`).join(' and ')} change${r.of.length === 1 ? 's' : ''}:`);
  // via starts at the rule that changes; the rules after it are the ones in between, nearest last.
  const through = (x) => (x.via?.length > 1 ? `  (through ${x.via.slice(1).reverse().join(', ')})` : '');
  const section = (title, list, fmt) => { if (list.length) out.push('', title, ...list.map(fmt)); };
  section('Functions that use it', r.functions, (x) => `  ${x.subject}  ${x.file}:${x.line}${through(x)}`);
  section('Endpoints', r.endpoints, (x) => `  ${x.subject}  ${x.file}:${x.line}${through(x)}`);
  section('Tests', r.tests, (x) => `  ${x.subject}  ${x.file}:${x.line}${through(x)}`);
  section('Examples (Expect lines) that reach it', r.examples, (x) => `  ${x.file}:${x.line}  ${x.says ?? ''}`);
  section('Never rules they rely on', r.rules, (x) => `  ${x.subject}  ${x.file}:${x.line}  (used by ${x.usedBy})`);
  section('Stored lists they use', r.stored, (x) => `  ${x.subject.replace(/^stored list /, '')}  ${x.file}:${x.line}  (used by ${x.usedBy})`);
  if (!r.functions.length && !r.endpoints.length && !r.tests.length) out.push('', 'Nothing else in these files uses it.');
  return out.join('\n');
}
