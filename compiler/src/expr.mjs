// A tiny, safe, DETERMINISTIC expression evaluator for decision conditions. No eval, no
// host access , it evaluates a `when` string against a plain inputs object and returns a
// value. This is what makes ThunderLang decisions EXECUTABLE: the same condition + inputs
// always yields the same result, with zero AI and zero code generation.
//
// Grammar (lowest -> highest precedence):
//   or      := and (('or' | '||') and)*
//   and     := not (('and' | '&&') not)*
//   not     := ('not' | '!') not | comparison
//   compare := add ( ('>='|'<='|'=='|'!='|'='|'>'|'<') add | 'in' '[' list ']' )?
//   add     := mul (('+' | '-') mul)*
//   mul     := unary (('*' | '/' | '%') unary)*
//   unary   := '-' unary | primary
//   primary := number | string | bool | ident(.ident)* | '(' or ')' | '[' list ']'

import { moneyLiteral, moneyCompare, numberToDecimalText, MONEY_TYPES } from './money.mjs';

export class ExprError extends Error {}

const OPS = ['>=', '<=', '==', '!=', '&&', '||', '>', '<', '=', '+', '-', '*', '/', '%', '!', '(', ')', '[', ']', ','];

export function tokenize(src) {
  const toks = [];
  const s = String(src ?? '');
  let i = 0;
  const isIdStart = (c) => /[A-Za-z_]/.test(c);
  const isId = (c) => /[A-Za-z0-9_.]/.test(c);
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1; let str = '';
      while (j < s.length && s[j] !== c) { str += s[j]; j++; }
      if (j >= s.length) throw new ExprError(`unterminated string in: ${src}`);
      toks.push({ t: 'str', v: str }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      let j = i; let num = '';
      while (j < s.length && /[0-9.]/.test(s[j])) { num += s[j]; j++; }
      toks.push({ t: 'num', v: Number(num) }); i = j; continue;
    }
    if (isIdStart(c)) {
      let j = i; let id = '';
      while (j < s.length && isId(s[j])) { id += s[j]; j++; }
      const lower = id.toLowerCase();
      if (lower === 'and' || lower === 'or' || lower === 'not' || lower === 'in') toks.push({ t: 'kw', v: lower });
      else if (lower === 'true' || lower === 'false') toks.push({ t: 'bool', v: lower === 'true' });
      else toks.push({ t: 'id', v: id });
      i = j; continue;
    }
    const two = s.slice(i, i + 2);
    if (OPS.includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if (OPS.includes(c)) { toks.push({ t: 'op', v: c }); i += 1; continue; }
    throw new ExprError(`unexpected character "${c}" in: ${src}`);
  }
  return toks;
}

function parse(toks) {
  let pos = 0;
  const peek = () => toks[pos];
  const eat = (v) => { const t = toks[pos]; if (v && (!t || t.v !== v)) throw new ExprError(`expected "${v}"`); pos++; return t; };
  const isKw = (v) => peek() && peek().t === 'kw' && peek().v === v;
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;

  function orExpr() {
    let node = andExpr();
    while (isKw('or') || isOp('||')) { eat(); node = { k: 'or', a: node, b: andExpr() }; }
    return node;
  }
  function andExpr() {
    let node = notExpr();
    while (isKw('and') || isOp('&&')) { eat(); node = { k: 'and', a: node, b: notExpr() }; }
    return node;
  }
  function notExpr() {
    if (isKw('not') || isOp('!')) { eat(); return { k: 'not', a: notExpr() }; }
    return compare();
  }
  function compare() {
    const left = add();
    const t = peek();
    if (t && t.t === 'op' && ['>=', '<=', '==', '!=', '=', '>', '<'].includes(t.v)) {
      eat(); return { k: 'cmp', op: t.v === '=' ? '==' : t.v, a: left, b: add() };
    }
    if (isKw('in')) {
      eat(); eat('['); const items = listExpr(); eat(']');
      return { k: 'in', a: left, list: items };
    }
    return left;
  }
  function listExpr() {
    const items = [];
    if (isOp(']')) return items;
    items.push(orExpr());
    while (isOp(',')) { eat(); items.push(orExpr()); }
    return items;
  }
  function add() {
    let node = mul();
    while (isOp('+') || isOp('-')) { const op = eat().v; node = { k: 'arith', op, a: node, b: mul() }; }
    return node;
  }
  function mul() {
    let node = unary();
    while (isOp('*') || isOp('/') || isOp('%')) { const op = eat().v; node = { k: 'arith', op, a: node, b: unary() }; }
    return node;
  }
  function unary() {
    if (isOp('-')) { eat(); return { k: 'neg', a: unary() }; }
    return primary();
  }
  function primary() {
    const t = peek();
    if (!t) throw new ExprError('unexpected end of expression');
    if (t.t === 'num') { eat(); return { k: 'lit', v: t.v }; }
    if (t.t === 'str') { eat(); return { k: 'lit', v: t.v }; }
    if (t.t === 'bool') { eat(); return { k: 'lit', v: t.v }; }
    if (t.t === 'id') { eat(); return { k: 'ref', path: t.v }; }
    if (isOp('(')) { eat(); const n = orExpr(); eat(')'); return n; }
    if (isOp('[')) { eat(); const items = listExpr(); eat(']'); return { k: 'list', items }; }
    throw new ExprError(`unexpected token "${t.v}"`);
  }

  const tree = orExpr();
  if (pos !== toks.length) throw new ExprError('trailing tokens in expression');
  return tree;
}

