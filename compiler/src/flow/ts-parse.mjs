// A small TypeScript / JavaScript parser for access-flow analysis (src/flow/access.mjs).
//
// It covers what web handlers are written with (statements, expressions, functions, classes, objects, destructuring,
// async/await, optional chaining, template literals) and skips type annotations, generics, `as`/`satisfies`, and
// type-only declarations. It is not a full TypeScript parser: when it meets something it cannot parse it throws a
// ParseError with the line, and the caller says "Thunder cannot tell" for that file instead of guessing.
//
// Dependency-free and browser-safe, like the rest of the reader.

export class ParseError extends Error {
  constructor(message, line) { super(message); this.line = line; }
}

// ── Tokens ───────────────────────────────────────────────────────────────────────────────────────────────────────

const PUNCT = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>',
  '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '?', ':', '=', '.', '@', '#',
];
const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/** Tokens: { t: 'id'|'num'|'str'|'tpl'|'re'|'p', v, line, nl (a line break before it) }. Templates keep their parts. */
export function tokenize(src) {
  const out = [];
  let i = 0, line = 1, nl = false;
  const n = src.length;
  const prevAllowsRegex = () => {
    const p = out[out.length - 1];
    if (!p) return true;
    if (p.t === 'num' || p.t === 'str' || p.t === 'tpl' || p.t === 're') return false;
    if (p.t === 'id') return KEYWORDS_BEFORE_REGEX.has(p.v);
    return !(p.v === ')' || p.v === ']' || p.v === '}');
  };
  const push = (t, v, extra) => { out.push({ t, v, line, nl, ...extra }); nl = false; };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; nl = true; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '﻿' || c === ' ') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') { line++; nl = true; }
      i = stop;
      continue;
    }
    if (/[A-Za-z_$À-￿]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$À-￿]/.test(src[j])) j++;
      push('id', src.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(src[j])) { if ((src[j] === 'e' || src[j] === 'E') && (src[j + 1] === '-' || src[j + 1] === '+')) j++; j++; }
      push('num', src.slice(i, j));
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, v = '';
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') { v += src[j + 1] ?? ''; j += 2; continue; }
        if (src[j] === '\n') break;
        v += src[j++];
      }
      push('str', v);
      i = j + 1;
      continue;
    }
    if (c === '`') {
      const startLine = line;
      const parts = [];
      let j = i + 1, text = '';
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') { text += src[j + 1] ?? ''; j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') {
          // Find the matching }, minding nested braces, strings and templates.
          let depth = 1, k = j + 2;
          while (k < n && depth) {
            const ch = src[k];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            else if (ch === '"' || ch === "'" || ch === '`') {
              const q = ch; k++;
              while (k < n && src[k] !== q) { if (src[k] === '\\') k++; k++; }
            } else if (ch === '\n') line++;
            if (depth) k++;
          }
          parts.push({ text });
          parts.push({ expr: src.slice(j + 2, k), line });
          text = '';
          j = k + 1;
          continue;
        }
        if (src[j] === '\n') line++;
        text += src[j++];
      }
      parts.push({ text });
      out.push({ t: 'tpl', v: parts, line: startLine, nl });
      nl = false;
      i = j + 1;
      continue;
    }
    if (c === '/' && prevAllowsRegex()) {
      let j = i + 1, inClass = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(src[j])) j++;
      push('re', src.slice(i, j));
      i = j;
      continue;
    }
    const p = PUNCT.find((x) => src.startsWith(x, i));
    if (!p) throw new ParseError(`an unexpected character "${c}"`, line);
    push('p', p);
    i += p.length;
  }
  out.push({ t: 'eof', v: '', line, nl: true });
  return out;
}

// ── Parser ───────────────────────────────────────────────────────────────────────────────────────────────────────
//
// Nodes are plain objects with `type` and `line`. Statement types: Var, Function, Class, Return, If, Throw, Try,
// Block, Expr, Loop, Switch, Import, Export (wrapping), Empty. Expression types: Id, Lit, Tpl, Member, Call, New,
// Arrow (also function expressions), Obj, Arr, Bin, Logic, Unary, Assign, Cond, Await, Seq, Spread, Tagged, This.

