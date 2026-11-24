// The meaning model underneath Thunder's words (thunder-expr-v1).
//
// Thunder's words are short on purpose ("Calls save"). So that nothing in the code is lost, every step also carries
// `expr`: a small, language-neutral tree of exactly what the statement says — calls with their callee path and every
// argument, assignments with their full target (index, keys) and value, comparisons and logic with every operand and
// negation, literals with their exact value, object and array literals with every key and item, lambdas (their body
// is the step's own children), returns and throws with their value, error type and message.
//
// The tree is read from the code, never guessed: when a statement is not fully understood, its expr is
// `{ kind: 'code', text }` (the code itself). Every function here is linear in the statement's length.
//
// Pieces:
//   parseStatement(text, language)  -> statement tree (what a step's `expr` holds)
//   parseExpr(text, language)       -> expression tree, or null when the text is not one whole expression
//   renderStatement(tree, language) -> code again (TypeScript/JavaScript, Python, Go), for the round trip
//   sayFull(tree)                   -> every detail in plain, neutral form ("save(order, { validate: false })")
//   detailOf(step)                  -> what the short words leave out, as a sentence tail ("with: order, …")
//   exprCounts(tree)                -> negations, and/or, and comparisons (the faithfulness gate counts these)
//   sameExpr(a, b)                  -> structural equality after normalizing spelling (quotes, spacing)

export const EXPR_SCHEMA = 'thunder-expr-v1';

// ── Languages ────────────────────────────────────────────────────────────────────────────────────────────────

const FAMILY = {
  typescript: 'c', javascript: 'c', java: 'c', csharp: 'c', php: 'c', kotlin: 'c', scala: 'c', swift: 'c', dart: 'c', c: 'c', cpp: 'c',
  python: 'py', ruby: 'rb', go: 'go', rust: 'rs',
};
const famOf = (lang) => FAMILY[lang] || 'c';
const isJs = (lang) => lang === 'typescript' || lang === 'javascript' || !lang;

// Thrown when the reader gives up on a statement (a plain object: no stack trace to build, so giving up is cheap).
class Fail { constructor(why) { this.message = why; } }
const fail = (why) => { throw new Fail(why); };

// ── Lexer: lazy, so a block statement is scanned only as far as its header ───────────────────────────────────

const OPS_ALL = ['>>>=', '...', '===', '!==', '**=', '&.', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '//=', '..=', '&^=', '?.', '??', '?:', '=>', '->', '::', ':=', '==', '!=', '<>', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '//', '<<', '>>', '&^', '<-', '..', '!!', '.=',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '?', ':', '.', ',', ';', '(', ')', '[', ']', '{', '}', '@', '#', '\\'];
const OPS_BY_FAMILY = {};
for (const f of ['c', 'py', 'rb', 'go', 'rs', 'kt', 'php']) {
  OPS_BY_FAMILY[f] = OPS_ALL.filter((o) => {
    if (o === '//' || o === '//=') return f === 'py';
    if (o === '::') return f !== 'py' && f !== 'go';
    if (o === '?:') return f === 'kt';
    if (o === '!!') return f === 'kt';
    if (o === '..' || o === '..=') return f === 'kt' || f === 'rs' || f === 'rb';
    if (o === '&^' || o === '&^=' || o === '<-') return f === 'go';
    if (o === ':=') return f === 'go' || f === 'py';
    if (o === '.=') return f === 'php';
    if (o === '<>') return f === 'php';
    if (o === '>>>' || o === '>>>=' || o === '!==') return f === 'c' || f === 'kt' || f === 'php';
    if (o === '===') return f === 'c' || f === 'kt' || f === 'php' || f === 'rb';
    if (o === '**' || o === '**=') return f !== 'rs' && f !== 'go';
    if (o === '&.') return f === 'rb';
    if (o === '#') return f === 'rs' || f === 'c';
    return true;
  });
}
// Operators by their first character, longest first, so the lexer tries only the few that can match.
const OPS_BY_CHAR = {};
for (const [f, list] of Object.entries(OPS_BY_FAMILY)) {
  const m = new Map();
  for (const o of list) { if (!m.has(o[0])) m.set(o[0], []); m.get(o[0]).push(o); }
  for (const l of m.values()) l.sort((a, b) => b.length - a.length);
  OPS_BY_CHAR[f] = m;
}
const opFamily = (lang) => (lang === 'kotlin' ? 'kt' : lang === 'php' ? 'php' : famOf(lang));

const ID_START = /[A-Za-z_$\u00C0-\uFFFF]/;
const ID_RE = /[A-Za-z_$\u00C0-\uFFFF][\w$\u00C0-\uFFFF]*/y;
const NUM_RE = /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.(?!\.)\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)(?:[a-zA-Z]\w*)?/y;
const OPERAND_END = new Set(['id', 'num', 'str', 'tpl', 'regex']);
const REGEX_AFTER_KW = /^(?:return|typeof|case|in|of|delete|void|throw|new|instanceof|yield|await|else|do)$/;

