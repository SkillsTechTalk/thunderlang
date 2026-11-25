// Thunder Core parser: lines of tokens -> a syntax tree with a line number on every node.
//
// Two passes, both deterministic:
//   1. Collect every name the program declares (Set/Keep targets, Receive inputs, For each items, functions,
//      records and their fields, Use aliases). Names may be several words ("tax rate"), so expressions need
//      this list to know where one name ends.
//   2. Parse each statement. In an expression, a run of words is matched against the known names, longest first.
//
// The grammar is in docs/core.md. Nothing here guesses: a line that does not fit the grammar
// gets a diagnostic with a code, never a best-effort reading.

import { lex } from './lexer.mjs';
import { diag, CoreError, closest } from './diagnostics.mjs';

// Words that belong to Thunder and cannot be part of a name.
export const RESERVED = new Set(['is', 'are', 'and', 'or', 'not', 'to', 'at', 'of', 'with', 'from', 'where', 'by', 'in', 'as',
  'than', 'the', 'a', 'an', 'plus', 'minus', 'times', 'divided', 'mod', 'true', 'false', 'yes', 'no', 'nothing', 'otherwise',
  'sorted', 'descending', 'ascending', 'equals', 'contains', 'between', 'yes/no', 'joined', 'split', 'replacing', 'starts', 'ends']);

// Built-in operations written "the <op> of <value>".
export const OPS = {
  sum: 'sum', total: 'sum', average: 'average', mean: 'average', count: 'count', number: 'count',
  min: 'min', minimum: 'min', smallest: 'min', lowest: 'min', max: 'max', maximum: 'max', largest: 'max', highest: 'max',
  length: 'length', words: 'words', lines: 'lines', lowercase: 'lowercase', uppercase: 'uppercase', trimmed: 'trimmed',
  keys: 'keys', values: 'values', first: 'first', last: 'last', parts: 'parts',
};

export const STATEMENT_WORDS = ['say', 'print', 'set', 'keep', 'give', 'stop', 'when', 'if', 'otherwise', 'for each', 'repeat',
  'to', 'receive', 'a … has', 'expect', 'never allow', 'use', 'test', 'add', 'remove', 'increase', 'decrease', 'sort', 'reverse'];
export const LIST_ACTIONS = ['sort', 'reverse', 'add', 'remove'];

const keyOf = (words) => words.map((w) => w.lower).join(' ');
const isWord = (t, w) => t && t.t === 'word' && (w === undefined || t.lower === w);
const isSym = (t, s) => t && t.t === 'sym' && t.text === s;

// ---------------------------------------------------------------- blocks

// A condition may continue on the next line: a more-indented line that starts with "and" or "or" belongs to
// the line above (when that line has not opened a block with ":"). No statement starts with "and" or "or",
// so this never changes what another line means.
//   When member is yes
//     and total is at least 100:
function joinContinuations(lines) {
  const out = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    const startsJoin = isWord(l.tokens[0], 'and') || isWord(l.tokens[0], 'or');
    if (prev && startsJoin && l.indent > prev.indent && !isSym(prev.tokens[prev.tokens.length - 1], ':')) {
      out[out.length - 1] = { ...prev, tokens: [...prev.tokens, ...l.tokens], raw: `${prev.raw} ${l.raw.trim()}` };
    } else out.push(l);
  }
  return out;
}

function buildBlocks(lines, diagnostics) {
  lines = joinContinuations(lines);
  let i = 0;
  const endsColon = (l) => isSym(l.tokens[l.tokens.length - 1], ':');
  function block(indent) {
    const out = [];
    while (i < lines.length) {
      const l = lines[i];
      if (l.indent < indent) break;
      if (l.indent > indent) {
        diagnostics.push(out.length && endsColon(out[out.length - 1])
          ? diag('TC104', l.line, 'This line is indented differently from the lines above it.', 'Use the same number of spaces for every line in a block (two per level).')
          : diag('TC102', l.line, 'This line is indented, but the line above does not end with ":", so nothing opens a block here.', 'Remove the extra spaces, or end the line above with ":".'));
        i++; continue;
      }
      const node = { line: l.line, tokens: l.tokens, raw: l.raw, children: [] };
      i++;
      if (endsColon(l)) {
        if (i < lines.length && lines[i].indent > indent) node.children = block(lines[i].indent);
        else diagnostics.push(diag('TC103', l.line, `"${l.raw}" ends with ":", so the lines under it should be indented.`, 'Indent the lines that belong to it by two spaces.'));
      }
      out.push(node);
    }
    return out;
  }
  return block(lines.length ? lines[0].indent : 0);
}

// ---------------------------------------------------------------- pass 1: names

function splitTop(tokens, pred) {
  let depth = 0;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (isSym(t, '(') || isSym(t, '[')) depth++;
    else if (isSym(t, ')') || isSym(t, ']')) depth--;
    else if (depth === 0 && pred(t, k)) return k;
  }
  return -1;
}
function lastTop(tokens, pred) {
  let depth = 0, found = -1;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (isSym(t, '(') || isSym(t, '[')) depth++;
    else if (isSym(t, ')') || isSym(t, ']')) depth--;
    else if (depth === 0 && pred(t, k)) found = k;
  }
  return found;
}
const allWords = (ts) => ts.length > 0 && ts.every((t) => t.t === 'word');
const stripArticle = (ts) => (isWord(ts[0], 'the') || isWord(ts[0], 'a') || isWord(ts[0], 'an') ? ts.slice(1) : ts);
const noColon = (ts) => (isSym(ts[ts.length - 1], ':') ? ts.slice(0, -1) : ts);