export function parse(src) {
  const toks = tokenize(src);
  let pos = 0;
  const peek = (k = 0) => toks[Math.min(pos + k, toks.length - 1)];
  const at = (v, k = 0) => { const t = peek(k); return (t.t === 'p' || t.t === 'id') && t.v === v; };
  const next = () => { if (pos >= toks.length - 1 && toks[pos]?.t === 'eof') throw new ParseError('the file ends in the middle of something', toks[toks.length - 1].line); return toks[pos++]; };
  const fail = (what) => { throw new ParseError(`${what} (found "${typeof peek().v === 'string' ? peek().v : 'a template'}")`, peek().line); };
  const eat = (v) => { if (!at(v)) fail(`expected "${v}"`); return next(); };
  const opt = (v) => (at(v) ? next() : null);
  const semi = () => { if (opt(';')) return; if (at('}') || peek().t === 'eof' || peek().nl) return; fail('expected the end of a statement'); };

  // Skips balanced brackets starting at an opener.
  const skipBalanced = () => {
    const open = next().v;
    const close = { '(': ')', '[': ']', '{': '}', '<': '>' }[open];
    let depth = 1;
    while (depth && peek().t !== 'eof') {
      const t = next();
      if (t.t !== 'p') continue;
      if (t.v === open) depth++;
      else if (t.v === close) depth--;
      else if (open === '<' && t.v === '>>') depth -= 2;
      else if (open === '<' && t.v === '>>>') depth -= 3;
      else if (open === '<' && t.v === '=>') { /* arrow type inside generics */ }
    }
  };

  // A type: skipped. Stops at a token that cannot continue a type, at depth 0.
  const skipType = (stops = [',', ')', '=', ';', '{', '}', ']', '=>']) => {
    let guard = 0;
    const stopSet = new Set(stops);
    // Arrow function types: (a: T) => U
    for (;;) {
      if (++guard > 10000) fail('a type Thunder cannot follow');
      const t = peek();
      if (t.t === 'eof') return;
      if (t.t === 'p' && (t.v === '(' || t.v === '[' || t.v === '{' || t.v === '<')) {
        if (t.v === '{' && stopSet.has('{') && guard > 1) return;
        skipBalanced();
        // (a: T) => U is a function type, unless => is where this type must stop (an arrow's return type).
        if (at('=>') && t.v === '(' && !stopSet.has('=>')) { next(); continue; }
        continue;
      }
      if (t.t === 'p' && (t.v === '|' || t.v === '&' || t.v === '.' || t.v === '?' || t.v === ':' && !stopSet.has(':'))) {
        if (t.v === '?' && stopSet.has('?')) return;
        next(); continue;
      }
      if (t.t === 'p' && t.v === '=>' ) { if (stopSet.has('=>')) return; next(); continue; }
      if (t.t === 'id' || t.t === 'str' || t.t === 'num' || t.t === 'tpl') {
        if (t.t === 'id' && guard > 1 && t.nl && !['extends', 'keyof', 'typeof', 'infer', 'is', 'readonly', 'unique'].includes(t.v)) {
          const prev = toks[pos - 1];
          if (!(prev.t === 'p' && (prev.v === '|' || prev.v === '&' || prev.v === ':' || prev.v === '.' || prev.v === '=>' || prev.v === '?'))) return;
        }
        next(); continue;
      }
      if (t.t === 'p' && t.v === '-' && peek(1).t === 'num') { next(); next(); continue; }
      if (stopSet.has(t.v)) return;
      return;
    }
  };

  // ── Statements ──
  const program = () => {
    const body = [];
    while (peek().t !== 'eof') { const s = statement(); if (s) body.push(s); }
    return { type: 'Program', body };
  };

  const block = () => {
    const line = eat('{').line;
    const body = [];
    while (!at('}')) { if (peek().t === 'eof') fail('expected "}"'); const s = statement(); if (s) body.push(s); }
    next();
    return { type: 'Block', body, line };
  };

  const isTypeDecl = () => (at('type') && peek(1).t === 'id' && (at('=', 2) || at('<', 2))) || (at('interface') && peek(1).t === 'id')
    || (at('declare') && !peek(1).nl) || (at('enum') && peek(1).t === 'id') || (at('const') && at('enum', 1))
    || (at('abstract') && at('class', 1)) || (at('namespace') && peek(1).t === 'id' && at('{', 2)) || (at('module') && peek(1).t === 'str');

  const skipTypeDecl = () => {
    const line = peek().line;
    if (at('abstract')) { next(); return classDecl(); }
    if (at('declare')) { next(); }
    if (at('const')) next();
    if (at('enum')) { next(); next(); skipBalanced(); return { type: 'Empty', line }; }
    if (at('interface')) { next(); next(); if (at('<')) skipBalanced(); while (!at('{')) next(); skipBalanced(); return { type: 'Empty', line }; }
    if (at('namespace') || at('module')) { next(); next(); skipBalanced(); return { type: 'Empty', line }; }
    if (at('type')) { next(); next(); if (at('<')) skipBalanced(); eat('='); skipType([';']); semi(); return { type: 'Empty', line }; }
    // declare function / const / class …: skip to the end of the statement.
    while (!at(';') && !peek().nl && peek().t !== 'eof') { if (at('{') || at('(')) skipBalanced(); else next(); }
    opt(';');
    return { type: 'Empty', line };
  };

  const decorators = () => { while (at('@')) { next(); next(); while (at('.')) { next(); next(); } if (at('(')) skipBalanced(); } };

  const statement = () => {
    const t = peek();
    const line = t.line;
    decorators();
    if (at(';')) { next(); return null; }
    if (at('{')) return block();
    if (isTypeDecl()) return skipTypeDecl();
    if (at('import') && !at('(', 1) && !at('.', 1)) return importDecl();
    if (at('export')) return exportDecl();
    if (at('const') || at('let') || at('var') || (at('using') && peek(1).t === 'id' && !peek(1).nl)) { const d = varDecl(); semi(); return d; }
    if (at('function') || (at('async') && at('function', 1) && !peek(1).nl)) return functionDecl();
    if (at('class')) return classDecl();
    if (at('return')) { next(); const arg = (at(';') || at('}') || peek().nl || peek().t === 'eof') ? null : expression(); semi(); return { type: 'Return', arg, line }; }
    if (at('throw')) { next(); const arg = expression(); semi(); return { type: 'Throw', arg, line }; }
    if (at('if')) {
      next(); eat('('); const test = expression(); eat(')');
      const cons = statement();
      const alt = opt('else') ? statement() : null;
      return { type: 'If', test, cons, alt, line };
    }
    if (at('try')) {
      next(); const body = block();
      let param = null, handler = null, finalizer = null;
      if (opt('catch')) { if (opt('(')) { param = pattern(); if (opt(':')) skipType([')']); eat(')'); } handler = block(); }
      if (opt('finally')) finalizer = block();
      return { type: 'Try', body, param, handler, finalizer, line };
    }
    if (at('for')) {
      next(); opt('await'); eat('(');
      let init = null, iter = null, kind = 'for';
      if (at('const') || at('let') || at('var')) {
        const k = next().v;
        const id = pattern();
        if (opt(':')) skipType([';', '=', 'of', 'in']);
        if (at('of') || at('in')) { kind = next().v; iter = expression(); init = { type: 'Var', kind: k, decls: [{ id, init: null, line }], line }; }
        else {
          const decls = [{ id, init: opt('=') ? assign() : null, line }];
          while (opt(',')) { const id2 = pattern(); decls.push({ id: id2, init: opt('=') ? assign() : null, line }); }
          init = { type: 'Var', kind: k, decls, line };
        }
      } else if (!at(';')) {
        const e = expression(true);
        if (at('of') || at('in')) { kind = next().v; iter = expression(); init = { type: 'Expr', expr: e, line }; } else init = { type: 'Expr', expr: e, line };
      }
      let test = null, update = null;
      if (kind === 'for') { eat(';'); if (!at(';')) test = expression(); eat(';'); if (!at(')')) update = expression(); }
      eat(')');
      const body = statement();
      return { type: 'Loop', kind, init, iter, test, update, body, line };
    }
    if (at('while')) { next(); eat('('); const test = expression(); eat(')'); const body = statement(); return { type: 'Loop', kind: 'while', test, body, line }; }
    if (at('do')) { next(); const body = statement(); eat('while'); eat('('); const test = expression(); eat(')'); opt(';'); return { type: 'Loop', kind: 'do', test, body, line }; }
    if (at('switch')) {
      next(); eat('('); const disc = expression(); eat(')'); eat('{');
      const cases = [];
      while (!at('}')) {
        let test = null;
        if (opt('default')) eat(':'); else { eat('case'); test = expression(); eat(':'); }
        const body = [];
        while (!at('case') && !at('default') && !at('}')) { const s = statement(); if (s) body.push(s); }
        cases.push({ test, body });
      }
      next();
      return { type: 'Switch', disc, cases, line };
    }
    if ((at('break') || at('continue'))) { next(); if (peek().t === 'id' && !peek().nl) next(); semi(); return { type: 'Jump', line }; }
    if (t.t === 'id' && at(':', 1) && !['default', 'case'].includes(t.v)) { next(); next(); return statement(); }
    const expr = expression();
    semi();
    return { type: 'Expr', expr, line };
  };

  const importDecl = () => {
    const line = next().line;
    if (at('type') && !at(',', 1) && !at('from', 1)) next();
    const names = [];
    if (peek().t === 'str') { next(); semi(); return { type: 'Import', from: null, names, line }; }
    if (peek().t === 'id' && !at('{') && !at('*')) { names.push({ imported: 'default', local: next().v }); opt(','); }
    if (opt('*')) { eat('as'); names.push({ imported: '*', local: next().v }); }
    if (opt('{')) {
      while (!at('}')) {
        if (at('type') && peek(1).t === 'id' && !at(',', 1) && !at('}', 1) && !at('as', 1)) next();
        const imported = next().v;
        const local = opt('as') ? next().v : imported;
        names.push({ imported, local });
        if (!opt(',')) break;
      }
      eat('}');
    }
    eat('from');
    const from = next().v;
    if (at('assert') || at('with')) { next(); skipBalanced(); }
    semi();
    return { type: 'Import', from, names, line };
  };

  const exportDecl = () => {
    const line = next().line;
    if (at('type') && (at('{', 1) || at('*', 1))) next();
    if (opt('default')) {
      if (at('function') || (at('async') && at('function', 1))) { const f = functionDecl(true); return { type: 'Export', decl: f, isDefault: true, line }; }
      if (at('class')) { const c = classDecl(true); return { type: 'Export', decl: c, isDefault: true, line }; }
      const expr = assign(); semi();
      return { type: 'Export', expr, isDefault: true, line };
    }
    if (at('{') || at('*')) {
      const names = [];
      if (opt('*')) { if (opt('as')) names.push({ local: '*', exported: next().v }); }
      else {
        next();
        while (!at('}')) { if (at('type') && peek(1).t === 'id' && !at(',', 1) && !at('}', 1)) next(); const local = next().v; const exported = opt('as') ? next().v : local; names.push({ local, exported }); if (!opt(',')) break; }
        eat('}');
      }
      const from = opt('from') ? next().v : null;
      semi();
      return { type: 'Export', names, from, line };
    }
    if (at('=')) { next(); assign(); semi(); return { type: 'Empty', line }; }
    const decl = statement();
    return { type: 'Export', decl, line };
  };

  const varDecl = () => {
    const line = peek().line;
    const kind = next().v;
    const decls = [];
    do {
      const dline = peek().line;
      const id = pattern();
      if (opt('!')) { /* definite assignment */ }
      if (opt(':')) skipType([',', '=', ';', '}']);
      const init = opt('=') ? assign() : null;
      decls.push({ id, init, line: dline });
    } while (opt(','));
    return { type: 'Var', kind, decls, line };
  };

  // Binding patterns: identifiers, { a, b: c, ...rest }, [a, , b], with defaults.
  const pattern = () => {
    const line = peek().line;
    if (at('{')) {
      next();
      const props = [];
      while (!at('}')) {
        if (opt('...')) { props.push({ rest: pattern() }); opt(','); continue; }
        let key;
        if (at('[')) { next(); key = { computed: expression() }; eat(']'); } else key = next().v;
        let value;
        if (opt(':')) value = pattern(); else value = { type: 'Id', name: typeof key === 'string' ? key : '?', line };
        if (opt('=')) value = { type: 'Default', target: value, value: assign(), line };
        props.push({ key, value });
        if (!opt(',')) break;
      }
      eat('}');
      return { type: 'ObjPat', props, line };
    }
    if (at('[')) {
      next();
      const elems = [];
      while (!at(']')) {
        if (at(',')) { next(); elems.push(null); continue; }
        if (opt('...')) { elems.push({ type: 'Rest', arg: pattern(), line }); opt(','); continue; }
        let p = pattern();
        if (opt('=')) p = { type: 'Default', target: p, value: assign(), line };
        elems.push(p);
        if (!opt(',')) break;
      }
      eat(']');
      return { type: 'ArrPat', elems, line };
    }
    const t = next();
    if (t.t !== 'id') { pos--; fail('expected a name'); }
    return { type: 'Id', name: t.v, line: t.line };
  };

  const params = () => {
    eat('(');
    const ps = [];
    while (!at(')')) {
      decorators();
      while (['public', 'private', 'protected', 'readonly', 'override'].includes(peek().v) && peek(1).t === 'id') next();
      if (opt('...')) { const p = pattern(); if (opt('?')) {} if (opt(':')) skipType([',', ')', '=']); ps.push({ type: 'Rest', arg: p }); opt(','); continue; }
      let p = pattern();
      opt('?');
      if (opt(':')) skipType([',', ')', '=']);
      if (opt('=')) p = { type: 'Default', target: p, value: assign(), line: p.line };
      ps.push(p);
      if (!opt(',')) break;
    }
    eat(')');
    return ps;
  };

  const functionBody = () => (at('{') ? block() : null);

  const functionDecl = (allowAnonymous = false) => {
    const line = peek().line;
    const isAsync = !!opt('async');
    eat('function');
    opt('*');
    let name = null;
    if (peek().t === 'id' && !at('(')) name = next().v;
    else if (!allowAnonymous) fail('expected a function name');
    if (at('<')) skipBalanced();
    const ps = params();
    if (opt(':')) skipType(['{', ';']);
    const body = functionBody();
    if (!body) { opt(';'); return { type: 'Empty', line }; }
    return { type: 'Function', name, params: ps, body, isAsync, line };
  };

  const classDecl = (allowAnonymous = false) => {
    const line = eat('class').line;
    let name = null;
    if (peek().t === 'id' && !at('extends') && !at('implements') && !at('{')) name = next().v;
    else if (!allowAnonymous) { /* class expressions */ }
    if (at('<')) skipBalanced();
    let superClass = null;
    if (opt('extends')) { superClass = postfix(primary()); if (at('<')) skipBalanced(); }
    if (opt('implements')) { while (!at('{')) next(); }
    eat('{');
    const members = [];
    while (!at('}')) {
      if (opt(';')) continue;
      decorators();
      let isStatic = false;
      const mline = peek().line;
      while (['public', 'private', 'protected', 'readonly', 'static', 'abstract', 'override', 'declare', 'accessor'].includes(peek().v) && !at('(', 1) && !at('=', 1) && !at(':', 1) && !at(';', 1) && !at('?', 1)) { if (next().v === 'static') isStatic = true; }
      if (at('static') && at('{', 1)) { next(); block(); continue; }
      const isAsync = at('async') && !at('(', 1) && !peek(1).nl ? !!next() : false;
      opt('*');
      let kind = 'method';
      if ((at('get') || at('set')) && !at('(', 1) && !at('=', 1) && !at(':', 1)) { kind = next().v; }
      let key;
      if (at('[')) { next(); expression(); eat(']'); key = '[computed]'; }
      else if (at('#')) { next(); key = '#' + next().v; }
      else key = next().v;
      opt('?'); opt('!');
      if (at('(') || at('<')) {
        if (at('<')) skipBalanced();
        const ps = params();
        if (opt(':')) skipType(['{', ';']);
        const body = functionBody();
        if (!body) { opt(';'); continue; }
        members.push({ kind, key, isStatic, fn: { type: 'Arrow', params: ps, body, isAsync, line: mline, isMethod: true, name: key }, line: mline });
      } else {
        if (opt(':')) skipType(['=', ';', '}']);
        const value = opt('=') ? assign() : null;
        semi();
        members.push({ kind: 'field', key, isStatic, value, line: mline });
      }
    }
    eat('}');
    return { type: 'Class', name, superClass, members, line };
  };

  // ── Expressions ──
  const expression = (noIn = false) => {
    const line = peek().line;
    const first = assign(noIn);
    if (!at(',')) return first;
    const list = [first];
    while (opt(',')) list.push(assign(noIn));
    return { type: 'Seq', list, line };
  };

  // Arrow function lookahead from "(" or "<": a balanced group followed by => (possibly after a return type).
  const isArrowAhead = () => {
    let k = pos;
    if (toks[k].v === 'async' && toks[k].t === 'id') k++;
    if (toks[k].t === 'p' && toks[k].v === '<') {
      let d = 0;
      for (; k < toks.length; k++) { if (toks[k].v === '<') d++; else if (toks[k].v === '>') { d--; if (!d) { k++; break; } } else if (toks[k].t === 'eof') return false; }
    }
    if (toks[k].t === 'id' && toks[k + 1]?.v === '=>') return true;
    if (!(toks[k].t === 'p' && toks[k].v === '(')) return false;
    let depth = 0;
    for (; k < toks.length; k++) {
      const t = toks[k];
      if (t.t !== 'p') continue;
      if (t.v === '(' || t.v === '[' || t.v === '{') depth++;
      else if (t.v === ')' || t.v === ']' || t.v === '}') { depth--; if (!depth) break; }
      if (t.t === 'eof') return false;
    }
    const after = toks[k + 1];
    if (!after) return false;
    if (after.t === 'p' && after.v === '=>') return true;
    if (after.t === 'p' && after.v === ':') {
      // A return type, then =>. Scan to => at depth 0 before a ; or a line that cannot be a type.
      let d = 0;
      for (let j = k + 2; j < toks.length && j < k + 200; j++) {
        const t = toks[j];
        if (t.t === 'p' && (t.v === '(' || t.v === '[' || t.v === '{' || t.v === '<')) d++;
        else if (t.t === 'p' && (t.v === ')' || t.v === ']' || t.v === '}' || t.v === '>')) { d--; if (d < 0) return false; }
        else if (t.t === 'p' && t.v === '=>' && d === 0) return true;
        else if (t.t === 'p' && (t.v === ';' || t.v === ',' || t.v === '=') && d === 0) return false;
        else if (t.t === 'eof') return false;
      }
    }
    return false;
  };

  const arrow = () => {
    const line = peek().line;
    const isAsync = at('async') && !at('=>', 1) ? !!next() : false;
    if (at('<')) skipBalanced();
    let ps;
    if (peek().t === 'id' && at('=>', 1)) ps = [{ type: 'Id', name: next().v, line }];
    else { ps = params(); if (opt(':')) skipType(['=>']); }
    eat('=>');
    const body = at('{') ? block() : assign();
    return { type: 'Arrow', params: ps, body, isAsync, line };
  };

  const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??=']);
  const assign = (noIn = false) => {
    if ((at('(') || at('<') || (peek().t === 'id' && at('=>', 1)) || (at('async') && (at('(', 1) || peek(1).t === 'id' || at('<', 1)))) && isArrowAhead()) return arrow();
    if (at('yield')) { const line = next().line; opt('*'); const arg = (at(')') || at(']') || at('}') || at(',') || at(';') || peek().nl) ? null : assign(noIn); return { type: 'Await', arg, line }; }
    const line = peek().line;
    const left = conditional(noIn);
    if (peek().t === 'p' && ASSIGN_OPS.has(peek().v)) {
      const op = next().v;
      const right = assign(noIn);
      return { type: 'Assign', op, left, right, line };
    }
    return left;
  };

  const conditional = (noIn) => {
    const line = peek().line;
    const test = binary(0, noIn);
    if (!at('?')) return test;
    next();
    const cons = assign();
    eat(':');
    const alt = assign(noIn);
    return { type: 'Cond', test, cons, alt, line };
  };

  const PREC = {
    '??': 1, '||': 2, '&&': 3, '|': 4, '^': 5, '&': 6, '==': 7, '!=': 7, '===': 7, '!==': 7,
    '<': 8, '>': 8, '<=': 8, '>=': 8, instanceof: 8, in: 8, '<<': 9, '>>': 9, '>>>': 9, '+': 10, '-': 10, '*': 11, '/': 11, '%': 11, '**': 12,
  };
  const binary = (minPrec, noIn) => {
    let left = unary();
    for (;;) {
      const t = peek();
      // `as` / `satisfies`: a type follows; the value is unchanged.
      if (t.t === 'id' && (t.v === 'as' || t.v === 'satisfies') && !t.nl) {
        next();
        if (at('const')) next(); else skipType([',', ')', ']', ';', '}', '=', '?', ':', '&&', '||', '??', '=>']);
        continue;
      }
      const op = (t.t === 'p' || (t.t === 'id' && (t.v === 'instanceof' || (t.v === 'in' && !noIn)))) ? t.v : null;
      const prec = op != null ? PREC[op] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      next();
      const right = binary(op === '**' ? prec : prec + 1, noIn);
      left = { type: op === '&&' || op === '||' || op === '??' ? 'Logic' : 'Bin', op, left, right, line: t.line };
    }
  };

  const unary = () => {
    const t = peek();
    if (t.t === 'p' && ['!', '-', '+', '~'].includes(t.v)) { next(); return { type: 'Unary', op: t.v, arg: unary(), line: t.line }; }
    if (t.t === 'p' && (t.v === '++' || t.v === '--')) { next(); return { type: 'Unary', op: t.v, arg: unary(), line: t.line }; }
    if (t.t === 'id' && (t.v === 'typeof' || t.v === 'void' || t.v === 'delete')) { next(); return { type: 'Unary', op: t.v, arg: unary(), line: t.line }; }
    if (t.t === 'id' && t.v === 'await' && !(at('(', 1) && false)) {
      const n2 = peek(1);
      if (!(n2.t === 'p' && [')', ']', '}', ',', ';', '=', '.'].includes(n2.v))) { next(); return { type: 'Await', arg: unary(), line: t.line }; }
    }
    if (t.t === 'p' && t.v === '<' && !isArrowAhead()) { skipBalanced(); return unary(); } // old-style type assertion <T>x
    return postfix(primary());
  };

  const args = () => {
    eat('(');
    const list = [];
    while (!at(')')) {
      if (opt('...')) list.push({ type: 'Spread', arg: assign(), line: peek().line });
      else list.push(assign());
      if (!opt(',')) break;
    }
    eat(')');
    return list;
  };

  // Generic call arguments: f<T>(x). Only when the <…> is followed by ( and holds type-like tokens.
  const genericCallAhead = () => {
    if (!at('<')) return false;
    let d = 0, k = pos;
    for (; k < toks.length && k < pos + 80; k++) {
      const t = toks[k];
      if (t.t === 'p' && t.v === '<') d++;
      else if (t.t === 'p' && t.v === '>') { d--; if (!d) break; }
      else if (t.t === 'p' && t.v === '>>') { d -= 2; if (d <= 0) break; }
      else if (t.t === 'p' && ![',', '.', '|', '&', '[', ']', '{', '}', ':', '?', '(', ')', '=>', ';'].includes(t.v)) return false;
      else if (t.t === 'eof') return false;
    }
    return toks[k + 1]?.t === 'p' && (toks[k + 1].v === '(' || toks[k + 1].v === '`');
  };

  const postfix = (expr) => {
    for (;;) {
      const t = peek();
      if (t.t === 'p' && t.v === '.') { next(); const name = at('#') ? (next(), '#' + next().v) : next().v; expr = { type: 'Member', object: expr, prop: name, line: t.line }; continue; }
      if (t.t === 'p' && t.v === '?.') {
        next();
        if (at('(')) { expr = { type: 'Call', callee: expr, args: args(), optional: true, line: t.line }; continue; }
        if (at('[')) { next(); const p = expression(); eat(']'); expr = { type: 'Member', object: expr, computed: p, prop: p.type === 'Lit' ? String(p.value) : null, optional: true, line: t.line }; continue; }
        expr = { type: 'Member', object: expr, prop: next().v, optional: true, line: t.line };
        continue;
      }
      if (t.t === 'p' && t.v === '[' && !t.nl) { next(); const p = expression(); eat(']'); expr = { type: 'Member', object: expr, computed: p, prop: p.type === 'Lit' ? String(p.value) : null, line: t.line }; continue; }
      if (t.t === 'p' && t.v === '(' ) { if (t.nl && false) break; expr = { type: 'Call', callee: expr, args: args(), line: t.line }; continue; }
      if (t.t === 'p' && t.v === '<' && genericCallAhead()) { skipBalanced(); continue; }
      if (t.t === 'tpl') { next(); expr = { type: 'Tagged', tag: expr, tpl: tplNode(t), line: t.line }; continue; }
      if (t.t === 'p' && t.v === '!' && !t.nl && !at('=', 1) && !at('==', 1)) { next(); continue; } // non-null assertion
      if (t.t === 'p' && (t.v === '++' || t.v === '--') && !t.nl) { next(); expr = { type: 'Unary', op: t.v, arg: expr, line: t.line }; continue; }
      return expr;
    }
  };

  const tplNode = (t) => {
    const parts = t.v.map((p) => {
      if (p.expr == null) return { text: p.text };
      let e;
      try { e = parseExpressionAt(p.expr, p.line); } catch { e = { type: 'Unknown', line: p.line }; }
      return { expr: e };
    });
    return { type: 'Tpl', parts, line: t.line };
  };

  const objectLiteral = () => {
    const line = eat('{').line;
    const props = [];
    while (!at('}')) {
      const pline = peek().line;
      if (opt('...')) { props.push({ spread: assign(), line: pline }); if (!opt(',')) break; continue; }
      let isAsync = false, kind = 'init';
      if (at('async') && !at(',', 1) && !at(':', 1) && !at('(', 1) && !at('}', 1)) { next(); isAsync = true; }
      opt('*');
      if ((at('get') || at('set')) && !at(',', 1) && !at(':', 1) && !at('(', 1) && !at('}', 1)) kind = next().v;
      let key, computed = null;
      if (at('[')) { next(); computed = assign(); eat(']'); key = computed.type === 'Lit' ? String(computed.value) : null; }
      else { const kt = next(); key = kt.t === 'num' ? kt.v : kt.v; }
      if (at('(') || at('<')) {
        if (at('<')) skipBalanced();
        const ps = params();
        if (opt(':')) skipType(['{']);
        const body = block();
        props.push({ key, value: { type: 'Arrow', params: ps, body, isAsync, line: pline, isMethod: true, name: key }, method: true, kind, line: pline });
      } else if (opt(':')) props.push({ key, computed, value: assign(), line: pline });
      else if (at('=')) { next(); props.push({ key, value: { type: 'Id', name: key, line: pline }, shorthand: true, line: pline, dflt: assign() }); }
      else props.push({ key, value: { type: 'Id', name: key, line: pline }, shorthand: true, line: pline });
      if (!opt(',')) break;
    }
    eat('}');
    return { type: 'Obj', props, line };
  };

  const primary = () => {
    const t = peek();
    const line = t.line;
    if (t.t === 'num') { next(); return { type: 'Lit', value: Number(t.v.replace(/_/g, '')), raw: t.v, line }; }
    if (t.t === 'str') { next(); return { type: 'Lit', value: t.v, line }; }
    if (t.t === 'tpl') { next(); return tplNode(t); }
    if (t.t === 're') { next(); return { type: 'Lit', value: t.v, regex: true, line }; }
    if (t.t === 'p') {
      if (t.v === '(') { next(); const e = expression(); eat(')'); return { ...e, paren: true }; }
      if (t.v === '[') {
        next();
        const elems = [];
        while (!at(']')) {
          if (at(',')) { next(); elems.push(null); continue; }
          if (opt('...')) elems.push({ type: 'Spread', arg: assign(), line }); else elems.push(assign());
          if (!opt(',')) break;
        }
        eat(']');
        return { type: 'Arr', elems, line };
      }
      if (t.v === '{') return objectLiteral();
      if (t.v === '#') { next(); next(); return { type: 'Id', name: '#private', line }; }
      if (t.v === '@') { decorators(); return primary(); }
      fail('an expression Thunder cannot read');
    }
    if (t.t === 'id') {
      if (t.v === 'function' || (t.v === 'async' && at('function', 1))) {
        const f = functionDecl(true);
        return { type: 'Arrow', params: f.params, body: f.body, isAsync: f.isAsync, line, name: f.name };
      }
      if (t.v === 'class') { const c = classDecl(true); return { ...c, type: 'ClassExpr' }; }
      if (t.v === 'new') {
        next();
        if (at('.')) { next(); next(); return { type: 'Id', name: 'new.target', line }; }
        let callee = primary();
        while (at('.') || at('[')) {
          if (opt('.')) callee = { type: 'Member', object: callee, prop: next().v, line };
          else { next(); const p = expression(); eat(']'); callee = { type: 'Member', object: callee, computed: p, line }; }
        }
        if (at('<') && genericCallAhead()) skipBalanced();
        const a = at('(') ? args() : [];
        return { type: 'New', callee, args: a, line };
      }
      if (t.v === 'this') { next(); return { type: 'This', line }; }
      if (t.v === 'super') { next(); return { type: 'Id', name: 'super', line }; }
      if (t.v === 'true' || t.v === 'false') { next(); return { type: 'Lit', value: t.v === 'true', line }; }
      if (t.v === 'null') { next(); return { type: 'Lit', value: null, line }; }
      if (t.v === 'undefined') { next(); return { type: 'Lit', value: undefined, line }; }
      if (t.v === 'import' && at('(', 1)) { next(); const a = args(); return { type: 'Call', callee: { type: 'Id', name: 'import', line }, args: a, line }; }
      if (t.v === 'import' && at('.', 1)) { next(); next(); next(); return { type: 'Id', name: 'import.meta', line }; }
      next();
      return { type: 'Id', name: t.v, line };
    }
    fail('an expression Thunder cannot read');
  };

  return { program, expressionOnly: () => { const e = expression(); return e; } };
}

function parseExpressionAt(src, line) {
  const p = parse(src);
  const e = p.expressionOnly();
  const shift = (n) => {
    if (!n || typeof n !== 'object') return;
    if (typeof n.line === 'number') n.line += line - 1;
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(shift);
      else if (v && typeof v === 'object') shift(v);
    }
  };
  shift(e);
  return e;
}

/** Parse a whole file into { type: 'Program', body }. Throws ParseError when it cannot. */
export function parseProgram(src) {
  return parse(src).program();
}