function makeLexer(src, lang) {
  const fam = famOf(lang);
  const ops = OPS_BY_CHAR[opFamily(lang)];
  const hashComment = fam === 'py' || fam === 'rb' || lang === 'php';
  const toks = [];
  let pos = 0;
  const n = src.length;

  function skipSpace() {
    let nl = false, sp = false;
    while (pos < n) {
      const c = src.charCodeAt(pos);
      if (c === 10) { nl = true; sp = true; pos++; continue; }
      if (c === 32 || c === 9 || c === 13) { sp = true; pos++; continue; }
      if (c === 92 && (fam === 'py' || fam === 'rb') && /^\\\r?\n/.test(src.slice(pos, pos + 3))) { pos += src[pos + 1] === '\r' ? 3 : 2; sp = true; continue; }
      if (c === 47 && src.charCodeAt(pos + 1) === 47 && fam !== 'py') { while (pos < n && src.charCodeAt(pos) !== 10) pos++; sp = true; continue; }
      if (c === 47 && src.charCodeAt(pos + 1) === 42) { const e = src.indexOf('*/', pos + 2); pos = e < 0 ? n : e + 2; sp = true; continue; }
      if (c === 35 && hashComment && !(fam === 'rb' && src[pos + 1] === '{')) { while (pos < n && src.charCodeAt(pos) !== 10) pos++; sp = true; continue; }
      break;
    }
    return { nl, sp };
  }

  /** End index (exclusive) of a quoted string starting at `i` with quote q. */
  function stringEnd(i, q, { raw = false, triple = false, verbatim = false } = {}) {
    if (triple) { const e = src.indexOf(q + q + q, i + 3); if (e < 0) fail('unterminated string'); let k = e + 3; while (src[k] === q) k++; return k; }
    for (let j = i + 1; j < n; j++) {
      const ch = src[j];
      if (ch === '\\' && (!raw || fam === 'py') && !verbatim) { j++; continue; }
      if (verbatim && ch === q && src[j + 1] === q) { j++; continue; }
      if (ch === q) return j + 1;
      if (ch === '\n' && q !== '`' && !verbatim && !triple) fail('unterminated string');
    }
    return fail('unterminated string');
  }
  /** End of a JS template literal starting at i (handles `${ … }` with nested strings and templates). */
  function templateEnd(i) {
    for (let j = i + 1; j < n; j++) {
      const ch = src[j];
      if (ch === '\\') { j++; continue; }
      if (ch === '`') return j + 1;
      if (ch === '$' && src[j + 1] === '{') { const e = blockEnd(src, j + 1, lang); if (e < 0) fail('unterminated template'); j = e; }
    }
    return fail('unterminated template');
  }

  function lexOne() {
    const { nl, sp } = skipSpace();
    if (pos >= n) return { t: 'eof', v: '', s: n, e: n, nl, sp };
    const s = pos;
    const c = src[pos];
    const prev = toks[toks.length - 1];
    // Strings (with Python / C# / Rust prefixes).
    let m;
    if (fam === 'py' && /[rRbBuUfF]/.test(c) && (m = /^([rRbBuUfF]{1,2})(["'])/.exec(src.slice(pos, pos + 3)))) {
      const prefix = m[1].toLowerCase(), q = m[2], at = pos + prefix.length;
      const triple = src.slice(at, at + 3) === q + q + q;
      const e = stringEnd(at, q, { raw: prefix.includes('r'), triple });
      pos = e;
      return { t: 'str', v: src.slice(s, e), q, prefix, triple, s, e, nl, sp };
    }
    if (lang === 'csharp' && (c === '$' || c === '@') && (src[pos + 1] === '"' || ((src[pos + 1] === '@' || src[pos + 1] === '$') && src[pos + 2] === '"'))) {
      const at = src.indexOf('"', pos);
      const prefix = src.slice(pos, at);
      let e;
      if (prefix.includes('$')) {
        // $"…{(a ? "x" : "y")}…": a value inside braces may hold strings of its own.
        let j = at + 1;
        for (; j < n; j++) {
          const ch = src[j];
          if (ch === '\\' && !prefix.includes('@')) { j++; continue; }
          if (ch === '{' && src[j + 1] === '{') { j++; continue; }
          if (ch === '{') { const close = blockEnd(src, j, 'csharp'); if (close < 0) fail('unterminated string'); j = close; continue; }
          if (ch === '"') { if (prefix.includes('@') && src[j + 1] === '"') { j++; continue; } break; }
        }
        if (j >= n) fail('unterminated string');
        e = j + 1;
      } else e = stringEnd(at, '"', { verbatim: prefix.includes('@') });
      pos = e;
      return { t: 'str', v: src.slice(s, e), q: '"', prefix, s, e, nl, sp };
    }
    if (fam === 'rs' && (c === 'r' || c === 'b') && /^(?:b?r#*"|b")/.test(src.slice(pos, pos + 4))) {
      const mm = /^(b?r?)(#*)"/.exec(src.slice(pos, pos + 12));
      const hashes = mm[2];
      const at = pos + mm[1].length + hashes.length;
      let e;
      if (mm[1].includes('r')) { const close = src.indexOf(`"${hashes}`, at + 1); if (close < 0) fail('unterminated string'); e = close + 1 + hashes.length; }
      else e = stringEnd(at, '"');
      pos = e;
      return { t: 'str', v: src.slice(s, e), q: '"', prefix: mm[1] + hashes, s, e, nl, sp };
    }
    if (c === '"' || c === "'") {
      if (c === "'" && (fam === 'go' || fam === 'rs' || lang === 'java' || lang === 'csharp' || lang === 'kotlin' || lang === 'scala')) {
        const e = stringEnd(pos, "'");
        pos = e;
        return { t: 'str', v: src.slice(s, e), q: "'", char: true, s, e, nl, sp };
      }
      const triple = (fam === 'py' || lang === 'kotlin') && src.slice(pos, pos + 3) === c + c + c;
      const e = stringEnd(pos, c, { triple });
      pos = e;
      return { t: 'str', v: src.slice(s, e), q: c, triple, s, e, nl, sp };
    }
    if (c === '`') {
      if (isJs(lang)) { const e = templateEnd(pos); pos = e; return { t: 'tpl', v: src.slice(s, e), s, e, nl, sp }; }
      if (fam === 'go') { const e = src.indexOf('`', pos + 1); if (e < 0) fail('unterminated string'); pos = e + 1; return { t: 'str', v: src.slice(s, pos), q: '`', s, e: pos, nl, sp }; }
      return fail('backtick');
    }
    // Ruby symbols :name (not :: and not a ternary's ": x").
    if (fam === 'rb' && c === ':' && src[pos + 1] !== ':' && ID_START.test(src[pos + 1] || '') && !(prev && OPERAND_END.has(prev.t) && !sp)) {
      ID_RE.lastIndex = pos + 1; const mm = ID_RE.exec(src); let e = pos + 1 + mm[0].length; if (/[?!]/.test(src[e] || '')) e++;
      pos = e; return { t: 'str', v: src.slice(s, e), symbol: true, s, e, nl, sp };
    }
    // Numbers.
    if ((c >= '0' && c <= '9') || (c === '.' && /[0-9]/.test(src[pos + 1] || '') && !(prev && OPERAND_END.has(prev.t)))) {
      NUM_RE.lastIndex = pos; const mm = NUM_RE.exec(src);
      pos += mm[0].length;
      return { t: 'num', v: mm[0], s, e: pos, nl, sp };
    }
    // C# names that are keywords, written with @: @interface, @event.
    if (c === '@' && lang === 'csharp' && ID_START.test(src[pos + 1] || '')) { ID_RE.lastIndex = pos + 1; const mm = ID_RE.exec(src); pos += 1 + mm[0].length; return { t: 'id', v: src.slice(s, pos), s, e: pos, nl, sp }; }
    // JavaScript private names: this.#run, #options in x.
    if (c === '#' && isJs(lang) && ID_START.test(src[pos + 1] || '')) { ID_RE.lastIndex = pos + 1; const mm = ID_RE.exec(src); pos += 1 + mm[0].length; return { t: 'id', v: src.slice(s, pos), s, e: pos, nl, sp }; }
    // Identifiers (Ruby @ivar / $global; Rust/Ruby name! and Ruby name?).
    if (lang === 'php' && c === '\\' && ID_START.test(src[pos + 1] || '')) {
      let e = pos + 1;
      for (;;) { ID_RE.lastIndex = e; const mm = ID_RE.exec(src); e += mm[0].length; if (src[e] === '\\' && ID_START.test(src[e + 1] || '')) { e++; continue; } break; }
      pos = e;
      return { t: 'id', v: src.slice(s, e), s, e, nl, sp };
    }
    if (ID_START.test(c) || (fam === 'rb' && c === '@' && ID_START.test(src[pos + 1] === '@' ? src[pos + 2] || '' : src[pos + 1] || ''))) {
      let at = pos;
      if (c === '@') at += src[pos + 1] === '@' ? 2 : 1;
      ID_RE.lastIndex = at; const mm = ID_RE.exec(src);
      let e = at + mm[0].length;
      while (lang === 'php' && src[e] === '\\' && ID_START.test(src[e + 1] || '')) { ID_RE.lastIndex = e + 1; e += 1 + ID_RE.exec(src)[0].length; }
      if (fam === 'rs' && src[e] === '!' && /[(\[{]/.test(src[e + 1] || '')) e++;
      else if (fam === 'rb' && (src[e] === '?' || src[e] === '!') && src[e + 1] !== '=' && src[e + 1] !== ':' && !(src[e] === '!' && src[e + 1] === '~')) {
        // `empty?` / `save!` — but not a ternary `a ? b : c` (which has a space before ?).
        e++;
      }
      pos = e;
      return { t: 'id', v: src.slice(s, e), s, e, nl, sp };
    }
    // Regular expressions (JavaScript): where an operand is expected.
    if (c === '/' && isJs(lang) && (!prev || (!OPERAND_END.has(prev.t) && !(prev.t === 'op' && /^[)\]}]$/.test(prev.v))) || (prev.t === 'id' && REGEX_AFTER_KW.test(prev.v)))) {
      let j = pos + 1, cls = false;
      for (; j < n; j++) {
        const ch = src[j];
        if (ch === '\\') { j++; continue; }
        if (ch === '\n') fail('unterminated regex');
        if (cls) { if (ch === ']') cls = false; continue; }
        if (ch === '[') cls = true; else if (ch === '/') break;
      }
      if (j >= n) fail('unterminated regex');
      j++;
      while (j < n && /[a-z]/.test(src[j])) j++;
      pos = j;
      return { t: 'regex', v: src.slice(s, j), s, e: j, nl, sp };
    }
    for (const o of ops.get(c) || []) {
      if (src.startsWith(o, pos)) {
        // `?.5` is a ternary on a number, not optional chaining.
        if (o === '?.' && /[0-9]/.test(src[pos + 2] || '')) continue;
        pos += o.length;
        return { t: 'op', v: o, s, e: pos, nl, sp };
      }
    }
    return fail(`unexpected character ${c}`);
  }

  return {
    src, lang, fam,
    at(k) { while (toks.length <= k) { const last = toks[toks.length - 1]; if (last && last.t === 'eof') return last; toks.push(lexOne()); } return toks[k]; },
    /** Skip a brace block whose `{` is token k: everything up to its matching `}` becomes one 'block' token. */
    skipBlock(k) {
      const open = this.at(k);
      const close = blockEnd(src, open.s, lang);
      toks.length = k;
      pos = close < 0 ? n : close + 1;
      toks.push({ t: 'block', v: '{…}', s: open.s, e: pos, nl: open.nl, sp: open.sp, open: close < 0 });
    },
    rest(k) { return src.slice(this.at(k).s); },
    /** Go back to token k and carry on lexing from source offset p (after something read character by character). */
    seek(k, p) { toks.length = k; pos = p; },
  };
}

/** Index of the `}` that closes the `{` at `open`, skipping strings, templates, and comments; -1 when none. */
export function blockEnd(src, open, lang) {
  const fam = famOf(lang);
  const hash = fam === 'py' || fam === 'rb' || lang === 'php';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || (c === '`' && (isJs(lang) || fam === 'go'))) {
      if (c === "'" && fam === 'rs' && !/^'(?:\\.|[^\\'])'/.test(src.slice(i, i + 4)) && !/^'\\u\{/.test(src.slice(i, i + 4))) continue; // a lifetime
      for (i++; i < src.length && src[i] !== c; i++) {
        if (src[i] === '\\' && !(c === '`' && fam === 'go')) i++;
        else if (c === '`' && src[i] === '$' && src[i + 1] === '{') { const e = blockEnd(src, i + 1, lang); if (e < 0) return -1; i = e; }
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '/' && fam !== 'py') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) return -1; i = e + 1; continue; }
    if (c === '#' && hash && !(fam === 'rb' && src[i + 1] === '{')) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

// ── Literals ─────────────────────────────────────────────────────────────────────────────────────────────────

const ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0', a: '\x07', e: '\x1b', '\\': '\\', "'": "'", '"': '"', '`': '`', $: '$', '\n': '' };
function unescape(body) {
  if (!body.includes('\\')) return body;
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|U[0-9a-fA-F]{8}|[0-7]{1,3}|[^])/g, (m, e) => {
    if (/^u\{/.test(e)) return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (/^[uUx]/.test(e) && e.length > 1) return String.fromCodePoint(parseInt(e.slice(1), 16));
    if (/^[0-7]+$/.test(e) && e !== '0') return String.fromCharCode(parseInt(e, 8));
    return ESC[e] ?? `\\${e}`;
  });
}
function stringValue(tok) {
  const raw = tok.v;
  if (tok.symbol) return { kind: 'literal', type: 'symbol', value: raw.slice(1), raw };
  const prefix = tok.prefix || '';
  const q = tok.q;
  let body;
  if (tok.triple) body = raw.slice(prefix.length + 3, raw.length - 3);
  else if (/r#/.test(prefix)) { const h = prefix.replace(/^b?r/, ''); body = raw.slice(prefix.length + 1, raw.length - 1 - h.length); }
  else body = raw.slice(prefix.length + 1, -1);
  const rawStr = /r/i.test(prefix) || q === '`';
  const value = rawStr ? body : prefix.includes('@') ? body.replace(/""/g, '"') : unescape(body);
  const node = { kind: 'literal', type: tok.char ? 'char' : 'text', value, raw };
  if (/b/i.test(prefix)) node.bytes = true;
  // Interpolated text whose parts are not read one by one (C# $"…", Kotlin "$x", Ruby "#{x}", PHP "…$x"): the exact
  // text is kept; the names inside stay in `raw`.
  if (prefix.includes('$') || (q === '"' && ((/\$\{|\$[A-Za-z_]/.test(body) && /^(kotlin|scala|php|dart)$/.test(globalLang)) || (/#\{/.test(body) && globalLang === 'ruby')))) node.interpolated = true;
  return node;
}
let globalLang = '';
function numberValue(raw) {
  const t = raw.replace(/_/g, '');
  let v = null;
  if (/^0[xX][0-9a-fA-F]+/.test(t)) v = parseInt(t.slice(2).match(/^[0-9a-fA-F]+/)[0], 16);
  else if (/^0[bB][01]+/.test(t)) v = parseInt(t.slice(2).match(/^[01]+/)[0], 2);
  else if (/^0[oO][0-7]+/.test(t)) v = parseInt(t.slice(2).match(/^[0-7]+/)[0], 8);
  else { const m = t.match(/^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/); if (m) v = Number(m[0]); }
  return { kind: 'literal', type: 'number', value: Number.isFinite(v) ? v : null, raw };
}
const NULLS = { null: 'null', nil: 'nil', None: 'None', undefined: 'undefined', NULL: 'NULL' };
const BOOLS = { true: true, false: false, True: true, False: false };

// ── Parser ───────────────────────────────────────────────────────────────────────────────────────────────────

// Binding powers for infix operators, per family. Higher binds tighter.
const BP = {
  c: { '??': 4, '||': 5, '&&': 6, '|': 7, '^': 8, '&': 9, '==': 10, '!=': 10, '===': 10, '!==': 10, '<>': 10, '<': 11, '>': 11, '<=': 11, '>=': 11, instanceof: 11, in: 11, is: 11, as: 11, satisfies: 11, '<<': 12, '>>': 12, '>>>': 12, '+': 13, '-': 13, '*': 14, '/': 14, '%': 14, '**': 15, '.': 13 },
  kt: { '||': 5, '&&': 6, '==': 10, '!=': 10, '===': 10, '!==': 10, '<': 11, '>': 11, '<=': 11, '>=': 11, in: 11.5, '!in': 11.5, is: 11.5, '!is': 11.5, '?:': 12, '..': 13.5, '..<': 13.5, '+': 14, '-': 14, '*': 15, '/': 15, '%': 15, as: 16, 'as?': 16 },
  py: { or: 5, and: 6, '==': 8, '!=': 8, '<': 8, '>': 8, '<=': 8, '>=': 8, in: 8, 'not in': 8, is: 8, 'is not': 8, '|': 9, '^': 10, '&': 11, '<<': 12, '>>': 12, '+': 13, '-': 13, '*': 14, '/': 14, '//': 14, '%': 14, '@': 14, '**': 16 },
  rb: { or: 2, and: 2, '||': 5, '&&': 6, '..': 4.5, '...': 4.5, '==': 8, '!=': 8, '===': 8, '=~': 8, '<': 9, '>': 9, '<=': 9, '>=': 9, '<=>': 8, '|': 10, '^': 10, '&': 11, '<<': 12, '>>': 12, '+': 13, '-': 13, '*': 14, '/': 14, '%': 14, '**': 16 },
  go: { '||': 5, '&&': 6, '==': 8, '!=': 8, '<': 8, '>': 8, '<=': 8, '>=': 8, '+': 9, '-': 9, '|': 9, '^': 9, '*': 10, '/': 10, '%': 10, '<<': 10, '>>': 10, '&': 10, '&^': 10 },
  rs: { '..': 3, '..=': 3, '||': 5, '&&': 6, '==': 8, '!=': 8, '<': 8, '>': 8, '<=': 8, '>=': 8, '|': 9, '^': 10, '&': 11, '<<': 12, '>>': 12, '+': 13, '-': 13, '*': 14, '/': 14, '%': 14, as: 15 },
};
// Words that cannot be a value where one is expected (a statement keyword): the reader gives up rather than guess.
const HARD = {
  c: /^(?:if|for|while|switch|try|class|return|throw|else|do|case|var|let|const|catch|finally|break|continue|import|export|default)$/,
  py: /^(?:if|for|while|try|class|def|return|raise|else|elif|import|from|with|pass|del|global|nonlocal|assert|except|finally|break|continue|in|is|and|or)$/,
  rb: /^(?:if|unless|while|until|for|case|when|def|class|module|return|else|elsif|begin|rescue|ensure|end|then|do|and|or)$/,
  go: /^(?:if|for|switch|select|case|default|return|go|defer|var|const|type|struct|interface|chan|range|else|fallthrough|break|continue|goto|package|import)$/,
  rs: /^(?:if|for|while|loop|match|fn|let|return|impl|struct|enum|trait|else|use|mod|break|continue)$/,
};
const PREFIX_BP = { c: 17, kt: 17, py: 15, rb: 15, go: 11, rs: 16 };
const COMPARE = new Set(['==', '!=', '===', '!==', '<>', '<', '>', '<=', '>=', 'in', 'not in', 'is', 'is not', 'instanceof', '!in', '!is', '=~']);
const LOGIC = { '||': 'or', '&&': 'and', or: 'or', and: 'and' };
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '//=', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '&&=', '||=', '??=', ':=', '.=', '&^=']);

function bpTable(lang) { const f = opFamily(lang); return f === 'kt' ? BP.kt : f === 'php' ? BP.c : BP[famOf(lang)] || BP.c; }

class Parser {
  constructor(src, lang) {
    this.L = makeLexer(src, lang);
    this.lang = lang;
    this.fam = famOf(lang);
    this.bp = bpTable(lang);
    this.k = 0;
    this.noBrace = false; // in a Go/Rust header, `name {` opens the block, not a literal
  }
  peek(o = 0) { return this.L.at(this.k + o); }
  next() { const t = this.L.at(this.k); this.k++; return t; }
  is(v, o = 0) { const t = this.peek(o); return t.t !== 'str' && t.t !== 'tpl' && t.t !== 'regex' && t.v === v; }
  isOp(v, o = 0) { const t = this.peek(o); return t.t === 'op' && t.v === v; }
  isId(v, o = 0) { const t = this.peek(o); return t.t === 'id' && t.v === v; }
  eat(v) { if (!this.is(v)) fail(`expected ${v}, saw ${this.peek().v || 'the end'}`); return this.next(); }
  atEnd() { const t = this.peek(); return t.t === 'eof' || (t.t === 'op' && t.v === ';' && this.L.at(this.k + 1).t === 'eof'); }

  /** Raw source text of tokens [a, b). */
  text(a, b) { return this.L.src.slice(this.L.at(a).s, this.L.at(b - 1).e).replace(/\s+/g, ' ').trim(); }

  // A type written after `:` / `as` / `is`, kept as text: Foo, Foo.Bar<X, Y>[], X | undefined, () => void.
  typeText(stops = []) {
    const a = this.k;
    let depth = 0;
    for (;;) {
      const t = this.peek();
      if (t.t === 'eof') break;
      if (t.t === 'block') break;
      if (t.t === 'op') {
        if ('([{<'.includes(t.v)) { if (t.v === '{' && depth === 0 && (this.fam !== 'c' || stops.includes('{'))) break; depth++; }
        else if (')]}'.includes(t.v)) { if (depth === 0) break; depth--; }
        else if (t.v === '>' || t.v === '>>') { if (depth === 0) break; depth -= t.v.length; if (depth < 0) depth = 0; }
        else if (depth === 0 && (t.v === ',' || t.v === ';' || t.v === '=' || stops.includes(t.v) || ASSIGN_OPS.has(t.v) || t.v === '&&' || t.v === '||' || t.v === '==' || t.v === '!=' || t.v === '===' || t.v === '!==' || t.v === '?' || t.v === ':' || t.v === '+' || t.v === '-' || t.v === '*' || t.v === '/')) break;
        else if (depth === 0 && t.v === '=>' && !stops.includes('=>')) { /* a function type */ }
        else if (depth === 0 && t.v === '->' && this.fam !== 'rs') break;
      } else if (depth === 0 && t.t === 'id' && (stops.includes(t.v) || /^(?:as|is|in|instanceof|satisfies|and|or|if|else)$/.test(t.v)) && this.k > a) break;
      this.next();
    }
    if (this.k === a) fail('expected a type');
    return this.text(a, this.k);
  }

  // ── expressions ──
  expr(min = 0) {
    if (this.spans) { const a = this.peek().s; const e = this.expr0(min); this.spans.set(e, [a, this.L.at(this.k - 1).e]); return e; }
    return this.expr0(min);
  }
  expr0(min) {
    let left = this.prefix();
    for (;;) {
      const t = this.peek();
      if (t.t === 'eof' || t.t === 'block') break;
      // Assignment inside an expression (`while ((m = re.exec(s)))`, Python `:=`): lowest, right-associative.
      if (t.t === 'op' && ASSIGN_OPS.has(t.v) && min <= 0.5) {
        if (t.v === ':=' && this.fam === 'go') break; // a Go declaration is a statement
        this.next();
        const value = this.expr(0.5);
        left = { kind: 'assign', op: t.v, target: left, value };
        continue;
      }
      // Ternary a ? b : c (C family, Ruby).
      if (t.t === 'op' && t.v === '?' && (this.fam === 'c' || this.fam === 'rb') && min <= 1 && this.lang !== 'kotlin') {
        this.next();
        const then = this.expr(0.5);
        this.eat(':');
        const els = this.expr(1);
        left = { kind: 'conditional', test: left, then, else: els };
        continue;
      }
      // Python: x if c else y.
      if (this.fam === 'py' && t.t === 'id' && t.v === 'if' && min <= 1 && !this.noIf) {
        this.next();
        const test = this.expr(2);
        if (!this.isId('else')) fail('if without else');
        this.next();
        const els = this.expr(1);
        left = { kind: 'conditional', test, then: left, else: els };
        continue;
      }
      const op = this.infixOp();
      if (!op) break;
      const bp = this.bp[op.key];
      if (bp == null || bp < min) break;
      this.k += op.len;
      if (op.key === 'as' || op.key === 'as?' || op.key === 'satisfies') { left = { kind: 'cast', value: left, type: this.typeText(), form: op.key }; continue; }
      if ((op.key === 'is' || op.key === '!is') && (this.lang === 'kotlin' || this.lang === 'csharp')) {
        const ty = this.typeText(['->']);
        left = { kind: 'compare', op: op.key, left, right: { kind: 'name', name: ty }, type: true };
        continue;
      }
      if (op.key === 'instanceof' && this.lang === 'java') { left = { kind: 'compare', op: 'instanceof', left, right: { kind: 'name', name: this.typeText(['&&', '||', ')']) }, type: true }; continue; }
      const right = this.expr(op.key === '**' ? bp : bp + 0.01);
      if (LOGIC[op.key] && !(this.lang === 'kotlin' && /^(and|or)$/.test(op.key))) {
        const lop = LOGIC[op.key];
        // (and / or are associative: `(a && b) && c` and `a && b && c` mean the same, so they read the same.)
        const operands = [...(left.kind === 'logic' && left.op === lop ? left.operands : [left]), right];
        left = { kind: 'logic', op: lop, operands };
      } else if (COMPARE.has(op.key)) {
        if (this.fam === 'py' && (left.kind === 'compare' || left.kind === 'chain') && !GROUPED.has(left)) {
          // Python chains comparisons: a < b < c means a < b and b < c.
          const ch = left.kind === 'chain' ? left : { kind: 'chain', ops: [left.op], operands: [left.left, left.right] };
          left = { kind: 'chain', ops: [...ch.ops, op.key], operands: [...ch.operands, right] };
        } else left = { kind: 'compare', op: op.key, left, right };
      } else if (op.key === '??' || op.key === '?:') left = { kind: 'binary', op: '??', left, right, ...(op.key === '?:' ? { spelled: '?:' } : {}) };
      else left = { kind: 'binary', op: op.key, left, right };
    }
    return left;
  }

  /** The infix operator at the current token: { key, len } or null. */
  infixOp() {
    const t = this.peek();
    if (t.t === 'op') {
      if (t.v === '!' && (this.lang === 'kotlin') && this.peek(1).t === 'id' && /^(is|in)$/.test(this.peek(1).v)) return { key: `!${this.peek(1).v}`, len: 2 };
      if (t.v === '.' && this.lang === 'php' && t.sp) return { key: '.', len: 1 };
      if (t.v === '..' && this.lang === 'kotlin' && this.isOp('<', 1)) return { key: '..<', len: 2 };
      if (t.v === '=' && this.fam === 'rb' && this.isOp('~', 1)) return { key: '=~', len: 2 };
      if (t.v === '<=' && this.fam === 'rb' && this.isOp('>', 1)) return { key: '<=>', len: 2 };
      if (t.v === '.' || t.v === '?.' || t.v === '::') return null;
      if (this.bp[t.v] != null) return { key: t.v, len: 1 };
      return null;
    }
    if (t.t === 'id') {
      if (this.fam === 'py' && t.v === 'not' && this.isId('in', 1)) return { key: 'not in', len: 2 };
      if (this.fam === 'py' && t.v === 'is' && this.isId('not', 1)) return { key: 'is not', len: 2 };
      if (t.v === 'as' && this.lang === 'kotlin' && this.isOp('?', 1)) return { key: 'as?', len: 2 };
      if (/^(and|or|in|is|instanceof|as|satisfies)$/.test(t.v) && this.bp[t.v] != null) {
        if (t.v === 'instanceof' && !isJs(this.lang) && this.lang !== 'java' && this.lang !== 'php') return null;
        if (t.v === 'in' && this.fam === 'c' && !isJs(this.lang) && this.lang !== 'kotlin') return null;
        if ((t.v === 'and' || t.v === 'or') && this.fam === 'c' && this.lang !== 'php') return null;
        if (t.v === 'as' && this.lang !== 'typescript' && this.lang !== 'csharp' && this.lang !== 'kotlin' && this.lang !== 'rust' && this.lang !== 'swift') return null;
        if (t.v === 'satisfies' && this.lang !== 'typescript') return null;
        if (t.v === 'is' && this.fam === 'c' && this.lang !== 'csharp' && this.lang !== 'kotlin') return null;
        return { key: t.v, len: 1 };
      }
    }
    return null;
  }

  prefix() {
    const t = this.peek();
    const fam = this.fam;
    if (t.t === 'op') {
      if (t.v === '<' && isJs(this.lang) && /^<(?:[A-Za-z_$]|>)/.test(this.L.src.slice(t.s, t.s + 2))) {
        // A generic arrow function `<T,>(x: T) => …` / `<T extends X>(…) => …`; anything else is JSX.
        if (/^<[A-Za-z_$][\w$]*\s*(?:,|extends\b|=|>\s*\()/.test(this.L.src.slice(t.s, t.s + 200)) && this.lang === 'typescript') {
          const typeParams = this.typeArgs();
          if (!this.isOp('(')) fail('generic');
          const f = this.arrowOrParen();
          if (f.kind !== 'lambda') fail('generic arrow');
          return { ...f, typeParams };
        }
        return this.postfix(this.jsx());
      }
      if (t.v === '!' || (t.v === '~')) { this.next(); const v = this.expr(PREFIX_BP[opFamily(this.lang)] ?? 17); return t.v === '!' ? { kind: 'not', value: v } : { kind: 'unary', op: '~', value: v }; }
      if (t.v === '-' || t.v === '+') {
        this.next();
        // Python: -x ** 2 is -(x ** 2); elsewhere unary binds tighter than everything but postfix.
        const v = this.expr(fam === 'py' ? 15 : PREFIX_BP[opFamily(this.lang)] ?? 17);
        // A negative number is one literal (-1), as a reader would write it.
        if (t.v === '-' && v.kind === 'literal' && v.type === 'number' && !GROUPED.has(v) && this.L.src[t.e] !== ' ') return { ...v, value: v.value == null ? null : -v.value, raw: `-${v.raw}` };
        return { kind: 'unary', op: t.v, value: v };
      }
      if (t.v === '++' || t.v === '--') { this.next(); return { kind: 'unary', op: t.v, value: this.expr(17) }; }
      if (t.v === '...' && (fam === 'c')) { this.next(); return { kind: 'spread', value: this.expr(1), form: '...' }; }
      if ((t.v === '*' || t.v === '**') && (fam === 'py' || fam === 'rb' || this.lang === 'kotlin')) { this.next(); return { kind: 'spread', value: this.expr(fam === 'py' ? 13 : 15), form: t.v }; }
      if (t.v === '&' && fam === 'rb') { this.next(); return { kind: 'spread', value: this.expr(15), form: '&' }; }
      if ((t.v === '*' || t.v === '&' || t.v === '<-') && (fam === 'go' || fam === 'rs')) {
        this.next();
        if (t.v === '&' && fam === 'rs' && this.isId('mut')) { this.next(); return { kind: 'unary', op: '&mut', value: this.expr(16) }; }
        return { kind: 'unary', op: t.v, value: this.expr(PREFIX_BP[fam]) };
      }
      if (t.v === '&&' && fam === 'rs') { this.next(); return { kind: 'unary', op: '&', value: { kind: 'unary', op: '&', value: this.expr(16) } }; }
      if ((t.v === '|' || t.v === '||') && fam === 'rs') return this.rustClosure();
      if (t.v === '(') return this.postfix(this.paren());
      if (t.v === '[') return this.postfix(fam === 'go' ? this.goTypedLiteral() : this.arrayLit());
      if (t.v === '{') {
        if (this.lang === 'kotlin') return this.postfix(this.kotlinLambda());
        if (fam === 'rb') return this.postfix(this.hashLit());
        if (fam === 'go' || fam === 'rs') fail('a block where a value was expected');
        return this.postfix(this.objectLit());
      }
      if (t.v === '@' && isJs(this.lang)) fail('decorator');
      if (t.v === '::' && (this.lang === 'php' || fam === 'rs')) { this.next(); return this.postfix({ kind: 'name', name: `::${this.next().v}` }); }
      return fail(`unexpected ${t.v}`);
    }
    if (t.t === 'num') { this.next(); return this.postfix(numberValue(t.v)); }
    if (t.t === 'str') {
      this.next();
      let node = this.stringNode(t);
      // Adjacent strings join (Python, C): "a" "b".
      while (this.peek().t === 'str' && (fam === 'py' || this.lang === 'c' || this.lang === 'cpp') && !this.peek().symbol) {
        const u = this.next();
        const b = this.stringNode(u);
        if (node.kind === 'literal' && b.kind === 'literal') { if (!!node.bytes !== !!b.bytes) fail('bytes and text'); node = { ...node, value: node.value + b.value, raw: `${node.raw} ${b.raw}` }; continue; }
        // "a " f"b {x}": one f-string, its parts joined.
        const partsOf = (x) => (x.kind === 'template' ? x.parts : x.kind === 'literal' && x.type === 'text' && !x.bytes ? [x.value] : fail('joined strings'));
        const parts = [];
        for (const x of [...partsOf(node), ...partsOf(b)]) { if (typeof x === 'string' && typeof parts[parts.length - 1] === 'string') parts[parts.length - 1] += x; else parts.push(x); }
        node = { kind: 'template', parts, raw: `${node.raw} ${b.raw}`, form: 'f' };
      }
      return this.postfix(node);
    }
    if (t.t === 'tpl') { this.next(); return this.postfix(this.template(t.v)); }
    if (t.t === 'regex') { this.next(); const i = t.v.lastIndexOf('/'); return this.postfix({ kind: 'literal', type: 'regex', value: t.v.slice(1, i), flags: t.v.slice(i + 1), raw: t.v }); }
    if (t.t === 'block') fail('a block where a value was expected');
    if (t.t === 'id') return this.word(t);
    return fail('unexpected end');
  }

  /** JSX, read character by character from the current token (`<`): elements, attributes, text, and {values}. */
  jsx() {
    const src = this.L.src;
    const start = this.peek().s;
    const k0 = this.k;
    const ws = (i) => { while (i < src.length && /\s/.test(src[i])) i++; return i; };
    const nameAt = (i) => { const m = /^[A-Za-z_$][\w$.:-]*/.exec(src.slice(i, i + 200)); return m ? m[0] : ''; };
    const exprIn = (open) => {
      const close = blockEnd(src, open, this.lang);
      if (close < 0) fail('JSX value');
      const inner = src.slice(open + 1, close).trim();
      return { close, inner };
    };
    const element = (i) => {
      i++;
      const tag = src[i] === '>' ? '' : nameAt(i);
      i += tag.length;
      const attrs = [];
      let selfClosing = false;
      for (;;) {
        i = ws(i);
        if (i >= src.length) fail('JSX');
        if (src.startsWith('/>', i)) { i += 2; selfClosing = true; break; }
        if (src[i] === '>') { i++; break; }
        if (src[i] === '{') {
          const { close, inner } = exprIn(i);
          const e = parseExpr(inner, this.lang);
          if (!e || e.kind !== 'spread') fail('JSX attribute');
          attrs.push({ spread: e.value });
          i = close + 1;
          continue;
        }
        const name = nameAt(i);
        if (!name) fail('JSX attribute name');
        i = ws(i + name.length);
        if (src[i] !== '=') { attrs.push({ name }); continue; }
        i = ws(i + 1);
        if (src[i] === '"' || src[i] === "'") {
          const q = src[i], e = src.indexOf(q, i + 1);
          if (e < 0) fail('JSX text');
          attrs.push({ name, value: { kind: 'literal', type: 'text', value: src.slice(i + 1, e), raw: src.slice(i, e + 1) } });
          i = e + 1;
        } else if (src[i] === '{') {
          const { close, inner } = exprIn(i);
          const e = parseExpr(inner, this.lang);
          if (!e) fail('JSX value');
          attrs.push({ name, value: e });
          i = close + 1;
        } else if (src[i] === '<') { const [el, j] = element(i); attrs.push({ name, value: el }); i = j; }
        else fail('JSX attribute value');
      }
      const children = [];
      if (!selfClosing) {
        for (;;) {
          if (i >= src.length) fail('unclosed JSX');
          if (src.startsWith('</', i)) {
            const j = ws(i + 2);
            const closeName = nameAt(j);
            if (closeName !== tag) fail('JSX closing tag');
            const k = ws(j + closeName.length);
            if (src[k] !== '>') fail('JSX closing tag');
            i = k + 1;
            break;
          }
          if (src[i] === '<') { const [el, j] = element(i); children.push(el); i = j; continue; }
          if (src[i] === '{') {
            const { close, inner } = exprIn(i);
            i = close + 1;
            if (!inner || /^\/\*[^]*\*\/$/.test(inner)) continue; // {/* a comment */}
            const e = parseExpr(inner, this.lang);
            if (!e) fail('JSX value');
            children.push({ kind: 'jsx-value', value: e });
            continue;
          }
          let j = i;
          while (j < src.length && src[j] !== '<' && src[j] !== '{') j++;
          // JSX text: lines trimmed, blank lines dropped, the rest joined with one space (React's rule).
          const lines = src.slice(i, j).replace(/\t/g, ' ').split(/\r?\n/);
          const text = lines.map((l, n) => { let x = l; if (n > 0) x = x.replace(/^\s+/, ''); if (n < lines.length - 1) x = x.replace(/\s+$/, ''); return x; }).filter((l) => l.length).join(' ');
          if (text) children.push(text);
          i = j;
        }
      }
      return [{ kind: 'jsx', tag, attrs, children }, i];
    };
    const [node, end] = element(start);
    this.L.seek(k0, end);
    this.k = k0;
    return node;
  }

  stringNode(t) {
    globalLang = this.lang;
    if (t.prefix && t.prefix.includes('f') && this.fam === 'py') return this.fstring(t);
    return stringValue(t);
  }

  word(t) {
    const v = t.v, fam = this.fam, lang = this.lang;
    // Keyword values.
    if (Object.hasOwn(BOOLS, v) && (fam === 'py' ? /^[TF]/.test(v) : /^[tf]/.test(v))) { this.next(); return this.postfix({ kind: 'literal', type: 'bool', value: BOOLS[v], raw: v }); }
    if (Object.hasOwn(NULLS, v) && ((fam === 'py' && v === 'None') || (fam === 'rb' && v === 'nil') || (fam === 'go' && v === 'nil') || (fam === 'c' && (v === 'null' || (isJs(lang) && v === 'undefined') || (lang === 'php' && v === 'NULL'))))) { this.next(); return this.postfix({ kind: 'literal', type: 'null', value: null, raw: v }); }
    if (fam === 'py' && v === 'not') { this.next(); return { kind: 'not', value: this.expr(7) }; }
    if (fam === 'rb' && v === 'not') { this.next(); return { kind: 'not', value: this.expr(3) }; }
    if (fam === 'py' && v === 'lambda') return this.pyLambda();
    if (v === 'await' && (fam === 'py' || fam === 'c') && this.startsValue(1)) { this.next(); return { kind: 'unary', op: 'await', value: this.expr(fam === 'py' ? 16 : 17) }; }
    if (isJs(lang) && /^(?:typeof|void|delete)$/.test(v) && this.startsValue(1)) { this.next(); return { kind: 'unary', op: v, value: this.expr(17) }; }
    if (v === 'new' && (fam === 'c') && this.peek(1).t === 'id') return this.newExpr();
    if ((v === 'typeof' || v === 'default' || v === 'sizeof') && lang === 'csharp' && this.isOp('(', 1)) {
      // typeof(IHandler<,>): the type as written.
      this.next(); this.next();
      const a = this.k;
      for (let d = 0; ; ) { const t = this.peek(); if (t.t === 'eof') fail('typeof'); if (t.t === 'op' && t.v === '(') d++; if (t.t === 'op' && t.v === ')') { if (d === 0) break; d--; } this.next(); }
      const type = this.text(a, this.k);
      this.next();
      return this.postfix({ kind: 'call', callee: { kind: 'name', name: v }, args: [{ kind: 'name', name: type, type: true }] });
    }
    if (v === 'static' && lang === 'csharp' && (this.isOp('(', 1) || (this.peek(1).t === 'id' && this.isOp('=>', 2)))) { this.next(); const f = this.peek().t === 'id' ? this.arrowSingle() : this.arrowOrParen(); if (f.kind !== 'lambda') fail('static'); return { ...f, static: true }; }
    if (v === 'new' && lang === 'csharp' && this.isOp('(', 1)) { this.next(); const args = this.args(')'); return this.postfix({ kind: 'call', callee: { kind: 'name', name: '' }, args, new: true, ...this.initializer() }); }
    if ((v === 'function' && isJs(lang)) || (v === 'async' && isJs(lang) && this.isId('function', 1))) return this.postfix(this.jsFunction());
    if (lang === 'php' && (v === 'function' || v === 'fn' || (v === 'static' && (this.isId('function', 1) || this.isId('fn', 1))))) {
      // (PHP's `$fn` is read as `fn`: a variable named fn, called, is not an arrow function.)
      const k0 = this.k;
      try { return this.postfix(this.phpFunction()); } catch (e) { if (!(e instanceof Fail) || v !== 'fn') throw e; this.k = k0; }
    }
    if (v === 'func' && fam === 'go' && this.isOp('(', 1)) return this.postfix(this.goFunc());
    if (v === 'fn' && fam === 'rs' && this.isOp('(', 1)) fail('fn item');
    if (fam === 'rs' && v.endsWith('!') && this.isOp('[', 1)) { this.next(); const arr = this.arrayLit(); return this.postfix({ kind: 'call', callee: { kind: 'name', name: v }, args: arr.items ?? [arr], form: 'macro[]', ...(arr.repeat ? { repeat: arr.repeat } : {}) }); }
    if (v === 'move' && fam === 'rs' && (this.isOp('|', 1) || this.isOp('||', 1))) { this.next(); const c = this.rustClosure(); c.move = true; return c; }
    if (v === 'async' && isJs(lang) && (this.isOp('(', 1) || (this.peek(1).t === 'id' && this.isOp('=>', 2)))) { this.next(); const f = this.peek().t === 'id' ? this.arrowSingle() : this.arrowOrParen(); if (f.kind !== 'lambda') fail('async'); f.async = true; return f; }
    if (fam === 'c' && this.isOp('=>', 1) && (isJs(lang) || lang === 'csharp')) return this.arrowSingle();
    if (lang === 'java' && this.isOp('->', 1)) return this.arrowSingle('->');
    if (fam === 'go' && (v === 'map' && this.isOp('[', 1))) return this.goTypedLiteral();
    if (fam === 'go' && (v === 'struct' || v === 'interface') && this.isOp('{', 1)) return this.postfix(this.goTypedLiteral());
    if (fam === 'go' && (v === 'chan' || (v === 'func' && false))) return this.postfix(this.goTypedLiteral());
    if (v === 'yield' && (fam === 'py' || isJs(lang))) { this.next(); const delegate = fam === 'py' ? this.isId('from') && !!this.next() : this.isOp('*') && !!this.next(); return { kind: 'yield', ...(this.startsValue(0) ? { value: this.expr(1) } : {}), ...(delegate ? { delegate: true } : {}) }; }
    if (fam === 'rb' && v === 'defined?') { this.next(); return this.postfix({ kind: 'call', callee: { kind: 'name', name: v }, args: this.isOp('(') ? (this.next(), this.args(')')) : [this.expr(14)] }); }
    if (HARD[fam].test(v) || (lang === 'kotlin' && /^(?:when|val|fun|object)$/.test(v))) fail(`${v} where a value was expected`);
    this.next();
    let node = { kind: 'name', name: v };
    // Ruby: a method called without brackets is still a call when arguments follow (`raise Error, "x"` is handled by the statement).
    return this.postfix(node);
  }

  startsValue(o = 0) {
    const t = this.peek(o);
    if (t.t === 'eof' || t.t === 'block') return false;
    if (t.t !== 'op') return !(t.t === 'id' && /^(?:if|else|for|in|of|and|or|then|do|as|is)$/.test(t.v));
    return /^(?:\(|\[|\{|!|-|\+|~|\.\.\.|\*|&|<-)$/.test(t.v);
  }

  postfix(node) {
    const fam = this.fam, lang = this.lang;
    for (;;) {
      const t = this.peek();
      if (t.t === 'eof' || t.t === 'block') {
        if (t.t === 'block' && this.trailingBlockOk(node, t)) { this.next(); node = this.withTrailing(node, { kind: 'lambda', params: [], body: { kind: 'block' } }); continue; }
        break;
      }
      if (t.t === 'op') {
        if (t.v === '(') {
          if (t.nl && fam === 'rb') break;
          this.next();
          const args = this.args(')');
          node = { kind: 'call', callee: node, args };
          if (lang === 'csharp' && node.callee.kind === 'name' && node.callee.name === 'typeof') node.args = args;
          continue;
        }
        if (t.v === '[') {
          if (t.nl && (isJs(lang) || fam === 'rb')) break;
          this.next();
          if (this.isOp(']') && fam === 'go') fail('a Go type');
          if (this.isOp(']') && this.lang === 'java' && this.isOp('.', 1) && this.isId('class', 2)) { this.next(); node = { kind: 'name', name: `${flatName(node) ?? fail('array type')}[]`, type: true }; continue; }
          if (this.isOp(']') && this.lang === 'php') { this.next(); node = { kind: 'index', object: node, index: { kind: 'hole' }, append: true }; continue; }
          const index = this.indexOrSlice();
          this.eat(']');
          node = { kind: 'index', object: node, index };
          continue;
        }
        if (t.v === '.' && !(lang === 'php' && t.sp)) {
          this.next();
          const p = this.peek();
          if (p.t === 'op' && p.v === '(' && fam === 'go') { this.next(); const ty = this.isId('type') ? this.next().v : this.goType(); this.eat(')'); node = { kind: 'cast', value: node, type: ty, form: 'assert' }; continue; }
          if (p.t === 'op' && p.v === '<' && lang === 'java') fail('explicit type arguments');
          if (p.t !== 'id' && p.t !== 'num') fail('expected a name after .');
          this.next();
          if (fam === 'rs' && p.v === 'await') { node = { kind: 'unary', op: 'await', value: node, postfix: true }; continue; }
          node = { kind: 'member', object: node, property: p.v };
          continue;
        }
        if (t.v === '&.' && fam === 'rb') { this.next(); const pn = this.next(); if (pn.t !== 'id') fail('a name after &.'); node = { kind: 'member', object: node, property: pn.v, optional: true }; continue; }
        if (t.v === '?.' && fam === 'c') {
          this.next();
          if (this.isOp('(')) { this.next(); node = { kind: 'call', callee: node, args: this.args(')'), optional: true }; continue; }
          if (this.isOp('[')) { this.next(); const index = this.expr(0); this.eat(']'); node = { kind: 'index', object: node, index, optional: true }; continue; }
          const p = this.next();
          if (p.t !== 'id') fail('expected a name after ?.');
          node = { kind: 'member', object: node, property: p.v, optional: true };
          continue;
        }
        if (t.v === '::' && (fam === 'rs' || lang === 'php' || fam === 'rb' || lang === 'java' || lang === 'kotlin' || lang === 'cpp' || lang === 'c')) {
          this.next();
          if (this.isOp('<') && fam === 'rs') { node = { ...node, typeArgs: this.typeArgs() }; continue; }
          const p = this.next();
          if (p.t !== 'id' && !(p.t === 'op' && p.v === '*')) fail('expected a name after ::');
          node = { kind: 'member', object: node, property: p.v, static: true };
          continue;
        }
        if (t.v === '!' && !t.sp && (lang === 'typescript' || lang === 'csharp') && this.notStartOfValue(1)) { this.next(); continue; } // a non-null claim changes nothing at run time
        if (t.v === '!!' && lang === 'kotlin') { this.next(); node = { kind: 'unary', op: '!!', value: node, postfix: true }; continue; }
        if (t.v === '?' && fam === 'rs' && !t.sp) { this.next(); node = { kind: 'unary', op: '?', value: node, postfix: true }; continue; }
        if ((t.v === '++' || t.v === '--') && !t.nl && fam !== 'py') { this.next(); node = { kind: 'unary', op: t.v, value: node, postfix: true }; continue; }
        if (t.v === '<' && (lang === 'typescript' || lang === 'csharp' || lang === 'java' || lang === 'kotlin') && !t.sp && this.looksLikeTypeArgs()) { node = { ...node, typeArgs: this.typeArgs() }; continue; }
        if (t.v === '{' && !this.noBrace && (fam === 'go' || fam === 'rs') && this.isTypeName(node)) { node = this.compositeLit(node); continue; }
        if (t.v === '{' && lang === 'kotlin' && !this.noBrace && (node.kind === 'call' || node.kind === 'name' || node.kind === 'member')) { node = this.withTrailing(node, this.kotlinLambda()); continue; }
        // Ruby: braces after a call are its block (`items.each { |x| … }`, `loop { … }`); a hash is only ever an argument.
        if (t.v === '{' && fam === 'rb' && (node.kind === 'call' || node.kind === 'member' || node.kind === 'name')) { node = this.withTrailing(node, this.rubyBraceBlock()); continue; }
        if (t.v === '{' && lang === 'csharp' && node.kind === 'call' && node.new) { Object.assign(node, this.initializer()); continue; }
        break;
      }
      if (t.t === 'id' && t.v === 'do' && fam === 'rb') { node = this.withTrailing(node, this.rubyDoBlock()); continue; }
      if (t.t === 'tpl' && isJs(lang) && !t.sp) { this.next(); node = { ...this.template(t.v), tag: node }; continue; }
      break;
    }
    return node;
  }

  notStartOfValue(o) { const t = this.peek(o); return t.t === 'eof' || (t.t === 'op' && /^(?:\.|\?\.|\(|\[|\)|\]|\}|,|;|=|==|===|!=|!==|&&|\|\||\?\?|:|\+|-|\*|\/|<|>|<=|>=)$/.test(t.v)); }
  trailingBlockOk(node, t) { return (this.lang === 'kotlin' && !this.noBrace && (node.kind === 'call' || node.kind === 'name' || node.kind === 'member')) || false; }
  withTrailing(node, lambda) {
    lambda.trailing = true;
    if (node.kind === 'call') return { ...node, args: [...node.args, lambda] };
    return { kind: 'call', callee: node, args: [lambda], parens: false };
  }
  isTypeName(node) {
    if (this.fam === 'go') return node.kind === 'name' || (node.kind === 'member' && node.object.kind === 'name') || node.kind === 'index';
    return (node.kind === 'name' && /^[A-Z]/.test(node.name)) || (node.kind === 'member' && node.static && /^[A-Z]/.test(node.property));
  }
  looksLikeTypeArgs() {
    let depth = 0;
    for (let o = 0; o < 40; o++) {
      const t = this.peek(o);
      if (t.t === 'eof' || t.t === 'block') return false;
      if (t.t === 'op') {
        if (t.v === '<') depth++;
        else if (t.v === '>' || t.v === '>>') { depth -= t.v.length; if (depth <= 0) { const nx = this.peek(o + 1); return nx.t === 'op' && (nx.v === '(' || (nx.v === '{' && this.lang === 'csharp')); } }
        else if (!/^(?:,|\.|\[|\]|\||&|\?|=>|\(|\)|:)$/.test(t.v)) return false;
      } else if (t.t !== 'id' && t.t !== 'str' && t.t !== 'num') return false;
    }
    return false;
  }
  typeArgs() {
    const a = this.k;
    let depth = 0;
    for (;;) {
      const t = this.next();
      if (t.t === 'eof') fail('type arguments');
      if (t.t === 'op' && t.v === '<') depth++;
      else if (t.t === 'op' && (t.v === '>' || t.v === '>>')) { depth -= t.v.length; if (depth <= 0) break; }
    }
    return this.text(a, this.k);
  }

  indexOrSlice() {
    const sliceLang = this.fam === 'py' || this.fam === 'go';
    if (!sliceLang) return this.expr(0);
    const part = () => (this.isOp(':') || this.isOp(']') ? null : this.expr(0.6));
    const start = part();
    if (!this.isOp(':')) {
      if (this.fam === 'py' && this.isOp(',')) { const items = [start]; while (this.isOp(',')) { this.next(); if (this.isOp(']')) break; items.push(this.expr(0.6)); } return { kind: 'array', form: 'tuple', items }; }
      return start;
    }
    this.next();
    const end = part();
    let step = null;
    if (this.isOp(':')) { this.next(); step = part(); }
    return { kind: 'slice', ...(start ? { start } : {}), ...(end ? { end } : {}), ...(step ? { step } : {}) };
  }

  /** Arguments up to `close`: positional, named (Python / Kotlin / C# / Swift), spread; generator expressions. */
  args(close) {
    const out = [];
    while (!this.isOp(close)) {
      if (this.peek().t === 'eof') fail('unclosed call');
      const t = this.peek();
      const namedSep = this.fam === 'py' || this.lang === 'kotlin' || this.lang === 'scala' ? '=' : this.lang === 'csharp' || this.lang === 'swift' || this.lang === 'php' || this.fam === 'rb' ? ':' : null;
      if (t.t === 'id' && namedSep && this.isOp(namedSep, 1) && !(namedSep === ':' && this.isOp(':', 2))) {
        this.next(); this.next();
        out.push({ kind: 'named', name: t.v, value: this.expr(0.6) });
      } else if (this.fam === 'rb' && (t.t === 'str' || t.t === 'id') && this.isOp('=>', 1)) {
        out.push(this.hashPairsInline());
        continue;
      } else {
        let a = this.expr(this.fam === 'c' || this.fam === 'rs' ? 0.5 : 0.6);
        if (this.fam === 'py' && this.isId('for')) a = this.comprehension(a, 'generator');
        // Go: passing a list as separate arguments, `append(xs, ys...)`.
        if (this.fam === 'go' && this.isOp('...')) { this.next(); a = { kind: 'spread', value: a, form: '...', postfix: true }; }
        if (this.fam === 'rb' && this.isOp('=>')) { this.next(); a = { kind: 'object', entries: [{ key: a, value: this.expr(0.6) }], form: 'hash', bare: true }; }
        if (this.lang === 'php' && this.isOp('=>')) { this.next(); a = { kind: 'object', entries: [{ key: a, value: this.expr(0.6) }], bare: true }; }
        out.push(a);
      }
      if (this.isOp(',')) { this.next(); continue; }
      if (!this.isOp(close)) fail(`expected , or ${close}`);
    }
    this.next();
    return out;
  }
  hashPairsInline() {
    const entries = [];
    while (!this.isOp(')') && this.peek().t !== 'eof') {
      const key = this.expr(0.6); this.eat('=>'); entries.push({ key, value: this.expr(0.6) });
      if (this.isOp(',')) this.next(); else break;
    }
    return { kind: 'object', entries, form: 'hash', bare: true };
  }

  paren() {
    // An arrow function `(a, b) => …` / `(a: T): R => …`?
    if (this.fam === 'c' && (isJs(this.lang) || this.lang === 'csharp' || this.lang === 'java')) {
      // JSX inside brackets (`return (\n  <div>…`) is read as JSX, not scanned as code.
      if (isJs(this.lang) && /^\(\s*</.test(this.L.src.slice(this.peek().s, this.peek().s + 400))) return this.plainParen();
      const k0 = this.k;
      try { return this.arrowOrParen(); } catch (e) { if (!(e instanceof Fail) || this.k !== k0) throw e; return this.plainParen(); }
    }
    return this.plainParen();
  }
  arrowOrParen() {
    // Find the matching ) and look for => (or ->, Java) after it, past an optional return type.
    let depth = 0, o = 0;
    for (;; o++) {
      const t = this.peek(o);
      if (t.t === 'eof' || t.t === 'block') break;
      if (t.t === 'op') { if ('([{'.includes(t.v)) depth++; else if (')]}'.includes(t.v)) { depth--; if (depth === 0) break; } }
    }
    const after = this.peek(o + 1);
    const arrow = this.lang === 'java' ? '->' : '=>';
    let isArrow = after.t === 'op' && after.v === arrow;
    let typeAt = -1;
    if (!isArrow && after.t === 'op' && after.v === ':' && this.lang === 'typescript') {
      // (a): Promise<X> => …
      for (let j = o + 2, d = 0; j < o + 60; j++) {
        const u = this.peek(j);
        if (u.t === 'eof') break;
        if (u.t === 'op') { if ('(<[{'.includes(u.v)) d++; else if (')>]}'.includes(u.v)) d--; else if (u.v === '=>' && d <= 0) { isArrow = true; typeAt = o + 2; break; } else if (d <= 0 && /^(?:;|,|=)$/.test(u.v)) break; }
      }
    }
    if (!isArrow || this.fam === 'py') return this.plainParen();
    this.next();
    const params = this.paramList(')');
    let returns = null;
    if (typeAt > 0) { this.next(); returns = this.typeText(['=>']); }
    this.eat(arrow);
    return { kind: 'lambda', params, ...(returns ? { returns } : {}), body: this.lambdaBody() };
  }
  arrowSingle(arrow = '=>') { const p = this.next(); this.eat(arrow); return { kind: 'lambda', params: [p.v], body: this.lambdaBody() }; }
  lambdaBody() {
    if (this.isOp('{')) { this.L.skipBlock(this.k); this.next(); return { kind: 'block' }; }
    if (this.peek().t === 'block') { this.next(); return { kind: 'block' }; }
    return this.expr(0.5);
  }
  /** Parameters as written (names, types, defaults, destructuring), one string each, up to `close`. */
  paramList(close) {
    const out = [];
    let a = this.k, depth = 0;
    for (;;) {
      const t = this.peek();
      if (t.t === 'eof') fail('unclosed parameters');
      if (t.t === 'op') {
        if ('([{<'.includes(t.v) && !(t.v === '<' && this.fam === 'py')) depth++;
        else if (t.v === close && depth === 0) { if (this.k > a) out.push(this.text(a, this.k)); this.next(); return out; }
        else if (')]}>'.includes(t.v) && !(t.v === '>' && this.fam === 'py')) depth--;
        else if (t.v === '=>' && depth > 0) { /* a function type */ }
        else if (t.v === ',' && depth === 0) { out.push(this.text(a, this.k)); this.next(); a = this.k; continue; }
      }
      this.next();
    }
  }
  plainParen() {
    this.next();
    if (this.isOp(')')) { this.next(); return { kind: 'array', form: 'tuple', items: [] }; }
    // Java / C# cast: (Type) value.
    if ((this.lang === 'java' || this.lang === 'csharp' || this.lang === 'c' || this.lang === 'cpp' || this.lang === 'php') && this.peek().t === 'id' && this.castAhead()) {
      const ty = this.typeText([')']);
      this.eat(')');
      return { kind: 'cast', value: this.expr(PREFIX_BP.c), type: ty, form: 'paren' };
    }
    const saveBrace = this.noBrace, saveIf = this.noIf;
    this.noBrace = false; this.noIf = false;
    let e = this.expr(0);
    if (this.fam === 'py' && this.isId('for')) e = this.comprehension(e, 'generator');
    if (this.isOp(',')) {
      const items = [e];
      while (this.isOp(',')) { this.next(); if (this.isOp(')')) break; items.push(this.expr(0.6)); }
      e = { kind: 'array', form: 'tuple', items };
    } else if (e && typeof e === 'object') GROUPED.add(e);
    this.noBrace = saveBrace; this.noIf = saveIf;
    this.eat(')');
    return e;
  }
  castAhead() {
    // (Foo) x, (Foo<Bar>) x, (int) x — a type in brackets followed directly by a value.
    let o = 0, depth = 0;
    const prim = /^(?:int|integer|long|short|byte|char|float|double|boolean|bool|decimal|string|object|array|uint|ulong|sbyte|ushort|var)$/;
    const first = this.peek(0);
    if (!(/^[A-Z]/.test(first.v) || prim.test(first.v))) return false;
    for (;; o++) {
      const t = this.peek(o);
      if (t.t === 'eof') return false;
      if (t.t === 'op') {
        if (t.v === '<' || t.v === '[') depth++;
        else if (t.v === '>' || t.v === ']') depth--;
        else if (t.v === ')' && depth === 0) break;
        else if (!/^(?:\.|,|\?)$/.test(t.v)) return false;
      } else if (t.t !== 'id') return false;
    }
    const nx = this.peek(o + 1);
    return nx.t === 'id' ? !/^(?:instanceof|is|as|and|or)$/.test(nx.v) : nx.t === 'num' || nx.t === 'str' || (nx.t === 'op' && (nx.v === '(' || nx.v === '!'));
  }

  arrayLit() {
    this.next();
    const items = [];
    while (!this.isOp(']')) {
      if (this.peek().t === 'eof') fail('unclosed list');
      if (this.isOp(',') && this.fam === 'c') { this.next(); items.push({ kind: 'hole' }); continue; }
      let it = this.expr(0.6);
      if (this.fam === 'py' && this.isId('for')) { it = this.comprehension(it, 'list'); this.eat(']'); return it; }
      if ((this.lang === 'php') && this.isOp('=>')) { this.next(); const value = this.expr(0.6); items.push({ kind: 'pair', key: it, value }); }
      else items.push(it);
      if (this.isOp(',')) { this.next(); continue; }
      if (this.fam === 'rs' && this.isOp(';')) { this.next(); const count = this.expr(0.6); this.eat(']'); return { kind: 'array', items, repeat: count }; }
      if (!this.isOp(']')) fail('expected , or ]');
    }
    this.next();
    if (items.some((x) => x.kind === 'pair')) {
      if (!items.every((x) => x.kind === 'pair')) fail('mixed array');
      return { kind: 'object', entries: items.map((x) => ({ key: x.key, value: x.value })), form: 'array' };
    }
    return { kind: 'array', items };
  }

  objectLit() {
    // JavaScript object, Python dict or set, C#/Java array initializer.
    this.next();
    if (this.fam === 'py') return this.pyBrace();
    const entries = [];
    while (!this.isOp('}')) {
      const t = this.peek();
      if (t.t === 'eof') fail('unclosed object');
      if (t.t === 'op' && t.v === '...') { this.next(); entries.push({ kind: 'spread', value: this.expr(0.6), form: '...' }); }
      else if (t.t === 'op' && t.v === '[') { this.next(); const key = this.expr(0); this.eat(']'); this.eat(':'); entries.push({ key, value: this.expr(0.6), computed: true }); }
      else if ((t.t === 'id' || t.t === 'str' || t.t === 'num') && (this.isOp(':', 1))) {
        this.next(); this.next();
        const key = t.t === 'id' ? { kind: 'literal', type: 'text', value: t.v, raw: t.v } : t.t === 'num' ? numberValue(t.v) : stringValue(t);
        entries.push({ key, value: this.expr(0.6) });
      } else if (t.t === 'id' && (this.isOp(',', 1) || this.isOp('}', 1)) && isJs(this.lang)) {
        this.next();
        entries.push({ key: { kind: 'literal', type: 'text', value: t.v, raw: t.v }, value: { kind: 'name', name: t.v }, shorthand: true });
      } else if (t.t === 'id' && isJs(this.lang) && this.isOp('=', 1)) fail('a default in a pattern');
      else if (isJs(this.lang) && (t.t === 'id' || t.t === 'str') && (this.isOp('(', 1) || ((t.v === 'get' || t.v === 'set' || t.v === 'async') && this.peek(1).t === 'id' && this.isOp('(', 2)) || (t.v === 'async' && this.isOp('*', 1)) || (t.t === 'op' && t.v === '*'))) {
        // A method: `transform(chunk) { … }`, `get size() { … }`, `async load() { … }`. Its steps are the step's children.
        let form = 'method';
        if ((t.v === 'get' || t.v === 'set' || t.v === 'async') && !this.isOp('(', 1)) { form = t.v === 'async' ? 'async method' : `${t.v}ter`; this.next(); }
        if (this.isOp('*')) { this.next(); form = 'generator method'; }
        const k = this.next();
        this.eat('(');
        const params = this.paramList(')');
        if (this.isOp(':')) { this.next(); this.typeText(['{']); }
        if (!this.isOp('{')) fail('method body');
        entries.push({ key: k.t === 'str' ? stringValue(k) : { kind: 'literal', type: 'text', value: k.v, raw: k.v }, value: { kind: 'lambda', params, body: this.lambdaBody(), form }, method: true });
      } else if (isJs(this.lang)) fail('a method in an object');
      else { entries.push({ value: this.expr(0.6) }); }
      if (this.isOp(',')) { this.next(); continue; }
      if (!this.isOp('}')) fail('expected , or }');
    }
    this.next();
    if (entries.length && entries.every((e) => !e.key && e.kind !== 'spread')) return { kind: 'array', items: entries.map((e) => e.value), form: 'braces' };
    return { kind: 'object', entries };
  }
  pyBrace() {
    if (this.isOp('}')) { this.next(); return { kind: 'object', entries: [] }; }
    const entries = [], items = [];
    for (;;) {
      if (this.peek().t === 'eof') fail('unclosed dict');
      if (this.isOp('**')) { this.next(); entries.push({ kind: 'spread', value: this.expr(13), form: '**' }); }
      else {
        const k = this.expr(0.6);
        if (this.isOp(':')) {
          this.next();
          const v = this.expr(0.6);
          if (this.isId('for')) { const c = this.comprehension(v, 'dict'); c.key = k; this.eat('}'); return c; }
          entries.push({ key: k, value: v });
        } else {
          if (this.isId('for')) { const c = this.comprehension(k, 'set'); this.eat('}'); return c; }
          items.push(k);
        }
      }
      if (this.isOp(',')) { this.next(); if (this.isOp('}')) break; continue; }
      break;
    }
    this.eat('}');
    if (items.length && entries.length) fail('mixed set and dict');
    return items.length ? { kind: 'array', items, form: 'set' } : { kind: 'object', entries };
  }
  hashLit() {
    // Ruby { a: 1, "b" => 2 }
    this.next();
    const entries = [];
    while (!this.isOp('}')) {
      const t = this.peek();
      if (t.t === 'eof') fail('unclosed hash');
      if (t.t === 'id' && this.isOp(':', 1) && !this.peek(1).sp) { this.next(); this.next(); entries.push({ key: { kind: 'literal', type: 'symbol', value: t.v, raw: `:${t.v}` }, value: this.expr(0.6), colon: true }); }
      else if (t.t === 'op' && t.v === '**') { this.next(); entries.push({ kind: 'spread', value: this.expr(14), form: '**' }); }
      else { const key = this.expr(0.6); this.eat('=>'); entries.push({ key, value: this.expr(0.6) }); }
      if (this.isOp(',')) { this.next(); continue; }
      if (!this.isOp('}')) fail('expected , or }');
    }
    this.next();
    return { kind: 'object', entries, form: 'hash' };
  }
  rubyBraceBlock() {
    const open = this.k;
    let params = [];
    let from = this.peek().e;
    if (this.isOp('|', 1)) { const a = this.peek(1); for (let o = 2; o < 40; o++) { const t = this.peek(o); if (t.t === 'eof') break; if (t.t === 'op' && t.v === '|') { params = splitParams(this.L.src.slice(a.e, t.s)); from = t.e; break; } } }
    return { kind: 'lambda', params, body: this.braceBody(open, from), form: 'block' };
  }
  rubyDoBlock() {
    this.next();
    const params = this.isOp('|') ? (this.next(), this.paramList('|')) : [];
    // The rest of the statement is the block (its body is the step's children).
    while (this.peek().t !== 'eof') this.next();
    return { kind: 'lambda', params, body: { kind: 'block' }, form: 'do' };
  }
  kotlinLambda() {
    // { a, b -> … } or { … }: the body is the step's children.
    const open = this.k, ot = this.peek();
    let params = [];
    let from = ot.e;
    for (let o = 1, d = 0; o < 40; o++) {
      const t = this.peek(o);
      if (t.t === 'eof' || t.t === 'block') break;
      if (t.t === 'op') {
        if (t.v === '->' && d === 0) { params = splitParams(this.L.src.slice(ot.e, t.s)); from = t.e; break; }
        if ('([{<'.includes(t.v)) d++; else if (')]}>'.includes(t.v)) { if (d === 0) break; d--; } else if (!/^(?:,|:|\.|\?)$/.test(t.v)) break;
      }
    }
    return { kind: 'lambda', params, body: this.braceBody(open, from), form: 'braces' };
  }
  /**
   * The body of a block written in braces (Kotlin, Ruby) at token `open`, from source offset `from`: one expression
   * when it is exactly one (`{ "message" }`, `{ it.name }`), so the value is kept; otherwise a block whose statements
   * are the step's children.
   */
  braceBody(open, from) {
    const close = blockEnd(this.L.src, this.L.at(open).s, this.lang);
    const inner = close > 0 ? this.L.src.slice(from, close).trim() : '';
    this.L.skipBlock(open); this.k = open; this.next();
    const one = inner && !/[;\n]/.test(inner.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '')) ? parseExpr(inner, this.lang) : null;
    return one ?? { kind: 'block' };
  }
  initializer() {
    if (!this.isOp('{')) return {};
    this.next();
    const entries = [];
    while (!this.isOp('}')) {
      if (this.peek().t === 'eof') fail('unclosed initializer');
      const t = this.peek();
      if (t.t === 'id' && this.isOp('=', 1)) { this.next(); this.next(); entries.push({ key: { kind: 'name', name: t.v }, value: this.expr(0.6) }); }
      else entries.push({ value: this.expr(0.6) });
      if (this.isOp(',')) { this.next(); continue; }
      if (!this.isOp('}')) fail('expected , or }');
    }
    this.next();
    return { init: entries };
  }
  compositeLit(typeNode) {
    // Go T{…} / &T{…} / []T{…}; Rust Foo { a: 1, ..rest }.
    this.next();
    const entries = [];
    let keyed = false;
    while (!this.isOp('}')) {
      if (this.peek().t === 'eof') fail('unclosed literal');
      if (this.fam === 'rs' && this.isOp('..')) { this.next(); entries.push({ kind: 'spread', value: this.expr(0.6), form: '..' }); }
      else {
        const saved = this.noBrace; this.noBrace = false;
        let k = this.isOp('{') ? this.bareBraces() : this.expr(0.6);
        if (this.isOp(':')) { this.next(); keyed = true; const v = this.isOp('{') ? this.bareBraces() : this.expr(0.6); entries.push({ key: k, value: v }); }
        else if (this.fam === 'rs' && k.kind === 'name' && (this.isOp(',') || this.isOp('}'))) { keyed = true; entries.push({ key: k, value: k, shorthand: true }); }
        else entries.push({ value: k });
        this.noBrace = saved;
      }
      if (this.isOp(',')) { this.next(); continue; }
      if (!this.isOp('}')) fail('expected , or }');
    }
    this.next();
    const type = typeNode.kind === 'goType' ? typeNode.text : flatName(typeNode) ?? fail('literal type');
    if (!keyed && entries.every((e) => !e.key && e.kind !== 'spread')) return { kind: 'array', items: entries.map((e) => e.value), type };
    if (entries.some((e) => !e.key && e.kind !== 'spread')) fail('mixed literal');
    return { kind: 'object', entries, type };
  }
  bareBraces() { return this.compositeLit({ kind: 'goType', text: '' }); }
  /** A Go type, as written: *T, []T, [4]T, map[K]V, chan T, func(…) R, struct{…}, interface{…}, pkg.Name[T]. */
  goType() {
    const a = this.k;
    const one = () => {
      for (;;) {
        if (this.isOp('*')) { this.next(); continue; }
        if (this.isOp('[')) { this.next(); if (!this.isOp(']')) { if (this.isOp('...')) this.next(); else this.expr(0.6); } this.eat(']'); continue; }
        if (this.isId('map') && this.isOp('[', 1)) { this.next(); this.next(); one(); this.eat(']'); continue; }
        if (this.isId('chan')) { this.next(); if (this.isOp('<-')) this.next(); continue; }
        if (this.isOp('<-') && this.isId('chan', 1)) { this.next(); continue; }
        break;
      }
      const t = this.peek();
      if (t.t === 'id' && (t.v === 'struct' || t.v === 'interface') && this.isOp('{', 1)) { this.next(); this.L.skipBlock(this.k); this.next(); return; }
      if (t.t === 'id' && t.v === 'func' && this.isOp('(', 1)) { this.next(); this.next(); this.paramList(')'); if (this.isOp('(')) { this.next(); this.paramList(')'); } else if (this.peek().t === 'id' || this.isOp('*') || this.isOp('[')) one(); return; }
      if (t.t !== 'id') fail('Go type');
      this.next();
      while (this.isOp('.') && this.peek(1).t === 'id') { this.next(); this.next(); }
      if (this.isOp('[') && !this.isOp(']', 1)) { this.next(); one(); while (this.isOp(',')) { this.next(); one(); } this.eat(']'); }
    };
    one();
    return this.text(a, this.k);
  }
  /** A Go value that starts with a type: []T{…} / map[K]V{…} / struct{}{} (literals), []byte(x) (a conversion), or the type itself (make([]T, n)). */
  goTypedLiteral() {
    const type = this.goType();
    if (this.isOp('{')) return this.compositeLit({ kind: 'goType', text: type });
    if (this.isOp('(')) { this.next(); return { kind: 'call', callee: { kind: 'name', name: type, type: true }, args: this.args(')') }; }
    return { kind: 'name', name: type, type: true };
  }
  goFunc() {
    this.next(); this.eat('(');
    const params = this.paramList(')');
    let returns = null;
    if (!this.isOp('{') && this.peek().t !== 'block') { const a = this.k; while (!this.isOp('{') && this.peek().t !== 'eof' && this.peek().t !== 'block') { if (this.isOp('(')) { this.next(); this.paramList(')'); continue; } this.next(); } returns = this.text(a, this.k); }
    return { kind: 'lambda', params, ...(returns ? { returns } : {}), body: this.lambdaBody(), form: 'func' };
  }
  jsFunction() {
    let async = false;
    if (this.isId('async')) { this.next(); async = true; }
    this.next();
    let gen = false;
    if (this.isOp('*')) { this.next(); gen = true; }
    const name = this.peek().t === 'id' ? this.next().v : null;
    this.eat('(');
    const params = this.paramList(')');
    if (this.isOp(':')) { this.next(); this.typeText(['{']); }
    if (!this.isOp('{') && this.peek().t !== 'block') fail('function body');
    return { kind: 'lambda', params, body: this.lambdaBody(), form: 'function', ...(name ? { name } : {}), ...(async ? { async } : {}), ...(gen ? { generator: true } : {}) };
  }
  phpFunction() {
    const isStatic = this.isId('static') && !!this.next();
    const kw = this.next().v;
    if (this.isOp('&')) this.next();
    this.eat('(');
    const params = this.paramList(')');
    let uses = null;
    if (this.isId('use')) { this.next(); this.eat('('); uses = this.paramList(')'); }
    if (this.isOp(':')) { this.next(); this.typeText(['{', '=>']); }
    if (kw === 'fn') { this.eat('=>'); return { kind: 'lambda', params, body: this.expr(0.5), form: 'fn', ...(isStatic ? { static: true } : {}) }; }
    if (!this.isOp('{')) fail('function body');
    return { kind: 'lambda', params, body: this.lambdaBody(), form: 'function', ...(uses ? { uses } : {}), ...(isStatic ? { static: true } : {}) };
  }
  rustClosure() {
    let params = [];
    if (this.isOp('||')) this.next();
    else { this.next(); params = this.paramList('|'); }
    if (this.isOp('->')) { this.next(); this.typeText(['{']); }
    return { kind: 'lambda', params, body: this.lambdaBody(), form: 'closure' };
  }
  pyLambda() {
    this.next();
    const params = [];
    let a = this.k;
    while (!this.isOp(':')) {
      if (this.peek().t === 'eof') fail('lambda');
      if (this.isOp(',')) { params.push(this.text(a, this.k)); this.next(); a = this.k; continue; }
      this.next();
    }
    if (this.k > a) params.push(this.text(a, this.k));
    this.next();
    return { kind: 'lambda', params, body: this.expr(1) };
  }
  newExpr() {
    this.next();
    let callee = { kind: 'name', name: this.next().v };
    while (this.isOp('.') || (this.isOp('::') && this.lang === 'php')) { this.next(); callee = { kind: 'member', object: callee, property: this.next().v }; }
    let typeArgs = null;
    if (this.isOp('<')) typeArgs = this.typeArgs();
    if (this.isOp('[')) {
      // new int[] {1, 2} / new String[n] / new byte[0]: an array of a type, with its size or its items.
      const sizes = [];
      while (this.isOp('[')) { this.next(); sizes.push(this.isOp(']') ? null : this.expr(0)); this.eat(']'); }
      const type = `${flatName(callee)}${typeArgs ?? ''}${'[]'.repeat(sizes.length)}`;
      if (this.isOp('{')) { const lit = this.objectLit(); return this.postfix({ kind: 'array', items: lit.kind === 'array' ? lit.items : lit.entries.length ? fail('array initializer') : [], type, new: true }); }
      return this.postfix({ kind: 'call', callee: { kind: 'name', name: type, type: true }, args: sizes.filter(Boolean), new: true, array: true });
    }
    let args = [], parens = true;
    if (this.isOp('(')) { this.next(); args = this.args(')'); } else parens = false;
    const node = { kind: 'call', callee, args, new: true, ...(typeArgs ? { typeArgs } : {}), ...(parens ? {} : { parens: false }) };
    // An anonymous class (Java): its methods are not steps of this statement, and are not read here.
    if (this.isOp('{') && this.lang === 'java') { this.L.skipBlock(this.k); this.next(); node.classBody = { kind: 'code', text: '{…}' }; return this.postfix(node); }
    if (this.isOp('{') && this.lang === 'kotlin') fail('anonymous class');
    if (this.lang === 'csharp') Object.assign(node, this.initializer());
    return this.postfix(node);
  }

  comprehension(item, form) {
    this.noIf = true;
    const clauses = [];
    while (this.isId('for') || (this.isId('async') && this.isId('for', 1))) {
      if (this.isId('async')) this.next();
      this.next();
      const targets = [];
      while (!this.isId('in')) { if (this.peek().t === 'eof') fail('for without in'); if (this.isOp(',')) { this.next(); continue; } targets.push(this.expr(8.5)); }
      this.next();
      const iter = this.expr(2);
      const conds = [];
      while (this.isId('if')) { this.next(); conds.push(this.expr(2)); }
      clauses.push({ targets, iter, ...(conds.length ? { conds } : {}) });
    }
    this.noIf = false;
    return { kind: 'comprehension', form, item, clauses };
  }

  template(raw) {
    const parts = [];
    let buf = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') { buf += raw.slice(i, i + 2); i++; continue; }
      if (c === '$' && raw[i + 1] === '{') {
        const e = blockEnd(raw, i + 1, this.lang);
        if (e < 0) fail('template');
        if (buf) parts.push(unescape(buf));
        buf = '';
        const inner = parseExpr(raw.slice(i + 2, e), this.lang);
        if (!inner || inner.kind === 'code') fail('template part');
        parts.push({ expr: inner });
        i = e;
        continue;
      }
      buf += c;
    }
    if (buf) parts.push(unescape(buf));
    return { kind: 'template', parts, raw };
  }
  fstring(tok) {
    const raw = tok.v;
    const q = tok.q;
    const off = tok.prefix.length + (tok.triple ? 3 : 1);
    const body = raw.slice(off, raw.length - (tok.triple ? 3 : 1));
    const rawStr = tok.prefix.includes('r');
    const parts = [];
    let buf = '';
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === '{' && body[i + 1] === '{') { buf += '{'; i++; continue; }
      if (c === '}' && body[i + 1] === '}') { buf += '}'; i++; continue; }
      if (c === '\\' && !rawStr) { buf += body.slice(i, i + 2); i++; continue; }
      if (c === '{') {
        // Find the end of the expression part: a top-level ! (conversion), : (format), or }.
        let depth = 0, j = i + 1, exprEnd = -1, convAt = -1, fmtAt = -1;
        for (; j < body.length; j++) {
          const d = body[j];
          if (d === '"' || d === "'") { if (d === q) fail('quote in f-string'); const k = body.indexOf(d, j + 1); if (k < 0) fail('f-string'); j = k; continue; }
          if ('([{'.includes(d)) depth++;
          else if (')]'.includes(d)) depth--;
          else if (d === '}') { if (depth === 0) break; depth--; }
          else if (depth === 0 && d === '!' && body[j + 1] !== '=' && exprEnd < 0) { exprEnd = j; convAt = j; }
          else if (depth === 0 && d === ':' && fmtAt < 0 && (exprEnd < 0 || convAt >= 0)) { if (exprEnd < 0) exprEnd = j; fmtAt = j; }
        }
        if (j >= body.length) fail('f-string');
        if (exprEnd < 0) exprEnd = j;
        let text = body.slice(i + 1, exprEnd);
        const selfDoc = /=\s*$/.test(text) && !/[=!<>]=\s*$/.test(text);
        if (selfDoc) text = text.replace(/=\s*$/, '');
        const inner = parseExpr(text, 'python');
        if (!inner || inner.kind === 'code') fail('f-string part');
        if (buf) parts.push(unescape(buf));
        buf = '';
        const part = { expr: inner };
        if (convAt >= 0) part.conv = body.slice(convAt + 1, fmtAt >= 0 ? fmtAt : j);
        if (fmtAt >= 0) part.format = body.slice(fmtAt + 1, j);
        if (selfDoc) part.selfDoc = true;
        parts.push(part);
        i = j;
        continue;
      }
      buf += c;
    }
    if (buf) parts.push(rawStr ? buf : unescape(buf));
    return { kind: 'template', parts, raw, form: 'f' };
  }
}

/** Parameters written as text, split at top-level commas. */
function splitParams(text) {
  const out = [];
  let d = 0, from = 0;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if ('([{<'.includes(c)) d++; else if (')]}>'.includes(c)) d--; else if (c === ',' && d === 0) { out.push(text.slice(from, i)); from = i + 1; } }
  out.push(text.slice(from));
  return out.map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
const flatName = (n) => (n.kind === 'name' ? n.name : n.kind === 'member' ? (flatName(n.object) == null ? null : `${flatName(n.object)}${n.static ? '::' : '.'}${n.property}`) : n.kind === 'index' ? (flatName(n.object) == null ? null : `${flatName(n.object)}[${n.index.kind === 'name' ? n.index.name : '…'}]`) : null);

// Nodes written in brackets, while reading: `(a < b) < c` is not a Python chain, `-(1)` not the literal -1. The
// tree itself has no brackets (its shape is the reading order).
const GROUPED = new WeakSet();
// ── Public: expressions and statements ───────────────────────────────────────────────────────────────────────

const CACHE = new Map();
const cached = (key, fn) => {
  const hit = CACHE.get(key);
  if (hit !== undefined) return hit;
  const v = fn();
  if (CACHE.size > 4000) CACHE.clear();
  CACHE.set(key, v);
  return v;
};

/** One whole expression as a tree, or null when the text is not exactly one expression this reader understands. */
export function parseExpr(text, language = '') {
  const src = String(text ?? '').trim();
  if (!src || src.length > 4000) return null;
  return cached(`e\u0001${language}\u0001${src}`, () => {
    try {
      const p = new Parser(src, language);
      const e = p.expr(0);
      if (p.isOp(';')) p.next();
      if (p.peek().t !== 'eof') return null;
      return e;
    } catch (e) { if (e instanceof Fail) return null; throw e; }
  });
}

const code = (text) => ({ kind: 'code', text: String(text).replace(/\s+/g, ' ').trim() });

/**
 * A statement as a tree: what a step's `expr` holds. For a statement that opens a block (if, for, while, a call with
 * a function in it) only the head is read; the block's statements are the step's own children. Never guessed: what
 * is not fully understood is `{ kind: 'code', text }`.
 */
export function parseStatement(text, language = '') {
  const src = String(text ?? '').trim();
  if (!src) return code('');
  return cached(`s\u0001${language}\u0001${src.length > 600 ? `${src.length}\u0001${src.slice(0, 300)}\u0001${src.slice(-300)}` : src}`, () => {
    try { return statement(new Parser(src, language)); } catch (e) { if (e instanceof Fail) return code(headOf(src)); throw e; }
  });
}
/**
 * A statement read with where each part came from: { tree, textOf(node) } (node: a part of `tree`, before
 * normalizing). The round trip uses it to run the original code of a condition or value against the code written
 * back from the tree.
 */
export function parseStatementSpans(text, language = '') {
  const src = String(text ?? '').trim();
  try {
    const p = new Parser(src, language);
    p.spans = new Map();
    const tree = statement(p);
    return { tree, textOf: (node) => { const sp = p.spans.get(node); return sp ? src.slice(sp[0], sp[1]) : null; } };
  } catch (e) { if (e instanceof Fail) return null; throw e; }
}
// The code of a statement that could not be read: all of it when it is one statement; the first line when it opens
// a block (the block's statements are the step's children).
const headOf = (src) => {
  const first = src.split('\n')[0];
  const t = !src.includes('\n') || /[{:]\s*$/.test(first) ? first : src;
  const one = t.replace(/\s+/g, ' ').trim();
  return one.length > 400 ? `${one.slice(0, 399)}…` : one;
};

function endStatement(p, node) {
  if (p.isOp(';')) p.next();
  const t = p.peek();
  if (t.t === 'eof') return node;
  // Ruby / Perl modifiers: `return x if y` — the step is the question; its inline statement is its child.
  if (t.t === 'id' && (t.v === 'if' || t.v === 'unless') && (p.fam === 'rb')) {
    p.next();
    const test = p.expr(0);
    if (p.peek().t !== 'eof') fail('after modifier');
    return { kind: 'if', test, ...(t.v === 'unless' ? { negate: true } : {}), inline: node };
  }
  if (t.t === 'id' && (t.v === 'while' || t.v === 'until') && p.fam === 'rb') { p.next(); const test = p.expr(0); return { kind: 'loop', form: t.v, test, inline: node }; }
  return fail('more after the statement');
}

function headerTest(p, { parens }) {
  // `if (cond)` in C-family languages; `if cond {` / `if cond:` elsewhere.
  if (parens) {
    p.eat('(');
    const t = p.expr(0);
    p.eat(')');
    return t;
  }
  p.noBrace = true;
  const t = p.expr(0);
  p.noBrace = false;
  return t;
}
/** After a header: `{` (the block), `:` (Python), `then` / `do`, the end, or an inline statement (one-line if). */
function headerEnd(p, node) {
  const t = p.peek();
  if (t.t === 'eof' || t.t === 'block') return node;
  if (t.t === 'op' && (t.v === '{' || t.v === ':')) return node;
  if (t.t === 'id' && (t.v === 'then' || t.v === 'do')) return node;
  if (t.t === 'op' && t.v === ';' && p.fam !== 'go') return node;
  // A one-line if: `if (x) return y;` — the statement after the condition is the step's child.
  return { ...node, inline: true };
}

function statement(p) {
  const t = p.peek();
  const fam = p.fam, lang = p.lang;
  const parens = fam === 'c' && lang !== 'swift';
  if (t.t === 'id') {
    const v = t.v;
    // Annotations / decorators before a declaration.
    if (v === 'else' && p.isId('if', 1)) { p.next(); return statement(p); }
    // A method written inside a body (an anonymous class, a local function): `public String toString() {`.
    if (/^(?:java|csharp|kotlin)$/.test(lang) && !/^(?:return|throw|new|await|if|for|while|var|val)$/.test(v)) { const m = methodHeader(p); if (m) return m; }
    if (v === 'if' || v === 'elif' || v === 'elsif' || v === 'unless' || (v === 'else' && p.isId('if', 1))) {
      p.next();
      if (fam === 'rs' && p.isId('let')) fail('if let');
      if (fam === 'go' || (fam === 'c' && lang === 'swift')) {
        // Go: an optional simple statement first: `if v, ok := m[k]; ok {`.
        const k0 = p.k;
        p.noBrace = true;
        let init = null;
        try {
          const first = simpleStatement(p);
          if (p.isOp(';')) { p.next(); init = first; } else p.k = k0;
        } catch (e) { if (!(e instanceof Fail)) throw e; p.k = k0; }
        p.noBrace = true;
        const test = p.expr(0);
        p.noBrace = false;
        return headerEnd(p, { kind: 'if', test, ...(init ? { init } : {}) });
      }
      const test = headerTest(p, { parens: parens && p.isOp('(') });
      return headerEnd(p, { kind: 'if', test, ...(v === 'unless' ? { negate: true } : {}) });
    }
    if (v === 'while' || v === 'until') {
      p.next();
      if (fam === 'rs' && p.isId('let')) fail('while let');
      const test = headerTest(p, { parens: parens && p.isOp('(') });
      return headerEnd(p, { kind: 'loop', form: v, test });
    }
    if (v === 'loop' && fam === 'rs') { p.next(); return headerEnd(p, { kind: 'loop', form: 'forever' }); }
    if (v === 'do' && (p.isOp('{', 1) || p.peek(1).t === 'eof' || p.peek(1).t === 'block')) {
      // do { … } while (cond)
      const m = p.L.src.match(/\}\s*while\s*\(([\s\S]*)\)\s*;?\s*$/);
      const test = m ? parseExpr(m[1], lang) : null;
      return test ? { kind: 'loop', form: 'do-while', test } : { kind: 'loop', form: 'do-while', test: code(m ? m[1] : '') };
    }
    if (v === 'for' || v === 'foreach') return forHeader(p);
    const soft = fam === 'py' && /:\s*$/.test(p.L.src) && !(p.peek(1).t === 'op' && /^(?:=|\.|,|\[|\)|:)$/.test(p.peek(1).v)) && !ASSIGN_OPS.has(p.peek(1).v);
    if ((v === 'switch' && fam !== 'py' && fam !== 'rb') || (v === 'match' && (fam === 'rs' || soft)) || (v === 'select' && fam === 'go') || (v === 'when' && lang === 'kotlin') || (v === 'case' && fam === 'rb')) {
      p.next();
      if (fam === 'go' && v === 'switch' && !p.isOp('{') && p.peek().t !== 'block' && p.peek().t !== 'eof') {
        p.noBrace = true;
        let init = null, subject = simpleStatement(p);
        if (p.isOp(';')) { p.next(); init = subject; subject = p.isOp('{') ? null : p.expr(0); }
        p.noBrace = false;
        return headerEnd(p, { kind: 'switch', form: v, ...(init ? { init } : {}), ...(subject ? { subject } : {}) });
      }
      if (p.isOp('{') || p.peek().t === 'eof' || p.peek().t === 'block' || (v === 'select' && fam === 'go')) return { kind: 'switch', form: v };
      if (fam === 'go' && p.isId('true') && (p.isOp('{', 1) || p.peek(1).t === 'block')) { p.next(); return { kind: 'switch', form: v, subject: { kind: 'literal', type: 'bool', value: true, raw: 'true' } }; }
      const subject = headerTest(p, { parens: parens && p.isOp('(') });
      if (p.isOp(':') && fam === 'py') p.next();
      return headerEnd(p, { kind: 'switch', form: v, subject });
    }
    if ((v === 'case' && (fam !== 'py' || soft) && fam !== 'rb') || (v === 'when' && fam === 'rb')) {
      p.next();
      const patterns = [];
      p.noIf = true;
      for (;;) {
        if (fam === 'go' && p.isOp('<-')) { patterns.push(simpleStatement(p)); }
        else {
          const k0 = p.k;
          let pat;
          try { pat = simpleStatement(p); } catch (e) { if (!(e instanceof Fail)) throw e; p.k = k0; pat = p.expr(0.6); }
          patterns.push(pat);
        }
        if (p.isOp(',')) { p.next(); continue; }
        if (p.isOp('|') && fam !== 'c') { p.next(); continue; }
        break;
      }
      p.noIf = false;
      let guard = null;
      if (fam === 'py' && p.isId('if')) { p.next(); guard = p.expr(0); }
      const node = { kind: 'case', patterns, ...(guard ? { guard } : {}) };
      if (p.isOp(':') || p.isOp('->') || p.isId('then')) { p.next(); return p.peek().t === 'eof' ? node : { ...node, inline: true }; }
      if (fam === 'rb') return p.peek().t === 'eof' ? node : fail('after when');
      return node;
    }
    if (v === 'default' && fam !== 'py' && (p.isOp(':', 1) || p.isOp('->', 1))) { p.next(); p.next(); return p.peek().t === 'eof' ? { kind: 'case', default: true } : { kind: 'case', default: true, inline: true }; }
    if (v === 'try' || v === 'begin') { p.next(); return { kind: 'try' }; }
    if (v === 'return' && !(p.isOp('=', 1))) {
      p.next();
      if (p.atEnd() || (fam === 'rb' && p.peek().t === 'id' && /^(?:if|unless)$/.test(p.peek().v))) return endStatement(p, { kind: 'return' });
      const value = fam === 'c' ? p.expr(0.5) : valueList(p);
      return endStatement(p, { kind: 'return', value });
    }
    if (v === 'throw' || v === 'raise') {
      p.next();
      if (p.atEnd()) return endStatement(p, { kind: 'throw' });
      let value = fam === 'rb' ? rubyCommandArgs(p, { kind: 'name', name: 'raise' }) : p.expr(0);
      let cause = null;
      if (fam === 'py' && p.isId('from')) { p.next(); cause = p.expr(0); }
      return endStatement(p, throwNode(value, cause, v));
    }
    if ((v === 'panic' && fam === 'go' && p.isOp('(', 1)) || (v === 'panic!' && fam === 'rs')) {
      const value = p.expr(0);
      if (value.kind !== 'call') fail('panic');
      const msg = value.args.find((a) => a.kind === 'literal' && a.type === 'text');
      return endStatement(p, { kind: 'throw', form: 'panic', value, ...(msg ? { message: msg.value } : {}) });
    }
    if ((v === 'break' || v === 'continue' || (v === 'next' && fam === 'rb') || v === 'fallthrough') && !(p.isOp('(', 1)) && !(p.isOp('=', 1))) {
      p.next();
      const label = (p.peek().t === 'id' && !/^(?:if|unless)$/.test(p.peek().v)) || (lang === 'php' && p.peek().t === 'num') ? p.next().v : null;
      return endStatement(p, { kind: 'jump', jump: v === 'next' ? 'continue' : v, ...(label ? { label } : {}) });
    }
    if (v === 'yield' && !p.isOp('(', 1)) {
      p.next();
      if (lang === 'csharp' && p.isId('break')) { p.next(); return endStatement(p, { kind: 'yield', end: true }); }
      if (lang === 'csharp' && p.isId('return')) p.next();
      if (fam === 'rb') return endStatement(p, { kind: 'call', callee: { kind: 'name', name: 'yield' }, args: p.atEnd() ? [] : rubyArgList(p), parens: false });
      const delegate = (fam === 'py' && p.isId('from')) || (isJs(lang) && p.isOp('*'));
      if (delegate) p.next();
      if (p.atEnd()) return endStatement(p, { kind: 'yield' });
      return endStatement(p, { kind: 'yield', value: valueList(p), ...(delegate ? { delegate: true } : {}) });
    }
    if ((v === 'defer' || v === 'go') && fam === 'go') { p.next(); return endStatement(p, { kind: v, value: p.expr(0) }); }
    if (v === 'delete' && isJs(lang)) { p.next(); return endStatement(p, { kind: 'delete', target: p.expr(16) }); }
    if (v === 'del' && fam === 'py') { p.next(); return endStatement(p, { kind: 'delete', target: valueList(p) }); }
    if (v === 'assert' && (fam === 'py' || lang === 'java')) {
      p.next();
      const test = p.expr(0);
      let message = null;
      if (p.isOp(fam === 'py' ? ',' : ':')) { p.next(); message = p.expr(0); }
      return endStatement(p, { kind: 'assert', test, ...(message ? { message } : {}) });
    }
    if (v === 'with' && fam === 'py') return pyWith(p);
    if (v === 'async' && fam === 'py' && (p.isId('with', 1) || p.isId('for', 1) || p.isId('def', 1))) { p.next(); const s = statement(p); return { ...s, async: true }; }
    if (v === 'pass' && fam === 'py') { p.next(); return endStatement(p, { kind: 'pass' }); }
    if (v === 'def' || (v === 'function' && p.peek(1).t === 'id') || (v === 'func' && p.peek(1).t === 'id') || (v === 'fn' && fam === 'rs') || (v === 'fun' && lang === 'kotlin') || (v === 'async' && isJs(lang) && p.isId('function', 1) && p.peek(2).t === 'id')) return functionHeader(p);
    if (/^(?:class|struct|interface|enum|impl|trait|object|record|module|type|namespace|import|export|from|package|use|using|lock|synchronized|unsafe|goto|static|public|private|protected|internal|abstract|override|virtual|final|readonly|global|nonlocal|extern|template|typedef|label)$/.test(v) && !(p.isOp('(', 1) && !/^(?:using|lock|synchronized)$/.test(v)) && !(p.isOp('.', 1)) && !(p.peek(1).t === 'op' && (ASSIGN_OPS.has(p.peek(1).v) || p.peek(1).v === ',' || p.peek(1).v === '['))) {
      if (v === 'export' && (p.isId('const', 1) || p.isId('let', 1) || p.isId('function', 1))) { p.next(); return statement(p); }
      if ((v === 'global' || v === 'nonlocal') && fam === 'py') { p.next(); const names = []; while (p.peek().t === 'id') { names.push(p.next().v); if (p.isOp(',')) p.next(); } return endStatement(p, { kind: 'declare', names, scope: v }); }
      fail(`${v} declaration`);
    }
    if (fam === 'go' && (v === 'var' || v === 'const') && p.isOp('(', 1)) return goDeclBlock(p);
    if (/^(?:const|let|var|val|auto|my|local)$/.test(v) && (p.peek(1).t === 'id' || p.isOp('{', 1) || p.isOp('[', 1) || p.isOp('(', 1))) return declaration(p);
    if (fam === 'rb' && /^(?:attr_reader|attr_accessor|attr_writer|include|extend|require|require_relative|private|protected|public|puts|print|p|pp|raise|fail|alias|alias_method|define_method)$/.test(v) && p.peek(1).t !== 'eof' && !p.isOp('(', 1) && !p.isOp('.', 1) && !p.isOp('=', 1)) {
      p.next();
      return endStatement(p, { kind: 'call', callee: { kind: 'name', name: v }, args: rubyArgList(p), parens: false });
    }
    // Typed declarations: `Type name = value;` (Java, C#, C/C++, Dart).
    if (/^(?:java|csharp|c|cpp|dart)$/.test(lang) && typedDeclAhead(p)) return typedDeclaration(p);
    if (lang === 'php' && /^(?:echo|print)$/.test(v) && p.peek(1).t !== 'eof' && !p.isOp('(', 1)) { p.next(); const vs = valueList(p, true); return endStatement(p, { kind: 'call', callee: { kind: 'name', name: v }, args: vs.kind === 'array' && vs.form === 'tuple' ? vs.items : [vs], parens: false }); }
  }
  if (t.t === 'op' && t.v === '@') fail('annotation');
  const node = simpleStatement(p, { top: true });
  // A Ruby command call with arguments and no brackets: `render json: x`, `redirect_to root_path`.
  if (fam === 'rb' && p.peek().t !== 'eof' && (node.kind === 'name' || node.kind === 'member') && rubyCommandStart(p)) {
    return endStatement(p, { kind: 'call', callee: node, args: rubyArgList(p), parens: false });
  }
  if (node.kind === 'call' && p.peek().t === 'block') { p.next(); }
  return endStatement(p, node);
}

function rubyCommandStart(p) {
  const t = p.peek();
  if (t.t === 'id') return !/^(?:if|unless|while|until|and|or|then|do|rescue|in)$/.test(t.v);
  if (t.t === 'str' || t.t === 'num') return true;
  if (t.t === 'op') return (t.v === '*' || t.v === '&' || t.v === '!' || t.v === '-' || t.v === '[' || t.v === '->') && t.sp && !p.peek(1).sp;
  return false;
}
function rubyArgList(p) {
  const out = [];
  for (;;) {
    const t = p.peek();
    if (t.t === 'eof' || (t.t === 'id' && /^(?:if|unless|do)$/.test(t.v))) break;
    if (t.t === 'id' && p.isOp(':', 1) && !p.peek(1).sp) { p.next(); p.next(); out.push({ kind: 'named', name: t.v, value: p.expr(0.6) }); }
    else if ((t.t === 'str') && p.isOp('=>', 1)) { const key = p.expr(0.6); p.eat('=>'); out.push({ kind: 'object', entries: [{ key, value: p.expr(0.6) }], form: 'hash', bare: true }); }
    else out.push(p.expr(0.6));
    if (p.isOp(',')) { p.next(); continue; }
    break;
  }
  if (p.isId('do')) { const blk = p.rubyDoBlock(); blk.trailing = true; out.push(blk); }
  return out;
}
function rubyCommandArgs(p, callee) {
  const args = rubyArgList(p);
  return args.length === 1 ? args[0] : { kind: 'call', callee, args, parens: false, form: 'raise-args' };
}

function throwNode(value, cause, form) {
  const node = { kind: 'throw', ...(value ? { value } : {}), ...(cause ? { cause } : {}), ...(form !== 'throw' ? { form } : {}) };
  // What error, and the message people see (the first text argument).
  let v = value;
  if (v && v.kind === 'call' && v.form === 'raise-args') { const [e, msg] = v.args; if (e) node.error = flatName(e.kind === 'call' ? e.callee : e) ?? undefined; if (msg && msg.kind === 'literal' && msg.type === 'text') node.message = msg.value; return node; }
  if (v && v.kind === 'call') {
    const n = flatName(v.callee);
    if (n) node.error = n.split(/\.|::/).pop();
    const msg = v.args.find((a) => (a.kind === 'literal' && a.type === 'text') || a.kind === 'template');
    if (msg) node.message = msg.kind === 'literal' ? msg.value : templateText(msg);
  } else if (v && v.kind === 'name') node.error = v.name;
  if (node.error === undefined) delete node.error;
  return node;
}
const templateText = (t) => t.parts.map((x) => (typeof x === 'string' ? x : `{${sayFull(x.expr)}}`)).join('');

/** A statement with no keyword: an assignment, a call, an expression; Go `a, b := f()`; Python `a, b = c`. */
function simpleStatement(p, { top = false } = {}) {
  const fam = p.fam;
  let left = p.expr(0.6);
  // Tuple targets: a, b = …  /  a, b := …
  if (p.isOp(',') && (fam === 'py' || fam === 'go' || fam === 'rb' || p.lang === 'lua')) {
    const items = [left];
    while (p.isOp(',')) { p.next(); if (p.peek().t === 'eof') break; items.push(p.expr(0.6)); }
    left = { kind: 'array', form: 'tuple', items };
  }
  const t = p.peek();
  if (t.t === 'op' && ASSIGN_OPS.has(t.v)) {
    p.next();
    const value = assignValue(p);
    return { kind: 'assign', op: t.v, target: left, value };
  }
  if (t.t === 'op' && t.v === ':' && fam === 'py' && top) {
    // x: int = 5 (an annotated name)
    p.next();
    const type = p.typeText(['=']);
    if (p.isOp('=')) { p.next(); return { kind: 'assign', op: '=', target: left, type, value: assignValue(p) }; }
    return { kind: 'declare', names: [flatName(left) ?? fail('annotation')], type };
  }
  if (left.kind === 'assign') return left;
  if (left.kind === 'array' && left.form === 'tuple' && fam === 'py' && top) return left;
  return left;
}
function assignValue(p) {
  // a = b = c (chained) and Python / Go multiple values: a, b = 1, 2
  const v = valueList(p);
  if (p.peek().t === 'op' && ASSIGN_OPS.has(p.peek().v) && p.peek().v === '=') { p.next(); return { kind: 'assign', op: '=', target: v, value: assignValue(p) }; }
  return v;
}
/** One value, or several separated by commas (Python / Go / Ruby return and assignment), as a tuple. */
function valueList(p, always = false) {
  const first = p.expr(0.6);
  if (!p.isOp(',') || !(p.fam === 'py' || p.fam === 'go' || p.fam === 'rb' || always)) return first;
  const items = [first];
  while (p.isOp(',')) { p.next(); if (p.atEnd()) break; items.push(p.expr(0.6)); }
  return { kind: 'array', form: 'tuple', items };
}

function declaration(p, inner = false) {
  const kw = p.next().v;
  const items = [];
  for (;;) {
    let target;
    let mutable = false;
    if (p.isId('mut') && p.fam === 'rs') { p.next(); mutable = true; }
    if (p.isOp('{') || p.isOp('[') || p.isOp('(')) target = pattern(p);
    else { const n = p.next(); if (n.t !== 'id') fail('a name'); target = { kind: 'name', name: n.v }; }
    let type = null;
    if (p.isOp(':')) { p.next(); type = p.typeText(['=']); }
    else if (p.fam === 'go' && !p.isOp('=') && !p.isOp(',') && !p.atEnd()) type = p.goType();
    if (p.isOp(',') && p.fam === 'go') {
      // var a, b int
      const names = [target];
      while (p.isOp(',')) { p.next(); names.push({ kind: 'name', name: p.next().v }); }
      if (!p.isOp('=') && !p.atEnd()) type = p.fam === 'go' ? p.goType() : p.typeText(['=']);
      target = { kind: 'array', form: 'tuple', items: names };
    }
    if (p.isOp('!') && p.lang === 'typescript') { p.next(); if (p.isOp(':')) { p.next(); type = p.typeText(['=']); } }
    let value = null;
    if (p.isOp('=')) { p.next(); value = p.fam === 'go' ? valueList(p) : p.expr(0.5); }
    items.push(value ? { kind: 'assign', op: '=', declare: kw, target, ...(type ? { type } : {}), ...(mutable ? { mutable } : {}), value } : { kind: 'declare', declare: kw, names: target.kind === 'name' ? [target.name] : [target], ...(type ? { type } : {}), ...(mutable ? { mutable } : {}) });
    if (p.isOp(',') && p.fam !== 'go') { p.next(); continue; }
    break;
  }
  const node = items.length === 1 ? items[0] : { kind: 'sequence', items };
  return inner ? node : endStatement(p, node);
}
/** Go `const ( a = 1; b int = 2 )` / `var ( … )`: one declaration per line, as a sequence. */
function goDeclBlock(p) {
  const kw = p.next().v;
  p.eat('(');
  const items = [];
  while (!p.isOp(')')) {
    if (p.peek().t === 'eof') fail('unclosed declaration block');
    if (p.isOp(';')) { p.next(); continue; }
    const names = [];
    for (;;) { const n = p.next(); if (n.t !== 'id') fail('a name'); names.push({ kind: 'name', name: n.v }); if (p.isOp(',')) { p.next(); continue; } break; }
    const target = names.length === 1 ? names[0] : { kind: 'array', form: 'tuple', items: names };
    let type = null, value = null;
    if (!p.isOp('=') && !p.isOp(')') && !p.isOp(';') && !p.peek().nl) type = p.goType();
    if (p.isOp('=')) { p.next(); value = valueList(p); }
    items.push(value ? { kind: 'assign', op: '=', declare: kw, target, ...(type ? { type } : {}), value } : { kind: 'declare', declare: kw, names: names.map((x) => x.name), ...(type ? { type } : {}) });
    if (!p.isOp(')') && !p.isOp(';') && !p.peek().nl) fail('after a declaration');
  }
  p.next();
  return endStatement(p, { kind: 'sequence', items, block: kw });
}

function pattern(p) {
  // { a, b: c, ...rest } / [a, , b] / (a, b): kept as the names it binds, with the shape as written.
  const open = p.next().v;
  const close = open === '{' ? '}' : open === '[' ? ']' : ')';
  const a = p.k - 1;
  let depth = 1;
  while (depth > 0) { const t = p.next(); if (t.t === 'eof') fail('pattern'); if (t.t === 'op' && '{[('.includes(t.v)) depth++; else if (t.t === 'op' && '}])'.includes(t.v)) depth--; }
  const text = p.text(a, p.k);
  const names = [...text.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '').matchAll(/(?:^|[{[(,]\s*|\.\.\.)([A-Za-z_$][\w$]*)\s*(?=[,}\])=]|$)|:\s*([A-Za-z_$][\w$]*)\s*(?=[,}\]=])/g)].map((m) => m[1] || m[2]).filter(Boolean);
  void close;
  return { kind: 'pattern', text, names };
}
/** `[modifiers] [<T>] Type name(params) [throws X] {` (Java / C#) or `fun name(params): T {` (Kotlin) as a function header, or null. */
function methodHeader(p) {
  const k0 = p.k;
  try {
    const mods = [];
    while (p.peek().t === 'id' && /^(?:public|private|protected|internal|static|final|abstract|override|virtual|sealed|async|synchronized|unsafe|open|suspend|inline|operator|default|native|strictfp|extern|new)$/.test(p.peek().v) && (p.peek(1).t === 'id' || p.isOp('<', 1))) mods.push(p.next().v);
    if (p.lang === 'kotlin') {
      if (!p.isId('fun')) { p.k = k0; return null; }
      p.next();
      if (p.isOp('<')) p.typeArgs();
      const name = p.next();
      if (name.t !== 'id' || !p.isOp('(')) { p.k = k0; return null; }
      p.next();
      const params = p.paramList(')');
      let returns = null;
      if (p.isOp(':')) { p.next(); returns = p.typeText(['{', '=']); }
      return { kind: 'function', name: name.v, params, ...(returns ? { returns } : {}), ...(mods.length ? { modifiers: mods } : {}), body: { kind: 'block' } };
    }
    let typeParams = null;
    if (p.isOp('<')) typeParams = p.typeArgs();
    const at = typedDeclAhead(p, true);
    if (at === false) { p.k = k0; return null; }
    const a = p.k;
    p.k += at;
    const returns = p.text(a, p.k);
    const name = p.next().v;
    p.eat('(');
    const params = p.paramList(')');
    if (p.isId('throws')) { p.next(); while (p.peek().t === 'id' || p.isOp(',') || p.isOp('.')) p.next(); }
    if (!p.isOp('{') && !p.isOp('=>') && p.peek().t !== 'eof' && p.peek().t !== 'block' && !p.isOp(';')) { p.k = k0; return null; }
    return { kind: 'function', name, params, returns, ...(typeParams ? { typeParams } : {}), ...(mods.length ? { modifiers: mods } : {}), body: { kind: 'block' } };
  } catch (e) { if (e instanceof Fail) { p.k = k0; return null; } throw e; }
}
function typedDeclAhead(p, method = false) {
  // Type name = …;  Type<A, B>[] name;  final Type name = …
  let o = 0;
  while (p.peek(o).t === 'id' && /^(?:final|static|readonly|const|volatile|var|unsigned|signed)$/.test(p.peek(o).v) && p.peek(o + 1).t === 'id') o++;
  if (p.peek(o).t !== 'id') return false;
  if (/^(?:return|throw|new|await|yield|case|goto|else|in|is|as|out|ref|params|this|base|super)$/.test(p.peek(o).v)) return false;
  o++;
  let depth = 0;
  for (let guard = 0; guard < 40; guard++) {
    const t = p.peek(o);
    if (t.t === 'op' && (t.v === '.' || t.v === '?' || t.v === '*' || t.v === '&') && depth === 0) { o++; if (p.peek(o).t === 'id' && t.v === '.') o++; continue; }
    if (t.t === 'op' && t.v === '<') { depth++; o++; continue; }
    if (t.t === 'op' && (t.v === '>' || t.v === '>>')) { depth -= t.v.length; o++; continue; }
    if (t.t === 'op' && t.v === '[' && p.isOp(']', o + 1)) { o += 2; continue; }
    if (depth > 0) { if (t.t === 'eof') return false; o++; continue; }
    break;
  }
  if (depth !== 0 || p.peek(o).t !== 'id') return false;
  const after = p.peek(o + 1);
  if (method) return after.t === 'op' && after.v === '(' ? o : false;
  return after.t === 'eof' || (after.t === 'op' && (after.v === '=' || after.v === ';' || after.v === ',')) ? o : false;
}
function typedDeclaration(p, inner = false) {
  const a = p.k;
  const at = typedDeclAhead(p);
  if (at === false) fail('typed declaration');
  p.k += at;
  const type = p.text(a, p.k);
  const items = [];
  for (;;) {
    const name = p.next().v;
    if (p.isOp('=')) { p.next(); items.push({ kind: 'assign', op: '=', declare: 'typed', type, target: { kind: 'name', name }, value: p.isOp('{') ? p.objectLit() : p.expr(0.6) }); }
    else items.push({ kind: 'declare', declare: 'typed', type, names: [name] });
    if (p.isOp(',')) { p.next(); continue; }
    break;
  }
  const node = items.length === 1 ? items[0] : { kind: 'sequence', items };
  return inner ? node : endStatement(p, node);
}

function forHeader(p) {
  const fam = p.fam, lang = p.lang;
  p.next();
  if (fam === 'py' || fam === 'rb') {
    // for a, b in items:
    if (p.isId('await')) fail('async for');
    const targets = [];
    p.noIf = true;
    while (!p.isId('in')) { if (p.peek().t === 'eof') fail('for without in'); if (p.isOp(',')) { p.next(); continue; } targets.push(p.expr(8.5)); }
    p.next();
    const iterable = valueList(p);
    p.noIf = false;
    if (p.isId('do')) p.next();
    return headerEnd(p, { kind: 'loop', form: 'each', targets, iterable });
  }
  if (fam === 'go') {
    if (p.isOp('{') || p.peek().t === 'eof' || p.peek().t === 'block') return { kind: 'loop', form: 'forever' };
    // for k, v := range xs {   /  for i := 0; i < n; i++ {   /  for cond {
    p.noBrace = true;
    const k0 = p.k;
    let o = 0, hasRange = false, semis = 0;
    for (;; o++) { const t = p.peek(o); if (t.t === 'eof' || t.t === 'block' || (t.t === 'op' && t.v === '{')) break; if (t.t === 'id' && t.v === 'range') hasRange = true; if (t.t === 'op' && t.v === ';') semis++; }
    if (hasRange) {
      const targets = [];
      if (!p.isId('range')) { while (!p.isOp(':=') && !p.isOp('=')) { if (p.peek().t === 'eof') fail('range'); if (p.isOp(',')) { p.next(); continue; } targets.push(p.expr(8.5)); } p.next(); }
      p.next(); // range
      const iterable = p.expr(0);
      p.noBrace = false;
      return headerEnd(p, { kind: 'loop', form: 'each', targets, iterable, range: true });
    }
    if (semis === 2) {
      const init = p.isOp(';') ? null : simpleStatement(p);
      p.eat(';');
      const test = p.isOp(';') ? null : p.expr(0);
      p.eat(';');
      const update = p.isOp('{') || p.peek().t === 'block' || p.peek().t === 'eof' ? null : simpleStatement(p);
      p.noBrace = false;
      return headerEnd(p, { kind: 'loop', form: 'for', ...(init ? { init } : {}), ...(test ? { test } : {}), ...(update ? { update } : {}) });
    }
    void k0;
    const test = p.expr(0);
    p.noBrace = false;
    return headerEnd(p, { kind: 'loop', form: 'while', test });
  }
  if (fam === 'rs') {
    const targets = [];
    if (p.isOp('(')) targets.push(pattern(p)); else targets.push({ kind: 'name', name: p.next().v });
    if (!p.isId('in')) fail('for without in');
    p.next();
    p.noBrace = true;
    const iterable = p.expr(0);
    p.noBrace = false;
    return headerEnd(p, { kind: 'loop', form: 'each', targets, iterable });
  }
  // C family: for (init; test; update) / for (const x of xs) / for (x in xs) / for (Type x : xs) / foreach (var x in xs)
  if (p.isId('await')) { p.next(); }
  p.eat('(');
  let semi = false;
  for (let o = 0, d = 0; ; o++) { const t = p.peek(o); if (t.t === 'eof') break; if (t.t === 'op') { if ('([{'.includes(t.v)) d++; else if (')]}'.includes(t.v)) { if (d === 0) break; d--; } else if (t.v === ';' && d === 0) { semi = true; break; } } }
  if (semi) {
    const init = p.isOp(';') ? null : (/^(?:const|let|var)$/.test(p.peek().v) ? declaration(p, true) : typedDeclAhead(p) ? typedDeclaration(p, true) : simpleStatement(p));
    if (p.isOp(';')) p.next();
    const test = p.isOp(';') ? null : p.expr(0);
    p.eat(';');
    const updates = [];
    while (!p.isOp(')')) { updates.push(simpleStatement(p)); if (p.isOp(',')) p.next(); else break; }
    p.eat(')');
    const update = updates.length === 1 ? updates[0] : updates.length ? { kind: 'sequence', items: updates } : null;
    return headerEnd(p, { kind: 'loop', form: 'for', ...(init ? { init } : {}), ...(test ? { test } : {}), ...(update ? { update } : {}) });
  }
  if (lang === 'php') {
    const iterable = p.expr(0.6);
    if (!p.isId('as')) fail('foreach without as');
    p.next();
    const targets = [p.expr(0.6)];
    if (p.isOp('=>')) { p.next(); targets.push(p.expr(0.6)); }
    p.eat(')');
    return headerEnd(p, { kind: 'loop', form: 'each', targets, iterable });
  }
  let declare = null;
  if (p.peek().t === 'id' && /^(?:const|let|var|val|final|auto)$/.test(p.peek().v) && (p.peek(1).t === 'id' || p.isOp('[', 1) || p.isOp('{', 1) || p.isOp('(', 1))) declare = p.next().v;
  // Java/C#: the element's type before its name.
  let type = null;
  if (p.peek().t === 'id' && !declare) {
    const k0 = p.k;
    let o = 0;
    while (p.peek(o).t === 'id' || (p.peek(o).t === 'op' && /^(?:\.|<|>|\[|\]|,|\?)$/.test(p.peek(o).v))) { if (p.peek(o).t === 'id' && (/^(?:of|in)$/.test(p.peek(o).v))) break; if (p.isOp(':', o)) break; o++; }
    if (o >= 2 && p.peek(o - 1).t === 'id') { type = p.text(k0, k0 + o - 1); p.k = k0 + o - 1; }
  }
  const targets = [];
  if (p.isOp('[') || p.isOp('{') || p.isOp('(')) targets.push(pattern(p));
  else { const n = p.next(); if (n.t !== 'id') fail('loop name'); targets.push({ kind: 'name', name: n.v }); }
  if (p.isOp(':') && lang === 'kotlin') { p.next(); p.typeText(['in']); }
  let form;
  if (p.isId('of')) form = 'of'; else if (p.isId('in')) form = 'in'; else if (p.isOp(':')) form = ':'; else fail('loop');
  p.next();
  const iterable = p.expr(0);
  p.eat(')');
  return headerEnd(p, { kind: 'loop', form: 'each', targets, iterable, ...(form !== 'of' && form !== ':' && isJs(lang) ? { keys: true } : {}), ...(declare ? { declare } : {}), ...(type ? { type } : {}) });
}

function pyWith(p) {
  p.next();
  const items = [];
  for (;;) {
    const value = p.expr(0.6);
    let as = null;
    if (p.isId('as')) { p.next(); as = p.expr(8.5); }
    items.push({ value, ...(as ? { as } : {}) });
    if (p.isOp(',')) { p.next(); continue; }
    break;
  }
  return headerEnd(p, { kind: 'with', items });
}

function functionHeader(p) {
  let async = false;
  if (p.isId('async')) { p.next(); async = true; }
  const kw = p.next().v;
  if (kw === 'func' && p.isOp('(')) fail('method');
  const name = p.next();
  if (name.t !== 'id') fail('function name');
  if (p.isOp('<') || p.isOp('[')) { const close = p.isOp('<') ? '>' : ']'; p.next(); p.paramList(close); }
  p.eat('(');
  const params = p.paramList(')');
  // What it gives back, when written: `-> int:` (Python), `: Promise<T> {` (TypeScript), `(int, error) {` (Go).
  let returns = null;
  if (p.isOp('->') || (p.isOp(':') && p.fam === 'c') || (p.fam === 'go' && !p.isOp('{') && p.peek().t !== 'eof' && p.peek().t !== 'block')) {
    if (p.fam !== 'go') p.next();
    const a = p.k;
    while (p.peek().t !== 'eof' && p.peek().t !== 'block' && !p.isOp('{') && !(p.fam === 'py' && p.isOp(':') && p.peek(1).t === 'eof')) p.next();
    if (p.k > a) returns = p.text(a, p.k);
  }
  return { kind: 'function', name: name.v, params, ...(returns ? { returns } : {}), ...(async ? { async } : {}), body: { kind: 'block' } };
}

// ── Walking, counting, normalizing ───────────────────────────────────────────────────────────────────────────

/** Every node in a tree (depth first). */
export function* nodesOf(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) yield* nodesOf(x); return; }
  if (node.kind) yield node;
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (v && typeof v === 'object') yield* nodesOf(v);
  }
}