function collectNames(nodes, names) {
  const add = (kind, words) => {
    if (!words.length) return;
    if (kind === 'record') { names.records.add(keyOf(words)); return; }
    const cur = names.known.get(keyOf(words));
    if (!cur || cur === 'var') names.known.set(keyOf(words), kind);
  };
  for (const n of nodes) {
    const ts = n.tokens;
    const w0 = ts[0]?.t === 'word' ? ts[0].lower : '';
    if (w0 === 'set') {
      const k = splitTop(ts, (t) => isWord(t, 'to'));
      const target = stripArticle(ts.slice(1, k < 0 ? ts.length : k));
      if (allWords(target) && !target.some((t) => RESERVED.has(t.lower)) && !names.known.has(keyOf(target))) add('var', target);
    } else if (w0 === 'keep') {
      const k = splitTop(ts, (t) => isWord(t, 'at'));
      add('const', stripArticle(ts.slice(1, k < 0 ? ts.length : k)));
    } else if (w0 === 'receive') {
      for (const p of paramGroups(ts.slice(1))) add('var', p.words);
    } else if (w0 === 'for' && isWord(ts[1], 'each')) {
      const k = splitTop(ts, (t) => isWord(t, 'in') || isWord(t, 'from'));
      const head = ts.slice(2, k < 0 ? ts.length : k);
      const andAt = head.findIndex((t) => isWord(t, 'and'));
      if (andAt >= 0) { add('var', head.slice(0, andAt)); add('var', head.slice(andAt + 1)); } else add('var', head);
    } else if (w0 === 'to' && isSym(ts[ts.length - 1], ':')) {
      add('func', ts.slice(1, -1));
    } else if ((w0 === 'a' || w0 === 'an') && isWord(ts[ts.length - 2], 'has')) {
      const words = ts.slice(1, -2);
      add('record', words);
      for (const c of n.children) {
        const k = c.tokens.findIndex((t) => isWord(t, 'is'));
        if (k > 0 && !isWord(c.tokens[0], 'never')) names.fields.add(keyOf(c.tokens.slice(0, k)));
      }
    } else if (w0 === 'use') {
      const k = ts.findIndex((t) => isWord(t, 'as'));
      if (k > 0) add('module', ts.slice(k + 1)); else if (ts[1]?.t === 'word') add('module', [ts[1]]);
    } else if (w0 === 'if' && keyOf(ts.slice(0, 3)) === 'if this fails') {
      add('var', [{ lower: 'error' }]);
    }
    collectNames(n.children, names);
  }
}

// "total and member", "total as money, member as yes/no"
function paramGroups(ts) {
  const groups = [];
  let cur = [];
  for (const t of ts) {
    if (isSym(t, ',') || isWord(t, 'and')) { if (cur.length) groups.push(cur); cur = []; } else cur.push(t);
  }
  if (cur.length) groups.push(cur);
  return groups.map((g) => {
    const k = g.findIndex((t) => isWord(t, 'as'));
    return { words: stripArticle(k < 0 ? g : g.slice(0, k)), typeTokens: k < 0 ? null : g.slice(k + 1) };
  });
}

// ---------------------------------------------------------------- expressions

class Stream {
  constructor(tokens, line) { this.ts = tokens; this.i = 0; this.line = line; }
  peek(k = 0) { return this.ts[this.i + k]; }
  next() { return this.ts[this.i++]; }
  done() { return this.i >= this.ts.length; }
  word(w) { if (isWord(this.peek(), w)) { this.i++; return true; } return false; }
  words(...ws) { if (ws.every((w, k) => isWord(this.peek(k), w))) { this.i += ws.length; return true; } return false; }
  sym(s) { if (isSym(this.peek(), s)) { this.i++; return true; } return false; }
  fail(msg, hint, code = 'TC105') { throw new CoreError(diag(code, this.line, msg, hint)); }
  expectSym(s, what) { if (!this.sym(s)) this.fail(`I expected "${s}" ${what}${this.peek() ? `, but found "${show(this.peek())}"` : ''}.`, null, 'TC108'); }
}
export const show = (t) => (t.t === 'word' ? t.text : t.t === 'sym' ? t.text : t.t === 'num' ? t.text : t.t === 'money' ? `$${t.text}` : t.t === 'percent' ? `${t.text}%` : t.t === 'poss' ? "'s" : '"…"');

export class ExprParser {
  constructor(names) { this.names = names; }

  parse(tokens, line, opts = {}) {
    const s = new Stream(tokens, line);
    if (s.done()) s.fail('A value is missing here.', null, 'TC108');
    const e = this.expr(s, opts);
    if (!s.done()) s.fail(`I understood the line up to "${show(s.peek())}", but not from there on.`, opts.extraHint ?? 'Check the spelling, or put parentheses around a part to group it.', 'TC112');
    return e;
  }

