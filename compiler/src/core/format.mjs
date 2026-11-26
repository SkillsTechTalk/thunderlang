// thunder format: the one way Thunder Core is written (the "Thunder style", docs/core.md).
//
//   1. Layout: two spaces per block level, no trailing spaces, at most one blank line in a row, a newline at the end.
//   2. Structure, read from the program itself (its records, their fields, its functions):
//      - short stays short: a record built on one line keeps that line while it has 1 to 3 fields and fits in 100
//        columns; with 4 or more fields, or past 100 columns, it becomes a block of "field: value" lines;
//      - a long condition (When, If, Otherwise when, Repeat while/until) wraps before "and" / "or".
//   3. Spacing: one blank line around each function (To), record (A … has), and Test block.
//
// It never changes what a program means: a block record is the same program as the one-line form, and a wrapped
// condition is joined back into the same line when it is read. Comments stay where they are. Formatting twice gives
// the same text as formatting once. Lines that are already in the Thunder style are left exactly as they are.

import { tokenizeLine } from './lexer.mjs';
import { parseCore, RESERVED } from './parser.mjs';

export const FORMAT_WIDTH = 100;
const MAX_INLINE_FIELDS = 3;

export function formatCore(source, { width = FORMAT_WIDTH } = {}) {
  let text = layout(source);
  let names = null;
  try { names = parseCore(text).names; } catch { /* a program that cannot be read keeps its layout only */ }
  if (names) text = layout(structure(text, names, width));
  return spacing(text);
}

// ── 1. layout ─────────────────────────────────────────────────────────────────────────────────────────────────

function layout(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const stack = [0]; // original indents of open blocks
  let blank = 0;
  for (const raw of lines) {
    const text = raw.replace(/\s+$/, '');
    if (!text.trim()) { blank++; continue; }
    const indent = text.match(/^ */)[0].length;
    while (stack.length > 1 && indent < stack[stack.length - 1]) stack.pop();
    if (indent > stack[stack.length - 1]) stack.push(indent);
    if (blank && out.length) out.push('');
    blank = 0;
    out.push(`${'  '.repeat(stack.length - 1)}${text.trim()}`);
  }
  return out.length ? `${out.join('\n')}\n` : '';
}

// ── 2. structure ──────────────────────────────────────────────────────────────────────────────────────────────

/** A line's code and its comment ("# …" outside text). */
function splitComment(line) {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' || c === '“' || c === '”') q = !q;
    else if (c === '#' && !q) return [line.slice(0, i).replace(/\s+$/, ''), line.slice(i)];
  }
  return [line, ''];
}

const isWord = (t, w) => t && t.t === 'word' && (w === undefined || t.lower === w);
const isSym = (t, s) => t && t.t === 'sym' && t.text === s;
const keyOf = (ts) => ts.map((t) => t.lower).join(' ');

/** Token indexes at the top level (outside parentheses and brackets) that satisfy pred. */
function topLevel(ts, pred, from = 0, to = ts.length) {
  const out = [];
  let depth = 0;
  for (let k = from; k < to; k++) {
    const t = ts[k];
    if (isSym(t, '(') || isSym(t, '[')) depth++;
    else if (isSym(t, ')') || isSym(t, ']')) depth--;
    else if (depth === 0 && pred(t, k)) out.push(k);
  }
  return out;
}

/** The longest run of words starting at k whose key satisfies ok: its length, or 0. */
function longest(ts, k, ok) {
  const run = [];
  for (let j = k; isWord(ts[j]) && !RESERVED.has(ts[j].lower); j++) run.push(ts[j]);
  for (let n = run.length; n > 0; n--) if (ok(keyOf(run.slice(0, n)))) return n;
  return 0;
}

function structure(text, names, width) {
  const out = [];
  for (const line of text.replace(/\n$/, '').split('\n')) {
    const [code, comment] = splitComment(line);
    if (!code.trim()) { out.push(line); continue; }
    const indent = code.match(/^ */)[0];
    let ts;
    try { ts = tokenizeLine(code.slice(indent.length), 1); } catch { out.push(line); continue; }
    const expanded = expandRecord(code, indent, ts, comment, names, width);
    if (expanded) { out.push(...expanded); continue; }
    const wrapped = wrapCondition(code, indent, ts, comment, width);
    if (wrapped) { out.push(...wrapped); continue; }
    out.push(line);
  }
  return `${out.join('\n')}\n`;
}

/**
 * A record built on one line, as the whole value of Set, Give, Add … to, or Expect … to, becomes a block when it is long:
 *   Set trade to a Trade with symbol "ACME" and quantity 10 and buy price $20.00 and sell price $40.00
 *   ->
 *   Set trade to a Trade:
 *     symbol: "ACME"
 *     …
 * Fields are found exactly as the parser finds them; each value is copied from the line as written.
 */