const NEG_NAME = /^(?:not|no|non|never|cannot|none)$/;
const nameWords = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);
const isNullLit = (n) => n && n.kind === 'literal' && n.type === 'null';

/**
 * What the faithfulness gate counts, read from the tree instead of the text: negations (`!`, `not`, `!=`, `!==`,
 * `is not`, `not in`, and negative words inside names), and/or joins, and comparisons. A loose `!= null` (`is not
 * None`, `!= nil`) is "is set": one comparison, no negation, as the gate has always counted it.
 */
export function exprCounts(tree) {
  let neg = 0, logic = 0, compare = 0;
  for (const n of nodesOf(tree)) {
    if (n.kind === 'not') neg++;
    else if (n.kind === 'logic') logic += n.operands.length - 1;
    else if (n.kind === 'compare' || n.kind === 'chain') {
      for (const op of n.kind === 'chain' ? n.ops : [n.op]) {
        const loose = (op === '!=' || op === 'is not' || op === '<>') && (isNullLit(n.right) || isNullLit(n.left)) && !(op === '!==' );
        const strictNilish = op === '!==' && (isNullLit(n.right) && /^(?:nil|None)$/.test(n.right.raw));
        compare++;
        if ((op === '!=' || op === '!==' || op === 'is not' || op === 'not in' || op === '<>' || op === '!is' || op === '!in') && !loose && !strictNilish) neg++;
      }
    } else if (n.kind === 'name' || (n.kind === 'member')) {
      const w = n.kind === 'name' ? n.name : n.property;
      if (/^(?:not|and|or|is|in|instanceof|typeof|true|false|null|nil|None|undefined|this|self|new|await)$/.test(w)) continue;
      for (const x of nameWords(w)) if (NEG_NAME.test(x)) neg++;
    }
  }
  return { neg, logic, compare };
}