  expr(s, o = {}) { return this.or(s, o); }
  or(s, o) {
    let l = this.and(s, o);
    while (isWord(s.peek(), 'or')) { s.next(); l = { k: 'bin', op: 'or', l, r: this.and(s, o), line: s.line }; }
    return l;
  }
  and(s, o) {
    let l = this.not(s, o);
    while (!o.noAnd && isWord(s.peek(), 'and')) { s.next(); l = { k: 'bin', op: 'and', l, r: this.not(s, o), line: s.line }; }
    return l;
  }
  not(s, o) {
    if (s.word('not')) return { k: 'not', e: this.not(s, o), line: s.line };
    return this.cmp(s, o);
  }
  cmp(s, o) {
    const l = this.add(s, o);
    const t = s.peek();
    const line = s.line;
    if (t?.t === 'sym' && ['=', '==', '!=', '<', '<=', '>', '>='].includes(t.text)) {
      s.next();
      const op = { '=': '==', '==': '==' }[t.text] ?? t.text;
      return { k: 'cmp', op, l, r: this.add(s, o), line };
    }
    if (s.word('equals')) return { k: 'cmp', op: '==', l, r: this.add(s, o), line };
    if (s.word('contains')) return { k: 'contains', l, r: this.add(s, o), line };
    if (s.words('starts', 'with')) return { k: 'affix', end: false, l, r: this.add(s, o), line };
    if (s.words('ends', 'with')) return { k: 'affix', end: true, l, r: this.add(s, o), line };
    if (s.words('does', 'not', 'contain')) return { k: 'not', e: { k: 'contains', l, r: this.add(s, o), line }, line };
    if (isWord(t, 'is') || isWord(t, 'are')) {
      s.next();
      const neg = s.word('not');
      const wrap = (e) => (neg ? { k: 'not', e, line } : e);
      const rel = [[['at', 'least'], '>='], [['at', 'most'], '<='], [['more', 'than'], '>'], [['greater', 'than'], '>'], [['less', 'than'], '<'],
        [['fewer', 'than'], '<'], [['above'], '>'], [['below'], '<'], [['equal', 'to'], '==']];
      for (const [ws, op] of rel) if (s.words(...ws)) return wrap({ k: 'cmp', op, l, r: this.add(s, o), line });
      if (s.word('nothing')) return { k: 'isNothing', e: l, neg, line };
      for (const adj of ['empty', 'positive', 'negative', 'zero']) {
        if (isWord(s.peek(), adj) && (s.i + 1 >= s.ts.length || !(s.ts[s.i + 1].t === 'word' && !RESERVED.has(s.ts[s.i + 1].lower)))) { s.next(); return wrap({ k: 'adj', adj, e: l, line }); }
      }
      if (s.word('between')) {
        const lo = this.add(s, o);
        if (!s.word('and')) s.fail('"is between" needs "and": is between 1 and 10.', null, 'TC108');
        const hi = this.add(s, o);
        return wrap({ k: 'between', e: l, lo, hi, line });
      }
      if (s.word('in')) return wrap({ k: 'contains', l: this.add(s, o), r: l, line });
      if (s.done()) s.fail('Something is missing after "is".', 'For example: is 10, is at least 18, is nothing, is empty.', 'TC108');
      return { k: 'cmp', op: neg ? '!=' : '==', l, r: this.add(s, o), line };
    }
    return l;
  }
  add(s, o) {
    let l = this.mul(s, o);
    for (;;) {
      const t = s.peek();
      if (isSym(t, '+') || isWord(t, 'plus')) { s.next(); l = { k: 'bin', op: '+', l, r: this.mul(s, o), line: s.line }; }
      else if (isSym(t, '-') || isWord(t, 'minus')) { s.next(); l = { k: 'bin', op: '-', l, r: this.mul(s, o), line: s.line }; }
      else return l;
    }
  }
  mul(s, o) {
    let l = this.unary(s, o);
    for (;;) {
      const t = s.peek();
      if (isSym(t, '*') || isWord(t, 'times')) { s.next(); l = { k: 'bin', op: '*', l, r: this.unary(s, o), line: s.line }; }
      else if (isSym(t, '/')) { s.next(); l = { k: 'bin', op: '/', l, r: this.unary(s, o), line: s.line }; }
      else if (isWord(t, 'divided') && isWord(s.peek(1), 'by')) { s.i += 2; l = { k: 'bin', op: '/', l, r: this.unary(s, o), line: s.line }; }
      else if (isWord(t, 'mod')) { s.next(); l = { k: 'bin', op: 'mod', l, r: this.unary(s, o), line: s.line }; }
      else return l;
    }
  }
  unary(s, o) {
    if (s.sym('-')) return { k: 'neg', e: this.unary(s, o), line: s.line };
    return this.postfix(s, o);
  }
  postfix(s, o) {
    let e = this.primary(s, o);
    for (;;) {
      const t = s.peek();
      if (t?.t === 'poss') {
        s.next();
        const run = this.wordRun(s);
        if (!run.length) s.fail(`I expected a field name after "'s".`, null, 'TC108');
        const k = this.longest(run, (key) => this.names.fields.has(key)) || run.length;
        s.i -= run.length - k;
        e = { k: 'field', obj: e, name: keyOf(run.slice(0, k)), text: run.slice(0, k).map((w) => w.text).join(' '), line: s.line };
      } else if (isWord(t, 'at') && !isWord(s.peek(1), 'least') && !isWord(s.peek(1), 'most')) {
        s.next();
        const key = this.unary(s, { ...o, noAnd: true });
        let dflt = null;
        if (s.word('otherwise')) dflt = this.unary(s, { ...o, noAnd: true });
        e = { k: 'at', obj: e, key, dflt, line: s.line };
      } else if (isWord(t, 'as')) {
        s.next();
        e = { k: 'conv', e, type: this.typeRef(s), line: s.line };
      } else if (isWord(t, 'where')) {
        s.next();
        e = { k: 'where', list: e, cond: this.or(s, { ...o, stopSorted: true }), line: s.line };
      } else if (isWord(t, 'sorted') && isWord(s.peek(1), 'by')) {
        s.i += 2;
        const run = this.wordRun(s);
        if (!run.length) s.fail('"sorted by" needs a field: sorted by date.', null, 'TC108');
        const desc = s.word('descending') ? true : (s.word('ascending'), false);
        e = { k: 'sorted', list: e, by: keyOf(run), text: run.map((w) => w.text).join(' '), desc, line: s.line };
      } else if (isWord(t, 'sorted')) {
        // "xs sorted" / "xs sorted descending": the values themselves, smallest first.
        s.next();
        const desc = s.word('descending') ? true : (s.word('ascending'), false);
        e = { k: 'sortedValues', list: e, desc, line: s.line };
      } else if (isWord(t, 'joined') && isWord(s.peek(1), 'with')) {
        s.i += 2;
        e = { k: 'joined', list: e, sep: this.unary(s, { ...o, noAnd: true }), line: s.line };
      } else if (isWord(t, 'split') && isWord(s.peek(1), 'at')) {
        s.i += 2;
        e = { k: 'splitAt', text: e, sep: this.unary(s, { ...o, noAnd: true }), line: s.line };
      } else if (isWord(t, 'replacing')) {
        s.next();
        const from = this.unary(s, { ...o, noAnd: true });
        if (!s.word('with')) s.fail('"replacing" needs "with": name replacing "-" with " ".', null, 'TC108');
        e = { k: 'replacing', text: e, from, to: this.unary(s, { ...o, noAnd: true }), line: s.line };
      } else if (isSym(t, '.') && s.peek(1)?.t === 'word') {
        s.next();
        const attr = s.next().text;
        let args = null;
        if (isSym(s.peek(), '(')) args = this.parenArgs(s);
        e = { k: 'dot', obj: e, attr, args, line: s.line };
      } else return e;
    }
  }

