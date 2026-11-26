// The Thunder engine's core: runs Thunder Core directly, with no Python and no Node APIs, so it also runs in a
// browser (the tutorial runs each lesson's program with it). engine.mjs adds the Node parts: reading files from
// disk and a worker thread with a deep stack. (thunder run --engine thunder)
//
// It runs the SAME checked program the Python target compiles (compileCore -> program + info), so there is one
// meaning of Thunder, not two. Its behavior is the Python target's behavior: every statement does what the line
// target-python.mjs writes for it does, and every helper does what thunder_runtime.py does (engine-values.mjs).
// compiler/test/core-engine.test.mjs runs every Core test program on both engines and compares the output,
// errors included. A difference is a bug in one of them.
//
// A program that uses a Python module ("Use csv as csv") is not run here: Thunder never imitates a library.

import {
  Dec, Money, PyDate, PyDict, RecordVal, Tuple, NOT_GIVEN, ThunderErr, PyErr, TypeErr,
  Stop, RuleBroken, ExpectationFailed, KindMismatch, ConversionFailed, MissingValue,
  explain, codeOf, asPyErr, describe, show, pyStr, truthy, yesNo, toDec,
  pyLen, pyIter, pyList, add, sub, mul, neg, intMod, divide, modulo, roundTo, eq, compare, contains, pySort,
  attrErr, strMethod, splitLines, pySplit, pyStrip, jsonParse, jsonText, isInt, isNumber,
} from './engine-values.mjs';
import * as V from './engine-values.mjs';
import { shownText, copyValue, typedNumber, problemText } from './screen-values.mjs';
import { percentDecimal } from './target-python.mjs';
import { firstLine } from './target-typescript.mjs';

export const ENGINES = ['python', 'thunder'];

/** Thrown by Give: carries the value back to the call. */
class Return { constructor(v) { this.v = v; } }

/** JavaScript ran out of stack before Thunder's own limit: the run is retried on a thread with a deeper stack. */
// Kept cheap on purpose: near the limit even a regular expression can run out of stack. A false alarm only means the
// run is repeated on the deep-stack thread, so any RangeError (or a regular expression's "Stack overflow") counts.
const nativeOverflow = (e) => { try { return e instanceof RangeError || (e instanceof SyntaxError && e.message.endsWith('Stack overflow')); } catch { return true; } };
class NeedsDeeperStack extends Error {}

const MAX_FRAMES = V.MAX_FRAMES;
const CONTAINER_KINDS = new Set(['if', 'each', 'range', 'times', 'while', 'tryFail']); // statements with steps inside
const MAX_RECORDED = 20000; // a recording stops growing here (and says so); the program still runs to the end

/** The Python modules a program uses (Use), which this engine does not run. */
export function pythonModulesUsed(results) {
  const out = [];
  for (const r of results) for (const m of r.info.modules) if (!r.info.imported?.has(m)) out.push({ file: r.file, module: m.module, name: m.text ?? m.name, line: m.line });
  return out;
}

/** The message for a program the engine will not run. */
export function refusalText(uses) {
  const u = uses[0];
  const more = uses.length > 1 ? ` (and ${uses.length - 1} more)` : '';
  return `This program uses the Python module "${u.module}" (${u.file}, line ${u.line})${more}. The Thunder engine runs Thunder only and never imitates a library, so run it with Python: leave out --engine thunder.`;
}

class Module {
  constructor(result) { this.r = result; this.file = result.file; this.globals = new Map(); }
}

class Engine {
  // readText(path, cwd): the text of a file the program reads, or throws with .code 'ENOENT' / 'EISDIR'. Without it
  // (a browser), reading a file is reported as a missing file.
  // record: keep a step-by-step recording of the run (the Thunder Time Machine; see recordedRun below).
  constructor({ cwd = '.', deeper = false, readText = null, record = false } = {}) {
    this.cwd = cwd;
    this.rec = record ? { steps: [], truncated: false } : null;
    this.readText = readText;
    // deeper: if JavaScript's own stack runs out, stop and say so (NeedsDeeperStack) instead of reporting it as the
    // program's error, so the caller can run it again where the stack is deep enough.
    this.deeper = deeper;
    this.frames = [];
    this.out = [];
  }

  // ── loading ─────────────────────────────────────────────────────────────────────────────────────────────────
  load(result, imports = []) {
    const mod = new Module(result);
    const own = (s) => !result.info.imported?.has(s);
    // from <src module> import *: everything the src module defines (functions, records, kept values).
    for (const m of imports) for (const [k, v] of m.globals) mod.globals.set(k, v);
    for (const r of result.info.records.filter(own)) mod.globals.set(r.py, this.recordClass(r, mod));
    for (const f of result.info.funcs.filter(own)) mod.globals.set(f.py, { isFunc: true, f, mod });
    const consts = result.info.consts.filter(own);
    if (consts.length) {
      const frame = { file: mod.file, line: 0 };
      this.withFrame(frame, () => {
        const env = { mod, locals: mod.globals, frame };
        for (const k of consts) { frame.line = k.line; mod.globals.set(k.py, this.x(k.e, env)); }
      });
    }
    return mod;
  }