// Resolve a dotted path (a.b.c) against the inputs object. Bare identifiers that are not
// present resolve to a Symbol so that `status == active` treats `active` as the literal
// string "active" (decision tables commonly use bare enum tokens on the right-hand side).
const UNRESOLVED = Symbol('unresolved');
function resolve(path, inputs) {
  let cur = inputs;
  for (const part of path.split('.')) {
    if (cur != null && typeof cur === 'object' && part in cur) cur = cur[part];
    else return UNRESOLVED;
  }
  return cur;
}

// Numeric coercion for comparisons: if both sides look numeric, compare as numbers.
const asNum = (v) => (typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : null));

function evalNode(n, inputs) {
  switch (n.k) {
    case 'lit': return n.v;
    case 'list': return n.items.map((x) => evalNode(x, inputs));
    case 'ref': {
      const v = resolve(n.path, inputs);
      return v === UNRESOLVED ? n.path : v; // bare token -> its own name (enum literal)
    }
    case 'or': return !!(evalNode(n.a, inputs) || evalNode(n.b, inputs));
    case 'and': return !!(evalNode(n.a, inputs) && evalNode(n.b, inputs));
    case 'not': return !evalNode(n.a, inputs);
    case 'neg': { const r = -Number(evalNode(n.a, inputs)); return Number.isFinite(r) ? r : null; }
    case 'arith': {
      const a = Number(evalNode(n.a, inputs)); const b = Number(evalNode(n.b, inputs));
      // Thunder numbers are decimals: + - * are exact on decimal operands (0.1 + 0.2 == 0.3), so a
      // money or percentage rule never decides on a binary floating point artefact.
      const exact = decimalArith(n.op, a, b);
      if (exact !== null) return exact;
      const r = n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : a % b;
      // Non-finite results (divide/modulo by zero, NaN from non-numeric operands) are
      // neutralized to null so they can never leak a surprising truthy comparison (e.g.
      // Infinity > 1). A deterministic decision must not silently match on 10 / 0.
      return Number.isFinite(r) ? r : null;
    }
    case 'in': {
      const a = evalNode(n.a, inputs);
      return n.list.map((x) => evalNode(x, inputs)).some((v) => eq(a, v));
    }
    case 'cmp': {
      const a = evalNode(n.a, inputs); const b = evalNode(n.b, inputs);
      if (n.op === '==') return eq(a, b);
      if (n.op === '!=') return !eq(a, b);
      // An unknown / neutralized operand (null: a missing value or a divide-by-zero) cannot be
      // ordered; every ordering comparison against it is false, never JS's null->0 coercion.
      if (a === null || b === null) return false;
      const na = asNum(a); const nb = asNum(b);
      const [x, y] = (na != null && nb != null) ? [na, nb] : [a, b];
      if (n.op === '>=') return x >= y;
      if (n.op === '<=') return x <= y;
      if (n.op === '>') return x > y;
      if (n.op === '<') return x < y;
      throw new ExprError(`unknown operator ${n.op}`);
    }
    default: throw new ExprError(`unknown node ${n.k}`);
  }
}