/** A tree with spelling removed (quote style, spacing in types and parameters), so equal meaning compares equal. */
export function normalizeExpr(node) {
  if (Array.isArray(node)) return node.map(normalizeExpr);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const k of Object.keys(node).sort()) {
    const v = node[k];
    if (k === 'raw' && node.kind === 'literal' && node.type !== 'number' && !node.interpolated) continue;
    if (k === 'raw' && node.kind === 'template') continue;
    if (k === 'raw' && node.kind === 'literal' && node.type === 'number' && node.value != null) continue;
    // Layout, not meaning: a one-line body (`if (a) return b;`) is the step's own child either way.
    if (k === 'spelled' || k === 'inline') continue;
    if (typeof v === 'string' && (k === 'type' || k === 'text' || k === 'typeArgs' || k === 'returns') && node.kind !== 'literal') { out[k] = v.replace(/\s+/g, ''); continue; }
    if (k === 'params' && Array.isArray(v)) { out[k] = v.map((x) => String(x).replace(/\s+/g, '')); continue; }
    out[k] = normalizeExpr(v);
  }
  return out;
}
/** True when two trees mean the same (after normalizing spelling). */
export function sameExpr(a, b) { return JSON.stringify(normalizeExpr(a)) === JSON.stringify(normalizeExpr(b)); }

