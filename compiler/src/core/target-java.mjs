// Thunder Core -> Java (17 or newer; the JDK only).
//
// The same checked program the Python target, the Thunder engine, and the TypeScript target use (compileCore ->
// program + info), and the same meaning: every statement does what the Thunder engine does for it, and every
// operation calls thunder.T, the Java runtime (java/thunder/ThunderRuntime.java), which follows the engine's own value
// code (engine-values.mjs) line for line. compiler/test/core-engines.mjs runs every Core test program on Python, the
// Thunder engine, compiled TypeScript, and compiled Java, and requires the same output from all of them.
//
// Every generated statement sets the frame's line (F.line = N) and ends with `// thunder:N`, the Thunder line it came
// from, so an error says which Thunder line failed, exactly as the others do.
//
// Java asks three things the other targets don't, and the code follows them plainly:
//   - a lambda may use only names that never change, so a name a lambda uses (a "where" condition, an Expect that must
//     fail, the high end of "between") is kept in a T.Box and read as name.v;
//   - a statement after a return or a throw is an error, so such a step is wrapped in `if (true) { … }`;
//   - there are no default inputs, so a function with defaults gets one short overload per number of inputs.

import { percentDecimal } from './target-python.mjs';
import { firstLine } from './target-typescript.mjs';

/** A Java string literal for any text (non-ASCII kept; control characters and lone surrogates escaped). */
export function javaString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], c = s.charCodeAt(i);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (c < 0x20 || c === 0x7f || (c >= 0xd800 && c <= 0xdfff)) {
      // A surrogate pair stays a pair; a lone surrogate (or a control character) is written as an octal or \u escape.
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) { out += s[i] + s[i + 1]; i++; }
      else out += `\\u${c.toString(16).padStart(4, '0')}`;
    } else out += ch;
  }
  return `${out}"`;
}

const RESERVED = new Set(('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var yield record sealed permits non-sealed exports module requires '
  + 'T F FILE main thunderMain THUNDER_TESTS Object String BigInteger Runnable java app thunder').split(' '));
/** A Java name for a Thunder (Python) name: the same, unless Java or the generated code owns it. */
export const id = (py) => (RESERVED.has(py) ? `${py}_` : py);

/** The Java class for a module: main -> Main, tests_greet -> TestsGreet. */
export function javaClassName(module) {
  const name = String(module).split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Program';
  const safe = /^[0-9]/.test(name) ? `M${name}` : name;
  return ['T', 'ThunderRuntime', 'RunTests'].includes(safe) ? `${safe}Module` : safe;
}

/** Thunder expression kinds the Java code writes as a boolean (a real Java condition). */
const BOOLEAN_KINDS = new Set(['bool', 'cmp', 'contains', 'between', 'adj', 'isNothing', 'not', 'affix']);
const isBooleanCode = (e) => BOOLEAN_KINDS.has(e.k) || (e.k === 'bin' && (e.op === 'and' || e.op === 'or'));

/** Every expression node under a node (types and name references are not expressions). */
function* nodesOf(n) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { for (const x of n) yield* nodesOf(x); return; }
  if (typeof n.k === 'string') yield n;
  for (const [key, v] of Object.entries(n)) {
    if (key === 'type' || key === 'ref' || key === 'info' || key === 'of') continue;
    if (v && typeof v === 'object') yield* nodesOf(v);
  }
}

/** The names a lambda in this body uses: the conditions of "where", the high end of "between", an Expect that fails. */
function capturedNames(body) {
  const out = new Set();
  const take = (e) => { for (const n of nodesOf(e)) if (n.k === 'name' && n.ref?.py && !['subject', 'elem', 'elemField', 'elemKey'].includes(n.ref.kind)) out.add(n.ref.py); };
  const visitExpr = (e) => {
    for (const n of nodesOf(e)) {
      if (n.k === 'where') take(n.cond);
      if (n.k === 'between') take(n.hi);
    }
  };
  const visit = (ss) => {
    for (const s of ss ?? []) {
      for (const [key, v] of Object.entries(s)) {
        if (['body', 'handler', 'otherwise', 'branches', 'stmt', 'rules', 'type', 'ref', 'vars', 'target'].includes(key)) continue;
        if (v && typeof v === 'object') visitExpr(v);
      }
      if (s.target) visitExpr(s.target);
      for (const b of s.branches ?? []) { visitExpr(b.cond); visit(b.body); }
      if (s.k === 'expect' && s.mode === 'fail') take(s.e);
      visit(s.body); visit(s.handler); visit(s.otherwise);
      if (s.stmt) visit([s.stmt]);
    }
  };
  visit(body);
  return out;
}

