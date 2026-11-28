// Thunder Core -> TypeScript (ES modules; only erasable syntax, so Node can strip the types and run it).
//
// The same checked program the Python target and the Thunder engine use (compileCore -> program + info), and the
// same meaning: every statement does what the Thunder engine does for it (engine.mjs), and every operation calls
// thunder_runtime.mjs, which is the engine's own value code (runtime-typescript.mjs). compiler/test/core-engines.mjs
// runs every Core test program on Python, the Thunder engine, and compiled TypeScript, and requires the same output.
//
// Every generated statement sets the frame's line (F.line = N) and ends with `// thunder:N`, the Thunder line it came
// from, so an error says which Thunder line failed, exactly as the other two do.

import { percentDecimal } from './target-python.mjs';

/** The Thunder line of the first generated line of a function, or null when that line carries no mark. */
export function firstLine(f) {
  if (f.params.some((p) => p.dflt?.k === 'name')) return null;
  const ruled = f.params.find((p) => p.rules?.length);
  if (ruled) return ruled.line;
  const s = f.body[0];
  if (!s) return null;
  return s.k === 'if' ? s.branches[0].line : s.line;
}

const js = (s) => JSON.stringify(s); // a valid JS string literal for any text

const RESERVED = new Set(('break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await arguments eval undefined NaN Infinity T F FILE main props').split(' '));
/** A JavaScript name for a Thunder (Python) name: the same, unless JavaScript or the generated code owns it. */
export const id = (py) => (RESERVED.has(py) ? `${py}_` : py);

/** The TypeScript type of a value whose Thunder kind is known (others are checked when the program runs). */
const tsType = (t) => {
  if (!t) return 'any';
  if (t.k === 'whole') return 'bigint';
  if (t.k === 'text') return 'string';
  if (t.k === 'bool') return 'boolean';
  if (t.k === 'optional') { const inner = tsType(t.of); return inner === 'any' ? 'any' : `${inner} | null`; }
  return 'any';
};

const KNOWN_BOOL = new Set(['cmp', 'contains', 'between', 'adj', 'isNothing', 'not', 'bool']);

/**
 * Compile one checked file. `imports`: [{ module, names }] for a test file (the project's src modules it sees).
 * Gives back the text of <module>.ts.
 */
export function toTypeScript(program, info, { source = 'main.thunder', imports = [] } = {}) {
  return new Gen(program, info, source).module(imports);
}

/** Thunder modules a program uses that only Python has (Use): compiled TypeScript cannot call them. */
export function pythonOnlyUses(info) {
  return (info.modules ?? []).filter((m) => !info.imported?.has(m) && (m.ecosystem ?? 'python') === 'python').map((m) => ({ module: m.module, line: m.line }));
}

/** npm packages a program uses (Use "<package>" from npm): only compiled TypeScript can call them. */
export function npmUses(info) {
  return (info.modules ?? []).filter((m) => !info.imported?.has(m) && m.ecosystem === 'npm').map((m) => ({ module: m.module, line: m.line }));
}

/** TC408 for every npm package a file uses, when it is compiled for `target` (anything but TypeScript). */
export function npmRefusals(info, targetName, diag) {
  return npmUses(info).map((u) => diag('TC408', u.line,
    `"${u.module}" is an npm package, and this program is compiled to ${targetName}, which cannot use it.`,
    'Build for TypeScript to use npm packages: --target typescript, or target = "typescript" under [build] in thunder.toml. Thunder never swaps in a different library.'));
}

/** .NET types a program uses (Use "<type>" from .NET or NuGet): only compiled C# can call them. */
export function dotnetUses(info) {
  return (info.modules ?? []).filter((m) => !info.imported?.has(m) && (m.ecosystem === 'dotnet' || m.ecosystem === 'nuget')).map((m) => ({ module: m.module, line: m.line, ecosystem: m.ecosystem }));
}