// ── Every detail in plain, neutral form ──────────────────────────────────────────────────────────────────────

const PREC = { conditional: 1, logicor: 2, logicand: 3, not: 4, compare: 5, '??': 1.5, '|': 6, '^': 6, '&': 6, '<<': 7, '>>': 7, '>>>': 7, '+': 8, '-': 8, '.': 8, '*': 9, '/': 9, '//': 9, '%': 9, '@': 9, '&^': 9, '**': 10, '..': 5.5, '..=': 5.5, '..<': 5.5, '...': 5.5, '<=>': 5 };
const precOf = (n) => (n.kind === 'conditional' || n.kind === 'lambda' || n.kind === 'assign' ? 1 : n.kind === 'logic' ? (n.op === 'or' ? 2 : 3) : n.kind === 'not' ? 4 : n.kind === 'compare' || n.kind === 'chain' ? 5 : n.kind === 'binary' ? PREC[n.op] ?? 8 : n.kind === 'cast' ? 9.5 : n.kind === 'unary' && !n.postfix ? 11 : 12);
const lit = (n) => (n.type === 'text' ? JSON.stringify(n.value) : n.type === 'char' ? n.raw : n.type === 'symbol' ? `:${n.value}` : n.type === 'null' ? (n.raw || 'null') : n.type === 'bool' ? String(n.value) : n.raw ?? String(n.value));
const NEUTRAL_OP = { '===': '===', '!==': '!==', '==': '==', '!=': '!=', '<>': '!=', 'not in': 'not in', 'is not': 'is not', '!in': 'not in', '!is': 'is not', instanceof: 'is a' };

