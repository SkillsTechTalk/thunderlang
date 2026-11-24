// thunder review: what a change did to the MEANING of the code, in plain sentences, so a pull request can be reviewed
// without reading the code diff. Both versions are read into the Thunder model (model.mjs); each action, rule, and
// function is paired with its other version (by file and name, then by name, then by meaning), and the facts a
// reviewer checks are compared: the ways it stops and when, what it gives back, what it takes, what it changes or
// sends, what it relies on, and, for rules, their answers (by running both on every edge case, as `thunder same`).
//
// Honest by design: "same" or "only the form changed" is said only when it is shown: the code is identical apart
// from spacing and comments, or only local names changed, or a rule gives the same answer on every edge case. When
// Thunder's words read the same but the code differs, that is said too ("changed, check"), because Thunder's words
// leave some details out. Pure and browser-safe: takes [{ path, source }] for each side; the CLI does the git work.
import { thunderModel, readLevel, modelText } from './model.mjs';
import { comparePlainRules, nameKey } from './same.mjs';
import { readableLanguage } from './read-repo.mjs';

export const REVIEW_SCHEMA = 'thunder-review-v1';
export const REVIEW_MARKER = '<!-- thunder-review -->';

const SEVERITY_ORDER = ['risk', 'meaning', 'form'];
// Within a severity, what a reviewer should read first.
const KIND_ORDER = ['unreadable', 'not-read', 'infrastructure', 'stop-removed', 'stop-changed', 'address', 'effect-added', 'stop-added',
  'rule-limit', 'rule-answer', 'rule-new-answer', 'rule-removed-answer', 'rule-facts', 'input-added', 'input-removed',
  'gives-back-added', 'gives-back-removed', 'gives-back-changed', 'effect-removed', 'effect-changed', 'relies-on', 'hidden',
  'steps', 'outside', 'added', 'removed', 'thing', 'renamed', 'moved', 'form'];