/** TC409 for every .NET type a file uses, when it is compiled for `target` (anything but C#). */
export function dotnetRefusals(info, targetName, diag) {
  return dotnetUses(info).map((u) => diag('TC409', u.line,
    `"${u.module}" is ${u.ecosystem === 'nuget' ? 'from a NuGet package' : 'a .NET type'}, and this program is compiled to ${targetName}, which cannot use it.`,
    'Build for C# to use .NET libraries: --target csharp, or target = "csharp" under [build] in thunder.toml. Thunder never swaps in a different library.'));
}

/** TC411 for endpoints and calls to other services: HTTP runs on Python, TypeScript, and the Thunder engine for now. */
export function httpRefusals(info, targetName, diag) {
  const own = (s) => !info.imported?.has(s);
  const out = (info.endpoints ?? []).filter(own).map((f) => diag('TC411', f.line,
    `"${f.text}" is an endpoint, and HTTP works only on Python, TypeScript, and the Thunder engine for now, not on ${targetName}.`,
    'Run it with Python (the default target), --target typescript, or --engine thunder.'));
  if (info.usesHttp && !out.length) out.push(diag('TC411', 1, `This program calls another service ("the answer from …"), and HTTP works only on Python, TypeScript, and the Thunder engine for now, not on ${targetName}.`,
    'Run it with Python (the default target), --target typescript, or --engine thunder.'));
  return out;
}

/** TC410 for every stored list (Store … as a list of …) when compiling for `target`: saved data runs on Python, TypeScript, Go, and the Thunder engine for now. */
export function storeRefusals(info, targetName, diag) {
  return (info.stores ?? []).filter((s) => !info.imported?.has(s)).map((s) => diag('TC410', s.line,
    `"${s.text}" is a stored list, and saved data works only on Python, TypeScript, Go, and the Thunder engine for now, not on ${targetName}.`,
    'Run it with Python (the default target), --target typescript, --target go, or --engine thunder. Thunder never swaps in a different way of saving.'));
}

/** The name of an npm package's namespace import (import * as <it> from "<package>"). */
const npmNs = (m) => `$npm_${m.py}`;

