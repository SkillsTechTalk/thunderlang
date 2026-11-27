// Thunder write in Thunder's own words: a condition, a value, or a step written the way Thunder reads code
// ("amount is at least 100", "the length of words is 0", "name is nothing", Stop with "Amount must be positive")
// becomes the meaning tree (thunder-expr-v1) that thunder write turns into code for the file's language.
//
//   thunderTree("total is below 0 and not member", "python", source)  ->  total < 0 and not member
//   thunderStep('Give the length of words', "go", source)               ->  return len(words)
//
// Names are the code's own names said as words: `max_length`, `maxLength`, and "max length" are the same name, matched
// against the names written in the file. A Thunder word with no fixed meaning in the target language (a position
// "item 1 of", money, percent, dates) is refused rather than guessed. Browser-safe; nothing is run.
import { ExprParser } from './core/parser.mjs';
import { tokenizeLine } from './core/lexer.mjs';

/** The words a code name is made of: max_length, maxLength, MaxLength -> "max length". */
export const nameWords = (id) => id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/_+/g, ' ').trim().toLowerCase();

const KEYWORDS = new Set(['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'is', 'not', 'and', 'or', 'None', 'True', 'False', 'class', 'import', 'from', 'as', 'with', 'try', 'except', 'finally', 'raise', 'lambda', 'pass', 'break', 'continue', 'yield', 'function', 'const', 'let', 'var', 'new', 'this', 'null', 'undefined', 'true', 'false', 'typeof', 'instanceof', 'throw', 'catch', 'switch', 'case', 'default', 'func', 'package', 'nil', 'type', 'struct', 'interface', 'go', 'defer', 'chan', 'map', 'range', 'export', 'async', 'await', 'self', 'cls']);

// Code with its comments and text values blanked out: a word in a docstring ("Value of ...") is not a name.
const codeOnly = (src) => String(src ?? '')
  .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, ' ')
  .replace(/(#|\/\/)[^\n]*/g, ' ');

/**
 * Every name written in the code, by its words: Map("max length" -> "max_length"). The names in `scope` (the edited
 * function's own code) come first; then the rest of the file. A word that is itself a name (`value`) is that name,
 * never another spelling of the same words (`Value`).
 */
function namesOf(source, scope) {
  const byWords = new Map(), exact = new Set();
  for (const text of [scope, source]) {
    for (const m of codeOnly(text).matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
      const id = m[0];
      if (KEYWORDS.has(id)) continue;
      exact.add(id);
      const w = nameWords(id);
      if (w && !byWords.has(w)) byWords.set(w, id);
    }
  }
  for (const id of exact) byWords.set(id, id);
  for (const [w, id] of byWords) if (exact.has(w)) byWords.set(w, w);
  return byWords;
}

// Words and shapes only Thunder uses: when one is in the text, it is read as Thunder before it is read as code.
const THUNDER_MARKERS = /\b(is (not )?(at least|at most|more than|less than|greater than|fewer than|below|above|under|over|nothing|missing|between|true|false|empty)|the (length|number|count|lowercase|uppercase|first|last|sum|total|trimmed) of|contains|starts with|ends with|plus|minus|times|divided by|equals)\b|'s\b/i;

const lit = (type, value, raw) => ({ kind: 'literal', type, value, raw });
const NULL_RAW = { python: 'None', go: 'nil', typescript: 'null', javascript: 'null' };

class Unsaid extends Error {}
class Unknown extends Error { constructor(word) { super(word); this.word = word; } }

/** The function's inputs, from its signature (the first parentheses in `scope`). */
export function inputsOf(scope) {
  const code = codeOnly(scope || ''), open = code.indexOf('(');
  if (open < 0) return [];
  let depth = 0, end = open;
  for (; end < code.length; end++) { if (code[end] === '(') depth++; else if (code[end] === ')' && --depth === 0) break; }
  const out = [];
  for (const part of code.slice(open + 1, end).split(',')) {
    const id = part.replace(/^\s*[*&.]*\s*/, '').match(/^[A-Za-z_]\w*/)?.[0];
    if (id && !KEYWORDS.has(id) && id !== 'self' && id !== 'cls' && !out.includes(id)) out.push(id);
  }
  return out;
}
const unknownWord = (word, scope) => {
  const inputs = inputsOf(scope);
  return `"${word}" is not a name in this function or file${inputs.length ? `; its inputs are ${inputs.map((i) => `"${nameWords(i) || i}"`).join(', ')}` : ''}. Use one of its names, or add an input first (addInput).`;
};
const no = (why) => { throw new Unsaid(why); };

/** A Core expression (core/parser.mjs) as a meaning tree for `language`. */
function toTree(n, language, names) {
  const T = (x) => toTree(x, language, names);
  const py = language === 'python', go = language === 'go', js = language === 'typescript' || language === 'javascript';
  const call = (callee, args) => ({ kind: 'call', callee, args });
  const member = (object, property) => ({ kind: 'member', object, property });
  const nm = (name) => ({ kind: 'name', name });
  switch (n.k) {
    case 'paren': return T(n.e);
    case 'num': return lit('number', Number(n.text), n.text);
    case 'str':
      if (n.parts.some((p) => typeof p !== 'string')) no('a text with values inside it ({…})');
      return lit('text', n.parts.join(''), JSON.stringify(n.parts.join('')));
    case 'bool': return lit('bool', n.v, py ? (n.v ? 'True' : 'False') : String(n.v));
    case 'nothing': return lit('null', null, NULL_RAW[language]);
    case 'name': {
      // Only a name the code already has: a word that is no name in the function or the file is refused, never
      // written as a new name the code would fail on.
      const id = names.get(n.name);
      if (!id) throw new Unknown(n.name);
      return nm(id);
    }
    case 'field': case 'dot': {
      if (n.args) no('a call written with a dot');
      const prop = n.k === 'field' ? n.name : n.attr;
      return member(T(n.obj), names.get(prop) ?? prop.replace(/ /g, '_'));
    }
    case 'neg': return { kind: 'unary', op: '-', value: T(n.e) };
    case 'not': return { kind: 'not', value: T(n.e) };
    case 'bin': {
      if (n.op === 'and' || n.op === 'or') {
        const operands = [];
        for (const side of [n.l, n.r]) { const t = T(side); if (t.kind === 'logic' && t.op === n.op) operands.push(...t.operands); else operands.push(t); }
        return { kind: 'logic', op: n.op, operands };
      }
      const op = { '+': '+', '-': '-', '*': '*', '/': '/', mod: '%', '%': '%' }[n.op];
      if (!op) no(`"${n.op}"`);
      return { kind: 'binary', op, left: T(n.l), right: T(n.r) };
    }
    case 'cmp': {
      // "member is true" means equal to true, not truthy (in Python 1 and "x" are truthy): `member is True` in Python,
      // `=== true` in JavaScript. A person who means truthy writes "member" or "not member".
      if (py && (n.op === '==' || n.op === '!=') && n.r.k === 'bool') return { kind: 'compare', op: n.op === '==' ? 'is' : 'is not', left: T(n.l), right: T(n.r) };
      const op = n.op === '==' ? (js ? '===' : '==') : n.op === '!=' ? (js ? '!==' : '!=') : n.op;
      return { kind: 'compare', op, left: T(n.l), right: T(n.r) };
    }
    case 'isNothing': {
      // "is nothing": Python's `is None`; JavaScript's `== null` (null or undefined); Go's `== nil`.
      const op = py ? (n.neg ? 'is not' : 'is') : n.neg ? '!=' : '==';
      return { kind: 'compare', op, left: T(n.e), right: lit('null', null, NULL_RAW[language]) };
    }
    case 'between': {
      const e = T(n.e);
      return { kind: 'logic', op: 'and', operands: [{ kind: 'compare', op: '>=', left: e, right: T(n.lo) }, { kind: 'compare', op: '<=', left: e, right: T(n.hi) }] };
    }
    case 'contains': {
      if (py) return { kind: 'compare', op: 'in', left: T(n.r), right: T(n.l) };
      if (js) return call(member(T(n.l), 'includes'), [T(n.r)]);
      no('"contains" in Go (strings.Contains or slices.Contains depends on the value)');
      break;
    }
    case 'affix': {
      const l = T(n.l), r = T(n.r);
      if (py) return call(member(l, n.end ? 'endswith' : 'startswith'), [r]);
      if (js) return call(member(l, n.end ? 'endsWith' : 'startsWith'), [r]);
      return call(member(nm('strings'), n.end ? 'HasSuffix' : 'HasPrefix'), [l, r]);
    }
    case 'op': {
      const a = T(n.arg);
      if (n.op === 'length' || n.op === 'count') return js ? member(a, 'length') : call(nm('len'), [a]);
      if (n.op === 'lowercase') return py ? call(member(a, 'lower'), []) : js ? call(member(a, 'toLowerCase'), []) : call(member(nm('strings'), 'ToLower'), [a]);
      if (n.op === 'uppercase') return py ? call(member(a, 'upper'), []) : js ? call(member(a, 'toUpperCase'), []) : call(member(nm('strings'), 'ToUpper'), [a]);
      if (n.op === 'trimmed') return py ? call(member(a, 'strip'), []) : js ? call(member(a, 'trim'), []) : call(member(nm('strings'), 'TrimSpace'), [a]);
      if (n.op === 'first') return { kind: 'index', object: a, index: lit('number', 0, '0') };
      if (n.op === 'last') return py ? { kind: 'index', object: a, index: { kind: 'unary', op: '-', value: lit('number', 1, '1') } } : { kind: 'index', object: a, index: { kind: 'binary', op: '-', left: js ? member(a, 'length') : call(nm('len'), [a]), right: lit('number', 1, '1') } };
      no(`"the ${n.word} of"`);
      break;
    }
    default: no(`"${n.k}"`);
  }
  return null;
}

function parseThunder(text, source, scope) {
  const names = namesOf(source, scope);
  const known = new Map([...names.keys()].map((k) => [k, 'var']));
  const ep = new ExprParser({ known, fields: new Set(names.keys()), records: new Set(), recordFields: new Map(), funcInputs: new Map(), recordText: new Map(), screens: new Map() });
  const lexed = tokenizeLine(String(text), 1);
  const tokens = Array.isArray(lexed) ? lexed : lexed.tokens;
  return { node: ep.parse(tokens, 1), names };
}

/**
 * A condition or value in Thunder's words, as a meaning tree for `language`, or { error } when it is not Thunder or
 * cannot be said in that language. `source`: the file, whose names the words are matched against.
 */
export function thunderTree(text, language, source, scope = '') {
  let parsed;
  try { parsed = parseThunder(text, source, scope); } catch (e) { return { error: String(e.message).replace(/^Line 1: /, '').split('\n')[0] }; }
  try { return { tree: toTree(parsed.node, language, parsed.names) }; } catch (e) {
    if (e instanceof Unsaid) return { error: `Thunder write cannot say ${e.message} in ${language} yet.` };
    if (e instanceof Unknown) return { error: unknownWord(e.word, scope), unknown: e.word };
    throw e;
  }
}

/** Does the text use words only Thunder uses (so it is read as Thunder before it is read as code)? */
export const looksThunder = (text) => typeof text === 'string' && THUNDER_MARKERS.test(text);

/**
 * A step in Thunder's words: `Give <value>`, `Set <name> to <value>`, or `Stop with "<message>"`.
 * Returns { tree } (a return or an assignment), { stop: message }, { error }, or null when it is not one of these.
 */
export function thunderStep(text, language, source, scope = '') {
  const t = String(text).trim();
  let m;
  if ((m = t.match(/^stop with\s+(["'])(.*)\1\s*$/i))) return { stop: m[2] };
  if ((m = t.match(/^give(?: back)?\s+(.+)$/i))) {
    const v = thunderTree(m[1], language, source, scope);
    return v.tree ? { tree: { kind: 'return', value: v.tree } } : { error: v.error };
  }
  if ((m = t.match(/^set\s+(.+?)\s+to\s+(.+)$/i))) {
    const target = thunderTree(m[1], language, source, scope), value = thunderTree(m[2], language, source, scope);
    if (!target.tree) return { error: target.error };
    if (!value.tree) return { error: value.error };
    if (target.tree.kind !== 'name' && target.tree.kind !== 'member') return { error: `"${m[1]}" is not a name to set.` };
    return { tree: { kind: 'assign', op: '=', target: target.tree, value: value.tree } };
  }
  return null;
}

// Names every program in the language has without writing them: built-in functions, types, and globals.
const BUILTINS = {
  python: 'abs all any ascii bin bool bytearray bytes callable chr dict dir divmod enumerate filter float format frozenset getattr globals hasattr hash hex id int isinstance issubclass iter len list locals map max min next object oct open ord pow print range repr reversed round set setattr slice sorted str sum super tuple type vars zip Exception ValueError TypeError KeyError IndexError RuntimeError AttributeError NotImplementedError StopIteration LookupError ArithmeticError ZeroDivisionError OSError NotImplemented Ellipsis __name__ __file__',
  typescript: 'Math JSON Object Array String Number Boolean Date Error TypeError RangeError Promise Map Set WeakMap Symbol BigInt RegExp console parseInt parseFloat isNaN isFinite undefined NaN Infinity globalThis window document process require module exports',
  go: 'len cap append make new copy delete panic recover print println close complex real imag min max clear error string int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 bool byte rune any iota fmt errors strings strconv',
};
BUILTINS.javascript = BUILTINS.typescript;

/**
 * The first name in `tree` that the code does not have (not in the file, not built in), or null. Names the step
 * itself introduces are allowed: assignment and declaration targets, loop variables, and a function's own inputs.
 */
export function unknownName(tree, language, source, scope = '') {
  const known = new Set(BUILTINS[language]?.split(' ') ?? []);
  // The function's own code counts as code even where the file is read as text around it (a docstring example).
  for (const text of [codeOnly(source), codeOnly(scope)]) for (const m of text.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) known.add(m[0]);
  for (const k of KEYWORDS) known.add(k);
  const bound = new Set();
  const all = [];
  const walk = (n) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== 'object') return;
    if (n.kind === 'lambda' || n.kind === 'code') { bound.add('*'); return; }
    if (n.kind === 'name') all.push(n.name);
    if ((n.kind === 'assign' || n.kind === 'declare') && n.target?.kind === 'name') bound.add(n.target.name);
    if (n.kind === 'declare' && typeof n.name === 'string') bound.add(n.name);
    if (n.kind === 'loop') for (const v of [n.variable, n.var, n.name, n.target]) { if (typeof v === 'string') bound.add(v); else if (v?.kind === 'name') bound.add(v.name); }
    for (const [k, v] of Object.entries(n)) if (k !== 'raw' && v && typeof v === 'object') walk(v);
  };
  walk(tree);
  if (bound.has('*')) return null;
  return all.find((id) => !known.has(id) && !bound.has(id)) ?? null;
}
export const unknownNameReason = (word, scope) => unknownWord(word, scope);