  recordClass(r, mod) {
    const rules = new Map();
    for (const rule of r.rulesToCheck ?? []) { const f = r.fieldMap.get(rule.subject); (rules.get(f.py) ?? rules.set(f.py, []).get(f.py)).push(rule); }
    return { isRecord: true, py: r.py, fields: r.fields.map((f) => ({ py: f.py, type: f.type })), rules, mod };
  }

  // ── frames, lines, errors ───────────────────────────────────────────────────────────────────────────────────
  withFrame(frame, fn) {
    if (this.frames.length >= MAX_FRAMES) throw new PyErr('RecursionError', 'maximum recursion depth exceeded');
    this.frames.push(frame);
    try { return fn(); }
    catch (e) {
      if (e instanceof Return || e instanceof NeedsDeeperStack) throw e;
      if (this.deeper && nativeOverflow(e)) throw new NeedsDeeperStack();
      const err = asPyErr(e);
      if (!err.where) err.where = this.frames.map((f) => ({ file: f.file, line: f.line }));
      throw err;
    } finally { this.frames.pop(); }
  }

  describeError(e) { return V.describeError(e); }

  // ── calls ───────────────────────────────────────────────────────────────────────────────────────────────────
  call(fn, args) {
    if (!fn?.isFunc) throw TypeErr(`'${fn === null ? 'NoneType' : typeof fn}' object is not callable`);
    const { f, mod } = fn;
    const frame = { file: mod.file, line: f.line, fn: f.name ?? f.py };
    if (this.frames.length >= MAX_FRAMES) {
      // Python makes the new call's frame, then stops at its first line (a line with no Thunder mark, like the
      // check for a default, leaves the error at the caller's line).
      const err = new PyErr('RecursionError', 'maximum recursion depth exceeded');
      const first = firstLine(f);
      if (first != null) err.where = [...this.frames.map((x) => ({ file: x.file, line: x.line })), { file: mod.file, line: first }];
      throw err;
    }
    return this.withFrame(frame, () => {
      const locals = new Map();
      const env = { mod, locals, frame };
      f.params.forEach((p, i) => {
        let v = i < args.length ? args[i] : (p.dflt ? (p.dflt.k === 'name' ? NOT_GIVEN : this.x(p.dflt, env)) : undefined);
        if (v === undefined) throw TypeErr(`${f.py}() missing 1 required positional argument: '${p.py}'`);
        locals.set(p.py, v);
      });
      for (const p of f.params) if (p.dflt?.k === 'name' && locals.get(p.py) === NOT_GIVEN) { frame.line = p.line; locals.set(p.py, this.x(p.dflt, env)); }
      for (const p of f.params) for (const rule of p.rules ?? []) { frame.line = p.line; this.never(rule, locals.get(p.py), env); }
      try { this.block(f.body, env); }
      catch (e) { if (e instanceof Return) return e.v; throw e; }
      return null;
    });
  }

  never(rule, value, env) { V.never(this.x(rule.rule.cond, env, { subject: value }), rule.text, rule.line, value); }

  newRecord(cls, given) { return V.newRecordWith((o, k, v) => this.setAttr(o, k, v), cls, given); }

  /** obj.name = value (a record checks its Never rules first, as its __setattr__ does). */
  setAttr(obj, name, value) {
    V.setAttrWith((rec) => {
      const env = { mod: rec.cls.mod, locals: new Map(), frame: this.frames[this.frames.length - 1] };
      for (const rule of rec.cls.rules.get(name) ?? []) this.never(rule, value, env);
    }, obj, name, value);
  }

  getAttr(obj, name) { return V.getAttr(obj, name); }

  // ── statements ──────────────────────────────────────────────────────────────────────────────────────────────
  block(body, env) { for (const s of body) this.stmt(s, env); }

  lookup(env, py) {
    if (env.locals.has(py)) return env.locals.get(py);
    if (env.mod.globals.has(py)) return env.mod.globals.get(py);
    throw new PyErr('NameError', `name '${py}' is not defined`);
  }

  /** A name watched by a Never rule: the new value is checked before it is stored. */
  assign(s, py, v, env) {
    for (const rule of s.rules ?? []) this.never(rule, v, env);
    env.locals.set(py, v);
  }

  rulesAfter(s, v, env) { for (const rule of s.rules ?? []) this.never(rule, v, env); }

  /** Store into a name, a field, or an entry (a list position from 1, or a map key). */
  store(t, v, env) {
    if (t.k === 'name') { env.locals.set(t.ref?.py ?? 'unknown', v); return; }
    if (t.k === 'field') {
      const obj = this.x(t.obj, env);
      if (t.static) this.setAttr(obj, t.py, v); else this.setField(obj, t.text, v);
      return;
    }
    if (t.k === 'at') {
      const obj = this.x(t.obj, env), key = this.x(t.key, env);
      if (t.objKind === 'list') this.setItem(obj, key, v);
      else if (t.objKind === 'map') this.mapSet(obj, key, v);
      else this.setEntry(obj, key, v);
    }
  }

  stmt(s, env) {
    if (this.rec) return this.recordStep(s, env);
    return this.runStmt(s, env);
  }

