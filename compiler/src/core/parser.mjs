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
    } else if (w0 === 'store' && ts.some((t) => isWord(t, 'as'))) {
      const k = splitTop(ts, (t) => isWord(t, 'as'));
      add('const', stripArticle(ts.slice(1, k)));
    } else if (w0 === 'receive') {
      for (const p of paramGroups(ts.slice(1))) add('var', p.words);
    } else if (w0 === 'for' && isWord(ts[1], 'each')) {
      const k = splitTop(ts, (t) => isWord(t, 'in') || isWord(t, 'from'));
      const head = ts.slice(2, k < 0 ? ts.length : k);
      const andAt = head.findIndex((t) => isWord(t, 'and'));
      if (andAt >= 0) { add('var', head.slice(0, andAt)); add('var', head.slice(andAt + 1)); } else add('var', head);
    } else if (w0 === 'to' && isSym(ts[ts.length - 1], ':')) {
      add('func', ts.slice(1, -1));
      // Its inputs, in order (for a call written with names): every Receive line at the top of the block.
      const inputs = [];
      for (const c of n.children) {
        if (!isWord(c.tokens[0], 'receive')) break;
        for (const p of paramGroups(c.tokens.slice(1))) inputs.push({ key: keyOf(p.words), text: p.words.map((x) => x.text).join(' '), defaultTokens: p.defaultTokens });
      }
      names.funcInputs.set(keyOf(ts.slice(1, -1)), inputs);
    } else if ((w0 === 'a' || w0 === 'an') && isOneOf(ts)) {
      // A Payment is one of: its alternatives (Successful with amount as money) and their fields, and "which".
      const words = ts.slice(1, -4);
      add('record', words);
      const own = ['which'];
      const alts = [];
      for (const c of n.children) {
        const at = c.tokens.findIndex((t) => isWord(t, 'with'));
        const altWords = stripArticle(at < 0 ? c.tokens : c.tokens.slice(0, at));
        if (altWords.length) { alts.push(keyOf(altWords)); names.alts.set(keyOf(altWords), [...(names.alts.get(keyOf(altWords)) ?? []), keyOf(words)]); }
        if (at >= 0) for (const g of paramGroups(c.tokens.slice(at + 1))) if (g.words.length) { names.fields.add(keyOf(g.words)); own.push(keyOf(g.words)); }
      }
      names.fields.add('which');
      names.recordFields.set(keyOf(words), [...new Set(own)]);
      names.recordText.set(keyOf(words), words.map((x) => x.text).join(' '));
      names.altsOf.set(keyOf(words), alts);
    } else if ((w0 === 'a' || w0 === 'an') && isWord(ts[ts.length - 2], 'has')) {
      const words = ts.slice(1, -2);
      add('record', words);
      const own = [];
      for (const c of n.children) {
        const k = c.tokens.findIndex((t) => isWord(t, 'is'));
        if (k > 0 && !isWord(c.tokens[0], 'never')) { names.fields.add(keyOf(c.tokens.slice(0, k))); own.push(keyOf(c.tokens.slice(0, k))); }
      }
      names.recordFields.set(keyOf(words), own);
      names.recordText.set(keyOf(words), words.map((x) => x.text).join(' '));
    } else if (w0 === 'use') {
      const k = ts.findIndex((t) => isWord(t, 'as'));
      if (k > 0) add('module', ts.slice(k + 1)); else if (ts[1]?.t === 'word') add('module', [ts[1]]);
    } else if (w0 === 'if' && keyOf(ts.slice(0, 3)) === 'if this fails') {
      add('var', [{ lower: 'error' }]);
    } else if (w0 === 'screen' && isSym(ts[ts.length - 1], ':')) {
      // A screen: its name (for "Show <screen>" and "opens <screen>") and its inputs, in order.
      const inputs = [];
      for (const c of n.children) {
        if (!isWord(c.tokens[0], 'receive')) break;
        for (const p of paramGroups(c.tokens.slice(1))) inputs.push({ key: keyOf(p.words), text: p.words.map((x) => x.text).join(' '), defaultTokens: p.defaultTokens });
      }
      const words = stripArticle(ts.slice(1, -1));
      names.screens.set(keyOf(words), { text: words.map((x) => x.text).join(' '), inputs });
    } else if (w0 === 'remember') {
      add('var', rememberName(ts.slice(1)));
    } else if (w0 === 'show' && keyOf(ts.slice(1, 5)) === 'a list with each') {
      const k = splitTop(ts, (t) => isWord(t, 'in'));
      add('var', ts.slice(5, k < 0 ? ts.length : k));
    }
    collectNames(n.children, names);
  }
}

// "coupon as text, starting at \"\"" / "count starting at 0": the name a Remember line declares.
function rememberName(ts) {
  const end = ts.findIndex((t) => isWord(t, 'as') || isWord(t, 'starting') || isSym(t, ','));
  return stripArticle(end < 0 ? ts : ts.slice(0, end));
}

