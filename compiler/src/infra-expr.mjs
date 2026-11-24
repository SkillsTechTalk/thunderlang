// The expression language shared by Terraform (HCL) and Bicep, read without any library: a tokenizer that walks the
// text one character at a time (strings, heredocs, and `${ … }` inside them are matched by counting, never by a
// regex that can backtrack), and a small precedence parser. Both readers get the same node shapes, so the words for
// a value ("worked out when it is applied", "the setting location") are decided once. Browser-safe, deterministic.
//
// Nodes: { t, s, e, line } plus
//   str   { v, template, parts }      parts: strings and nodes (the `${ … }` inside a template)
//   num   { v }   bool { v }   null
//   list  { items }                    obj  { entries: [{ key, keyNode?, value, line }] }
//   ref   { path: ['azurerm_storage_account', 'main', 'id'], index: [nodes] }   (a.b[0].c, a.*.b, a::b)
//   call  { name, args }               get  { obj, path }   (a call or a bracket followed by .x)
//   unary { op, x }   bin { op, a, b }   cond { test, yes, no }
//   for   { kind: 'list' | 'obj', vars, coll, key?, value, when? }   if { test, body } (Bicep)
//   lambda { vars, body }   spread { x }   other { why }

export class ParseError extends Error {
  constructor(message, line) { super(`${message} (line ${line})`); this.line = line; this.why = message; }
}

/** A function from a character offset to its 1-based line. */
export function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return (off) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
}

const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isDigit = (c) => c >= '0' && c <= '9';
const isIdChar = (c, hcl) => isIdStart(c) || isDigit(c) || (hcl && c === '-');
const PUNCT3 = ['...'];
const PUNCT2 = ['==', '!=', '<=', '>=', '&&', '||', '=>', '::', '??', '=~', '!~'];

/** End offset of a quoted string that starts at `i` (HCL `"…"` or Bicep `'…'`), skipping `${ … }` inside it. */
export function scanString(src, i, dialect) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (c === q) return j + 1;
    if (c === '\n' && dialect === 'hcl') return j; // an unclosed string ends at the line (HCL strings are one line)
    if (dialect === 'hcl' && (c === '$' || c === '%') && src[j + 1] === c && src[j + 2] === '{') { j += 3; continue; }
    if ((c === '$' || (c === '%' && dialect === 'hcl')) && src[j + 1] === '{') { j = scanInterp(src, j + 2, dialect); continue; }
    j++;
  }
  return j;
}

/** Offset just past the `}` that closes an interpolation whose body starts at `j`. */
export function scanInterp(src, j, dialect) {
  let depth = 1;
  const q = dialect === 'hcl' ? '"' : "'";
  while (j < src.length) {
    const c = src[j];
    if (c === q) { j = scanString(src, j, dialect); continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return j + 1; }
    j++;
  }
  return j;
}

/**
 * Tokens of `src` between `from` and `to`. Kinds: id, num, str, heredoc, p (punctuation), nl, and comments are kept
 * aside in `comments` ([{ line, endLine, text }]).
 */
