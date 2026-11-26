// The Thunder engine: runs Thunder Core directly, with no Python (thunder run --engine thunder).
//
// It runs the SAME checked program the Python target compiles (compileCore -> program + info), so there is one
// meaning of Thunder, not two. Its behavior is the Python target's behavior: every statement does what the line
// target-python.mjs writes for it does, and every helper does what thunder_runtime.py does (engine-values.mjs).
// compiler/test/core-engine.test.mjs runs every Core test program on both engines and compares the output,
// errors included. A difference is a bug in one of them.
//
// A program that uses a Python module ("Use csv as csv") is not run here: Thunder never imitates a library.

import { readFileSync } from 'node:fs';
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';
import { resolve as resolvePath } from 'node:path';
import {
  Dec, Money, PyDate, PyDict, RecordVal, Tuple, NOT_GIVEN, ThunderErr, PyErr, TypeErr,
  Stop, RuleBroken, ExpectationFailed, KindMismatch, ConversionFailed, MissingValue,
  explain, codeOf, asPyErr, describe, show, pyStr, truthy, yesNo, toDec,
  pyLen, pyIter, pyList, add, sub, mul, neg, intMod, divide, modulo, roundTo, eq, compare, contains, pySort,
  attrErr, strMethod, splitLines, pySplit, pyStrip, jsonParse, jsonText, isInt, isNumber,
} from './engine-values.mjs';
import { percentDecimal } from './target-python.mjs';

export const ENGINES = ['python', 'thunder'];

/** Thrown by Give: carries the value back to the call. */
class Return { constructor(v) { this.v = v; } }

/** JavaScript ran out of stack before Thunder's own limit: the run is retried on a thread with a deeper stack. */
const nativeOverflow = (e) => e instanceof RangeError && /call stack/i.test(e.message);
class NeedsDeeperStack extends Error {}

