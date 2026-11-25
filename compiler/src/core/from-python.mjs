// Python → Thunder Core: the reader's meaning tree printed as Core a person can edit and compile again.
// Browser-safe (no Node APIs).
//
// Reading and writing are the same language. The reader parses Python into a meaning tree (read.mjs: each step has
// an `expr`); this file prints that tree as Thunder Core (docs/core.md). It works from the tree, never from the
// reader's English, so what it prints means what the code means.
//
// Never a guess. A step Core cannot say with the same meaning is NOT rewritten into something close: it becomes
//     # Not translated (line 7): sorted(items) sorts plain values, which Core cannot say yet
//     Stop with "Line 7 of the Python was not translated: sorted(items)"
// so running it fails loudly at that point instead of skipping it, and the function is marked not safely editable.
// Assumptions that keep the meaning only for some inputs are written next to the line (`# assumes …`), never hidden:
// a Python value used as a condition is read as yes/no, and Core checks that it is when the program runs.

import { readCode } from '../read.mjs';
import { parseExpr } from '../meaning.mjs';
import { RESERVED } from './parser.mjs';
import { compileCore } from './index.mjs';

class NotTranslated extends Error {}
const nt = (why) => { throw new NotTranslated(why); };

// Statement words Core reads at the start of a line: a name equal to one is kept as its Python spelling.
const STATEMENT_START = new Set(['say', 'print', 'set', 'keep', 'give', 'stop', 'when', 'if', 'for', 'repeat', 'to', 'receive', 'expect', 'never', 'use', 'test', 'add', 'remove', 'increase', 'decrease', 'sort', 'reverse', 'round', 'read', 'each', 'until', 'while', 'otherwise', 'has', 'have', 'fails', 'this', 'error']);

/** A Python identifier as a Core name: snake_case becomes words ("tax_rate" → "tax rate") unless a word belongs to Thunder. */
export function coreName(id) {
  const words = String(id).split('_').filter(Boolean);
  const ok = words.length > 0 && !String(id).startsWith('_') && words.every((w) => /^[A-Za-z][A-Za-z0-9]*$/.test(w) && !RESERVED.has(w.toLowerCase()) && !STATEMENT_START.has(w.toLowerCase()));
  if (ok) return words.join(' ');
  // A whole name that is a Thunder word ("a", "to", "say") gets an underscore, so it can never be read as that word.
  const lower = String(id).toLowerCase();
  return RESERVED.has(lower) || STATEMENT_START.has(lower) ? `${id}_` : id;
}

/** Text as a Core text literal: quotes, backslashes, and braces escaped ({ starts a hole in Core text). */
export const coreText = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\{/g, '{{').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;

const BOOLISH = new Set(['compare', 'logic', 'not']);
const isBoolish = (e) => !!e && (BOOLISH.has(e.kind) || (e.kind === 'literal' && e.type === 'bool') || (e.kind === 'unary' && e.op === 'not'));
const isName = (e, n) => e?.kind === 'name' && (n === undefined || e.name === n);
const lit = (e) => (e?.kind === 'literal' ? e : null);
// A value needs no parentheses when it is one thing: a number, a text, a name (words), or a field chain (o's a's b).
const ATOM = /^(-?\d[\d.]*|"(?:[^"\\]|\\.)*"|[A-Za-z_]\w*(?: [A-Za-z_]\w*)*(?:'s [A-Za-z_]\w*)*|\((?:[^()]|\([^()]*\))*\)|\[(?:[^[\]"]|"(?:[^"\\]|\\.)*")*\])$/;
const paren = (s) => (ATOM.test(s) ? s : `(${s})`);

/**
 * Print Python source as Thunder Core.
 * Gives back { core, functions: [{ name, coreName, line, exact, notTranslated: [{ line, code, why }], assumptions }] }.
 * `exact` means every step was printed with its meaning; only then is the function safe to edit and compile back.
 */