export function tokenize(src, dialect, from = 0, to = src.length, lineAt = lineIndex(src)) {
  const hcl = dialect === 'hcl';
  const toks = [], comments = [];
  let i = from;
  while (i < to) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '﻿') { i++; continue; }
    if (c === '\n') { toks.push({ k: 'nl', v: '\n', s: i, e: i + 1 }); i++; continue; }
    // `#` is a comment in HCL; in Bicep it starts a pragma line (#disable-next-line), read the same way.
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      let j = i;
      while (j < to && src[j] !== '\n') j++;
      comments.push({ line: lineAt(i), endLine: lineAt(i), text: src.slice(i, j).replace(/^(#|\/\/)\s?/, '').trim(), s: i });
      i = j; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2);
      if (j < 0 || j > to) j = to - 2;
      comments.push({ line: lineAt(i), endLine: lineAt(j), text: src.slice(i + 2, j).replace(/^\s*\*+/gm, '').trim(), s: i });
      i = j + 2; continue;
    }
    if (hcl && c === '"') { const e = scanString(src, i, dialect); toks.push({ k: 'str', s: i, e }); i = e; continue; }
    if (!hcl && c === "'") {
      if (src.startsWith("'''", i)) { let e = src.indexOf("'''", i + 3); e = e < 0 ? to : e + 3; toks.push({ k: 'str', multi: true, s: i, e }); i = e; continue; }
      const e = scanString(src, i, dialect); toks.push({ k: 'str', s: i, e }); i = e; continue;
    }
    if (hcl && c === '<' && src[i + 1] === '<' && (src[i + 2] === '-' || isIdStart(src[i + 2] ?? ''))) {
      // A heredoc: <<EOF or <<-EOF, its body until a line that is only the marker.
      let j = i + 2;
      const strip = src[j] === '-';
      if (strip) j++;
      const ms = j;
      while (j < to && isIdChar(src[j], true)) j++;
      const marker = src.slice(ms, j);
      let nl = src.indexOf('\n', j);
      if (nl < 0) nl = to;
      const bodyStart = nl + 1;
      let k = bodyStart, end = to, bodyEnd = to;
      while (k < to) {
        let le = src.indexOf('\n', k);
        if (le < 0 || le > to) le = to;
        if (src.slice(k, le).trim() === marker) { bodyEnd = k; end = le; break; }
        k = le + 1;
      }
      toks.push({ k: 'heredoc', s: i, e: end, bodyStart, bodyEnd: Math.max(bodyStart, bodyEnd), strip });
      i = end; continue;
    }
    if (isDigit(c)) {
      let j = i;
      while (j < to && (isDigit(src[j]) || src[j] === '.' || ((src[j] === 'e' || src[j] === 'E') && /[\d+-]/.test(src[j + 1] ?? '')) || ((src[j] === '+' || src[j] === '-') && /[eE]/.test(src[j - 1])))) {
        if (src[j] === '.' && !isDigit(src[j + 1] ?? '')) break;
        j++;
      }
      toks.push({ k: 'num', v: src.slice(i, j), s: i, e: j }); i = j; continue;
    }
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < to && isIdChar(src[j], hcl)) j++;
      toks.push({ k: 'id', v: src.slice(i, j), s: i, e: j }); i = j; continue;
    }
    const three = src.slice(i, i + 3), two = src.slice(i, i + 2);
    const p = PUNCT3.includes(three) ? three : PUNCT2.includes(two) ? two : c;
    toks.push({ k: 'p', v: p, s: i, e: i + p.length });
    i += p.length;
  }
  toks.push({ k: 'eof', v: '', s: to, e: to });
  return { toks, comments };
}

const BIN = { '??': 1, '||': 2, '&&': 3, '==': 4, '!=': 4, '=~': 4, '!~': 4, '<': 5, '>': 5, '<=': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7 };

/** A parser over tokens. `hooks.objectKey(parser, tok)` may read a keyword inside an object (Bicep's nested resources). */
export class Parser {
  constructor(src, toks, dialect, lineAt, hooks = {}) {
    this.src = src; this.toks = toks; this.i = 0; this.dialect = dialect; this.lineAt = lineAt; this.hooks = hooks;
    this.skipNl = [false];
  }
  get hcl() { return this.dialect === 'hcl'; }
  raw(t = this.toks[this.i]) { return t; }
  peek(n = 0) {
    let i = this.i;
    const skip = this.skipNl.at(-1);
    for (let k = 0; ; i++) {
      const t = this.toks[i];
      if (!t) return this.toks.at(-1);
      if (t.k === 'nl' && skip) continue;
      if (k === n) return t;
      k++;
    }
  }
  next() {
    const skip = this.skipNl.at(-1);
    while (skip && this.toks[this.i]?.k === 'nl') this.i++;
    const t = this.toks[this.i] ?? this.toks.at(-1);
    if (t.k !== 'eof') this.i++;
    return t;
  }
  is(v, n = 0) { const t = this.peek(n); return t.k === 'p' && t.v === v; }
  isId(v, n = 0) { const t = this.peek(n); return t.k === 'id' && (v == null || t.v === v); }
  expect(v) {
    const t = this.next();
    if (t.k !== 'p' || t.v !== v) throw new ParseError(`Expected "${v}" but found ${t.k === 'eof' ? 'the end of the file' : t.k === 'nl' ? 'a new line' : `"${this.src.slice(t.s, t.e).slice(0, 20)}"`}`, this.lineAt(t.s));
    return t;
  }
  newlines() { while (this.toks[this.i]?.k === 'nl') this.i++; }
  lineOf(t) { return this.lineAt(t.s); }
  node(t, s, e, extra) { return { t, s, e, line: this.lineAt(s), ...extra }; }
  withNl(skip, fn) { this.skipNl.push(skip); try { return fn(); } finally { this.skipNl.pop(); } }
  last() { let i = this.i - 1; while (i > 0 && this.toks[i].k === 'nl') i--; return this.toks[Math.max(0, i)]; }