const MAX_FRAMES = 997; // as deep as the generated Python goes (recursion limit 1000, less its own frames)

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
  constructor({ cwd = process.cwd(), deeper = false } = {}) {
    this.cwd = cwd;
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

  /** describe_error(error) in thunder_runtime.py. */
  describeError(e) {
    const where = e.where ?? [];
    const inner = where[where.length - 1];
    let message = explain(e);
    let code = codeOf(e);
    if (code === 'TC508' && !e.thunder) { message = `Python code used by this line failed: ${message}`; code = 'TC508'; }
    let place = inner ? `${inner.file}, line ${inner.line}` : 'In the program';
    const callers = where.slice(0, -1).map((f) => f.line);
    if (callers.length && inner) place += ` (reached from line ${callers.reverse().join(', then line ')})`;
    return `${place}: ${message}  [${code}]`;
  }

  // ── calls ───────────────────────────────────────────────────────────────────────────────────────────────────
  call(fn, args) {
    if (!fn?.isFunc) throw TypeErr(`'${fn === null ? 'NoneType' : typeof fn}' object is not callable`);
    const { f, mod } = fn;
    const frame = { file: mod.file, line: f.line };
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

  never(rule, value, env) {
    if (truthy(this.x(rule.rule.cond, env, { subject: value }))) throw RuleBroken(`${rule.text} (the rule on line ${rule.line}), but the value is ${show(value)}.`);
  }

  newRecord(cls, given) {
    const rec = new RecordVal(cls);
    const missing = cls.fields.filter((f) => !given.has(f.py) && !['optional', 'list', 'map'].includes(f.type?.k));
    if (missing.length) throw TypeErr(`${cls.py}.__init__() missing ${missing.length} required keyword-only argument${missing.length === 1 ? '' : 's'}: ${missing.map((f) => `'${f.py}'`).join(missing.length === 2 ? ' and ' : ', ')}`);
    for (const f of cls.fields) {
      const v = given.has(f.py) ? given.get(f.py) : f.type.k === 'optional' ? null : f.type.k === 'list' ? [] : new PyDict();
      this.setAttr(rec, f.py, v);
    }
    return rec;
  }

  /** obj.name = value (a record checks its Never rules first, as its __setattr__ does). */
  setAttr(obj, name, value) {
    if (obj instanceof RecordVal) {
      const env = { mod: obj.cls.mod, locals: new Map(), frame: this.frames[this.frames.length - 1] };
      for (const rule of obj.cls.rules.get(name) ?? []) this.never(rule, value, env);
      obj.f.set(name, value);
      return;
    }
    if (obj instanceof Money) throw new PyErr('AttributeError', 'Money cannot be changed; make new money instead.');
    throw attrErr(obj, name);
  }

  getAttr(obj, name) {
    if (obj instanceof RecordVal && obj.f.has(name)) return obj.f.get(name);
    if (obj instanceof Money && name === 'amount') return obj.amount;
    throw attrErr(obj, name);
  }

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
    if (s.mode === 'true') { if (this.x(s.e, env) !== true) throw ExpectationFailed(`${text}, but it was not true.`); return; }
    if (s.mode === 'fail') {
      const msg = s.msg ? this.x(s.msg, env) : null;
      try { this.x(s.e, env); }
      catch (e) {
        if (e instanceof Return || e instanceof NeedsDeeperStack) throw e;
        if (this.deeper && nativeOverflow(e)) throw new NeedsDeeperStack();
        const err = asPyErr(e);
        if (err.thunder && msg !== null) {
          if (typeof msg !== 'string') throw TypeErr(`'in <string>' requires string as left operand, not ${typeof msg === 'bigint' ? 'int' : 'object'}`);
          if (!err.message.includes(msg)) throw ExpectationFailed(`${text}, but it failed with "${err.message}".`);
        }
        return;
      }
      throw ExpectationFailed(`${text}, but it did not fail.`);
    }
    const actual = this.x(s.e, env);
    let ok;
    if (s.mode === 'cmp') ok = contains(actual, this.x(s.want, env));
    else {
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
      const full = negate ? `not ${op}` : op;
      const known = CHECKS[full];
      ok = known ? known(actual, want) : !CHECKS[op](actual, want);
    }
    if (!ok) throw ExpectationFailed(`${text}, but it was ${show(actual)}.`);
  }

  // ── runtime helpers that need the engine ────────────────────────────────────────────────────────────────────
  yn(e, env, ctx) {
    const v = this.x(e, env, ctx);
    const known = e.type?.k === 'bool' || ['cmp', 'contains', 'between', 'adj', 'isNothing', 'not', 'bool'].includes(e.k) || (e.k === 'bin' && (e.op === 'and' || e.op === 'or'));
    return known ? v : yesNo(v);
  }

  rangeInt(v) {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'boolean') return v ? 1n : 0n;
    throw TypeErr(`'${v instanceof Dec ? 'decimal.Decimal' : v === null ? 'NoneType' : v instanceof Money ? 'Money' : typeof v === 'string' ? 'str' : 'object'}' object cannot be interpreted as an integer`);
  }

  unpack2(el) {
    const items = Array.isArray(el) ? el : el instanceof Tuple ? el.items : typeof el === 'string' ? Array.from(el) : el instanceof PyDict ? el.keys() : null;
    if (!items) throw TypeErr(`cannot unpack non-iterable ${el === null ? 'NoneType' : isInt(el) ? 'int' : el instanceof Dec ? 'decimal.Decimal' : typeof el === 'boolean' ? 'bool' : 'object'} object`);
    if (items.length < 2) throw new PyErr('ValueError', `not enough values to unpack (expected 2, got ${items.length})`);
    if (items.length > 2) throw new PyErr('ValueError', `too many values to unpack (expected 2, got ${items.length})`);
    return items;
  }

  mapItems(m) { if (!(m instanceof PyDict)) throw attrErr(m, 'items'); return m.items(); }
  pairsOf(c) { return c instanceof PyDict ? c.items() : pyList(c); }

  keyFn(field, env) {
    const frame = { file: env.frame.file, line: env.frame.line };
    return (item) => this.withFrame(frame, () => (field.dynamic ? this.getField(item, field.key) : this.getAttr(item, field.py)));
  }

  itemAt(items, position, dflt) {
    if (typeof position !== 'bigint') throw KindMismatch(`A position in a list is a whole number, not ${describe(position)}.`);
    const list = Array.isArray(items) ? items : items instanceof Tuple ? items.items : null;
    if (!list) throw TypeErr(`object of type '${items === null ? 'NoneType' : 'object'}' has no len()`);
    if (position >= 1n && position <= BigInt(list.length)) return list[Number(position) - 1];
    if (dflt !== undefined) return dflt;
    throw MissingValue(`There is no item ${position}: the list has ${list.length} item${list.length === 1 ? '' : 's'}.`);
  }
  setItem(items, position, value) { this.itemAt(items, position); items[Number(position) - 1] = value; }
  mapSet(m, k, v) {
    if (m instanceof PyDict) { m.set(k, v); return; }
    if (m === null) throw TypeErr("'NoneType' object does not support item assignment");
    if (Array.isArray(m)) { this.setItem(m, k, v); return; }
    throw TypeErr(`'${m instanceof Money ? 'Money' : 'object'}' object does not support item assignment`);
  }
  setEntry(c, k, v) {
    if (Array.isArray(c)) this.setItem(c, k, v);
    else if (c instanceof PyDict) c.set(k, v);
    else if (c === null) throw MissingValue(`This value is nothing, so it has no entry for ${show(k)}.`);
    else throw KindMismatch(`${describe(c)} has no entries that can be changed.`);
  }
  entry(c, k, dflt) {
    if (Array.isArray(c) || c instanceof Tuple) return this.itemAt(c, k, dflt);
    if (c instanceof PyDict) { if (c.has(k)) return c.get(k); if (dflt !== undefined) return dflt; throw MissingValue(`There is no entry for ${show(k)}.`); }
    if (c === null) throw MissingValue(`This value is nothing, so it has no entry for ${show(k)}.`);
    throw KindMismatch(`${describe(c)} has no entries.`);
  }
  mapGet(m, k, dflt) {
    if (m instanceof PyDict) { if (m.has(k)) return m.get(k); if (dflt !== undefined) return dflt; throw new PyErr('KeyError', pyStr(k), [k]); }
    if (m === null) throw dflt !== undefined ? attrErr(m, 'get') : TypeErr("'NoneType' object is not subscriptable");
    if (dflt !== undefined) throw attrErr(m, 'get');
    if (Array.isArray(m)) { const i = Number(k); if (typeof k === 'bigint' && i >= -m.length && i < m.length) return m.at(i); throw new PyErr('IndexError', 'list index out of range'); }
    throw TypeErr(`'${m instanceof Money ? 'Money' : 'object'}' object is not subscriptable`);
  }

  getField(obj, key) {
    if (obj === null) throw MissingValue(`This value is nothing, so it has no ${key}.`);
    const names = [key, key.replace(/ /g, '_'), key.toLowerCase(), key.toLowerCase().replace(/ /g, '_')];
    if (obj instanceof PyDict) {
      for (const k of names) if (obj.has(k)) return obj.get(k);
      for (const [k, v] of obj.m.values()) if (pyStrip(pyStr(k)).toLowerCase() === key.toLowerCase()) return v;
      throw MissingValue(`There is no field "${key}". Fields here: ${obj.keys().map(pyStr).join(', ')}.`);
    }
    for (const k of names) {
      if (obj instanceof RecordVal && obj.f.has(k)) return obj.f.get(k);
      if (obj instanceof Money && k === 'amount') return obj.amount;
    }
    throw MissingValue(`${describe(obj)} has no field "${key}".`);
  }
  setField(obj, key, value) {
    if (obj instanceof PyDict) { obj.set(key, value); return; }
    const names = [key, key.replace(/ /g, '_'), key.toLowerCase(), key.toLowerCase().replace(/ /g, '_')];
    for (const k of names) if (obj instanceof RecordVal && obj.f.has(k)) { this.setAttr(obj, k, value); return; }
    throw MissingValue(`${describe(obj)} has no field "${key}".`);
  }

  addTo(target, value) { if (Array.isArray(target)) { target.push(value); return target; } return add(target, value); }
  removeFrom(target, value) {
    if (target instanceof PyDict) { if (!target.has(value)) throw MissingValue(`There is no entry for ${show(value)} to remove.`); target.delete(value); return; }
    if (!contains(target, value)) throw MissingValue(`${show(value)} is not in the list, so it can't be removed.`);
    if (!Array.isArray(target)) throw attrErr(target, 'remove');
    target.splice(target.findIndex((x) => x === value || eq(x, value)), 1);
  }

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
          case 'number': return toNumber(v);
          case 'whole': return toWhole(v);
          case 'money': return toMoney(v);
          case 'text': return show(v);
          case 'bool': return toYesNo(v);
          case 'date': return toDate(v);
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
      case 'affix': {
        const t = sub2(e.l), a = sub2(e.r);
        const what = e.end ? '"ends with"' : '"starts with"';
        textOf(t, what); textOf(a, what);
        return e.end ? t.endsWith(a) : t.startsWith(a);
      }
      case 'sortedValues': return pySort(pyList(sub2(e.list)), null, !!e.desc);
      case 'joined': return joined(sub2(e.list), sub2(e.sep));
      case 'splitAt': return splitAt(sub2(e.text), sub2(e.sep));
      case 'replacing': return replacing(sub2(e.text), sub2(e.from), sub2(e.to));
      case 'adj': {
        const v = sub2(e.e);
        if (e.adj === 'empty') return eq(pyLen(v), 0n);
        return compare({ positive: '>', negative: '<', zero: '==' }[e.adj], v, 0n);
      }
      case 'isNothing': { const v = sub2(e.e); return e.neg ? v !== null : v === null; }
      default: return null;
    }
  }

  op(op, a) {
    switch (op) {
      case 'sum': return totalOf(pyList(a));
      case 'average': { const items = pyList(a); if (!items.length) throw MissingValue("I can't take the average of an empty list."); return divide(totalOf(items), BigInt(items.length)); }
      case 'count': case 'length': return pyLen(a);
      case 'min': { const items = pyList(a); if (!items.length) throw MissingValue('An empty list has no smallest item.'); return items.reduce((best, x) => (compare('<', x, best) ? x : best)); }
      case 'max': { const items = pyList(a); if (!items.length) throw MissingValue('An empty list has no largest item.'); return items.reduce((best, x) => (compare('>', x, best) ? x : best)); }
      case 'first': { const items = pyList(a); if (!items.length) throw MissingValue('An empty list has no first item.'); return items[0]; }
      case 'last': { const items = pyList(a); if (!items.length) throw MissingValue('An empty list has no last item.'); return items[items.length - 1]; }
      case 'words': return pySplit(pyStr(a)).map((p) => stripPunct(p)).filter(Boolean);
      case 'lines': return splitLines(strMethod(a, 'splitlines'));
      case 'lowercase': return strMethod(a, 'lower').toLowerCase();
      case 'uppercase': return strMethod(a, 'upper').toUpperCase();
      case 'trimmed': return pyStrip(strMethod(a, 'strip'));
      case 'parts': return pySplit(textOf(a, '"the parts of"'));
      case 'abs': {
        if (a instanceof Money) return new Money(a.amount.abs());
        if (typeof a === 'boolean' || !(isNumber(a))) throw KindMismatch(`"the absolute value of" needs a number or money, but it is ${describe(a)}.`);
        return typeof a === 'bigint' ? (a < 0n ? -a : a) : a.abs();
      }
      case 'jsonText': return jsonText(a);
      case 'jsonData': return jsonParse(textOf(a, '"the JSON data in"'));
      case 'keys': if (!(a instanceof PyDict)) throw attrErr(a, 'keys'); return a.keys();
      case 'values': if (!(a instanceof PyDict)) throw attrErr(a, 'values'); return a.values();
      default: throw new PyErr('NameError', `name '${op}' is not defined`);
    }
  }

  readFile(path) {
    if (typeof path !== 'string') throw TypeErr(`expected str, bytes or os.PathLike object, not ${path === null ? 'NoneType' : 'object'}`);
    try { return readFileSync(resolvePath(this.cwd, path), 'utf8'); }
    catch (err) {
      if (err.code === 'ENOENT') throw MissingValue(`There is no file "${path}" (looked in the folder the program runs in).`);
      throw new PyErr(err.code === 'EISDIR' ? 'IsADirectoryError' : 'OSError', err.message);
    }
  }

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