// Exact decimal + - * for finite numbers whose shortest decimal text has no exponent: scale both to
// integers (BigInt), operate, and scale back. Returns null when the operands are not plain decimals
// (the caller then uses ordinary number arithmetic) or the operator is / or %.
const PLAIN_DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;
function decimalParts(x) {
  if (!Number.isFinite(x)) return null;
  const m = String(x).match(PLAIN_DECIMAL);
  if (!m) return null;
  const frac = m[3] || '';
  const int = BigInt(m[2] + frac);
  return { int: m[1] ? -int : int, scale: frac.length };
}
function decimalArith(op, a, b) {
  if (op !== '+' && op !== '-' && op !== '*') return null;
  const x = decimalParts(a); const y = decimalParts(b);
  if (!x || !y) return null;
  let int; let scale;
  if (op === '*') { int = x.int * y.int; scale = x.scale + y.scale; }
  else {
    scale = Math.max(x.scale, y.scale);
    const xi = x.int * 10n ** BigInt(scale - x.scale); const yi = y.int * 10n ** BigInt(scale - y.scale);
    int = op === '+' ? xi + yi : xi - yi;
  }
  const neg = int < 0n;
  const digits = (neg ? -int : int).toString().padStart(scale + 1, '0');
  const text = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  const r = Number(`${neg ? '-' : ''}${text}`);
  return Number.isFinite(r) ? r : null;
}

function eq(a, b) {
  const na = asNum(a); const nb = asNum(b);
  if (na != null && nb != null) return na === nb;
  return String(a) === String(b);
}

/** Compile a `when` string into a reusable predicate (throws ExprError on bad syntax). */
export function compileExpr(src) {
  const tree = parse(tokenize(src));
  return (inputs = {}) => evalNode(tree, inputs);
}

/** Evaluate a `when` string against inputs. Returns the value (booleans for conditions). */
export function evalExpr(src, inputs = {}) {
  return compileExpr(src)(inputs);
}

// Per-language rendering of the `when` grammar. `eq`/`neq` build an equality expression (JS uses
// ===, C# ==, Java Objects.equals for correct string value equality); `inList` builds membership.
// C-family boolean/logic defaults (js, csharp, java share these).
const C_LOGIC = { and: (a, b) => `(${a} && ${b})`, or: (a, b) => `(${a} || ${b})`, not: (a) => `!${a}`, bool: (v) => String(v) };
const DIALECTS = {
  js: { ...C_LOGIC, eq: (a, b) => `${a} === ${b}`, neq: (a, b) => `${a} !== ${b}`, inList: (list, x) => `[${list.join(', ')}].includes(${x})`, nil: 'undefined' },
  csharp: { ...C_LOGIC, eq: (a, b) => `${a} == ${b}`, neq: (a, b) => `${a} != ${b}`, inList: (list, x) => `new[]{${list.join(', ')}}.Contains(${x})`, nil: 'null' },
  java: { ...C_LOGIC, eq: (a, b) => `java.util.Objects.equals(${a}, ${b})`, neq: (a, b) => `!java.util.Objects.equals(${a}, ${b})`, inList: (list, x) => `java.util.List.of(${list.join(', ')}).contains(${x})`, nil: 'null' },
  python: { and: (a, b) => `(${a} and ${b})`, or: (a, b) => `(${a} or ${b})`, not: (a) => `(not ${a})`, bool: (v) => (v ? 'True' : 'False'), eq: (a, b) => `${a} == ${b}`, neq: (a, b) => `${a} != ${b}`, inList: (list, x) => `${x} in [${list.join(', ')}]`, nil: 'None' },
  // Go has no built-in membership operator, so `in` becomes a parenthesized chain of equalities
  // (an empty list is an impossible match -> false). Booleans and logic are C-family.
  go: { ...C_LOGIC, eq: (a, b) => `${a} == ${b}`, neq: (a, b) => `${a} != ${b}`, inList: (list, x) => (list.length ? `(${list.map((e) => `${x} == ${e}`).join(' || ')})` : 'false'), nil: 'nil' },
  rust: { ...C_LOGIC, num: (v) => `${v}f64`, eq: (a, b) => `${a} == ${b}`, neq: (a, b) => `${a} != ${b}`, inList: (list, x) => `[${list.join(', ')}].contains(&${x})`, nil: 'Default::default()' },
  kotlin: { ...C_LOGIC, num: (v) => (Number.isInteger(v) ? `${v}.0` : String(v)), eq: (a, b) => `${a} == ${b}`, neq: (a, b) => `${a} != ${b}`, inList: (list, x) => `${x} in listOf(${list.join(', ')})`, nil: 'null' },
  scala: { ...C_LOGIC, eq: (a, b) => `${a} == ${b}`, neq: (a, b) => `${a} != ${b}`, inList: (list, x) => `List(${list.join(', ')}).contains(${x})`, nil: 'null' },
  elixir: { and: (a, b) => `(${a} and ${b})`, or: (a, b) => `(${a} or ${b})`, not: (a) => `(not ${a})`, bool: (v) => String(v), eq: (a, b) => `${a} == ${b}`, neq: (a, b) => `${a} != ${b}`, inList: (list, x) => `${x} in [${list.join(', ')}]`, nil: 'nil' },
};