  expr() {
    const s = this.peek().s;
    // Bicep lambdas: x => …, (x, y) => …
    if (!this.hcl && this.isId() && this.is('=>', 1)) { const v = this.next().v; this.next(); const body = this.expr(); return this.node('lambda', s, body.e, { vars: [v], body }); }
    if (!this.hcl && this.is('(') && this.lambdaAhead()) {
      this.next(); const vars = [];
      while (!this.is(')')) { vars.push(this.next().v); if (this.is(',')) this.next(); }
      this.next(); this.expect('=>'); const body = this.expr();
      return this.node('lambda', s, body.e, { vars, body });
    }
    const test = this.binary(0);
    // Bicep lets a ternary break its line before `?` and `:`.
    if (!this.hcl && this.withNl(true, () => this.is('?'))) this.newlines();
    if (this.is('?')) {
      this.next();
      const yes = this.withNl(true, () => this.expr());
      this.withNl(true, () => this.expect(':'));
      const no = this.expr();
      return this.node('cond', s, no.e, { test, yes, no });
    }
    return test;
  }
  lambdaAhead() {
    let k = 1;
    for (;;) {
      const t = this.peek(k);
      if (t.k === 'p' && t.v === ')') return this.is('=>', k + 1);
      if (t.k !== 'id' && !(t.k === 'p' && t.v === ',')) return false;
      k++;
    }
  }
  binary(min) {
    let a = this.unary();
    for (;;) {
      const t = this.peek();
      const prec = t.k === 'p' ? BIN[t.v] : undefined;
      if (prec == null || prec <= min || (t.v === '??' && this.hcl)) return a;
      this.next();
      const b = this.binary(prec);
      a = this.node('bin', a.s, b.e, { op: t.v, a, b });
    }
  }
  unary() {
    const t = this.peek();
    if (t.k === 'p' && (t.v === '!' || t.v === '-')) { this.next(); const x = this.unary(); return this.node('unary', t.s, x.e, { op: t.v, x }); }
    if (t.k === 'p' && t.v === '...') { this.next(); const x = this.unary(); return this.node('spread', t.s, x.e, { x }); }
    return this.postfix(this.primary());
  }
  postfix(n) {
    for (;;) {
      const t = this.toks[this.i];
      if (!t || t.k !== 'p') return n;
      if (t.v === '.' || t.v === '::') {
        this.next();
        if (this.is('?')) this.next(); // Bicep safe access a.?b
        const u = this.next();
        const part = u.k === 'p' && u.v === '*' ? '*' : u.k === 'num' ? `[${u.v}]` : u.k === 'id' ? u.v : null;
        if (part == null) throw new ParseError('Expected a name after "."', this.lineOf(u));
        n = this.extend(n, part, null, u.e);
        if (this.is('(') && this.toks[this.i].k === 'p' && this.toks[this.i].v === '(' && n.t === 'ref') n = this.call(n.path.join('.'), n.s);
        continue;
      }
      if (t.v === '[') {
        this.next();
        const r = this.withNl(true, () => {
          if (this.is('?')) this.next();
          if (this.is('*')) { this.next(); this.expect(']'); return { part: '*', idx: null }; }
          const idx = this.expr();
          const close = this.expect(']');
          const lit = idx.t === 'num' ? `[${idx.v}]` : idx.t === 'str' && !idx.template ? `[${JSON.stringify(idx.v)}]` : '[…]';
          return { part: lit, idx, e: close.e };
        });
        n = this.extend(n, r.part, r.idx, this.toks[this.i - 1].e);
        continue;
      }
      // Bicep's non-null assertion `x!` (a prefix `!` never follows a value).
      if (t.v === '!' && !this.hcl) { this.next(); continue; }
      return n;
    }
  }
  extend(n, part, idx, e) {
    if (n.t === 'ref') return { ...n, e, path: [...n.path, part], index: idx ? [...n.index, idx] : n.index };
    return this.node('get', n.s, e, { obj: n, path: [part], index: idx ? [idx] : [] });
  }
  call(name, s) {
    this.next(); // (
    const args = this.withNl(true, () => {
      const out = [];
      while (!this.is(')')) {
        if (this.peek().k === 'eof') throw new ParseError(`The call to ${name} is not closed`, this.lineAt(s));
        out.push(this.expr());
        if (this.is(',')) this.next();
        else if (this.is('...')) this.next();
        else if (!this.is(')')) throw new ParseError(`Expected "," or ")" in the call to ${name}`, this.lineOf(this.peek()));
      }
      return { out, close: this.next() };
    });
    const { close } = args;
    return this.node('call', s, close.e, { name, args: args.out });
  }
  primary() {
    const t = this.next();
    const s = t.s;
    if (t.k === 'num') return this.node('num', s, t.e, { v: Number(t.v) });
    if (t.k === 'str') return this.string(t);
    if (t.k === 'heredoc') return this.heredoc(t);
    if (t.k === 'id') {
      if (t.v === 'true' || t.v === 'false') return this.node('bool', s, t.e, { v: t.v === 'true' });
      if (t.v === 'null') return this.node('null', s, t.e, {});
      if (!this.hcl && t.v === 'if' && this.is('(')) {
        this.next(); const test = this.withNl(true, () => this.expr()); this.withNl(true, () => this.expect(')'));
        const body = this.expr();
        return this.node('if', s, body.e, { test, body });
      }
      const nt = this.toks[this.i];
      if (nt && nt.k === 'p' && nt.v === '(') return this.call(t.v, s);
      return this.node('ref', s, t.e, { path: [t.v], index: [] });
    }
    if (t.k === 'p') {
      if (t.v === '(') {
        const x = this.withNl(true, () => { const x = this.expr(); this.expect(')'); return x; });
        return { ...x, s, e: this.toks[this.i - 1].e, paren: true };
      }
      if (t.v === '[') return this.list(t);
      if (t.v === '{') return this.object(t);
    }
    throw new ParseError(t.k === 'eof' ? 'The file ends in the middle of a value' : t.k === 'nl' ? 'A value is missing before the end of the line' : `Unexpected "${this.src.slice(t.s, t.e).slice(0, 20)}"`, this.lineOf(t));
  }
  forHead() {
    this.next(); // for
    const vars = [];
    if (this.is('(')) { this.next(); while (!this.is(')')) { const v = this.next(); if (v.k === 'id') vars.push(v.v); } this.next(); }
    else { vars.push(this.next().v); while (this.is(',')) { this.next(); vars.push(this.next().v); } }
    const kw = this.next();
    if (kw.k !== 'id' || kw.v !== 'in') throw new ParseError('Expected "in" in a for expression', this.lineOf(kw));
    const coll = this.expr();
    this.expect(':');
    return { vars, coll };
  }
  list(open) {
    // HCL lists ignore new lines; Bicep arrays use them to separate items.
    return this.withNl(this.hcl, () => {
      if (this.hcl ? this.isId('for') : (this.newlines(), this.isId('for'))) {
        const r = this.withNl(true, () => {
          const head = this.forHead();
          const value = this.expr();
          let when = null;
          if (this.isId('if')) { this.next(); when = this.expr(); }
          const close = this.expect(']');
          return { head, value, when, close };
        });
        return this.node('for', open.s, r.close.e, { kind: 'list', vars: r.head.vars, coll: r.head.coll, value: r.value, ...(r.when ? { when: r.when } : {}) });
      }
      const items = [];
      for (;;) {
        this.newlines();
        if (this.is(']')) break;
        if (this.peek().k === 'eof') throw new ParseError('A list is not closed', this.lineOf(open));
        items.push(this.expr());
        if (this.is(',')) this.next();
        else if (!this.is(']') && this.toks[this.i]?.k !== 'nl') throw new ParseError('Expected "," or "]" in a list', this.lineOf(this.peek()));
      }
      const close = this.next();
      return this.node('list', open.s, close.e, { items });
    });
  }
  object(open) {
    return this.withNl(false, () => {
      this.newlines();
      if (this.isId('for') && this.hcl) {
        const r = this.withNl(true, () => {
          const head = this.forHead();
          const key = this.expr(); this.expect('=>');
          const value = this.expr();
          if (this.is('...')) this.next();
          let when = null;
          if (this.isId('if')) { this.next(); when = this.expr(); }
          const close = this.expect('}');
          return { head, key, value, when, close };
        });
        return this.node('for', open.s, r.close.e, { kind: 'obj', vars: r.head.vars, coll: r.head.coll, key: r.key, value: r.value, ...(r.when ? { when: r.when } : {}) });
      }
      const entries = [];
      for (;;) {
        this.newlines();
        if (this.is('}')) break;
        const kt = this.peek();
        if (kt.k === 'eof') throw new ParseError('An object is not closed', this.lineOf(open));
        if (kt.k === 'p' && kt.v === '...') { const x = this.expr(); entries.push({ key: '...', value: x, line: x.line, spread: true }); }
        else {
          const hooked = this.hooks.objectKey?.(this, kt);
          if (hooked) { entries.push(hooked); continue; }
          let key, keyNode = null;
          if (kt.k === 'id' && (this.is('=', 1) || this.is(':', 1))) { this.next(); key = kt.v; }
          else if (kt.k === 'str' && (this.is('=', 1) || this.is(':', 1))) { keyNode = this.string(this.next()); key = keyNode.template ? this.src.slice(kt.s, kt.e) : keyNode.v; }
          else { keyNode = this.withNl(true, () => this.binary(0)); key = this.src.slice(keyNode.s, keyNode.e); }
          const sep = this.next();
          if (sep.k !== 'p' || (sep.v !== '=' && sep.v !== ':')) throw new ParseError(`Expected "=" or ":" after ${key}`, this.lineOf(sep));
          const value = this.expr();
          entries.push({ key, ...(keyNode && keyNode.t !== 'str' ? { keyNode } : {}), value, line: this.lineOf(kt) });
        }
        if (this.is(',')) this.next();
        else if (!this.is('}') && this.toks[this.i]?.k !== 'nl') throw new ParseError('Expected a new line, "," or "}" in an object', this.lineOf(this.peek()));
      }
      const close = this.next();
      return this.node('obj', open.s, close.e, { entries });
    });
  }
  /** A quoted string, with its `${ … }` parts parsed (a template is worked out when it is applied). */
  string(t) {
    if (t.multi) return this.node('str', t.s, t.e, { v: this.src.slice(t.s + 3, Math.max(t.s + 3, t.e - 3)).replace(/^\r?\n/, ''), template: false, parts: [] });
    const q = this.src[t.s];
    const end = this.src[t.e - 1] === q && t.e - 1 > t.s ? t.e - 1 : t.e;
    return this.template(t.s, t.s + 1, end, t.e, false);
  }
  heredoc(t) {
    const n = this.template(t.s, t.bodyStart, t.bodyEnd, t.e, true);
    if (t.strip && !n.template) {
      const lines = n.v.split('\n');
      const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
      n.v = lines.map((l) => l.slice(Number.isFinite(ind) ? ind : 0)).join('\n');
    }
    n.heredoc = true;
    return n;
  }
  template(s, from, to, e, raw) {
    const src = this.src, hcl = this.hcl;
    const parts = [];
    let lit = '', template = false;
    for (let i = from; i < to;) {
      const c = src[i];
      if (!raw && c === '\\' && i + 1 < to) {
        const n = src[i + 1];
        if (n === 'u' && hcl) { lit += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16) || 0); i += 6; continue; }
        if (n === 'u' && src[i + 2] === '{') { const close = src.indexOf('}', i); lit += String.fromCodePoint(parseInt(src.slice(i + 3, close), 16) || 0); i = close + 1; continue; }
        lit += { n: '\n', t: '\t', r: '\r' }[n] ?? n; i += 2; continue;
      }
      if (hcl && (c === '$' || c === '%') && src[i + 1] === c && src[i + 2] === '{') { lit += `${c}{`; i += 3; continue; }
      if ((c === '$' || (hcl && c === '%')) && src[i + 1] === '{') {
        const close = scanInterp(src, i + 2, this.dialect);
        template = true;
        if (lit) parts.push(lit);
        lit = '';
        if (c === '%') { parts.push(this.node('other', i, close, { why: 'a template directive' })); i = close; continue; }
        let a = i + 2, b = close - 1;
        if (src[a] === '~') a++;
        if (src[b - 1] === '~') b--;
        const { toks } = tokenize(src, this.dialect, a, b, this.lineAt);
        const p = new Parser(src, toks, this.dialect, this.lineAt, this.hooks);
        p.skipNl = [true];
        try { parts.push(p.expr()); } catch { parts.push(this.node('other', a, b, { why: 'an expression Thunder cannot read yet' })); }
        i = close; continue;
      }
      lit += c; i++;
    }
    if (lit) parts.push(lit);
    return this.node('str', s, e, { v: template ? null : parts.join(''), template, parts });
  }
}