  // words that may form a name (stops at reserved words and non-words)
  wordRun(s) {
    const run = [];
    while (s.peek()?.t === 'word' && !RESERVED.has(s.peek().lower)) run.push(s.next());
    return run;
  }
  // Does a known field name start k tokens ahead? (So "," inside a list is not read as "and the next field".)
  fieldAhead(s, k) {
    const run = [];
    for (let j = s.i + k; s.ts[j]?.t === 'word' && !RESERVED.has(s.ts[j].lower); j++) run.push(s.ts[j]);
    return this.longest(run, (key) => this.names.fields.has(key)) > 0;
  }
  longest(run, ok) {
    for (let k = run.length; k > 0; k--) if (ok(keyOf(run.slice(0, k)))) return k;
    return 0;
  }
  parenArgs(s) {
    s.expectSym('(', 'to start the values');
    const args = [];
    if (s.sym(')')) return args;
    for (;;) {
      args.push(this.expr(s, {}));
      if (s.sym(')')) return args;
      s.expectSym(',', 'between values');
    }
  }
  withArgs(s) {
    const args = [this.expr(s, { noAnd: true })];
    while (s.sym(',') || s.word('and')) args.push(this.expr(s, { noAnd: true }));
    return args;
  }

  typeRef(s) {
    s.word('a'); s.word('an');
    const t = s.next();
    if (!t || t.t !== 'word') s.fail('A kind of value is missing (number, whole number, text, yes/no, money, date, list, map, or a record name).', null, 'TC306');
    const w = t.lower;
    if (w === 'optional') return { k: 'optional', of: this.typeRef(s) };
    if (w === 'whole' && s.word('number')) return { k: 'whole' };
    if (w === 'yes' && s.word('or') && s.word('no')) return { k: 'bool' };
    if (w === 'list') { if (s.word('of')) return { k: 'list', of: this.typeRef(s) }; return { k: 'list', of: { k: 'unknown' } }; }
    if (w === 'map') { if (s.word('of')) { const key = this.typeRef(s); if (!s.word('to')) s.fail('"map of" needs "to": map of text to number.', null, 'TC306'); return { k: 'map', key, of: this.typeRef(s) }; } return { k: 'map', key: { k: 'unknown' }, of: { k: 'unknown' } }; }
    const simple = { number: 'number', numbers: 'number', text: 'text', texts: 'text', 'yes/no': 'bool', money: 'money', date: 'date', integer: 'whole' }[w];
    if (simple) return { k: simple };
    const run = [t, ...this.wordRun(s)];
    const k = this.longest(run, (key) => this.names.records.has(key)) || this.longest(run, (key) => this.names.records.has(key.replace(/s$/, '')));
    if (!k) s.fail(`I don't know the kind of value "${run.map((x) => x.text).join(' ')}".`, 'Kinds: number, whole number, text, yes/no, money, date, list of …, map of … to …, optional …, or a record you defined with "A … has:".', 'TC306');
    s.i -= run.length - k;
    const key = keyOf(run.slice(0, k));
    return { k: 'record', name: this.names.records.has(key) ? key : key.replace(/s$/, '') };
  }