/**
 * Every detail of a tree as one line of neutral, readable code: calls with every argument, values with every key, logic
 * as and / or / not. This is what Details and the full Thunder Text show under the short words.
 */
export function sayFull(n, outer = 0) {
  if (!n) return '';
  const wrap = (s, p) => (p < outer ? `(${s})` : s);
  switch (n.kind) {
    case 'code': return `\`${n.text}\``;
    case 'name': return n.name;
    case 'literal': return lit(n);
    case 'template': return `"${n.parts.map((x) => (typeof x === 'string' ? x.replace(/"/g, '\\"') : `{${sayFull(x.expr)}}`)).join('')}"`;
    case 'member': return `${sayFull(n.object, 12)}${n.static ? '::' : '.'}${n.property}`;
    case 'index': return `${sayFull(n.object, 12)}[${n.index.kind === 'slice' ? sayFull(n.index) : sayFull(n.index)}]`;
    case 'slice': return `${n.start ? sayFull(n.start) : ''}:${n.end ? sayFull(n.end) : ''}${n.step ? `:${sayFull(n.step)}` : ''}`;
    case 'call': {
      const callee = n.callee.kind === 'name' && n.callee.name === '' ? '' : sayFull(n.callee, 12);
      return `${n.new ? 'new ' : ''}${callee}(${n.args.map((a) => sayFull(a)).join(', ')})${n.init ? ` { ${n.init.map((e) => (e.key ? `${sayFull(e.key)} = ${sayFull(e.value)}` : sayFull(e.value))).join(', ')} }` : ''}`;
    }
    case 'named': return `${n.name}: ${sayFull(n.value)}`;
    case 'spread': return `...${sayFull(n.value, 11)}`;
    case 'hole': return '';
    case 'not': return wrap(`not ${sayFull(n.value, 5)}`, 4);
    case 'unary': return n.postfix ? `${sayFull(n.value, 12)}${n.op}` : wrap(`${n.op}${/^[a-z]/.test(n.op) ? ' ' : ''}${sayFull(n.value, 11)}`, 11);
    case 'logic': return wrap(n.operands.map((x) => sayFull(x, n.op === 'or' ? 3 : 4)).join(` ${n.op} `), n.op === 'or' ? 2 : 3);
    case 'compare': return wrap(`${sayFull(n.left, 6)} ${NEUTRAL_OP[n.op] ?? n.op} ${sayFull(n.right, 6)}`, 5);
    case 'chain': return wrap(n.operands.map((x, i) => (i ? `${NEUTRAL_OP[n.ops[i - 1]] ?? n.ops[i - 1]} ${sayFull(x, 6)}` : sayFull(x, 6))).join(' '), 5);
    case 'binary': { const p = PREC[n.op] ?? 8; return wrap(`${sayFull(n.left, p)} ${n.op === '??' ? 'or else' : n.op} ${sayFull(n.right, p + 0.5)}`, p); }
    case 'conditional': return wrap(`${sayFull(n.then, 2)} if ${sayFull(n.test, 2)}, otherwise ${sayFull(n.else, 1)}`, 1);
    case 'array': {
      const items = n.items.map((x) => sayFull(x)).join(', ');
      return n.form === 'tuple' ? `(${items})` : n.form === 'set' ? `set {${items}}` : `${n.type ? n.type : ''}[${items}]`;
    }
    case 'object': if (!n.entries.length) return `${n.type ? `${n.type} ` : ''}{}`; return `${n.type ? `${n.type} ` : ''}{ ${n.entries.map((e) => (e.kind === 'spread' ? `...${sayFull(e.value)}` : e.shorthand ? sayFull(e.value) : `${e.computed ? `[${sayFull(e.key)}]` : e.key?.kind === 'literal' && e.key.type === 'text' && /^[A-Za-z_$][\w$]*$/.test(e.key.value) ? e.key.value : sayFull(e.key)}: ${sayFull(e.value)}`)).join(', ')} }`;
    case 'comprehension': return `[${n.key ? `${sayFull(n.key)}: ` : ''}${sayFull(n.item)} ${n.clauses.map((c) => `for each ${c.targets.map((t) => sayFull(t)).join(', ')} in ${sayFull(c.iter)}${(c.conds || []).map((x) => ` where ${sayFull(x)}`).join('')}`).join(' ')}]`;
    case 'lambda': return wrap(`(${n.params.join(', ')})${n.returns ? `: ${n.returns}` : ''} => ${n.body.kind === 'block' ? 'the steps below' : sayFull(n.body, 1)}`, 1);
    case 'cast': return n.form === 'nonnull' ? sayFull(n.value, outer) : wrap(`${sayFull(n.value, 10)} as ${n.type}`, 9.5);
    case 'assign': return wrap(`${sayFull(n.target)} ${n.op === ':=' || n.op === '=' ? '=' : n.op} ${sayFull(n.value)}`, 1);
    case 'pattern': return n.text;
    case 'jsx': return `<${n.tag}${n.attrs.map((a) => (a.spread ? ` {...${sayFull(a.spread)}}` : a.value ? ` ${a.name}=${a.value.kind === 'literal' ? JSON.stringify(a.value.value) : `{${sayFull(a.value)}}`}` : ` ${a.name}`)).join('')}${n.children.length ? `>${n.children.map((c) => (typeof c === 'string' ? c : c.kind === 'jsx-value' ? `{${sayFull(c.value)}}` : sayFull(c))).join('')}</${n.tag}>` : ' />'}`;
    case 'jsx-value': return `{${sayFull(n.value)}}`;
    case 'yield': return `yield ${n.value ? sayFull(n.value) : ''}`.trim();
    case 'block': return 'the steps below';
    default: return statementFull(n);
  }
}