/** Can this statement finish and let the next one run (Java's "can complete normally")? */
function completes(s) {
  if (s.k === 'give' || s.k === 'stop') return false;
  if (s.k === 'if') return !s.otherwise || s.branches.some((b) => blockCompletes(b.body)) || blockCompletes(s.otherwise);
  if (s.k === 'tryFail') return completes(s.stmt) || blockCompletes(s.handler);
  return true;
}
const blockCompletes = (body) => !body?.length || completes(body[body.length - 1]);

/**
 * Compile one checked file to the Java class for `module`. `imports`: [{ module, names }] for a test file (the
 * project's src modules it sees). Gives back the text of <Class>.java.
 */
export function toJava(program, info, { source = 'main.thunder', module = 'main', imports = [], pkg = 'app' } = {}) {
  return new Gen(program, info, source, module, imports, pkg).module();
}

class Gen {
  constructor(program, info, source, module, imports, pkg) {
    this.p = program; this.info = info; this.source = source; this.pkg = pkg;
    this.cls = javaClassName(module);
    this.out = []; this.ind = 0; this.tmp = 0;
    this.boxed = new Set();
    this.owner = new Map(); // a name a test file sees from a src file -> that file's class
    for (const m of imports) for (const n of m.names) this.owner.set(n, javaClassName(m.module));
  }
  emit(text, line) { this.out.push(`${'    '.repeat(this.ind)}${text}${line ? `  // thunder:${line}` : ''}`); }
  blank() { if (this.out.length && this.out[this.out.length - 1] !== '') this.out.push(''); }
  fresh(base) { return `$${base}${++this.tmp}`; }
  /** A record, function, or kept value: this class's own, or a src file's (for a test file). */
  global(py) { const o = this.owner.get(py); return o ? `${o}.${id(py)}` : id(py); }
  /** A local name or input: name, or name.v when a lambda uses it. */
  lv(py) { return this.boxed.has(py) ? `${id(py)}.v` : id(py); }

  module() {
    const own = (s) => !this.info.imported?.has(s);
    const C = this.cls;
    this.ind = 1;
    for (const r of this.info.records.filter(own)) { this.blank(); this.record(r); }
    const consts = this.info.consts.filter(own);
    if (consts.length) {
      this.blank();
      for (const k of consts) this.emit(`public static Object ${id(k.py)};`, k.line);
      this.emit('static {');
      this.ind++;
      this.emit('T.init(FILE, (T.Frame F) -> {');
      this.ind++;
      for (const k of consts) this.emit(`F.line = ${k.line}; ${id(k.py)} = ${this.x(k.e)};`, k.line);
      this.ind--;
      this.emit('});');
      this.ind--;
      this.emit('}');
    }
    for (const f of this.info.funcs.filter(own)) { this.blank(); this.func(f); }
    const tests = this.info.tests;
    for (const t of tests) {
      this.blank();
      this.emit(`static void ${id(t.py)}() {`, t.line);
      this.ind++;
      this.frameBody(`T.enterFrame(FILE, ${t.line})`, t.body, [], true, [], t.body);
      this.ind--;
      this.emit('}');
    }
    this.blank();
    this.emit('public static final Object[][] THUNDER_TESTS = {');
    for (const t of tests) this.emit(`    { ${javaString(t.title)}, (Runnable) ${C}::${id(t.py)}, ${t.line} },`);
    this.emit('};');
    const main = this.p.main ?? [];
    this.blank();
    this.emit('public static void thunderMain() {');
    this.ind++;
    if (main.length) this.frameBody('T.enterFrame(FILE, 0)', main, [], true, [], main);
    this.ind--;
    this.emit('}');
    this.blank();
    this.emit('public static void main(String[] args) {');
    this.emit(`    T.run(${C}::thunderMain);`);
    this.emit('}');
    const head = [
      `// Generated by the Thunder compiler from ${this.source}.`,
      `// A build artifact: change ${this.source.split('/').pop()} and build again, or keep this file and edit it as Java.`,
      '// It needs only Java 17+ and the thunder runtime (written next to it). "// thunder:N" marks the Thunder line.',
      '',
      `package ${this.pkg};`,
      '',
      'import java.math.BigInteger;',
      'import thunder.T;',
      '',
      `public final class ${C} {`,
      `    static final String FILE = ${javaString(this.source)};`,
    ];
    return `${head.join('\n')}\n${this.out.join('\n').replace(/\n{3,}/g, '\n\n')}\n}\n`;
  }

  record(r) {
    const fields = r.fields.map((f) => `new T.Field(${javaString(f.py)}, ${javaString(f.type?.k ?? 'any')})`).join(', ');
    const rules = r.rulesToCheck ?? [];
    const head = `public static final T.RecordKind ${id(r.py)} = T.recordKind(${javaString(r.py)}, new T.Field[] { ${fields} }`;
    if (!rules.length) { this.emit(`${head});`, r.line); return; }
    this.emit(`${head}, T.rules(`, r.line);
    this.ind++;
    const bySubject = new Map();
    for (const rule of rules) { const f = r.fieldMap.get(rule.subject); (bySubject.get(f.py) ?? bySubject.set(f.py, []).get(f.py)).push(rule); }
    const entries = [...bySubject];
    entries.forEach(([field, rs], k) => {
      this.emit(`${javaString(field)}, new T.Rule[] {`);
      this.ind++;
      for (const rule of rs) this.emit(`new T.Rule((Object value) -> { final T.Frame F = T.topFrame(); return ${this.x(rule.rule.cond, { subject: 'value' })}; }, ${javaString(rule.text)}, ${rule.line}),`, rule.line);
      this.ind--;
      this.emit(`}${k < entries.length - 1 ? ',' : ''}`);
    });
    this.ind--;
    this.emit('));');
  }

  func(f) {
    const name = id(f.py);
    // Defaults: a shorter overload for each input that may be left out, passing its fixed value (a kept value is
    // filled in when the function runs: it may be written further down the file).
    const required = f.params.filter((p) => !p.dflt).length;
    for (let n = required; n < f.params.length; n++) {
      const given = f.params.slice(0, n);
      const rest = f.params.slice(n).map((p) => (p.dflt.k === 'name' ? 'T.NOT_GIVEN' : this.x(p.dflt)));
      this.emit(`public static Object ${name}(${given.map((p) => `Object ${id(p.py)}`).join(', ')}) {`, f.line);
      this.emit(`    return ${name}(${[...given.map((p) => id(p.py)), ...rest].join(', ')});`);
      this.emit('}');
    }
    const captured = capturedNames(f.body);
    for (const p of f.params) for (const rule of p.rules ?? []) for (const n of nodesOf(rule.rule.cond)) if (n.k === 'between' || n.k === 'where') for (const m of nodesOf(n)) if (m.k === 'name' && m.ref?.py) captured.add(m.ref.py);
    const boxedParams = f.params.filter((p) => captured.has(p.py));
    this.emit(`public static Object ${name}(${f.params.map((p) => `Object ${boxedParams.includes(p) ? `$in_${p.py}` : id(p.py)}`).join(', ')}) {`, f.line);
    this.ind++;
    const pre = [];
    for (const p of boxedParams) pre.push([`final T.Box ${id(p.py)} = new T.Box($in_${p.py});`, null]);
    this.boxed = new Set(captured);
    for (const p of f.params) if (p.dflt?.k === 'name') pre.push([`if (${this.lv(p.py)} == T.NOT_GIVEN) { F.line = ${p.line}; ${this.lv(p.py)} = ${this.x(p.dflt)}; }`, p.line]);
    for (const p of f.params) for (const rule of p.rules ?? []) pre.push([`F.line = ${p.line}; T.never(${this.x(rule.rule.cond, { subject: this.lv(p.py) })}, ${javaString(rule.text)}, ${rule.line}, ${this.lv(p.py)});`, p.line]);
    const first = firstLine(f);
    this.frameBody(`T.enterCall(FILE, ${f.line}, ${first ?? 'null'})`, f.body, pre, false, f.params.map((p) => p.py), f.body, captured);
    this.ind--;
    this.emit('}');
  }

  /** A body that runs in its own frame: errors leave with the Thunder line they happened on. */
  frameBody(enter, body, pre, isVoid, params = [], scanned = body, captured = capturedNames(scanned)) {
    this.boxed = new Set(captured);
    this.emit(`final T.Frame F = ${enter};`);
    this.emit('try {');
    this.ind++;
    const locals = [...this.localsOf(body)].filter((n) => !params.includes(n));
    const plain = locals.filter((n) => !this.boxed.has(n)), boxes = locals.filter((n) => this.boxed.has(n));
    if (plain.length) this.emit(`Object ${plain.map((n) => `${id(n)} = null`).join(', ')};`);
    for (const n of boxes) this.emit(`final T.Box ${id(n)} = new T.Box(null);`);
    for (const [code, line] of pre) this.emit(code, line);
    this.block(body, isVoid);
    if (!isVoid && blockCompletes(body)) this.emit('return null;');
    this.ind--;
    this.emit('} catch (RuntimeException $e) { throw T.fail($e); } finally { T.leave(); }');
    this.boxed = new Set();
  }

  /** The names a body assigns (Python's locals): declared once at the top, as a Python function's are. */
  localsOf(body) {
    const names = new Set();
    const visit = (ss) => {
      for (const s of ss ?? []) {
        if (s.k === 'set' && s.target.k === 'name' && s.target.ref?.py) names.add(s.target.ref.py);
        for (const v of s.vars ?? []) if (v?.py) names.add(v.py);
        if (s.k === 'range' && s.v?.py) names.add(s.v.py);
        if (s.errPy) names.add(s.errPy);
        visit(s.body); visit(s.handler); visit(s.otherwise);
        for (const b of s.branches ?? []) visit(b.body);
        if (s.stmt) visit([s.stmt]);
      }
    };
    visit(body);
    const globals = new Set([...this.info.consts, ...this.info.funcs, ...this.info.records].map((x) => x.py));
    return [...names].filter((n) => !globals.has(n));
  }

  /** Statements in order; one that cannot finish (a Give, a Stop) and has steps after it is wrapped for javac. */
  block(body, isVoid) {
    body.forEach((s, i) => {
      if (i < body.length - 1 && !completes(s)) { this.emit('if (true) {'); this.ind++; this.stmt(s, isVoid); this.ind--; this.emit('}'); }
      else this.stmt(s, isVoid);
    });
  }

  /** F.line = N; <code>  // thunder:N */
  line(L, code) { this.emit(`F.line = ${L}; ${code}`, L); }

  /** Check a watched name's Never rules on its new value, then store it. */
  assign(s, name, valueCode) {
    if (!s.rules?.length) { this.line(s.line, `${this.lv(name)} = ${valueCode};`); return; }
    const v = this.fresh('new');
    this.line(s.line, `{ Object ${v} = ${valueCode};`);
    this.ind++;
    for (const rule of s.rules) this.emit(`T.never(${this.x(rule.rule.cond, { subject: v })}, ${javaString(rule.text)}, ${rule.line}, ${v});`, s.line);
    this.emit(`${this.lv(name)} = ${v}; }`, s.line);
    this.ind--;
  }
  rulesAfter(s, name) {
    for (const rule of s.rules ?? []) this.emit(`T.never(${this.x(rule.rule.cond, { subject: this.lv(name) })}, ${javaString(rule.text)}, ${rule.line}, ${this.lv(name)});`, s.line);
  }

  /** Code that stores `v` (a name of generated code) into a name, a field, or an entry. */
  storeCode(t, v) {
    if (t.k === 'name') return `${this.lv(t.ref?.py ?? 'unknown')} = ${v};`;
    if (t.k === 'field') return t.static ? `T.setAttr(${this.x(t.obj)}, ${javaString(t.py)}, ${v});` : `T.setField(${this.x(t.obj)}, ${javaString(t.text)}, ${v});`;
    if (t.k === 'at') {
      const fn = t.objKind === 'list' ? 'T.setItem' : t.objKind === 'map' ? 'T.mapSet' : 'T.setEntry';
      return `${fn}(${this.x(t.obj)}, ${this.x(t.key)}, ${v});`;
    }
    return '';
  }

  stmt(s, isVoid) {
    const L = s.line;
    switch (s.k) {
      case 'say': this.line(L, `T.say(${s.e.type?.k === 'text' ? `T.pyStr(${this.x(s.e)})` : `T.show(${this.x(s.e)})`});`); return;
      case 'set': {
        const t = s.target;
        if (t.k === 'name') { this.assign(s, t.ref.py, this.x(s.e)); return; }
        const v = this.fresh('v');
        this.line(L, `{ Object ${v} = ${this.x(s.e)}; ${this.storeCode(t, v)} }`);
        return;
      }
      case 'give': this.line(L, isVoid ? 'return;' : `return ${s.e.k === 'nothing' ? 'null' : this.x(s.e)};`); return;
      case 'stop': { const v = this.x(s.e); this.line(L, `throw T.Stop(${s.e.type?.k === 'text' ? `T.pyStr(${v})` : `T.show(${v})`});`); return; }
      case 'if': {
        this.emit(`F.line = ${L};`, L);
        s.branches.forEach((b, k) => {
          this.emit(`${k === 0 ? 'if' : '} else if'} (T.at(F, ${b.line}) && ${this.yn(b.cond)}) {`, b.line);
          this.ind++; this.block(b.body, isVoid); this.ind--;
        });
        if (s.otherwise) { this.emit('} else {'); this.ind++; this.block(s.otherwise, isVoid); this.ind--; }
        this.emit('}');
        return;
      }
      case 'each': {
        const [a, b] = s.vars;
        const it = this.x(s.iter);
        const seq = b ? (s.iterKind === 'map' ? `T.mapItems(${it})` : s.iterKind === 'pairs' ? `T.pyIter(${it})` : `T.pairsOf(${it})`) : `T.pyIter(${it})`;
        const el = this.fresh('el');
        this.line(L, `for (Object ${el} : T.loop(${seq})) {`);
        this.ind++;
        if (b) {
          const pair = this.fresh('pair');
          this.emit(`F.line = ${L}; java.util.List<Object> ${pair} = T.unpack2(${el}); ${this.lv(a.py)} = ${pair}.get(0); ${this.lv(b.py)} = ${pair}.get(1);`, L);
        } else this.emit(`F.line = ${L}; ${this.lv(a.py)} = ${el};`, L);
        this.block(s.body, isVoid);
        this.ind--;
        this.emit('}');
        return;
      }
      case 'range': {
        const lo = this.fresh('from'), hi = this.fresh('to'), n = this.fresh('n');
        const to = s.to.k === 'num' && s.to.whole ? `T.i("${BigInt(s.to.text.replace(/_/g, '')) + 1n}")` : `T.add(${this.x(s.to)}, BigInteger.ONE)`;
        const a = this.fresh('a'), b = this.fresh('b');
        this.line(L, `{ Object ${a} = ${this.x(s.from)}, ${b} = ${to}; BigInteger ${lo} = T.rangeInt(${a}), ${hi} = T.rangeInt(${b});`);
        this.ind++;
        this.emit(`for (BigInteger ${n} = ${lo}; ${n}.compareTo(${hi}) < 0; ${n} = ${n}.add(BigInteger.ONE)) {`);
        this.ind++;
        this.emit(`F.line = ${L}; ${this.lv(s.v.py)} = ${n};`, L);
        this.block(s.body, isVoid);
        this.ind--;
        this.emit('}');
        this.ind--;
        this.emit('}');
        return;
      }
      case 'while':
        this.emit(`while (T.at(F, ${L}) && ${s.until ? `!${this.yn(s.cond)}` : this.yn(s.cond)}) {`, L);
        this.ind++; this.block(s.body, isVoid); this.ind--;
        this.emit('}');
        return;
      case 'times': {
        const count = this.fresh('count'), k = this.fresh('k');
        this.line(L, `{ BigInteger ${count} = T.rangeInt(${this.x(s.count)});`);
        this.ind++;
        this.emit(`for (BigInteger ${k} = BigInteger.ZERO; ${k}.compareTo(${count}) < 0; ${k} = ${k}.add(BigInteger.ONE)) {`);
        this.ind++;
        this.emit(`F.line = ${L};`, L);
        this.block(s.body, isVoid);
        this.ind--;
        this.emit('}');
        this.ind--;
        this.emit('}');
        return;
      }
      case 'expect': this.expect(s); return;
      case 'add': case 'remove': this.addRemove(s); return;
      case 'increase': case 'decrease': {
        const op = s.k === 'increase' ? 'T.add' : 'T.sub';
        if (s.target.k === 'name') { const py = s.target.ref?.py ?? 'unknown'; this.assign(s, py, `${op}(${this.lv(py)}, ${this.x(s.e)})`); return; }
        const v = this.fresh('v');
        this.line(L, `{ Object ${v} = ${op}(${this.x(s.target)}, ${this.x(s.e)}); ${this.storeCode(s.target, v)} }`);
        return;
      }
      case 'sort': {
        const item = this.fresh('item');
        const key = s.field ? `T.keyAt(F, (Object ${item}) -> ${this.fieldGet(item, s.field)})` : 'null';
        this.line(L, `T.sortInPlace(${this.x(s.target)}, ${key}, ${!!s.desc});`);
        return;
      }
      case 'reverse': this.line(L, `T.reverseInPlace(${this.x(s.target)});`); return;
      case 'do': this.line(L, s.e.k === 'call' ? `${this.x(s.e)};` : `T.discard(${this.x(s.e)});`); return;
      case 'tryFail': {
        this.emit('try {', L);
        this.ind++; this.stmt(s.stmt, isVoid); this.ind--;
        const e = this.fresh('failure');
        this.emit(`} catch (RuntimeException ${e}) {`, L);
        this.ind++;
        this.line(L, `${this.lv(s.errPy)} = T.explain(T.asPyErr(${e}));`);
        this.block(s.handler, isVoid);
        this.ind--;
        this.emit('}');
        return;
      }
      default: this.emit(`// not generated: ${s.k}`, L);
    }
  }

  addRemove(s) {
    const L = s.line;
    const isName = s.target.k === 'name';
    const py = isName ? s.target.ref?.py ?? 'unknown' : null;
    const v = this.fresh('v'), t = this.fresh('t');
    const head = `Object ${v} = ${this.x(s.e)}, ${t} = ${this.x(s.target)};`;
    let body;
    if (s.targetKind === 'list') body = s.k === 'add' ? `T.appendTo(${t}, ${v});` : `T.removeFrom(${t}, ${v});`;
    else if (s.targetKind === 'map') body = `T.removeFrom(${t}, ${v});`;
    else if (s.targetKind === 'number') {
      const nv = `${s.k === 'add' ? 'T.add' : 'T.sub'}(${t}, ${v})`;
      if (isName && s.rules?.length) {
        const n = this.fresh('new');
        this.line(L, `{ ${head} Object ${n} = ${nv};`);
        this.ind++;
        for (const rule of s.rules) this.emit(`T.never(${this.x(rule.rule.cond, { subject: n })}, ${javaString(rule.text)}, ${rule.line}, ${n});`, L);
        this.emit(`${this.lv(py)} = ${n}; }`, L);
        this.ind--;
        this.rulesAfter(s, py);
        return;
      }
      body = isName ? `${this.lv(py)} = ${nv};` : this.storeCode(s.target, nv);
    } else if (s.k === 'add') body = isName ? `${this.lv(py)} = T.addTo(${t}, ${v});` : this.storeCode(s.target, `T.addTo(${t}, ${v})`);
    else body = `T.removeFrom(${t}, ${v});`;
    this.line(L, `{ ${head} ${body} }`);
    if (isName) this.rulesAfter(s, py);
  }

  expect(s) {
    const L = s.line;
    const text = javaString((s.raw ?? 'Expect').trim());
    if (s.mode === 'true') { this.line(L, `T.expectTrue(${this.x(s.e)}, ${text});`); return; }
    if (s.mode === 'fail') {
      const m = this.fresh('msg');
      this.line(L, `{ Object ${m} = ${s.msg ? this.x(s.msg) : 'null'}; T.expectFailure(() -> T.discard(${this.x(s.e)}), ${text}, ${m}); }`);
      return;
    }
    if (s.mode === 'cmp') { this.line(L, `T.expectValue(${this.x(s.e)}, "contains", "contains", ${this.x(s.want)}, ${text});`); return; }
    let c = s.check, negate = false;
    if (c.k === 'not') { negate = true; c = c.e; }
    const OPS = { '==': 'is', '!=': 'is not', '>=': 'at least', '<=': 'at most', '>': 'more than', '<': 'less than' };
    let op, want = 'null';
    if (c.k === 'cmp') { op = OPS[c.op]; want = this.x(c.r); }
    else if (c.k === 'adj') op = c.adj;
    else if (c.k === 'isNothing') op = c.neg ? 'not nothing' : 'nothing';
    else if (c.k === 'between') { op = 'between'; want = `T.list(${this.x(c.lo)}, ${this.x(c.hi)})`; }
    else if (c.k === 'contains') { op = 'in'; want = this.x(c.l); }
    else op = 'is';
    this.line(L, `T.expectValue(${this.x(s.e)}, ${javaString(negate ? `not ${op}` : op)}, ${javaString(op)}, ${want}, ${text});`);
  }

  fieldGet(v, field) { return field.dynamic ? `T.getField(${v}, ${javaString(field.key)})` : `T.getAttr(${v}, ${javaString(field.py)})`; }

  /** A value used as yes/no: a Java condition, checked to be yes/no when the program runs unless it is one already. */
  yn(e, ctx = {}) {
    const c = this.x(e, ctx);
    return isBooleanCode(e) ? c : `T.yesNo(${c})`;
  }

  x(e, ctx = {}) {
    const sub = (k) => this.x(k, ctx);
    switch (e.k) {
      case 'num': return e.whole ? `T.i("${BigInt(e.text.replace(/_/g, ''))}")` : `T.dec(${javaString(e.text)})`;
      case 'money': return `T.money(${javaString(e.text)})`;
      case 'percent': return `T.dec(${javaString(percentDecimal(e.text))})`;
      case 'bool': return e.v ? 'true' : 'false';
      case 'nothing': case 'hole': return 'null';
      case 'paren': return sub(e.e);
      case 'today': return 'T.today()';
      case 'date': return `T.date(${javaString(e.text)})`;
      case 'str': return this.str(e, ctx);
      case 'list': return e.items ? `T.list(${e.items.map(sub).join(', ')})` : 'T.newMap()';
      case 'map': return 'T.newMap()';
      case 'name': {
        const r = e.ref ?? {};
        if (r.kind === 'subject') return ctx.subject ?? 'null';
        if (r.kind === 'elemField') return `T.getAttr(${ctx.item}, ${javaString(r.py)})`;
        if (r.kind === 'elemKey') return `T.getField(${ctx.item}, ${javaString(r.key)})`;
        if (r.kind === 'elem') return ctx.item;
        const py = r.py ?? e.name.replace(/ /g, '_');
        if (this.boxed.has(py)) return `${id(py)}.v`;
        return this.global(py);
      }
      case 'call': return `${this.global(e.py)}(${e.args.map(sub).join(', ')})`;
      case 'new': return `T.newRecord(${[this.global(e.py), ...e.fields.flatMap((f) => [javaString(f.py), sub(f.e)])].join(', ')})`;
      case 'field': return e.static ? `T.getAttr(${sub(e.obj)}, ${javaString(e.py)})` : `T.getField(${sub(e.obj)}, ${javaString(e.text)})`;
      case 'at': {
        const fn = e.objKind === 'map' ? 'T.mapGet' : e.objKind === 'list' ? 'T.itemAt' : 'T.entry';
        return `${fn}(${sub(e.obj)}, ${sub(e.key)}${e.dflt ? `, ${sub(e.dflt)}` : ''})`;
      }
      case 'conv': {
        const fn = { list: 'T.pyList', number: 'T.toNumber', whole: 'T.toWhole', money: 'T.toMoney', text: 'T.show', bool: 'T.toYesNo', date: 'T.toDate' }[e.to];
        return fn ? `${fn}(${sub(e.e)})` : sub(e.e);
      }
      case 'where': {
        const v = this.fresh('item');
        return `T.filter(T.pyIter(${sub(e.list)}), (Object ${v}) -> T.truthy(${this.x(e.cond, { ...ctx, item: v })}))`;
      }
      case 'from': {
        const inner = e.list.k === 'where' ? e.list : null;
        const v = this.fresh('item'), w = this.fresh('item');
        const list = `T.pyIter(${sub(inner ? inner.list : e.list)})`;
        const filtered = inner ? `T.filter(${list}, (Object ${w}) -> T.truthy(${this.x(inner.cond, { ...ctx, item: w })}))` : list;
        return `T.map(${filtered}, (Object ${v}) -> ${this.fieldGet(v, e.field)})`;
      }
      case 'sorted': {
        const v = this.fresh('item');
        if (e.mapSort) return `T.pySort(T.mapItems(${sub(e.list)}), T.keyAt(F, (Object ${v}) -> T.pairPart(${v}, ${e.by === 'key' ? 0 : 1})), ${!!e.desc})`;
        return `T.pySort(T.pyList(${sub(e.list)}), T.keyAt(F, (Object ${v}) -> ${this.fieldGet(v, e.field)}), ${!!e.desc})`;
      }
      case 'op': return `T.applyOp(${javaString(e.op)}, ${sub(e.arg)})`;
      case 'round': return `T.roundTo(${sub(e.e)}${e.places ? `, ${sub(e.places)}` : ''})`;
      case 'readFile': return `T.readText(${sub(e.path)})`;
      case 'neg': return `T.neg(${sub(e.e)})`;
      case 'not': return `!${this.yn(e.e, ctx)}`;
      case 'bin': {
        if (e.op === 'and') return `(${this.yn(e.l, ctx)} && ${this.yn(e.r, ctx)})`;
        if (e.op === 'or') return `(${this.yn(e.l, ctx)} || ${this.yn(e.r, ctx)})`;
        const fn = { '+': 'T.add', '-': 'T.sub', '*': 'T.mul', '/': 'T.divide' }[e.op]
          ?? (e.op === 'mod' ? (e.l.type?.k === 'whole' && e.r.type?.k === 'whole' ? 'T.intMod' : 'T.modulo') : null);
        return fn ? `${fn}(${sub(e.l)}, ${sub(e.r)})` : 'null';
      }
      case 'cmp': {
        if (e.r.k === 'bool' && (e.op === '==' || e.op === '!=')) return `(${this.yn(e.l, ctx)} ${e.op} ${sub(e.r)})`;
        return `T.compare(${javaString(e.op)}, ${sub(e.l)}, ${sub(e.r)})`;
      }
      case 'between': return `T.between(${sub(e.lo)}, ${sub(e.e)}, () -> ${sub(e.hi)})`;
      case 'contains': return `T.isIn(${sub(e.r)}, ${sub(e.l)})`;
      case 'affix': return `T.affix(${sub(e.l)}, ${sub(e.r)}, ${!!e.end})`;
      case 'sortedValues': return `T.pySort(T.pyList(${sub(e.list)}), null, ${!!e.desc})`;
      case 'joined': return `T.joined(${sub(e.list)}, ${sub(e.sep)})`;
      case 'splitAt': return `T.splitAt(${sub(e.text)}, ${sub(e.sep)})`;
      case 'replacing': return `T.replacing(${sub(e.text)}, ${sub(e.from)}, ${sub(e.to)})`;
      case 'adj': {
        if (e.adj === 'empty') return `T.eq(T.pyLen(${sub(e.e)}), BigInteger.ZERO)`;
        return `T.compare(${javaString({ positive: '>', negative: '<', zero: '==' }[e.adj])}, ${sub(e.e)}, BigInteger.ZERO)`;
      }
      case 'isNothing': return `(${sub(e.e)} ${e.neg ? '!=' : '=='} null)`;
      default: return `null /* not generated: ${e.k} */`;
    }
  }

  /** Text with {holes}: text and whole numbers as they are, anything else shown the Thunder way. */
  str(e, ctx) {
    const parts = e.parts.filter((p) => p !== '').map((p) => {
      if (typeof p === 'string') return javaString(p);
      const t = p.e.type?.k;
      return t === 'text' || t === 'whole' ? `T.pyStr(${this.x(p.e, ctx)})` : `T.show(${this.x(p.e, ctx)})`;
    });
    if (!parts.length) return '""';
    if (parts.length === 1) return parts[0];
    return `(${parts.join(' + ')})`;
  }
}

/** A module's runner for its project's tests: RunTests.java. */
export function javaTestRunner(results, pkg = 'app') {
  return [
    '// Generated by the Thunder compiler: runs every Test block in this project.',
    `package ${pkg};`,
    '',
    'import thunder.T;',
    '',
    'public final class RunTests {',
    '    public static void main(String[] args) {',
    `        T.runTests(new Object[][] { ${results.map((r) => `{ ${javaString(r.file)}, ${javaClassName(r.module)}.THUNDER_TESTS }`).join(', ')} });`,
    '    }',
    '}',
    '',
  ].join('\n');
}