  primary(s, o) {
    const t = s.peek();
    const line = s.line;
    if (!t) s.fail('A value is missing at the end of this line.', null, 'TC108');
    if (t.t === 'num') { s.next(); return { k: 'num', text: t.text, whole: t.whole, line }; }
    if (t.t === 'money') { s.next(); return { k: 'money', text: t.text, line }; }
    if (t.t === 'percent') {
      s.next();
      const p = { k: 'percent', text: t.text, line };
      if (s.word('of')) return { k: 'bin', op: '*', l: p, r: this.unary(s, o), line, percentOf: true };
      return p;
    }
    if (t.t === 'str') {
      s.next();
      return { k: 'str', parts: t.parts.map((p) => (typeof p === 'string' ? p : { e: this.parse(p.tokens, line), source: p.source })), line };
    }
    if (isSym(t, '(')) { s.next(); const e = this.expr(s, {}); s.expectSym(')', 'to close the parenthesis'); return { k: 'paren', e, line }; }
    if (isSym(t, '[')) {
      s.next();
      const items = [];
      if (!s.sym(']')) for (;;) { items.push(this.expr(s, {})); if (s.sym(']')) break; s.expectSym(',', 'between list items'); }
      return { k: 'list', items, line };
    }
    if (t.t !== 'word') s.fail(`I didn't expect "${show(t)}" here.`, null, 'TC105');
    const w = t.lower;
    if (w === 'true' || w === 'yes') { s.next(); return { k: 'bool', v: true, line }; }
    if (w === 'false' || w === 'no') { s.next(); return { k: 'bool', v: false, line }; }
    if (w === 'nothing') { s.next(); return { k: 'nothing', line }; }
    if ((w === 'an' || w === 'a') && isWord(s.peek(1), 'empty') && (isWord(s.peek(2), 'list') || isWord(s.peek(2), 'map'))) {
      s.i += 3;
      const kind = s.ts[s.i - 1].lower === 'list' ? 'list' : 'map';
      if (kind === 'list' && isWord(s.peek(), 'of')) { s.next(); return { k: 'list', items: [], of: this.typeRef(s), line }; }
      return { k: kind, items: [], line };
    }
    if (w === 'the' || w === 'a' || w === 'an') { s.next(); return this.primary(s, { ...o, article: w !== 'the' }); }
    // the absolute value of x, the JSON text of v, the JSON data in t
    if (w === 'absolute' && isWord(s.peek(1), 'value') && isWord(s.peek(2), 'of')) { s.i += 3; return { k: 'op', op: 'abs', word: 'absolute value', arg: this.unary(s, o), line }; }
    if (w === 'json' && isWord(s.peek(1), 'text') && isWord(s.peek(2), 'of')) { s.i += 3; return { k: 'op', op: 'jsonText', word: 'JSON text', arg: this.unary(s, o), line }; }
    if (w === 'json' && isWord(s.peek(1), 'data') && isWord(s.peek(2), 'in')) { s.i += 3; return { k: 'op', op: 'jsonData', word: 'JSON data', arg: this.unary(s, o), line }; }
    // the <op> of <value>
    if (OPS[w] && isWord(s.peek(1), 'of')) {
      s.i += 2;
      return { k: 'op', op: OPS[w], word: t.text, arg: this.unary(s, o), line };
    }
    if (w === 'round') {
      s.next();
      const e = this.unary(s, { ...o, noAnd: true });
      let places = null;
      if (s.word('to')) {
        places = this.unary(s, o);
        s.word('decimal');
        if (!s.word('places') && !s.word('place')) s.fail('Write "round X to 2 places" (or "to 2 decimal places").', null, 'TC108');
      }
      return { k: 'round', e, places, line };
    }
    if (w === 'read' && isWord(s.peek(1), 'file')) { s.i += 2; return { k: 'readFile', path: this.unary(s, o), line }; }
    if (w === 'today' && !this.names.known.has('today')) { s.next(); return { k: 'today', line }; }
    if (w === 'date' && s.peek(1)?.t === 'str') { s.next(); const str = s.next(); return { k: 'date', text: str.parts.join(''), line }; }
    if (RESERVED.has(w)) s.fail(`"${t.text}" is a Thunder word and can't start a value here.`, null, 'TC105');

    const run = this.wordRun(s);
    // a record: "a Customer with name "Ann" and balance $10", "a new Customer"
    let off = run[0]?.lower === 'new' && run.length > 1 ? 1 : 0;
    const recK = this.longest(run.slice(off), (key) => this.names.records.has(key));
    const wantsRecord = o.article || off || isWord(s.peek(), 'with') || !this.longest(run, (key) => this.names.known.has(key));
    if (recK && wantsRecord && (recK + off === run.length)) {
      s.i -= run.length - off - recK;
      const name = keyOf(run.slice(off, off + recK));
      const fields = [];
      if (s.word('with')) {
        do {
          const fr = this.wordRun(s);
          if (!fr.length) s.fail(`I expected a field name after "with" (for example: with name "Ann").`, null, 'TC108');
          const fk = this.longest(fr, (key) => this.names.fields.has(key)) || fr.length;
          s.i -= fr.length - fk;
          fields.push({ name: keyOf(fr.slice(0, fk)), text: fr.slice(0, fk).map((x) => x.text).join(' '), e: this.expr(s, { noAnd: true }), line });
        } while ((isSym(s.peek(), ',') || isWord(s.peek(), 'and')) && this.fieldAhead(s, 1) && s.next());
      }
      return { k: 'new', record: name, fields, line };
    }
    off = 0;
    // a field taken from each item: "prices from orders"
    if (isWord(s.peek(), 'from')) {
      s.next();
      return { k: 'from', name: keyOf(run), text: run.map((x) => x.text).join(' '), list: this.unary(s, o), line };
    }
    const k = this.longest(run, (key) => this.names.known.has(key));
    if (k) {
      s.i -= run.length - k;
      const key = keyOf(run.slice(0, k));
      const text = run.slice(0, k).map((x) => x.text).join(' ');
      if (this.names.known.get(key) === 'func') {
        if (isSym(s.peek(), '(')) return { k: 'call', name: key, text, args: this.parenArgs(s), line };
        if (s.word('with')) return { k: 'call', name: key, text, args: this.withArgs(s), line };
        return { k: 'call', name: key, text, args: [], line, bare: true };
      }
      return { k: 'name', name: key, text, line };
    }
    const fk = this.longest(run, (key) => this.names.fields.has(key));
    if (fk) { s.i -= run.length - fk; return { k: 'name', name: keyOf(run.slice(0, fk)), text: run.slice(0, fk).map((x) => x.text).join(' '), line, unknown: true }; }
    // An unknown name: kept whole, so the checker can say exactly what it did not know.
    return { k: 'name', name: keyOf(run), text: run.map((x) => x.text).join(' '), line, unknown: true };
  }
}

