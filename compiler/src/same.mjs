// thunder same: does new code mean the same as old code? Reads both (in any languages Thunder reads), pairs their
// functions by name, and compares their Thunder. Rules are compared by RUNNING both on the same inputs (every edge
// value either rule mentions), not by comparing text, so a rewritten condition that gives the same answers counts as
// the same, and a changed limit is caught with a counterexample. Browser-safe: takes [{ path, source }].
import { readCode } from './read.mjs';
import { readableLanguage, readingOf } from './read-repo.mjs';
import { plainFromReading, explainPlain } from './plain-contract.mjs';
import { visualFor } from './visual.mjs';

export const SAME_SCHEMA = 'thunder-same-v1';
const MAX_CASES = 4096;

/** Names written in any convention compare equal: delivery_fee, deliveryFee, DeliveryFee. */
export const nameKey = (name) => String(name).replace(/[_\s-]/g, '').toLowerCase();
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// A function is identified by its file's stem and its name (and which occurrence, for repeated names such as
// __init__), written in any convention: app/delivery.py#delivery_fee pairs with app/delivery.ts#deliveryFee.
const stemKey = (path) => nameKey(String(path).replace(/\.[^./]+$/, '').replace(/\\/g, '/'));

// Only what compareItems needs is kept, so comparing a whole app does not hold every reading in memory: rules keep
// their item (their answers are run), lists of steps keep only their flattened signatures and text.
function compact(it, key, file, language) {
  const base = { key, file, language, name: it.name, kind: it.kind, line: it.line, route: it.route, element: visualFor(it).element };
  return it.kind === 'decision' ? { ...it, ...base } : { ...base, flat: flatSteps(it.steps) };
}

function readAll(files) {
  const items = new Map(), byName = new Map(), unreadable = [];
  for (const f of files) {
    const language = readableLanguage(f.path, String(f.source ?? '').slice(0, 2048));
    if (!language || !f.source) continue;
    let reading;
    try { reading = readingOf(f, language); } catch (e) { unreadable.push({ path: f.path, reason: e.message }); continue; }
    const seen = new Map();
    for (const it of reading.items) {
      if (it.kind !== 'decision' && it.kind !== 'function') continue;
      const n = nameKey(it.name);
      const nth = (seen.get(n) || 0) + 1; seen.set(n, nth);
      const key = `${stemKey(f.path)}#${n}${nth > 1 ? `#${nth}` : ''}`;
      items.set(key, compact(it, key, f.path, language));
      byName.set(n, byName.has(n) ? null : key); // null marks a name used more than once
    }
  }
  return { items, byName, unreadable };
}

/** Every value worth trying for each input: each limit either rule uses, one either side of it, and 0. */
function caseValues(models) {
  const byInput = new Map();
  for (const m of models) for (const input of m.inputs) {
    if (!byInput.has(input.id)) byInput.set(input.id, { kind: input.kind, values: new Set() });
    const slot = byInput.get(input.id);
    if (input.kind === 'yesno') { slot.values.add(true); slot.values.add(false); }
  }
  for (const m of models) for (const r of m.rules) for (const c of r.conditions) {
    const slot = byInput.get(c.input);
    if (!slot || slot.kind === 'yesno' || typeof c.value !== 'number') continue;
    for (const v of [c.value - 1, c.value, c.value + 1, c.value - 0.01, c.value + 0.01]) slot.values.add(Math.round(v * 100) / 100);
  }
  for (const slot of byInput.values()) if (slot.kind !== 'yesno') slot.values.add(0);
  return [...byInput.entries()].map(([id, s]) => [id, [...s.values].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0))]);
}

function* product(axes, i = 0, acc = {}) {
  if (i === axes.length) { yield { ...acc }; return; }
  const [id, values] = axes[i];
  for (const v of values) { acc[id] = v; yield* product(axes, i + 1, acc); }
}

