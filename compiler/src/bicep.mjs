// A small Bicep reader, no library: a file is a list of declarations (`param`, `var`, `resource`, `module`,
// `output`, `targetScope`, …), each with its decorators (`@secure()`, `@description('…')`), its lines, and the comment
// above it. Values are parsed by infra-expr.mjs, including nested `resource` declarations inside a resource. A
// declaration Thunder cannot parse is kept as an error with its line and skipped, never guessed.
import { tokenize, lineIndex, Parser, ParseError } from './infra-expr.mjs';
import { docAbove } from './hcl.mjs';

/**
 * Parse Bicep source. Returns { decls, comments, errors }. Each decl:
 *   { kind: 'param' | 'var' | 'resource' | 'module' | 'output' | 'targetScope' | 'metadata' | 'type' | 'func' | 'import' | 'other',
 *     name, type?, typeRaw?, value?, existing?, decorators: [{ name, args }], line, endLine, doc? }
 * `type` is the resource type ('Microsoft.Storage/storageAccounts'), `apiVersion` its version, `path` a module's file.
 */
export function parseBicep(src) {
  const text = String(src ?? '').replace(/^﻿/, '');
  const lineAt = lineIndex(text);
  const { toks, comments } = tokenize(text, 'bicep', 0, text.length, lineAt);
  const p = new Parser(text, toks, 'bicep', lineAt, { objectKey: nestedResource });
  const decls = [], errors = [];
  let decorators = [];
  for (;;) {
    p.newlines();
    const t = p.peek();
    if (t.k === 'eof') break;
    const start = p.i;
    try {
      if (t.k === 'p' && t.v === '@') { decorators.push(decorator(p)); continue; }
      const d = decl(p);
      if (decorators.length) { d.decorators = decorators; d.line = Math.min(d.line, decorators[0].line); }
      const doc = docAbove(comments, d.line) || '';
      if (doc) d.doc = doc;
      decls.push(d);
      decorators = [];
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      errors.push({ line: e.line, why: e.why });
      p.i = resync(toks, start);
      decorators = [];
    }
  }
  return { decls, comments, errors, lineAt, src: text };
}

function resync(toks, i) {
  let depth = 0;
  for (i++; i < toks.length; i++) {
    const t = toks[i];
    if (t.k === 'eof') return i;
    if (t.k === 'p' && (t.v === '{' || t.v === '[' || t.v === '(')) depth++;
    else if (t.k === 'p' && (t.v === '}' || t.v === ']' || t.v === ')')) depth--;
    else if (t.k === 'nl' && depth <= 0) return i + 1;
  }
  return i;
}

function decorator(p) {
  const at = p.next();
  const x = p.postfix(p.primary());
  const name = x.t === 'call' ? x.name.replace(/^sys\./, '') : x.t === 'ref' ? x.path.join('.').replace(/^sys\./, '') : 'decorator';
  return { name, args: x.t === 'call' ? x.args : [], line: p.lineOf(at) };
}

/** A resource type string 'Microsoft.X/y@2023-01-01' split into its type and version. */
export function splitType(s) {
  const v = String(s ?? '');
  const at = v.lastIndexOf('@');
  return at > 0 ? { type: v.slice(0, at), apiVersion: v.slice(at + 1) } : { type: v, apiVersion: null };
}

/** Skip a type annotation (`string`, `'a' | 'b'`, `{ … }`, `string[]`, `resource 'x'`) up to `=` or the end of the line. */
function typeText(p) {
  const s = p.peek().s;
  let depth = 0, e = s;
  for (;;) {
    const t = p.toks[p.i];
    if (!t || t.k === 'eof') break;
    if (depth === 0 && t.k === 'p' && t.v === '=') break;
    if (depth === 0 && t.k === 'nl') {
      // A union type may go on over several lines, each starting with `|`.
      let k = p.i;
      while (p.toks[k]?.k === 'nl') k++;
      if (p.toks[k]?.k === 'p' && p.toks[k].v === '|') { p.i = k; continue; }
      break;
    }
    if (t.k === 'p' && (t.v === '{' || t.v === '[' || t.v === '(')) depth++;
    if (t.k === 'p' && (t.v === '}' || t.v === ']' || t.v === ')')) depth--;
    e = t.e; p.i++;
  }
  return p.src.slice(s, e).trim();
}

