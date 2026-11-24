// Thunder write: change a rule in the Thunder picture and only the matching code changes.
//
// A recovered decision reads "if amount is at most 100, the answer is Approve". Thunder write lets a person
// change a number (100 -> 75), a comparison (at most -> under), a text value ("gold" -> "platinum"), or an
// answer (Approve -> Review), and writes exactly those characters back into the original file, keeping the
// file's own spelling (=== stays ===, 100.0 stays a decimal, 100m keeps its suffix, quotes keep their style).
//
// Every write is checked by reading the file again: the edited rule must now read exactly as intended, and
// every other rule, answer, and function in the file must read exactly as before. Otherwise nothing changes.
// It also runs the old and the new rule on boundary inputs and lists the cases whose answer changes.
//
// Deterministic and browser-safe. It edits text only; it never runs the code it edits.
import { readCode, sayCondition } from './read.mjs';
import { tokenize } from './expr.mjs';
import { recoverModel } from './promote.mjs';

export const WRITE_SCHEMA = 'thunder-write-v1';

const CMP = new Set(['<', '<=', '>', '>=', '==', '!=']);
const editable = (t) => t.t === 'num' || t.t === 'str' || (t.t === 'op' && CMP.has(t.v));
const category = (t) => (t.t === 'op' ? 'cmp' : t.t);
const sameTok = (a, b) => a.t === b.t && a.v === b.v;
const normWhen = (w) => tokenize(w).map((t) => (t.t === 'str' ? JSON.stringify(t.v) : String(t.v))).join(' ');

const COMMENT = { python: ['#'], ruby: ['#'], php: ['#', '//', '/*'], r: ['#'], shell: ['#'], powershell: ['<#', '#'] };
const commentStarts = (language) => COMMENT[language] || ['//', '/*'];