export function pythonToCore(source) {
  const reading = readCode(source, { language: 'python', allSteps: true, sayEverything: true });
  const srcLines = String(source).split('\n');
  const all = reading.items.filter((i) => (i.kind === 'function' || i.kind === 'decision') && Array.isArray(i.steps));
  // A method or an inner function is not a Core function: it is listed, as a comment, not printed as "To …:".
  const nested = all.filter((i) => /^\s/.test(srcLines[i.line - 1] ?? ''));
  const fns = all.filter((i) => !nested.includes(i));
  // Functions and values share one set of names in Core. A function whose name is also a value somewhere in the file
  // (an input, a variable, a module value) is renamed "<name> function", and every call to it follows. Core names
  // ignore case (MARKET and market are one name), so every comparison here is in lower case.
  const lc = (n) => coreName(n).toLowerCase();
  const valueNames = new Set();
  const collect = (e) => {
    if (!e || typeof e !== 'object') return;
    if (Array.isArray(e)) return e.forEach(collect);
    if (e.kind === 'assign' && e.target?.kind === 'name') valueNames.add(lc(e.target.name));
    if (e.kind === 'loop') for (const t of e.targets || []) if (t.kind === 'name') valueNames.add(lc(t.name));
    for (const v of Object.values(e)) if (v && typeof v === 'object') collect(v);
  };
  const walk = (ss) => { for (const s of ss || []) { collect(s.expr); walk(s.children); walk(s.otherwise); } };
  for (const f of fns) { for (const p of f.inputs || []) valueNames.add(lc(p.name)); walk(f.steps); }
  for (const text of String(source).split('\n')) { const m = /^([A-Za-z_]\w*)\s*=/.exec(text); if (m) valueNames.add(lc(m[1])); }
  // A module value that a function also uses as its own input or variable is renamed "<name>_module" (Python lets the
  // local hide the module value; Core keeps names distinct). Each function reads the module value by that name only
  // where it has no local of the same name.
  const localsOf = new Map();
  for (const f of fns) {
    const loc = new Set((f.inputs || []).map((p) => p.name));
    const add = (e) => { if (!e || typeof e !== 'object') return; if (Array.isArray(e)) return e.forEach(add); if (e.kind === 'assign' && e.target?.kind === 'name') loc.add(e.target.name); if (e.kind === 'loop') for (const t of e.targets || []) if (t.kind === 'name') loc.add(t.name); for (const v of Object.values(e)) if (v && typeof v === 'object') add(v); };
    const w = (ss) => { for (const st of ss || []) { add(st.expr); w(st.children); w(st.otherwise); } };
    w(f.steps);
    localsOf.set(f, loc);
  }
  const allLocals = new Set([...localsOf.values()].flatMap((x) => [...x].map(lc)));
  const moduleNames = new Map();
  for (const text of srcLines) { const m = /^([A-Za-z_]\w*)\s*=/.exec(text); if (m && !moduleNames.has(m[1])) moduleNames.set(m[1], allLocals.has(lc(m[1])) ? `${m[1]}_module` : m[1]); }
  const own = new Map();
  const taken = new Set();
  for (const f of fns) {
    let n = coreName(f.name);
    if (valueNames.has(n.toLowerCase())) n = /^[A-Za-z]+( [A-Za-z]+)*$/.test(n) ? `${n} function` : `${n}_function`;
    // Python lets a later def replace an earlier one; in Core each gets its own name.
    for (let k = 2; taken.has(n.toLowerCase()); k++) n = `${n.replace(/_\d+$/, '')}_${k}`;
    taken.add(n.toLowerCase());
    if (!own.has(f.name)) own.set(f.name, n);
    f.coreName = n;
  }
  const lines = String(source).split('\n');
  const out = [];
  const functions = [];
  // Module-level values (TAX = 0.07): "Keep TAX at 0.07". Anything else at the top level is listed, never dropped quietly.
  const kept = [];
  const top = new FunctionPrinter({ name: '(module)', steps: [], inputs: [] }, own, lines, { moduleNames });
  lines.forEach((text, i) => {
    const m = /^([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/.exec(text);
    if (!m || /^\s/.test(text)) return;
    try { kept.push(`Keep ${coreName(moduleNames.get(m[1]) ?? m[1])} at ${top.value(parseExpr(m[2], 'python'))}`); }
    catch (e) {
      if (!(e instanceof NotTranslated)) throw e;
      kept.push(`# Not translated (line ${i + 1}): ${e.message}`, `Keep ${coreName(moduleNames.get(m[1]) ?? m[1])} at nothing`);
      top.notTranslated.push({ line: i + 1, code: text.trim(), why: e.message });
    }
  });
  if (kept.length) out.push(...kept, '');
  const printed = fns.map((f) => new FunctionPrinter(f, own, lines, { moduleNames, locals: localsOf.get(f) }).print());
  // The printed Core must compile, whatever the Python looked like. A function that does not (a name set only by a
  // line that was not translated, say) keeps what was printed as comments, so a reader still sees it, and its body
  // becomes one Stop line; it is reported as not translated, never as exact.
  const assemble = () => [...out, ...printed.flatMap((p) => [...p.lines, ''])].join('\n').replace(/\n+$/, '\n');
  for (let round = 0; round <= printed.length + kept.length; round++) {
    const text = assemble();
    const c = compileCore(text);
    if (c.ok || !c.diagnostics.length) break;
    const d = c.diagnostics[0];
    // Which part holds the line: a kept value at the top, or one of the functions.
    let at = 1 + out.length + (out.length ? 0 : 0);
    let owner = null;
    if (d.line <= out.length) {
      const i = d.line - 1;
      top.notTranslated.push({ line: null, code: out[i], why: `the printed Core did not compile: ${d.message}` });
      out[i] = `# Not translated: ${out[i]} (${d.message})`;
      continue;
    }
    at = out.length + 1;
    for (const p of printed) { if (d.line >= at && d.line < at + p.lines.length) { owner = p; break; } at += p.lines.length + 1; }
    if (!owner || owner.commented) break; // nothing more Thunder can do; the diagnostics stay visible
    const [header, ...rest] = owner.lines;
    const receive = rest[0]?.startsWith('  Receive ') ? [rest.shift()] : [];
    owner.info.exact = false;
    owner.info.notTranslated.push({ line: null, code: owner.info.name, why: `the printed Core did not compile (${d.message}), so the function is shown as comments` });
    owner.lines = [header, ...receive, ...rest.map((l) => `  # ${l.trimStart().startsWith('#') ? l.trim().replace(/^#\s*/, '') : l.slice(2)}`), `  Stop with ${coreText(`${owner.info.name} was not translated from Python: the printed Core did not compile`)}`];
    owner.commented = true;
  }
  let core = assemble();
  if (!compileCore(core).ok) {
    // Last resort, so the promise holds: everything is shown as comments, and nothing is claimed as exact.
    const why = compileCore(core).diagnostics[0]?.message ?? 'unknown';
    core = [`# Thunder could not print this file as Core that compiles (${why}). What it printed is below, as comments.`, ...core.split('\n').map((l) => (l ? `# ${l}` : l))].join('\n');
    for (const p of printed) if (p.info.exact) { p.info.exact = false; p.info.notTranslated.push({ line: null, code: p.info.name, why: 'the file as a whole did not compile as Core, so it is shown as comments' }); }
  }
  if (nested.length) {
    core += `${core.endsWith('\n') || !core ? '' : '\n'}\n# Not translated: ${nested.length} method${nested.length === 1 ? '' : 's'} or inner function${nested.length === 1 ? '' : 's'} (Core has records and functions, not methods or inner functions yet):\n`
      + nested.map((f) => `#   line ${f.line}: ${f.name}`).join('\n') + '\n';
  }
  for (const p of printed) functions.push(p.info);
  for (const f of nested) functions.push({ name: f.name, coreName: null, line: f.line, exact: false, notTranslated: [{ line: f.line, code: (srcLines[f.line - 1] ?? '').trim(), why: 'a function inside a class or another function (Core has records and functions, not methods or inner functions yet)' }], assumptions: [] });
  functions.sort((a, b) => a.line - b.line);
  return { core, functions, module: { notTranslated: top.notTranslated } };
}

class FunctionPrinter {
  constructor(fn, own, srcLines, { moduleNames = new Map(), locals = new Set() } = {}) {
    this.fn = fn; this.own = own; this.src = srcLines; this.moduleNames = moduleNames; this.locals = locals;
    this.lines = []; this.notTranslated = []; this.assumptions = [];
    this.kinds = new Map(); // name -> 'number' | 'text' | 'list' | 'map' (what this function set it to)
  }

  print() {
    const f = this.fn;
    const name = f.coreName ?? this.own.get(f.name) ?? coreName(f.name);
    const params = (f.inputs || []).map((p) => p.name);
    const head = (n, ps) => [`To ${n}:`, ...(ps.length ? [`  Receive ${ps.length === 1 ? coreName(ps[0]) : `${ps.slice(0, -1).map(coreName).join(', ')} and ${coreName(ps.at(-1))}`}`] : [])];
    if (f.stepsMore || (f.totalSteps != null && f.steps.length === 0 && f.totalSteps > 0)) this.notTranslated.push({ line: f.line, code: f.name, why: 'the reader did not list every step of this function' });
    if (/^\s/.test(this.src[f.line - 1] ?? '')) {
      this.notTranslated.push({ line: f.line, code: (this.src[f.line - 1] ?? '').trim(), why: 'a function inside a class or another function (Core has records and functions, not methods or inner functions yet)' });
      return this.refuseWhole(head(name, params), name);
    }
    if (params.some((p) => !/^[A-Za-z_]\w*$/.test(p))) {
      this.notTranslated.push({ line: f.line, code: this.src[f.line - 1]?.trim() ?? '', why: 'its inputs use *args, **kwargs, or another form Core does not have' });
      return this.refuseWhole([`To ${name}:`], name);
    }
    for (let i = f.line - 2; i >= 0 && /^\s*(@|#)/.test(this.src[i]); i--) {
      if (/^\s*@/.test(this.src[i])) { this.notTranslated.push({ line: i + 1, code: this.src[i].trim(), why: 'a decorator changes what this function is (it may cache it, register it, or replace it), which Core cannot say' }); break; }
    }
    const defaults = /\bdef\s+\w+\s*\(([^)]*)\)/.exec(this.src[f.line - 1] ?? '')?.[1] ?? '';
    if (/=/.test(defaults)) this.notTranslated.push({ line: f.line, code: this.src[f.line - 1].trim(), why: 'an input has a default value, which Core does not have yet' });
    this.block(f.steps, 1);
    const exact = this.notTranslated.length === 0;
    const body = this.lines.length ? this.lines : ['  Give nothing'];
    return {
      lines: [...head(name, params), ...body],
      info: { name: f.name, coreName: name, line: f.line, exact, notTranslated: this.notTranslated, assumptions: this.assumptions },
    };
  }

  /** The whole function is one meaning Core cannot say yet: its body is one Stop line. */
  refuseWhole(headLines, name) {
    const n = this.notTranslated[0];
    return {
      lines: [...headLines, `  # Not translated (line ${n.line}): ${n.why}`, `  Stop with ${coreText(`${this.fn.name} was not translated from Python: ${n.why}`)}`],
      info: { name: this.fn.name, coreName: name, line: this.fn.line, exact: false, notTranslated: this.notTranslated, assumptions: [] },
    };
  }

  emit(depth, text) { this.lines.push(`${'  '.repeat(depth)}${text}`); }

  block(steps, depth) {
    for (const s of steps || []) {
      const mark = this.lines.length;
      this.line = s.line ?? this.line;
      try { this.step(s, depth); }
      catch (e) {
        if (!(e instanceof NotTranslated)) throw e;
        this.lines.length = mark; // drop anything this step half-printed
        const code = (s.code || this.src[(s.line ?? 1) - 1] || '').trim();
        this.notTranslated.push({ line: s.line ?? null, code, why: e.message });
        this.emit(depth, `# Not translated (line ${s.line}): ${e.message}`);
        this.emit(depth, `Stop with ${coreText(`Line ${s.line} of the Python was not translated: ${code}`)}`);
      }
    }
  }

  step(s, d) {
    const e = s.expr;
    if (s.kind === 'branch' || e?.kind === 'if') return this.branch(s, d, false);
    if (!e) nt(`Thunder did not read the meaning of this step (${s.kind})`);
    switch (e.kind) {
      case 'assign': return this.assign(e, d);
      case 'return': return this.emit(d, e.value ? `Give ${this.value(e.value)}` : 'Give nothing');
      case 'call': return this.callStatement(e, d);
      case 'loop': return this.loop(s, e, d);
      case 'throw': {
        if (!e.value) nt('a bare raise passes on an error that is caught here, which Core cannot say yet');
        const v = e.value;
        if (v.kind === 'call' && (v.args || []).length === 1) return this.emit(d, `Stop with ${this.value(v.args[0])}`);
        if (v.kind === 'call' && !(v.args || []).length) return this.emit(d, `Stop with ${coreText(v.callee?.name ?? 'an error')}`);
        nt('this raise is not of the form raise SomeError("message")');
        return undefined;
      }
      case 'pass': return undefined;
      case 'code': nt('Thunder did not read the meaning of this line'); return undefined;
      default: nt(`Core has no step for a Python ${e.kind}${e.kind === 'try' ? ' (an error handler that names its error kinds)' : ''} yet`);
    }
    return undefined;
  }

  branch(s, d, isElse) {
    const test = s.expr?.test;
    if (!test) nt('the condition of this if was not read');
    let cond = this.condition(test, s.line);
    if (s.negate) cond = `not ${paren(cond)}`;
    this.emit(d, `${isElse ? 'Otherwise when' : 'When'} ${cond}:`);
    this.blockOrNothing(s.children, d + 1);
    const other = s.otherwise || [];
    if (other.length === 1 && other[0].elseIf) return this.branch(other[0], d, true);
    if (other.length) { this.emit(d, 'Otherwise:'); this.blockOrNothing(other, d + 1); }
    return undefined;
  }

  blockOrNothing(steps, d) {
    const before = this.lines.length;
    this.block(steps, d);
    if (this.lines.length === before) nt('an empty block (pass) inside a condition or loop, which Core does not have');
  }

  // ── statements ──

  assign(e, d) {
    const t = e.target;
    if (e.op === '=' ) {
      if (t.kind === 'name') {
        this.remember(t.name, e.value);
        return this.emit(d, `Set ${coreName(t.name)} to ${this.value(e.value)}`);
      }
      return this.emit(d, `Set ${this.place(t)} to ${this.value(e.value)}`);
    }
    if (e.op === '+=' || e.op === '-=') {
      const target = t.kind === 'name' ? coreName(t.name) : this.place(t);
      const v = this.value(e.value);
      if (t.kind === 'name' && this.kinds.get(t.name) === 'number') return this.emit(d, `${e.op === '+=' ? 'Increase' : 'Decrease'} ${target} by ${v}`);
      return this.emit(d, `Set ${target} to ${target} ${e.op[0]} ${paren(v)}`);
    }
    nt(`Core has no ${e.op} yet`);
    return undefined;
  }

  remember(name, v) {
    const k = v?.kind === 'literal' ? (v.type === 'number' ? 'number' : v.type === 'text' ? 'text' : null)
      : v?.kind === 'object' ? 'map' : v?.kind === 'array' || v?.kind === 'list' ? 'list' : null;
    if (k) this.kinds.set(name, k); else this.kinds.delete(name);
  }

  /** Something that can be set: a field (o's price) or an entry of a map (counts at word). */
  place(t) {
    if (t.kind === 'member') return `${this.owner(t.object)}'s ${t.property}`;
    if (t.kind === 'index') return this.indexed(t);
    nt('only a name, a field, or a map entry can be set in Core');
    return '';
  }

  callStatement(e, d) {
    const path = calleePath(e.callee);
    if (path?.length === 1 && path[0] === 'print') {
      if ((e.args || []).some((a) => a.kind === 'named' || a.kind === 'spread')) nt('print with sep=, end= or file= has no Core form');
      const args = e.args || [];
      if (!args.length) nt('an empty print() prints a blank line, which Core has no form for yet');
      if (args.length === 1) return this.emit(d, `say ${this.value(args[0])}`);
      return this.emit(d, `say ${coreText('').slice(0, -1)}${args.map((a) => `{${this.value(a)}}`).join(' ')}"`);
    }
    if (path?.length === 2 && path[1] === 'append' && (e.args || []).length === 1) return this.emit(d, `Add ${this.value(e.args[0])} to ${this.owner(e.callee.object)}`);
    if (path?.length === 1 && this.own.has(path[0])) return this.emit(d, this.ownCall(path[0], e.args || []));
    nt(`calls ${path ? path.join('.') : 'a computed function'}, which Core does not know`);
    return undefined;
  }

  loop(s, e, d) {
    if (e.form === 'while') {
      this.emit(d, `Repeat while ${this.condition(e.test ?? e.condition, s.line)}:`);
      return this.blockOrNothing(s.children, d + 1);
    }
    if (e.form !== 'each') nt(`Core has no ${e.form} loop`);
    const targets = e.targets || [];
    const it = e.iterable;
    if (targets.length === 1 && isName(targets[0]) && it?.kind === 'call' && isName(it.callee, 'range')) {
      const a = it.args || [];
      if (a.length === 0 || a.length > 2) nt('range with a step has no Core form yet');
      const from = a.length === 2 ? this.value(a[0]) : '0';
      const end = a.length === 2 ? a[1] : a[0];
      // range stops before its end: range(1, n + 1) counts 1 … n.
      let to;
      if (end.kind === 'binary' && end.op === '+' && lit(end.right)?.type === 'number' && Number(lit(end.right).value) === 1) to = this.value(end.left);
      else if (lit(end)?.type === 'number' && Number.isInteger(Number(lit(end).value))) to = String(Number(lit(end).value) - 1);
      else to = `${paren(this.value(end))} - 1`;
      this.kinds.set(targets[0].name, 'number');
      this.emit(d, `For each ${coreName(targets[0].name)} from ${from} to ${to}:`);
      return this.blockOrNothing(s.children, d + 1);
    }
    if (targets.length === 2 && targets.every((t) => isName(t)) && it?.kind === 'call' && calleePath(it.callee)?.at(-1) === 'items' && !(it.args || []).length) {
      this.emit(d, `For each ${coreName(targets[0].name)} and ${coreName(targets[1].name)} in ${this.owner(it.callee.object)}:`);
      return this.blockOrNothing(s.children, d + 1);
    }
    if (targets.length !== 1 || !isName(targets[0])) nt('a loop that unpacks several names has no Core form here');
    this.kinds.delete(targets[0].name);
    this.emit(d, `For each ${coreName(targets[0].name)} in ${this.value(it)}:`);
    return this.blockOrNothing(s.children, d + 1);
  }

  // ── values ──

  /** A condition: a comparison stays as it is; any other value is read as yes/no (and Core checks that it is). */
  condition(e, line, item = null) {
    if (isBoolish(e)) return this.value(e, item);
    if (e?.kind === 'unary' && e.op === 'not') return `not ${paren(this.condition(e.value ?? e.operand, line, item))}`;
    const v = this.value(e, item);
    this.assumptions.push({ line: line ?? this.line ?? null, says: `${v} is read as yes/no (Python would also accept other values here); Core stops with an error if it is not yes/no` });
    return `${paren(v)} is true`;
  }

  value(e, item = null) {
    if (!e) nt('a value Thunder did not read');
    switch (e.kind) {
      case 'name':
        if (item && e.name === item) nt('the item itself is used here, which "where" cannot say');
        if (this.own.has(e.name) && !this.locals.has(e.name)) nt(`passes the function ${e.name} itself as a value; in Core, writing a function's name calls it`);
        return coreName(!this.locals.has(e.name) && this.moduleNames.has(e.name) ? this.moduleNames.get(e.name) : e.name);
      case 'literal': {
        if (e.type === 'number') { if (!/^-?\d[\d_]*(\.\d+)?$/.test(String(e.raw ?? e.value))) nt(`the number ${e.raw} has no Core form`); return String(e.raw ?? e.value).replace(/_/g, ''); }
        if (e.type === 'text') { if (e.bytes) nt('a bytes value (b"…") is not text in Python, and Core has no bytes'); return coreText(e.value); }
        if (e.type === 'bool') return e.value ? 'true' : 'false';
        if (e.type === 'null') return 'nothing';
        nt(`a ${e.type} value has no Core form`);
        return '';
      }
      case 'template': return this.template(e, item);
      case 'member':
        if (item && isName(e.object, item)) return e.property;
        return `${this.owner(e.object, item)}'s ${e.property}`;
      case 'index': return this.indexed(e, item);
      case 'binary': {
        const op = { '+': '+', '-': '-', '*': '*', '/': '/', '%': 'mod' }[e.op];
        if (!op) nt(e.op === '//' ? 'Python // rounds down to a whole number, which Core cannot say yet' : `Core has no ${e.op} operator`);
        if (op !== '+' && [e.left, e.right].some((x) => lit(x)?.type === 'text')) nt(`${e.op} with text means something else in Python here (a path, a repeat, or a format), not arithmetic`);
        return `${paren(this.value(e.left, item))} ${op} ${paren(this.value(e.right, item))}`;
      }
      case 'unary':
        if (e.op === '-') return `-${paren(this.value(e.value ?? e.operand, item))}`;
        nt(`Core has no unary ${e.op}`);
        return '';
      case 'not': return `not ${paren(this.condition(e.value ?? e.operand ?? e.expr, null, item))}`;
      case 'compare': return this.compare(e, item);
      case 'chain': nt('a chained comparison (a < b < c) has no Core form yet'); return '';
      case 'logic': {
        // Python and/or give back one of their values; in Core they are yes/no, so each side must be yes/no.
        const ops = e.operands || [];
        if (ops.length < 2) nt('a logic expression Thunder did not read');
        // Comparisons bind tighter than and/or in Core, so only a nested and/or of the other kind needs parentheses.
        return ops.map((x) => { const t = isBoolish(x) ? this.value(x, item) : this.condition(x, null, item); return x.kind === 'logic' && x.op !== e.op ? `(${t})` : t; }).join(e.op === 'and' ? ' and ' : ' or ');
      }
      case 'call': return this.callValue(e, item);
      case 'array': case 'list':
        // A tuple is not a list in Python (it never equals one); only as the right side of "in" is it the same.
        if (e.form === 'tuple' && !this.inMembership) nt('a tuple is not a list in Python, and Core has lists only');
        return `[${(e.items || e.elements || []).map((x) => this.value(x, item)).join(', ')}]`;
      case 'object':
        if ((e.entries || []).length) nt('a dictionary written with entries has no Core form yet (an empty one does)');
        return 'an empty map';
      case 'comprehension': return this.comprehension(e);
      default: nt(`Core has no form for a Python ${e.kind}`);
    }
    return '';
  }

  /** The value a field or entry is read from: a name, or another field (Core reads o's a's b). */
  owner(e, item = null) {
    if (e.kind === 'name') return this.value(e, item);
    if (e.kind === 'member') return this.value(e, item);
    return paren(this.value(e, item));
  }

  indexed(e, item = null) {
    const obj = e.object, key = e.index ?? e.property ?? e.key;
    const kind = obj.kind === 'name' ? this.kinds.get(obj.name) : null;
    if (lit(key)?.type === 'text' || kind === 'map') return `${this.owner(obj, item)} at ${paren(this.value(key, item))}`;
    if (lit(key)?.type === 'number' && Number.isInteger(Number(key.value)) && Number(key.value) >= 0) {
      if (kind !== 'list') this.assumptions.push({ line: this.line ?? null, says: `${this.owner(obj, item)} is read as a list (or tuple), so Python's position ${key.value} is Core's position ${Number(key.value) + 1}; a map with number keys would mean something else` });
      return `${this.owner(obj, item)} at ${Number(key.value) + 1}`; // Core counts from 1
    }
    nt('Thunder cannot tell whether this is a list position (Python counts from 0, Core from 1) or a map key');
    return '';
  }

  compare(e, item) {
    if (e.chain || e.comparators) nt('a chained comparison (a < b < c) has no Core form yet');
    const l = this.value(e.left, item);
    const r = e.right;
    if (r && lit(r)?.type === 'null' && (e.op === 'is' || e.op === '==')) return `${paren(l)} is nothing`;
    if (r && lit(r)?.type === 'null' && (e.op === 'is not' || e.op === '!=')) return `${paren(l)} is not nothing`;
    const words = { '==': 'is', '!=': 'is not', '>=': 'is at least', '<=': 'is at most', '>': 'is more than', '<': 'is less than', in: 'is in' }[e.op];
    const side = (x) => { this.inMembership = true; try { return this.value(x, item); } finally { this.inMembership = false; } };
    if (e.op === 'not in') return `not (${paren(l)} is in ${paren(side(r))})`;
    if (e.op === 'in') return `${paren(l)} is in ${paren(side(r))}`;
    if (!words) nt(`Core has no ${e.op} comparison`);
    return `${paren(l)} ${words} ${paren(this.value(r, item))}`;
  }

  template(e, item) {
    let out = '"';
    for (const p of e.parts || []) {
      if (typeof p === 'string') out += coreText(p).slice(1, -1);
      else {
        if (p.format || p.spec || p.conversion) nt('a format specification inside an f-string has no Core form yet');
        out += `{${this.value(p.expr ?? p, item)}}`;
      }
    }
    return `${out}"`;
  }

  callValue(e, item) {
    const path = calleePath(e.callee);
    const args = e.args || [];
    if ((args).some((a) => a.kind === 'spread')) nt('*args in a call has no Core form');
    const one = args.length === 1 && args[0].kind !== 'named' ? args[0] : null;
    if (path?.length === 1) {
      const f = path[0];
      if (f === 'len' && one) return `the count of ${paren(this.value(one, item))}`;
      if (f === 'sum' && one) return `the sum of ${paren(this.value(one, item))}`;
      if (f === 'min' && one) return `the smallest of ${paren(this.value(one, item))}`;
      if (f === 'max' && one) return `the largest of ${paren(this.value(one, item))}`;
      if (f === 'round') nt('Python round() rounds halves to even; Thunder rounds half up');
      if (f === 'sorted') return this.sorted(e, item);
      if (this.own.has(f)) return this.ownCall(f, args, item);
      nt(`calls ${f}(), which Core does not know`);
    }
    if (e.callee?.kind === 'member' && !(path?.length === 1)) {
      const m = e.callee.property;
      const of = (op) => `the ${op} of ${this.owner(e.callee.object, item)}`;
      if (m === 'lower' && !args.length) return of('lowercase');
      if (m === 'upper' && !args.length) return of('uppercase');
      if (m === 'strip' && !args.length) return of('trimmed');
      if (m === 'get' && args.length === 2) return `(${this.owner(e.callee.object, item)} at ${paren(this.value(args[0], item))} otherwise ${paren(this.value(args[1], item))})`;
      if (m === 'split' && !args.length) nt('split() keeps punctuation inside words; Core\'s "the words of" removes it, so the meaning would change');
    }
    nt(`calls ${path ? path.join('.') : e.callee?.kind === 'member' ? `.${e.callee.property}()` : 'a computed function'}, which Core does not know`);
    return '';
  }

  sorted(e, item) {
    const args = e.args || [];
    const list = args.find((a) => a.kind !== 'named');
    const named = Object.fromEntries(args.filter((a) => a.kind === 'named').map((a) => [a.name, a.value]));
    if (!list || !named.key) nt('sorted() without key= sorts plain values, which Core cannot say yet');
    const k = named.key;
    const p0 = (k.params || [])[0]; const pn = typeof p0 === 'string' ? p0 : p0?.name;
    const field = k.kind === 'lambda' && (k.params || []).length === 1 && k.body?.kind === 'member' && isName(k.body.object, pn) ? k.body.property : null;
    if (!field) nt('a sort key other than lambda x: x.field has no Core form yet');
    const rev = named.reverse;
    if (rev && !(lit(rev)?.type === 'bool')) nt('reverse= with a computed value has no Core form');
    return `${paren(this.value(list, item))} sorted by ${field}${rev && lit(rev).value ? ' descending' : ''}`;
  }

  comprehension(e) {
    if (e.form !== 'list') nt(`a ${e.form} comprehension has no Core form yet`);
    const clauses = e.clauses || [];
    if (clauses.length !== 1) nt('a comprehension with several for clauses has no Core form');
    const g = clauses[0];
    const v = (g.targets || []).length === 1 && isName(g.targets[0]) ? g.targets[0].name : null;
    if (!v || !isName(e.item, v)) nt('only [x for x in items if …] (keeping the items themselves) has a Core form: "items where …"');
    const conds = g.conds || [];
    const src = this.value(g.iter);
    if (!conds.length) return src;
    if (conds.length > 1) nt('several if clauses in one comprehension have no Core form yet');
    return `${paren(src)} where ${this.condition(conds[0], null, v)}`;
  }

  ownCall(f, args, item = null) {
    if (args.some((a) => a.kind === 'named')) nt('a call with name=value inputs has no Core form yet');
    const name = this.own.get(f);
    if (!args.length) return name;
    const vs = args.map((a) => paren(this.value(a, item)));
    return `${name} with ${vs.length === 1 ? vs[0] : `${vs.slice(0, -1).join(', ')} and ${vs.at(-1)}`}`;
  }
}

function calleePath(e) {
  if (!e) return null;
  if (e.kind === 'name') return [e.name];
  if (e.kind === 'member') { const o = calleePath(e.object); return o ? [...o, e.property] : null; }
  return null;
}