  /**
   * The Time Machine: one step per statement, in the order they run. A step keeps the line, how deep in calls it
   * is, the values it changed (before -> after, as the program would show them), and what it printed. A statement
   * with steps inside (a choice, a loop) keeps only where it went next; the steps inside are recorded on their own.
   */
  recordStep(s, env) {
    const rec = this.rec;
    if (rec.steps.length >= MAX_RECORDED) { rec.truncated = true; return this.runStmt(s, env); }
    const names = () => { const m = new Map(); for (const [k, v] of env.locals) if (!v?.isFunc) m.set(k, v); return m; };
    const view = (v) => { try { return typeof v === 'string' ? pyStr(v) : show(v); } catch { return '…'; } };
    const before = new Map([...names()].map(([k, v]) => [k, view(v)]));
    const step = { n: rec.steps.length + 1, file: env.frame.file, line: s.line, depth: this.frames.length, fn: env.frame.fn ?? null, kind: s.k };
    const outFrom = this.out.length;
    rec.steps.push(step);
    const inner = rec.steps.length;
    const container = CONTAINER_KINDS.has(s.k);
    const finish = (failed, gave) => {
      const nested = rec.steps.length > inner;
      if (container && nested) { step.next = rec.steps[inner].line; if (failed) step.failed = true; return; }
      if (container) step.next = null; // a choice or loop whose steps did not run (a condition that was false)
      const said = nested ? '' : this.out.slice(outFrom).join(''); // (output from a call is on the call's own steps)
      if (gave !== undefined) step.gives = view(gave);
      const changes = [];
      for (const [k, v] of names()) { const after = view(v); if (before.get(k) !== after) changes.push({ name: k.replace(/_/g, ' '), ...(before.has(k) ? { before: before.get(k) } : {}), after }); }
      if (changes.length) step.changes = changes;
      if (said) step.said = said;
      if (failed) step.failed = true;
    };
    try { const r = this.runStmt(s, env); finish(false); return r; }
    catch (e) { if (e instanceof Return) finish(false, e.v); else finish(true); throw e; }
  }

  runStmt(s, env) {
    const L = s.line;
    const fr = env.frame;
    fr.line = L;
    switch (s.k) {
      case 'say': {
        const v = this.x(s.e, env);
        this.out.push(`${s.e.type?.k === 'text' ? pyStr(v) : show(v)}\n`);
        return;
      }
      case 'set': {
        const t = s.target;
        const v = this.x(s.e, env);
        if (t.k === 'name') { this.assign(s, t.ref.py, v, env); return; }
        if (t.k === 'field') {
          const obj = this.x(t.obj, env);
          if (t.static) this.setAttr(obj, t.py, v); else this.setField(obj, t.text, v);
          return;
        }
        this.storeAt(t, v, env);
        return;
      }
      case 'give': throw new Return(s.e.k === 'nothing' ? null : this.x(s.e, env));
      case 'stop': { const v = this.x(s.e, env); throw Stop(s.e.type?.k === 'text' ? pyStr(v) : show(v)); }
      case 'if':
        for (const b of s.branches) {
          fr.line = b.line;
          if (this.yn(b.cond, env)) { this.block(b.body, env); return; }
        }
        if (s.otherwise) this.block(s.otherwise, env);
        return;
      case 'each': {
        const it = this.x(s.iter, env);
        const [a, b] = s.vars;
        let seq;
        if (b) seq = s.iterKind === 'map' ? this.mapItems(it) : s.iterKind === 'pairs' ? pyIter(it) : this.pairsOf(it);
        else seq = pyIter(it);
        for (let i = 0; i < seq.length; i++) {
          fr.line = L;
          const el = seq[i];
          if (b) { const [x, y] = this.unpack2(el); env.locals.set(a.py, x); env.locals.set(b.py, y); }
          else env.locals.set(a.py, el);
          this.block(s.body, env);
        }
        return;
      }
      case 'range': {
        const from = this.x(s.from, env);
        const to = s.to.k === 'num' && s.to.whole ? BigInt(s.to.text.replace(/_/g, '')) + 1n : add(this.x(s.to, env), 1n);
        const lo = this.rangeInt(from), hi = this.rangeInt(to);
        for (let i = lo; i < hi; i++) { fr.line = L; env.locals.set(s.v.py, i); this.block(s.body, env); }
        return;
      }
      case 'while':
        for (;;) {
          fr.line = L;
          const c = this.yn(s.cond, env);
          if (s.until ? c : !c) return;
          this.block(s.body, env);
        }
      case 'times': {
        const n = this.rangeInt(this.x(s.count, env));
        for (let i = 0n; i < n; i++) { fr.line = L; this.block(s.body, env); }
        return;
      }
      case 'expect': return this.expect(s, env);
      case 'add': case 'remove': return this.addRemove(s, env);
      case 'increase': case 'decrease': {
        const op = s.k === 'increase' ? add : sub;
        if (s.target.k === 'name') {
          const py = s.target.ref?.py ?? 'unknown';
          const cur = this.lookup(env, py);
          const v = op(cur, this.x(s.e, env));
          if (s.rules?.length) { this.assign(s, py, v, env); return; }
          env.locals.set(py, v);
          return;
        }
        const cur = this.x(s.target, env);
        this.store(s.target, op(cur, this.x(s.e, env)), env);
        return;
      }
      case 'sort': {
        const target = this.x(s.target, env);
        if (!Array.isArray(target)) throw attrErr(target, 'sort');
        const key = s.field ? this.keyFn(s.field, env) : null;
        const sorted = pySort(target, key, !!s.desc);
        target.splice(0, target.length, ...sorted);
        return;
      }
      case 'reverse': {
        const target = this.x(s.target, env);
        if (!Array.isArray(target)) throw attrErr(target, 'reverse');
        target.reverse();
        return;
      }
      case 'do': this.x(s.e, env); return;
      case 'open': env.opens = s.name; return;
      case 'tryFail':
        try { this.stmt(s.stmt, env); }
        catch (e) {
          if (e instanceof Return || e instanceof NeedsDeeperStack) throw e;
          if (this.deeper && nativeOverflow(e)) throw new NeedsDeeperStack();
          const err = asPyErr(e);
          fr.line = L;
          env.locals.set(s.errPy, explain(err));
          this.block(s.handler, env);
        }
        return;
      default: return;
    }
  }