function statementFull(n) {
  switch (n.kind) {
    case 'return': return n.value ? `return ${sayFull(n.value)}` : 'return';
    case 'throw': return n.value ? `fail with ${sayFull(n.value)}` : 'fail again with the same error';
    case 'if': return `if ${n.init ? `${sayFull(n.init)}; ` : ''}${n.negate ? 'not ' : ''}${sayFull(n.test, n.negate ? 5 : 0)}`;
    case 'loop': return n.form === 'each' ? `for each ${n.targets.map((t) => sayFull(t)).join(', ')} in ${sayFull(n.iterable)}` : n.form === 'for' ? `for (${n.init ? sayFull(n.init) : ''}; ${n.test ? sayFull(n.test) : ''}; ${n.update ? sayFull(n.update) : ''})` : n.form === 'forever' ? 'repeat' : `${n.form === 'until' ? 'until' : 'while'} ${sayFull(n.test)}`;
    case 'switch': return n.subject ? `choose by ${sayFull(n.subject)}` : 'check these cases in order';
    case 'case': return n.default ? 'otherwise' : `when ${n.patterns.map((x) => sayFull(x)).join(' or ')}${n.guard ? ` and ${sayFull(n.guard)}` : ''}`;
    case 'try': return 'try';
    case 'jump': return `${n.jump}${n.label ? ` ${n.label}` : ''}`;
    case 'defer': return `at the end: ${sayFull(n.value)}`;
    case 'go': return `alongside: ${sayFull(n.value)}`;
    case 'delete': return `remove ${sayFull(n.target)}`;
    case 'assert': return `check ${sayFull(n.test)}${n.message ? `, else ${sayFull(n.message)}` : ''}`;
    case 'with': return `with ${n.items.map((i) => `${sayFull(i.value)}${i.as ? ` as ${sayFull(i.as)}` : ''}`).join(', ')}`;
    case 'function': return `${n.name}(${n.params.join(', ')})${n.returns ? `: ${n.returns}` : ''}`;
    case 'catch': return `catch ${n.errors.length ? n.errors.join(' or ') : 'any error'}${n.as ? ` as ${n.as}` : ''}`;
    case 'declare': return `${n.names.map((x) => (typeof x === 'string' ? x : sayFull(x))).join(', ')}${n.type ? `: ${n.type}` : ''}`;
    case 'sequence': return n.items.map((x) => sayFull(x)).join('; ');
    case 'pass': return 'nothing';
    default: return `\`${n.kind}\``;
  }
}

// What the short words leave out, by kind: the parts of the tree a reader can open one level down.
const wordsOfText = (s) => ` ${String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.$:]+/g, ' ').replace(/[^\w\s]+/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim()} `;
/** The names and values in a tree, as a reader would look for them in words. */
export function namesIn(tree) {
  const out = [];
  for (const n of nodesOf(tree)) {
    if (n.kind === 'name' && n.name && !/^(?:self|this)$/.test(n.name)) out.push(n.name);
    else if (n.kind === 'member') out.push(n.property);
    else if (n.kind === 'named') out.push(n.name);
    else if (n.kind === 'literal' && (n.type === 'number' || n.type === 'bool')) out.push(String(n.raw ?? n.value));
    else if (n.kind === 'literal' && n.type === 'text' && n.value.length < 40) out.push(n.value);
    // Written as text in the tree: parameters, types, the names a pattern or declaration binds.
    if (n.kind === 'lambda' || n.kind === 'function') out.push(...n.params, ...(n.returns ? [n.returns] : []), ...(n.name ? [n.name] : []));
    if (typeof n.type === 'string' && n.kind !== 'literal') out.push(n.type);
    if (n.kind === 'pattern') out.push(...n.names);
    if (n.kind === 'declare') out.push(...n.names.filter((x) => typeof x === 'string'));
    if (n.kind === 'catch') out.push(...n.errors, ...(n.as ? [n.as] : []));
    if (n.kind === 'jsx') { if (n.tag) out.push(n.tag); for (const a of n.attrs) if (a.name) out.push(a.name); for (const c of n.children) if (typeof c === 'string' && c.length < 40) out.push(c); }
  }
  return out.flatMap((x) => (/^[\w$]+$/.test(x) ? [x] : String(x).match(/[A-Za-z_$][\w$]*/g) || []));
}
const missingFrom = (said, tree) => {
  const sw = wordsOfText(said);
  return namesIn(tree).some((x) => { const w = wordsOfText(x).trim(); return w && !sw.includes(` ${w} `); });
};

/**
 * The details a step's short words leave out, as parts of one sentence: [{ label, text }] (empty when the words already
 * say everything). Built only from the step's `expr`.
 */
export function detailParts(step) {
  const e = step?.expr;
  if (!e) return [];
  const said = step.says || '';
  const parts = [];
  // A step shown as code: the whole statement (the short form may be cut), or what the code means when it was read.
  if (step.kind === 'other' || step.restates) {
    if (e.kind === 'code') { if (e.text && e.text !== String(step.code ?? '').replace(/\s+/g, ' ').trim()) parts.push({ label: 'code', text: e.text }); }
    else parts.push({ label: 'means', text: sayFull(e) });
    return parts;
  }
  const add = (label, node) => { if (node && missingFrom(said, node)) parts.push({ label, text: sayFull(node) }); };
  const core = e.kind === 'unary' && e.op === 'await' ? e.value : e;
  switch (core.kind) {
    case 'code': parts.push({ label: 'code', text: core.text }); break;
    case 'call': {
      // The words name the call ("Calls save"): only the arguments are added. When they do not name it (a library
      // phrase, "Runs the parent version first"), the whole call is shown: what is called, on what, with what.
      const name = core.callee.kind === 'member' ? core.callee.property : core.callee.kind === 'name' ? core.callee.name : null;
      if (!name || missingFrom(said, { kind: 'name', name }) || (core.callee.kind === 'member' && missingFrom(said, core.callee.object))) {
        if (missingFrom(said, core)) parts.push({ label: 'calls', text: sayFull(core) });
        if (core.init) parts.push({ label: 'filled with', text: core.init.map((x) => (x.key ? `${sayFull(x.key)} = ${sayFull(x.value)}` : sayFull(x.value))).join(', ') });
        break;
      }
      const args = core.args.filter((a) => !(a.kind === 'lambda' && a.body.kind === 'block'));
      if (args.length && args.some((a) => missingFrom(said, a))) parts.push({ label: 'with', text: args.map((a) => sayFull(a)).join(', ') });
      for (const a of core.args) if (a.kind === 'lambda' && a.body.kind === 'block' && a.params.length && missingFrom(said, { kind: 'array', items: a.params.map((x) => ({ kind: 'name', name: x })) })) parts.push({ label: 'each step gets', text: a.params.join(', ') });
      if (core.init) parts.push({ label: 'filled with', text: core.init.map((x) => (x.key ? `${sayFull(x.key)} = ${sayFull(x.value)}` : sayFull(x.value))).join(', ') });
      break;
    }
    case 'assign': add('target', core.target); if (core.type && !wordsOfText(said).includes(` ${wordsOfText(core.type).trim()} `)) parts.push({ label: 'a', text: core.type }); add(core.op === '=' || core.op === ':=' ? 'value' : `${core.op} by`, core.value); break;
    case 'sequence': for (const x of core.items) { if (x.kind === 'assign') { add('target', x.target); add('value', x.value); } else add('declares', x); } break;
    case 'return': add('value', core.value); break;
    case 'yield': add('value', core.value); break;
    case 'throw': if (core.value) add('error', core.value); if (core.cause) add('caused by', core.cause); break;
    case 'if': if (core.init) add('first', core.init); add('condition', core.test); break;
    case 'loop': if (core.form === 'each') { add('each', { kind: 'array', items: core.targets }); add('in', core.iterable); } else { if (core.init) add('starts', core.init); if (core.test) add('while', core.test); if (core.update) add('each time', core.update); } break;
    case 'switch': add('by', core.subject); break;
    case 'case': for (const x of core.patterns || []) add('when', x); if (core.guard) add('and', core.guard); break;
    case 'assert': add('checks', core.test); add('message', core.message); break;
    case 'delete': add('removes', core.target); break;
    case 'with': for (const i of core.items) { add('uses', i.value); add('as', i.as); } break;
    case 'function': if (missingFrom(said, { kind: 'lambda', params: core.params, returns: core.returns, body: { kind: 'block' } })) { parts.push({ label: 'takes', text: core.params.join(', ') || 'nothing' }); if (core.returns) parts.push({ label: 'gives back', text: core.returns }); } break;
    case 'defer': case 'go': add('runs', core.value); break;
    case 'jump': case 'try': case 'pass': break;
    default: add('value', core); break;
  }
  return parts;
}

/** The step's short words with every omitted detail after them: "Calls save — with: order, { validate: false }". */
export function detailOf(step) {
  const parts = detailParts(step);
  if (!parts.length) return null;
  return `${step.says} — ${parts.map((x) => `${x.label}: ${x.text}`).join('; ')}`;
}

// ── Words agree with the tree ────────────────────────────────────────────────────────────────────────────────

/**
 * Do a step's words agree with its tree? Every number and quoted text in the words must be a value in the tree, and a
 * step that says "Calls X" must call X. Returns the disagreements (empty when they agree). Steps shown as code agree.
 */