export class Gen {
  constructor(program, info, source) {
    this.p = program; this.info = info; this.source = source;
    this.out = []; this.ind = 0; this.tmp = 0;
  }
  emit(text, line) { this.out.push(`${'  '.repeat(this.ind)}${text}${line ? `  // thunder:${line}` : ''}`); }
  blank() { if (this.out.length && this.out[this.out.length - 1] !== '') this.out.push(''); }
  fresh(base) { return `$${base}${++this.tmp}`; }

  module(imports) {
    const own = (s) => !this.info.imported?.has(s);
    const npm = (this.info.modules ?? []).filter((m) => own(m) && m.ecosystem === 'npm');
    const head = [
      `// Generated by the Thunder compiler from ${this.source}.`,
      `// A build artifact: change ${this.source.split('/').pop()} and build again, or keep this file and edit it as TypeScript.`,
      '// It needs only Node.js and thunder_runtime.mjs (written next to it). "// thunder:N" marks the Thunder line.',
      '',
      "import * as T from './thunder_runtime.mjs';",
      ...imports.filter((m) => m.names.length).map((m) => `import { ${m.names.map(id).join(', ')} } from './${m.module}.ts';`),
      ...npm.map((m) => `import * as ${npmNs(m)} from ${js(m.module)};  // thunder:${m.line}`),
      '',
      `const FILE = ${js(this.source)};`,
      ...npm.map((m) => `export const ${id(m.py)}: any = T.library(${npmNs(m)}, ${js(m.module)});  // thunder:${m.line}`),
    ];
    for (const r of this.info.records.filter(own)) { this.blank(); this.record(r); }
    for (const f of this.info.funcs.filter(own)) { this.blank(); this.func(f); }
    const consts = this.info.consts.filter(own);
    if (consts.length) {
      this.blank();
      for (const k of consts) this.emit(`export let ${id(k.py)}: any;`, k.line);
      this.emit('T.init(FILE, (F: any) => {');
      this.ind++;
      for (const k of consts) this.emit(`F.line = ${k.line}; ${id(k.py)} = ${this.x(k.e)};`, k.line);
      this.ind--;
      this.emit('});');
    }
    // Stored lists: filled from data/<name>.json when the program runs, saved when it finishes well (runtime run()).
    const stores = (this.info.stores ?? []).filter(own);
    if (stores.length) {
      this.blank();
      const kind = (t) => (t.k === 'optional' ? `{ k: 'optional', of: ${kind(t.of)} }` : `{ k: ${js(t.k)} }`);
      for (const s of stores) this.emit(`export const ${id(s.py)}: any = T.newStore(FILE, ${s.line}, ${js(s.py.toLowerCase())}, ${id(s.record.py)}, [${s.record.fields.map((f) => `{ py: ${js(f.py)}, type: ${kind(f.type)} }`).join(', ')}]);`, s.line);
    }
    const tests = this.info.tests;
    for (const t of tests) {
      this.blank();
      this.emit(`function ${id(t.py)}(): void {`, t.line);
      this.ind++;
      this.frameBody(`T.enterFrame(FILE, ${t.line})`, t.body, [], true);
      this.ind--;
      this.emit('}');
    }
    this.blank();
    this.emit('export const THUNDER_TESTS: [string, () => void, number][] = [');
    for (const t of tests) this.emit(`  [${js(t.title)}, ${id(t.py)}, ${t.line}],`);
    this.emit('];');
    // Endpoints (When someone calls …): the routes the server answers, each with its inputs and where they come from.
    const endpoints = (this.info.endpoints ?? []).filter(own);
    const tyOf = (t) => (t.k === 'optional' ? `{ k: 'optional', of: ${tyOf(t.of)} }` : `{ k: ${js(t.k)} }`);
    if (endpoints.length) {
      this.blank();
      this.emit('export const THUNDER_ROUTES: any[] = [');
      for (const f of endpoints) {
        const fromPath = new Set(f.endpoint.segments.filter((g) => g.param).map((g) => g.param));
        const ins = f.params.map((p) => `{ text: ${js(p.text)}, type: ${tyOf(p.type)}, path: ${fromPath.has(p.name)}, dflt: ${!!p.dflt} }`);
        this.emit(`  { method: ${js(f.endpoint.method)}, path: ${js(f.endpoint.path)}, handler: ${id(f.py)}, inputs: [${ins.join(', ')}] },`, f.line);
      }
      this.emit('];');
    }
    const main = this.p.main ?? [];
    if (main.length || endpoints.length) {
      this.blank();
      this.emit('export function main(): void {');
      this.ind++;
      if (main.length) this.frameBody('T.enterFrame(FILE, 0)', main, [], true);
      this.ind--;
      this.emit('}');
      this.blank();
      this.emit(`if (T.isEntry(import.meta.url)) T.run(main${endpoints.length ? ', THUNDER_ROUTES' : ''});`);
    }
    return `${head.join('\n')}\n${this.out.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
  }

  record(r) {
    const fields = r.fields.map((f) => `{ py: ${js(f.py)}, type: { k: ${js(f.type?.k ?? 'any')} } }`).join(', ');
    const rules = r.rulesToCheck ?? [];
    if (!rules.length) { this.emit(`export const ${id(r.py)} = T.recordKind(${js(r.py)}, [${fields}]);`, r.line); return; }
    this.emit(`export const ${id(r.py)} = T.recordKind(${js(r.py)}, [${fields}], {`, r.line);
    this.ind++;
    const bySubject = new Map();
    for (const rule of rules) { const f = r.fieldMap.get(rule.subject); (bySubject.get(f.py) ?? bySubject.set(f.py, []).get(f.py)).push(rule); }
    for (const [field, rs] of bySubject) {
      this.emit(`${js(field)}: [`);
      this.ind++;
      for (const rule of rs) this.emit(`{ cond: (value: any) => { const F = T.topFrame(); return ${this.x(rule.rule.cond, { subject: 'value' })}; }, text: ${js(rule.text)}, line: ${rule.line} },`, rule.line);
      this.ind--;
      this.emit('],');
    }
    this.ind--;
    this.emit('});');
  }

  func(f) {
    const params = f.params.map((p) => {
      const name = id(p.py);
      if (!p.dflt) return `${name}: ${tsType(p.type)}`;
      return `${name}: any = ${p.dflt.k === 'name' ? 'T.NOT_GIVEN' : this.x(p.dflt)}`;
    });
    this.emit(`export function ${id(f.py)}(${params.join(', ')}): any {`, f.line);
    this.ind++;
    const pre = [];
    for (const p of f.params) if (p.dflt?.k === 'name') pre.push([`if (${id(p.py)} === T.NOT_GIVEN) { F.line = ${p.line}; ${id(p.py)} = ${this.x(p.dflt)}; }`, p.line]);
    for (const p of f.params) for (const rule of p.rules ?? []) pre.push([`F.line = ${p.line}; T.never(${this.x(rule.rule.cond, { subject: id(p.py) })}, ${js(rule.text)}, ${rule.line}, ${id(p.py)});`, p.line]);
    const first = firstLine(f);
    this.frameBody(`T.enterCall(FILE, ${f.line}, ${first ?? 'null'})`, f.body, pre, false, f.params.map((p) => p.py));
    this.ind--;
    this.emit('}');
  }

  /** A body that runs in its own frame: errors leave with the Thunder line they happened on. */
  frameBody(enter, body, pre, isVoid, params = []) {
    this.emit(`const F = ${enter};`);
    this.emit('try {');
    this.ind++;
    const locals = [...this.localsOf(body)].filter((n) => !params.includes(n));
    if (locals.length) this.emit(`let ${locals.map((n) => `${id(n)}: any`).join(', ')};`);
    for (const [code, line] of pre) this.emit(code, line);
    this.block(body, isVoid);
    if (!isVoid) this.emit('return null;');
    this.ind--;
    this.emit('} catch (e) { throw T.fail(e); } finally { T.leave(); }');
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
    const globals = new Set([...this.info.consts, ...(this.info.stores ?? []), ...this.info.funcs, ...this.info.records].map((x) => x.py));
    return [...names].filter((n) => !globals.has(n));
  }

  block(body, isVoid) { for (const s of body) this.stmt(s, isVoid); }

  /** F.line = N; <code>  // thunder:N */
  line(L, code) { this.emit(`F.line = ${L}; ${code}`, L); }

  /** Check a watched name's Never rules on its new value (in `v`), then store it. */
  assign(s, name, valueCode) {
    if (!s.rules?.length) { this.line(s.line, `${id(name)} = ${valueCode};`); return; }
    const v = this.fresh('new');
    this.line(s.line, `{ const ${v} = ${valueCode};`);
    this.ind++;
    for (const rule of s.rules) this.emit(`T.never(${this.x(rule.rule.cond, { subject: v })}, ${js(rule.text)}, ${rule.line}, ${v});`, s.line);
    this.emit(`${id(name)} = ${v}; }`, s.line);
    this.ind--;
  }
  rulesAfter(s, name) {
    for (const rule of s.rules ?? []) this.emit(`T.never(${this.x(rule.rule.cond, { subject: id(name) })}, ${js(rule.text)}, ${rule.line}, ${id(name)});`, s.line);
  }

  /** Code that stores `v` (a name of generated code) into a name, a field, or an entry. */
  storeCode(t, v) {
    if (t.k === 'name') return `${id(t.ref?.py ?? 'unknown')} = ${v};`;
    if (t.k === 'field') return t.static ? `T.setAttr(${this.x(t.obj)}, ${js(t.py)}, ${v});` : `T.setField(${this.x(t.obj)}, ${js(t.text)}, ${v});`;
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
        this.line(L, `{ const ${v} = ${this.x(s.e)}; ${this.storeCode(t, v)} }`);
        return;
      }
      case 'give':
        if (s.status != null) this.line(L, `T.answerStatus(${s.status});`);
        this.line(L, isVoid ? 'return;' : `return ${s.e.k === 'nothing' ? 'null' : this.x(s.e)};`); return;
      case 'stop': {
        const v = this.x(s.e);
        const msg = s.e.type?.k === 'text' ? `T.pyStr(${v})` : `T.show(${v})`;
        this.line(L, s.status != null ? `throw T.stopWith(${msg}, ${s.status});` : `throw T.Stop(${msg});`); return;
      }
      case 'if': {
        this.emit(`F.line = ${L};`, L);
        s.branches.forEach((b, k) => {
          this.emit(`${k === 0 ? 'if' : '} else if'} ((F.line = ${b.line}, ${this.yn(b.cond)})) {`, b.line);
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
        this.line(L, `for (const ${el} of ${seq}) {`);
        this.ind++;
        this.emit(b ? `F.line = ${L}; [${id(a.py)}, ${id(b.py)}] = T.unpack2(${el});` : `F.line = ${L}; ${id(a.py)} = ${el};`, L);
        this.block(s.body, isVoid);
        this.ind--;
        this.emit('}');
        return;
      }
      case 'range': {
        const lo = this.fresh('from'), hi = this.fresh('to'), n = this.fresh('n');
        const to = s.to.k === 'num' && s.to.whole ? `${BigInt(s.to.text.replace(/_/g, '')) + 1n}n` : `T.add(${this.x(s.to)}, 1n)`;
        const a = this.fresh('a'), b = this.fresh('b');
        this.line(L, `{ const ${a} = ${this.x(s.from)}, ${b} = ${to}, ${lo} = T.rangeInt(${a}), ${hi} = T.rangeInt(${b});`);
        this.ind++;
        this.emit(`for (let ${n} = ${lo}; ${n} < ${hi}; ${n}++) {`);
        this.ind++;
        this.emit(`F.line = ${L}; ${id(s.v.py)} = ${n};`, L);
        this.block(s.body, isVoid);
        this.ind--;
        this.emit('}');
        this.ind--;
        this.emit('}');
        return;
      }
      case 'while':
        this.emit(`while ((F.line = ${L}, ${s.until ? `!(${this.yn(s.cond)})` : this.yn(s.cond)})) {`, L);
        this.ind++; this.block(s.body, isVoid); this.ind--;
        this.emit('}');
        return;
      case 'times': {
        const count = this.fresh('count'), k = this.fresh('k');
        this.line(L, `{ const ${count} = T.rangeInt(${this.x(s.count)});`);
        this.ind++;
        this.emit(`for (let ${k} = 0n; ${k} < ${count}; ${k}++) {`);
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
        if (s.target.k === 'name') { const py = s.target.ref?.py ?? 'unknown'; this.assign(s, py, `${op}(${id(py)}, ${this.x(s.e)})`); return; }
        const v = this.fresh('v');
        this.line(L, `{ const ${v} = ${op}(${this.x(s.target)}, ${this.x(s.e)}); ${this.storeCode(s.target, v)} }`);
        return;
      }
      case 'sort': {
        const key = s.field ? `T.keyAt(F, (item: any) => ${this.fieldGet('item', s.field)})` : 'null';
        this.line(L, `T.sortInPlace(${this.x(s.target)}, ${key}, ${!!s.desc});`);
        return;
      }
      case 'reverse': this.line(L, `T.reverseInPlace(${this.x(s.target)});`); return;
      case 'do': this.line(L, `${this.x(s.e)};`); return;
      case 'tryFail': {
        this.emit('try {', L);
        this.ind++; this.stmt(s.stmt, isVoid); this.ind--;
        const e = this.fresh('failure');
        this.emit(`} catch (${e}) {`, L);
        this.ind++;
        this.line(L, `${id(s.errPy)} = T.explain(T.asPyErr(${e}));`);
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
    const head = `const ${v} = ${this.x(s.e)}, ${t} = ${this.x(s.target)};`;
    let body;
    if (s.targetKind === 'list') body = s.k === 'add' ? `T.appendTo(${t}, ${v});` : `T.removeFrom(${t}, ${v});`;
    else if (s.targetKind === 'map') body = `T.removeFrom(${t}, ${v});`;
    else if (s.targetKind === 'number') {
      const nv = `${s.k === 'add' ? 'T.add' : 'T.sub'}(${t}, ${v})`;
      if (isName && s.rules?.length) {
        const n = this.fresh('new');
        this.line(L, `{ ${head} const ${n} = ${nv};`);
        this.ind++;
        for (const rule of s.rules) this.emit(`T.never(${this.x(rule.rule.cond, { subject: n })}, ${js(rule.text)}, ${rule.line}, ${n});`, L);
        this.emit(`${id(py)} = ${n}; }`, L);
        this.ind--;
        this.rulesAfter(s, py);
        return;
      }
      body = isName ? `${id(py)} = ${nv};` : this.storeCode(s.target, nv);
    } else if (s.k === 'add') body = isName ? `${id(py)} = T.addTo(${t}, ${v});` : this.storeCode(s.target, `T.addTo(${t}, ${v})`);
    else body = `T.removeFrom(${t}, ${v});`;
    this.line(L, `{ ${head} ${body} }`);
    if (isName) this.rulesAfter(s, py);
  }

  expect(s) {
    const L = s.line;
    const text = js((s.raw ?? 'Expect').trim());
    if (s.mode === 'true') { this.line(L, `T.expectTrue(${this.x(s.e)}, ${text});`); return; }
    if (s.mode === 'fail') {
      const m = this.fresh('msg');
      this.line(L, `{ const ${m} = ${s.msg ? this.x(s.msg) : 'null'}; T.expectFailure(() => { ${this.x(s.e)}; }, ${text}, ${m}); }`);
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
    else if (c.k === 'between') { op = 'between'; want = `[${this.x(c.lo)}, ${this.x(c.hi)}]`; }
    else if (c.k === 'contains') { op = 'in'; want = this.x(c.l); }
    else op = 'is';
    this.line(L, `T.expectValue(${this.x(s.e)}, ${js(negate ? `not ${op}` : op)}, ${js(op)}, ${want}, ${text});`);
  }

  fieldGet(v, field) { return field.dynamic ? `T.getField(${v}, ${js(field.key)})` : `T.getAttr(${v}, ${js(field.py)})`; }

  /** A value used as yes/no: checked when the program runs unless it is known to be yes/no. */
  yn(e, ctx = {}) {
    const c = this.x(e, ctx);
    const known = e.type?.k === 'bool' || KNOWN_BOOL.has(e.k) || (e.k === 'bin' && (e.op === 'and' || e.op === 'or'));
    return known ? c : `T.yesNo(${c})`;
  }

  x(e, ctx = {}) {
    const sub = (k) => this.x(k, ctx);
    switch (e.k) {
      case 'num': return e.whole ? `${BigInt(e.text.replace(/_/g, ''))}n` : `T.dec(${js(e.text)})`;
      case 'money': return `T.money(${js(e.text)})`;
      case 'percent': return `T.dec(${js(percentDecimal(e.text))})`;
      case 'bool': return e.v ? 'true' : 'false';
      case 'nothing': case 'hole': return 'null';
      case 'paren': return sub(e.e);
      // the answer from GET "…" [with …] [as Rate]: read as text, or as records of a kind (kinds as in stored lists).
      case 'httpCall': {
        const tyOf = (t) => (t.k === 'optional' ? `{ k: 'optional', of: ${tyOf(t.of)} }` : `{ k: ${js(t.k)} }`);
        const as = e.record ? `{ cls: ${id(e.record.py)}, fields: [${e.record.fields.map((f) => `{ py: ${js(f.py)}, type: ${tyOf(f.type)} }`).join(', ')}], many: ${e.as.k === 'list'} }` : 'null';
        return `T.httpCall(${js(e.method)}, ${sub(e.url)}, ${e.body ? sub(e.body) : 'null'}, ${as})`;
      }
      case 'today': return 'T.today()';
      case 'date': return `T.date(${js(e.text)})`;
      case 'str': return this.str(e, ctx);
      case 'list': return e.items ? `[${e.items.map(sub).join(', ')}]` : 'T.newMap()';
      case 'map': return 'T.newMap()';
      case 'name': {
        const r = e.ref ?? {};
        if (r.kind === 'subject') return ctx.subject ?? 'null';
        if (r.kind === 'elemField') return `T.getAttr(${ctx.item}, ${js(r.py)})`;
        if (r.kind === 'elemKey') return `T.getField(${ctx.item}, ${js(r.key)})`;
        if (r.kind === 'elem') return ctx.item;
        return id(r.py ?? e.name.replace(/ /g, '_'));
      }
      case 'call': return `${id(e.py)}(${e.args.map(sub).join(', ')})`;
      // <library>.<name>(…): a call into an npm package, through the runtime's boundary (runtime-npm.mjs).
      case 'dot': return e.args ? `T.callLibrary(${sub(e.obj)}, ${js(e.attr)}, [${e.args.map(sub).join(', ')}])` : `T.getLibrary(${sub(e.obj)}, ${js(e.attr)})`;
      case 'new': return `T.newRecord(${id(e.py)}, [${e.fields.map((f) => `[${js(f.py)}, ${sub(f.e)}]`).join(', ')}])`;
      case 'field': return e.static ? `T.getAttr(${sub(e.obj)}, ${js(e.py)})` : `T.getField(${sub(e.obj)}, ${js(e.text)})`;
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
        return `T.pyIter(${sub(e.list)}).filter((${v}: any) => T.truthy(${this.x(e.cond, { ...ctx, item: v })}))`;
      }
      case 'from': {
        const inner = e.list.k === 'where' ? e.list : null;
        const v = this.fresh('item');
        const list = `T.pyIter(${sub(inner ? inner.list : e.list)})`;
        const filtered = inner ? `${list}.filter((${v}: any) => T.truthy(${this.x(inner.cond, { ...ctx, item: v })}))` : list;
        return `${filtered}.map((${v}: any) => ${this.fieldGet(v, e.field)})`;
      }
      case 'sorted': {
        if (e.mapSort) return `T.pySort(T.mapItems(${sub(e.list)}), T.keyAt(F, (entry: any) => entry.items[${e.by === 'key' ? 0 : 1}]), ${!!e.desc})`;
        return `T.pySort(T.pyList(${sub(e.list)}), T.keyAt(F, (item: any) => ${this.fieldGet('item', e.field)}), ${!!e.desc})`;
      }
      case 'op': return `T.applyOp(${js(e.op)}, ${sub(e.arg)})`;
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
        if (e.r.k === 'bool' && (e.op === '==' || e.op === '!=')) return `(${this.yn(e.l, ctx)} ${e.op === '==' ? '===' : '!=='} ${sub(e.r)})`;
        return `T.compare(${js(e.op)}, ${sub(e.l)}, ${sub(e.r)})`;
      }
      case 'between': return `T.between(${sub(e.lo)}, ${sub(e.e)}, () => ${sub(e.hi)})`;
      case 'contains': return `T.isIn(${sub(e.r)}, ${sub(e.l)})`;
      case 'affix': return `T.affix(${sub(e.l)}, ${sub(e.r)}, ${!!e.end})`;
      case 'sortedValues': return `T.pySort(T.pyList(${sub(e.list)}), null, ${!!e.desc})`;
      case 'joined': return `T.joined(${sub(e.list)}, ${sub(e.sep)})`;
      case 'splitAt': return `T.splitAt(${sub(e.text)}, ${sub(e.sep)})`;
      case 'replacing': return `T.replacing(${sub(e.text)}, ${sub(e.from)}, ${sub(e.to)})`;
      case 'adj': {
        if (e.adj === 'empty') return `T.eq(T.pyLen(${sub(e.e)}), 0n)`;
        return `T.compare(${js({ positive: '>', negative: '<', zero: '==' }[e.adj])}, ${sub(e.e)}, 0n)`;
      }
      case 'isNothing': return `(${sub(e.e)} ${e.neg ? '!==' : '==='} null)`;
      default: return `null /* not generated: ${e.k} */`;
    }
  }

  /** Text with {holes}: text and whole numbers as they are, anything else shown the Thunder way. */
  str(e, ctx) {
    const parts = e.parts.filter((p) => p !== '').map((p) => {
      if (typeof p === 'string') return js(p);
      const t = p.e.type?.k;
      return t === 'text' || t === 'whole' ? `T.pyStr(${this.x(p.e, ctx)})` : `T.show(${this.x(p.e, ctx)})`;
    });
    if (!parts.length) return '""';
    return parts.length === 1 ? parts[0] : `(${parts.join(' + ')})`;
  }
}
