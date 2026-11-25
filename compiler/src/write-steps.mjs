// Writing in Thunder: a person changes software in Thunder, and the code is written for them.
//
// A Thunder edit is a small, explicit operation on the meaning model, addressed by member (function) and step:
//
//   setValue       change a value in a step (7 -> 10, "gold" -> "platinum", false -> true)
//   setCondition   change a question: its whole condition, a comparison, one side, its negation, add or remove a clause
//   addStep        add a step before or after a step, or at the start or end of a question's side
//   removeStep     remove a step (and everything inside it)
//   moveStep       move a step before or after another step
//   addStop        add a Stop (an error with a message): a new question that stops, or a Stop on a question's side
//   removeStop     remove a Stop (and its question, when the Stop was all the question did)
//   addInput       add an input (with a type and a default when the language needs them)
//   removeInput    remove an input the function no longer uses
//   setGivesBack   change what a step gives back (a return value), or the declared kind of answer
//   rename         rename an input or a name inside a function, or the function itself (meaning-preserving)
//   addFunction    add a new function made of Thunder steps (simple cases)
//
// Each edit is validated against the meaning tree (thunder-expr-v1, see meaning.mjs) before anything is written.
// For TypeScript, JavaScript, Python, and Go the code is written deterministically as a minimal patch: only the lines
// (often only the characters) the edit touches change; comments, formatting, and indentation stay byte for byte.
// When the language or the shape of the code is beyond the writers, the answer is `needs-ai` with a precise,
// self-contained instruction for an AI coding agent: this module never calls a network or an AI, and never applies
// anything on its own. A change written by AI is labeled "AI-written" and checked by the same proof.
//
// Proof, after every write: the patched file is read again and
//   edited     the edited function's steps must equal the intended steps, tree for tree (nothing more, nothing less)
//   unchanged  every other function in every file must mean the same: `sameMeaning` must say 'same' for each, and
//              each one's steps must be identical trees. A different reading is never called "same".
//   run        optional: a caller-supplied runner (the CLI runs a test command) — its outcome is reported as is.
// A patch that fails its proof is never returned as written.
//
// Deterministic and browser-safe (no Node APIs): it edits text and reads it; it never runs the code it edits.
import { readCode } from './read.mjs';
import { readableLanguage } from './read-repo.mjs';
import { parseExpr, parseStatement, parseStatementSpans, renderExpr, renderStatement, sameExpr, normalizeExpr, nodesOf, sayFull, blockEnd } from './meaning.mjs';
import { sameMeaning, nameKey } from './same.mjs';
import { flowOf } from './model.mjs';

export const WRITE_STEPS_SCHEMA = 'thunder-write-steps-v1';
export const WRITE_STEPS_LANGUAGES = ['typescript', 'javascript', 'python', 'go'];
export const EDIT_OPS = ['setValue', 'setCondition', 'addStep', 'removeStep', 'moveStep', 'addStop', 'removeStop', 'addInput', 'removeInput', 'setGivesBack', 'rename', 'addFunction'];

const LANG_NAME = { typescript: 'TypeScript', javascript: 'JavaScript', python: 'Python', go: 'Go', java: 'Java', csharp: 'C#', kotlin: 'Kotlin', php: 'PHP', ruby: 'Ruby', rust: 'Rust', swift: 'Swift', scala: 'Scala', elixir: 'Elixir', c: 'C', cpp: 'C++' };
const langName = (l) => LANG_NAME[l] || l;

// Two ways an edit cannot be written deterministically.
class Refused extends Error { constructor(why) { super(why); this.refused = true; } }
class NeedsAI extends Error { constructor(why) { super(why); this.needsAi = true; } }
const refuse = (why) => { throw new Refused(why); };
const needsAi = (why) => { throw new NeedsAI(why); };

// ── Text helpers ───────────────────────────────────────────────────────────────────────────────────────────

const linesOf = (s) => s.split('\n');
const indentOf = (line) => (String(line).match(/^[ \t]*/) || [''])[0];
const lineStarts = (s) => { const out = [0]; for (let i = 0; i < s.length; i++) if (s[i] === '\n') out.push(i + 1); return out; };

/** The indent one level deeper than `base`, the way this file writes it. */
function indentUnit(source, language) {
  if (language === 'go') return '\t';
  const counts = new Map();
  let prev = '';
  for (const l of linesOf(source)) {
    if (!l.trim()) continue;
    const ind = indentOf(l);
    if (ind.length > prev.length && ind.startsWith(prev)) { const u = ind.slice(prev.length); counts.set(u, (counts.get(u) || 0) + 1); }
    prev = ind;
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : language === 'python' ? '    ' : '  ';
}

/** A small unified diff: one hunk per run of changed lines, with three lines of context. */
export function unifiedDiff(path, before, after) {
  if (before === after) return '';
  const a = linesOf(before), b = linesOf(after);
  // Longest common subsequence on the middle (the common start and end are trimmed first).
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const A = a.slice(s, ea), B = b.slice(s, eb);
  const ops = [];
  if (A.length * B.length > 4e6) { for (const x of A) ops.push(['-', x]); for (const y of B) ops.push(['+', y]); }
  else {
    const dp = Array.from({ length: A.length + 1 }, () => new Uint32Array(B.length + 1));
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0;
    while (i < A.length || j < B.length) {
      if (i < A.length && j < B.length && A[i] === B[j]) { ops.push([' ', A[i]]); i++; j++; }
      else if (i < A.length && (j === B.length || dp[i + 1][j] >= dp[i][j + 1])) { ops.push(['-', A[i]]); i++; }
      else { ops.push(['+', B[j]]); j++; }
    }
  }
  const all = [...a.slice(0, s).map((x) => [' ', x]), ...ops, ...a.slice(ea).map((x) => [' ', x])];
  const out = [`--- a/${path}`, `+++ b/${path}`];
  let k = 0;
  while (k < all.length) {
    if (all[k][0] === ' ') { k++; continue; }
    let start = Math.max(0, k - 3), end = k;
    // Extend over changes separated by up to 6 unchanged lines.
    for (;;) {
      while (end < all.length && all[end][0] !== ' ') end++;
      let n = end;
      while (n < all.length && all[n][0] === ' ' && n - end < 7) n++;
      if (n < all.length && all[n][0] !== ' ' && n - end < 7) { end = n; continue; }
      break;
    }
    const stop = Math.min(all.length, end + 3);
    let la = 1, lb = 1;
    for (let q = 0; q < start; q++) { if (all[q][0] !== '+') la++; if (all[q][0] !== '-') lb++; }
    const chunk = all.slice(start, stop);
    const na = chunk.filter((x) => x[0] !== '+').length, nb = chunk.filter((x) => x[0] !== '-').length;
    out.push(`@@ -${na ? la : la - 1},${na} +${nb ? lb : lb - 1},${nb} @@`);
    for (const [op, x] of chunk) out.push(`${op}${x}`);
    k = stop;
  }
  return `${out.join('\n')}\n`;
}

// ── The meaning model of a file ────────────────────────────────────────────────────────────────────────────

const readFile = (f) => {
  const language = readableLanguage(f.path) || f.language;
  return { language, reading: readCode(f.source, { language, file: f.path, allSteps: true }) };
};
const membersOf = (reading) => reading.items.filter((i) => (i.kind === 'function' || i.kind === 'decision'));

/** A member's identity across an edit: its name and which occurrence of that name in the file. */
const memberKeys = (reading) => {
  const seen = new Map();
  return membersOf(reading).map((it) => { const n = it.name; const k = (seen.get(n) || 0) + 1; seen.set(n, k); return { key: `${n}#${k}`, item: it }; });
};

/** The steps of a function as plain trees: what the proof compares. */
export function stepShape(steps) {
  return (steps || []).filter((s) => s.expr?.kind !== 'pass').map((s) => ({
    e: s.expr ? s.expr : { kind: 'code', text: String(s.code ?? s.says ?? '').replace(/\s+/g, ' ').trim() },
    c: stepShape(s.children),
    ...(s.otherwise ? { o: stepShape(s.otherwise) } : {}),
    ...(s.handlers?.length ? { h: s.handlers.map((h) => ({ e: h.expr ?? null, c: stepShape(h.steps) })) } : {}),
    ...(s.always ? { a: stepShape(s.always.steps) } : {}),
  }));
}
const shapeKey = (shape) => JSON.stringify(normalizeExpr(shape));
const cloneShape = (x) => JSON.parse(JSON.stringify(x));
const inputsKey = (item) => JSON.stringify((item.inputs || []).map((p) => [p.name, (p.type ?? '').replace(/\s+/g, '')]));

/** Where a step is: { step, list, index, path, parent }. Paths are step numbers from 0; 'else' enters the other side. */
function locateStep(steps, sel, { flowSteps } = {}) {
  const all = [];
  const walk = (list, path, parent) => list.forEach((s, i) => {
    all.push({ step: s, list, index: i, path: [...path, i], parent });
    if (s.children) walk(s.children, [...path, i], s);
    if (s.otherwise) walk(s.otherwise, [...path, i, 'else'], s);
  });
  walk(steps || [], [], null);
  if (Array.isArray(sel)) return all.find((x) => x.path.join('.') === sel.join('.')) ?? null;
  if (typeof sel === 'string' && /^\d+(?:\.(?:\d+|else))*$/.test(sel) && sel.includes('.')) return all.find((x) => x.path.join('.') === sel) ?? null;
  const line = typeof sel === 'number' ? sel : /^line:\d+$/.test(String(sel)) ? Number(String(sel).slice(5)) : null;
  if (line != null) return all.find((x) => x.step.line === line) ?? null;
  if (/^n\d+$/.test(String(sel)) && flowSteps) {
    const node = flowOf(flowSteps).nodes.find((n) => n.id === sel);
    return node?.line != null ? all.find((x) => x.step.line === node.line) ?? null : null;
  }
  if (/^\d+$/.test(String(sel))) return all.find((x) => x.path.join('.') === String(sel)) ?? null;
  return null;
}
const pathIn = (shape, path) => {
  let list = shape, node = null;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (p === 'else') { list = node.o ?? (node.o = []); continue; }
    node = list[p];
    if (i < path.length - 1 && path[i + 1] !== 'else') list = node.c;
  }
  return { list, node, index: path[path.length - 1] };
};
const listAt = (shape, path) => {
  // The list holding the step at `path`.
  if (path.length === 1) return shape;
  const parentPath = path.slice(0, -1);
  if (parentPath[parentPath.length - 1] === 'else') return pathIn(shape, parentPath.slice(0, -1)).node.o;
  return pathIn(shape, parentPath).node.c;
};

// ── Finding the member an edit is for ──────────────────────────────────────────────────────────────────────

function parseMemberRef(ref) {
  if (ref && typeof ref === 'object') return { file: ref.file ?? null, name: ref.name, line: ref.line ?? null };
  const s = String(ref ?? '');
  // A model member id: path#owner#name#line.
  const parts = s.split('#');
  if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1])) return { file: parts[0], name: parts[parts.length - 2], line: Number(parts[parts.length - 1]) };
  const m = s.match(/^(.+?):([A-Za-z_$][\w$]*)(?::(\d+))?$/);
  if (m) return { file: m[1], name: m[2], line: m[3] ? Number(m[3]) : null };
  return { file: null, name: s, line: null };
}

function findMember(state, ref) {
  const r = parseMemberRef(ref);
  const candidates = [];
  for (const [path, f] of state.files) {
    if (r.file && path !== r.file && !path.endsWith(`/${r.file}`)) continue;
    const rd = state.read(path);
    if (!rd) continue;
    for (const { key, item } of memberKeys(rd.reading)) if (item.name === r.name) candidates.push({ path, key, item, language: rd.language, reading: rd.reading, source: f });
  }
  // A model id writes a route handler's name without spaces ("POST/api/orders"): match it ignoring spaces.
  if (!candidates.length && r.name) {
    const bare = String(r.name).replace(/\s+/g, '');
    for (const [path, f] of state.files) {
      if (r.file && path !== r.file && !path.endsWith(`/${r.file}`)) continue;
      const rd = state.read(path);
      if (!rd) continue;
      for (const { key, item } of memberKeys(rd.reading)) if (String(item.name).replace(/\s+/g, '') === bare) candidates.push({ path, key, item, language: rd.language, reading: rd.reading, source: f });
    }
  }
  if (!candidates.length) refuse(`No function named ${r.name}${r.file ? ` in ${r.file}` : ''} was found.`);
  if (r.line == null && candidates.length > 1) refuse(`${r.name} is in more than one place (${candidates.map((c) => `${c.path}:${c.item.line}`).join(', ')}); say which with its id or line.`);
  return candidates.reduce((best, c) => (r.line == null || Math.abs(c.item.line - r.line) < Math.abs(best.item.line - r.line) ? c : best));
}

// ── Values and expressions a person gives ──────────────────────────────────────────────────────────────────