  storeAt(t, v, env) { this.store(t, v, env); }

  addRemove(s, env) {
    const v = this.x(s.e, env);
    const isName = s.target.k === 'name';
    const target = this.x(s.target, env);
    const py = isName ? s.target.ref?.py ?? 'unknown' : null;
    if (s.targetKind === 'list') { if (s.k === 'add') { if (!Array.isArray(target)) throw attrErr(target, 'append'); target.push(v); } else this.removeFrom(target, v); }
    else if (s.targetKind === 'map') this.removeFrom(target, v);
    else if (s.targetKind === 'number') {
      const nv = (s.k === 'add' ? add : sub)(target, v);
      if (isName && s.rules?.length) { this.assign(s, py, nv, env); return; }
      if (isName) env.locals.set(py, nv); else this.store(s.target, nv, env);
    } else if (s.k === 'add') {
      const nv = this.addTo(target, v);
      if (isName) env.locals.set(py, nv); else this.store(s.target, nv, env);
    } else this.removeFrom(target, v);
    if (isName) this.rulesAfter(s, this.lookup(env, py), env);
  }

  expect(s, env) {
    const text = (s.raw ?? 'Expect').trim();
    if (s.mode === 'true') { V.expectTrue(this.x(s.e, env), text); return; }
    if (s.mode === 'fail') {
      const msg = s.msg ? this.x(s.msg, env) : null;
      // A JavaScript stack overflow is not the program failing: let it reach the deeper-stack retry.
      V.expectFailure(() => {
        try { this.x(s.e, env); }
        catch (e) {
          if (e instanceof Return) return;
          if (e instanceof NeedsDeeperStack) throw e;
          if (this.deeper && nativeOverflow(e)) throw new NeedsDeeperStack();
          throw e;
        }
      }, text, msg);
      return;
    }
    const actual = this.x(s.e, env);
    if (s.mode === 'cmp') { V.expectValue(actual, 'contains', 'contains', this.x(s.want, env), text); return; }
    let c = s.check, negate = false;
    if (c.k === 'not') { negate = true; c = c.e; }
    let op, want = null;
    const OPS = { '==': 'is', '!=': 'is not', '>=': 'at least', '<=': 'at most', '>': 'more than', '<': 'less than' };
    if (c.k === 'cmp') { op = OPS[c.op]; want = this.x(c.r, env); }
    else if (c.k === 'adj') op = c.adj;
    else if (c.k === 'isNothing') op = c.neg ? 'not nothing' : 'nothing';
    else if (c.k === 'between') { op = 'between'; want = [this.x(c.lo, env), this.x(c.hi, env)]; }
    else if (c.k === 'contains') { op = 'in'; want = this.x(c.l, env); }
    else op = 'is';
    V.expectValue(actual, negate ? `not ${op}` : op, op, want, text);
  }

  // ── runtime helpers (shared with compiled TypeScript: engine-values.mjs) ────────────────────────────────────
  yn(e, env, ctx) {
    const v = this.x(e, env, ctx);
    const known = e.type?.k === 'bool' || ['cmp', 'contains', 'between', 'adj', 'isNothing', 'not', 'bool'].includes(e.k) || (e.k === 'bin' && (e.op === 'and' || e.op === 'or'));
    return known ? v : yesNo(v);
  }

  rangeInt(v) { return V.rangeInt(v); }
  unpack2(el) { return V.unpack2(el); }
  mapItems(m) { return V.mapItems(m); }
  pairsOf(c) { return V.pairsOf(c); }

  keyFn(field, env) {
    const frame = { file: env.frame.file, line: env.frame.line };
    return (item) => this.withFrame(frame, () => (field.dynamic ? this.getField(item, field.key) : this.getAttr(item, field.py)));
  }

  itemAt(items, position, dflt) { return V.itemAt(items, position, dflt); }
  setItem(items, position, value) { V.setItem(items, position, value); }
  mapSet(m, k, v) { V.mapSet(m, k, v); }
  setEntry(c, k, v) { V.setEntry(c, k, v); }
  entry(c, k, dflt) { return V.entry(c, k, dflt); }
  mapGet(m, k, dflt) { return V.mapGet(m, k, dflt); }
  getField(obj, key) { return V.getField(obj, key); }
  setField(obj, key, value) { V.setFieldWith((o, k, v) => this.setAttr(o, k, v), obj, key, value); }
  addTo(target, value) { return V.addTo(target, value); }
  removeFrom(target, value) { V.removeFrom(target, value); }