// ---------------------------------------------------------------- statements

export function parseCore(source, { seed = null } = {}) {
  const { lines, diagnostics } = lex(source);
  const tree = buildBlocks(lines, diagnostics);
  const names = { known: new Map(seed?.known ?? []), fields: new Set(seed?.fields ?? []), records: new Set(seed?.records ?? []) };
  collectNames(tree, names);
  const ep = new ExprParser(names);
  const body = parseBlock(tree, ep, names, diagnostics, { top: true });
  return { kind: 'program', body, names, diagnostics };
}

function parseBlock(nodes, ep, names, diagnostics, ctx) {
  const out = [];
  for (const n of nodes) {
    try {
      const st = parseStatement(n, ep, names, diagnostics, ctx, out);
      if (st) out.push(st);
    } catch (e) {
      if (e instanceof CoreError) diagnostics.push(e.diagnostic); else throw e;
    }
  }
  return out;
}

function nameWords(ts, line, what) {
  const words = stripArticle(ts);
  if (!words.length) throw new CoreError(diag('TC108', line, `${what} is missing a name.`));
  for (const t of words) {
    if (t.t !== 'word') throw new CoreError(diag('TC105', line, `A name can only use words, but "${show(t)}" is not a word.`));
    if (RESERVED.has(t.lower)) throw new CoreError(diag('TC202', line, `A name can't contain the word "${t.text}", because it belongs to Thunder.`, `Try a name without "${t.text}".`));
  }
  return { name: keyOf(words), text: words.map((x) => x.text).join(' ') };
}