/** Numbers, comparison operators, and text literals in a slice of the original file, with exact offsets. */
function scanSource(source, from, to, language) {
  const out = [];
  const starts = commentStarts(language);
  let i = from;
  while (i < to) {
    const c = source[i];
    if (starts.some((s) => source.startsWith(s, i))) {
      if (source.startsWith('/*', i)) { const j = source.indexOf('*/', i + 2); i = j < 0 ? to : j + 2; }
      else if (source.startsWith('<#', i)) { const j = source.indexOf('#>', i + 2); i = j < 0 ? to : j + 2; }
      else { const j = source.indexOf('\n', i); i = j < 0 ? to : j; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c && source[j] !== '\n') j += source[j] === '\\' ? 2 : 1;
      if (source[j] === c) out.push({ t: 'str', v: source.slice(i + 1, j), start: i, end: j + 1, raw: source.slice(i, j + 1), quote: c });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) { // identifiers (and digits inside them) are not values
      let j = i;
      while (j < to && /[A-Za-z0-9_$]/.test(source[j])) j++;
      out.push({ t: 'id', v: source.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = source.slice(i, to).match(/^[0-9][0-9_]*(\.[0-9][0-9_]*)?([eE][+-]?[0-9]+)?(f64|f32|i32|i64|u32|u64|[fFdDmMlLuU]{0,2})/);
      const raw = m[0];
      const suffix = m[3] || '';
      out.push({ t: 'num', v: Number(raw.slice(0, raw.length - suffix.length).replace(/_/g, '')), start: i, end: i + raw.length, raw, suffix, decimal: !!m[1] });
      i += raw.length;
      continue;
    }
    const op = ['===', '!==', '<=>', '==', '!=', '<=', '>=', '->', '=>', '<<', '>>', '<-', '<', '>'].find((o) => source.startsWith(o, i));
    if (op) {
      if (!['<=>', '->', '=>', '<<', '>>', '<-'].includes(op)) out.push({ t: 'op', v: op === '===' ? '==' : op === '!==' ? '!=' : op, start: i, end: i + op.length, raw: op });
      i += op.length;
      continue;
    }
    i++;
  }
  return out;
}

const matches = (src, t) => src.t === t.t && (t.t === 'num' ? src.v === t.v : src.v === t.v);

/** Find the source tokens that are the rule's numbers, comparisons, and text, in order. */
function locate(srcToks, wanted) {
  const found = [];
  let k = 0;
  for (const s of srcToks) {
    if (k < wanted.length && matches(s, wanted[k])) { found.push(s); k++; }
  }
  return k === wanted.length ? found : null;
}

function spell(srcTok, next) {
  if (next.t === 'op') {
    if (srcTok.raw === '===' || srcTok.raw === '!==') return next.v === '==' ? '===' : next.v === '!=' ? '!==' : next.v;
    return next.v;
  }
  if (next.t === 'num') {
    let s = String(next.v);
    if (srcTok.decimal && Number.isInteger(next.v)) s += '.0';
    return s + srcTok.suffix;
  }
  return srcTok.quote + next.v + srcTok.quote;
}

const lineStartsOf = (source) => { const out = [0]; for (let i = 0; i < source.length; i++) if (source[i] === '\n') out.push(i + 1); return out; };

function findDecision(reading, name, line) {
  const ds = reading.items.filter((i) => i.kind === 'decision' && i.name === name);
  if (!ds.length) return null;
  if (line == null) return ds[0];
  return ds.reduce((best, d) => (Math.abs(d.line - line) < Math.abs(best.line - line) ? d : best));
}

// The character range of a rule (its condition line through the line before the next rule or the fallback).
function ruleRegion(source, decision, index) {
  const starts = lineStartsOf(source);
  const lines = [...decision.rules.map((r) => r.line), decision.otherwise.line];
  const first = index === 'otherwise' ? decision.otherwise.line : decision.rules[index].line;
  const later = lines.filter((l) => l > first);
  const last = index === 'otherwise' ? first : Math.max(first, (later.length ? Math.min(...later) : first + 1) - 1);
  return [starts[first - 1] ?? source.length, starts[last] != null ? starts[last] - 1 : source.length];
}

const view = (it) => JSON.stringify({ kind: it.kind, name: it.name, says: it.says, thunder: it.thunder, rules: it.rules?.map((r) => [r.when, r.result]), otherwise: it.otherwise?.result, guards: it.guards?.map((g) => g.says ?? g.when) });

/**
 * Change one rule of a recovered decision and write it back to the original code.
 *
 *   rule: 1-based rule number, or 'otherwise' for the fallback answer.
 *   when: the rule's new condition, in Thunder form (amount < 75). Numbers, comparisons, and text may change.
 *   answer: the rule's new answer (Review).
 *
 * Returns { schema, ok, source, problems, change, before, after, cases }. When ok is false, `source` is the
 * original, untouched, and `problems` says why in plain words.
 */
export function writeRule({ source, language, file = '', decision: name, line = null, rule, when = null, answer = null }) {
  const fail = (...problems) => ({ schema: WRITE_SCHEMA, ok: false, source, problems });
  if (when == null && answer == null) return fail('Say what to change: a new condition (when) or a new answer.');
  const reading = readCode(source, { language, file });
  const lang = reading.language;
  const d = findDecision(reading, name, line);
  if (!d) return fail(`No decision named ${name} was found. Thunder write changes decisions: functions that choose between fixed answers.`);
  const index = rule === 'otherwise' ? 'otherwise' : Number(rule) - 1;
  if (index !== 'otherwise' && !(Number.isInteger(index) && d.rules[index])) return fail(`${name} has ${d.rules.length} rule${d.rules.length === 1 ? '' : 's'}; there is no rule ${rule}.`);
  if (index === 'otherwise' && when != null) return fail('The fallback answer has no condition to change. Change its answer instead.');
  const target = index === 'otherwise' ? d.otherwise : d.rules[index];
  const [from, to] = ruleRegion(source, d, index);
  const srcToks = scanSource(source, from, to, lang);
  const edits = []; // { start, end, text }

  // 1. The condition: only numbers, comparisons, and text values may change; the shape must stay the same.
  let newWhen = target.when;
  if (when != null) {
    let oldT, newT;
    try { oldT = tokenize(target.when); newT = tokenize(when); } catch (e) { return fail(`The new condition could not be read: ${e.message}`); }
    const structural = oldT.length !== newT.length || oldT.some((t, i) => !sameTok(t, newT[i]) && !(editable(t) && editable(newT[i]) && category(t) === category(newT[i])));
    if (structural) return fail(`Thunder write can change a number, a comparison, or a text value in a rule. "${when}" also changes the rule's shape (names, and/or, or parentheses). Use Propose rule change for that.`);
    const wanted = oldT.filter(editable);
    const found = locate(srcToks, wanted);
    if (!found) return fail(`The values in "${sayCondition(target.when)}" could not be found exactly in the code at line ${target.line}, so it is not safe to write them back.`);
    let k = 0;
    oldT.forEach((t, i) => {
      if (!editable(t)) return;
      const s = found[k++];
      const next = newT[i];
      if (sameTok(t, next)) return;
      if (next.t === 'str' && (next.v.includes(s.quote) || next.v.includes('\\'))) return edits.push({ bad: `The text ${JSON.stringify(next.v)} contains a quote or backslash; write it in the code directly.` });
      edits.push({ start: s.start, end: s.end, text: spell(s, next), was: s.raw });
    });
    newWhen = normWhen(when);
  }

  // 2. The answer: reuse a spelling this function already returns, or change the text of a string answer.
  if (answer != null && answer !== target.result) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(answer)) return fail(`The answer must be a name such as Approve or Review; "${answer}" is not.`);
    const reads = (t, result) => (t.t === 'str' && t.v === result) || (t.t === 'id' && t.v === result);
    const sites = srcToks.filter((t) => reads(t, target.result));
    if (sites.length !== 1) return fail(`The answer ${target.result} could not be found exactly once near line ${target.line}, so it is not safe to change.`);
    const site = sites[0];
    // An answer spelled elsewhere in this decision, for example Decision.REVIEW or "Review".
    const others = [...d.rules.map((_, i) => i), 'otherwise'].filter((i) => i !== index && (i === 'otherwise' ? d.otherwise : d.rules[i]).result === answer);
    let text = null;
    for (const i of others) {
      const [a, b] = ruleRegion(source, d, i);
      const t = scanSource(source, a, b, lang).find((x) => reads(x, answer));
      if (t && t.t === site.t) { text = t.raw ?? t.v; break; }
    }
    if (text == null && site.t === 'str') text = site.quote + answer + site.quote;
    if (text == null) return fail(`${name} does not return ${answer} anywhere yet, and its answers are code names (such as ${site.v}), so Thunder write will not invent one. Add ${answer} in the code first, or use Propose rule change.`);
    edits.push({ start: site.start, end: site.end, text, was: site.raw ?? site.v });
  }

  const bad = edits.find((e) => e.bad);
  if (bad) return fail(bad.bad);
  const real = edits.filter((e) => source.slice(e.start, e.end) !== e.text).sort((a, b) => b.start - a.start);
  if (!real.length) return fail('Nothing would change: the rule already reads that way.');
  let next = source;
  for (const e of real) next = next.slice(0, e.start) + e.text + next.slice(e.end);

  // 3. Verify by reading the file again.
  const problems = [];
  let after;
  try { after = readCode(next, { language: lang, file }); } catch (e) { return fail(`The changed file could not be read: ${e.message}`); }
  const d2 = findDecision(after, name, d.line);
  if (!d2) return fail(`${name} is no longer read as a decision after the change.`);
  const wantResult = answer ?? target.result;
  if (d2.rules.length !== d.rules.length) problems.push('The number of rules changed.');
  d.rules.forEach((r, i) => {
    const r2 = d2.rules[i];
    if (!r2) return;
    const w = i === index ? newWhen : normWhen(r.when);
    const res = i === index ? wantResult : r.result;
    if (normWhen(r2.when) !== w) problems.push(`Rule ${i + 1} reads "${sayCondition(r2.when)}" after the change, not "${sayCondition(w)}".`);
    if (r2.result !== res) problems.push(`Rule ${i + 1} answers ${r2.result} after the change, not ${res}.`);
  });
  const wantOtherwise = index === 'otherwise' ? wantResult : d.otherwise.result;
  if (d2.otherwise?.result !== wantOtherwise) problems.push(`The fallback answers ${d2.otherwise?.result} after the change, not ${wantOtherwise}.`);
  const others = reading.items.filter((i) => i !== d), others2 = after.items.filter((i) => i !== d2);
  if (others.length !== others2.length) problems.push('Another part of the file reads differently after the change.');
  else others.forEach((o, i) => { if (view(o) !== view(others2[i])) problems.push(`${o.name} (line ${o.line}) reads differently after the change.`); });
  if (problems.length) return fail(...problems);

  const starts = lineStartsOf(source);
  const lineOf = (off) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= off) lo = m; else hi = m - 1; } return lo + 1; };
  const change = real.slice().reverse().map((e) => ({ line: lineOf(e.start), column: e.start - starts[lineOf(e.start) - 1] + 1, before: e.was, after: e.text }));
  const label = (r) => (r === 'otherwise' ? 'Otherwise' : `If ${sayCondition(r.when)}`);
  const beforeRule = index === 'otherwise' ? `Otherwise, the answer is ${target.result}` : `${label(target)}, the answer is ${target.result}`;
  const afterRule = index === 'otherwise' ? `Otherwise, the answer is ${wantResult}` : `If ${sayCondition(newWhen)}, the answer is ${wantResult}`;
  return { schema: WRITE_SCHEMA, ok: true, source: next, problems: [], decision: name, rule: index === 'otherwise' ? 'otherwise' : index + 1, change, before: beforeRule, after: afterRule, cases: changedCases(d, d2) };
}