  // ── expressions ─────────────────────────────────────────────────────────────────────────────────────────────
  x(e, env, ctx = {}) {
    const sub2 = (k) => this.x(k, env, ctx);
    switch (e.k) {
      case 'num': return e.whole ? BigInt(e.text.replace(/_/g, '')) : Dec.parse(e.text);
      case 'money': return Money.of(e.text);
      case 'percent': return Dec.parse(percentDecimal(e.text));
      case 'bool': return !!e.v;
      case 'nothing': case 'hole': return null;
      case 'paren': return sub2(e.e);
      case 'today': return PyDate.today();
      case 'date': { const d = PyDate.parse(e.text); if (!d) throw new PyErr('ValueError', `Invalid isoformat string: '${e.text}'`); return d; }
      case 'str': return this.str(e, env, ctx);
      case 'list': return e.items ? e.items.map(sub2) : new PyDict();
      case 'map': return new PyDict();
      case 'name': {
        const r = e.ref ?? {};
        if (r.kind === 'subject') return ctx.subject ?? null;
        if (r.kind === 'elemField') return this.getAttr(ctx.item, r.py);
        if (r.kind === 'elemKey') return this.getField(ctx.item, r.key);
        if (r.kind === 'elem') return ctx.item;
        return this.lookup(env, r.py ?? e.name.replace(/ /g, '_'));
      }
      case 'call': { const fn = this.lookup(env, e.py); return this.call(fn, e.args.map(sub2)); }
      case 'new': {
        const cls = this.lookup(env, e.py);
        const given = new Map();
        for (const f of e.fields) given.set(f.py, sub2(f.e));
        return this.newRecord(cls, given);
      }
      case 'field': { const obj = sub2(e.obj); return e.static ? this.getAttr(obj, e.py) : this.getField(obj, e.text); }
      case 'at': {
        const o = sub2(e.obj), k = sub2(e.key);
        const d = e.dflt ? sub2(e.dflt) : undefined;
        if (e.objKind === 'map') return this.mapGet(o, k, d);
        if (e.objKind === 'list') return this.itemAt(o, k, d);
        return this.entry(o, k, d);
      }
      case 'conv': {
        const v = sub2(e.e);
        switch (e.to) {
          case 'list': return pyList(v);
          case 'number': return V.toNumber(v);
          case 'whole': return V.toWhole(v);
          case 'money': return V.toMoney(v);
          case 'text': return show(v);
          case 'bool': return V.toYesNo(v);
          case 'date': return V.toDate(v);
          default: return v;
        }
      }
      case 'where': {
        const list = sub2(e.list);
        return pyIter(list).filter((item) => truthy(this.x(e.cond, env, { ...ctx, item })));
      }
      case 'from': {
        const inner = e.list.k === 'where' ? e.list : null;
        const list = sub2(inner ? inner.list : e.list);
        const pick = (item) => (e.field.dynamic ? this.getField(item, e.field.key) : this.getAttr(item, e.field.py));
        return pyIter(list).filter((item) => !inner || truthy(this.x(inner.cond, env, { ...ctx, item }))).map(pick);
      }
      case 'sorted': {
        const list = sub2(e.list);
        if (e.mapSort) {
          if (!(list instanceof PyDict)) throw attrErr(list, 'items');
          const frame = { file: env.frame.file, line: env.frame.line };
          return pySort(list.items(), (t) => this.withFrame(frame, () => t.items[e.by === 'key' ? 0 : 1]), !!e.desc);
        }
        return pySort(pyList(list), this.keyFn(e.field, env), !!e.desc);
      }
      case 'op': return this.op(e.op, sub2(e.arg));
      case 'round': { const v = sub2(e.e); return e.places ? roundTo(v, sub2(e.places)) : roundTo(v); }
      case 'readFile': return this.readFile(sub2(e.path));
      case 'neg': return neg(sub2(e.e));
      case 'not': return !this.yn(e.e, env, ctx);
      case 'bin': {
        if (e.op === 'and') return this.yn(e.l, env, ctx) && this.yn(e.r, env, ctx);
        if (e.op === 'or') return this.yn(e.l, env, ctx) || this.yn(e.r, env, ctx);
        const l = sub2(e.l), r = sub2(e.r);
        if (e.op === '+') return add(l, r);
        if (e.op === '-') return sub(l, r);
        if (e.op === '*') return mul(l, r);
        if (e.op === '/') return divide(l, r);
        if (e.op === 'mod') return e.l.type?.k === 'whole' && e.r.type?.k === 'whole' ? intMod(l, r) : modulo(l, r);
        throw new PyErr('NameError', `name '${e.op}' is not defined`);
      }
      case 'cmp': {
        if (e.r.k === 'bool' && (e.op === '==' || e.op === '!=')) { const a = this.yn(e.l, env, ctx); const b = sub2(e.r); return e.op === '==' ? a === b : a !== b; }
        return compare(e.op, sub2(e.l), sub2(e.r));
      }
      case 'between': { const lo = sub2(e.lo), v = sub2(e.e); if (!compare('<=', lo, v)) return false; return compare('<=', v, sub2(e.hi)); }
      case 'contains': { const item = sub2(e.r); return contains(sub2(e.l), item); }
      case 'affix': return V.affix(sub2(e.l), sub2(e.r), e.end);
      case 'sortedValues': return pySort(pyList(sub2(e.list)), null, !!e.desc);
      case 'joined': return V.joined(sub2(e.list), sub2(e.sep));
      case 'splitAt': return V.splitAt(sub2(e.text), sub2(e.sep));
      case 'replacing': return V.replacing(sub2(e.text), sub2(e.from), sub2(e.to));
      case 'adj': {
        const v = sub2(e.e);
        if (e.adj === 'empty') return eq(pyLen(v), 0n);
        return compare({ positive: '>', negative: '<', zero: '==' }[e.adj], v, 0n);
      }
      case 'isNothing': { const v = sub2(e.e); return e.neg ? v !== null : v === null; }
      default: return null;
    }
  }