// The literal decimal text of a numeric literal node (or a negated one), or null.
function literalDecimal(n) {
  if (n.k === 'lit' && typeof n.v === 'number') return numberToDecimalText(n.v);
  if (n.k === 'neg' && n.a.k === 'lit' && typeof n.a.v === 'number') return `-${numberToDecimalText(n.a.v)}`;
  return null;
}

function renderExpr(src, inputs, D, money = {}, dialect = 'js') {
  const known = new Set(inputs);
  const isMoney = (n) => n.k === 'ref' && Object.prototype.hasOwnProperty.call(money, n.path);
  const moneyRefs = (n, out = []) => {
    if (isMoney(n)) out.push(n.path);
    else if (n.k === 'arith' || n.k === 'cmp') { moneyRefs(n.a, out); moneyRefs(n.b, out); }
    else if (n.k === 'neg') moneyRefs(n.a, out);
    return out;
  };
  // A comparison that involves a Money input renders with the target's exact Money type. Each side
  // may be a Money input, an amount such as 12.30, or a sum/difference of those (exact in every Money
  // representation). Anything else (multiplication, division, mixing currencies) is refused.
  const moneyCmp = (n) => {
    if (!MONEY_TYPES[dialect]) throw new ExprError(`Money inputs have no exact representation in this target yet, and Thunder will not compare money as binary floating point`);
    const refs = moneyRefs(n);
    const units = money[refs[0]];
    const other = refs.find((p) => money[p] !== units);
    if (other) throw new ExprError(`"${refs[0]}" and "${other}" are Money with different minor units (different currencies)`);
    const side = (x) => {
      if (isMoney(x)) return x.path;
      const dec = literalDecimal(x);
      if (dec != null) { try { return moneyLiteral(dialect, dec, units); } catch (e) { throw new ExprError(e.message); } }
      if (x.k === 'arith' && (x.op === '+' || x.op === '-')) {
        const a = side(x.a); const b = side(x.b);
        if (dialect === 'java') return `${a}.${x.op === '+' ? 'add' : 'subtract'}(${b})`;
        return `(${a} ${x.op} ${b})`;
      }
      throw new ExprError(`Money can only be compared with Money inputs, amounts such as 12.30, or their sums and differences; multiplication, division, and other computed values are not translated exactly`);
    };
    return moneyCompare(dialect, n.op, side(n.a), side(n.b));
  };
  const r = (n) => {
    if (n.k === 'cmp' && moneyRefs(n).length) return moneyCmp(n);
    if (isMoney(n)) throw new ExprError(`Money input "${n.path}" is used outside a comparison (arithmetic, lists, or yes/no use are not translated exactly)`);
    switch (n.k) {
      case 'or': return D.or(r(n.a), r(n.b));
      case 'and': return D.and(r(n.a), r(n.b));
      case 'not': return D.not(r(n.a));
      case 'neg': return `-${r(n.a)}`;
      case 'arith': return `(${r(n.a)} ${n.op} ${r(n.b)})`;
      case 'cmp':
        if (n.op === '==') return `(${D.eq(r(n.a), r(n.b))})`;
        if (n.op === '!=') return `(${D.neq(r(n.a), r(n.b))})`;
        return `(${r(n.a)} ${n.op} ${r(n.b)})`;
      case 'in': return D.inList(n.list.map(r), r(n.a));
      case 'list': return `[${n.items.map(r).join(', ')}]`;
      case 'lit': return typeof n.v === 'string' ? JSON.stringify(n.v) : typeof n.v === 'boolean' ? D.bool(n.v) : (D.num ? D.num(n.v) : String(n.v));
      case 'ref': return (known.has(n.path) || known.has(n.path.split('.')[0])) ? n.path : JSON.stringify(n.path);
      default: return D.nil;
    }
  };
  return r(parse(tokenize(src)));
}