// ── Walking nodes ──────────────────────────────────────────────────────────────────────────────────────────

/** Every child node of a node. */
export function childrenOf(n) {
  if (!n || typeof n !== 'object') return [];
  switch (n.t) {
    case 'str': return n.parts.filter((p) => typeof p === 'object');
    case 'list': return n.items;
    case 'obj': return n.entries.flatMap((e) => [e.keyNode, e.value].filter(Boolean));
    case 'ref': return n.index;
    case 'get': return [n.obj, ...n.index];
    case 'call': return n.args;
    case 'unary': case 'spread': return [n.x];
    case 'bin': return [n.a, n.b];
    case 'cond': return [n.test, n.yes, n.no];
    case 'for': return [n.coll, n.key, n.value, n.when].filter(Boolean);
    case 'if': return [n.test, n.body];
    case 'lambda': return [n.body];
    default: return [];
  }
}

/** Every reference inside a node (a.b.c), with the variables a `for` or lambda introduces left out. */
export function refsIn(n, out = [], bound = new Set()) {
  if (!n || typeof n !== 'object') return out;
  if (n.t === 'ref') { if (!bound.has(n.path[0])) out.push(n); for (const x of n.index) refsIn(x, out, bound); return out; }
  if (n.t === 'for' || n.t === 'lambda') {
    const inner = new Set([...bound, ...n.vars]);
    if (n.t === 'for') { refsIn(n.coll, out, bound); for (const x of [n.key, n.value, n.when]) refsIn(x, out, inner); }
    else refsIn(n.body, out, inner);
    return out;
  }
  for (const c of childrenOf(n)) refsIn(c, out, bound);
  return out;
}