/** The Thunder line of the first generated line of a function, or null when that line carries no mark. */
function firstLine(f) {
  if (f.params.some((p) => p.dflt?.k === 'name')) return null;
  const ruled = f.params.find((p) => p.rules?.length);
  if (ruled) return ruled.line;
  const s = f.body[0];
  if (!s) return null;
  return s.k === 'if' ? s.branches[0].line : s.line;
}

const CHECKS = {
  is: (a, b) => eq(a, b),
  'is not': (a, b) => !eq(a, b),
  'at least': (a, b) => compare('>=', a, b),
  'at most': (a, b) => compare('<=', a, b),
  'more than': (a, b) => compare('>', a, b),
  'less than': (a, b) => compare('<', a, b),
  nothing: (a) => a === null,
  'not nothing': (a) => a !== null,
  empty: (a) => eq(pyLen(a), 0n),
  positive: (a) => compare('>', a, 0n),
  negative: (a) => compare('<', a, 0n),
  zero: (a) => eq(a, 0n),
  between: (a, b) => compare('<=', b[0], a) && compare('<=', a, b[1]),
  in: (a, b) => contains(b, a),
  contains: (a, b) => contains(a, b),
};

// ── conversions and text helpers (thunder_runtime.py) ──────────────────────────────────────────────────────────