/** A literal tree for a plain value, spelled the way `like` (an existing literal) is spelled. */
function literalOf(value, language, like = null) {
  if (value === null) return { kind: 'literal', type: 'null', value: null, raw: language === 'python' ? 'None' : language === 'go' ? 'nil' : 'null' };
  if (typeof value === 'boolean') return { kind: 'literal', type: 'bool', value, raw: language === 'python' ? (value ? 'True' : 'False') : String(value) };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) refuse(`${value} is not a number that can be written.`);
    let raw = String(value);
    if (like?.type === 'number' && /\.\d/.test(like.raw) && Number.isInteger(value)) raw += '.0';
    const suffix = like?.type === 'number' ? String(like.raw).match(/[A-Za-z]+$/)?.[0] ?? '' : '';
    if (suffix && !/^[eE]/.test(suffix)) raw += suffix;
    return { kind: 'literal', type: 'number', value, raw };
  }
  if (typeof value === 'string') {
    const q = like?.type === 'text' && /^'/.test(like.raw) && language !== 'go' ? "'" : '"';
    if (/[\n\r]/.test(value)) needsAi('The text has a line break; the writers keep text on one line.');
    const body = value.replace(/\\/g, '\\\\').replace(new RegExp(q, 'g'), `\\${q}`);
    return { kind: 'literal', type: 'text', value, raw: `${q}${body}${q}` };
  }
  refuse(`${JSON.stringify(value)} is not a value (use a number, text, true/false, or null).`);
}

const PARSE_ORDER = (lang) => [lang, ...WRITE_STEPS_LANGUAGES.filter((l) => l !== lang)];
/** An expression a person wrote (in Thunder's neutral form or the file's language), as a tree for this file. */
function exprFrom(input, language, what = 'expression') {
  if (input && typeof input === 'object' && input.kind) return input;
  if (typeof input !== 'string') return literalOf(input, language);
  for (const l of PARSE_ORDER(language)) {
    const t = parseExpr(input, l);
    if (t && t.kind !== 'code') return adapt(t, language);
  }
  refuse(`The ${what} "${input}" could not be read. Write it as code, for example days > 10 and not member.vip.`);
}
/** Adapt a tree read in another language to this file's spelling (== in JavaScript is ===, quotes, true/True). */
function adapt(tree, language) {
  const t = cloneShape(tree);
  for (const n of nodesOf(t)) {
    if ((language === 'typescript' || language === 'javascript') && n.kind === 'compare') { if (n.op === '==') n.op = '==='; if (n.op === '!=') n.op = '!=='; }
    if (language !== 'typescript' && language !== 'javascript' && n.kind === 'compare') { if (n.op === '===') n.op = '=='; if (n.op === '!==') n.op = '!='; }
    if (n.kind === 'literal' && n.type === 'bool') n.raw = language === 'python' ? (n.value ? 'True' : 'False') : String(n.value);
    if (n.kind === 'literal' && n.type === 'null') n.raw = language === 'python' ? 'None' : language === 'go' ? 'nil' : 'null';
    if (n.kind === 'literal' && n.type === 'text' && language === 'go' && /^'/.test(n.raw)) n.raw = JSON.stringify(n.value);
  }
  return t;
}
/** A statement a person wrote, as a tree for this file. */
function statementFrom(input, language) {
  if (input && typeof input === 'object' && input.kind) return input;
  if (typeof input !== 'string' || !input.trim()) refuse('Say the new step as code, for example notify(order.customer).');
  for (const l of PARSE_ORDER(language)) {
    const t = parseStatement(input, l);
    if (t && t.kind !== 'code') {
      const a = adapt(t, language);
      try { renderStatement(a, language); return a; } catch { /* try the next reading */ }
    }
  }
  refuse(`The step "${input}" could not be read as one statement.`);
}

// ── Writing one step's code from its new tree, changing only what differs ─────────────────────────────────

const STATEMENT_KINDS = new Set(['if', 'return', 'throw', 'assign', 'loop', 'switch', 'case', 'declare', 'yield', 'defer', 'go', 'delete', 'assert', 'with']);
const SCALAR_SKIP = new Set(['raw', 'error', 'message']);
const isNode = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.kind === 'string';

/** Replacements [{ range, text, node }] that turn `o` into `n`, at the smallest parts that differ; null when a part has no known place. */
function diffTrees(o, n, sp, language) {
  if (sameExpr(o, n)) return [];
  const whole = () => {
    const range = sp.rangeOf(o);
    if (!range) return null;
    return [{ range, text: renderPart(n, o, sp, language), node: n, old: o }];
  };
  if (o.kind !== n.kind) return whole();
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
  const out = [];
  for (const k of keys) {
    const a = o[k], b = n[k];
    if (isNode(a) && isNode(b)) { const d = diffTrees(a, b, sp, language); if (d == null) return whole(); out.push(...d); continue; }
    if (Array.isArray(a) && Array.isArray(b) && a.every((x) => isNode(x) || typeof x !== 'object') && b.every((x) => isNode(x) || typeof x !== 'object')) {
      if (a.length !== b.length) {
        // An and/or that gained or lost a clause: the whole condition is written again.
        return whole();
      }
      for (let i = 0; i < a.length; i++) {
        if (isNode(a[i]) && isNode(b[i])) { const d = diffTrees(a[i], b[i], sp, language); if (d == null) return whole(); out.push(...d); }
        else if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return whole();
      }
      continue;
    }
    if (JSON.stringify(normalizeExpr(a)) === JSON.stringify(normalizeExpr(b))) continue;
    if (SCALAR_SKIP.has(k) && (STATEMENT_KINDS.has(o.kind) || (k === 'raw' && o.kind === 'literal'))) continue;
    if (o.kind === 'compare' && k === 'op') { out.push({ op: true, from: a, to: b, node: o }); continue; }
    return whole();
  }
  return out;
}
function renderPart(n, old, sp, language) {
  if (n.kind === 'literal' && old?.kind === 'literal' && n.type === old.type && n.type === 'text' && !n.raw) return literalOf(n.value, language, old).raw;
  return renderExpr(n, language);
}

/** Where an operator sits between a compare's two sides, in the statement's text. */
function opRange(sp, node, text) {
  const l = sp.rangeOf(node.left), r = sp.rangeOf(node.right);
  if (!l || !r) return null;
  const mid = text.slice(l[1], r[0]);
  const at = mid.indexOf(String(node.op === '==' && mid.includes('===') ? '===' : node.op));
  const m = mid.match(/(===|!==|==|!=|<=|>=|<|>|\bis not\b|\bnot in\b|\bis\b|\bin\b)/);
  if (!m) return at >= 0 ? [l[1] + at, l[1] + at + node.op.length] : null;
  return [l[1] + m.index, l[1] + m.index + m[0].length];
}

const COMPOUND = new Set(['binary', 'logic', 'compare', 'chain', 'conditional', 'not', 'lambda', 'assign']);
/** The new text of a statement head: the old text with only the differing parts replaced, verified by reading it again. */
function rewriteCode(code, oldTree, newTree, language) {
  const sp = parseStatementSpans(code, language);
  const attempts = [];
  if (sp && sameExpr(sp.tree, oldTree)) {
    const reps = diffTrees(sp.tree, newTree, sp, language);
    if (reps) {
      const build = (paren) => {
        let text = sp.source;
        const edits = reps.map((r) => {
          if (r.op) { const rg = opRange(sp, r.node, sp.source); if (!rg) return null; return { range: rg, text: r.to }; }
          return { range: r.range, text: paren && COMPOUND.has(r.node.kind) && !COMPOUND.has(r.old?.kind) ? `(${r.text})` : r.text };
        });
        if (edits.some((e) => !e)) return null;
        edits.sort((a, b) => b.range[0] - a.range[0]);
        for (let i = 1; i < edits.length; i++) if (edits[i].range[1] > edits[i - 1].range[0]) return null;
        for (const e of edits) text = text.slice(0, e.range[0]) + e.text + text.slice(e.range[1]);
        return text;
      };
      attempts.push(build(false), build(true));
    }
  }
  // Last: the whole head written from the tree, keeping how the original opened its block.
  try {
    let head = renderStatement(newTree, language);
    if (/\n\s*pass$/.test(head) && language === 'python') head = head.replace(/\n\s*pass$/, '');
    else if (/\{\n\}$/.test(head)) head = head.replace(/\n\}$/, '');
    const trimmed = code.trim();
    if (trimmed.endsWith('{') && !head.endsWith('{')) head = `${head} {`;
    if (!trimmed.endsWith(';') && head.endsWith(';') && !/[{:]$/.test(trimmed)) head = head.replace(/;$/, '');
    attempts.push(head);
  } catch { /* the writer cannot say it */ }
  for (const a of attempts) {
    if (a == null) continue;
    const back = parseStatement(a, language);
    if (sameExpr(back, newTree)) return a;
  }
  needsAi(`The writer could not express "${sayFull(newTree)}" in ${langName(language)} so that it reads back exactly.`);
}

/** The lines of a step's head (its own statement, not its block's steps). */
function headLines(step) {
  const first = step.span?.startLine ?? step.line;
  const inner = [...(step.children || []), ...(step.otherwise || [])].map((c) => c.line).filter((l) => l != null && l >= first);
  const last = inner.length ? Math.max(first, Math.min(...inner) - 1) : step.span?.endLine ?? first;
  return [first, last];
}

/** Replace a step's head in the file with code for `newTree`. Returns the new source. */
function writeStepTree(source, step, newTree, language) {
  const [a, b] = headLines(step);
  const starts = lineStarts(source);
  const from = starts[a - 1], to = b < starts.length ? starts[b] - 1 : source.length;
  const region = source.slice(from, to);
  let code = String(step.code ?? '').trim();
  // A head over several lines (a condition that wraps) is edited as a whole when it reads as this step.
  if (b > a) {
    const whole = region.trim().replace(language === 'python' ? /\s*#[^\n'"]*$/ : /\s*\/\/[^\n'"]*$/, '');
    const sp = parseStatementSpans(whole, language);
    if (sp && step.expr && sameExpr(sp.tree, step.expr)) code = whole;
  }
  let at = code ? region.indexOf(code) : -1;
  if (at >= 0 && region.indexOf(code, at + 1) >= 0) at = -1;
  if (at >= 0) {
    const next = rewriteCode(code, step.expr, newTree, language);
    return source.slice(0, from + at) + next + source.slice(from + at + code.length);
  }
  // The step's code is not written in one piece in the file (an elif, a condition over several lines): rewrite only
  // the condition, when it is written exactly once in the step's lines and nothing else about the step changes.
  const testKey = step.expr?.test && newTree.test && sameExpr({ ...step.expr, test: null }, { ...newTree, test: null });
  if (testKey) {
    const sp = parseStatementSpans(code, language);
    const variants = [sp?.textOf(sp.tree.test), (() => { try { return renderExpr(step.expr.test, language); } catch { return null; } })()].filter(Boolean);
    for (const v of variants) {
      const i = region.indexOf(v);
      if (i < 0 || region.indexOf(v, i + 1) >= 0) continue;
      const next = rewriteCode(v, step.expr.test, newTree.test, language);
      return source.slice(0, from + i) + next + source.slice(from + i + v.length);
    }
  }
  needsAi(`The code of the step at line ${step.line} is spread over lines in a way the writer does not edit in place.`);
}

// ── Writing whole statements and blocks ────────────────────────────────────────────────────────────────────

/** Code lines for a list of new steps (trees, with `children` and `otherwise`), indented from `indent`. */
function renderBlock(steps, language, indent, unit) {
  const out = [];
  for (const s of steps) {
    const tree = s.e;
    let head;
    try { head = renderStatement(tree, language); } catch (e) { needsAi(`${langName(language)} cannot say "${sayFull(tree)}" this way (${e.message}).`); }
    const opens = /\n\s*pass$/.test(head) || /\{\n\}$/.test(head);
    if (!opens) { for (const l of head.split('\n')) out.push(indent + l); continue; }
    const h = language === 'python' ? head.replace(/\n\s*pass$/, '') : head.replace(/\n\}$/, '');
    out.push(indent + h);
    if (s.c?.length) out.push(...renderBlock(s.c, language, indent + unit, unit));
    else if (language === 'python') out.push(`${indent}${unit}pass`);
    if (s.o) {
      if (language === 'python') { out.push(`${indent}else:`); out.push(...(s.o.length ? renderBlock(s.o, language, indent + unit, unit) : [`${indent}${unit}pass`])); }
      else { out.push(`${indent}} else {`); out.push(...renderBlock(s.o, language, indent + unit, unit)); out.push(`${indent}}`); }
    } else if (language !== 'python') out.push(`${indent}}`);
  }
  return out;
}

/** A step a person described, as a shape node: a statement, or { if, then, else }, or { stop, error }. */
function stepSpec(spec, ctx) {
  const { language } = ctx;
  if (typeof spec === 'string' || spec?.kind) return { e: statementFrom(spec, language), c: [] };
  if (spec && typeof spec === 'object' && 'if' in spec) {
    const test = exprFrom(spec.if, language, 'condition');
    return { e: { kind: 'if', test }, c: (spec.then || []).map((x) => stepSpec(x, ctx)), ...(spec.else ? { o: spec.else.map((x) => stepSpec(x, ctx)) } : {}) };
  }
  if (spec && typeof spec === 'object' && 'stop' in spec) return { e: stopTree(ctx, spec.error, spec.stop), c: [] };
  refuse(`A step must be code (a string), { if, then, else }, or { stop, error }; got ${JSON.stringify(spec)}.`);
}

// ── Stops ──────────────────────────────────────────────────────────────────────────────────────────────────

const GO_ZERO = (t) => {
  t = t.trim();
  if (t === 'error' || /^(\*|\[\]|map\[|chan\b|func\b|interface\b)/.test(t) || t === 'any') return 'nil';
  if (/^(bool)$/.test(t)) return 'false';
  if (/^(u?int(8|16|32|64)?|float(32|64)|byte|rune|uintptr|complex(64|128))$/.test(t)) return '0';
  if (t === 'string') return '""';
  return null;
};
/** The results a Go function declares: ['bool', 'error'], or [] for none. */
function goResults(source, item) {
  const sig = signatureRange(source, item, 'go');
  if (!sig) return null;
  const after = source.slice(sig.close + 1, source.indexOf('{', sig.close + 1)).trim();
  if (!after) return [];
  const inner = after.startsWith('(') ? after.slice(1, after.lastIndexOf(')')) : after;
  return splitTop(inner).map((x) => { const parts = x.trim().split(/\s+/); return parts.length > 1 && !/^[*\[]/.test(parts[parts.length - 1]) ? parts.slice(1).join(' ') : x.trim(); });
}
/** The comma-separated parts of source[from, to) at the top level, with their offsets. */
function partsWithOffsets(source, from, to) {
  const out = []; let depth = 0, start = from;
  for (let i = from; i < to; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < to && source[i] !== q) { if (source[i] === '\\') i++; i++; } continue; }
    if ('([{<'.includes(c)) depth++;
    if (')]}>'.includes(c) && source[i - 1] !== '=') depth--;
    if (c === ',' && depth === 0) { out.push({ start, end: i, text: source.slice(start, i) }); start = i + 1; }
  }
  if (source.slice(start, to).trim()) out.push({ start, end: to, text: source.slice(start, to) });
  return out;
}
function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (const c of s) { if ('([{'.includes(c)) depth++; if (')]}'.includes(c)) depth--; if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c; }
  if (cur.trim()) out.push(cur);
  return out;
}

