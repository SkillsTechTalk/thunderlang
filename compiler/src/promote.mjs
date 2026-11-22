// Promote a reading to a rule: turn a decision recovered by the reader (read.mjs) into a readable
// ThunderLang contract with starter examples, so a person can confirm it and from then on every change
// is checked against it. Deterministic, no AI, browser-safe.
//
// The examples are characterization examples: their expected answers are computed from the recovered
// rule, so they record what the code does TODAY, not what it should do. They are chosen where mistakes
// hide: one example per rule, plus both sides of every numeric threshold. The contract says so in its
// header; a person confirms each answer or changes it.
import { parseIntent } from './parse.mjs';
import { tokenize } from './expr.mjs';
import { evaluateDecision } from './runtime.mjs';
import { sayCondition } from './read.mjs';

export const PROMOTE_SCHEMA = 'thunder-promotion-v1';

const pascal = (s) => String(s).replace(/(^|[_\s-]+)([a-zA-Z0-9])/g, (_, __, c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, '') || 'Rule';
const flat = (path) => path.split('.').map((seg, i) => (i ? seg[0].toUpperCase() + seg.slice(1) : seg)).join('');
const OUTCOME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const STRING_LIT = /^[A-Za-z0-9 _-]*$/;

/**
 * Inputs a condition references, with how each is used: compared to a number, to text, or alone.
 * Only the function's parameters (and fields on them) are inputs; any other bare name in a condition
 * is an enum value (plan == FREE), which a contract compares as text.
 */
function usage(conditions, params) {
  const isInput = (name) => (params.size ? params.has(name.split('.')[0]) : !/^[A-Z]/.test(name));
  const refs = new Map(); // path -> { numbers:Set, strings:Set, bare:boolean }
  const entry = (name) => { if (!refs.has(name)) refs.set(name, { numbers: new Set(), strings: new Set(), bare: false }); return refs.get(name); };
  for (const cond of conditions) {
    const toks = tokenize(cond);
    toks.forEach((t, i) => {
      if (t.t !== 'id' || !isInput(t.v)) return;
      const u = entry(t.v);
      const after = toks[i + 1]?.t === 'op';
      const op = after ? toks[i + 1] : toks[i - 1]?.t === 'op' ? toks[i - 1] : null;
      const other = after ? toks[i + 2] : toks[i - 1]?.t === 'op' ? toks[i - 2] : null;
      if (op && other?.t === 'num') u.numbers.add(other.v);
      else if (op && other?.t === 'str') u.strings.add(other.v);
      else if (op && other?.t === 'id' && !isInput(other.v)) u.strings.add(other.v); // enum member
      else if (op && other?.t === 'id') u.numbers.add(0); // compared with another input
      else if (!op) u.bare = true;
    });
  }
  return refs;
}

function candidates(type, u) {
  if (type === 'boolean') return [false, true];
  if (type === 'string') return [...u.strings].concat('other').filter((s, i, a) => a.indexOf(s) === i);
  const out = new Set();
  for (const n of u.numbers) {
    const step = Number.isInteger(n) ? 1 : 0.01;
    for (const v of [n - step, n, n + step]) out.add(Math.round(v * 100) / 100);
  }
  if (!out.size) out.add(0);
  return [...out].sort((a, b) => a - b);
}

/** Every combination of candidate values, capped; past the cap, vary one input at a time from a base. */
function assignments(inputs, values, cap = 4096) {
  const total = inputs.reduce((n, i) => n * values[i].length, 1);
  if (total <= cap) {
    let acc = [{}];
    for (const name of inputs) acc = acc.flatMap((a) => values[name].map((v) => ({ ...a, [name]: v })));
    return acc;
  }
  const base = Object.fromEntries(inputs.map((n) => [n, values[n][0]]));
  return [base, ...inputs.flatMap((n) => values[n].map((v) => ({ ...base, [n]: v })))];
}

const lit = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));

/**
 * The recovered rule as something that can run: plain input names, candidate values on both sides of every
 * threshold, and an evaluator. `extraConditions` widens the candidate values (Thunder write uses the edited
 * rule's conditions, so the before and after versions are checked on the same inputs).
 * Returns { ok: true, notes, refs, renames, names, types, values, rules, decisionName, canonical, run, all }
 * or { ok: false, reason }.
 */