  op(op, a) { return V.applyOp(op, a); }

  readFile(path) { return V.readTextVia(this.readText, this.cwd, path); }

  /** Text with {holes}: text and whole numbers as they are, anything else shown the Thunder way. */
  str(e, env, ctx) {
    return e.parts.map((p) => {
      if (typeof p === 'string') return p;
      const v = this.x(p.e, env, ctx);
      const t = p.e.type?.k;
      return t === 'text' || t === 'whole' ? pyStr(v) : show(v);
    }).join('');
  }

  // ── running a program or its tests ──────────────────────────────────────────────────────────────────────────
  runMain(mod) {
    const main = mod.r.program.main ?? [];
    if (!main.length) return;
    const frame = { file: mod.file, line: 0 };
    this.withFrame(frame, () => {
      const env = { mod, locals: new Map(), frame };
      try { this.block(main, env); } catch (e) { if (e instanceof Return) return; throw e; }
    });
  }

  runTest(mod, t) {
    const frame = { file: mod.file, line: t.line };
    this.withFrame(frame, () => {
      const env = { mod, locals: new Map(), frame };
      try { this.block(t.body, env); } catch (e) { if (e instanceof Return) return; throw e; }
    });
  }
}


// ── public API ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The same, on the calling thread (its stack allows only a few hundred nested calls). */
export function runInProcess({ entry, cwd, deeper = false, readText = null } = {}) {
  const uses = pythonModulesUsed([entry]);
  if (uses.length) return { status: 2, stdout: '', stderr: `${refusalText(uses)}\n`, refused: uses };
  const eng = new Engine({ cwd, deeper, readText });
  let stderr = '', status = 0;
  try {
    const mod = eng.load(entry);
    eng.runMain(mod);
  } catch (e) {
    if (e instanceof Return) { /* a Give outside a function ends the program */ }
    else if (e instanceof NeedsDeeperStack || (deeper && nativeOverflow(e))) return { needsDeeperStack: true };
    else { stderr = `${eng.describeError(asPyErr(e))}\n`; status = 1; }
  }
  return { status, stdout: eng.out.join(''), stderr };
}

/**
 * Run a program and keep a step-by-step recording of it (the Thunder Time Machine, `thunder run --record`).
 * Gives back { status, stdout, stderr, steps, truncated }. Like runInProcess, on the calling thread.
 */
export function recordedRun({ entry, cwd, readText = null } = {}) {
  const uses = pythonModulesUsed([entry]);
  if (uses.length) return { status: 2, stdout: '', stderr: `${refusalText(uses)}\n`, refused: uses, steps: [] };
  const eng = new Engine({ cwd, readText, record: true });
  let stderr = '', status = 0;
  try {
    const mod = eng.load(entry);
    eng.runMain(mod);
  } catch (e) {
    if (!(e instanceof Return)) { stderr = `${eng.describeError(asPyErr(e))}\n`; status = 1; }
  }
  return { status, stdout: eng.out.join(''), stderr, steps: eng.rec.steps, truncated: eng.rec.truncated };
}

/** The same, on the calling thread. */
export function testInProcess({ results, cwd, deeper = false, readText = null } = {}) {
  const uses = pythonModulesUsed(results);
  if (uses.length) return { status: 2, stdout: '', stderr: `${refusalText(uses)}\n`, refused: uses };
  const eng = new Engine({ cwd, deeper, readText });
  const mods = [];
  const srcMods = [];
  for (const r of results) {
    const mod = eng.load(r, r.kind === 'test' ? srcMods : []);
    if (r.kind !== 'test') srcMods.push(mod);
    mods.push(mod);
  }
  let passed = 0, failed = 0;
  for (const mod of mods) {
    for (const t of mod.r.info.tests) {
      try {
        eng.runTest(mod, t);
        passed++;
        eng.out.push(`PASS  ${t.title} (${mod.file}, line ${t.line})\n`);
      } catch (e) {
        if (e instanceof NeedsDeeperStack || (deeper && nativeOverflow(e))) return { needsDeeperStack: true };
        failed++;
        eng.out.push(`FAIL  ${t.title} (${mod.file}, line ${t.line})\n`, `      ${eng.describeError(asPyErr(e))}\n`);
      }
    }
  }
  const total = passed + failed;
  eng.out.push(`${total} test${total === 1 ? '' : 's'}: ${passed} passed, ${failed} failed\n`);
  return { status: failed ? 1 : 0, stdout: eng.out.join(''), stderr: '' };
}