/**
 * Reprint a ThunderLang condition with only the parentheses its meaning needs, so a reading of
 * generated or heavily bracketed code stays easy to read. Returns the input unchanged when it
 * uses a construct this printer does not cover (lists, `in`).
 */
export function simplifyExpr(src) {
  const PREC = { or: 1, and: 2, not: 3, cmp: 4, arith: 5, neg: 6, lit: 7, ref: 7 };
  let unsupported = false;
  const p = (n, parent = 0) => {
    const me = PREC[n.k];
    if (me == null) { unsupported = true; return ''; }
    let out;
    switch (n.k) {
      // `and` inside `or` keeps its parentheses: correct without them, but easy to misread.
      case 'or': out = `${p(n.a, n.a.k === 'and' ? 9 : me)} or ${p(n.b, n.b.k === 'and' ? 9 : me + 0.5)}`; break;
      case 'and': out = `${p(n.a, me)} and ${p(n.b, me + 0.5)}`; break;
      case 'not': out = `not ${p(n.a, me)}`; break;
      case 'cmp': out = `${p(n.a, me + 0.5)} ${n.op} ${p(n.b, me + 0.5)}`; break;
      case 'arith': out = `${p(n.a, me)} ${n.op} ${p(n.b, me + 0.5)}`; break;
      case 'neg': out = `-${p(n.a, me)}`; break;
      case 'lit': out = typeof n.v === 'string' ? JSON.stringify(n.v) : String(n.v); break;
      case 'ref': out = n.path; break;
    }
    return me < parent ? `(${out})` : out;
  };
  const text = p(parse(tokenize(src)));
  return unsupported ? src : text;
}

/**
 * Render a `when` condition as an equivalent expression in a target language, for code generation.
 * Input names render as identifiers; any other bare token is an enum literal (a string). Reuses
 * the parser, so precedence is exact. `dialect` is js (default) | csharp | java | python | go | rust |
 * kotlin | scala | elixir. `money` maps Money input names to their minor units; comparisons on them
 * render with the target's exact Money type (money.mjs), and any other use throws ExprError.
 */
export function exprToCode(src, { inputs = [], dialect = 'js', money = {} } = {}) {
  const d = DIALECTS[dialect] ? dialect : 'js';
  return renderExpr(src, inputs, DIALECTS[d], money || {}, d);
}
export const exprToJs = (src, opts = {}) => exprToCode(src, { ...opts, dialect: 'js' });
export const exprToCSharp = (src, opts = {}) => exprToCode(src, { ...opts, dialect: 'csharp' });
export const exprToJava = (src, opts = {}) => exprToCode(src, { ...opts, dialect: 'java' });
export const exprToPython = (src, opts = {}) => exprToCode(src, { ...opts, dialect: 'python' });
export const exprToGo = (src, opts = {}) => exprToCode(src, { ...opts, dialect: 'go' });
export const exprToRust = (src, opts = {}) => exprToCode(src, { ...opts, dialect: 'rust' });
export const exprToKotlin = (src, opts = {}) => exprToCode(src, { ...opts, dialect: 'kotlin' });
export const exprToScala = (src, opts = {}) => exprToCode(src, { ...opts, dialect: 'scala' });
export const exprToElixir = (src, opts = {}) => exprToCode(src, { ...opts, dialect: 'elixir' });
