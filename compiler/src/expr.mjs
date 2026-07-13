// A tiny, safe, DETERMINISTIC expression evaluator for decision conditions. No eval, no
// host access , it evaluates a `when` string against a plain inputs object and returns a
// value. This is what makes IntentLang decisions EXECUTABLE: the same condition + inputs
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
const DIALECTS = {
  js: { eq: (a, b) => `${a} === ${b}`, neq: (a, b) => `${a} !== ${b}`, inList: (list, x) => `[${list.join(', ')}].includes(${x})`, nil: 'undefined' },
  csharp: { eq: (a, b) => `${a} == ${b}`, neq: (a, b) => `${a} != ${b}`, inList: (list, x) => `new[]{${list.join(', ')}}.Contains(${x})`, nil: 'null' },
  java: { eq: (a, b) => `java.util.Objects.equals(${a}, ${b})`, neq: (a, b) => `!java.util.Objects.equals(${a}, ${b})`, inList: (list, x) => `java.util.List.of(${list.join(', ')}).contains(${x})`, nil: 'null' },
};

function renderExpr(src, inputs, D) {
  const known = new Set(inputs);
  const r = (n) => {
    switch (n.k) {
      case 'or': return `(${r(n.a)} || ${r(n.b)})`;
      case 'and': return `(${r(n.a)} && ${r(n.b)})`;
      case 'not': return `!${r(n.a)}`;
      case 'neg': return `-${r(n.a)}`;
      case 'arith': return `(${r(n.a)} ${n.op} ${r(n.b)})`;
      case 'cmp':
        if (n.op === '==') return `(${D.eq(r(n.a), r(n.b))})`;
        if (n.op === '!=') return `(${D.neq(r(n.a), r(n.b))})`;
        return `(${r(n.a)} ${n.op} ${r(n.b)})`;
      case 'in': return D.inList(n.list.map(r), r(n.a));
      case 'list': return `[${n.items.map(r).join(', ')}]`;
      case 'lit': return typeof n.v === 'string' ? JSON.stringify(n.v) : String(n.v);
      case 'ref': return (known.has(n.path) || known.has(n.path.split('.')[0])) ? n.path : JSON.stringify(n.path);
      default: return D.nil;
    }
  };
  return r(parse(tokenize(src)));
}

/**
 * Render a `when` condition as an equivalent expression in a target language, for code generation.
 * Input names render as identifiers; any other bare token is an enum literal (a string). Reuses
 * the parser, so precedence is exact. `dialect` is js (default) | csharp | java.
 */
export function exprToCode(src, { inputs = [], dialect = 'js' } = {}) {
  return renderExpr(src, inputs, DIALECTS[dialect] || DIALECTS.js);
}
export const exprToJs = (src, opts = {}) => exprToCode(src, { ...opts, dialect: 'js' });
export const exprToCSharp = (src, opts = {}) => exprToCode(src, { ...opts, dialect: 'csharp' });
export const exprToJava = (src, opts = {}) => exprToCode(src, { ...opts, dialect: 'java' });