const NUMBER = /^[+-]?(\d[\d_]*)(\.\d+)?$/;

function toNumber(x) {
  if (isNumber(x)) return x;
  if (x instanceof Money) return x.amount;
  if (typeof x === 'string') {
    const s = pyStrip(x).replace(/,/g, '');
    if (NUMBER.test(s)) return s.includes('.') ? Dec.parse(s) : BigInt(s.replace(/_/g, ''));
  }
  throw ConversionFailed(`${describe(x)} is not a number.`);
}
function toWhole(x) {
  const n = toNumber(x);
  if (typeof n === 'bigint') return n;
  if (n.isIntegral()) return n.toBigInt();
  throw ConversionFailed(`${show(n)} is not a whole number.`);
}
function toMoney(x) {
  if (x instanceof Money) return x;
  if (typeof x === 'string') {
    let s = pyStrip(x).replace(/,/g, '');
    const negative = s.startsWith('-');
    s = s.replace(/^-+/, '').replace(/^\$+/, '');
    if (NUMBER.test(s)) return Money.of((negative ? '-' : '') + s);
    throw ConversionFailed(`${describe(x)} is not an amount of money.`);
  }
  return new Money(toDec(toNumber(x)));
}
function toYesNo(x) {
  if (typeof x === 'boolean') return x;
  if (typeof x === 'string' && ['yes', 'true'].includes(pyStrip(x).toLowerCase())) return true;
  if (typeof x === 'string' && ['no', 'false'].includes(pyStrip(x).toLowerCase())) return false;
  throw ConversionFailed(`${describe(x)} is not yes or no.`);
}
function toDate(x) {
  if (x instanceof PyDate) return x;
  const d = PyDate.parse(pyStrip(pyStr(x)));
  if (d) return d;
  throw ConversionFailed(`${describe(x)} is not a date (write it as YYYY-MM-DD).`);
}