// ── screens ────────────────────────────────────────────────────────────────────────────────────────────────────
//
// A screen is shown as a tree of plain values (the same tree compiled React's HTML is read back into by the
// conformance tests), and changed one event at a time: a press runs its steps on copies of the remembered values
// and keeps them only if every step works; typing sets the box's value. Each shown screen remembers its own values,
// by its place on the screen (as React keeps a component's state by its place), and forgets them when it goes away.
//
//   { k: 'screen', name, children: [...] }       a screen (the app's, or one shown inside another)
//   { k: 'heading', text }   { k: 'text', text }   { k: 'row', children }   { k: 'list', items: [[...], ...] }
//   { k: 'textbox' | 'numberbox', label, value }   { k: 'button', label, off }
//   { k: 'problem', text }                         what the last press or typing on this screen said, when it failed
//   { k: 'failed', text }                          the app could not be shown (the same message thunder run gives)

class ScreenApp {
  constructor(eng, entry) {
    this.eng = eng;
    this.entry = entry;
    this.screens = new Map(entry.info.screens.map((s) => [s.name, s]));
    this.current = entry.info.screens[0] ?? null;
    this.places = new Map(); // place -> { values: Map(py -> value), problem }
    this.handlers = [];
    try { this.mod = eng.load(entry); } catch (e) { this.loadFailed = e; }
  }

  /** The app as it is now, as a tree. */
  render() {
    this.handlers = [];
    if (this.loadFailed) return { k: 'failed', text: this.eng.describeError(asPyErr(this.loadFailed)) };
    if (!this.current) return { k: 'failed', text: 'This program has no Screen to show.' };
    const seen = new Set();
    try {
      const tree = this.screen(this.current, new Map(), this.current.name, seen);
      for (const k of [...this.places.keys()]) if (!seen.has(k)) this.places.delete(k); // gone: forgotten
      return tree;
    } catch (e) {
      if (e instanceof NeedsDeeperStack) throw e;
      this.places.clear();
      return { k: 'failed', text: this.eng.describeError(asPyErr(e)) };
    }
  }

  /** One screen at a place: its inputs (given, or their defaults), its remembered values, and what it shows. */
  screen(s, given, place, seen) {
    seen.add(place);
    const eng = this.eng;
    const frame = { file: this.mod.file, line: s.line };
    // A screen shown inside another is shown on its own (as React renders each component by itself).
    const saved = eng.frames;
    eng.frames = [];
    try {
      return eng.withFrame(frame, () => {
        const env = { mod: this.mod, locals: new Map(), frame };
        for (const p of s.params) {
          if (given.has(p.py)) env.locals.set(p.py, given.get(p.py));
          else { frame.line = p.line; env.locals.set(p.py, p.dflt ? eng.x(p.dflt, env) : null); }
        }
        let st = this.places.get(place);
        if (!st) {
          const values = new Map();
          st = { values, problem: null };
          for (const r of s.remember) { frame.line = r.line; const v = eng.x(r.e, env); values.set(r.py, v); env.locals.set(r.py, v); }
          this.places.set(place, st);
        }
        for (const [k, v] of st.values) env.locals.set(k, v);
        const children = this.elements(s.body, env, s, place, st, seen);
        if (st.problem !== null) children.push({ k: 'problem', text: st.problem });
        return { k: 'screen', name: s.text, children };
      });
    } finally { eng.frames = saved; }
  }

  elements(els, env, s, place, st, seen) {
    const eng = this.eng;
    const fr = env.frame;
    const out = [];
    els.forEach((el, i) => {
      const at = `${place}/${i}`;
      fr.line = el.line;
      switch (el.k) {
        case 'heading': out.push({ k: 'heading', text: shownText(eng.x(el.e, env), el.e.type?.k) }); return;
        case 'text': out.push({ k: 'text', text: shownText(eng.x(el.e, env), el.e.type?.k) }); return;
        case 'when': {
          for (let b = 0; b < el.branches.length; b++) {
            fr.line = el.branches[b].line;
            if (eng.yn(el.branches[b].cond, env)) { out.push(...this.elements(el.branches[b].body, env, s, `${at}.${b}`, st, seen)); return; }
          }
          if (el.otherwise) out.push(...this.elements(el.otherwise, env, s, `${at}.else`, st, seen));
          return;
        }
        case 'list': {
          const items = pyIter(eng.x(el.iter, env));
          out.push({ k: 'list', items: items.map((item, n) => {
            const inner = { ...env, locals: new Map(env.locals) };
            inner.locals.set(el.v.py, item);
            return this.elements(el.body, inner, s, `${at}#${n}`, st, seen);
          }) });
          return;
        }
        case 'row': out.push({ k: 'row', children: this.elements(el.body, env, s, at, st, seen) }); return;
        case 'textbox': case 'numberbox': {
          const label = pyStr(eng.x(el.label, env));
          const v = env.locals.get(el.target.ref.py);
          out.push({ k: el.k, label, value: el.k === 'textbox' ? pyStr(v) : show(v) });
          this.handlers.push({ kind: 'box', label, type: (text) => {
            try { st.values.set(el.target.ref.py, el.k === 'textbox' ? String(text) : typedNumber(text, el.boxKind)); st.problem = null; }
            catch (e) { st.problem = problemText(e); }
          } });
          return;
        }
        case 'button': {
          const label = pyStr(eng.x(el.label, env));
          fr.line = el.line;
          const off = el.off ? eng.yn(el.off, env) : false;
          out.push({ k: 'button', label, off });
          const locals = new Map(env.locals);
          this.handlers.push({ kind: 'button', label, off, press: () => this.press(el, locals, st) });
          return;
        }
        case 'child': {
          const target = this.screens.get(el.screen.name);
          const given = new Map();
          for (const g of el.given) { fr.line = g.line; given.set(g.py, eng.x(g.e, env)); }
          out.push(this.screen(target, given, `${at}:${target.name}`, seen));
          return;
        }
        default: return;
      }
    });
    return out;
  }