function parseStatement(n, ep, names, diagnostics, ctx, siblings) {
  const ts = n.tokens;
  const line = n.line;
  const E = (tokens, opts) => ep.parse(tokens, line, opts);
  const children = (c = ctx) => parseBlock(n.children, ep, names, diagnostics, c);
  const fail = (code, msg, hint) => { throw new CoreError(diag(code, line, msg, hint)); };
  const header = () => { if (!isSym(ts[ts.length - 1], ':')) fail('TC108', `This line should end with ":".`); return ts.slice(0, -1); };
  const w0 = ts[0].t === 'word' ? ts[0].lower : '';
  const rest = ts.slice(1);

  if (w0 === 'say' || w0 === 'print') return { k: 'say', e: E(rest), line };
  if (w0 === 'set') {
    const at = splitTop(rest, (t) => isWord(t, 'to'));
    if (at < 0) fail('TC108', '"Set" needs "to": Set total to 0.');
    const targetTs = stripArticle(rest.slice(0, at));
    if (!targetTs.length) fail('TC108', '"Set" is missing the name to set.');
    const target = allWords(targetTs) && !targetTs.some((t) => RESERVED.has(t.lower)) ? { k: 'name', ...nameWords(targetTs, line, '"Set"'), line } : E(targetTs);
    if (!['name', 'field', 'at'].includes(target.k)) fail('TC305', 'Only a name, a field (customer\'s balance), or an entry (counts at word) can be set.');
    return { k: 'set', target, e: E(rest.slice(at + 1)), line };
  }
  if (w0 === 'keep') {
    const at = splitTop(rest, (t) => isWord(t, 'at'));
    if (at < 0) fail('TC108', '"Keep" needs "at": Keep tax rate at 7%.');
    return { k: 'keep', ...nameWords(rest.slice(0, at), line, '"Keep"'), e: E(rest.slice(at + 1)), line };
  }
  if (w0 === 'give') {
    let r = rest;
    if (isWord(r[0], 'back')) r = r.slice(1);
    return { k: 'give', e: r.length ? E(r) : { k: 'nothing', line }, line };
  }
  if (w0 === 'stop') {
    let r = rest;
    if (isWord(r[0], 'with') || isSym(r[0], ':')) r = r.slice(1);
    return { k: 'stop', e: r.length ? E(r) : { k: 'str', parts: ['Stopped'], line }, line };
  }
  if (w0 === 'if' && keyOf(ts.slice(0, 3)) === 'if this fails') {
    header();
    const prev = siblings[siblings.length - 1];
    if (!prev || prev.k === 'func' || prev.k === 'record' || prev.k === 'test' || prev.k === 'tryFail') fail('TC110', '"If this fails:" goes right after the statement it protects.');
    siblings.pop();
    return { k: 'tryFail', stmt: prev, handler: children(), line };
  }
  if (w0 === 'when' || w0 === 'if') {
    const cond = E(header().slice(1));
    return { k: 'if', branches: [{ cond, body: children(), line }], otherwise: null, line };
  }
  if (w0 === 'otherwise') {
    const prev = siblings[siblings.length - 1];
    if (!prev || prev.k !== 'if' || prev.otherwise) fail('TC109', '"Otherwise" must come right after a "When" or "If" block (at the same indentation).');
    const h = header();
    if (h.length === 1) { prev.otherwise = children(); return null; }
    if (!isWord(h[1], 'when') && !isWord(h[1], 'if')) fail('TC108', 'Write "Otherwise:" or "Otherwise when <condition>:".');
    prev.branches.push({ cond: E(h.slice(2)), body: children(), line });
    return null;
  }
  if (w0 === 'for' && isWord(ts[1], 'each')) {
    const h = header().slice(2);
    const inAt = splitTop(h, (t) => isWord(t, 'in'));
    const fromAt = splitTop(h, (t) => isWord(t, 'from'));
    if (inAt >= 0) {
      const head = h.slice(0, inAt);
      const andAt = head.findIndex((t) => isWord(t, 'and'));
      const vars = andAt >= 0 ? [nameWords(head.slice(0, andAt), line, '"For each"'), nameWords(head.slice(andAt + 1), line, '"For each"')] : [nameWords(head, line, '"For each"')];
      return { k: 'each', vars, iter: E(h.slice(inAt + 1)), body: children(), line };
    }
    if (fromAt >= 0) {
      const toAt = splitTop(h, (t) => isWord(t, 'to'));
      if (toAt < 0) fail('TC108', '"For each … from" needs "to": For each n from 1 to 10:');
      return { k: 'range', v: nameWords(h.slice(0, fromAt), line, '"For each"'), from: E(h.slice(fromAt + 1, toAt)), to: E(h.slice(toAt + 1)), body: children(), line };
    }
    fail('TC108', 'Write "For each item in list:" or "For each n from 1 to 10:".');
  }
  if (w0 === 'repeat') {
    const h = header().slice(1);
    if (isWord(h[0], 'while')) return { k: 'while', cond: E(h.slice(1)), body: children(), line };
    if (isWord(h[0], 'until')) return { k: 'while', until: true, cond: E(h.slice(1)), body: children(), line };
    if (isWord(h[h.length - 1], 'times')) return { k: 'times', count: E(h.slice(0, -1)), body: children(), line };
    fail('TC108', 'Write "Repeat while <condition>:", "Repeat until <condition>:", or "Repeat 3 times:".');
  }
  if (w0 === 'to' && isSym(ts[ts.length - 1], ':')) {
    if (!ctx.top) fail('TC402', 'A "To" block (a function) must be written at the left edge, not inside another block.');
    const { name, text } = nameWords(header().slice(1), line, '"To"');
    const kids = n.children;
    let params = [];
    let bodyNodes = kids;
    // One "Receive" line, or several in a row ("Receive total as a number", "Receive member as yes or no").
    let r = 0;
    while (kids[r] && isWord(kids[r].tokens[0], 'receive')) {
      const kid = kids[r];
      params.push(...paramGroups(kid.tokens.slice(1)).map((p) => ({ ...nameWords(p.words, kid.line, '"Receive"'), type: p.typeTokens ? typeOf(ep, p.typeTokens, kid.line) : null, line: kid.line })));
      r++;
    }
    bodyNodes = kids.slice(r);
    return { k: 'func', name, text, params, body: parseBlock(bodyNodes, ep, names, diagnostics, { inFunc: true }), line };
  }
  if (w0 === 'receive') fail('TC111', '"Receive" must be the first line inside a "To" block.');
  if ((w0 === 'a' || w0 === 'an') && isWord(ts[ts.length - 2], 'has') && isSym(ts[ts.length - 1], ':')) {
    if (!ctx.top) fail('TC402', 'A record ("A … has:") must be written at the left edge, not inside another block.');
    const { name, text } = nameWords(ts.slice(1, -2), line, 'A record');
    const fields = [], rules = [];
    for (const c of n.children) {
      try {
        if (isWord(c.tokens[0], 'never')) { rules.push(parseNever(c.tokens, c.line, ep)); continue; }
        const k = c.tokens.findIndex((t) => isWord(t, 'is') || isWord(t, 'are'));
        if (k <= 0) throw new CoreError(diag('TC108', c.line, 'A field is written "<name> is <kind>", for example: Balance is money.'));
        fields.push({ ...nameWords(c.tokens.slice(0, k), c.line, 'A field'), type: typeOf(ep, c.tokens.slice(k + 1), c.line), line: c.line });
      } catch (e) { if (e instanceof CoreError) diagnostics.push(e.diagnostic); else throw e; }
    }
    return { k: 'record', name, text, fields, rules, line };
  }
  if (w0 === 'expect') return { ...parseExpect(rest, line, ep), raw: n.raw };
  if (w0 === 'never') return parseNever(ts, line, ep);
  if (w0 === 'use') {
    if (!ctx.top) fail('TC402', '"Use" must be written at the left edge of the file.');
    const asAt = rest.findIndex((t) => isWord(t, 'as'));
    const modTs = asAt < 0 ? rest : rest.slice(0, asAt);
    const module = modTs.map((t) => (t.t === 'word' ? t.text : t.t === 'sym' && t.text === '.' ? '.' : '\u0000')).join('');
    if (!module || module.includes('\u0000') || !/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/.test(module)) fail('TC108', 'Write "Use <python module> as <name>", for example: Use csv as csv.');
    const alias = asAt < 0 ? { name: module.split('.')[0].toLowerCase(), text: module.split('.')[0] } : nameWords(rest.slice(asAt + 1), line, '"Use"');
    return { k: 'use', module, ...alias, line };
  }
  if (w0 === 'test') {
    if (!ctx.top) fail('TC402', 'A "Test" block must be written at the left edge of the file.');
    const h = header().slice(1);
    const title = h.length === 1 && h[0].t === 'str' ? h[0].parts.filter((p) => typeof p === 'string').join('') : h.map((t) => show(t)).join(' ');
    if (!title) fail('TC108', 'A test needs a name: Test "members get 20% off":');
    return { k: 'test', title, body: children({ inFunc: true, inTest: true }), line };
  }
  if (w0 === 'add' || w0 === 'remove') {
    const word = w0 === 'add' ? 'to' : 'from';
    const at = lastTop(rest, (t) => isWord(t, word));
    if (at < 0) fail('TC108', w0 === 'add' ? '"Add" needs "to": Add 5 to total, or Add order to orders.' : '"Remove" needs "from": Remove item from cart.');
    return { k: w0, e: E(rest.slice(0, at)), target: E(rest.slice(at + 1)), line };
  }
  if (w0 === 'increase' || w0 === 'decrease') {
    const at = splitTop(rest, (t) => isWord(t, 'by'));
    if (at < 0) fail('TC108', `"${ts[0].text}" needs "by": ${ts[0].text} balance by 10.`);
    return { k: w0, target: E(rest.slice(0, at)), e: E(rest.slice(at + 1)), line };
  }
  if (w0 === 'sort') {
    const at = splitTop(rest, (t) => isWord(t, 'by'));
    const target = E(at < 0 ? rest : rest.slice(0, at));
    let by = null, desc = false, text = null;
    if (at >= 0) {
      let f = rest.slice(at + 1);
      if (isWord(f[f.length - 1], 'descending')) { desc = true; f = f.slice(0, -1); } else if (isWord(f[f.length - 1], 'ascending')) f = f.slice(0, -1);
      by = keyOf(f); text = f.map((x) => x.text).join(' ');
    }
    return { k: 'sort', target, by, text, desc, line };
  }
  if (w0 === 'reverse') return { k: 'reverse', target: E(rest), line };

  // A call used as a statement: "greet with "Ann"", "csv.writer(out)".
  if (ts[0].t === 'word' && !RESERVED.has(w0)) {
    const run = [];
    for (const t of ts) { if (t.t === 'word' && !RESERVED.has(t.lower)) run.push(t); else break; }
    const known = ep.longest(run, (key) => names.known.has(key));
    if (!known) {
      const restTs = ts.slice(1);
      return { k: 'unknownVerb', verb: ts[0].text, object: restTs.length ? safeParse(ep, restTs, line) : null, line, raw: n.raw };
    }
  }
  const e = E(ts);
  if (e.k !== 'call' && !(e.k === 'dot' && e.args)) fail('TC401', `I don't know what to do with "${n.raw}".`, `A line starts with an action: ${STATEMENT_WORDS.slice(0, 12).join(', ')}, …`);
  return { k: 'do', e, line };
}