const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const lc = (s) => (s && !/^[A-Z]{2}|^[A-Z]\w*[A-Z_]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const answerWords = (r) => (/^true$/i.test(r) ? 'Yes' : /^false$/i.test(r) ? 'No' : cap(words(r)));
const stemKey = (path) => nameKey(String(path).replace(/\.[^./]+$/, '').replace(/\\/g, '/'));
const KIND_WORD = { action: 'action', rule: 'rule', steps: 'function', setup: 'setup', 'not-read': 'function' };

// ── Tokens: the code without spacing and comments, so "only the form changed" can be shown, not guessed ──────────

const HASH_COMMENTS = new Set(['python', 'ruby', 'php']);
const SLASH_COMMENTS = new Set(['typescript', 'javascript', 'go', 'rust', 'csharp', 'java', 'kotlin', 'php']);
const DECLARE = new Set(['const', 'let', 'var', 'val', 'def', 'fn', 'func', 'function', 'auto', 'my', 'local', 'for', 'as']);

/** The code as tokens ({ t, k }: k is id, str, num, op, nl, indent, dedent). Spacing and comments are not tokens. */
export function codeTokens(src, language) {
  const out = [];
  const s = String(src ?? '');
  const py = language === 'python';
  const stack = [0];
  let depth = 0, lineStart = true;
  const push = (t, k) => out.push({ t, k });
  const nl = () => { if (out.length && out.at(-1).k !== 'nl' && out.at(-1).k !== 'indent' && out.at(-1).k !== 'dedent') push('\n', 'nl'); };
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (lineStart && py && depth === 0) {
      // Python: indentation is meaning, so it is kept as indent / dedent tokens (blank and comment lines skipped).
      let j = i, w = 0;
      while (s[j] === ' ' || s[j] === '\t') { w += s[j] === '\t' ? 8 : 1; j++; }
      if (s[j] !== '\n' && s[j] !== '\r' && s[j] !== '#' && j < s.length) {
        if (w > stack.at(-1)) { stack.push(w); push('', 'indent'); }
        while (w < stack.at(-1)) { stack.pop(); push('', 'dedent'); }
      }
      lineStart = false; i = j; continue;
    }
    if (c === '\n') { if (depth === 0) nl(); lineStart = true; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (SLASH_COMMENTS.has(language) && c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (SLASH_COMMENTS.has(language) && c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; }
    if (HASH_COMMENTS.has(language) && c === '#' && !(language === 'php' && s[i + 1] === '[')) { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (language === 'sql' && c === '-' && s[i + 1] === '-') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (language === 'sql' && c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const triple = py && s.slice(i, i + 3) === c.repeat(3);
      const q = triple ? c.repeat(3) : c;
      let j = i + q.length;
      while (j < s.length && s.slice(j, j + q.length) !== q) j += s[j] === '\\' ? 2 : 1;
      push(s.slice(i, j + q.length), 'str'); i = j + q.length; continue;
    }
    const num = s.slice(i).match(/^\d[\w.]*/);
    if (num) { push(num[0], 'num'); i += num[0].length; continue; }
    const id = s.slice(i).match(/^[A-Za-z_$@][\w$]*/);
    if (id) { push(id[0], 'id'); i += id[0].length; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
    push(c, 'op'); i++;
  }
  nl();
  // A Python string standing alone on its line is a docstring: a note for people, not something the code does.
  if (py) return out.filter((tk, i) => !(tk.k === 'str' && (i === 0 || ['nl', 'indent', 'dedent'].includes(out[i - 1].k)) && (!out[i + 1] || out[i + 1].k === 'nl')));
  return out;
}

const sameTokens = (a, b) => a.length === b.length && a.every((x, i) => x.t === b[i].t);

/**
 * Two token lists that differ only by a consistent renaming of names the code itself declares (inputs, local
 * values): [[old, new], …], or null when anything else differs. A renamed name that is also a field, a key, or a
 * named argument is not accepted, because renaming those changes what the code does.
 */
export function localRenames(a, b, language, allowed = []) {
  if (a.length !== b.length) return null;
  const fwd = new Map(), back = new Map();
  for (let i = 0; i < a.length; i++) {
    if (a[i].t === b[i].t) { if (a[i].k === 'id' && (fwd.has(a[i].t) || back.has(b[i].t)) && fwd.get(a[i].t) !== b[i].t) return null; continue; }
    if (a[i].k !== 'id' || b[i].k !== 'id') return null;
    if ((fwd.has(a[i].t) && fwd.get(a[i].t) !== b[i].t) || (back.has(b[i].t) && back.get(b[i].t) !== a[i].t)) return null;
    fwd.set(a[i].t, b[i].t); back.set(b[i].t, a[i].t);
  }
  // A name kept as-is somewhere and renamed elsewhere is not a consistent rename.
  for (let i = 0; i < a.length; i++) if (a[i].k === 'id' && a[i].t === b[i].t && fwd.has(a[i].t) && fwd.get(a[i].t) !== a[i].t) return null;
  const firstNl = a.findIndex((x) => x.k === 'nl');
  const head = firstNl < 0 ? a.length : firstNl;
  const js = language === 'typescript' || language === 'javascript';
  const localAssign = (language === 'python' || language === 'ruby') && !a.some((x) => x.t === 'global' || x.t === 'nonlocal' || x.t === '$');
  for (const name of fwd.keys()) {
    if (allowed.includes(name)) continue;
    let declared = false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].t !== name || a[i].k !== 'id') continue;
      const prev = a[i - 1]?.t, next = a[i + 1]?.t;
      if (prev === '.' || prev === '->' || prev === ':' && a[i - 2]?.t === ':') return null; // a field or a path
      if (i >= head && next === ':' && language !== 'python' && language !== 'go') return null; // an object key
      if (i >= head && next === '=' && a[i + 2]?.t !== '=' && (prev === '(' || prev === ',') && language === 'python') return null; // a named argument
      if (js && (prev === '{' || prev === ',') && (next === '}' || next === ',') && i >= head) return null; // { name } shorthand
      if (DECLARE.has(prev) || (i < head && (prev === '(' || prev === ',' || prev === '*'))) declared = true;
      // Python and Ruby: a name assigned at the start of a statement is local to the function (unless declared global).
      if (localAssign && (i === 0 || ['nl', 'indent', 'dedent'].includes(a[i - 1].k)) && next === '=' && a[i + 2]?.t !== '=') declared = true;
    }
    if (!declared) return null;
  }
  return [...fwd.entries()];
}

// ── Lines: before and after, only where they differ ──────────────────────────────────────────────────────────

/** The lines that changed, with one line of context above each change: { before: [...], after: [...] }. */
export function lineChanges(oldLines, newLines, max = 1500) {
  // Lines the same at the start and the end are not compared (one line of context is kept above the change).
  let p = 0;
  while (p < oldLines.length && p < newLines.length && oldLines[p] === newLines[p]) p++;
  let q = 0;
  while (q < oldLines.length - p && q < newLines.length - p && oldLines[oldLines.length - 1 - q] === newLines[newLines.length - 1 - q]) q++;
  const from = Math.max(0, p - 1);
  const a = oldLines.slice(from, oldLines.length - q).slice(0, max), b = newLines.slice(from, newLines.length - q).slice(0, max);
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const keepA = new Array(n).fill(false), keepB = new Array(m).fill(false);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { keepA[i] = keepB[j] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  const pick = (lines, keep) => {
    const out = [];
    lines.forEach((l, i) => {
      if (keep[i]) return;
      if (i > 0 && keep[i - 1] && !out.includes(`  ${lines[i - 1]}`) && lines[i - 1].trim()) out.push(`  ${lines[i - 1]}`);
      out.push(`> ${l}`);
    });
    return out;
  };
  return { before: pick(a, keepA), after: pick(b, keepB) };
}

/**
 * Where a function's body ends, from the code itself: the matching close brace, or (Python) the last line indented
 * under it. Null when it cannot tell. The model's own range can stop early; the review must see the whole body.
 */
function bodyEnd(lines, start, language) {
  if (language === 'python') {
    const indent = (l) => l.match(/^[ \t]*/)[0].length;
    let i = start - 1;
    // The header may span lines: it ends at the line ending with ':' outside brackets.
    let depth = 0;
    for (; i < lines.length; i++) {
      for (const c of lines[i].replace(/#.*$/, '')) depth += '([{'.includes(c) ? 1 : ')]}'.includes(c) ? -1 : 0;
      if (depth <= 0 && /:\s*(#.*)?$/.test(lines[i])) break;
    }
    const base = indent(lines[start - 1]);
    let last = i + 1;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      if (indent(lines[j]) <= base) break;
      last = j + 1;
    }
    return last;
  }
  if (language === 'ruby' || language === 'sql') return null;
  const text = lines.slice(start - 1).join('\n');
  const toks = codeTokens(text, language);
  // Count lines as we go: tokens do not carry lines, so walk the text and the brace depth together.
  let depth = 0, line = start, opened = false, q = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') { line++; continue; }
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i + 1] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); if (e < 0) return null; line += text.slice(i, e).split('\n').length - 1; i = e + 1; continue; }
    if (c === '{') { depth++; opened = true; } else if (c === '}') { depth--; if (opened && depth === 0) return line; }
    if (!opened && c === ';' && depth === 0) return line; // a declaration with no body
  }
  return toks.length ? null : null;
}

// ── Reading one side ─────────────────────────────────────────────────────────────────────────────────────────

const stripLine = (l) => l.replace(/ {2}\(line \d+\)$/, '').replace(/\s+$/, '');

function side(files) {
  const model = thunderModel(files.filter((f) => readableLanguage(f.path)));
  const sources = new Map(files.map((f) => [f.path, String(f.source ?? '')]));
  const thingName = new Map(model.things.map((t) => [t.id, t.name]));
  const members = [], byKey = new Map(), seen = new Map();
  for (const m of model.members) {
    const base = `${stemKey(m.file)}#${nameKey(thingName.get(m.owner) ?? '')}#${nameKey(m.name)}`;
    const nth = (seen.get(base) || 0) + 1; seen.set(base, nth);
    const key = nth > 1 ? `${base}#${nth}` : base;
    let text;
    try { text = modelText(model, m.id).split('\n').filter((l) => l.trim() && !/^\s*Author's note:/.test(l)).map(stripLine); } catch { text = [m.label]; }
    const all = (sources.get(m.file) ?? '').split('\n');
    const end = Math.max(m.lines[1], bodyEnd(all, m.lines[0], m.language) ?? 0);
    m.reviewLines = [m.lines[0], end];
    const lines = all.slice(m.lines[0] - 1, end);
    const entry = { key, m, model, text, sig: text.slice(1).join('\n'), code: lines, tokens: codeTokens(lines.join('\n'), m.language) };
    members.push(entry); byKey.set(key, entry);
  }
  return { model, sources, members, byKey };
}

let detailsCache = new WeakMap();
const details = (e) => {
  if (!detailsCache.has(e)) { let d; try { d = readLevel(e.model, 'details', e.m.id); } catch { d = {}; } detailsCache.set(e, d); }
  return detailsCache.get(e);
};

// ── Sentences ────────────────────────────────────────────────────────────────────────────────────────────────

function whenPart(w) {
  if (w.says) return w.says;
  const q = String(w.question).replace(/\?$/, '');
  if ((w.answer === 'Yes' || w.answer === 'No') && /\?$/.test(w.question)) return `the answer to "${w.question}" is ${w.answer.toLowerCase()}`;
  if (w.answer === 'Yes') return lc(q.replace(/^If /, ''));
  if (w.answer === 'For each') return lc(q);
  return `${lc(q)}: ${lc(w.answer)}`;
}
const whenText = (when, skip = new Set()) => {
  const parts = (when || []).filter((w) => !skip.has(w.question)).map(whenPart);
  return parts.length ? ` when ${parts.join(' and ')}` : '';
};
const stopName = (s) => `${s.error}${s.message ? ` ("${s.message}")` : ''}`;
const whenLines = (when) => (when || []).map((w) => `${w.question} ${w.answer}`);

function item(kind, severity, subject, where, says, evidence) {
  return { kind, severity, subject, where, says, ...(evidence ? { evidence } : {}) };
}
const whereOf = (e, line) => ({ file: e.m.file, line: line ?? e.m.lines[0] });
const subjectOf = (e) => (e.m.route ? e.m.route : `${e.m.label}${e.m.yesNo ? '?' : ''}`);

/** Pair two lists by a key, keeping order: [[a, b]] with a or b missing when it has no partner. */
function pairBy(as, bs, key) {
  const left = new Map();
  for (const a of as) { const k = key(a); if (!left.has(k)) left.set(k, []); left.get(k).push(a); }
  const out = [];
  for (const b of bs) { const list = left.get(key(b)); out.push([list?.length ? list.shift() : undefined, b]); }
  for (const list of left.values()) for (const a of list) out.push([a, undefined]);
  return out;
}

// ── Comparing one member with its other version ──────────────────────────────────────────────────────────────

/** A rule's answer for one value of its one number fact, read from its limits. */
const rangeAnswer = (lim, v) => lim.ranges.find((x) => (x.from == null || v >= x.from) && (x.to == null || v <= x.to))?.answer;

function ruleChanges(o, n, r, items) {
  const subject = subjectOf(n);
  const label = n.m.label + (n.m.yesNo ? '?' : '');
  const dO = details(o), dN = details(n);
  const ansLines = (d) => (d.answers || []).map((a) => `${a.answer}${a.when === 'otherwise' ? ' otherwise' : ` when ${a.when}`}`);
  const evidence = { before: ansLines(dO), after: ansLines(dN) };
  if (r.counterexample) {
    const ins = o.m.rule.inputs;
    const facts = ins.map((i) => { const v = r.counterexample.values[i.id]; return i.kind === 'yesno' ? (v ? i.yes ?? `${i.label} is yes` : i.no ?? `${i.label} is no`) : `${i.label.replace(/^the /, '')} is ${v}`; }).join(' and ');
    evidence.counterexample = { facts, before: answerWords(r.counterexample.old), after: answerWords(r.counterexample.new), values: r.counterexample.values };
  }
  let said = false;
  // Limits: the same answers in the same order, with a boundary that moved.
  if (dO.limits && dN.limits && dO.limits.fact === dN.limits.fact) {
    // A whole-number example reads better than an edge value such as 7.01: the first whole number where they differ.
    const all = [...dO.limits.ranges, ...dN.limits.ranges].flatMap((x) => [x.from, x.to]).filter((x) => x != null);
    for (let v = Math.min(...all) - 1; v <= Math.max(...all) + 1; v++) {
      const x = rangeAnswer(dO.limits, v), y = rangeAnswer(dN.limits, v);
      if (x !== y) { evidence.counterexample = { facts: `${dN.limits.fact} is ${v}`, before: x, after: y, values: { [n.m.rule.inputs[0].id]: v } }; break; }
    }
    const bounds = (lim) => lim.ranges.slice(0, -1).map((x, i) => ({ pair: `${x.answer}→${lim.ranges[i + 1].answer}`, at: x.to, left: x.answer, right: lim.ranges[i + 1].answer }));
    for (const [a, b] of pairBy(bounds(dO.limits), bounds(dN.limits), (x) => x.pair)) {
      if (a && b && a.at !== b.at) {
        items.push(item('rule-limit', 'meaning', subject, whereOf(n), `${label}: the limit between ${a.left} and ${a.right} moved from ${a.at} to ${b.at} ${dN.limits.fact}: ${a.left} now goes up to ${b.at} (was ${a.at}).`, evidence));
        said = true;
      }
    }
  }
  const before = new Set((dO.answers || []).map((a) => a.answer)), after = new Set((dN.answers || []).map((a) => a.answer));
  for (const a of after) if (!before.has(a)) { items.push(item('rule-new-answer', 'meaning', subject, whereOf(n), `${label}: can now answer ${a}.`, evidence)); said = true; }
  for (const a of before) if (!after.has(a)) { items.push(item('rule-removed-answer', 'meaning', subject, whereOf(n), `${label}: no longer answers ${a}.`, evidence)); said = true; }
  if (!said && r.counterexample) {
    const c = evidence.counterexample;
    items.push(item('rule-answer', 'meaning', subject, whereOf(n), `${label}: when ${c.facts}, it now gives ${c.after} (was ${c.before}).`, evidence));
  } else if (!said) {
    items.push(item('rule-facts', 'meaning', subject, whereOf(n), `${label}: ${lc(r.reason || 'its answers changed.')}`, evidence));
  }
}

function compareFacets(o, n, items) {
  const subject = subjectOf(n);
  const dO = details(o), dN = details(n);
  const before = items.length;
  if ((o.m.route || '') !== (n.m.route || '')) {
    items.push(item('address', 'risk', subject, whereOf(n), `The address changed: ${o.m.route || 'none'} is now ${n.m.route || 'none'}. Anything calling the old address must change too.`));
  }
  // Inputs
  const gi = new Set(o.m.youGive), gn = new Set(n.m.youGive);
  for (const x of n.m.youGive) if (!gi.has(x)) items.push(item('input-added', 'meaning', subject, whereOf(n), `Now also takes ${x}.`));
  for (const x of o.m.youGive) if (!gn.has(x)) items.push(item('input-removed', 'meaning', subject, whereOf(n), `No longer takes ${x}.`));
  // Stops: paired by their error, in order.
  const added = [], removed = [];
  const stopPairs = pairBy(dO.stops || [], dN.stops || [], (s) => s.error);
  for (const [a, b] of stopPairs) { if (!a) added.push(b); if (!b) removed.push(a); }
  // A new check guards everything after it: its question is left out of the other facts' conditions, and said once.
  const guardsNew = new Set(added.map((s) => s.when.at(-1)?.question).filter(Boolean));
  const guardsOld = new Set(removed.map((s) => s.when.at(-1)?.question).filter(Boolean));
  const skipO = guardsOld, skipN = guardsNew;
  for (const s of added) {
    items.push(item('stop-added', 'meaning', subject, whereOf(n, s.line), `Now stops with ${stopName(s)}${whenText(s.when)}.`, { before: null, after: [...whenLines(s.when), `Stop: ${stopName(s)}`] }));
  }
  for (const s of removed) {
    items.push(item('stop-removed', 'risk', subject, whereOf(n), `No longer stops with ${stopName(s)}${whenText(s.when)}. Check that this is no longer needed.`, { before: [...whenLines(s.when), `Stop: ${stopName(s)}`], after: null }));
  }
  for (const [a, b] of stopPairs) {
    if (!a || !b) continue;
    if ((a.message || '') !== (b.message || '')) items.push(item('stop-changed', 'meaning', subject, whereOf(n, b.line), `When it stops with ${b.error}, it now says "${b.message ?? ''}" (was "${a.message ?? ''}").`));
    const wa = whenText(a.when, skipO), wb = whenText(b.when, skipN);
    if (wa !== wb) items.push(item('stop-changed', 'risk', subject, whereOf(n, b.line), `Stops with ${b.error} under different conditions: now${wb || ' always'} (was${wa || ' always'}).`, { before: [...whenLines(a.when), `Stop: ${stopName(a)}`], after: [...whenLines(b.when), `Stop: ${stopName(b)}`] }));
  }
  // What it gives back (rules are compared by their answers instead).
  if (n.m.kind !== 'rule') {
    for (const [a, b] of pairBy(dO.givesBack || [], dN.givesBack || [], (g) => g.text)) {
      if (!a) items.push(item('gives-back-added', 'meaning', subject, whereOf(n, b.line), `Now also ${lc(b.text)}${whenText(b.when, skipN)}.`, { before: null, after: [...whenLines(b.when), b.text] }));
      else if (!b) items.push(item('gives-back-removed', 'meaning', subject, whereOf(n), `No longer ${lc(a.text)}${whenText(a.when, skipO)}.`, { before: [...whenLines(a.when), a.text], after: null }));
      else if (whenText(a.when, skipO) !== whenText(b.when, skipN)) items.push(item('gives-back-changed', 'meaning', subject, whereOf(n, b.line), `${b.text} under different conditions: now${whenText(b.when, skipN) || ' always'} (was${whenText(a.when, skipO) || ' always'}).`));
    }
  }
  // What it changes, saves, sends, or asks of another service.
  const effects = (e, d) => {
    const out = (d.changes || []).map((c) => ({ text: c.text, does: c.does, line: c.line, when: c.when }));
    for (const nd of e.m.flow.nodes) if ((nd.does === 'ask' || nd.does === 'redirect') && nd.kind === 'step' && !out.some((x) => x.text === nd.text)) out.push({ text: nd.text, does: nd.does, line: nd.line ?? null, when: null });
    return out;
  };
  // Reaching outside the program (another service, a payment, an email, stored data) is worth a careful look; adding
  // to a list in memory or writing a log is not.
  const outward = (x) => x.does === 'ask' || x.does === 'redirect' || (x.does === 'send' && !/^Writes a log/.test(x.text))
    || (x.does === 'save' && /^(Writes to the database|Saves|Stores|Records|Deletes|Updates|Creates|Inserts)\b/.test(x.text));
  for (const [a, b] of pairBy(effects(o, dO), effects(n, dN), (x) => x.text)) {
    if (!a) items.push(item('effect-added', outward(b) ? 'risk' : 'meaning', subject, whereOf(n, b.line), `Now also ${lc(b.text)}${b.when ? whenText(b.when, skipN) : ''}.`, { before: null, after: [...whenLines(b.when), b.text] }));
    else if (!b) items.push(item('effect-removed', 'meaning', subject, whereOf(n), `No longer ${lc(a.text)}${a.when ? whenText(a.when, skipO) : ''}.`, { before: [...whenLines(a.when), a.text], after: null }));
    else if (a.when && b.when && whenText(a.when, skipO) !== whenText(b.when, skipN)) items.push(item('effect-changed', 'meaning', subject, whereOf(n, b.line), `${b.text} under different conditions: now${whenText(b.when, skipN) || ' always'} (was${whenText(a.when, skipO) || ' always'}).`));
  }
  // What it relies on.
  const ro = new Set((dO.reliesOn || []).map((r) => r.label)), rn = new Set((dN.reliesOn || []).map((r) => r.label));
  for (const r of rn) if (!ro.has(r)) items.push(item('relies-on', 'meaning', subject, whereOf(n), `Now also relies on ${r}.`));
  for (const r of ro) if (!rn.has(r)) items.push(item('relies-on', 'meaning', subject, whereOf(n), `No longer relies on ${r}.`));
  return items.length - before;
}

const literals = (tokens) => tokens.filter((t) => t.k === 'str' || t.k === 'num').map((t) => t.t);
function valueChanges(o, n) {
  const a = literals(o.tokens), b = literals(n.tokens);
  const onlyA = a.filter((x) => !b.includes(x)), onlyB = b.filter((x) => !a.includes(x));
  if (!onlyA.length && !onlyB.length) return '';
  if (onlyA.length === 1 && onlyB.length === 1) return ` (${onlyA[0]} became ${onlyB[0]})`;
  return ` (values ${onlyA.length ? `${onlyA.slice(0, 4).join(', ')} removed` : ''}${onlyA.length && onlyB.length ? ', ' : ''}${onlyB.length ? `${onlyB.slice(0, 4).join(', ')} added` : ''})`;
}

function compareMember(o, n, items) {
  const subject = subjectOf(n);
  const sameCode = sameTokens(o.tokens, n.tokens);
  const sameThunder = o.sig === n.sig;
  const renamedOrMoved = [];
  if (o.m.file !== n.m.file) renamedOrMoved.push(`moved from ${o.m.file} to ${n.m.file}`);
  // A route handler is named after its address: a new address is said once, as the address.
  if (nameKey(o.m.name) !== nameKey(n.m.name) && (o.m.route ?? '') === (n.m.route ?? '')) renamedOrMoved.push(`renamed from ${o.m.label} to ${n.m.label}`);
  const moveKind = o.m.file !== n.m.file && nameKey(o.m.name) === nameKey(n.m.name) ? 'moved' : 'renamed';
  const formOnly = (why) => items.push(item(renamedOrMoved.length ? moveKind : 'form', 'form', subject, whereOf(n),
    `${renamedOrMoved.length ? `${cap(renamedOrMoved.join(' and '))}. ` : ''}Only the form changed: ${why}`));
  if (sameCode && sameThunder) {
    if (!renamedOrMoved.length && o.code.join('\n') === n.code.join('\n')) return 'unchanged';
    formOnly(renamedOrMoved.length ? 'the code is the same.' : 'spacing, line breaks, or comments; the code is otherwise identical.');
    return 'form';
  }
  const noteMove = () => { if (renamedOrMoved.length) items.push(item(moveKind, 'form', subject, whereOf(n), `${cap(renamedOrMoved.join(' and '))}.`)); };
  // Only local names changed (an input, a value it works out), consistently, and nothing else.
  const renames = localRenames(o.tokens, n.tokens, n.m.language, [o.m.name]);
  if (renames) {
    const list = renames.filter(([a]) => a !== o.m.name).map(([a, b]) => `${a} is now ${b}`);
    if (!list.length) { formOnly('the code is the same apart from its name.'); return 'form'; }
    formOnly(`only names it declares itself changed (${list.join(', ')}); the code is otherwise identical.`);
    return 'form';
  }
  if (o.m.kind === 'not-read' || n.m.kind === 'not-read') {
    noteMove();
    items.push(item('not-read', 'risk', subject, whereOf(n), 'Thunder cannot read this yet, and its code changed: check the code itself.', lineChanges(o.code, n.code)));
    return 'changed';
  }
  if (o.m.rule && n.m.rule && !o.m.rule.partial && !n.m.rule.partial) {
    const r = comparePlainRules(o.m.rule, n.m.rule);
    if (r.same) {
      formOnly(`same answer on all ${r.tried} edge cases, run on both versions.`);
      return 'form';
    }
    noteMove();
    ruleChanges(o, n, r, items);
    return 'changed';
  }
  noteMove();
  const start = items.length;
  compareFacets(o, n, items);
  const flat = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const facetEvidence = flat(items.slice(start).map((x) => JSON.stringify(x.evidence ?? '') + x.says).join(' '));
  if (sameThunder) {
    items.push(item('hidden', 'meaning', subject, whereOf(n), `Changed, check: Thunder reads the same, but the code differs in details Thunder's words leave out${valueChanges(o, n)}.`, lineChanges(o.code, n.code)));
    return 'changed';
  }
  const diff = lineChanges(o.text.slice(1), n.text.slice(1));
  const changed = [...diff.before, ...diff.after].filter((l) => l.startsWith('> '))
    .map((l) => l.slice(2).trim().replace(/^- /, '').replace(/^(Ask|Answer): /, ''))
    .filter((l) => !/^(Yes|No|For each|Always, at the end|If anything goes wrong)(:.*)?$/.test(l) && !/^(You give it|You get back|When someone calls):?/.test(l));
  const uncovered = changed.filter((l) => !facetEvidence.includes(flat(l).slice(0, 40)));
  if (uncovered.length || items.length === start) {
    items.push(item('steps', 'meaning', subject, whereOf(n), `${items.length === start ? 'Steps changed' : 'Other steps changed too'}, check the before and after.`, diff));
  }
  return 'changed';
}

function summaryOf(e) {
  const parts = [];
  if (e.m.youGive.length) parts.push(`takes ${e.m.youGive.join(', ')}`);
  if (e.m.youGetBack) parts.push(e.m.youGetBack.includes('stops with') ? `gives back ${e.m.youGetBack}` : `gives back ${e.m.youGetBack}`);
  if (e.m.kind === 'rule') { const d = details(e); if (d.answers?.length) parts.push(`answers ${d.answers.map((a) => a.answer).join(', ')}`); }
  return parts.length ? `: ${parts.join('; ')}` : '';
}

// ── Things (records, choices) ───────────────────────────────────────────────────────────────────────────────

function compareThings(A, B, items) {
  const key = (t) => `${stemKey(t.file)}#${nameKey(t.name)}`;
  let pairs = pairBy(A.model.things, B.model.things, key);
  // A Thing in a moved file: the same name, once on each side.
  const count = (list) => { const c = new Map(); for (const t of list) c.set(nameKey(t.name), (c.get(nameKey(t.name)) || 0) + 1); return c; };
  const lonelyA = pairs.filter(([a, b]) => a && !b).map(([a]) => a), lonelyB = pairs.filter(([a, b]) => b && !a).map(([, b]) => b);
  const ca = count(lonelyA), cb = count(lonelyB);
  for (const a of lonelyA) {
    if (ca.get(nameKey(a.name)) !== 1 || cb.get(nameKey(a.name)) !== 1) continue;
    const b = lonelyB.find((t) => nameKey(t.name) === nameKey(a.name));
    pairs = pairs.filter(([x, y]) => x !== a && y !== b).concat([[a, b]]);
    items.push(item('moved', 'form', b.label, { file: b.file, line: b.lines[0] }, `Moved from ${a.file} to ${b.file}.`));
  }
  for (const [a, b] of pairs) {
    const t = b ?? a;
    const where = { file: t.file, line: t.lines[0] };
    if (!a) { items.push(item('thing', 'meaning', t.label, where, `New ${t.kind === 'choices' ? 'set of choices' : t.kind}: ${t.label}${t.knows.length ? `, which knows ${[...new Set(t.knows.map((k) => k.label))].join(', ')}` : ''}${t.choices.length ? `: one of ${t.choices.join(', ')}` : ''}.`)); continue; }
    if (!b) { items.push(item('thing', 'meaning', t.label, where, `Removed ${t.kind === 'choices' ? 'set of choices' : t.kind}: ${t.label}.`)); continue; }
    const ka = new Map(a.knows.map((k) => [k.label, k])), kb = new Map(b.knows.map((k) => [k.label, k]));
    for (const [l, k] of kb) {
      if (!ka.has(l)) items.push(item('thing', 'meaning', t.label, { file: b.file, line: k.line ?? b.lines[0] }, `${b.label} now also knows ${l}${k.start ? ` (${k.start})` : ''}.`));
      else if ((ka.get(l).start ?? '') !== (k.start ?? '')) items.push(item('thing', 'meaning', t.label, { file: b.file, line: k.line ?? b.lines[0] }, `${b.label}: ${l} is now ${k.start ?? 'not set'} (was ${ka.get(l).start ?? 'not set'}).`));
    }
    for (const l of ka.keys()) if (!kb.has(l)) items.push(item('thing', 'meaning', t.label, where, `${b.label} no longer knows ${l}.`));
    for (const c of b.choices) if (!a.choices.includes(c)) items.push(item('thing', 'meaning', t.label, where, `${b.label} can now also be ${c}.`));
    for (const c of a.choices) if (!b.choices.includes(c)) items.push(item('thing', 'meaning', t.label, where, `${b.label} can no longer be ${c}.`));
  }
}

// ── Files Thunder does not read as steps ────────────────────────────────────────────────────────────────────

const INFRA = [/\.tf$/i, /\.tfvars$/i, /\.bicep$/i, /(^|\/)Dockerfile[^/]*$/i, /(^|\/)docker-compose[^/]*\.ya?ml$/i, /(^|\/)compose\.ya?ml$/i,
  /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i, /(^|\/)\.gitlab-ci\.ya?ml$/i, /azure-pipelines[^/]*\.ya?ml$/i, /(^|\/)(k8s|kubernetes|helm|charts|deploy|infra|manifests)\/.+\.ya?ml$/i,
  /(^|\/)serverless\.ya?ml$/i, /(^|\/)template\.ya?ml$/i, /\.cfn\.(json|ya?ml)$/i];
const isInfra = (p) => INFRA.some((re) => re.test(p));
// A line that only brings in something from another file (import, require, use, using, package).
const IMPORT_LINE = /^\s*(import\b|from\s+\S+\s+import\b|export\s+(\*|\{[^}]*\})\s+from\b|(const|let|var)\s+[\w${}\s,:]+=\s*require\(|require(_relative)?\s*\(?['"]|use\s+[\w:\\]+|using\s+[\w.]+\s*;|package\s+[\w.]+)/;

/** Code outside every action and rule (settings, imports, top-level values), as tokens: changes there change meaning. */
function outsideTokens(S, path) {
  const src = S.sources.get(path);
  if (src == null) return null;
  const lang = readableLanguage(path);
  const covered = new Set();
  for (const e of S.members) if (e.m.file === path) for (let l = e.m.reviewLines[0]; l <= e.m.reviewLines[1]; l++) covered.add(l);
  const all = src.split('\n');
  const at = all.map((_, i) => i + 1).filter((l) => !covered.has(l));
  const lines = at.map((l) => all[l - 1]);
  return { lines, at, all, tokens: codeTokens(lines.join('\n'), lang) };
}

/** The name of the function a line sits in, from the nearest declaration above it (any common language). */
function enclosingName(lines, line) {
  // A line can only sit inside a declaration indented less than itself; a line at the left edge is in none.
  const indent = (l) => (l ?? '').match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
  const target = indent(lines[line - 1]);
  if (!target) return null;
  for (let i = line - 2; i >= 0 && i >= line - 400; i--) {
    if (!lines[i].trim() || indent(lines[i]) >= target) continue;
    const m = lines[i].match(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|def|func|fn|fun|sub)\s+(?:\([^)]*\)\s*)?([A-Za-z_$][\w$]*)/)
      || lines[i].match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\(|[A-Za-z_$][\w$]*\s*=>)/)
      || lines[i].match(/^\s*(?:(?:public|private|protected|internal|static|override|async|final)\s+)+[\w<>\[\],\s]*?\b([A-Za-z_]\w*)\s*\([^;]*$/);
    if (m && !/^(if|for|while|switch|catch|return|else|elif|when|match|new|throw|await|typeof)$/.test(m[1])) return m[1];
  }
  return null;
}

// ── The review ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What changed in meaning between two versions of some code. `oldFiles` and `newFiles` are [{ path, source }];
 * pass only the files that changed (and, for a moved file, both paths) or whole trees. Returns
 * { schema, summary, items, notRead, unchanged } with items ordered by importance (risk, then meaning, then form).
 */
export function thunderReview(oldFiles, newFiles) {
  detailsCache = new WeakMap();
  const A = side(oldFiles || []), B = side(newFiles || []);
  const items = [];
  const used = new Set(), pairs = [];
  // 1. Same file and name.
  for (const o of A.members) { const n = B.byKey.get(o.key); if (n && !used.has(n)) { used.add(n); pairs.push([o, n]); o.paired = true; } }
  // 2. The same name, used once on each side (a moved file).
  const unique = (list) => { const c = new Map(); for (const e of list) c.set(`${nameKey(e.m.name)}#${e.m.kind}`, (c.get(`${nameKey(e.m.name)}#${e.m.kind}`) || 0) + 1); return c; };
  const leftA = () => A.members.filter((e) => !e.paired), leftB = () => B.members.filter((e) => !used.has(e));
  {
    const ua = unique(leftA()), ub = unique(leftB());
    for (const o of leftA()) {
      const k = `${nameKey(o.m.name)}#${o.m.kind}`;
      if (ua.get(k) !== 1 || ub.get(k) !== 1) continue;
      const n = leftB().find((e) => `${nameKey(e.m.name)}#${e.m.kind}` === k);
      if (n) { used.add(n); pairs.push([o, n]); o.paired = true; }
    }
  }
  // 3. A route handler whose address changed: the same file and method, and the same code apart from the address.
  const withoutAddress = (e) => e.tokens.map((t) => (t.k === 'str' && e.m.route && t.t.slice(1, -1) === e.m.route.split(' ').slice(1).join(' ') ? '"ADDRESS"' : t.t)).join(' ');
  for (const o of leftA().filter((e) => e.m.route)) {
    const n = leftB().find((e) => e.m.route && e.m.file === o.m.file && e.m.route.split(' ')[0] === o.m.route.split(' ')[0] && withoutAddress(e) === withoutAddress(o));
    if (n) { used.add(n); pairs.push([o, n]); o.paired = true; }
  }
  // 4. By meaning: a renamed function whose code is the same apart from its name, or a rule with the same answers.
  for (const o of leftA()) {
    const n = leftB().find((e) => e.m.kind === o.m.kind && e.m.language === o.m.language && ((e.sig === o.sig && localRenames(o.tokens, e.tokens, e.m.language, [o.m.name]))
      || (o.m.rule && e.m.rule && !o.m.rule.partial && !e.m.rule.partial && comparePlainRules(o.m.rule, e.m.rule).same)));
    if (n) { used.add(n); pairs.push([o, n]); o.paired = true; }
  }
  let unchanged = 0;
  for (const [o, n] of pairs) if (compareMember(o, n, items) === 'unchanged') unchanged++;
  for (const o of leftA()) items.push(item('removed', 'meaning', subjectOf(o), whereOf(o), `Removed ${KIND_WORD[o.m.kind] ?? 'function'}: ${subjectOf(o)}.`, { before: o.text, after: null }));
  for (const n of leftB()) items.push(item('added', n.m.kind === 'not-read' ? 'risk' : 'meaning', subjectOf(n), whereOf(n),
    n.m.kind === 'not-read' ? "New function that Thunder cannot read yet: check the code itself." : `New ${KIND_WORD[n.m.kind] ?? 'function'}: ${subjectOf(n)}${summaryOf(n)}.`, { before: null, after: n.text }));
  compareThings(A, B, items);

  // Files: code outside every action and rule, files Thunder could not read, and files it does not read.
  const paths = [...new Set([...A.sources.keys(), ...B.sources.keys()])];
  const notRead = [];
  for (const p of paths) {
    const before = A.sources.get(p), after = B.sources.get(p);
    if (before === after) continue;
    const lang = readableLanguage(p);
    if (!lang) {
      if (isInfra(p)) items.push(item('infrastructure', 'risk', p, { file: p, line: 1 }, `${before == null ? 'New' : after == null ? 'Removed' : 'Changed'} infrastructure or pipeline file. Thunder does not read these in this version, so check it yourself.`, before != null && after != null ? lineChanges(before.split('\n'), after.split('\n')) : null));
      else notRead.push({ path: p, status: before == null ? 'added' : after == null ? 'removed' : 'changed' });
      continue;
    }
    const why = B.model.unknowns.find((u) => u.file === p && /^Could not read this file/.test(u.why));
    if (why) { items.push(item('unreadable', 'risk', p, { file: p, line: 1 }, `Thunder could not read this file, so its changes are not described here: check it yourself. (${why.why})`)); continue; }
    if (before == null || after == null) continue; // a whole new or removed file: its members are listed
    const oa = outsideTokens(A, p), ob = outsideTokens(B, p);
    if (oa && ob && !sameTokens(oa.tokens, ob.tokens)) {
      const diff = lineChanges(oa.lines, ob.lines);
      // Where: the first changed line in the new file, and the function it sits in when the code names one.
      let k = 0;
      while (k < oa.lines.length && k < ob.lines.length && oa.lines[k] === ob.lines[k]) k++;
      const line = ob.at[Math.min(k, ob.at.length - 1)] ?? 1;
      const near = enclosingName(ob.all, line);
      const changedLines = [...diff.before, ...diff.after].filter((l) => l.startsWith('> ') && l.slice(2).trim());
      if (changedLines.length && changedLines.every((l) => IMPORT_LINE.test(l.slice(2)) || /^[\s{}()[\],;]*$/.test(l.slice(2)) || /^\s*[\w$]+,?\s*$/.test(l.slice(2)))) {
        items.push(item('outside', 'meaning', p, { file: p, line }, 'What this file uses from other files changed (its imports): check the before and after.', diff));
      } else {
        items.push(item('outside', 'meaning', p, { file: p, line }, `Changed in code Thunder did not read as an action or rule${near ? ` (in or near ${near})` : ' (outside any function)'}, which can change what the code does: check the before and after.`, diff));
      }
    }
  }

  // A moved file: one line, not one per function.
  const moved = items.filter((x) => x.kind === 'moved' && x.severity === 'form' && /Only the form changed/.test(x.says));
  const groups = new Map();
  for (const x of moved) { const k = x.says.match(/moved from (\S+) to (\S+?)\. /i)?.slice(1).join('→'); if (k) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); } }
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const [from, to] = k.split('→');
    for (const x of list) items.splice(items.indexOf(x), 1);
    items.push(item('moved', 'form', to, { file: to, line: 1 }, `Moved from ${from} to ${to}. Only the form changed: ${list.length} actions, rules, or functions have the same code.`));
  }

  // The same sentence about several functions (a renamed input passed everywhere): one item that names them all.
  const same = new Map();
  for (const x of [...items]) {
    if (x.severity === 'form' || x.kind === 'outside' || x.kind === 'hidden' || x.kind === 'steps' || x.kind === 'not-read') continue;
    const k = `${x.severity}|${x.kind}|${x.says}`;
    if (!same.has(k)) { same.set(k, x); continue; }
    (same.get(k).also ||= []).push({ subject: x.subject, where: x.where });
    items.splice(items.indexOf(x), 1);
  }
  // "Changed, check" and "cannot read" in many functions: one item each, naming the functions.
  for (const kind of ['hidden', 'not-read']) {
    const list = items.filter((x) => x.kind === kind);
    if (list.length < 4) continue;
    const [first, ...rest] = list;
    first.also = rest.map((x) => ({ subject: x.subject, where: x.where, ...(x.evidence ? { evidence: x.evidence } : {}) }));
    for (const x of rest) items.splice(items.indexOf(x), 1);
  }
  for (const x of items) if (x.also) x.subject = `${x.subject} and ${x.also.length} more`;

  items.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
    || String(a.where.file).localeCompare(String(b.where.file)) || (a.where.line ?? 0) - (b.where.line ?? 0));
  const count = (s) => items.filter((x) => x.severity === s).length;
  const summary = { meaning: count('meaning'), risk: count('risk'), form: count('form'), unchanged, files: paths.filter((p) => A.sources.get(p) !== B.sources.get(p)).length };
  const onlyNotRead = !items.length && summary.files && notRead.length === summary.files;
  return { schema: REVIEW_SCHEMA, summary, says: onlyNotRead ? 'Only files Thunder does not read changed.' : summaryLine(summary), items, notRead };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function summaryLine(s) {
  if (!s.meaning && !s.risk && !s.form) return s.files ? 'No change in the code Thunder reads, apart from comments or spacing outside its actions and rules.' : 'Nothing changed.';
  return `${plural(s.meaning, 'change', 'changes')} in meaning, ${plural(s.risk, 'risk', 'risks')}, ${s.form} form-only.`;
}

// ── Markdown, for a pull request comment ─────────────────────────────────────────────────────────────────────

const fence = (lines) => ['```', ...lines.map((l) => l.replace(/```/g, "'''")), '```'];
function evidenceBlock(ev) {
  if (!ev) return [];
  const out = [];
  if (ev.counterexample) out.push(`Tried both: when ${ev.counterexample.facts}, before: **${ev.counterexample.before}**, after: **${ev.counterexample.after}**.`, '');
  if (ev.before?.length) out.push('Before:', ...fence(ev.before));
  if (ev.after?.length) out.push('After:', ...fence(ev.after));
  return out.length ? ['<details><summary>Before and after</summary>', '', ...out, '', '</details>'] : [];
}

/** The review as Markdown for a pull request comment, starting with REVIEW_MARKER so a bot can find and update it. */
export function renderReview(r, { title = 'Thunder review', maxChars = 60000, footer = '' } = {}) {
  const out = [REVIEW_MARKER, `### ${title}`, '', `**${r.says}**`, ''];
  out.push('Read from the code by the Thunder compiler, with no AI. "Only the form changed" is said only when it is shown: the code is identical apart from spacing, comments, or names it declares itself, or a rule gives the same answer on every edge case.', '');
  const alsoIn = (x) => (x.also?.length ? [`  <details><summary>Also in ${x.also.length} more</summary>`, '', ...x.also.slice(0, 50).map((a) => `  - **${a.subject}** · \`${a.where.file}:${a.where.line}\``), ...(x.also.length > 50 ? [`  - and ${x.also.length - 50} more`] : []), '', '  </details>'] : []);
  const line = (x) => [`- **${x.subject}** · \`${x.where.file}:${x.where.line}\`: ${x.says}`, ...evidenceBlock(x.evidence).map((l) => (l ? `  ${l}` : '')), ...alsoIn(x)];
  const section = (sev, head) => {
    const list = r.items.filter((x) => x.severity === sev);
    if (!list.length) return;
    if (sev === 'form') { out.push(`<details><summary>${head} (${list.length})</summary>`, '', ...list.map((x) => `- **${x.subject}** · \`${x.where.file}:${x.where.line}\`: ${x.says}`), '', '</details>', ''); return; }
    out.push(`#### ${head}`, '');
    for (const x of list) out.push(...line(x));
    out.push('');
  };
  section('risk', 'Needs a careful look');
  section('meaning', 'Changes in meaning');
  section('form', 'Only the form changed');
  if (r.notRead.length) out.push(`Also changed, not read by Thunder: ${r.notRead.slice(0, 20).map((f) => `\`${f.path}\``).join(', ')}${r.notRead.length > 20 ? `, and ${r.notRead.length - 20} more` : ''}.`, '');
  if (footer) out.push(footer, '');
  let text = out.join('\n');
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 200)}\n\n…cut short to fit. Run \`thunder review\` locally to see every change.\n`;
  return text;
}