function restOfStatement(p) {
  typeText(p);
  if (p.toks[p.i]?.k === 'p' && p.toks[p.i].v === '=') { p.i++; typeText(p); }
}

function resourceDecl(p, kw, line) {
  const name = p.next();
  if (name.k !== 'id') throw new ParseError(`Expected the ${kw}'s name`, line);
  const ty = p.next();
  if (ty.k !== 'str') throw new ParseError(`Expected the ${kw === 'module' ? "module's file" : 'resource type'} after ${name.v}`, line);
  const tyNode = p.string(ty);
  let existing = false;
  if (p.isId('existing')) { p.next(); existing = true; }
  p.expect('=');
  const value = p.expr();
  const base = { kind: kw, name: name.v, value, line, endLine: p.lineAt(Math.max(value.s, value.e - 1)), decorators: [] };
  if (kw === 'module') return { ...base, path: tyNode.v ?? p.src.slice(ty.s + 1, ty.e - 1) };
  const { type, apiVersion } = splitType(tyNode.v ?? '');
  return { ...base, type, apiVersion, ...(existing ? { existing: true } : {}) };
}

function decl(p) {
  return p.withNl(false, () => {
    const t = p.next();
    const line = p.lineOf(t);
    if (t.k !== 'id') throw new ParseError(`Expected a declaration, found "${p.src.slice(t.s, t.e).slice(0, 20)}"`, line);
    const end = (value) => p.lineAt(Math.max(value.s, value.e - 1));
    switch (t.v) {
      case 'targetScope': { p.expect('='); const value = p.expr(); return { kind: 'targetScope', name: 'targetScope', value, line, endLine: end(value), decorators: [] }; }
      case 'param': {
        const name = p.next().v;
        const typeRaw = typeText(p);
        let value = null;
        if (p.is('=')) { p.next(); value = p.expr(); }
        return { kind: 'param', name, typeRaw, value, line, endLine: value ? end(value) : line, decorators: [] };
      }
      case 'var': case 'metadata': { const name = p.next().v; const typeRaw = p.is('=') ? '' : typeText(p); p.expect('='); const value = p.expr(); return { kind: t.v, name, ...(typeRaw ? { typeRaw } : {}), value, line, endLine: end(value), decorators: [] }; }
      case 'output': {
        const name = p.next().v;
        let typeRaw;
        if (p.isId('resource')) { p.next(); typeRaw = `resource ${p.src.slice(p.peek().s, p.peek().e)}`; p.next(); }
        else typeRaw = typeText(p);
        p.expect('=');
        const value = p.expr();
        return { kind: 'output', name, typeRaw, value, line, endLine: end(value), decorators: [] };
      }
      case 'resource': case 'module': return resourceDecl(p, t.v, line);
      case 'type': case 'func': case 'import': case 'using': case 'extension': case 'provider': case 'extends': case 'assert': {
        const nm = p.peek();
        restOfStatement(p);
        return { kind: t.v === 'type' || t.v === 'func' ? t.v : t.v === 'assert' ? 'other' : 'import', name: nm.k === 'id' ? nm.v : p.src.slice(nm.s, nm.e), line, endLine: p.lineAt(Math.max(0, p.toks[Math.max(0, p.i - 1)].e - 1)), decorators: [] };
      }
      default: throw new ParseError(`"${t.v}" is not a Bicep declaration Thunder reads`, line);
    }
  });
}

/** Inside a resource's body: `resource child 'type' = { … }` is a nested resource. */
function nestedResource(p, kt) {
  // Decorators on a nested resource (`@batchSize(1)`) come first.
  if (kt.k === 'p' && kt.v === '@') {
    const decorators = [];
    while (p.is('@')) { decorators.push(decorator(p)); p.newlines(); }
    const r = nestedResource(p, p.peek());
    if (!r) throw new ParseError('Expected a resource after its decorators', decorators[0].line);
    r.nested.decorators = decorators;
    return r;
  }
  if (kt.k !== 'id' || kt.v !== 'resource') return null;
  const nx = p.peek(1);
  if (nx.k !== 'id') return null;
  p.next();
  const line = p.lineOf(kt);
  const d = resourceDecl(p, 'resource', line);
  return { key: 'resource', nested: d, value: d.value, line };
}
