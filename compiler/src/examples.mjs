// examplesOf(source): every example in a Thunder file, as data, so tools (OpenThunder's Check, the Design Recipe
// screens, agents) read examples through one call instead of parsing Thunder text.
//
//   Thunder Core:  Test "members get 20% off":
//                    Expect calculate discount with 150 and yes to be 30
//                    Expect withdraw with 10 and 30 to fail with "Insufficient funds"
//   Mission:       test SpendAdmission
//                    case below the budget
//                      given remainingCents 100, reservedCents 99
//                      expect Admit
//                    scenario a refund                       (a lifecycle)
//                      events submit, approve
//                      expect Approved
//
// The examples are read from the file's text as written: an example is found even when another part of the file
// does not compile yet, because a person changing a file is exactly when a tool needs to see its examples.
// Shape: thunder-examples-v1 (see EXAMPLE below). The syntax read here is stable; a change to it is announced first.

import { parseCore } from './core/index.mjs';
import { fileKind } from './core/kind.mjs';
import { parseIntent } from './parse.mjs';

export const EXAMPLES_SCHEMA = 'thunder-examples-v1';

/**
 * One example:
 *   { kind: 'expect' | 'case' | 'scenario',
 *     block: the Test title, or the decision/lifecycle a mission test is for,
 *     name: the case or scenario name (missions), or null,
 *     line: the example's line (1-based),
 *     subject: { kind: 'function' | 'decision' | 'lifecycle' | 'expression', name },
 *     inputs: [{ name: string | null, text }]   (Core: in order, unnamed; missions: given name and value; scenario:
 *                                                 one input per event, named "event"),
 *     expected: { mode: 'equals' | 'compares' | 'fails' | 'result' | 'state' | 'valid' | 'invalid' | 'none',
 *                 comparison: 'is' | 'is at least' | …, text },
 *     raw: the example's own text (Core: its line; missions: its block, joined) }
 */
export const EXAMPLE = null;

const COMPARISON = { '==': 'is', '!=': 'is not', '>=': 'is at least', '<=': 'is at most', '>': 'is more than', '<': 'is less than' };

/** Split `a, b and c` into its top-level parts (not inside quotes, brackets, or parentheses). */
function splitArgs(text) {
  const parts = [];
  let depth = 0, quote = null, cur = '';
  const flush = () => { if (cur.trim()) parts.push(cur.trim()); cur = ''; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { cur += c; if (c === quote && text[i - 1] !== '\\') quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (depth === 0 && c === ',') { flush(); continue; }
    if (depth === 0 && text.startsWith(' and ', i)) { flush(); i += 4; continue; }
    cur += c;
  }
  flush();
  return parts;
}

/** The inputs of `Expect <function> with <inputs> to …`, as the person wrote them, or null when they cannot be cut. */
function inputsOf(raw, e) {
  const n = e.args?.length ?? 0;
  if (n === 0) return [];
  const m = /^expect\s+(.*?)\s+to\s+(?:be|fail)\b/i.exec(raw);
  if (!m) return null;
  const w = m[1].toLowerCase().indexOf(' with ');
  if (w < 0) return null;
  const parts = splitArgs(m[1].slice(w + 6));
  return parts.length === n ? parts.map((text) => ({ name: null, text })) : null;
}

function coreExamples(source, file) {
  const r = parseCore(source, { file });
  const out = [];
  for (const t of (r.body ?? []).filter((s) => s.k === 'test')) {
    for (const s of t.body ?? []) {
      if (s.k !== 'expect') continue;
      const raw = String(s.raw ?? '').trim();
      const e = s.e ?? {};
      const isCall = e.k === 'call';
      let expected;
      if (s.mode === 'fail') {
        const m = /\bto\s+fail(?:\s+with\s+(.*))?$/i.exec(raw);
        expected = { mode: 'fails', comparison: null, text: m?.[1]?.trim() ?? null };
      } else {
        const op = s.check?.op ?? '==';
        const comparison = COMPARISON[op] ?? op;
        const m = /\bto\s+be\s+(.*)$/i.exec(raw);
        let text = m?.[1]?.trim() ?? null;
        if (text && op !== '==') text = text.replace(/^(?:at least|at most|more than|less than|above|below|fewer than|greater than|not)\s+/i, '');
        expected = { mode: op === '==' ? 'equals' : 'compares', comparison, text };
      }
      out.push({
        kind: 'expect', block: t.title ?? null, name: null, line: s.line,
        subject: isCall ? { kind: 'function', name: e.text ?? e.name } : { kind: 'expression', name: null },
        inputs: isCall ? inputsOf(raw, e) ?? [] : [],
        ...(isCall && inputsOf(raw, e) == null && (e.args?.length ?? 0) > 0 ? { inputsUnread: true } : {}),
        expected, raw,
      });
    }
  }
  // Expect lines the parser could not place (a test file that calls functions defined in another file, or a line
  // that does not parse yet) are read from their text, and say so (fromText).
  const seen = new Set(out.map((e) => e.line));
  const lines = String(source).split('\n');
  let block = null;
  lines.forEach((line, i) => {
    const t = /^test\s+"([^"]*)"\s*:\s*$/i.exec(line);
    if (t) { block = t[1]; return; }
    if (line.trim() && !/^\s/.test(line)) { block = null; return; }
    const m = block != null && /^\s+expect\s+(.+?)\s+to\s+(be|fail)\b\s*(.*)$/i.exec(line);
    if (!m || seen.has(i + 1)) return;
    const [, what, verb, tail] = m;
    const w = what.toLowerCase().indexOf(' with ');
    const name = w >= 0 ? what.slice(0, w).trim() : null;
    let expected;
    if (verb.toLowerCase() === 'fail') expected = { mode: 'fails', comparison: null, text: (/^with\s+(.*)$/i.exec(tail)?.[1] ?? '').trim() || null };
    else {
      const c = /^(at least|at most|more than|less than|not)\s+(.*)$/i.exec(tail);
      expected = c ? { mode: 'compares', comparison: `is ${c[1].toLowerCase()}`, text: c[2].trim() } : { mode: 'equals', comparison: 'is', text: tail.trim() || null };
    }
    out.push({
      kind: 'expect', block, name: null, line: i + 1,
      subject: name ? { kind: 'function', name } : { kind: 'expression', name: null },
      inputs: name ? splitArgs(what.slice(w + 6)).map((text) => ({ name: null, text })) : [],
      expected, raw: line.trim(), fromText: true,
    });
  });
  out.sort((a, b) => a.line - b.line);
  return { examples: out, problems: (r.diagnostics ?? []).filter((d) => d.severity !== 'warning').length };
}