/** A text literal spelled the way most text in this file is spelled (its quote style). */
function quoteLike(source, language) {
  if (language === 'go') return null;
  const single = (String(source).match(/(^|[\s(,=:[])'[^'\n]*'/g) || []).length;
  const double = (String(source).match(/(^|[\s(,=:[])"[^"\n]*"/g) || []).length;
  return single > double ? { type: 'text', raw: "'x'" } : null;
}

/** Add an import to a Go file: into its import ( … ) block in order, beside a single import, or after the package line. */
function addGoImport(source, pkg) {
  const L = linesOf(source);
  const line = `"${pkg}"`;
  const block = L.findIndex((l) => /^import\s*\($/.test(l.trim()));
  if (block >= 0) {
    let end = block + 1;
    while (end < L.length && L[end].trim() !== ')') end++;
    // The first group (standard library) is kept in order.
    let at = block + 1;
    while (at < end && L[at].trim() && L[at].trim() < line) at++;
    L.splice(at, 0, `\t${line}`);
    return L.join('\n');
  }
  const single = L.findIndex((l) => /^import\s+"/.test(l));
  if (single >= 0) {
    const other = L[single].replace(/^import\s+/, '').trim();
    L.splice(single, 1, 'import (', ...[other, line].sort().map((x) => `\t${x}`), ')');
    return L.join('\n');
  }
  const pkgLine = L.findIndex((l) => /^package\s/.test(l));
  L.splice(pkgLine + 1, 0, '', `import ${line}`);
  return L.join('\n');
}

/** The tree of a Stop in this file's language: throw new Error("…") / raise ValueError("…") / return …, errors.New("…"). */
function stopTree(ctx, error, message) {
  const { language, source, item } = ctx;
  if (typeof message !== 'string' || !message.trim()) refuse('A Stop needs a message that says why it stops.');
  const text = literalOf(message, language, quoteLike(source, language)).raw;
  if (language === 'python') return statementFrom(`raise ${error || 'ValueError'}(${text})`, language);
  if (language === 'typescript' || language === 'javascript') return statementFrom(`throw new ${error || 'Error'}(${text});`, language);
  if (language === 'go') {
    const results = goResults(source, item);
    if (!results || !results.length || results[results.length - 1] !== 'error') needsAi(`${item.name} does not give back an error, so a Stop in Go needs its signature changed.`);
    const zeros = results.slice(0, -1).map(GO_ZERO);
    if (zeros.some((z) => z == null)) needsAi(`The writer does not know the empty value of ${results.join(', ')} in Go.`);
    if (error) needsAi('A named error type in Go needs its own constructor; the writer uses errors.New.');
    const pkg = /^\s*"errors"\s*$/m.test(source) || /^import\s+"errors"/m.test(source) ? 'errors.New' : /^\s*"fmt"\s*$/m.test(source) || /^import\s+"fmt"/m.test(source) ? 'fmt.Errorf' : null;
    // Neither imported: "errors" is added to the file's imports (shown in the patch).
    if (!pkg) ctx.goImport = 'errors';
    const msg = pkg === 'fmt.Errorf' ? literalOf(message.replace(/%/g, '%%'), language).raw : text;
    return statementFrom(`return ${[...zeros, `${pkg ?? 'errors.New'}(${msg})`].join(', ')}`, language);
  }
  needsAi(`Stops are written for TypeScript, JavaScript, Python, and Go; this file is ${langName(language)}.`);
}

// ── Signatures ─────────────────────────────────────────────────────────────────────────────────────────────

/** Where a function's inputs are written: { open, close } offsets of its ( and ). */
function signatureRange(source, item, language) {
  const starts = lineStarts(source);
  const from = starts[item.line - 1];
  const nameAt = (() => {
    const re = new RegExp(`(^|[^\\w$])${item.name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');
    re.lastIndex = from;
    const m = re.exec(source);
    return m && m.index < from + 2000 ? m.index + m[1].length + item.name.length : -1;
  })();
  if (nameAt < 0) return null;
  let open = source.indexOf('(', nameAt);
  if (open < 0) return null;
  // Go methods name their receiver first: func (s *Svc) Name(…) — the name is found after it, so `open` is right.
  let depth = 0, close = -1;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < source.length && source[i] !== q) { if (source[i] === '\\') i++; i++; } continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) { close = i; break; } }
  }
  if (close < 0) return null;
  void language;
  return { open, close };
}

/** The last line of a function (its closing brace, or its last indented line in Python). */
function functionEndLine(source, item, language) {
  const L = linesOf(source);
  if (language === 'python') {
    const base = indentOf(L[item.line - 1]).length;
    let last = item.line;
    let i = item.line;
    // Skip the rest of a signature over several lines.
    while (i < L.length && !/:\s*(#.*)?$/.test(L[i - 1])) i++;
    for (let j = i; j < L.length; j++) {
      const l = L[j];
      if (!l.trim()) continue;
      if (indentOf(l).length <= base) break;
      last = j + 1;
    }
    return last;
  }
  const sig = signatureRange(source, item, language);
  if (!sig) return null;
  const open = source.indexOf('{', sig.close);
  // An arrow with an expression body (`(x) => x + 1`) has no braces of its own: it ends where its steps end.
  if (open < 0 || !/^\s*(?::[^{;=]*?)?\s*(?:=>)?\s*$/.test(source.slice(sig.close + 1, open))) return memberEnd(item);
  const end = blockEnd(source, open, language);
  if (end < 0) return null;
  return lineStarts(source).filter((s) => s <= end).length;
}

// ── Identifiers (for rename) ───────────────────────────────────────────────────────────────────────────────

/** Offsets of the identifier `name` in source[from, to), outside strings and comments (and not after a dot). */
function identifierSites(source, name, from, to, language) {
  const out = [];
  const comment = language === 'python' ? ['#'] : ['//', '/*'];
  let i = from, prevSig = '';
  const isId = (c) => /[\w$]/.test(c ?? '');
  const scanTemplate = (start, end, open, close) => {
    // Names inside ${…} (JavaScript) or {…} (Python f-strings).
    const body = source.slice(start, end);
    const re = new RegExp(`${open.replace(/[$]/g, '\\$').replace(/[{]/g, '\\{')}([^}]*)${close.replace(/[}]/g, '\\}')}`, 'g');
    let m;
    while ((m = re.exec(body))) {
      const inner = m[1];
      const base = start + m.index + open.length;
      const r2 = new RegExp(`(^|[^\\w$.])(${name.replace(/\$/g, '\\$')})(?![\\w$])`, 'g');
      let k;
      while ((k = r2.exec(inner))) out.push(base + k.index + k[1].length);
    }
  };
  while (i < to) {
    const c = source[i];
    if (comment.some((s) => source.startsWith(s, i))) {
      if (source.startsWith('/*', i)) { const j = source.indexOf('*/', i + 2); i = j < 0 ? to : j + 2; }
      else { const j = source.indexOf('\n', i); i = j < 0 ? to : j; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const prefix = language === 'python' ? (source.slice(Math.max(0, i - 2), i).match(/[fFrRbBuU]{0,2}$/)?.[0] ?? '') : '';
      const triple = language === 'python' && source.startsWith(c.repeat(3), i);
      const endQ = triple ? c.repeat(3) : c;
      let j = i + endQ.length;
      while (j < source.length && !source.startsWith(endQ, j)) j += source[j] === '\\' ? 2 : 1;
      const end = j;
      if (c === '`' && language !== 'go') scanTemplate(i + 1, end, '${', '}');
      if (/[fF]/.test(prefix)) scanTemplate(i + endQ.length, end, '{', '}');
      i = end + endQ.length;
      prevSig = c;
      continue;
    }
    // A Python string prefix (r"…", f'…', rb"…") belongs to the string, not a name.
    if (language === 'python' && /[rRbBuUfF]/.test(c) && !isId(source[i - 1])) { const m = source.slice(i, i + 3).match(/^[rRbBuUfF]{1,2}(?=["'])/); if (m) { i += m[0].length; continue; } }
    if (isId(c) && !/\d/.test(c)) {
      let j = i;
      while (j < to && isId(source[j])) j++;
      const word = source.slice(i, j);
      // After a dot (also across lines: `x\n  .name`) it is a field or method of something else.
      if (word === name && prevSig !== '.') out.push(i);
      i = j;
      prevSig = 'a';
      continue;
    }
    if (c === '.' && source.startsWith('...', i)) { prevSig = '…'; i += 3; continue; }
    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return out.sort((a, b) => a - b);
}
const renameTree = (tree, from, to) => {
  const t = cloneShape(tree);
  // Object keys ({ days: 1 }, Go's Command{Use: …}) name a field, not this name: they are left alone.
  const keys = new Set();
  for (const n of nodesOf(t)) if (n.kind === 'object') for (const e of n.entries || []) if (e.key && !e.computed && !e.shorthand && e.key.kind === 'name') keys.add(e.key);
  const idRe = new RegExp(`(^|[^\\w$.])${from.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');
  for (const n of nodesOf(t)) {
    if (keys.has(n)) continue;
    if (n.kind === 'object') for (const e of n.entries || []) if (e.shorthand && e.value?.kind === 'name' && e.value.name === from) { delete e.shorthand; if (!e.key) e.key = { kind: 'name', name: from }; keys.add(e.key); }
    // Code Thunder keeps as text: its names are renamed in the text (outside quotes).
    if (n.kind === 'code' && typeof n.text === 'string') n.text = n.text.split(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/).map((part, i) => (i % 2 ? part : part.replace(idRe, `$1${to}`))).join('');
    if (n.kind === 'name' && n.name === from) n.name = to;
    if (n.kind === 'lambda' && Array.isArray(n.params)) n.params = n.params.map((p) => (p === from ? to : p));
    if (n.kind === 'pattern' && Array.isArray(n.names)) { n.names = n.names.map((p) => (p === from ? to : p)); n.text = n.text.replace(new RegExp(`\\b${from}\\b`, 'g'), to); }
    if (n.kind === 'declare' && Array.isArray(n.names)) n.names = n.names.map((p) => (p === from ? to : p));
    if (n.kind === 'function' && n.name === from) n.name = to;
    // Names written inside text ("…{name}…", `…${name}…`) are kept in a throw's message and in interpolated text.
    if (n.kind === 'throw' && typeof n.message === 'string') n.message = inBraces(n.message, from, to);
    if (n.kind === 'literal' && n.interpolated) { if (typeof n.raw === 'string') n.raw = inBraces(n.raw, from, to); if (typeof n.value === 'string') n.value = inBraces(n.value, from, to); }
  }
  return t;
};
const inBraces = (text, from, to) => text.replace(/\{[^{}]*\}/g, (m) => m.replace(new RegExp(`(^|[^\\w$.])${from.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'), `$1${to}`));
const renameShape = (shape, from, to) => shape.map((s) => ({ ...s, e: s.e ? renameTree(s.e, from, to) : s.e, c: renameShape(s.c || [], from, to), ...(s.o ? { o: renameShape(s.o, from, to) } : {}), ...(s.h ? { h: s.h.map((h) => ({ e: h.e ? renameTree(h.e, from, to) : h.e, c: renameShape(h.c, from, to) })) } : {}), ...(s.a ? { a: renameShape(s.a, from, to) } : {}) }));
const namesUsed = (shape) => {
  const out = new Set();
  const go = (list) => { for (const s of list || []) { if (s.e) for (const n of nodesOf(s.e)) if (n.kind === 'name') out.add(n.name); go(s.c); go(s.o); (s.h || []).forEach((h) => go(h.c)); go(s.a); } };
  go(shape);
  return out;
};
const firstUse = (steps, name) => {
  let line = null;
  const go = (list) => { for (const s of list || []) { if (line != null) return; if (s.expr && [...nodesOf(s.expr)].some((n) => n.kind === 'name' && n.name === name)) { line = s.line; return; } go(s.children); go(s.otherwise); (s.handlers || []).forEach((h) => go(h.steps)); go(s.always?.steps); } };
  go(steps);
  return line;
};

// ── Line edits ─────────────────────────────────────────────────────────────────────────────────────────────

const stepLines = (step) => [step.span?.startLine ?? step.line, step.span?.endLine ?? step.line];
function spliceLines(source, start, deleteCount, insert = []) {
  const L = linesOf(source);
  L.splice(start - 1, deleteCount, ...insert);
  return L.join('\n');
}
/** A step's lines must hold that step alone (not `} else {`, not two statements on one line). */
function ownsLines(source, step) {
  const [a, b] = stepLines(step);
  const L = linesOf(source);
  const first = L[a - 1]?.trim() ?? '';
  const code = String(step.code ?? '').trim();
  // Letters and digits only: the reader's code can differ from the file in punctuation and spacing.
  const a1 = first.replace(/[^A-Za-z0-9_]+/g, ''), c1 = code.replace(/[^A-Za-z0-9_]+/g, '');
  if (!a1 || !c1.startsWith(a1.slice(0, Math.min(a1.length, c1.length, 10)))) return false;
  const last = L[b - 1]?.trim() ?? '';
  if (b > a && /^\}\s*(else|catch|finally)\b/.test(last)) return false;
  // Something after the step on its last line (another statement) means the lines are shared.
  return true;
}

// ── The operations ─────────────────────────────────────────────────────────────────────────────────────────

const SIDES = { yes: 'c', no: 'o' };
const sayStep = (s) => s?.says ?? sayFull(s?.expr ?? { kind: 'code', text: s?.code ?? '' });
const q = (s) => `"${s}"`;

/** Find the literal in a step to change: by its old value, or the only literal there is. */
function findLiteral(tree, from) {
  const lits = [...nodesOf(tree)].filter((n) => n.kind === 'literal' && /^(number|text|bool|null)$/.test(n.type));
  if (from === undefined) {
    if (lits.length === 1) return lits[0];
    refuse(lits.length ? `This step has ${lits.length} values (${lits.map((l) => l.raw).join(', ')}); say which one with "from".` : 'This step has no value to change.');
  }
  const hits = lits.filter((l) => l.value === from || l.raw === String(from) || (typeof from === 'string' && l.type === 'number' && Number(from) === l.value));
  if (hits.length === 1) return hits[0];
  if (!hits.length) refuse(`This step has no value ${JSON.stringify(from)}${lits.length ? `; it has ${lits.map((l) => l.raw).join(', ')}` : ''}.`);
  refuse(`The value ${JSON.stringify(from)} is in this step ${hits.length} times; the writer changes one value at a time ("at" picks which, from 0).`);
}

function opSetValue(ctx, edit) {
  const { step } = ctx.at(edit.step);
  if (!step.expr || step.expr.kind === 'code') needsAi(`The step at line ${step.line} is shown as code; Thunder has no tree for it to change exactly.`);
  const tree = cloneShape(step.expr);
  let lit;
  if (edit.at != null) {
    const lits = [...nodesOf(tree)].filter((n) => n.kind === 'literal' && (edit.from === undefined || n.value === edit.from || n.raw === String(edit.from)));
    lit = lits[edit.at];
    if (!lit) refuse(`There is no value number ${edit.at} like that in this step.`);
  } else lit = findLiteral(tree, edit.from);
  const next = literalOf(edit.to, ctx.language, lit);
  if (next.type === lit.type && next.value === lit.value) refuse(`The value is already ${lit.raw}.`);
  const old = lit.raw;
  Object.keys(lit).forEach((k) => delete lit[k]);
  Object.assign(lit, next);
  ctx.setTree(step, tree);
  return `Changed ${old} to ${next.raw} in ${q(sayStep(step))}`;
}

const CMP_OPS = ['<', '<=', '>', '>=', '==', '!=', '===', '!=='];
function opSetCondition(ctx, edit) {
  const { step } = ctx.at(edit.step);
  const e = step.expr;
  if (!e || !(e.kind === 'if' || (e.kind === 'loop' && e.test))) refuse(`The step at line ${step.line} is not a question (an if) or a repeat-while; only those have a condition.`);
  if (e.kind === 'if' && e.negate) needsAi('This question is written with unless; the writer does not edit it in place.');
  const tree = cloneShape(e);
  let test = tree.test;
  const clauses = () => (test.kind === 'logic' ? test.operands : [test]);
  const pick = (i) => {
    const cs = clauses();
    if (i == null) { if (cs.length === 1) return { node: cs[0], set: (n) => { test = n; } }; refuse(`This question has ${cs.length} parts joined by ${test.op}; say which part with "clause" (from 0).`); }
    if (!cs[i]) refuse(`This question has ${cs.length} part${cs.length === 1 ? '' : 's'}; there is no part ${i}.`);
    return { node: cs[i], set: (n) => { if (test.kind === 'logic') test.operands[i] = n; else test = n; } };
  };
  const did = [];
  if (edit.when != null) { test = exprFrom(edit.when, ctx.language, 'condition'); did.push(`now asks ${sayFull(test)}`); }
  if (edit.compare != null) {
    const { node } = pick(edit.clause);
    const target = node.kind === 'not' ? null : node;
    if (!target || target.kind !== 'compare') refuse('That part of the question is not a comparison, so it has no comparison to change.');
    let op = String(edit.compare);
    if ((ctx.language === 'typescript' || ctx.language === 'javascript') && (op === '==' || op === '!=') && /===|!==/.test(target.op)) op += '=';
    if (!CMP_OPS.includes(op)) refuse(`${op} is not a comparison (use <, <=, >, >=, ==, !=).`);
    if (target.op === op) refuse(`The comparison is already ${op}.`);
    did.push(`changed ${target.op} to ${op}`);
    target.op = op;
  }
  if (edit.operand != null) {
    const { node } = pick(edit.clause);
    const side = edit.operand.side || 'right';
    const target = node.kind === 'compare' ? node : null;
    if (!target) refuse('That part of the question is not a comparison, so it has no sides.');
    if (side !== 'left' && side !== 'right') refuse('A side is "left" or "right".');
    const next = exprFrom(edit.operand.to, ctx.language, 'value');
    const like = target[side];
    target[side] = next.kind === 'literal' && like.kind === 'literal' && next.type === like.type ? literalOf(next.value, ctx.language, like) : next;
    did.push(`changed ${renderExpr(like, ctx.language)} to ${renderExpr(target[side], ctx.language)}`);
  }
  if (edit.negate) {
    if (edit.clause != null) {
      const { node, set } = pick(edit.clause);
      set(node.kind === 'not' ? node.value : { kind: 'not', value: node });
    } else test = test.kind === 'not' ? test.value : { kind: 'not', value: test };
    did.push('turned the question around');
  }
  if (edit.addClause != null) {
    const join = edit.addClause.join || 'and';
    if (join !== 'and' && join !== 'or') refuse('A new part joins with "and" or "or".');
    const part = exprFrom(edit.addClause.when, ctx.language, 'condition');
    test = test.kind === 'logic' && test.op === join ? { ...test, operands: [...test.operands, part] } : { kind: 'logic', op: join, operands: [test, part] };
    did.push(`added "${join} ${sayFull(part)}"`);
  }
  if (edit.removeClause != null) {
    if (test.kind !== 'logic') refuse('This question has one part; remove the question instead (removeStep).');
    const i = Number(edit.removeClause);
    if (!test.operands[i]) refuse(`This question has ${test.operands.length} parts; there is no part ${i}.`);
    const ops = test.operands.filter((_, k) => k !== i);
    did.push(`removed "${sayFull(test.operands[i])}"`);
    test = ops.length === 1 ? ops[0] : { ...test, operands: ops };
  }
  if (!did.length) refuse('Say what to change in the question: when, compare, operand, negate, addClause, or removeClause.');
  tree.test = test;
  if (sameExpr(tree, e)) refuse('Nothing would change: the question already reads that way.');
  ctx.setTree(step, tree);
  return `Changed the question ${q(sayStep(step))}: ${did.join(', ')}`;
}

function opSetGivesBack(ctx, edit) {
  if (edit.type != null) {
    const { item, language } = ctx;
    const sig = signatureRange(ctx.source, item, language);
    if (!sig) needsAi('The writer could not find where this function declares what it gives back.');
    const src = ctx.source;
    const bodyOpen = language === 'python' ? src.indexOf(':', sig.close) : src.indexOf('{', sig.close);
    const between = src.slice(sig.close + 1, bodyOpen);
    let next;
    if (language === 'python') next = /->/.test(between) ? between.replace(/->\s*[^:]+?(\s*)$/, `-> ${edit.type}$1`) : `${between.replace(/\s*$/, '')} -> ${edit.type}`;
    else if (language === 'typescript') next = /:/.test(between) ? between.replace(/:\s*[^{]+?(\s*)$/, `: ${edit.type}$1`) : `: ${edit.type} `;
    else if (language === 'go') next = between.trim() ? ` ${edit.type} ` : ` ${edit.type} `;
    else needsAi(`${langName(language)} has no declared kind of answer the writer can change.`);
    if (between === next) refuse(`It already gives back ${edit.type}.`);
    ctx.replaceText(sig.close + 1, bodyOpen, next);
    ctx.expectReturns = edit.type;
    return `Now gives back ${edit.type}`;
  }
  let target;
  if (edit.step != null) target = ctx.at(edit.step).step;
  else {
    const rets = [];
    const go = (list) => (list || []).forEach((s) => { if (s.expr?.kind === 'return') rets.push(s); go(s.children); go(s.otherwise); });
    go(ctx.steps);
    if (rets.length !== 1) refuse(`${ctx.item.name} gives back in ${rets.length} places; say which with "step".`);
    target = rets[0];
  }
  if (target.expr?.kind !== 'return') refuse(`The step at line ${target.line} does not give anything back.`);
  if (edit.value === undefined) refuse('Say the new value with "value".');
  // Several values at once (Go and Python: `true, nil`) are read as a return statement.
  const several = typeof edit.value === 'string' && splitTop(edit.value).length > 1 && ctx.language !== 'typescript' && ctx.language !== 'javascript';
  const value = several ? (() => { const t = parseStatement(`return ${edit.value}`, ctx.language); if (t.kind !== 'return' || !t.value) refuse(`The value "${edit.value}" could not be read.`); return t.value; })() : exprFrom(edit.value, ctx.language, 'value');
  const tree = { ...cloneShape(target.expr), value: value.kind === 'literal' && target.expr.value?.kind === 'literal' && value.type === target.expr.value.type ? literalOf(value.value, ctx.language, target.expr.value) : value };
  if (sameExpr(tree, target.expr)) refuse('It already gives that back.');
  ctx.setTree(target, tree);
  return `Changed ${q(sayStep(target))} to give back ${renderExpr(tree.value, ctx.language)}`;
}

/** Where a new step goes: { lineIndex (insert before this 1-based line), indent, shapeList, shapeIndex }. */
function placeFor(ctx, edit) {
  const pos = ['before', 'after', 'into'].find((k) => edit[k] != null);
  if (!pos) refuse('Say where the new step goes: before, after, or into ({ step, side: "yes" | "no", at: "start" | "end" }).');
  if (pos === 'into') {
    const into = typeof edit.into === 'object' && !Array.isArray(edit.into) ? edit.into : { step: edit.into };
    const loc = ctx.at(into.step);
    const p = loc.step;
    const side = into.side || 'yes';
    if (!SIDES[side]) refuse('A side is "yes" or "no".');
    const kids = side === 'yes' ? p.children || [] : p.otherwise;
    if (!(p.expr?.kind === 'if' || p.expr?.kind === 'loop' || (side === 'yes' && p.children))) refuse(`The step at line ${p.line} is not a question or a repeat, so it has no side to add to.`);
    if (side === 'no' && !kids) return { pos, newElse: true, loc };
    if (!kids?.length) needsAi(`The ${side} side of ${q(sayStep(p))} is empty in the code; the writer adds next to an existing step.`);
    const atEnd = into.at !== 'start';
    const anchor = atEnd ? kids[kids.length - 1] : kids[0];
    const [a, b] = stepLines(anchor);
    return { pos, line: atEnd ? b + 1 : a, indent: indentOf(linesOf(ctx.source)[a - 1]), shapePath: [...loc.path, ...(side === 'no' ? ['else'] : []), atEnd ? kids.length : 0], loc };
  }
  const loc = ctx.at(edit[pos]);
  const [a, b] = stepLines(loc.step);
  if (!ownsLines(ctx.source, loc.step)) needsAi(`The step at line ${loc.step.line} shares its lines with other code, so the writer cannot place a step ${pos} it.`);
  const path = [...loc.path];
  if (pos === 'after') path[path.length - 1] += 1;
  return { pos, line: pos === 'after' ? b + 1 : a, indent: indentOf(linesOf(ctx.source)[a - 1]), shapePath: path, loc };
}
function insertShape(shape, path, nodes) {
  const list = path.length === 1 ? shape : (() => {
    const parentPath = path.slice(0, -1);
    if (parentPath[parentPath.length - 1] === 'else') { const n = pathIn(shape, parentPath.slice(0, -1)).node; return n.o ?? (n.o = []); }
    return pathIn(shape, parentPath).node.c;
  })();
  list.splice(path[path.length - 1], 0, ...nodes);
}

function insertSteps(ctx, edit, nodes) {
  const place = placeFor(ctx, edit);
  const unit = indentUnit(ctx.source, ctx.language);
  if (place.newElse) {
    // A new "no" side: an else block after the question's own block.
    const p = place.loc.step;
    const [, end] = stepLines(p);
    const L = linesOf(ctx.source);
    const ind = indentOf(L[p.line - 1]);
    const body = renderBlock(nodes, ctx.language, ind + unit, unit);
    if (ctx.language === 'python') ctx.lines(end + 1, 0, [`${ind}else:`, ...body]);
    else {
      if (L[end - 1].trim() !== '}') needsAi(`The question at line ${p.line} does not end with a } on its own line, so the writer cannot add its other side.`);
      ctx.lines(end, 1, [`${ind}} else {`, ...body, `${ind}}`]);
    }
    const sp = pathIn(ctx.shape, place.loc.path).node;
    sp.o = nodes;
    return;
  }
  ctx.lines(place.line, 0, renderBlock(nodes, ctx.language, place.indent, unit));
  insertShape(ctx.shape, place.shapePath, nodes);
}

function removeAt(ctx, loc, { replaceWithPass = true } = {}) {
  const [a, b] = stepLines(loc.step);
  if (!ownsLines(ctx.source, loc.step)) needsAi(`The step at line ${loc.step.line} shares its lines with other code, so the writer cannot remove it alone.`);
  const L = linesOf(ctx.source);
  // A Python block that would be left empty keeps a `pass`.
  const siblings = loc.list.filter((s) => s.expr?.kind !== 'pass');
  if (ctx.language === 'python' && siblings.length === 1 && loc.parent && replaceWithPass) ctx.lines(a, b - a + 1, [`${indentOf(L[a - 1])}pass`]);
  else ctx.lines(a, b - a + 1, []);
  listAt(ctx.shape, loc.path).splice(loc.path[loc.path.length - 1], 1);
}

function opAddStep(ctx, edit) {
  if (edit.step == null && edit.steps == null) refuse('Say the new step with "step" (code, { if, then }, or { stop }).');
  const nodes = (edit.steps ?? [edit.step]).map((s) => stepSpec(s, ctx));
  insertSteps(ctx, edit, nodes);
  return `Added ${nodes.map((n) => q(sayFull(n.e))).join(', ')}`;
}

function opRemoveStep(ctx, edit) {
  const loc = ctx.at(edit.step);
  removeAt(ctx, loc);
  return `Removed ${q(sayStep(loc.step))}${loc.step.children?.length ? ` and the ${loc.step.children.length} step${loc.step.children.length === 1 ? '' : 's'} inside it` : ''}`;
}

function opMoveStep(ctx, edit) {
  const loc = ctx.at(edit.step);
  const pos = edit.before != null ? 'before' : edit.after != null ? 'after' : refuse('Say where it moves: before or after another step.');
  const dest = ctx.at(edit[pos]);
  if (dest.step === loc.step) refuse('A step cannot move next to itself.');
  if (dest.path.join('.').startsWith(`${loc.path.join('.')}.`)) refuse('A step cannot move inside itself.');
  if (!ownsLines(ctx.source, loc.step) || !ownsLines(ctx.source, dest.step)) needsAi('One of the steps shares its lines with other code, so the writer cannot move it alone.');
  const [a, b] = stepLines(loc.step);
  const [da, db] = stepLines(dest.step);
  const L = linesOf(ctx.source);
  const moved = L.slice(a - 1, b);
  const fromIndent = indentOf(moved[0]), toIndent = indentOf(L[da - 1]);
  const re = moved.map((l) => (l.startsWith(fromIndent) ? toIndent + l.slice(fromIndent.length) : l));
  const at = pos === 'before' ? da : db + 1;
  if (at >= a && at <= b + 1) refuse('The step is already there.');
  // Shape: take it out, then put it in at the destination (positions are computed on the shape after removal).
  const node = listAt(ctx.shape, loc.path)[loc.path[loc.path.length - 1]];
  // Insert first when the destination is below, so line numbers above stay right.
  if (at > b) { ctx.lines(at, 0, re); ctx.lines(a, b - a + 1, []); } else { ctx.lines(a, b - a + 1, []); ctx.lines(at, 0, re); }
  const destKey = dest.path.join('.');
  listAt(ctx.shape, loc.path).splice(loc.path[loc.path.length - 1], 1);
  // Find the destination again in the shape by walking the old paths (the moved step is gone).
  const destPath = [...dest.path];
  const lp = loc.path;
  if (lp.length <= destPath.length && lp.slice(0, -1).join('.') === destPath.slice(0, lp.length - 1).join('.') && lp[lp.length - 1] < destPath[lp.length - 1]) destPath[lp.length - 1] -= 1;
  void destKey;
  if (pos === 'after') destPath[destPath.length - 1] += 1;
  if (ctx.language === 'python' && loc.list.length === 1 && loc.parent) needsAi('Moving the only step out of a Python block would leave it empty.');
  insertShape(ctx.shape, destPath, [node]);
  return `Moved ${q(sayStep(loc.step))} ${pos} ${q(sayStep(dest.step))}`;
}

function opAddStop(ctx, edit) {
  const stop = { e: stopTree(ctx, edit.error, edit.message), c: [] };
  if (edit.when != null) {
    // A new question that stops: if <when>, stop.
    const test = exprFrom(edit.when, ctx.language, 'condition');
    insertSteps(ctx, edit, [{ e: { kind: 'if', test }, c: [stop] }]);
    return `Added a Stop: if ${sayFull(test)}, stop with ${q(edit.message)}`;
  }
  if (edit.step == null) refuse('Say where the Stop goes: a new question ("when" and before/after), or a question\'s side ("step" and "side").');
  const loc = ctx.at(edit.step);
  if (loc.step.expr?.kind !== 'if') refuse(`The step at line ${loc.step.line} is not a question, so it has no side to stop on.`);
  const side = edit.side || 'yes';
  const kids = side === 'yes' ? loc.step.children : loc.step.otherwise;
  const last = kids?.[kids.length - 1];
  if (last && /^(return|throw)$/.test(last.expr?.kind ?? '')) refuse(`The ${side} side of ${q(sayStep(loc.step))} already ends (${q(sayStep(last))}); a Stop after it would never be reached.`);
  if (side === 'no' && loc.step.otherwise?.length && loc.step.otherwise.length === 1 && loc.step.otherwise[0].expr?.kind === 'if' && !ctx.source.split('\n')[loc.step.otherwise[0].line - 1].includes('{')) needsAi('The no side is an else-if chain; the writer does not add to it.');
  insertSteps(ctx, { into: { step: edit.step, side, at: 'end' } }, [stop]);
  return `Added a Stop on the ${side} side of ${q(sayStep(loc.step))}: ${q(edit.message)}`;
}

function opRemoveStop(ctx, edit) {
  const loc = ctx.at(edit.step);
  const isStop = loc.step.kind === 'fail' || loc.step.expr?.kind === 'throw';
  if (!isStop) refuse(`The step at line ${loc.step.line} is not a Stop (${q(sayStep(loc.step))}).`);
  const parent = loc.parent;
  if (parent && parent.expr?.kind === 'if' && parent.children?.length === 1 && parent.children[0] === loc.step && !parent.otherwise?.length) {
    // The Stop was all its question did: the question goes too.
    const ploc = ctx.at([...loc.path.slice(0, -1)]);
    removeAt(ctx, ploc);
    return `Removed the Stop ${q(sayStep(loc.step))} and its question ${q(sayStep(parent))}`;
  }
  removeAt(ctx, loc);
  return `Removed the Stop ${q(sayStep(loc.step))}`;
}

function opAddInput(ctx, edit) {
  const { item, language } = ctx;
  const name = String(edit.name ?? '');
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) refuse(`"${name}" is not a name an input can have.`);
  if ((item.inputs || []).some((p) => p.name === name)) refuse(`${item.name} already has an input named ${name}.`);
  // A name the function already used before this change would now mean the new input: refused. A name an earlier
  // edit in this same change introduced (days > limit, then add the input limit) is what the input is for.
  if (namesUsed(ctx.originalShape()).has(name)) refuse(`${name} is already used inside ${item.name}; adding an input with that name would change what it means.`);
  const sig = signatureRange(ctx.source, item, language);
  if (!sig) needsAi('The writer could not find where this function lists its inputs.');
  const inner = ctx.source.slice(sig.open + 1, sig.close);
  if (language === 'go' && !edit.type) refuse('Go needs the input\'s type ("type").');
  const def = edit.default !== undefined ? renderExpr(exprFrom(edit.default, language, 'default'), language) : null;
  if (def != null && language === 'go') needsAi('Go has no default values for inputs.');
  const params = splitTop(inner).map((p) => p.trim()).filter(Boolean);
  const star = language === 'python' && params.some((p) => /^\*/.test(p));
  if (language === 'python' && !star && def == null && params.some((p) => /=/.test(p))) refuse(`In Python an input without a default cannot come after inputs with defaults; give ${name} a default.`);
  if (language === 'typescript' && def == null && params.some((p) => /\?\s*:|=/.test(p))) refuse(`In TypeScript a required input cannot come after optional ones; give ${name} a default.`);
  if (params.some((p) => /^\.\.\./.test(p) || /\.\.\.\S/.test(p))) needsAi('This function takes a variable number of inputs at the end; a new input before them would change what callers pass, so the writer does not add one.');
  const typed = edit.type ? (language === 'go' ? `${name} ${edit.type}` : `${name}: ${edit.type}`) : name;
  const text = def != null ? (language === 'python' && !edit.type ? `${typed}=${def}` : `${typed} = ${def}`) : typed;
  const multiline = /\n/.test(inner);
  const kw = star ? partsWithOffsets(ctx.source, sig.open + 1, sig.close).find((p) => /^\s*\*\*/.test(p.text)) : null;
  if (kw) {
    // Python with **kwargs: the new input goes just before it, after any *args, so callers are not affected.
    const at = kw.start + kw.text.match(/^\s*/)[0].length;
    ctx.replaceText(at, at, `${text},${kw.text.match(/^\s*/)[0] || ' '}`);
  } else if (multiline) {
    const lastLine = inner.replace(/\s+$/, '');
    const trailingComma = /,\s*$/.test(lastLine);
    const ind = indentOf(inner.split('\n').filter((l) => l.trim()).pop() || '');
    const insertAt = sig.open + 1 + lastLine.length;
    ctx.replaceText(insertAt, insertAt, `${trailingComma ? '' : ','}\n${ind}${text}${trailingComma ? ',' : ''}`);
  } else ctx.replaceText(sig.close, sig.close, `${params.length ? ', ' : ''}${text}`);
  ctx.expectInputs = { added: name, was: (item.inputs || []).map((p) => p.name) };
  return `Added the input ${name}${edit.type ? ` (${edit.type})` : ''}${def != null ? `, ${def} when not given` : ''}`;
}

function opRemoveInput(ctx, edit) {
  const { item, language } = ctx;
  const name = String(edit.name ?? '');
  const idx = (item.inputs || []).findIndex((p) => p.name === name);
  if (idx < 0) refuse(`${item.name} has no input named ${name}.`);
  if (namesUsed(ctx.shape).has(name)) refuse(`${name} is still used inside ${item.name} (line ${firstUse(ctx.steps, name)}); change those steps first.`);
  const sig = signatureRange(ctx.source, item, language);
  if (!sig) needsAi('The writer could not find where this function lists its inputs.');
  const parts = partsWithOffsets(ctx.source, sig.open + 1, sig.close);
  const pi = parts.findIndex((p) => new RegExp(`^\\s*(?:\\.\\.\\.|\\*{1,2})?${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(p.text));
  if (pi < 0) needsAi(`The writer could not find ${name} in the list of inputs.`);
  if (language === 'go' && !/\s\S/.test(parts[pi].text.trim())) needsAi(`In Go, ${name} shares its type with the next input; the writer does not split them.`);
  const lead = (p) => p.text.match(/^\s*/)[0];
  const cur = parts[pi], nextP = parts[pi + 1];
  let start, end;
  if (nextP) {
    if (lead(cur).includes('\n')) { start = cur.start; end = nextP.start; }
    else { start = cur.start + lead(cur).length; end = nextP.start + (lead(nextP).includes('\n') ? 0 : lead(nextP).length); }
  } else if (pi > 0) {
    const trail = cur.text.match(/\s*$/)[0];
    start = parts[pi - 1].end; end = cur.end - trail.length;
  } else { start = cur.start; end = cur.end; }
  ctx.replaceText(start, end, '');
  ctx.expectInputs = (item.inputs || []).map((p) => p.name).filter((n) => n !== name);
  return `Removed the input ${name}`;
}

/** The bracket ( [ or { that `at` is directly inside, looking back (strings on one line are skipped). */
function innermostOpen(source, at) {
  let depth = 0;
  for (let i = at - 1; i >= 0 && at - i < 20000; i--) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') { const j = source.lastIndexOf(c, i - 1); if (j >= 0 && !source.slice(j, i).includes('\n')) { i = j; continue; } }
    if (c === ')' || c === ']' || c === '}') depth++;
    else if (c === '(' || c === '[' || c === '{') { if (depth === 0) return c; depth--; }
  }
  return null;
}

/** Is offset `at` inside an open ( on its own statement (a call's arguments)? */
function insideParens(source, at) {
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    const c = source[i];
    if (c === ')' || c === ']' || c === '}') depth++;
    else if (c === '(' || c === '[' || c === '{') { if (depth === 0) return c === '('; depth--; }
    else if (c === '\n' && depth === 0 && !/[(,\\]\s*$/.test(source.slice(Math.max(0, i - 80), i))) return false;
  }
  return false;
}

function opRename(ctx, edit) {
  const { item, language } = ctx;
  const to = String(edit.to ?? '');
  if (!/^[A-Za-z_$][\w$]*$/.test(to)) refuse(`"${to}" is not a name.`);
  const from = edit.from ?? item.name;
  if (from === to) refuse('The new name is the same as the old one.');
  if (edit.from == null || from === item.name) {
    // The function itself: its definition, and every call by name in the files given.
    if (ctx.allNames().has(to)) refuse(`${to} is already a name in these files; renaming ${from} to it would change what calls mean.`);
    const sites = [];
    for (const [path, src] of ctx.state.files) {
      if (!ctx.state.read(path)) continue;
      for (const at of identifierSites(src, from, 0, src.length, ctx.state.read(path).language)) sites.push({ path, at });
    }
    // Go's doc comment starts with the function's name by convention ("// CanRefund says …"): it follows the name.
    const docLine = linesOf(ctx.source)[item.line - 2];
    const doc = language === 'go' && docLine != null ? docLine.match(new RegExp(`^(\\s*//\\s*)${from}\\b`)) : null;
    if (doc) sites.push({ path: ctx.path, at: lineStarts(ctx.source)[item.line - 2] + doc[1].length, comment: true });
    ctx.renameEverywhere = { from, to, sites };
    const uses = sites.filter((s) => !s.comment).length - 1;
    return `Renamed ${from} to ${to}${uses > 0 ? ` (the function and ${uses} call${uses === 1 ? "" : "s"} or use${uses === 1 ? "" : "s"} of its name)` : ""}${doc ? " and in its doc comment" : ""}`;
  }
  const isInput = (item.inputs || []).some((p) => p.name === from);
  const used = namesUsed(ctx.shape);
  if (!isInput && !used.has(from)) refuse(`${from} is not an input or a name used in ${item.name}.`);
  if (used.has(to) || (item.inputs || []).some((p) => p.name === to)) refuse(`${to} is already used in ${item.name}; renaming ${from} to it would change what the steps mean.`);
  const end = functionEndLine(ctx.source, item, language) ?? (item.anchor?.bodyLines?.[1] ?? item.line);
  const starts = lineStarts(ctx.source);
  const a = starts[item.line - 1], b = end < starts.length ? starts[end] - 1 : ctx.source.length;
  const sites = identifierSites(ctx.source, from, a, b, language);
  // Keyword arguments (`f(days=1)`) and object keys (`{ days: 1 }`) are names of something else, not this one.
  const sig = signatureRange(ctx.source, item, language);
  const keep = sites.filter((s) => {
    if (sig && s > sig.open && s < sig.close) return true; // the input itself
    const after = ctx.source.slice(s + from.length, s + from.length + 3);
    const prev = ctx.source.slice(0, s).replace(/\s+$/, '').slice(-1);
    // A keyword argument (`f(days=1)`) or an object key (`{ days: 1 }`) names something else, not this one.
    if (language === 'python' && /^\s*=(?!=)/.test(after) && (prev === '(' || prev === ',') && insideParens(ctx.source, s)) return false;
    if ((language === 'typescript' || language === 'javascript') && /^\s*:/.test(after) && (prev === '{' || prev === ',')) return false;
    if (language === 'go' && /^\s*:(?!=)/.test(after) && (prev === '{' || prev === ',')) return false;
    return true;
  });
  const js = language === 'typescript' || language === 'javascript';
  for (const s of [...keep].reverse()) {
    // A shorthand property ({ value } or const { value } = …) keeps its key: { value: renamed }.
    const prev = ctx.source.slice(0, s).replace(/\s+$/, '').slice(-1);
    const next = ctx.source.slice(s + from.length).replace(/^\s+/, '')[0];
    const shorthand = js && (prev === '{' || prev === ',') && (next === ',' || next === '}') && innermostOpen(ctx.source, s) === '{';
    ctx.replaceText(s, s + from.length, shorthand ? `${from}: ${to}` : to);
  }
  ctx.shape = renameShape(ctx.shape, from, to);
  if (isInput) ctx.expectInputs = (item.inputs || []).map((p) => (p.name === from ? to : p.name));
  return `Renamed ${from} to ${to} in ${item.name} (${keep.length} place${keep.length === 1 ? '' : 's'})`;
}

function opAddFunction(state, edit) {
  const path = edit.file ?? [...state.files.keys()][0];
  if (!state.files.has(path)) refuse(`There is no file ${path} in this change.`);
  const rd = state.read(path);
  if (!rd) needsAi(`${path} is not a file Thunder reads.`);
  const { language } = rd;
  const source = state.files.get(path);
  if (!WRITE_STEPS_LANGUAGES.includes(language)) needsAi(`New functions are written for TypeScript, JavaScript, Python, and Go; ${path} is ${langName(language)}.`);
  const name = String(edit.name ?? '');
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) refuse(`"${name}" is not a name a function can have.`);
  if (membersOf(rd.reading).some((m) => m.name === name)) refuse(`${path} already has a function named ${name}.`);
  const inputs = (edit.inputs || []).map((p) => (typeof p === 'string' ? { name: p } : p));
  if (language === 'go' && inputs.some((p) => !p.type)) refuse('Go needs a type for every input.');
  const ctx = { language, source, item: { name, line: 1 } };
  if (language === 'go' && edit.returns) ctx.goResults = edit.returns;
  const nodes = (edit.steps || []).map((s) => stepSpec(s, { ...ctx, source: `${source}\nfunc ${name}() (${edit.returns || ''}) {}` }));
  if (!nodes.length) refuse('A new function needs at least one step.');
  const unit = indentUnit(source, language);
  const params = inputs.map((p) => (p.type ? (language === 'go' ? `${p.name} ${p.type}` : language === 'python' ? `${p.name}: ${p.type}` : `${p.name}: ${p.type}`) : p.name)).join(', ');
  const exp = edit.export && (language === 'typescript' || language === 'javascript') ? 'export ' : '';
  const head = language === 'python' ? `def ${name}(${params})${edit.returns ? ` -> ${edit.returns}` : ''}:` : language === 'go' ? `func ${name}(${params})${edit.returns ? ` ${/,/.test(edit.returns) && !/^\(/.test(edit.returns) ? `(${edit.returns})` : edit.returns}` : ''} {` : `${exp}function ${name}(${params})${edit.returns && language === 'typescript' ? `: ${edit.returns}` : ''} {`;
  const body = renderBlock(nodes, language, unit, unit);
  const fnLines = [head, ...body, ...(language === 'python' ? [] : ['}'])];
  // After a given function, or at the end of the file.
  let at;
  if (edit.after != null) {
    const ref = parseMemberRef(edit.after);
    const m = memberKeys(rd.reading).find((x) => x.item.name === ref.name);
    if (!m) refuse(`There is no function ${ref.name} in ${path} to put it after.`);
    at = functionEndLine(source, m.item, language);
    if (at == null) needsAi(`The writer could not find where ${ref.name} ends.`);
  } else at = linesOf(source.replace(/\n+$/, '')).length;
  const L = linesOf(source);
  const blank = language === 'python' ? ['', ''] : [''];
  L.splice(at, 0, ...blank, ...fnLines);
  const next = L.join('\n');
  return { path, source: next, name, nodes, inputs: inputs.map((p) => p.name), says: `Added ${name}(${inputs.map((p) => p.name).join(', ')}) with ${nodes.length} step${nodes.length === 1 ? '' : 's'}` };
}

const OPS = { setValue: opSetValue, setCondition: opSetCondition, setGivesBack: opSetGivesBack, addStep: opAddStep, removeStep: opRemoveStep, moveStep: opMoveStep, addStop: opAddStop, removeStop: opRemoveStop, addInput: opAddInput, removeInput: opRemoveInput, rename: opRename };

// ── Applying one edit ──────────────────────────────────────────────────────────────────────────────────────

/** Apply one edit to the files in `state`; returns { files, plan, says } or throws Refused / NeedsAI. */
function applyEdit(state, edit) {
  if (!edit || typeof edit !== 'object') refuse('An edit is an object such as { op: "setValue", member, step, to }.');
  if (!EDIT_OPS.includes(edit.op)) refuse(`"${edit.op}" is not a Thunder edit. The edits are: ${EDIT_OPS.join(', ')}.`);
  if (edit.op === 'addFunction') {
    const r = opAddFunction(state, edit);
    return { files: new Map([...state.files, [r.path, r.source]]), plan: { added: { path: r.path, name: r.name, shape: r.nodes, inputs: r.inputs } }, says: r.says };
  }
  const m = findMember(state, edit.member);
  if (!m.item.steps) needsAi(`Thunder has no steps for ${m.item.name} (line ${m.item.line}), so the edit cannot be placed exactly.`);
  let source = m.source;
  const ctx = {
    state, language: m.language, item: m.item, steps: m.item.steps, path: m.path,
    get source() { return source; },
    shape: stepShape(m.item.steps),
    at(sel) {
      if (sel == null) refuse('Say which step (its id, its line as "line:N", or its path such as "2" or "1.0").');
      const loc = locateStep(m.item.steps, sel, { flowSteps: m.item.steps });
      if (!loc) refuse(`${m.item.name} has no step ${JSON.stringify(sel)}.`);
      return loc;
    },
    // Steps edited by tree are written after every other kind of change is planned (their lines do not move).
    treeEdits: [],
    setTree(step, tree) { this.treeEdits.push({ step, tree }); pathIn(this.shape, stepPathOf(m.item.steps, step)).node.e = tree; },
    lines(start, del, insert) { source = spliceLines(source, start, del, insert); this.moved = true; },
    replaceText(a, b, text) { source = source.slice(0, a) + text + source.slice(b); this.moved = true; },
    originalShape() {
      if (state.original === state.files) return stepShape(m.item.steps);
      const o = makeState(state.original);
      const r = o.read(m.path);
      const it = r && memberKeys(r.reading).find((x) => x.key === m.key);
      return it ? stepShape(it.item.steps) : [];
    },
    allNames() { const s = new Set(); for (const [p] of state.files) { const r = state.read(p); if (r) for (const it of membersOf(r.reading)) s.add(it.name); } return s; },
  };
  const says = OPS[edit.op](ctx, edit); // validates the edit against the meaning tree (Refused when it does not fit)
  // Other languages: the edit was checked against the model above; the code is handed to an AI coding agent.
  if (!WRITE_STEPS_LANGUAGES.includes(m.language)) needsAi(`The deterministic writers cover TypeScript, JavaScript, Python, and Go; ${m.path} is ${langName(m.language)}.`);
  for (const t of ctx.treeEdits) source = writeStepTree(source, t.step, t.tree, m.language);
  if (ctx.goImport) source = addGoImport(source, ctx.goImport);
  const files = new Map(state.files);
  files.set(m.path, source);
  if (ctx.renameEverywhere) {
    const { from, to, sites } = ctx.renameEverywhere;
    for (const [path] of state.files) {
      const mine = sites.filter((s) => s.path === path).sort((a, b) => b.at - a.at);
      let src = state.files.get(path);
      for (const s of mine) src = src.slice(0, s.at) + to + src.slice(s.at + from.length);
      files.set(path, src);
    }
    return { files, plan: { renameFunction: { from, to }, member: { path: m.path, key: m.key, name: to, shape: renameShape(ctx.shape, from, to) } }, says };
  }
  return {
    files,
    plan: { member: { path: m.path, key: m.key, name: m.item.name, shape: ctx.shape, inputs: ctx.expectInputs ?? null, returns: ctx.expectReturns ?? null } },
    says: reworded(says, ctx.treeEdits, { path: m.path, source, language: m.language }, m.item),
  };
}
/** "…; it now reads "If days_since is more than 10"": each edited step's new Thunder words, once, read from the new
 * code. Only the edited function is looked at, and on a line holding several steps only the step of the same kind. */
function reworded(says, treeEdits, f, member) {
  if (!treeEdits.length) return says;
  let reading;
  try { reading = readFile(f).reading; } catch { return says; }
  const items = membersOf(reading).filter((it) => !member || it.name === member.name);
  const mine = member && items.length > 1 ? [items.reduce((b, it) => (Math.abs(it.line - member.line) < Math.abs(b.line - member.line) ? it : b))] : items;
  const now = [];
  for (const t of treeEdits) {
    let hit = null;
    const walk = (list) => (list || []).forEach((s) => { if (hit) return; if (s.line === t.step.line && (!t.step.kind || s.kind === t.step.kind)) { hit = s; return; } walk(s.children); walk(s.otherwise); });
    for (const it of mine) walk(it.steps);
    if (hit?.says && hit.says !== t.step.says && !now.includes(hit.says)) now.push(hit.says);
  }
  return now.length ? `${says}; it now reads ${now.map((x) => `"${x}"`).join(', ')}` : says;
}
function stepPathOf(steps, step) {
  let found = null;
  const walk = (list, path) => list.forEach((s, i) => { if (found) return; if (s === step) { found = [...path, i]; return; } if (s.children) walk(s.children, [...path, i]); if (s.otherwise) walk(s.otherwise, [...path, i, 'else']); });
  walk(steps, []);
  return found;
}

// ── Proof ──────────────────────────────────────────────────────────────────────────────────────────────────

function firstShapeDifference(a, b, path = []) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    const here = [...path, i + 1].join('.');
    if (!x) return `step ${here} is extra: ${sayFull(y.e)}`;
    if (!y) return `step ${here} is missing: ${sayFull(x.e)}`;
    if (!sameExpr(x.e, y.e)) return `step ${here} reads "${sayFull(y.e)}", not "${sayFull(x.e)}"`;
    for (const k of ['c', 'o', 'a']) {
      const d = firstShapeDifference(x[k] || [], y[k] || [], [...path, i + 1]);
      if (d) return d;
    }
    if (JSON.stringify(normalizeExpr(x.h || [])) !== JSON.stringify(normalizeExpr(y.h || []))) return `step ${here}: what happens when something goes wrong differs`;
  }
  return null;
}

/** The last line of a function: its last step, or its body's last line. */
function memberEnd(item) {
  let end = Math.max(item.line, item.anchor?.bodyLines?.[1] ?? 0);
  const walk = (list) => (list || []).forEach((s) => { end = Math.max(end, s.span?.endLine ?? s.line ?? 0); walk(s.children); walk(s.otherwise); (s.handlers || []).forEach((h) => walk(h.steps)); walk(s.always?.steps); });
  walk(item.steps);
  return end;
}
/** Steps with the one that holds `line` (and everything in it) replaced by a placeholder. */
function maskSteps(steps, line) {
  return (steps || []).map((s) => {
    const a = s.span?.startLine ?? s.line, b = s.span?.endLine ?? s.line;
    if (a <= line && line <= b && !(s.children || []).concat(s.otherwise || []).some((c) => (c.span?.startLine ?? c.line) <= line && line <= (c.span?.endLine ?? c.line))) return { kind: 'code', code: '(the step the edited function is written in)', expr: { kind: 'code', text: '(the step the edited function is written in)' } };
    return { ...s, children: s.children ? maskSteps(s.children, line) : s.children, otherwise: s.otherwise ? maskSteps(s.otherwise, line) : s.otherwise };
  });
}
const hasInner = (shape, names) => (shape || []).some((s) => (s.e?.kind === 'function' && names.has(s.e.name)) || hasInner(s.c, names) || hasInner(s.o, names) || hasInner(s.a, names) || (s.h || []).some((h) => hasInner(h.c, names)));
const maskInner = (shape, names) => (shape || []).map((s) => (s.e?.kind === 'function' && names.has(s.e.name) ? { e: { kind: 'code', text: `(the edited function ${s.e.name})` }, c: [] } : { ...s, c: maskInner(s.c, names), ...(s.o ? { o: maskInner(s.o, names) } : {}), ...(s.a ? { a: maskInner(s.a, names) } : {}), ...(s.h ? { h: s.h.map((h) => ({ ...h, c: maskInner(h.c, names) })) } : {}) }));

/**
 * Prove a change: `before` and `after` are Maps path -> source; `plans` say what each edit intended. Returns
 * { ok, edited: { status, checks[] }, unchanged: { status, checked, items[] }, problems[] }.
 */
export function proveChange(before, after, plans) {
  const problems = [];
  const edited = { status: 'proven', checks: [] };
  const readOf = (files, path) => { const src = files.get(path); try { return readFile({ path, source: src }); } catch (e) { return { error: e.message }; } };
  const editedKeys = new Set(); // path|key in the after files
  const ranges = new Map(); // path -> [{ before: [first, last], after: [first, last] }] of the edited functions
  const renamed = plans.find((p) => p.renameFunction)?.renameFunction;
  for (const p of plans) {
    if (p.added) {
      const r = readOf(after, p.added.path);
      if (r.error) { problems.push(`${p.added.path} could not be read after the change: ${r.error}`); continue; }
      const it = memberKeys(r.reading).find((x) => x.item.name === p.added.name);
      editedKeys.add(`${p.added.path}|${it?.key}`);
      if (!it) { problems.push(`The new function ${p.added.name} is not read from the changed file.`); continue; }
      const d = firstShapeDifference(p.added.shape, stepShape(it.item.steps));
      if (d) problems.push(`${p.added.name}: ${d}.`);
      if (JSON.stringify(it.item.inputs.map((x) => x.name)) !== JSON.stringify(p.added.inputs)) problems.push(`${p.added.name} takes ${it.item.inputs.map((x) => x.name).join(', ') || 'nothing'}, not ${p.added.inputs.join(', ') || 'nothing'}.`);
      edited.checks.push({ member: p.added.name, file: p.added.path, result: d ? 'different' : 'exact', steps: p.added.shape.length });
      continue;
    }
    const mm = p.member;
    const r = readOf(after, mm.path);
    if (r.error) { problems.push(`${mm.path} could not be read after the change: ${r.error}`); continue; }
    const key = renamed ? mm.key.replace(/^[^#]+/, mm.name) : mm.key;
    const it = memberKeys(r.reading).find((x) => x.key === key);
    editedKeys.add(`${mm.path}|${key}`);
    if (!it) { problems.push(`${mm.name} is no longer read from ${mm.path} after the change.`); edited.checks.push({ member: mm.name, file: mm.path, result: 'missing' }); continue; }
    const d = firstShapeDifference(mm.shape, stepShape(it.item.steps));
    if (d) problems.push(`${mm.name}: ${d}.`);
    const gotInputs = it.item.inputs.map((x) => x.name);
    const inputsOk = !mm.inputs || (Array.isArray(mm.inputs) ? JSON.stringify(gotInputs) === JSON.stringify(mm.inputs) : gotInputs.includes(mm.inputs.added) && JSON.stringify(gotInputs.filter((x) => x !== mm.inputs.added)) === JSON.stringify(mm.inputs.was));
    if (!inputsOk) problems.push(`${mm.name} takes ${it.item.inputs.map((x) => x.name).join(', ')} after the change, not ${Array.isArray(mm.inputs) ? mm.inputs.join(', ') : [...mm.inputs.was, mm.inputs.added].join(', ')}.`);
    if (mm.returns && String(it.item.returns ?? '').replace(/\s+/g, '') !== String(mm.returns).replace(/\s+/g, '') && !String(it.item.returns ?? '').includes(String(mm.returns).replace(/^\(|\)$/g, ''))) problems.push(`${mm.name} gives back ${it.item.returns ?? 'nothing declared'} after the change, not ${mm.returns}.`);
    edited.checks.push({ member: mm.name, file: mm.path, result: d ? 'different' : 'exact', steps: mm.shape.length });
    const rb = readOf(before, mm.path);
    const old = !rb.error && memberKeys(rb.reading).find((x) => x.key === mm.key);
    if (old) { if (!ranges.has(mm.path)) ranges.set(mm.path, []); ranges.get(mm.path).push({ before: [old.item.line, memberEnd(old.item)], after: [it.item.line, memberEnd(it.item)] }); }
  }
  if (problems.length) edited.status = 'failed';

  // Everything else: the same meaning, function by function.
  const items = [];
  const editedInner = new Map();
  const insideEdited = new Map();
  const innerDefs = (shape, out) => { for (const s of shape || []) { if (s.e?.kind === 'function' && !out.has(s.e.name)) out.set(s.e.name, s.c); innerDefs(s.c, out); innerDefs(s.o, out); innerDefs(s.a, out); (s.h || []).forEach((h) => innerDefs(h.c, out)); } return out; };
  for (const p of plans) if (p.member) { if (!insideEdited.has(p.member.path)) insideEdited.set(p.member.path, new Map()); innerDefs(p.member.shape, insideEdited.get(p.member.path)); }
  for (const k of editedKeys) { const [path, key] = k.split('|'); if (!key || key === 'undefined') continue; if (!editedInner.has(path)) editedInner.set(path, new Set()); editedInner.get(path).add(key.split('#')[0]); }
  for (const p of plans) if (p.member && editedInner.has(p.member.path)) { editedInner.get(p.member.path).add(p.member.key.split('#')[0]); if (renamed) editedInner.get(p.member.path).add(renamed.from); }
  const touched = [...after.keys()].filter((p) => after.get(p) !== before.get(p));
  for (const path of touched) {
    const a = readOf(before, path), b = readOf(after, path);
    if (a.error || b.error) { problems.push(`${path} could not be read ${a.error ? 'before' : 'after'} the change.`); continue; }
    const olds = memberKeys(a.reading), news = memberKeys(b.reading);
    const newByKey = new Map(news.map((x) => [x.key, x]));
    for (const o of olds) {
      const k = renamed && o.item.name === renamed.from ? o.key.replace(/^[^#]+/, renamed.to) : o.key;
      if (editedKeys.has(`${path}|${k}`)) continue;
      const n = newByKey.get(k);
      if (!n) {
        const gone = (ranges.get(path) || []).find((r) => r.before[0] <= o.item.line && memberEnd(o.item) <= r.before[1]);
        items.push(gone ? { name: o.item.name, file: path, line: o.item.line, status: 'same', within: true, note: 'Was written inside the edited function; checked as part of its steps.' } : { name: o.item.name, file: path, status: 'missing', reason: 'Not found after the change.' });
        continue;
      }
      const oEnd = memberEnd(o.item);
      const R = ranges.get(path) || [];
      // A function written inside the edited one (a nested def, a callback, a method in an object) is part of the
      // edited function's steps, which were checked exactly above.
      const inside = R.find((r) => r.before[0] <= o.item.line && oEnd <= r.before[1] && !(r.before[0] === o.item.line && r.before[1] === oEnd));
      if (inside && !insideEdited.get(path)?.get(o.item.name)) { items.push({ name: o.item.name, file: path, line: o.item.line, status: 'same', within: true, note: 'Written inside the edited function; checked as part of its steps.' }); continue; }
      let expectShape = renamed ? renameShape(stepShape(o.item.steps), renamed.from, renamed.to) : stepShape(o.item.steps);
      let actual = stepShape(n.item.steps);
      // A function that holds the edited one is compared step by step, without the step the edited function is in.
      const around = R.find((r) => o.item.line < r.before[0] && r.before[1] <= oEnd);
      if (around) { expectShape = stepShape(maskSteps(o.item.steps, around.before[0])); actual = stepShape(maskSteps(n.item.steps, around.after[0])); if (renamed) expectShape = renameShape(expectShape, renamed.from, renamed.to); }
      // A function inside the edited one changes with it: its expected steps are the edited function's inner steps.
      const within = insideEdited.get(path)?.get(o.item.name);
      if (within) expectShape = within;
      // A function that holds an edited inner function is compared without it (the inner one is checked above).
      const inner = editedInner.get(path);
      const holds = !!around || (inner && (hasInner(expectShape, inner) || hasInner(actual, inner)));
      if (holds) { expectShape = maskInner(expectShape, inner); actual = maskInner(actual, inner); }
      const d = firstShapeDifference(expectShape, actual);
      const inputsSame = inputsKey(o.item) === inputsKey(n.item);
      items.push({ name: o.item.name, file: path, line: o.item.line, status: d || !inputsSame ? 'different' : 'same', ...(within ? { within: true, note: 'Inside the edited function; compared with its intended steps.' } : {}), ...(holds ? { holds: true, note: 'Holds the edited function; every other step was compared.' } : {}), ...(d ? { reason: d } : !inputsSame ? { reason: 'its inputs changed' } : {}) });
    }
    const oldKeys = new Set(olds.map((o) => (renamed && o.item.name === renamed.from ? o.key.replace(/^[^#]+/, renamed.to) : o.key)));
    const inEdited = (n) => (ranges.get(path) || []).some((r) => r.after[0] <= n.item.line && memberEnd(n.item) <= r.after[1]);
    for (const n of news) if (!oldKeys.has(n.key) && !editedKeys.has(`${path}|${n.key}`) && !inEdited(n)) items.push({ name: n.item.name, file: path, status: 'new', reason: 'A function that was not asked for.' });
  }
  // thunder same, on every touched file without the edited functions: it must say 'same' for each of the rest.
  // (A renamed function is compared by its trees above; `same` pairs functions by name.)
  if (!renamed) {
    const strip = (files, side) => touched.map((path) => ({ path, source: files.get(path) })).filter((f) => readableLanguage(f.path));
    const sm = sameMeaning(strip(before, 'old'), strip(after, 'new'));
    const editedNames = new Set([...editedKeys].map((k) => nameKey(k.split('|')[1].split('#')[0])));
    for (const it of sm.items) {
      if (editedNames.has(nameKey(it.name))) continue;
      const mine = items.find((x) => nameKey(x.name) === nameKey(it.name) && (it.old?.line == null || x.line === it.old.line)) ?? items.find((x) => nameKey(x.name) === nameKey(it.name));
      if (mine?.holds || mine?.within) continue; // `same` compares it whole, with the edited function in or around it
      if (it.status !== 'same') {
        // `same` may decline to call two readings the same (cannot-check) where the trees prove them identical:
        // identical trees are the stronger check, and are never weakened by it. Anything 'different' fails.
        if (it.status === 'cannot-check' && mine?.status === 'same') { mine.same = 'cannot-check'; continue; }
        if (mine) { mine.status = 'different'; mine.reason = it.reason; } else items.push({ name: it.name, file: it.new?.file ?? it.old?.file, status: 'different', reason: it.reason });
      } else if (mine) mine.same = 'same';
    }
  }
  const bad = items.filter((x) => x.status !== 'same');
  for (const b of bad) problems.push(`${b.name} (${b.file}) ${b.status === 'missing' ? 'is missing after the change' : b.status === 'new' ? 'appeared, though it was not asked for' : `reads differently after the change: ${b.reason}`}.`);
  const unchanged = { status: bad.length ? 'failed' : 'same', checked: items.length, items };
  return { ok: !problems.length, edited, unchanged, problems };
}

// ── The prompt for an AI coding agent ──────────────────────────────────────────────────────────────────────

function numbered(source, a, b) {
  const L = linesOf(source);
  const w = String(b).length;
  return L.slice(a - 1, b).map((l, i) => `${String(a + i).padStart(w)} | ${l}`).join('\n');
}

function aiPrompt(files, edits, why) {
  const parts = [];
  parts.push('You are changing code so that it does exactly what a Thunder edit says, and nothing else.');
  parts.push('');
  const shown = new Set();
  for (const e of edits) {
    let where = null;
    try {
      if (e.op !== 'addFunction') {
        const state = makeState(files);
        const m = findMember(state, e.member);
        const end = functionEndLine(m.source, m.item, m.language) ?? (m.item.anchor?.bodyLines?.[1] ?? m.item.line);
        where = { path: m.path, language: m.language, name: m.item.name, a: m.item.line, b: end, source: m.source };
      } else where = { path: e.file ?? [...files.keys()][0], language: readableLanguage(e.file ?? [...files.keys()][0]), name: e.name };
    } catch { /* described from the edit alone */ }
    if (where?.a && !shown.has(`${where.path}:${where.name}`)) {
      shown.add(`${where.path}:${where.name}`);
      parts.push(`File: ${where.path} (${langName(where.language)}). Function ${where.name}, lines ${where.a}–${where.b}:`);
      parts.push('```');
      parts.push(numbered(where.source, where.a, where.b));
      parts.push('```');
      parts.push('');
    } else if (where && !where.a) parts.push(`File: ${where.path} (${langName(where.language)}).`);
  }
  parts.push('The change, as Thunder edits (JSON):');
  parts.push('```json');
  parts.push(JSON.stringify(edits, null, 2));
  parts.push('```');
  parts.push('');
  parts.push('What each edit means:');
  for (const e of edits) parts.push(`- ${describeEdit(e)}`);
  parts.push('');
  parts.push('Rules:');
  parts.push('1. Change only the lines this change needs. Keep every other line exactly as it is: comments, blank lines, formatting, indentation, quotes, and names.');
  parts.push('2. Do not change any other function, and no other file, unless the change cannot be made without it; if so, say which and why.');
  parts.push('3. Write it the way this file already writes code (its error types, quote style, naming).');
  parts.push('4. Return the whole updated file.');
  parts.push('');
  parts.push(`Why the Thunder compiler did not write this itself: ${why}`);
  parts.push('');
  parts.push('How the result is checked: Thunder reads the changed file again. The edited steps must read exactly as the edit says, and every other function must mean the same as before (thunder same). The result is labeled "AI-written" until a person accepts it.');
  return parts.join('\n');
}

/** One edit in plain words, without the code. */
export function describeEdit(e) {
  const at = (s) => (s == null ? '' : ` (step ${Array.isArray(s) ? s.join('.') : s})`);
  const who = e.member ? ` in ${parseMemberRef(e.member).name}` : '';
  switch (e.op) {
    case 'setValue': return `Change the value ${e.from !== undefined ? JSON.stringify(e.from) : ''} to ${JSON.stringify(e.to)}${at(e.step)}${who}.`.replace('value  to', 'value to');
    case 'setCondition': return `Change the question${at(e.step)}${who}: ${[e.when != null && `ask "${e.when}"`, e.compare != null && `compare with ${e.compare}`, e.operand && `make the ${e.operand.side || 'right'} side ${JSON.stringify(e.operand.to)}`, e.negate && 'turn it around (not)', e.addClause && `add "${e.addClause.join || 'and'} ${e.addClause.when}"`, e.removeClause != null && `remove part ${e.removeClause}`].filter(Boolean).join(', ')}.`;
    case 'addStep': return `Add the step ${JSON.stringify(e.step ?? e.steps)} ${e.before != null ? `before step ${e.before}` : e.after != null ? `after step ${e.after}` : `on the ${e.into?.side || 'yes'} side of step ${e.into?.step ?? e.into}`}${who}.`;
    case 'removeStep': return `Remove step ${e.step}${who} and everything inside it.`;
    case 'moveStep': return `Move step ${e.step} ${e.before != null ? `before step ${e.before}` : `after step ${e.after}`}${who}.`;
    case 'addStop': return e.when != null ? `Add a Stop${who}: if ${e.when}, stop with ${e.error ? `${e.error}: ` : ''}"${e.message}" (${e.before != null ? `before step ${e.before}` : `after step ${e.after}`}).` : `Add a Stop on the ${e.side || 'yes'} side of the question at step ${e.step}${who}: ${e.error ? `${e.error}: ` : ''}"${e.message}".`;
    case 'removeStop': return `Remove the Stop at step ${e.step}${who} (and its question when that is all the question does).`;
    case 'addInput': return `Add the input ${e.name}${e.type ? ` of type ${e.type}` : ''}${e.default !== undefined ? ` with default ${JSON.stringify(e.default)}` : ''}${who}.`;
    case 'removeInput': return `Remove the input ${e.name}${who}.`;
    case 'setGivesBack': return e.type != null ? `Declare that${who.replace(' in', '')} gives back ${e.type}.` : `Give back ${JSON.stringify(e.value)}${at(e.step)}${who}.`;
    case 'rename': return `Rename ${e.from ?? parseMemberRef(e.member).name} to ${e.to}${e.from ? who : ' (the function, and every call to it)'}; the meaning must not change.`;
    case 'addFunction': return `Add a function ${e.name}(${(e.inputs || []).map((p) => (typeof p === 'string' ? p : p.name)).join(', ')}) in ${e.file ?? 'the file'} with the steps ${JSON.stringify(e.steps)}.`;
    default: return JSON.stringify(e);
  }
}

// ── Thunder text, before and after ─────────────────────────────────────────────────────────────────────────

function thunderLines(steps, depth = 1) {
  const out = [];
  for (const s of steps || []) {
    out.push(`${'  '.repeat(depth)}- ${s.restates || s.kind === 'other' ? `\`${s.code}\`` : s.says}`);
    if (s.children?.length) { if (s.kind === 'branch') out.push(`${'  '.repeat(depth + 1)}Yes:`); out.push(...thunderLines(s.children, depth + (s.kind === 'branch' ? 2 : 1))); }
    if (s.otherwise) { out.push(`${'  '.repeat(depth + 1)}No:`); out.push(...(s.otherwise.length ? thunderLines(s.otherwise, depth + 2) : [`${'  '.repeat(depth + 2)}- (nothing)`])); }
  }
  return out;
}
function thunderOf(files, ref) {
  try {
    const state = makeState(files);
    const m = findMember(state, ref);
    const head = `${m.item.label ?? m.item.name}${m.item.inputs?.length ? ` — you give it: ${m.item.inputs.map((p) => p.name).join(', ')}` : ''}`;
    return [head, ...thunderLines(m.item.steps)].join('\n');
  } catch { return null; }
}

// ── The API ────────────────────────────────────────────────────────────────────────────────────────────────

function makeState(files, original = null) {
  const cache = new Map();
  return {
    files, original: original ?? files,
    read(path) {
      const src = files.get(path);
      const k = `${path}\u0000${src}`;
      if (!cache.has(k)) { try { cache.set(k, readableLanguage(path) ? readFile({ path, source: src }) : null); } catch { cache.set(k, null); } }
      return cache.get(k);
    },
  };
}
const toMap = (files) => (files instanceof Map ? new Map(files) : new Map((Array.isArray(files) ? files : Object.entries(files).map(([path, source]) => ({ path, source }))).map((f) => [f.path, f.source])));

/**
 * Change software in Thunder.
 *
 *   files    [{ path, source }] (or { path: source }): the files the edits are for, and any whose calls a rename reaches
 *   edits    one Thunder edit or a list (applied in order), e.g. { op: 'setValue', member: 'refund.py#can_refund', step: 'line:8', to: 10 }
 *   options  { candidate?: { path: source } — check code someone else (an AI) wrote for these edits; labeled 'ai' }
 *
 * Returns { schema, status: 'written' | 'needs-ai' | 'refused', author, patch, files, before, after, proof, says, prompt?, reason? }.
 * Nothing is written to disk here; the caller decides (the CLI's --apply).
 */
export function thunderWrite(files, edits, options = {}) {
  const original = toMap(files);
  const list = Array.isArray(edits) ? edits : [edits];
  const base = { schema: WRITE_STEPS_SCHEMA, edits: list };
  const firstMember = list.find((e) => e?.member)?.member;
  const before = firstMember ? thunderOf(original, firstMember) : null;
  if (!list.length) return { ...base, status: 'refused', reason: 'No edits were given.', says: 'Nothing to change.' };

  // Someone else (an AI) wrote the change: check it with the same proof, and label it.
  if (options.candidate) {
    const after = new Map(original);
    for (const [p, s] of Object.entries(options.candidate)) after.set(p, s);
    let plans = null;
    try { plans = planOnly(original, list); } catch { plans = null; }
    const proof = plans ? proveChange(original, after, plans) : proveChange(original, after, []);
    const patch = [...after.keys()].map((p) => unifiedDiff(p, original.get(p) ?? '', after.get(p))).join('');
    const ok = proof.ok || (!plans && proof.unchanged.status === 'same');
    return {
      ...base, status: ok ? 'written' : 'refused', author: 'ai', label: 'AI-written', patch, files: Object.fromEntries(after), before, after: firstMember ? thunderOf(after, firstMember) : null,
      proof: { ...proof, ...(plans ? {} : { edited: { status: 'not-checked', checks: [], note: 'The intended steps could not be worked out for this edit, so the edited function is shown for a person to check.' } }) },
      says: ok ? `AI-written: ${list.map(describeEdit).join(' ')} ${plans ? 'Checked: the edited steps read exactly as intended, and nothing else in the file changed meaning.' : 'Checked: nothing else in the file changed meaning; the edited function needs a person to read it.'}` : `The AI-written change does not do what the edit says: ${proof.problems.join(' ')}`,
      ...(ok ? {} : { reason: proof.problems.join(' ') }),
    };
  }

  let state = makeState(original);
  const plans = [], said = [];
  for (const e of list) {
    try {
      const r = applyEdit(state, e);
      state = makeState(r.files, original);
      plans.push(r.plan);
      said.push(r.says);
    } catch (err) {
      if (err.refused) return { ...base, status: 'refused', reason: err.message, says: `Not changed: ${err.message}`, before };
      if (err.needsAi) return { ...base, status: 'needs-ai', reason: err.message, prompt: aiPrompt(original, list, err.message), says: `This change needs an AI coding agent: ${err.message} The instruction below is ready to run; its result will be labeled AI-written and checked the same way.`, before };
      throw err;
    }
  }
  const after = state.files;
  const proof = proveChange(original, after, plans);
  if (!proof.ok) {
    // The writer's own patch did not prove out: never return it as written.
    const why = `The written code did not prove out (${proof.problems.join(' ')})`;
    return { ...base, status: 'needs-ai', reason: why, prompt: aiPrompt(original, list, why), says: `This change needs an AI coding agent: ${why}.`, before, rejected: { patch: [...after.keys()].map((p) => unifiedDiff(p, original.get(p), after.get(p))).join(''), proof } };
  }
  const patch = [...after.keys()].map((p) => unifiedDiff(p, original.get(p), after.get(p))).join('');
  const changedFiles = [...after.keys()].filter((p) => after.get(p) !== original.get(p));
  const others = proof.unchanged.checked;
  const tail = others ? `nothing else changed: ${others} other function${others === 1 ? '' : 's'} in ${changedFiles.length === 1 ? 'the file' : 'the files'} mean${others === 1 ? 's' : ''} exactly the same` : 'nothing else in the file changed';
  const afterRef = plans.find((p) => p.member)?.member;
  return {
    ...base, status: 'written', author: 'thunder', patch, files: Object.fromEntries(changedFiles.map((p) => [p, after.get(p)])),
    before, after: afterRef ? thunderOf(after, { file: afterRef.path, name: afterRef.name }) : plans[0]?.added ? thunderOf(after, { file: plans[0].added.path, name: plans[0].added.name }) : null,
    proof: { edited: proof.edited, unchanged: proof.unchanged },
    says: `${said.map((x, i) => (i ? x[0].toLowerCase() + x.slice(1) : x)).join('; ')}; ${tail}.`,
  };
}

/** The intended steps of each edit, without keeping the written code (used to check someone else's code). */
function planOnly(original, list) {
  let state = makeState(original);
  const plans = [];
  for (const e of list) { const r = applyEdit(state, e); state = makeState(r.files, original); plans.push(r.plan); }
  return plans;
}