export function wordsAgree(step) {
  const e = step?.expr;
  const out = [];
  if (!e || e.kind === 'code' || step.kind === 'other' || step.restates) return out;
  const said = String(step.says || '').replace(/\bor \d+ other values?\b/g, '').replace(/\(\d+ steps? inside\)/g, '');
  const says = said.replace(/`[^`]*`/g, '');
  const values = [];
  for (const n of nodesOf(e)) {
    if (n.kind === 'literal') values.push(String(n.raw ?? ''), String(n.value ?? ''));
    else if (n.kind === 'template') { values.push(n.raw ?? ''); for (const x of n.parts) if (typeof x === 'string') values.push(x); }
    else if (n.kind === 'code') values.push(n.text);
    else if (n.kind === 'pattern') values.push(n.text);
  }
  const all = values.join('\n');
  // Numbers: in any literal (or a name/text that contains it: `http2`, `"v1"`), or the small counts Thunder writes itself.
  const flatText = `${all}\n${namesIn(e).join(' ')}\n${typeof e.type === 'string' ? e.type : ''}`;
  for (const num of says.match(/(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g) || []) if (!flatText.includes(num.replace(/^-/, '')) && !/^(?:0|1)$/.test(num) && !/^[2-5]\d\d$/.test(num)) out.push(`number ${num} is not in the code`);
  for (const q of said.match(/"[^"]{0,80}"/g) || []) {
    // (A quote mark that is itself a value, `'"'`, cannot be paired: skip it.)
    if (q.length < 3 || /^"'|'"$/.test(q)) continue;
    const inner = q.slice(1, -1).replace(/…$/, '');
    const parts = inner.split(/…|`/).map((x) => x.trim()).filter((x) => x.length > 2);
    if (parts.length && !parts.every((x) => flatText.includes(x) || flatText.includes(x.replace(/"/g, '\\"')))) out.push(`text ${q} is not in the code`);
  }
  const call = /^Calls ([\w ]+?)(?: with these steps|:.*)?$/.exec(says);
  const core = e.kind === 'unary' && e.op === 'await' ? e.value : e;
  if (call && core.kind === 'call') {
    const last = core.callee.kind === 'member' ? core.callee.property : core.callee.kind === 'name' ? core.callee.name : null;
    if (last && wordsOfText(last).trim() !== call[1].trim().toLowerCase() && !wordsOfText(sayFull(core.callee)).includes(` ${call[1].trim().toLowerCase()} `)) out.push(`says it calls ${call[1]}, the code calls ${last}`);
  }
  return out;
}

// ── Code again: TypeScript / JavaScript, Python, Go ──────────────────────────────────────────────────────────

export const RENDER_LANGUAGES = ['typescript', 'javascript', 'python', 'go'];

const RP = {
  // Binding strength in each target, for brackets: higher binds tighter.
  c: { assign: 1, conditional: 2, '??': 3, or: 4, and: 5, '|': 6, '^': 7, '&': 8, eq: 9, rel: 10, '<<': 11, '>>': 11, '>>>': 11, '+': 12, '-': 12, '*': 13, '/': 13, '%': 13, '**': 14, unary: 15, postfix: 16 },
  py: { assign: 0.5, lambda: 1, conditional: 2, or: 3, and: 4, not: 5, eq: 6, rel: 6, '|': 7, '^': 8, '&': 9, '<<': 10, '>>': 10, '+': 11, '-': 11, '*': 12, '/': 12, '//': 12, '%': 12, '@': 12, unary: 13, '**': 14, await: 15, postfix: 16 },
  go: { or: 1, and: 2, eq: 3, rel: 3, '+': 4, '-': 4, '|': 4, '^': 4, '*': 5, '/': 5, '%': 5, '<<': 5, '>>': 5, '&': 5, '&^': 5, unary: 6, postfix: 7 },
};
const EQ = new Set(['==', '!=', '===', '!==']);

class Unrenderable extends Error { constructor(why) { super(why); this.name = "Unrenderable"; } }
const no = (why) => { throw new Unrenderable(why); };

/** Code for an expression tree in a target language; throws when the tree has something the target cannot say. */
export function renderExpr(n, lang) {
  const fam = lang === 'python' ? 'py' : lang === 'go' ? 'go' : 'c';
  const P = RP[fam];
  const r = (x, min) => {
    const [s, p] = one(x);
    return p < min ? `(${s})` : s;
  };
  const strOf = (node) => {
    if (fam === 'py' && node.bytes) return node.raw;
    if (node.raw && node.kind === 'literal' && ((fam === 'go' && /^["`]/.test(node.raw)) || (fam === 'py' && /^[rRuU]?["']/.test(node.raw) && !/^[fF]/.test(node.raw)) || (fam === 'c' && /^["']/.test(node.raw)))) return node.raw;
    return JSON.stringify(node.value);
  };
  function one(x) {
    switch (x.kind) {
      case 'name': return [`${x.name}${x.typeArgs && lang === 'typescript' ? x.typeArgs : ''}`, 99];
      case 'literal': {
        if (x.type === 'text') { if (x.interpolated) no('interpolated text'); return [strOf(x), 99]; }
        if (x.type === 'number') return [x.raw, String(x.raw).startsWith('-') ? P.unary : 99];
        if (x.type === 'bool') return [fam === 'py' ? (x.value ? 'True' : 'False') : String(x.value), 99];
        if (x.type === 'null') return [fam === 'py' ? 'None' : fam === 'go' ? 'nil' : x.raw === 'undefined' ? 'undefined' : 'null', 99];
        if (x.type === 'regex' && fam === 'c') return [x.raw, 99];
        if (x.type === 'char' && fam === 'go') return [x.raw, 99];
        return no(`${x.type} literal`);
      }
      case 'template': {
        if (fam === 'c' && !x.form) return [`${x.tag ? r(x.tag, P.postfix) : ''}\`${x.parts.map((p) => (typeof p === 'string' ? p.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') : `\${${renderExpr(p.expr, lang)}}`)).join('')}\``, 99];
        if (fam === 'py' && x.form === 'f') {
          const q = x.parts.some((p) => typeof p === 'string' && p.includes('"')) ? "'" : '"';
          return [`f${q}${x.parts.map((p) => (typeof p === 'string' ? p.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\{/g, '{{').replace(/\}/g, '}}') : `{${renderExpr(p.expr, lang)}${p.selfDoc ? '=' : ''}${p.conv ? `!${p.conv}` : ''}${p.format != null ? `:${p.format}` : ''}}`)).join('')}${q}`, 99];
        }
        return no('template');
      }
      case 'member': {
        if (x.static) no('static member');
        return [`${r(x.object, P.postfix)}${x.optional ? (fam === 'c' ? '?.' : no('optional member')) : '.'}${x.property}${x.typeArgs && lang === 'typescript' ? x.typeArgs : ''}`, P.postfix];
      }
      case 'index': {
        const idx = x.index.kind === 'slice' ? (fam === 'c' ? no('slice') : `${x.index.start ? renderExpr(x.index.start, lang) : ''}:${x.index.end ? renderExpr(x.index.end, lang) : ''}${x.index.step ? `:${renderExpr(x.index.step, lang)}` : ''}`) : x.index.kind === 'array' && x.index.form === 'tuple' && fam === 'py' ? x.index.items.map((i) => renderExpr(i, lang)).join(', ') : renderExpr(x.index, lang);
        return [`${r(x.object, P.postfix)}${x.optional ? '?.' : ''}[${idx}]`, P.postfix];
      }
      case 'call': {
        if (x.init) no('initializer');
        if (x.parens === false && !x.new) no('call without brackets');
        const callee = r(x.callee, P.postfix);
        const args = x.args.map((a) => arg(a)).join(', ');
        if (x.new) { if (fam !== 'c') no('new'); return [`new ${callee}${x.typeArgs ? x.typeArgs : ''}${x.parens === false ? '' : `(${args})`}`, P.postfix]; }
        return [`${callee}${x.optional ? '?.' : ''}(${args})`, P.postfix];
      }
      case 'not': return fam === 'py' ? [`not ${r(x.value, P.not)}`, P.not] : [`!${r(x.value, P.unary)}`, P.unary];
      case 'unary': {
        if (x.postfix) { if (fam === 'py' || (x.op !== '++' && x.op !== '--')) no(`postfix ${x.op}`); return [`${r(x.value, P.postfix)}${x.op}`, P.postfix]; }
        if (x.op === 'await') { if (fam === 'go') no('await'); return [`await ${r(x.value, fam === 'py' ? P.await : P.unary)}`, fam === 'py' ? P.await : P.unary]; }
        if (/^(?:typeof|void|delete)$/.test(x.op)) { if (fam !== 'c') no(x.op); return [`${x.op} ${r(x.value, P.unary)}`, P.unary]; }
        if ((x.op === '*' || x.op === '&' || x.op === '<-') && fam !== 'go') no(x.op);
        if ((x.op === '++' || x.op === '--') && fam === 'py') no(x.op);
        if (x.op === '~' && fam === 'go') return [`^${r(x.value, P.unary)}`, P.unary];
        const inner = r(x.value, P.unary);
        // `- -x` must not become `--x`.
        return [`${x.op}${(x.op === '-' && inner.startsWith('-')) || (x.op === '+' && inner.startsWith('+')) ? ' ' : ''}${inner}`, P.unary];
      }
      case 'logic': {
        const p = x.op === 'or' ? P.or : P.and;
        const op = fam === 'py' ? ` ${x.op} ` : x.op === 'or' ? ' || ' : ' && ';
        // In JavaScript, ?? cannot be mixed with && / || without brackets.
        return [x.operands.map((o, i) => { const s = r(o, i ? p + 0.5 : p); return fam === 'c' && o.kind === 'binary' && o.op === '??' && !s.startsWith('(') ? `(${s})` : s; }).join(op), p];
      }
      case 'compare': {
        let op = x.op;
        if (fam === 'py') { if (op === '===' || op === '!==' || op === 'instanceof') no(op); op = op === '!is' ? 'is not' : op === '!in' ? 'not in' : op; }
        if (fam === 'go' && !/^(?:==|!=|<|>|<=|>=)$/.test(op)) no(op);
        if (fam === 'c' && /^(?:is|is not|not in|!in|!is)$/.test(op)) no(op);
        const p = EQ.has(op) ? P.eq : P.rel;
        return [`${r(x.left, p)} ${op} ${r(x.right, p + 0.5)}`, p];
      }
      case 'chain': { if (fam !== 'py') no('chain'); return [x.operands.map((o, i) => (i ? `${x.ops[i - 1]} ${r(o, P.rel + 0.5)}` : r(o, P.rel + 0.5))).join(' '), P.rel]; }
      case 'binary': {
        let op = x.op;
        if (op === '??') { if (fam !== 'c') no('??'); const p = P['??']; return [`${r(x.left, p)} ?? ${r(x.right, p + 0.5)}`, p]; }
        if (op === '**' && fam === 'go') no('**');
        if ((op === '//' || op === '@') && fam !== 'py') no(op);
        if (op === '&^' && fam !== 'go') no(op);
        if ((op === '>>>' ) && fam !== 'c') no(op);
        if (/^(?:\.\.|\.\.=|\.\.<|\.\.\.|\.|<=>|=~)$/.test(op)) no(op);
        const p = P[op] ?? no(op);
        if (op === '**') return [`${r(x.left, p + 0.5)} ** ${r(x.right, fam === 'py' ? P.unary : p)}`, p];
        return [`${r(x.left, p)} ${op} ${r(x.right, p + 0.5)}`, p];
      }
      case 'conditional': {
        if (fam === 'go') no('conditional');
        if (fam === 'py') return [`${r(x.then, P.conditional + 0.5)} if ${r(x.test, P.conditional + 0.5)} else ${r(x.else, P.conditional)}`, P.conditional];
        return [`${r(x.test, P.conditional + 0.5)} ? ${r(x.then, P.assign)} : ${r(x.else, P.conditional)}`, P.conditional];
      }
      case 'array': {
        const items = x.items.map((i) => (i.kind === 'hole' ? '' : arg(i))).join(', ');
        if (x.repeat) no('repeat');
        if (fam === 'go') { if (x.form === 'tuple') return [items, 0]; if (x.type == null) no('untyped list'); return [`${x.type}{${items}}`, P.postfix]; }
        if (x.form === 'tuple') { if (fam === 'c') return [items, 0]; return [`(${items}${x.items.length === 1 ? ',' : ''})`, 99]; }
        if (x.form === 'set') { if (fam !== 'py') no('set'); return [`{${items}}`, 99]; }
        if (x.form === 'braces') no('braces list');
        return [`[${items}]`, 99];
      }
      case 'object': {
        if (fam === 'go') {
          const body = x.entries.map((e) => (e.kind === 'spread' ? no('spread') : `${renderExpr(e.key, lang)}: ${renderExpr(e.value, lang)}`)).join(', ');
          return [`${x.type ?? no('untyped object')}{${body}}`, P.postfix];
        }
        if (x.type || x.form) no(x.form || 'typed object');
        const body = x.entries.map((e) => {
          if (e.kind === 'spread') return fam === 'py' ? `**${renderExpr(e.value, lang)}` : `...${renderExpr(e.value, lang)}`;
          if (fam === 'py') return `${renderExpr(e.key, lang)}: ${renderExpr(e.value, lang)}`;
          if (e.shorthand) return renderExpr(e.value, lang);
          if (e.method) {
            const v = e.value, k0 = e.key.kind === 'literal' && e.key.raw === e.key.value ? e.key.value : renderExpr(e.key, lang);
            const pre = v.form === 'getter' ? 'get ' : v.form === 'setter' ? 'set ' : v.form === 'async method' ? 'async ' : v.form === 'generator method' ? '*' : '';
            return `${pre}${k0}(${v.params.join(', ')}) {\n}`;
          }
          if (e.computed) return `[${renderExpr(e.key, lang)}]: ${renderExpr(e.value, lang)}`;
          const k = e.key.kind === 'literal' && e.key.type === 'text' && e.key.raw === e.key.value ? e.key.value : renderExpr(e.key, lang);
          return `${k}: ${renderExpr(e.value, lang)}`;
        }).join(', ');
        return [fam === 'py' ? `{${body}}` : x.entries.length ? `{ ${body} }` : '{}', 99];
      }
      case 'comprehension': {
        if (fam !== 'py') no('comprehension');
        const clauses = x.clauses.map((c) => ` for ${c.targets.map((t) => renderExpr(t, lang)).join(', ')} in ${r(c.iter, P.or)}${(c.conds || []).map((k) => ` if ${r(k, P.or)}`).join('')}`).join('');
        const head = x.form === 'dict' ? `${renderExpr(x.key, lang)}: ${renderExpr(x.item, lang)}` : renderExpr(x.item, lang);
        return [x.form === 'list' ? `[${head}${clauses}]` : x.form === 'dict' || x.form === 'set' ? `{${head}${clauses}}` : `(${head}${clauses})`, 99];
      }
      case 'lambda': {
        if (fam === 'py') { if (x.body.kind === 'block') no('block lambda'); return [`lambda${x.params.length ? ` ${x.params.join(', ')}` : ''}: ${renderExpr(x.body, lang)}`, P.lambda]; }
        if (fam === 'go') { if (x.form !== 'func') no('lambda'); return [`func(${x.params.join(', ')})${x.returns ? ` ${x.returns}` : ''} {\n}`, P.postfix]; }
        if (x.form === 'function') return [`${x.async ? 'async ' : ''}function${x.generator ? '*' : ''}${x.name ? ` ${x.name}` : ''}(${x.params.join(', ')}) {\n}`, P.postfix];
        if (x.form && x.form !== 'function') no(`${x.form} lambda`);
        const body = x.body.kind === 'block' ? '{\n}' : x.body.kind === 'object' || x.body.kind === 'assign' ? `(${renderExpr(x.body, lang)})` : r(x.body, P.assign);
        return [`${x.async ? 'async ' : ''}${x.typeParams ?? ''}(${x.params.join(', ')})${x.returns ? `: ${x.returns}` : ''} => ${body}`, P.assign];
      }
      case 'cast': {
        if (fam === 'c' && lang === 'typescript' && (x.form === 'as' || x.form === 'satisfies')) return [`${r(x.value, P.rel)} ${x.form} ${x.type}`, P.rel];
        if (fam === 'go' && x.form === 'assert') return [`${r(x.value, P.postfix)}.(${x.type})`, P.postfix];
        return no('cast');
      }
      case 'spread': return fam === 'c' && x.form === '...' && !x.postfix ? [`...${r(x.value, P.assign)}`, 0] : fam === 'py' && (x.form === '*' || x.form === '**') ? [`${x.form}${r(x.value, P.unary)}`, 0] : fam === 'go' && x.postfix ? [`${r(x.value, P.postfix)}...`, 0] : no('spread');
      case 'named': return fam === 'py' ? [`${x.name}=${renderExpr(x.value, lang)}`, 0] : no('named argument');
      case 'assign': {
        if (fam === 'go') no('assignment in an expression');
        if (fam === 'py' && x.op !== ':=') no('assignment in an expression');
        return [`${renderExpr(x.target, lang)} ${x.op} ${r(x.value, P.assign)}`, P.assign];
      }
      case 'yield': { if (fam === 'go') no('yield'); return [`yield${x.delegate ? (fam === 'py' ? ' from' : '*') : ''}${x.value ? ` ${renderExpr(x.value, lang)}` : ''}`, fam === 'py' ? 0.5 : P.assign]; }
      case 'pattern': return [x.text, 99];
      case 'jsx': {
        if (fam !== 'c') no('jsx');
        const attrs = x.attrs.map((a) => (a.spread ? ` {...${renderExpr(a.spread, lang)}}` : a.value ? ` ${a.name}=${a.value.kind === 'literal' && a.value.type === 'text' ? a.value.raw : a.value.kind === 'jsx' ? renderExpr(a.value, lang) : `{${renderExpr(a.value, lang)}}`}` : ` ${a.name}`)).join('');
        if (!x.children.length) return [`<${x.tag}${attrs} />`, 99];
        return [`<${x.tag}${attrs}>${x.children.map((c) => (typeof c === 'string' ? c : c.kind === 'jsx-value' ? `{${renderExpr(c.value, lang)}}` : renderExpr(c, lang))).join('')}</${x.tag}>`, 99];
      }
      default: return no(x.kind);
    }
  }
  const arg = (a) => {
    if (a.kind === 'lambda' && a.trailing) no('trailing block');
    const [s] = one(a);
    return a.kind === 'array' && a.form === 'tuple' && fam !== 'py' ? `(${s})` : s;
  };
  try { return one(n)[0]; } catch (e) { if (e instanceof Unrenderable) throw e; throw e; }
}

/**
 * Code for a statement tree (a step's `expr`) in a target language. A step that opens a block (if, for, a function)
 * is written with an empty block; its children are their own steps. Throws when the tree cannot be written there.
 */
export function renderStatement(n, lang) {
  const fam = lang === 'python' ? 'py' : lang === 'go' ? 'go' : 'c';
  // JSX as a value is written the way people write it, in brackets on its own lines (`return (\n  <div>…\n);`).
  const R = (x) => (x.kind === 'jsx' && fam === 'c' ? `(\n${renderExpr(x, lang)}\n)` : renderExpr(x, lang));
  const semi = fam === 'c' ? ';' : '';
  const block = (head) => (fam === 'py' ? `${head}:\n    pass` : `${head} {\n}`);
  switch (n.kind) {
    case 'code': return no('code');
    case 'assign': {
      const target = n.target.kind === 'array' && n.target.form === 'tuple' && n.target.items.length > 1 ? n.target.items.map(R).join(', ') : R(n.target);
      const value = n.value.kind === 'array' && n.value.form === 'tuple' && fam !== 'c' && n.value.items.length > 1 ? n.value.items.map(R).join(', ') : n.value.kind === 'assign' ? renderStatement(n.value, lang).replace(/;$/, '') : R(n.value);
      if (n.declare) {
        if (fam === 'c') { if (!/^(?:const|let|var)$/.test(n.declare)) no(n.declare); return `${n.declare} ${target}${n.type ? `: ${n.type}` : ''} = ${value};`; }
        if (fam === 'go') { if (n.declare !== 'var' && n.declare !== 'const') no(n.declare); return `${n.declare} ${target}${n.type ? ` ${n.type}` : ''} = ${value}`; }
        return no('declaration');
      }
      if (n.type && fam === 'py') return `${target}: ${n.type} = ${value}`;
      if (n.op === ':=' && fam !== 'go') no(':=');
      return `${target} ${n.op} ${value}${semi}`;
    }
    case 'declare': {
      if (fam === 'c' && /^(?:let|var)$/.test(n.declare)) return `${n.declare} ${n.names.join(', ')}${n.type ? `: ${n.type}` : ''};`;
      if (fam === 'go' && n.declare === 'var') return `var ${n.names.map((x) => (typeof x === 'string' ? x : R(x))).join(', ')}${n.type ? ` ${n.type}` : ''}`;
      if (fam === 'py' && n.type) return `${n.names[0]}: ${n.type}`;
      if (fam === 'py' && n.scope) return `${n.scope} ${n.names.join(', ')}`;
      return no('declaration');
    }
    case 'sequence': {
      if (fam === 'go' && n.block) return `${n.block} (\n${n.items.map((x) => `\t${renderStatement(x, lang).replace(/^(?:var|const) /, '')}`).join('\n')}\n)`;
      if (fam === 'c' && n.items.every((x) => x.declare && x.declare === n.items[0].declare)) return `${n.items[0].declare} ${n.items.map((x) => (x.kind === 'assign' ? `${R(x.target)}${x.type ? `: ${x.type}` : ''} = ${R(x.value)}` : x.names.join(', '))).join(', ')};`;
      return no('sequence');
    }
    case 'return': return n.value ? `return ${n.value.kind === 'array' && n.value.form === 'tuple' && fam !== 'c' && n.value.items.length > 1 ? n.value.items.map(R).join(', ') : R(n.value)}${semi}` : `return${semi}`;
    case 'throw':
      if (n.form === 'panic') { if (fam !== 'go') no('panic'); return R(n.value); }
      if (fam === 'go') no('throw');
      if (fam === 'py') return n.value ? `raise ${R(n.value)}${n.cause ? ` from ${R(n.cause)}` : ''}` : 'raise';
      return n.value ? `throw ${R(n.value)};` : no('rethrow');
    case 'if': {
      if (n.negate) no('unless');
      if (fam === 'go') return block(`if ${n.init ? `${renderStatement(n.init, lang)}; ` : ''}${R(n.test)}`);
      if (n.init) no('if with a first statement');
      return fam === 'py' ? block(`if ${R(n.test)}`) : block(`if (${R(n.test)})`);
    }
    case 'loop': {
      if (n.form === 'each') {
        if (fam === 'py') return block(`for ${n.targets.map(R).join(', ')} in ${n.iterable.kind === 'array' && n.iterable.form === 'tuple' ? n.iterable.items.map(R).join(', ') : R(n.iterable)}`);
        if (fam === 'go') { if (!n.range) no('each'); return block(`for ${n.targets.length ? `${n.targets.map(R).join(', ')} := ` : ''}range ${R(n.iterable)}`); }
        if (n.type) no('typed loop');
        return block(`for (${n.declare ? `${n.declare} ` : ''}${n.targets.map(R).join(', ')} ${n.keys ? 'in' : 'of'} ${R(n.iterable)})`);
      }
      if (n.form === 'while') return fam === 'go' ? block(`for ${R(n.test)}`) : fam === 'py' ? block(`while ${R(n.test)}`) : block(`while (${R(n.test)})`);
      if (n.form === 'forever') { if (fam === 'go') return block('for'); return no('forever'); }
      if (n.form === 'for') {
        if (fam === 'py') no('for');
        const init = n.init ? renderStatement(n.init, lang).replace(/;$/, '') : '';
        const update = n.update ? renderStatement(n.update, lang).replace(/;$/, '') : '';
        return fam === 'go' ? block(`for ${init}; ${n.test ? R(n.test) : ''}; ${update}`) : block(`for (${init}; ${n.test ? R(n.test) : ''}; ${update})`);
      }
      return no(`${n.form} loop`);
    }
    case 'switch': {
      if (fam === 'py') return no('match');
      if (n.form !== 'switch' && !(fam === 'go' && n.form === 'select')) no(n.form);
      if (fam === 'go') return n.form === 'select' ? 'select {\n}' : block(`switch${n.init ? ` ${renderStatement(n.init, lang)};` : ''}${n.subject ? ` ${n.subject.kind === 'assign' ? renderStatement(n.subject, lang) : R(n.subject)}` : ''}`);
      return block(`switch (${R(n.subject)})`);
    }
    case 'case': {
      // Only the label (its steps are its children); it is read inside a switch / match.
      const pats = n.patterns || [];
      if (n.guard && fam !== 'py') no('guard');
      if (fam === 'py') { if (n.default || !pats.length) no('default'); return `case ${pats.map(R).join(' | ')}${n.guard ? ` if ${R(n.guard)}` : ''}:`; }
      if (fam === 'go') { if (n.default && pats.length) no('default with cases'); return n.default ? 'default:' : `case ${pats.map((x) => (x.kind === 'assign' || (x.kind === 'unary' && x.op === '<-') ? renderStatement(x, lang) : R(x))).join(', ')}:`; }
      return [...pats.map((x) => `case ${R(x)}:`), ...(n.default ? ['default:'] : [])].join('\n');
    }
    case 'try': return fam === 'py' ? 'try:\n    pass\nexcept Exception:\n    pass' : fam === 'go' ? no('try') : 'try {\n} catch (e) {\n}';
    case 'jump': if (n.jump === 'fallthrough' && fam !== 'go') no('fallthrough'); return `${n.jump}${n.label ? ` ${n.label}` : ''}${semi}`;
    case 'yield': return `${R(n)}${semi}`;
    case 'defer': case 'go': if (fam !== 'go') no(n.kind); return `${n.kind} ${R(n.value)}`;
    case 'delete': return fam === 'py' ? `del ${n.target.kind === 'array' && n.target.form === 'tuple' ? n.target.items.map(R).join(', ') : R(n.target)}` : fam === 'c' ? `delete ${R(n.target)};` : no('delete');
    case 'assert': if (fam !== 'py') no('assert'); return `assert ${R(n.test)}${n.message ? `, ${R(n.message)}` : ''}`;
    case 'with': if (fam !== 'py') no('with'); return block(`${n.async ? 'async ' : ''}with ${n.items.map((i) => `${R(i.value)}${i.as ? ` as ${R(i.as)}` : ''}`).join(', ')}`);
    case 'function': return fam === 'py' ? block(`${n.async ? 'async ' : ''}def ${n.name}(${n.params.join(', ')})${n.returns ? ` -> ${n.returns}` : ''}`) : fam === 'go' ? block(`func ${n.name}(${n.params.join(', ')})${n.returns ? ` ${n.returns}` : ''}`) : block(`${n.async ? 'async ' : ''}function ${n.name}(${n.params.join(', ')})${n.returns ? `: ${n.returns}` : ''}`);
    case 'pass': return fam === 'py' ? 'pass' : no('pass');
    default: {
      // An expression used as a statement: a call, an await, an increment.
      if (n.inline) no('inline');
      const s = R(n);
      if (fam === 'c' && (s.startsWith('{') || s.startsWith('function') || /^async\s+function/.test(s) || s.startsWith('('))) return `(${s});`;
      return `${s}${semi}`;
    }
  }
}

export { Unrenderable };