function safeParse(ep, ts, line) { try { return ep.parse(ts, line); } catch { return null; } }

function typeOf(ep, tokens, line) {
  const s = new Stream(tokens, line);
  const t = ep.typeRef(s);
  if (!s.done()) s.fail(`I understood the kind of value up to "${show(s.peek())}", but not after it.`, null, 'TC112');
  return t;
}

function parseExpect(rest, line, ep) {
  const at = splitTop(rest, (t, k) => isWord(t, 'to') && (isWord(rest[k + 1], 'be') || isWord(rest[k + 1], 'fail') || isWord(rest[k + 1], 'contain')));
  if (at < 0) return { k: 'expect', mode: 'true', e: ep.parse(rest, line), line, text: rest.map(show).join(' ') };
  const actual = ep.parse(rest.slice(0, at), line);
  const tail = rest.slice(at + 1);
  if (isWord(tail[0], 'fail')) {
    let msg = null;
    if (isWord(tail[1], 'with')) msg = ep.parse(tail.slice(2), line);
    else if (tail.length > 1) throw new CoreError(diag('TC112', line, 'Write "Expect <action> to fail" or "Expect <action> to fail with "message"".'));
    return { k: 'expect', mode: 'fail', e: actual, msg, line };
  }
  if (isWord(tail[0], 'contain')) return { k: 'expect', mode: 'cmp', op: 'contains', e: actual, want: ep.parse(tail.slice(1), line), line };
  // to be …: reuse the comparison words by parsing "<actual> is …"
  const s = new Stream([{ t: 'word', text: 'is', lower: 'is' }, ...tail.slice(1)], line);
  const placeholder = { k: 'hole', line };
  const fake = new ExprParser(ep.names);
  fake.add = function (st, o) { if (st.i === 0) return placeholder; return ExprParser.prototype.add.call(this, st, o); };
  const cmp = fake.cmp(s, {});
  if (!s.done()) throw new CoreError(diag('TC112', line, `I understood "Expect … to be" up to "${show(s.peek())}", but not after it.`));
  return { k: 'expect', mode: 'be', e: actual, check: cmp, line };
}

// Never allow a negative quantity | Never allow quantity to be negative | Never allow balance is less than 0
function parseNever(ts, line, ep) {
  if (!isWord(ts[1], 'allow')) throw new CoreError(diag('TC108', line, 'Write "Never allow …", for example: Never allow a negative quantity.'));
  let r = ts.slice(2);
  const text = `Never allow ${r.map(show).join(' ')}`;
  const ADJ = { negative: 'negative', zero: 'zero', empty: 'empty', missing: 'nothing' };
  const r2 = stripArticle(r);
  if (r2[0]?.t === 'word' && ADJ[r2[0].lower] && allWords(r2.slice(1)) && r2.length > 1) {
    const subj = { k: 'name', name: keyOf(r2.slice(1)), text: r2.slice(1).map((x) => x.text).join(' '), line };
    const adj = ADJ[r2[0].lower];
    return { k: 'never', text, cond: adj === 'nothing' ? { k: 'isNothing', e: subj, neg: false, line } : { k: 'adj', adj, e: subj, line }, line };
  }
  const toBe = splitTop(r, (t, k) => isWord(t, 'to') && isWord(r[k + 1], 'be'));
  if (toBe > 0) r = [...r.slice(0, toBe), { t: 'word', text: 'is', lower: 'is' }, ...r.slice(toBe + 2)];
  return { k: 'never', text, cond: ep.parse(r, line), line };
}

export { closest };