function totalOf(items) {
  if (!items.length) return 0n;
  let result = items[0];
  for (const x of items.slice(1)) result = add(result, x);
  return result;
}
function textOf(v, what) {
  if (typeof v !== 'string') throw KindMismatch(`${what} needs text, but it is ${describe(v)}.`);
  return v;
}
function joined(items, sep) {
  sep = textOf(sep, '"joined with"');
  const out = [];
  pyIter(items).forEach((x, i) => {
    if (typeof x !== 'string') throw KindMismatch(`"joined with" joins text, but item ${i + 1} is ${describe(x)}. Turn it into text first.`);
    out.push(x);
  });
  return out.join(sep);
}
function splitAt(text, sep) {
  sep = textOf(sep, '"split at"');
  if (sep === '') throw KindMismatch('"split at" needs something to split at, not empty text.');
  return textOf(text, '"split at"').split(sep);
}
function replacing(text, old, nw) {
  old = textOf(old, '"replacing"');
  if (old === '') throw KindMismatch('"replacing" needs something to replace, not empty text.');
  const t = textOf(text, '"replacing"');
  return t.split(old).join(textOf(nw, '"replacing … with"'));
}
const PUNCT = new Set(Array.from(".,;:!?\"'()[]{}<>“”‘’…-"));
function stripPunct(w) {
  const a = Array.from(w);
  let i = 0, j = a.length;
  while (i < j && PUNCT.has(a[i])) i++;
  while (j > i && PUNCT.has(a[j - 1])) j--;
  return a.slice(i, j).join('');
}