/** Compare two rules by running both on every edge case. Returns { same, tried, counterexample? }. */
export function compareRules(oldItem, newItem) {
  let a, b;
  try { a = plainFromReading(oldItem); b = plainFromReading(newItem); } catch { a = b = null; }
  if (!a || !b) return null;
  // Inputs are matched by meaning (their readable label), not by spelling: distance_km and distanceKm are one fact.
  const key = (i) => `${nameKey(i.label)}:${i.kind}`;
  const toA = new Map(a.inputs.map((i) => [key(i), i.id]));
  if (a.inputs.length !== b.inputs.length || !b.inputs.every((i) => toA.has(key(i)))) {
    return { same: false, tried: 0, reason: `They need different facts: ${a.inputs.map((i) => i.label).join(', ')} versus ${b.inputs.map((i) => i.label).join(', ')}.` };
  }
  const bAsA = { ...b, inputs: b.inputs.map((i) => ({ ...i, id: toA.get(key(i)) })), rules: b.rules.map((r) => ({ ...r, conditions: r.conditions.map((c) => ({ ...c, input: toA.get(key(b.inputs.find((i) => i.id === c.input))) })) })) };
  let tried = 0;
  for (const values of product(caseValues([a, bAsA]))) {
    if (++tried > MAX_CASES) { tried--; break; }
    const x = explainPlain(a, values).outcome, y = explainPlain(bAsA, values).outcome;
    if (x !== y) return { same: false, tried, counterexample: { values: { ...values }, facts: a.inputs.map((i) => `${i.label} ${i.kind === 'yesno' ? (values[i.id] ? i.yes ?? 'yes' : i.no ?? 'no') : values[i.id]}`).join(', '), old: x, new: y } };
  }
  return { same: true, tried };
}