function expandRecord(code, indent, ts, comment, names, width) {
  const w0 = ts[0]?.lower;
  let from, to = ts.length;
  if (w0 === 'set') { const k = topLevel(ts, (t) => isWord(t, 'to'))[0]; if (k == null) return null; from = k + 1; }
  else if (w0 === 'give') from = 1;
  else if (w0 === 'add') { const k = topLevel(ts, (t) => isWord(t, 'to')).pop(); if (k == null) return null; from = 1; to = k; }
  else if (w0 === 'expect') {
    // Expect <record> to be / to fail / to contain …: the record is everything before that "to".
    const k = topLevel(ts, (t, j) => isWord(t, 'to') && ['be', 'fail', 'contain'].some((w) => isWord(ts[j + 1], w)))[0];
    if (k == null) return null;
    from = 1; to = k;
  } else return null;
  if (!(isWord(ts[from], 'a') || isWord(ts[from], 'an'))) return null;
  const rn = longest(ts, from + 1, (key) => names.records.has(key));
  if (!rn || !isWord(ts[from + 1 + rn], 'with')) return null;
  const record = keyOf(ts.slice(from + 1, from + 1 + rn));
  const own = names.recordFields?.get(record);
  // The fields, split exactly where the parser splits them: at "and" or "," followed by a field name.
  const fieldAt = (k) => longest(ts, k, (key) => names.fields.has(key));
  const fields = [];
  let k = from + 1 + rn + 1;
  while (k < to) {
    const fn = fieldAt(k);
    if (!fn) return null;
    const valueFrom = k + fn;
    const seps = topLevel(ts, (t, j) => (isWord(t, 'and') || isSym(t, ',')) && fieldAt(j + 1) > 0, valueFrom, to);
    const valueTo = seps.length ? seps[0] : to;
    if (valueTo <= valueFrom) return null;
    fields.push({ key: keyOf(ts.slice(k, k + fn)), text: ts.slice(k, k + fn).map((t) => t.text).join(' '), from: valueFrom, to: valueTo });
    k = valueTo + 1;
  }
  if (!fields.length || (own && fields.some((f) => !own.includes(f.key))) || new Set(fields.map((f) => f.key)).size !== fields.length) return null;
  if (fields.length <= MAX_INLINE_FIELDS && code.length + (comment ? comment.length + 2 : 0) <= width) return null;
  const body = code.slice(indent.length);
  const col = (j) => (j < ts.length ? ts[j].col - 1 : body.length); // where token j starts in the line (or its end)
  const head = `${body.slice(0, col(from + 1 + rn)).replace(/\s+$/, '')}${w0 === 'add' || w0 === 'expect' ? ` ${body.slice(col(to)).trim()}` : ''}:`;
  return [`${indent}${head}${comment ? `  ${comment}` : ''}`, ...fields.map((f) => `${indent}  ${f.text}: ${body.slice(col(f.from), col(f.to)).trim()}`)];
}

/**
 * A long condition wraps before each "and" / "or" that joins its parts (not the "and" of "between 1 and 10", nor
 * the ones that separate a call's values):
 *   When member is yes
 *     and total is at least 100:
 */
function wrapCondition(code, indent, ts, comment, width) {
  if (code.length + (comment ? comment.length + 2 : 0) <= width) return null;
  const lead = keyOf(ts.slice(0, 2));
  const starts = isWord(ts[0], 'when') || isWord(ts[0], 'if') || lead === 'otherwise when' || lead === 'otherwise if' || lead === 'repeat while' || lead === 'repeat until';
  if (!starts || !isSym(ts[ts.length - 1], ':') || keyOf(ts.slice(0, 3)) === 'if this fails') return null;
  // Split points: a top-level and/or that is not owed to a "between" or to a call's "with" list.
  let owed = 0, inWith = false;
  const splits = [];
  topLevel(ts, (t, j) => {
    if (isWord(t, 'between')) owed++;
    else if (isWord(t, 'with')) inWith = true;
    else if (isWord(t, 'is') || isWord(t, 'are') || ['<', '>', '<=', '>=', '=', '==', '!='].some((s) => isSym(t, s))) inWith = false;
    else if (isWord(t, 'and') && owed) owed--;
    else if ((isWord(t, 'and') && !inWith) || isWord(t, 'or')) { splits.push(j); inWith = false; }
    return false;
  });
  if (!splits.length) return null;
  const body = code.slice(indent.length);
  const parts = [];
  let start = 0;
  for (const j of splits) { parts.push(body.slice(start, ts[j].col - 1).trim()); start = ts[j].col - 1; }
  parts.push(body.slice(start).trim());
  if (parts.some((p) => !p)) return null;
  return parts.map((p, i) => `${indent}${i ? '  ' : ''}${p}${i === parts.length - 1 && comment ? `  ${comment}` : ''}`);
}

// ── 3. spacing ────────────────────────────────────────────────────────────────────────────────────────────────

/** One blank line before and after each function, record, and Test block at the top level. */
function spacing(text) {
  const lines = text.replace(/\n$/, '').split('\n');
  if (lines.length === 1 && !lines[0]) return '';
  const isDefinition = (l) => /^(?:To\b.*:|Test\b.*:|An?\b.*\bhas:)\s*(?:#.*)?$/i.test(l);
  const isComment = (l) => /^\s*#/.test(l);
  const out = [];
  let inDefinition = false;
  for (const l of lines) {
    const top = l && !/^\s/.test(l);
    if (top && isDefinition(l)) {
      // A blank line before it, above any comment written right over it (unless that is the top of the file).
      let k = out.length;
      while (k > 0 && isComment(out[k - 1]) && !/^\s/.test(out[k - 1])) k--;
      if (k > 0 && out[k - 1] !== '') out.splice(k, 0, '');
      inDefinition = true;
    } else if (top && inDefinition && !isComment(l)) {
      if (out[out.length - 1] !== '') out.push('');
      inDefinition = false;
    }
    out.push(l);
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}