// ── public API ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Run a program with the Thunder engine. `results` are compileCore results (each with .file, and in a project
 * .kind 'src' | 'test'); `entry` is the one to run. Returns { status, stdout, stderr }, the way `python main.py`
 * would end: status 0, or 1 after an error reported in Thunder words.
 */
export function runWithEngine({ entry, cwd = process.cwd() } = {}) {
  const uses = pythonModulesUsed([entry]);
  if (uses.length) return { status: 2, stdout: '', stderr: `${refusalText(uses)}\n`, refused: uses };
  // On this thread first (fast, no worker); only a program that nests calls deeper than this thread's stack allows
  // is run again on a worker with a deep stack. Running again is safe: the engine only collects output and reads.
  const r = runInProcess({ entry, cwd, deeper: true });
  return r.needsDeeperStack ? runSync({ entry, cwd }) : r;
}

/** The same, on the calling thread (its stack allows only a few hundred nested calls). */
export function runInProcess({ entry, cwd, deeper = false } = {}) {
  const uses = pythonModulesUsed([entry]);
  if (uses.length) return { status: 2, stdout: '', stderr: `${refusalText(uses)}\n`, refused: uses };
  const eng = new Engine({ cwd, deeper });
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

/** Run every Test block, the way run_tests.py does: one line per test, then the totals. */
export function testWithEngine({ results, cwd = process.cwd() } = {}) {
  const uses = pythonModulesUsed(results);
  if (uses.length) return { status: 2, stdout: '', stderr: `${refusalText(uses)}\n`, refused: uses };
  const r = testInProcess({ results, cwd, deeper: true });
  return r.needsDeeperStack ? runSync({ results, cwd, tests: true }) : r;
}

/** The same, on the calling thread. */
export function testInProcess({ results, cwd, deeper = false } = {}) {
  const uses = pythonModulesUsed(results);
  if (uses.length) return { status: 2, stdout: '', stderr: `${refusalText(uses)}\n`, refused: uses };
  const eng = new Engine({ cwd, deeper });
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

/**
 * Run a job on a worker thread with a large stack and wait for it: the program's results are copied to the
 * worker (structured clone keeps the shared references the checker made), and the answer comes back the same way.
 */
function runSync(job) {
  const shared = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(new URL('./engine-worker.mjs', import.meta.url), {
    workerData: { shared, port: port2, job }, transferList: [port2], resourceLimits: { stackSizeMb: 256 }, stdout: false, stderr: false,
  });
  try {
    while (Atomics.wait(shared, 0, 0, 1000) === 'timed-out') { if (!worker.threadId) break; }
    const msg = receiveMessageOnPort(port1);
    return msg ? msg.message : { status: 70, stdout: '', stderr: 'The Thunder engine stopped without an answer.\n' };
  } finally {
    worker.terminate();
    port1.close();
  }
}

export { ThunderErr, PyErr };