// "total and member", "total as money, member as yes/no", "price and rate (7% if not given)"
/** "A Payment is one of:": a data type with alternatives. */
function isOneOf(ts) {
  const n = ts.length;
  return n >= 6 && isSym(ts[n - 1], ':') && isWord(ts[n - 2], 'of') && isWord(ts[n - 3], 'one') && isWord(ts[n - 4], 'is');
}

function paramGroups(ts) {
  const groups = [];
  let cur = [];
  let depth = 0;
  for (const t of ts) {
    if (isSym(t, '(')) depth++;
    if (isSym(t, ')')) depth--;
    if (depth === 0 && (isSym(t, ',') || isWord(t, 'and'))) { if (cur.length) groups.push(cur); cur = []; } else cur.push(t);
  }
  if (cur.length) groups.push(cur);
  return groups.map((g) => {
    // A default: "(<value> if not given)" at the end of the input.
    let defaultTokens = null;
    if (isSym(g[g.length - 1], ')')) {
      let d = 0, open = -1;
      for (let i = g.length - 1; i >= 0; i--) { if (isSym(g[i], ')')) d++; if (isSym(g[i], '(')) { d--; if (d === 0) { open = i; break; } } }
      const inner = open >= 0 ? g.slice(open + 1, -1) : [];
      const n = inner.length;
      if (n > 3 && isWord(inner[n - 3], 'if') && isWord(inner[n - 2], 'not') && isWord(inner[n - 1], 'given')) { defaultTokens = inner.slice(0, -3); g = g.slice(0, open); }
    }
    const k = g.findIndex((t) => isWord(t, 'as'));
    const raw = k < 0 ? g : g.slice(0, k);
    return { words: stripArticle(raw), raw, typeTokens: k < 0 ? null : g.slice(k + 1), defaultTokens };
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
      // payment is successful: which alternative of a data type it is (a name of a value comes first).
      if (this.names.alts?.size && s.peek()?.t === 'word') {
        const run = []; for (let j = s.i; s.ts[j]?.t === 'word' && !RESERVED.has(s.ts[j].lower); j++) run.push(s.ts[j]);
        const ak = this.longest(run, (key) => this.names.alts.has(key));
        if (ak && !this.longest(run, (key) => this.names.known.has(key))) {
          s.i += ak;
          return wrap({ k: 'isAlt', e: l, alt: keyOf(run.slice(0, ak)), text: run.slice(0, ak).map((x) => x.text).join(' '), line });
        }
      }
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

  /** The fields a record is built with: with name "Ann" and balance $10 (none without "with"). */
  recordFields(s, line) {
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
    return fields;
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
    // A hole in a draft: ? alone, or ?number / ?money / ?Habit with the kind written right after it. It never runs;
    // the checker says what could go here and asks (TC120).
    if (isSym(t, '?')) {
      s.next();
      const next = s.peek();
      let want = null;
      // A word right against the ? is its kind, so a misspelt kind is reported as one.
      if (next && next.t === 'word' && t.col != null && next.col === t.col + 1) want = this.typeRef(s);
      return { k: 'draftHole', want, line, col: t.col };
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
    // an alternative of a data type: "a successful Payment with amount $5", "a pending Payment"
    if (o.article && this.names.alts?.size) {
      for (let i = 1; i < run.length; i++) {
        const alt = keyOf(run.slice(0, i));
        const recs = this.names.alts.get(alt);
        if (!recs) continue;
        const rk = this.longest(run.slice(i), (key) => recs.includes(key));
        if (!rk || i + rk !== run.length) continue;
        s.i -= run.length - i - rk;
        const node = { k: 'new', record: keyOf(run.slice(i, i + rk)), alt, altText: run.slice(0, i).map((x) => x.text).join(' '), fields: this.recordFields(s, line), line };
        return node;
      }
      // "a refunded Payment": words before a data type that has alternatives, but not one of them (the checker says so).
      for (let i = 1; i < run.length; i++) {
        const rk = this.longest(run.slice(i), (key) => this.names.altsOf.has(key));
        if (!rk || i + rk !== run.length) continue;
        s.i -= run.length - i - rk;
        return { k: 'new', record: keyOf(run.slice(i, i + rk)), alt: keyOf(run.slice(0, i)), altText: run.slice(0, i).map((x) => x.text).join(' '), fields: this.recordFields(s, line), line };
      }
    }
    // a record: "a Customer with name "Ann" and balance $10", "a new Customer"
    let off = run[0]?.lower === 'new' && run.length > 1 ? 1 : 0;
    const recK = this.longest(run.slice(off), (key) => this.names.records.has(key));
    const wantsRecord = o.article || off || isWord(s.peek(), 'with') || !this.longest(run, (key) => this.names.known.has(key));
    if (recK && wantsRecord && (recK + off === run.length)) {
      s.i -= run.length - off - recK;
      const name = keyOf(run.slice(off, off + recK));
      const fields = this.recordFields(s, line);
      const node = { k: 'new', record: name, fields, line };
      if (!fields.length && this.open) this.open.push(node); // a block of "field: value" lines may fill it
      return node;
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
        const node = { k: 'call', name: key, text, args: [], line, bare: true };
        if (this.open) this.open.push(node); // a block of "input: value" lines may fill it
        return node;
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
  const names = { known: new Map(seed?.known ?? []), fields: new Set(seed?.fields ?? []), records: new Set(seed?.records ?? []), recordFields: new Map(seed?.recordFields ?? []), funcInputs: new Map(seed?.funcInputs ?? []), recordText: new Map(), screens: new Map(), alts: new Map(seed?.alts ?? []), altsOf: new Map(seed?.altsOf ?? []) };
  collectNames(tree, names);
  const ep = new ExprParser(names);
  const body = parseBlock(tree, ep, names, diagnostics, { top: true });
  return { kind: 'program', body, names, diagnostics };
}

function parseBlock(nodes, ep, names, diagnostics, ctx) {
  const out = [];
  for (const n of nodes) {
    try {
      const lines = fieldBlock(n, diagnostics);
      if (lines) {
        // A record or a call written as a block: "Set trade to a Trade:" / "Set profit to calculate profit:", with
        // one "name: value" line each under it. The head is read as usual; its record (or call) gets the values.
        ep.open = [];
        let st, open;
        try { st = parseStatement({ ...n, tokens: n.tokens.slice(0, -1), raw: n.raw.replace(/\s*:\s*(#.*)?$/, ''), children: [] }, ep, names, diagnostics, ctx, out); }
        finally { open = ep.open; ep.open = null; }
        fillBlock(open, lines, n, ep, names);
        if (st) out.push(st);
        continue;
      }
      const st = parseStatement(n, ep, names, diagnostics, ctx, out);
      if (st) out.push(st);
    } catch (e) {
      if (e instanceof CoreError) diagnostics.push(e.diagnostic); else throw e;
    }
  }
  return out;
}

// Statements whose ":" opens a block of statements (never a block of "name: value" lines).
const BLOCK_STATEMENTS = new Set(['when', 'if', 'otherwise', 'for', 'repeat', 'to', 'test', 'receive', 'never', 'use', 'screen', 'depending']);

/** The "name: value" lines under a statement that is not itself a block statement, or null. */
function fieldBlock(n, diagnostics = []) {
  const ts = n.tokens;
  if (!n.children.length || !isSym(ts[ts.length - 1], ':')) return null;
  const w0 = ts[0]?.t === 'word' ? ts[0].lower : '';
  if (BLOCK_STATEMENTS.has(w0) || ((w0 === 'a' || w0 === 'an') && (isWord(ts[ts.length - 2], 'has') || isOneOf(ts)))) return null;
  return n.children.map((c) => {
    const colon = c.tokens.findIndex((t) => isSym(t, ':'));
    const nameTs = colon > 0 ? c.tokens.slice(0, colon) : [];
    if (colon <= 0 || !allWords(nameTs) || c.children.length) {
      throw new CoreError(diag('TC113', c.line, `Each line under "${n.raw.trim()}" should be "name: value", like: quantity: 10.`, c.children.length ? 'A value under a block cannot open a block of its own.' : 'Put the name, then ":", then the value.'));
    }
    const valueTs = c.tokens.slice(colon + 1);
    if (!valueTs.length) {
      // (The block reader also said this line opens nothing; one message is enough.)
      for (let i = diagnostics.length - 1; i >= 0; i--) if (diagnostics[i].code === 'TC103' && diagnostics[i].line === c.line) diagnostics.splice(i, 1);
      throw new CoreError(diag('TC113', c.line, `"${nameTs.map((x) => x.text).join(' ')}:" has no value after it.`, `Write the value after the ":", like: ${nameTs.map((x) => x.text).join(' ')}: 10.`));
    }
    return { key: keyOf(nameTs), text: nameTs.map((x) => x.text).join(' '), valueTs, line: c.line };
  });
}

/** Give the record (or the call) on the head line the values from its "name: value" lines. */
function fillBlock(open, lines, n, ep, names) {
  const target = open[open.length - 1];
  if (!target) {
    throw new CoreError(diag('TC117', n.line, `"${n.raw.trim()}" ends with ":", but there is no record or function call at its end to give the lines under it to.`,
      'Lines like "quantity: 10" give values to a record (Set trade to a Trade:) or to a function (Set profit to calculate profit:).'));
  }
  const seen = new Map();
  for (const l of lines) {
    if (seen.has(l.key)) throw new CoreError(diag('TC114', l.line, `"${l.text}" is given twice (also on line ${seen.get(l.key)}).`, 'Give each value once.'));
    seen.set(l.key, l.line);
  }
  // Values are read as on one line, and keep the head's line, so the program is exactly the one-line form.
  const value = (l) => ep.parse(l.valueTs, n.line);
  if (target.k === 'new') {
    const own = names.recordFields.get(target.record);
    for (const l of lines) {
      if (own && !own.includes(l.key)) {
        const near = closest(l.key, own);
        const rec = names.recordText.get(target.record) ?? target.record;
        throw new CoreError(diag('TC206', l.line, `${/^[aeiouAEIOU]/.test(rec) ? 'An' : 'A'} ${rec} has no field "${l.text}".${near ? ` Did you mean "${near}"?` : ''}`, own.length ? `Its fields: ${own.join(', ')}.` : null));
      }
      target.fields.push({ name: l.key, text: l.text, e: value(l), line: n.line });
    }
    return;
  }
  // A call written with names: the values go in the order of the function's inputs.
  const inputs = names.funcInputs.get(target.name);
  if (!inputs) throw new CoreError(diag('TC115', n.line, `I don't know the inputs of "${target.text}" here, so it can't be called with names.`, `Give the values in order: ${target.text} with … and …`));
  const keys = inputs.map((p) => p.key);
  for (const l of lines) {
    if (!keys.includes(l.key)) {
      const near = closest(l.key, keys);
      throw new CoreError(diag('TC115', l.line, `"${target.text}" has no input called "${l.text}".${near ? ` Did you mean "${near}"?` : ''}`, keys.length ? `Its inputs: ${keys.join(', ')}.` : `"${target.text}" receives no inputs.`));
    }
  }
  const last = Math.max(...lines.map((l) => keys.indexOf(l.key)));
  const args = [];
  for (let i = 0; i <= last; i++) {
    const given = lines.find((l) => l.key === keys[i]);
    if (given) args.push(value(given));
    else if (inputs[i].defaultTokens) args.push(ep.parse(inputs[i].defaultTokens, n.line)); // left out: its default
    else throw new CoreError(diag('TC116', n.line, `"${target.text}" needs "${inputs[i].text}", but it is not given.`, `Add a line: ${inputs[i].text}: …`));
  }
  for (let i = last + 1; i < inputs.length; i++) {
    if (!inputs[i].defaultTokens) throw new CoreError(diag('TC116', n.line, `"${target.text}" needs "${inputs[i].text}", but it is not given.`, `Add a line: ${inputs[i].text}: …`));
  }
  target.args = args;
  delete target.bare;
}

function nameWords(ts, line, what) {
  const words = stripArticle(ts);
  if (!words.length) {
    // The name was only "a", "an", or "the": Thunder skips those words in a name ("the total" is "total").
    const only = ts.length === 1 && ts[0].t === 'word' ? ts[0].text : null;
    if (only) throw new CoreError(diag('TC108', line, `"${only}" can't be a name on its own: Thunder skips "a", "an", and "the" in names ("the total" is "total").`, `Use a word that says what it holds, like "first number" or "amount".`));
    throw new CoreError(diag('TC108', line, `${what} is missing a name.`));
  }
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
  // Store <name> as a list of <Record>: a list that is saved between runs (data/<name>.json).
  if (w0 === 'store' && rest.some((t) => isWord(t, 'as'))) {
    if (!ctx.top) fail('TC402', 'A "Store" line must be written at the left edge of the file.');
    const as = splitTop(rest, (t) => isWord(t, 'as'));
    const typeTokens = stripArticle(rest.slice(as + 1));
    if (!typeTokens.length) fail('TC108', 'Write what the store holds: Store habits as a list of Habit.');
    return { k: 'store', ...nameWords(rest.slice(0, as), line, '"Store"'), type: typeOf(ep, typeTokens, line), line };
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
  // Depending on payment:  /  Successful: …  /  Declined: …  /  Otherwise: …
  if (w0 === 'depending' && isWord(ts[1], 'on')) {
    const subject = E(header().slice(2));
    const cases = [];
    let otherwise = null;
    for (const c of n.children) {
      try {
        const ct = c.tokens;
        if (!isSym(ct[ct.length - 1], ':') || ct.length < 2) throw new CoreError(diag('TC108', c.line, 'Under "Depending on", each case is an alternative and a colon, for example: Successful:'));
        const sub = parseBlock(c.children, ep, names, diagnostics, ctx);
        if (ct.length === 2 && isWord(ct[0], 'otherwise')) { otherwise = sub; continue; }
        const { name, text } = nameWords(ct.slice(0, -1), c.line, 'A case');
        cases.push({ alt: name, text, body: sub, line: c.line });
      } catch (e) { if (e instanceof CoreError) diagnostics.push(e.diagnostic); else throw e; }
    }
    return { k: 'depending', subject, cases, otherwise, line };
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
      params.push(...paramGroups(kid.tokens.slice(1)).map((p) => ({ ...nameWords(p.raw, kid.line, '"Receive"'), type: p.typeTokens ? typeOf(ep, p.typeTokens, kid.line) : null, dflt: p.defaultTokens ? ep.parse(p.defaultTokens, kid.line) : null, line: kid.line })));
      r++;
    }
    bodyNodes = kids.slice(r);
    return { k: 'func', name, text, params, body: parseBlock(bodyNodes, ep, names, diagnostics, { inFunc: true }), line };
  }
  if (w0 === 'receive') fail('TC111', '"Receive" must be the first line inside a "To" block or a "Screen".');
  if (w0 === 'screen' && isSym(ts[ts.length - 1], ':')) {
    if (!ctx.top) fail('TC402', 'A "Screen" must be written at the left edge, not inside another block.');
    return parseScreen(n, ep, names, diagnostics);
  }
  if (w0 === 'open' && ctx.inPress) {
    const { name, text } = nameWords(rest, line, '"Open"');
    return { k: 'open', name, text, line };
  }
  if (w0 === 'remember') fail('TC119', '"Remember" goes at the top of a "Screen", after its "Receive" lines.', 'A function keeps nothing between calls; a screen remembers values while it is shown.');
  if (w0 === 'show') fail('TC118', '"Show" is used inside a "Screen" (a screen shows things). In a program, write: Say …');
  // A Payment is one of:
  //   Successful with amount as money
  //   Declined with reason as text
  //   Pending
  // A record underneath: "which" (the alternative's name) and every alternative's fields, each optional. The checker
  // makes sure a field is only read where the alternative is known, and that "Depending on" covers every one.
  if ((w0 === 'a' || w0 === 'an') && isOneOf(ts)) {
    if (!ctx.top) fail('TC402', 'A data type ("A … is one of:") must be written at the left edge, not inside another block.');
    const { name, text } = nameWords(ts.slice(1, -4), line, 'A data type');
    const alts = [];
    for (const c of n.children) {
      try {
        const at = c.tokens.findIndex((t) => isWord(t, 'with'));
        const alt = nameWords(at < 0 ? c.tokens : c.tokens.slice(0, at), c.line, 'An alternative');
        const fields = [];
        if (at >= 0) {
          for (const g of paramGroups(c.tokens.slice(at + 1))) {
            if (!g.typeTokens) throw new CoreError(diag('TC108', c.line, `Write each field with its kind: ${alt.text} with ${g.words.map((x) => x.text).join(' ') || 'amount'} as money.`));
            fields.push({ ...nameWords(g.raw, c.line, 'A field'), type: typeOf(ep, g.typeTokens, c.line), line: c.line });
          }
        }
        alts.push({ ...alt, fields, line: c.line });
      } catch (e) { if (e instanceof CoreError) diagnostics.push(e.diagnostic); else throw e; }
    }
    if (!alts.length) fail('TC108', `Write the alternatives under it, one per line, for example: Successful with amount as money.`);
    const opt = (t) => (t.k === 'optional' ? t : { k: 'optional', of: t });
    const fields = [{ name: 'which', text: 'which', type: { k: 'text' }, line, hidden: true }];
    for (const a of alts) for (const f of a.fields) if (!fields.some((x) => x.name === f.name)) fields.push({ ...f, type: opt(f.type) });
    return { k: 'record', name, text, fields, rules: [], alts, line };
  }
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
    // Use <python module> [from Python] [as <name>]   or   Use "<npm package>" from npm as <name>
    //   or   Use "<.NET type>" from .NET as <name>   or   Use "<.NET type>" from NuGet "<package>" version "<v>" as <name>
    const asAt = rest.findIndex((t) => isWord(t, 'as'));
    let modTs = asAt < 0 ? rest : rest.slice(0, asAt);
    const fromAt = modTs.findIndex((t) => isWord(t, 'from'));
    let ecosystem = 'python';
    if (fromAt >= 0) {
      const eco = modTs.slice(fromAt + 1);
      const plain = (t) => t && typeof t.parts === 'undefined' ? null : t && t.parts.every((x) => typeof x === 'string') ? t.parts.join('') : null;
      const word0 = eco[0]?.t === 'word' ? eco[0].text.toLowerCase() : '';
      let said = eco.length === 1 && eco[0].t === 'word' ? word0 : '';
      // ".NET" is read as a dot and the word NET.
      if (eco.length === 2 && eco[0].t === 'sym' && eco[0].text === '.' && eco[1].t === 'word' && eco[1].text.toLowerCase() === 'net') said = 'dotnet';
      if (word0 === 'nuget') {
        // NuGet "<package>" version "<version>": the package and its exact version, so every build gets the same code.
        const pkg = eco[1]?.t === 'str' ? plain(eco[1]) : null;
        const ver = isWord(eco[2], 'version') && eco[3]?.t === 'str' ? plain(eco[3]) : null;
        if (!pkg || !ver || eco.length !== 4 || !/^[A-Za-z0-9_.-]+$/.test(pkg) || !/^\d+(\.\d+){1,3}([-+][\w.-]+)?$/.test(ver)) fail('TC108', 'Name the NuGet package and its version: Use "Humanizer.NumberToWordsExtension" from NuGet "Humanizer.Core" version "2.14.1" as words.');
        said = 'nuget';
        modTs = modTs.slice(0, fromAt);
        ecosystem = said;
        var nuget = { package: pkg, version: ver };
      } else {
        if (!['python', 'npm', 'dotnet'].includes(said)) fail('TC108', `A library comes from Python, npm, .NET, or NuGet, for example: Use csv from Python as csv, Use "date-fns" from npm as dates, or Use "System.IO.Path" from .NET as paths.`);
        ecosystem = said;
        modTs = modTs.slice(0, fromAt);
      }
    }
    if (ecosystem === 'dotnet' || ecosystem === 'nuget') {
      const t = modTs[0];
      const type = modTs.length === 1 && t.t === 'str' && t.parts.every((x) => typeof x === 'string') ? t.parts.join('') : null;
      if (type == null || !/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)+$/.test(type)) fail('TC108', 'Write a .NET type with its namespace, in quotes, for example: Use "System.IO.Path" from .NET as paths.');
      if (asAt < 0) fail('TC108', `Give the type a name to use in Thunder: Use "${type}" from ${ecosystem === 'nuget' ? 'NuGet' : '.NET'} … as <name>.`);
      return { k: 'use', module: type, ecosystem, ...(ecosystem === 'nuget' ? nuget : {}), ...nameWords(rest.slice(asAt + 1), line, '"Use"'), line };
    }
    if (ecosystem === 'npm' || modTs[0]?.t === 'str') {
      const t = modTs[0];
      const pkg = modTs.length === 1 && t.t === 'str' && t.parts.every((x) => typeof x === 'string') ? t.parts.join('') : null;
      if (pkg == null || !/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(\/[\w.-]+)*$|^node:[a-z_/]+$/i.test(pkg)) fail('TC108', 'Write an npm package in quotes, for example: Use "date-fns" from npm as dates.');
      if (ecosystem !== 'npm') fail('TC108', `Say where "${pkg}" comes from: Use "${pkg}" from npm as <name>.`);
      if (asAt < 0) fail('TC108', `Give the package a name to use in Thunder: Use "${pkg}" from npm as <name>.`);
      return { k: 'use', module: pkg, ecosystem, ...nameWords(rest.slice(asAt + 1), line, '"Use"'), line };
    }
    const module = modTs.map((t) => (t.t === 'word' ? t.text : t.t === 'sym' && t.text === '.' ? '.' : '\u0000')).join('');
    if (!module || module.includes('\u0000') || !/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/.test(module)) fail('TC108', 'Write "Use <python module> as <name>", for example: Use csv as csv. For npm: Use "date-fns" from npm as dates.');
    const alias = asAt < 0 ? { name: module.split('.')[0].toLowerCase(), text: module.split('.')[0] } : nameWords(rest.slice(asAt + 1), line, '"Use"');
    return { k: 'use', module, ecosystem, ...alias, line };
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

// ---------------------------------------------------------------- screens

// Screen Cart:
//   Receive items as a list of Item, title as text ("Your cart" if not given)
//   Remember coupon as text, starting at ""
//   Show a heading: title
//   When items is empty:
//     Show "Your cart is empty"
//   Otherwise:
//     Show a list with each item in items:
//       Show "{item's name}: {item's price}"
//   Show a text box "Coupon code" for coupon
//   Show a button "Checkout" (off when items is empty):
//     When pressed:
//       …steps…
//   Show a button "Back" that opens Home
//
// A screen is a description of what is shown, not a list of steps: its lines are elements. Only the steps under
// "When pressed:" run, one press at a time.
export const SCREEN_ELEMENTS = ['a heading', 'text', 'a list with each … in …', 'a row', 'a text box', 'a number box', 'a button', 'another screen'];

function parseScreen(n, ep, names, diagnostics) {
  const line = n.line;
  const { name, text } = nameWords(n.tokens.slice(1, -1), line, 'A screen');
  const params = [], remember = [];
  let k = 0;
  const kids = n.children;
  while (kids[k] && isWord(kids[k].tokens[0], 'receive')) {
    const kid = kids[k];
    try {
      params.push(...paramGroups(kid.tokens.slice(1)).map((p) => ({ ...nameWords(p.raw, kid.line, '"Receive"'), type: p.typeTokens ? typeOf(ep, p.typeTokens, kid.line) : null, dflt: p.defaultTokens ? ep.parse(p.defaultTokens, kid.line) : null, line: kid.line })));
    } catch (e) { if (e instanceof CoreError) diagnostics.push(e.diagnostic); else throw e; }
    k++;
  }
  while (kids[k] && isWord(kids[k].tokens[0], 'remember')) {
    try { remember.push(parseRemember(kids[k], ep)); } catch (e) { if (e instanceof CoreError) diagnostics.push(e.diagnostic); else throw e; }
    k++;
  }
  const body = parseElements(kids.slice(k), ep, names, diagnostics, name);
  return { k: 'screen', name, text, params, remember, body, line };
}

// Remember coupon as text, starting at ""   |   Remember count starting at 0
function parseRemember(c, ep) {
  const ts = c.tokens.slice(1);
  const line = c.line;
  const at = splitTop(ts, (t, i) => isWord(t, 'starting') && isWord(ts[i + 1], 'at'));
  if (at < 0) throw new CoreError(diag('TC108', line, '"Remember" needs a starting value: Remember count starting at 0.', 'A screen shows its remembered values right away, so each one starts somewhere.'));
  let head = ts.slice(0, at);
  if (isSym(head[head.length - 1], ',')) head = head.slice(0, -1);
  const asAt = head.findIndex((t) => isWord(t, 'as'));
  const nm = nameWords(asAt < 0 ? head : head.slice(0, asAt), line, '"Remember"');
  const type = asAt < 0 ? null : typeOf(ep, head.slice(asAt + 1), line);
  const valueTs = ts.slice(at + 2);
  if (!valueTs.length) throw new CoreError(diag('TC108', line, `"Remember ${nm.text}" has no starting value after "starting at".`));
  return { ...nm, type, e: ep.parse(valueTs, line), line };
}

function parseElements(nodes, ep, names, diagnostics, screen) {
  const out = [];
  for (const c of nodes) {
    try {
      const el = parseElement(c, ep, names, diagnostics, screen, out);
      if (el) out.push(el);
    } catch (e) { if (e instanceof CoreError) diagnostics.push(e.diagnostic); else throw e; }
  }
  return out;
}

function parseElement(c, ep, names, diagnostics, screen, siblings) {
  const ts = c.tokens;
  const line = c.line;
  const fail = (code, msg, hint) => { throw new CoreError(diag(code, line, msg, hint)); };
  const w0 = ts[0]?.t === 'word' ? ts[0].lower : '';
  const opens = isSym(ts[ts.length - 1], ':');
  const noBlock = (what) => { if (c.children.length) fail('TC118', `${what} has nothing inside it, so the lines under it don't belong to it.`, 'Remove the ":" and the indented lines, or move them out.'); };
  if (w0 === 'when' || w0 === 'if') {
    if (!opens) fail('TC108', 'This line should end with ":".');
    return { k: 'when', branches: [{ cond: ep.parse(ts.slice(1, -1), line), body: parseElements(c.children, ep, names, diagnostics, screen), line }], otherwise: null, line };
  }
  if (w0 === 'otherwise') {
    const prev = siblings[siblings.length - 1];
    if (!prev || prev.k !== 'when' || prev.otherwise) fail('TC109', '"Otherwise" must come right after a "When" or "If" block (at the same indentation).');
    if (!opens) fail('TC108', 'This line should end with ":".');
    const h = ts.slice(0, -1);
    if (h.length === 1) { prev.otherwise = parseElements(c.children, ep, names, diagnostics, screen); return null; }
    if (!isWord(h[1], 'when') && !isWord(h[1], 'if')) fail('TC108', 'Write "Otherwise:" or "Otherwise when <condition>:".');
    prev.branches.push({ cond: ep.parse(h.slice(2), line), body: parseElements(c.children, ep, names, diagnostics, screen), line });
    return null;
  }
  if (w0 === 'receive' || w0 === 'remember') fail('TC119', `"${ts[0].text}" goes at the top of a screen: first the Receive lines, then the Remember lines, then what it shows.`);
  if (w0 !== 'show') {
    // (Swapped letters count too: "Shwo" is "Show".)
    const same = (a, b) => [...a].sort().join('') === [...b].sort().join('');
    const near = closest(w0, ['show', 'when', 'otherwise']) ?? ['show', 'when', 'otherwise'].find((w) => same(w, w0)) ?? null;
    fail('TC118', `A screen shows things, so each line in it starts with "Show" (or is a "When … :" choice). "${c.raw.trim()}" isn't something a screen can show.`,
      near && near !== w0 ? `Did you mean "${near[0].toUpperCase()}${near.slice(1)}"?` : 'Steps that change something go under a button: Show a button "Save": then When pressed: and the steps.');
  }
  const r = opens ? ts.slice(1, -1) : ts.slice(1);
  const key = (i, j) => keyOf(r.slice(i, j));
  const label = (at, what) => {
    if (r[at]?.t !== 'str') fail('TC108', `${what} needs its words in quotes, like: Show ${what.toLowerCase()} "Save".`);
    return ep.parse([r[at]], line);
  };
  // Show a heading: <text>   |   Show a heading "Welcome"
  if (key(0, 2) === 'a heading') {
    noBlock('A heading');
    let v = r.slice(2);
    if (isSym(v[0], ':')) v = v.slice(1);
    if (!v.length) fail('TC108', 'A heading needs its words: Show a heading "Welcome", or Show a heading: title.');
    return { k: 'heading', e: ep.parse(v, line), line };
  }
  // Show a list with each item in items:  (the lines under it are shown once for each item)
  if (key(0, 4) === 'a list with each') {
    const inAt = splitTop(r, (t) => isWord(t, 'in'));
    if (inAt < 0) fail('TC108', 'Write "Show a list with each item in items:".');
    if (!opens || !c.children.length) fail('TC103', `"${c.raw.trim()}" needs the lines to show for each item, indented under it.`, `For example:\n    Show "{${r.slice(4, inAt).map((x) => x.text).join(' ') || 'item'}}"`);
    const v = nameWords(r.slice(4, inAt), line, 'The list');
    return { k: 'list', v, iter: ep.parse(r.slice(inAt + 1), line), body: parseElements(c.children, ep, names, diagnostics, screen), line };
  }
  if (key(0, 2) === 'a list') fail('TC108', 'A list names each item: Show a list with each item in items:', 'Then indent what to show for each item under it.');
  // Show a row:  (the lines under it, side by side)
  if (key(0, 2) === 'a row') {
    if (r.length > 2) fail('TC112', 'Write "Show a row:" and put what it holds on the lines under it.');
    if (!opens || !c.children.length) fail('TC103', '"Show a row:" needs the things to put side by side, indented under it.');
    return { k: 'row', body: parseElements(c.children, ep, names, diagnostics, screen), line };
  }
  // Show a text box "Coupon code" for coupon   |   Show a number box "Quantity" for quantity
  if (key(0, 3) === 'a text box' || key(0, 3) === 'a number box') {
    noBlock('A box');
    const kind = r[1].lower === 'text' ? 'textbox' : 'numberbox';
    const what = kind === 'textbox' ? 'A text box' : 'A number box';
    const lab = label(3, what);
    if (!isWord(r[4], 'for')) fail('TC108', `${what} says which remembered value it changes: Show ${what.toLowerCase()} "${lab.parts?.join('') ?? '…'}" for <name>.`);
    const target = nameWords(r.slice(5), line, what);
    return { k: kind, label: lab, target: { k: 'name', ...target, line }, line };
  }
  // Show a button "Checkout" (off when items is empty) that opens Home:
  //   When pressed:
  //     …steps…
  if (key(0, 2) === 'a button') {
    const lab = label(2, 'A button');
    let i = 3, off = null, opensScreen = null;
    if (isSym(r[i], '(')) {
      let d = 0, close = -1;
      for (let j = i; j < r.length; j++) { if (isSym(r[j], '(')) d++; if (isSym(r[j], ')')) { d--; if (d === 0) { close = j; break; } } }
      const inner = r.slice(i + 1, close < 0 ? r.length : close);
      if (!(isWord(inner[0], 'off') && isWord(inner[1], 'when')) || inner.length < 3) fail('TC108', 'In parentheses after a button, say when it is off: (off when items is empty).');
      off = ep.parse(inner.slice(2), line);
      i = close + 1;
    }
    if (isWord(r[i], 'that') && isWord(r[i + 1], 'opens')) {
      opensScreen = { ...nameWords(r.slice(i + 2), line, '"opens"'), line };
      i = r.length;
    }
    if (i < r.length) fail('TC112', `I understood the button up to "${show(r[i])}", but not after it.`, 'A button is: Show a button "Label", then (off when …) or that opens <screen>, if needed.');
    let press = null;
    if (opens) {
      for (const k2 of c.children) {
        if (keyOf(k2.tokens.slice(0, 2)) !== 'when pressed' || !isSym(k2.tokens[k2.tokens.length - 1], ':') || k2.tokens.length !== 3) {
          throw new CoreError(diag('TC118', k2.line, `Under a button goes one "When pressed:" with the steps to run, but this line is "${k2.raw.trim()}".`, 'Write:\n    When pressed:\n      <the steps>'));
        }
        if (press) throw new CoreError(diag('TC118', k2.line, 'This button already has a "When pressed:" block. Put all its steps in one.'));
        press = { body: parseBlock(k2.children, ep, names, diagnostics, { inFunc: true, inPress: true }), line: k2.line };
      }
    }
    if (!press && !opensScreen) fail('TC118', `The button ${c.raw.trim().replace(/^Show a button\s*/i, '').replace(/:$/, '')} does nothing when it is pressed.`, 'Add "that opens <screen>", or end the line with ":" and put "When pressed:" and its steps under it.');
    return { k: 'button', label: lab, off, opens: opensScreen, press, line };
  }
  // Show Summary   |   Show Summary:  (with one "input: value" line each)
  const scrWords = stripArticle(r);
  if (allWords(scrWords) && names.screens.has(keyOf(scrWords))) {
    const target = { name: keyOf(scrWords), text: names.screens.get(keyOf(scrWords)).text };
    const given = [];
    if (opens) {
      for (const k2 of c.children) {
        const colon = k2.tokens.findIndex((t) => isSym(t, ':'));
        const nameTs = colon > 0 ? k2.tokens.slice(0, colon) : [];
        if (colon <= 0 || !allWords(nameTs) || k2.children.length || colon === k2.tokens.length - 1) {
          throw new CoreError(diag('TC113', k2.line, `Each line under "${c.raw.trim()}" gives the screen one input, as "name: value", like: total: 10.`));
        }
        given.push({ name: keyOf(nameTs), text: nameTs.map((x) => x.text).join(' '), e: ep.parse(k2.tokens.slice(colon + 1), k2.line), line: k2.line });
      }
    }
    return { k: 'child', screen: target, given, line };
  }
  if (opens || c.children.length) {
    const near = closest(keyOf(scrWords), [...names.screens.keys()]);
    fail('TC118', `"${c.raw.trim()}" ends with ":", but ${allWords(scrWords) ? `there is no screen called "${scrWords.map((x) => x.text).join(' ')}"` : 'only a list, a row, a button, or another screen holds lines under it'}.`, near ? `Did you mean "${names.screens.get(near).text}"?` : null);
  }
  // Show <text or a value>
  return { k: 'text', e: ep.parse(r, line), line };
}

export { closest };