export function recoverModel(item, { extraConditions = [] } = {}) {
  if (!item || item.kind !== 'decision' || !item.rules?.length || !item.otherwise) return { ok: false, reason: 'Only decisions (functions that choose between fixed answers) can become a contract.' };
  const results = [...item.rules.map((r) => r.result), item.otherwise.result];
  const bad = results.find((r) => !OUTCOME.test(r));
  if (bad) return { ok: false, reason: `The answer ${bad} is not a name. Contracts answer with names such as Approve or Review.` };
  // Flatten field paths (order.total -> orderTotal) so every input is a plain name.
  const notes = [];
  const renames = new Map();
  const conditions = [...item.rules.map((r) => r.when), ...extraConditions];
  const refs = usage(conditions, new Set((item.inputs || []).map((p) => p.name)));
  for (const path of refs.keys()) if (path.includes('.')) { renames.set(path, flat(path)); notes.push(`${flat(path)} stands for ${path} in the code.`); }
  const rewrite = (cond) => tokenize(cond).map((t) => {
    if (t.t === 'id') return refs.has(t.v) ? (renames.get(t.v) ?? t.v) : JSON.stringify(t.v); // enum members are text in a contract
    if (t.t === 'str') return JSON.stringify(t.v);
    if (t.t === 'num' || t.t === 'bool') return String(t.v);
    return t.v;
  }).join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');
  const declared = new Map((item.inputs || []).map((p) => [p.name, p.type]));
  // Keep the function's own parameter order; flattened fields follow their object parameter.
  const order = (path) => { const i = (item.inputs || []).findIndex((p) => p.name === path.split('.')[0]); return i < 0 ? 999 : i; };
  const names = [...refs.keys()].sort((a, b) => order(a) - order(b)).map((p) => renames.get(p) ?? p);
  if (!names.length) return { ok: false, reason: 'The rules do not depend on any input, so there is nothing to give examples for.' };
  const types = {}, values = {};
  for (const [path, u] of refs) {
    const name = renames.get(path) ?? path;
    const t = declared.get(path);
    types[name] = ['number', 'boolean', 'string'].includes(t) && !(t !== 'string' && u.strings.size) ? t : u.strings.size ? 'string' : u.numbers.size ? 'number' : 'boolean';
    for (const s of u.strings) if (!STRING_LIT.test(s)) return { ok: false, reason: `The text "${s}" has characters a contract example cannot hold yet.` };
    values[name] = candidates(types[name], u);
  }
  const rules = item.rules.map((r) => ({ when: rewrite(r.when), result: r.result }));
  const decisionName = pascal(item.name);

  // Evaluate the recovered rule to choose examples where it changes its answer.
  const canonical = parseIntent([`decision ${decisionName}`, '  inputs', ...names.map((n) => `    ${n}`),
    ...rules.flatMap((r, i) => [`  rule r${i + 1}`, `    when ${r.when}`, `    return ${r.result}`]), '  default', `    return ${item.otherwise.result}`].join('\n')).decisions[0];
  const run = (a) => evaluateDecision(canonical, a);
  const all = assignments(names, values).map((a) => ({ a, r: run(a) }));
  return { ok: true, notes, refs, renames, names, types, values, rules, decisionName, canonical, run, all };
}

/**
 * Turn a decision item from readCode/readRepo into a readable contract.
 * Returns { ok: true, source, name, examples, notes } or { ok: false, reason }.
 */
export function promoteDecision(item, { file = item.file || '' } = {}) {
  const model = recoverModel(item);
  if (!model.ok) return model;
  const { notes, refs, renames, names, types, rules, decisionName, run, all } = model;
  const results = [...item.rules.map((r) => r.result), item.otherwise.result];
  const chosen = [];
  const key = (a) => names.map((n) => lit(a[n])).join('|');
  const add = (a, label) => {
    if (chosen.length >= 10 || chosen.some((c) => key(c.a) === key(a) || c.label === label)) return;
    chosen.push({ a, label, result: run(a).result });
  };
  // One example per rule (and the fallback), in rule order.
  rules.forEach((r, i) => { const hit = all.find((x) => x.r.matched === `r${i + 1}`); if (hit) add(hit.a, `when ${sayCondition(r.when)}`); });
  const fallback = all.find((x) => x.r.matched === 'default');
  if (fallback) add(fallback.a, 'when no rule matches');
  // Both sides of each numeric threshold, where the answer changes.
  for (const [path, u] of refs) {
    const name = renames.get(path) ?? path;
    if (types[name] !== 'number') continue;
    for (const n of u.numbers) {
      const step = Number.isInteger(n) ? 1 : 0.01;
      for (const x of all) {
        if (x.a[name] !== n) continue;
        for (const [v, word] of [[Math.round((n - step) * 100) / 100, 'just below'], [Math.round((n + step) * 100) / 100, 'just above']]) {
          const y = all.find((z) => z.a[name] === v && names.every((m) => m === name || z.a[m] === x.a[m]));
          if (y && y.r.result !== x.r.result) { add(x.a, `${name} exactly ${n}`); add(y.a, `${name} ${word} ${n}`); }
        }
        if (chosen.some((c) => c.label === `${name} exactly ${n}`)) break;
      }
    }
  }
  const unreached = rules.filter((_, i) => !all.some((x) => x.r.matched === `r${i + 1}`)).map((r) => r.when);
  for (const w of unreached) notes.push(`No example reaches the rule "${sayCondition(w)}"; an earlier rule always answers first, or the examples need other values.`);

  const outcomes = [...new Set(results)];
  const sig = names.map((n) => `${n}: ${types[n]}`).join(', ');
  const where = file ? `${file} line ${item.line}` : `line ${item.line}`;
  const source = [
    `# Recovered from ${where} by thunder read. Inferred from code, not written by a person.`,
    '# The examples record what the code does today. Confirm each answer, or change it where the code is wrong.',
    ...notes.map((n) => `# ${n}`),
    `contract ${decisionName}`,
    `purpose ${decisionName} decides between ${outcomes.length === 2 ? outcomes.join(' and ') : `${outcomes.slice(0, -1).join(', ')}, and ${outcomes[outcomes.length - 1]}`}. Confirm what it is for.`,
    '',
    `decision ${decisionName}(${sig})`,
    ...rules.map((r) => `  when ${r.when} -> ${r.result}`),
    `  otherwise -> ${item.otherwise.result}`,
    '',
    `examples ${decisionName}`,
    ...chosen.map((c) => `  case "${c.label.replace(/"/g, '')}": (${names.map((n) => `${n}: ${lit(c.a[n])}`).join(', ')}) -> ${c.result}`),
    '',
  ].join('\n');
  return { schema: PROMOTE_SCHEMA, ok: true, name: decisionName, source, examples: chosen.length, notes };
}