  /** A press: its steps run on copies of the screen's remembered values; they are kept only if every step works. */
  press(el, locals, st) {
    let opens = el.opens?.name ?? null;
    if (el.press) {
      const eng = this.eng;
      const frame = { file: this.mod.file, line: el.press.line };
      const env = { mod: this.mod, locals: new Map(locals), frame, opens: null };
      for (const [k, v] of st.values) env.locals.set(k, copyValue(v));
      try {
        eng.withFrame(frame, () => eng.block(el.press.body, env));
      } catch (e) {
        if (e instanceof NeedsDeeperStack) throw e;
        st.problem = problemText(e);
        return;
      }
      for (const k of st.values.keys()) st.values.set(k, env.locals.get(k));
      st.problem = null;
      opens = env.opens ?? opens;
    }
    if (opens && opens !== this.current.name) { this.current = this.screens.get(opens); this.places.clear(); }
  }

  /** The button or box with this label (the nth one, from 1, when several have it). */
  find(kind, label, nth = 1) {
    const all = this.handlers.filter((h) => h.kind === kind && h.label === label);
    const h = all[nth - 1];
    if (!h) {
      const labels = [...new Set(this.handlers.filter((x) => x.kind === kind).map((x) => `"${x.label}"`))];
      throw new Error(`There is no ${kind === 'box' ? 'box' : 'button'} "${label}" on the screen${all.length ? ` (only ${all.length})` : ''}.${labels.length ? ` There is ${labels.join(', ')}.` : ''}`);
    }
    return h;
  }
}

/**
 * Show a program's screens and change them one event at a time, on the Thunder engine:
 *   const app = screenApp({ entry }); app.render() -> tree; app.press("Add"); app.type("Name", "Ada"); app.render()
 * A press on a button that is off does nothing (and says so). Each event is followed by a render, as in React.
 */
export function screenApp({ entry, cwd = '.', readText = null } = {}) {
  const app = new ScreenApp(new Engine({ cwd, readText }), entry);
  let tree = app.render();
  return {
    render: () => tree,
    get screen() { return app.current?.text ?? null; },
    press(label, nth = 1) {
      const h = app.find('button', label, nth);
      if (h.off) return { off: true, tree };
      h.press();
      tree = app.render();
      return { off: false, tree };
    },
    type(label, text, nth = 1) {
      app.find('box', label, nth).type(text);
      tree = app.render();
      return { tree };
    },
  };
}

/** A screen tree as an outline people read (thunder run). */
export function screenOutline(tree, indent = '') {
  const L = [];
  const q = (t) => JSON.stringify(t);
  const walk = (n, ind) => {
    switch (n.k) {
      case 'failed': L.push(`${ind}✗ The screen could not be shown: ${n.text}`); return;
      case 'screen': L.push(`${ind}Screen ${q(n.name)}`); for (const c of n.children) walk(c, `${ind}  `); return;
      case 'heading': L.push(`${ind}Heading: ${n.text}`); return;
      case 'text': L.push(`${ind}${n.text}`); return;
      case 'row': L.push(`${ind}Row:`); for (const c of n.children) walk(c, `${ind}  `); return;
      case 'list':
        if (!n.items.length) { L.push(`${ind}List: (no items)`); return; }
        L.push(`${ind}List:`);
        for (const item of n.items) {
          const start = L.length;
          for (const c of item) walk(c, `${ind}    `);
          if (L.length > start) L[start] = `${ind}  • ${L[start].slice(ind.length + 4)}`; else L.push(`${ind}  •`);
        }
        return;
      case 'textbox': L.push(`${ind}Text box ${q(n.label)}: ${q(n.value)}`); return;
      case 'numberbox': L.push(`${ind}Number box ${q(n.label)}: ${n.value}`); return;
      case 'button': L.push(`${ind}Button ${q(n.label)}${n.off ? ' (off)' : ''}`); return;
      case 'problem': L.push(`${ind}! ${n.text}`); return;
      default: return;
    }
  };
  walk(tree, indent);
  return L.join('\n');
}

/**
 * Run a job on a worker thread with a large stack and wait for it: the program's results are copied to the
 * worker (structured clone keeps the shared references the checker made), and the answer comes back the same way.
 */
export { ThunderErr, PyErr };