// Each step flattened in reading order: `sig` is what is compared (kind and wording, case- and punctuation-blind),
// `text` is what a person is shown. Code that is not explained compares as code, never by its wording.
// A step's code as a language-neutral signature: its names (any convention: delivery_fee = deliveryFee), operators,
// and values, without syntax (const, let, def, semicolons, braces). Two steps whose words match but whose signatures
// differ are not proven the same: a + b and a - b read alike in short words, and must never be called "same".
// Control words are syntax here: the step's kind (a question, a repeat) already carries their meaning.
const SYNTAX = new Set('const let var val final auto def fn func function return await async new public private protected static self this my local export mut ref out in of for foreach if elif elsif while do then end each as range'.split(' '));
const OPS = { '&&': 'and', '||': 'or', '!': 'not', '===': '==', '!==': '!=', '<>': '!=', '**': '^', and: 'and', or: 'or', not: 'not', is: '==', None: 'null', nil: 'null', undefined: 'null', NULL: 'null', nullptr: 'null', True: 'true', False: 'false' };
export function stepSignature(code) {
  const t = String(code || '').replace(/(\/\/|#)[^\n]*$/gm, '');
  const toks = t.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|-?\d+(?:\.\d+)?|[A-Za-z_$][\w$]*|===|!==|==|!=|<=|>=|&&|\|\||\*\*|<>|[-+*\/%<>=!]/g) || [];
  return toks.filter((x) => !SYNTAX.has(x)).map((x) => OPS[x] ?? (/^["'`]/.test(x) ? `"${x.slice(1, -1)}"` : /^[A-Za-z_$]/.test(x) ? x.replace(/[_$]/g, '').toLowerCase() : x)).join(' ');
}
const flatSteps = (steps, depth = 0) => (steps || []).flatMap((s) => [
  { sig: `${depth}:${s.restates ? 'code' : s.kind}:${s.restates || s.kind === 'other' ? '' : norm(s.says)}`, code: stepSignature(s.code), raw: String(s.code ?? ''), text: s.restates || s.kind === 'other' ? `\`${s.code ?? s.says}\`` : s.says },
  ...flatSteps(s.children, depth + 1),
]);

function compareItems(o, n) {

  const where = { old: { file: o.file, line: o.line, language: o.language }, new: { file: n.file, line: n.line, language: n.language } };
  if (o.element === 'not-read' || n.element === 'not-read') return { status: 'cannot-check', reason: 'Thunder cannot read one side yet, so it cannot confirm they mean the same.', ...where };
  if (o.kind !== n.kind) return { status: 'different', reason: `One is a ${o.kind === 'decision' ? 'rule' : 'list of steps'}, the other is a ${n.kind === 'decision' ? 'rule' : 'list of steps'}.`, ...where };
  if ((o.route?.method || '') !== (n.route?.method || '') || (o.route?.path || '') !== (n.route?.path || '')) {
    return { status: 'different', reason: `The address changed: ${o.route ? `${o.route.method} ${o.route.path}` : 'none'} became ${n.route ? `${n.route.method} ${n.route.path}` : 'none'}.`, ...where };
  }
  if (o.kind === 'decision') {
    const r = compareRules(o, n);
    if (!r) return { status: 'cannot-check', reason: 'One rule could not be drawn as a card, so its answers could not be compared.', ...where };
    if (r.same) return { status: 'same', reason: `Same answer on all ${r.tried} edge cases.`, ...where };
    if (r.counterexample) {
      const facts = r.counterexample.facts;
      return { status: 'different', reason: `Different answer for ${facts}: ${r.counterexample.old} before, ${r.counterexample.new} after.`, counterexample: r.counterexample, ...where };
    }
    return { status: 'different', reason: r.reason, ...where };
  }
  const so = o.flat, sn = n.flat;
  const at = so.findIndex((s, i) => s.sig !== sn[i]?.sig);
  if (at === -1 && so.length === sn.length) {
    // Same words is not proof: the code under them must say the same too (names, operators, values).
    const differs = so.findIndex((s, i) => s.code && sn[i].code && s.code !== sn[i].code);
    if (differs >= 0) return { status: 'cannot-check', reason: `Thunder reads these the same, but the code differs at step ${differs + 1}: \`${so[differs].raw.trim()}\` before, \`${sn[differs].raw.trim()}\` after. Check this step.`, ...where };
    return { status: 'same', reason: `Same ${so.length} steps.`, ...where };
  }
  const i = at === -1 ? Math.min(so.length, sn.length) : at;
  return { status: 'different', reason: `Steps differ from step ${i + 1}: "${so[i]?.text ?? '(nothing)'}" became "${sn[i]?.text ?? '(nothing)'}".`, ...where };
}

/**
 * Compare old and new code. Returns { verdict, counts, items } where each item is same, different, only-old,
 * only-new, or cannot-check. The verdict is 'same' only when nothing differs and nothing went unchecked.
 */
export function sameMeaning(oldFiles, newFiles) {
  const A = readAll(oldFiles), B = readAll(newFiles);
  const items = [], used = new Set();
  // Pair by file and name first; if the file was renamed, fall back to a name that is unique on both sides.
  const partner = (key, o) => {
    if (B.items.has(key) && !used.has(key)) return key;
    const n = nameKey(o.name), a = A.byName.get(n), b = B.byName.get(n);
    return a && b && !used.has(b) ? b : null;
  };
  for (const [key, o] of A.items) {
    const k = partner(key, o);
    if (k) used.add(k);
    const n = k && B.items.get(k);
    items.push({ name: o.name, ...(n ? compareItems(o, n) : { status: 'only-old', reason: 'Not found in the new code.', old: { file: o.file, line: o.line, language: o.language } }) });
  }
  for (const [key, n] of B.items) if (!used.has(key)) items.push({ name: n.name, status: 'only-new', reason: 'New: not in the old code.', new: { file: n.file, line: n.line, language: n.language } });
  const counts = { same: 0, different: 0, 'only-old': 0, 'only-new': 0, 'cannot-check': 0 };
  for (const it of items) counts[it.status]++;
  const verdict = counts.different || counts['only-old'] || counts['only-new'] ? 'different' : counts['cannot-check'] ? 'partly-checked' : 'same';
  return { schema: SAME_SCHEMA, verdict, counts, items, unreadable: [...A.unreadable, ...B.unreadable] };
}

export function renderSame(r) {
  const head = r.verdict === 'same' ? 'Same meaning.' : r.verdict === 'partly-checked' ? 'No differences found, but some parts could not be checked.' : 'Different meaning.';
  const lines = [`${head} ${r.counts.same} same, ${r.counts.different} different, ${r.counts['only-old']} only in the old code, ${r.counts['only-new']} only in the new code, ${r.counts['cannot-check']} not checked.`];
  const order = ['different', 'only-old', 'only-new', 'cannot-check', 'same'];
  const label = { different: 'different', 'only-old': 'only old', 'only-new': 'only new', 'cannot-check': 'not checked', same: 'same' };
  for (const st of order) for (const it of r.items.filter((x) => x.status === st)) {
    const loc = [it.old && `${it.old.file}:${it.old.line}`, it.new && `${it.new.file}:${it.new.line}`].filter(Boolean).join(' → ');
    lines.push(`  ${label[st].padEnd(11)} ${it.name}  (${loc})  ${it.reason}`);
  }
  return `${lines.join('\n')}\n`;
}