/**
 * Run the old and the new decision on the same boundary inputs (both sides of every threshold, every text
 * value) and list the inputs whose answer changes. This covers the inputs checked, not every possible input.
 */
export function changedCases(before, after) {
  const a = recoverModel(before, { extraConditions: after.rules.map((r) => r.when) });
  const b = recoverModel(after, { extraConditions: before.rules.map((r) => r.when) });
  if (!a.ok || !b.ok) return { checked: 0, changed: [], note: `The cases could not be compared: ${(a.ok ? b : a).reason}` };
  const lookup = new Map(b.all.map((x) => [JSON.stringify(x.a), x.r.result]));
  const changed = [];
  for (const x of a.all) {
    const next = lookup.get(JSON.stringify(x.a));
    if (next !== undefined && next !== x.r.result) changed.push({ inputs: x.a, before: x.r.result, after: next });
  }
  return { checked: a.all.length, changed, note: `Checked ${a.all.length} boundary input${a.all.length === 1 ? '' : 's'}; ${changed.length} now get${changed.length === 1 ? 's' : ''} a different answer. These are the values on each side of every limit, not every possible input.` };
}

const CMP_WORDS = { '<=': 'at most', '<': 'less than', '>=': 'at least', '>': 'more than', '==': 'is', '!=': 'is not' };
/** The comparisons a person can choose between, in plain words. */
export const COMPARISON_CHOICES = Object.entries(CMP_WORDS).map(([op, words]) => ({ op, words }));

/**
 * A rule's condition split into the parts a person sees: names and words stay fixed; numbers, comparisons, and
 * text values can change. Joining the parts back with `joinRuleParts` gives a condition `writeRule` accepts.
 */
export function ruleParts(when) {
  return tokenize(when).map((t) => {
    if (t.t === 'num') return { kind: 'number', value: t.v };
    if (t.t === 'str') return { kind: 'text', value: t.v };
    if (t.t === 'op' && CMP.has(t.v)) return { kind: 'comparison', value: t.v, words: CMP_WORDS[t.v] };
    if (t.t === 'bool') return { kind: 'fixed', value: String(t.v), words: String(t.v) };
    if (t.t === 'kw') return { kind: 'fixed', value: t.v, words: t.v };
    return { kind: 'fixed', value: String(t.v), words: String(t.v) };
  });
}

export function joinRuleParts(parts) {
  return parts.map((p) => (p.kind === 'text' ? JSON.stringify(String(p.value)) : String(p.value))).join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');
}