function missionExamples(source) {
  const ast = parseIntent(source);
  const lifecycles = new Set((ast.lifecycles ?? []).map((l) => l.name));
  const lines = source.split('\n');
  const blockText = (line) => {
    // The case's own lines: its header and the lines indented under it.
    const start = line - 1;
    const ind = (lines[start] ?? '').match(/^\s*/)[0].length;
    const out = [lines[start]?.trim() ?? ''];
    for (let i = start + 1; i < lines.length && (lines[i].trim() === '' || lines[i].match(/^\s*/)[0].length > ind); i++) if (lines[i].trim()) out.push(lines[i].trim());
    return out.join('\n');
  };
  const out = [];
  for (const t of ast.tests ?? []) {
    const isLifecycle = lifecycles.has(t.name);
    for (const c of t.cases ?? []) {
      const scenario = Array.isArray(c.events);
      const expected = c.expectValid === true ? { mode: 'valid', comparison: null, text: null }
        : c.expectValid === false ? { mode: 'invalid', comparison: null, text: null }
        : c.expect != null ? { mode: scenario ? 'state' : 'result', comparison: 'is', text: c.expect }
        : { mode: 'none', comparison: null, text: null };
      out.push({
        kind: scenario ? 'scenario' : 'case', block: t.name, name: c.name, line: c.line,
        subject: { kind: scenario || isLifecycle ? 'lifecycle' : 'decision', name: t.name },
        inputs: scenario ? c.events.map((ev) => ({ name: 'event', text: ev })) : Object.entries(c.given ?? {}).map(([name, text]) => ({ name, text })),
        expected, raw: blockText(c.line),
      });
    }
  }
  return { examples: out, problems: 0 };
}

/**
 * Every example in `source`: { schema, kind: 'program' | 'mission', examples, problems }. `kind` is decided the way
 * the compiler decides it (a file's first line), unless given ({ kind: 'program' } for a file in a Core project).
 * `problems` counts errors elsewhere in a program; the examples are read anyway.
 */
export function examplesOf(source, { file = 'main.thunder', kind = null } = {}) {
  const k = kind ?? fileKind(String(source)).kind;
  const r = k === 'program' ? coreExamples(String(source), file) : missionExamples(String(source));
  return { schema: EXAMPLES_SCHEMA, kind: k, ...r };
}