/** True when a node is written out in full in the file: no references, calls, or templates. */
export function isLiteral(n) {
  if (!n) return false;
  switch (n.t) {
    case 'num': case 'bool': case 'null': return true;
    case 'str': return !n.template;
    case 'list': return n.items.every(isLiteral);
    case 'obj': return n.entries.every((e) => !e.keyNode && !e.spread && isLiteral(e.value));
    case 'unary': return n.op === '-' && n.x.t === 'num';
    default: return false;
  }
}

/** A literal node as a plain value; references and calls become { ref: 'source text' }. */
export function toValue(n, src) {
  if (!n) return null;
  switch (n.t) {
    case 'num': case 'bool': return n.v;
    case 'null': return null;
    case 'str': return n.template ? { ref: src.slice(n.s, n.e) } : n.v;
    case 'list': return n.items.map((x) => toValue(x, src));
    case 'obj': return Object.fromEntries(n.entries.filter((e) => !e.spread).map((e) => [e.key, toValue(e.value, src)]));
    case 'unary': if (n.op === '-' && n.x.t === 'num') return -n.x.v; break;
    case 'call': if (/^(jsonencode|tolist|toset|tomap)$/.test(n.name) && n.args.length === 1) return toValue(n.args[0], src); break;
    default: break;
  }
  return { ref: src.slice(n.s, n.e), node: n };
}

/** An object node's entry by key (first match), or undefined. */
export function entryOf(obj, key) {
  return obj?.t === 'obj' ? obj.entries.find((e) => e.key === key) : undefined;
}
