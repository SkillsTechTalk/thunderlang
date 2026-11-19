// Read code you don't know: recover the decision rules inside functions written in TypeScript /
// JavaScript, Python, Go, Rust, C#, or Java, and show them as ThunderLang plus plain English.
// Deterministic, no AI, browser-safe. Everything here is INFERRED from code: a reading says what
// the code appears to decide, never what it was meant to decide, and anything it could not read
// is listed rather than guessed.
//
// Recognized shapes (the common ways code chooses an answer):
//   if (cond) return X; ... return Y;        if/else if/else chains returning values
//   return cond ? X : Y   (nested ternaries)  Python: return X if cond else Y
//   Rust/Go tail forms: if cond { X } else { Y }, if cond { return X }
// Conditions may use comparisons, &&/||/!, and/or/not, parentheses, literals, and inputs or fields.
import { compileExpr, simplifyExpr } from './expr.mjs';
import { extractFacts, languageForFile } from './lift.mjs';

export const READ_SCHEMA = 'thunder-reading-v1';
export const READ_LANGUAGES = ['typescript', 'javascript', 'python', 'go', 'rust', 'csharp', 'java'];
const BRACE_LANGS = new Set(['typescript', 'javascript', 'go', 'rust', 'csharp', 'java']);
const KEYWORDS_NOT_FN = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'else', 'using', 'lock', 'foreach', 'match', 'loop', 'sizeof', 'typeof', 'nameof']);

/** Best-effort language guess for pasted code (a file name, when known, is more reliable). */
export function detectLanguage(source, file = '') {
  if (file) return languageForFile(file);
  const s = String(source);
  if (/^\s*package\s+\w+\s*$/m.test(s) || /\bfunc\s+(\([^)]*\)\s*)?\w+\s*\(/.test(s)) return 'go';
  if (/\bfn\s+\w+\s*(<[^>]*>)?\s*\(/.test(s) || /\blet\s+mut\b|->\s*&'static/.test(s)) return 'rust';
  if (/^\s*def\s+\w+\s*\(.*\)\s*(->\s*[^:]+)?:\s*$/m.test(s)) return 'python';
  if (/\bnamespace\s+[\w.]+|\busing\s+System\b|\bpublic\s+static\s+string\b|\bstring\s+\w+\s*[,)]/.test(s)) return 'csharp';
  if (/\bpublic\s+(static\s+)?(class|String|boolean|int|double|void)\b|\bString\s+\w+\s*[,)]|\bboolean\b/.test(s)) return 'java';
  if (/:\s*(number|string|boolean)\b|\binterface\s+\w+|\bexport\s+(function|const)\b/.test(s)) return 'typescript';
  return 'javascript';
}

// ── Lexing helpers ──────────────────────────────────────────────────────────────────────────

const lineAt = (src, idx) => src.slice(0, idx).split('\n').length;

/** Index of the bracket that closes the one at `open`, skipping strings and comments. */
function matchClose(src, open) {
  const pairs = { '{': '}', '(': ')', '[': ']' };
  const stack = [pairs[src[open]]];
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === '\'' || c === '`') { i = skipString(src, i); continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) return -1; i++; continue; }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return i; }
  }
  return -1;
}

// The language being read. Only Rust has lifetimes ('static, 'a), which look like an opening quote.
let READING_RUST = false;

function skipString(src, i) {
  const q = src[i];
  if (q === '\'' && !READING_RUST) {
    for (let j = i + 1; j < src.length; j++) {
      if (src[j] === '\\') { j++; continue; }
      if (src[j] === q || src[j] === '\n') return j;
    }
    return src.length;
  }
  // Rust lifetimes ('static, 'a) are not strings: a quote, a name, and no closing quote right after it.
  // 'path' and 'a' are strings or chars because the name is followed by a quote.
  if (q === '\'' && /[A-Za-z_]/.test(src[i + 1] || '')) {
    let j = i + 1;
    while (/\w/.test(src[j] || '')) j++;
    if (src[j] !== '\'') return i;
  }
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === q) return j;
    if (src[j] === '\n' && q !== '`') return j;
  }
  return src.length;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── Function discovery ──────────────────────────────────────────────────────────────────────

function parseParams(raw, language) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of raw) {
    if ('<([{'.includes(ch)) depth++;
    else if ('>)]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  const out = [];
  let pendingGo = [];
  for (let p of parts.map((x) => x.trim()).filter(Boolean)) {
    p = p.replace(/=.*$/, '').trim();
    if (/^&?\s*(mut\s+)?self$|^self$|^cls$|^this$/.test(p)) continue;
    let name = p, type = null, m;
    if (language === 'go') {
      m = p.match(/^(\w+)\s+(.+)$/);
      if (!m) { pendingGo.push(p); continue; }
      [, name, type] = m;
      for (const g of pendingGo) out.push({ name: g, type: simpleType(type) });
      pendingGo = [];
    } else if (language === 'java' || language === 'csharp') {
      m = p.replace(/^(final|ref|in|out|params)\s+/, '').match(/^(.+?)\s+(\w+)$/);
      if (m) [, type, name] = m;
    } else if ((m = p.match(/^(\w+)\??\s*:\s*(.+)$/))) {
      [, name, type] = m;
    }
    out.push({ name: name.replace(/^mut\s+/, ''), type: simpleType(type) });
  }
  for (const g of pendingGo) out.push({ name: g, type: null });
  return out;
}

function simpleType(t) {
  if (!t) return null;
  const s = String(t).trim().replace(/^&(mut\s+)?/, '');
  if (/^(number|int|long|short|float|double|decimal|f32|f64|i\d+|u\d+|usize|isize|float64|float32|int\d*|uint\d*|Integer|Double|Long|BigDecimal)$/.test(s)) return 'number';
  if (/^(bool|boolean|Boolean)$/.test(s)) return 'boolean';
  if (/^(str|string|String|&str|char)$/.test(s)) return 'string';
  return s;
}

/** Find functions and their bodies. Returns [{ name, line, params, bodyStart, bodyEnd, body, exprBody }]. */
function findFunctions(src, language) {
  const fns = [];
  if (language === 'python') {
    const lines = src.split('\n');
    lines.forEach((l, i) => {
      const m = l.match(/^(\s*)(?:async\s+)?def\s+(\w+)\s*\((.*)\)\s*(?:->\s*([^:]+))?:\s*(.*)$/);
      if (!m) return;
      const indent = m[1].length;
      const body = [];
      if (m[5].trim()) body.push({ text: m[5].trim(), line: i + 1, indent: indent + 4 });
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j];
        if (!t.trim() || /^\s*#/.test(t)) continue;
        const ind = t.match(/^\s*/)[0].length;
        if (ind <= indent) break;
        body.push({ text: t.trim(), line: j + 1, indent: ind });
      }
      fns.push({ name: m[2], line: i + 1, params: parseParams(m[3], language), returns: m[4]?.trim() || null, pyBody: body });
    });
    annotateRoutes(fns, src);
    return fns;
  }
  const patterns = {
    typescript: [
      /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*(?:<[^>]*>)?\s*\(/g,
      /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:<[^>]*>)?\(/g,
      /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+|readonly\s+)*(\w+)\s*(?:<[^>]*>)?\s*\(/gm,
    ],
    go: [/func\s+(?:\([^)]*\)\s*)?(\w+)\s*(?:\[[^\]]*\])?\s*\(/g],
    rust: [/(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g],
    java: [/(?:(?:public|private|protected|static|final|synchronized|abstract)\s+)*(?:<[^>]+>\s+)?[\w.<>\[\],?\s]+?\s+(\w+)\s*\(/g],
  };
  patterns.javascript = patterns.typescript;
  patterns.csharp = [/(?:(?:public|private|protected|internal|static|virtual|override|async|sealed|abstract|readonly)\s+)*[\w.<>\[\],?\s]+?\s+(\w+)\s*\(/g];
  const seen = new Set();
  for (const re of patterns[language] || []) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(src))) {
      const name = m[1];
      const open = src.indexOf('(', m.index + m[0].length - 1);
      if (KEYWORDS_NOT_FN.has(name) || open < 0) continue;
      const close = matchClose(src, open);
      if (close < 0) continue;
      // After the parameter list: an optional return type / throws clause, then a body.
      const after = src.slice(close + 1);
      const head = after.match(/^\s*(?::\s*([^{=;]+?)|->\s*([^{;]+?)|\s+(\([^)]*\)|[\w.<>\[\]*&' ]+?))?\s*(?:throws\s+[\w.,\s]+)?\s*(=>|\{|;)/);
      if (!head || head[4] === ';') continue;
      const key = `${name}@${m.index}`;
      // The function's line is where its name is, not where a multi-line match began.
      const fnLine = lineAt(src, m.index + m[0].lastIndexOf(name));
      if (seen.has(name + ':' + fnLine)) continue;
      seen.add(name + ':' + fnLine);
      const returns = (head[1] || head[2] || head[3] || '').trim() || null;
      const params = parseParams(src.slice(open + 1, close), language);
      const markerAt = close + 1 + head[0].length - head[4].length;
      if (head[4] === '=>') {
        const rest = src.slice(markerAt + 2);
        const lead = rest.match(/^\s*/)[0].length;
        if (rest[lead] === '{') {
          const bo = markerAt + 2 + lead, bc = matchClose(src, bo);
          if (bc > 0) fns.push({ key, name, line: fnLine, params, returns, bodyStart: bo + 1, body: src.slice(bo + 1, bc) });
        } else {
          // An expression body ends at its first top-level semicolon (or a blank line, for JS without semicolons).
          const semi = topLevelIndex(rest, ';');
          const blank = rest.search(/\n\s*\n/);
          const end = semi < 0 ? blank : blank < 0 ? semi : Math.min(semi, blank);
          const expr = (end < 0 ? rest : rest.slice(0, end)).trim();
          fns.push({ key, name, line: fnLine, params, returns, bodyStart: markerAt + 2 + lead, body: `return ${expr};` });
        }
      } else {
        const bc = matchClose(src, markerAt);
        if (bc > 0) fns.push({ key, name, line: fnLine, params, returns, bodyStart: markerAt + 1, body: src.slice(markerAt + 1, bc) });
      }
    }
  }
  // Anonymous HTTP handlers: app.post('/refunds', (req, res) => {...}), r.Get("/x", func(w, r) {...}).
  const routeRes = language === 'go'
    ? [/\.(Get|Post|Put|Patch|Delete|GET|POST|PUT|PATCH|DELETE|HandleFunc|Handle)\(\s*"([^"]+)"\s*,\s*func\s*\(/g]
    : (language === 'typescript' || language === 'javascript')
      ? [/\b\w+\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)['"`]\s*,(?:[^,()]*,)*?\s*(?:async\s*)?(?:function\s*\w*\s*)?\(/g]
      : [];
  for (const re of routeRes) {
    let m;
    while ((m = re.exec(src))) {
      const open = src.indexOf('(', m.index + m[0].length - 1);
      const close = matchClose(src, open);
      if (close < 0) continue;
      const brace = src.indexOf('{', close);
      if (brace < 0 || !/^\s*(=>\s*)?(\w[\w.*\s]*)?\s*$/.test(src.slice(close + 1, brace))) continue;
      const bc = matchClose(src, brace);
      if (bc < 0) continue;
      const method = /^handle/i.test(m[1]) ? 'ANY' : m[1].toUpperCase();
      fns.push({ name: `${method} ${m[2]}`, line: lineAt(src, m.index), params: [], returns: null, bodyStart: brace + 1, body: src.slice(brace + 1, bc), route: { method, path: m[2] } });
    }
  }
  annotateRoutes(fns, src);
  return fns.sort((a, b) => a.line - b.line);
}
/** Mark functions that a decorator or annotation binds to an HTTP route. */
function annotateRoutes(fns, src) {
  // Decorated handlers: @app.get("/x") / @router.post (Python), @GetMapping (Spring), [HttpGet] (ASP.NET), @Get() (NestJS).
  const lines = src.split('\n');
  for (const fn of fns) {
    if (fn.route) continue;
    for (let k = fn.line - 2; k >= Math.max(0, fn.line - 6); k--) {
      const l = lines[k].trim();
      let m;
      if ((m = l.match(/^@\w+\.(get|post|put|patch|delete)\(\s*['"]([^'"]*)['"]/i))) { fn.route = { method: m[1].toUpperCase(), path: m[2] }; break; }
      if ((m = l.match(/^@\w+\.route\(\s*['"]([^'"]*)['"](?:.*methods\s*=\s*\[\s*['"](\w+)['"])?/))) { fn.route = { method: (m[2] || 'GET').toUpperCase(), path: m[1] }; break; }
      if ((m = l.match(/^@(Get|Post|Put|Patch|Delete|Request)Mapping(?:\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']*)["'])?/))) { fn.route = { method: m[1] === 'Request' ? 'ANY' : m[1].toUpperCase(), path: m[2] || '/' }; break; }
      if ((m = l.match(/^\[Http(Get|Post|Put|Patch|Delete)(?:\(\s*"([^"]*)")?/))) { fn.route = { method: m[1].toUpperCase(), path: m[2] || '' }; break; }
      if ((m = l.match(/^@(Get|Post|Put|Patch|Delete)\(\s*(?:['"]([^'"]*)['"])?\s*\)/))) { fn.route = { method: m[1].toUpperCase(), path: m[2] || '' }; break; }
      if (!/^(@|\[|\/\/|#|\*|\/\*)/.test(l) && l) break;
    }
  }
}


// ── Expressions: source language -> ThunderLang ─────────────────────────────────────────────

const EXPR_TOKEN = /\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|===|!==|==|!=|>=|<=|&&|\|\||->|::|[<>!()?:,.]|\d+(?:\.\d+)?(?:f64|f32|[fFdDmMlL])?|[A-Za-z_$][\w$]*)/y;

function lex(text) {
  const out = [];
  EXPR_TOKEN.lastIndex = 0;
  let i = 0;
  const s = text.trim();
  while (i < s.length) {
    EXPR_TOKEN.lastIndex = i;
    const m = EXPR_TOKEN.exec(s);
    if (!m) return null;
    out.push(m[1]);
    i = EXPR_TOKEN.lastIndex;
    while (i < s.length && /\s/.test(s[i])) i++;
  }
  return out;
}

const unquote = (t) => t.slice(1, -1);

/** Convert a condition to ThunderLang, or return null with nothing guessed. */
export function toThunderCondition(text, inputs = []) {
  const toks = lex(text);
  if (!toks || !toks.length) return null;
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    let t = toks[i];
    const next = toks[i + 1];
    if (t === 'this' || t === 'self') { if (next === '.') i++; continue; }
    if (t === '&&' || t === 'and') { out.push('and'); continue; }
    if (t === '||' || t === 'or') { out.push('or'); continue; }
    if (t === '!' || t === 'not') { out.push('not'); continue; }
    if (t === '===' || t === '==') { out.push('=='); continue; }
    if (t === '!==' || t === '!=') { out.push('!='); continue; }
    if (['>', '<', '>=', '<=', '(', ')'].includes(t)) { out.push(t); continue; }
    if (t === 'True' || t === 'true') { out.push('true'); continue; }
    if (t === 'False' || t === 'false') { out.push('false'); continue; }
    if (/^["']/.test(t)) { out.push(JSON.stringify(unquote(t))); continue; }
    if (/^\d/.test(t)) { out.push(t.replace(/(f64|f32|[fFdDmMlL])$/, '')); continue; }
    if (/^[A-Za-z_$]/.test(t)) {
      // Java/C# equality helpers: a.equals(b), Objects.equals(a, b), string.Equals(a, b).
      if ((t === 'Objects' || t === 'string' || t === 'String') && next === '.' && /^(equals|Equals)$/.test(toks[i + 2] || '') && toks[i + 3] === '(') {
        const close = findClose(toks, i + 3);
        const args = splitArgs(toks.slice(i + 4, close));
        if (args.length !== 2) return null;
        const a = toThunderCondition(args[0].join(' '), inputs), b = toThunderCondition(args[1].join(' '), inputs);
        if (!a || !b) return null;
        out.push(`${a} == ${b}`);
        i = close;
        continue;
      }
      let path = t;
      while (toks[i + 1] === '.' && /^[A-Za-z_$]/.test(toks[i + 2] || '')) {
        if (/^(equals|Equals)$/.test(toks[i + 2]) && toks[i + 3] === '(') break;
        path += '.' + toks[i + 2];
        i += 2;
      }
      if (toks[i + 1] === '.' && /^(equals|Equals)$/.test(toks[i + 2] || '') && toks[i + 3] === '(') {
        const close = findClose(toks, i + 3);
        // Static two-argument forms: java.util.Objects.equals(a, b), System.String.Equals(a, b).
        if (/(^|\.)(Objects|String|string)$/.test(path)) {
          const args = splitArgs(toks.slice(i + 4, close));
          if (args.length !== 2) return null;
          const a = toThunderCondition(args[0].join(' '), inputs), b = toThunderCondition(args[1].join(' '), inputs);
          if (!a || !b) return null;
          out.push(`${a} == ${b}`);
          i = close;
          continue;
        }
        const arg = toThunderCondition(toks.slice(i + 4, close).join(' '), inputs);
        if (!arg) return null;
        out.push(`${path} == ${arg}`);
        i = close;
        continue;
      }
      // Rust/C++/C# enum paths: Plan::Enterprise -> Enterprise.
      while (toks[i + 1] === '::' && /^[A-Za-z_]/.test(toks[i + 2] || '')) { path = toks[i + 2]; i += 2; }
      // A call with no arguments reads like a field (user.isAdmin()); a call with arguments does not.
      if (toks[i + 1] === '(') {
        if (toks[i + 2] !== ')') return null;
        i += 2;
      }
      if (/^(null|nil|None|undefined)$/.test(path)) return null;
      out.push(path);
      continue;
    }
    return null;
  }
  const expr = out.join(' ').replace(/\( /g, '(').replace(/ \)/g, ')').replace(/not \(/g, 'not (');
  try { compileExpr(expr, { inputs }); } catch { return null; }
  return simplifyExpr(expr);
}

function findClose(toks, open) {
  let depth = 0;
  for (let i = open; i < toks.length; i++) {
    if (toks[i] === '(') depth++;
    else if (toks[i] === ')' && --depth === 0) return i;
  }
  return toks.length - 1;
}
function splitArgs(toks) {
  const args = [[]];
  let depth = 0;
  for (const t of toks) {
    if (t === '(') depth++;
    if (t === ')') depth--;
    if (t === ',' && depth === 0) args.push([]); else args[args.length - 1].push(t);
  }
  return args;
}

/** An answer a decision can return: a string, enum member, number, or boolean. Null otherwise. */
export function toThunderOutcome(text) {
  let s = String(text).trim().replace(/;$/, '').trim();
  s = s.replace(/^Ok\((.*)\)$/, '$1').replace(/\.(to_string|into|to_owned)\(\)$/, '').replace(/^String::from\((.*)\)$/, '$1').trim();
  // Absence is not an answer: None/null/nil/undefined are "returns nothing", handled as guards.
  if (/^(None|null|nil|undefined|Nothing)$/.test(s)) return null;
  let m;
  if ((m = s.match(/^"([^"\\]*)"$|^'([^'\\]*)'$|^`([^`$\\]*)`$/))) {
    const v = m[1] ?? m[2] ?? m[3];
    if (v === '') return null; // an empty string is not an answer a reader can act on
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(v) ? v : JSON.stringify(v);
  }
  if (/^-?\d+(\.\d+)?(f64|f32|[fFdDmMlL])?$/.test(s)) return s.replace(/(f64|f32|[fFdDmMlL])$/, '');
  if (/^(true|false|True|False)$/.test(s)) return s.toLowerCase();
  if ((m = s.match(/^(?:[A-Za-z_][\w]*(?:\.|::))+([A-Z][A-Za-z0-9_]*)$/))) return m[1];
  if (/^[A-Z][A-Za-z0-9_]*$/.test(s)) return s;
  return null;
}


// ── Guards: early exits inside any function ─────────────────────────────────────────────────
// Most real functions are not pure decisions, but they still enforce rules as early exits:
// "if the row is missing, fail with NotFound". A guard is an `if` with no else whose branch is a
// single terminating statement. Routine error passing (Go `if err != nil { return err }`) is noise
// to a reader and is skipped.

const lastSeg = (s) => String(s).split(/\.|::/).pop();
const firstString = (s) => (String(s).match(/^\s*(?:f|r|b)?["'`]([^"'`]{1,80})["'`]/) || [])[1] || null;

function splitTop(str, delim) {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"' || ch === '\'' || ch === '`') { const j = skipString(str, i); cur += str.slice(i, j + 1); i = j; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === delim && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** What a terminating statement does, or null when the statement does not end the function. */
export function terminatorEffect(stmt, language) {
  const s = String(stmt).trim().replace(/;$/, '').trim();
  let m;
  if ((m = s.match(/^throw\s+new\s+([\w.$]+)\s*\(([\s\S]*)\)$/))) return { kind: 'fails', name: lastSeg(m[1]), detail: firstString(m[2]) };
  if ((m = s.match(/^throw\s+([\w.$]+)$/))) return { kind: 'fails', name: lastSeg(m[1]) };
  if ((m = s.match(/^raise\s+([\w.]+)(?:\(([\s\S]*)\))?$/))) return { kind: 'fails', name: lastSeg(m[1]), detail: m[2] ? firstString(m[2]) : null };
  if ((m = s.match(/^panic!?\(([\s\S]*)\)$/))) return { kind: 'fails', name: 'panic', detail: firstString(m[1]) };
  if ((m = s.match(/^return\s+Err\(([\s\S]*)\)$/))) {
    const inner = m[1].trim();
    return { kind: 'fails', name: firstString(inner) ? 'error' : lastSeg(inner.replace(/\(.*$/s, '')), detail: firstString(inner) };
  }
  if (s === 'return') return { kind: 'stops' };
  if (!(m = s.match(/^return\s+([\s\S]+)$/))) return null;
  const v = m[1].trim();
  if (language === 'go') {
    const parts = splitTop(v, ',').map((x) => x.trim());
    const last = parts[parts.length - 1];
    if (last === 'err' || /^fmt\.Errorf\([^)]*%w/.test(last)) return { kind: 'passes-error' };
    if ((m = last.match(/^(?:errors\.New|fmt\.Errorf)\(\s*"([^"]*)"/))) return { kind: 'fails', name: 'error', detail: m[1] };
    if (/^Err[A-Z]\w*$/.test(last)) return { kind: 'fails', name: last };
    if (parts.length === 1 && last === 'nil') return { kind: 'nothing' };
  }
  if (/^(null|undefined|None|nil|void 0)$/.test(v)) return { kind: 'nothing' };
  if ((m = v.match(/(?:\b(?:status|Status|StatusCode|HttpStatus|sendStatus)|\.code)\s*\(\s*(\d{3})\s*\)/)) || (m = v.match(/^\{\s*status\s*:\s*(\d{3})\b/))) return { kind: 'responds', name: m[1] };
  if ((m = v.match(/^(BadRequest|Unauthorized|Forbid|Forbidden|NotFound|Conflict|UnprocessableEntity)\s*\(/))) return { kind: 'responds', name: m[1] };
  const fixed = toThunderOutcome(v);
  if (fixed) return { kind: 'returns', name: fixed };
  return { kind: 'returns-computed' };
}

function sayGuard(effect, condText) {
  const when = `if ${condText}`;
  switch (effect.kind) {
    case 'fails': return `Fails with ${effect.name}${effect.detail ? ` ("${effect.detail}")` : ''} ${when}.`;
    case 'responds': return `Responds ${effect.name} ${when}.`;
    case 'nothing': return `Stops early and returns nothing ${when}.`;
    case 'stops': return `Stops early ${when}.`;
    case 'returns': return `Returns ${effect.name} early ${when}.`;
    default: return `Returns early ${when}.`;
  }
}

/** Build a guard from a condition and a single terminating statement, or null (or 'skip' for noise). */
function makeGuard(cond, branch, language, inputs, line) {
  const stmts = splitTop(branch.trim().replace(/;\s*$/, ''), ';').map((x) => x.trim()).filter(Boolean);
  if (stmts.length !== 1 || /\n\s*\S[\s\S]*\n/.test(stmts[0]) && !/^(throw|raise|return)/.test(stmts[0])) return null;
  const effect = terminatorEffect(stmts[0], language);
  if (!effect) return null;
  if (effect.kind === 'passes-error') return 'skip';
  const when = toThunderCondition(cond, inputs);
  const code = cond.trim().replace(/\s+/g, ' ');
  return { when, code, effect, line, readable: !!when, says: sayGuard(effect, when ? sayCondition(when) : `\`${code}\``) };
}

/** Parse `if COND BRANCH [rest]` in a brace language: { cond, branch, remaining } or null. */
function splitIf(text, language) {
  let rest = text.replace(/^if\b\s*/, '');
  let cond, after;
  if (language === 'go' || language === 'rust' || rest[0] !== '(') {
    const b = findTopBrace(rest);
    if (b < 0) return null;
    cond = rest.slice(0, b).trim(); after = rest.slice(b);
  } else {
    const close = matchClose(rest, 0);
    if (close < 0) return null;
    cond = rest.slice(1, close); after = rest.slice(close + 1).trimStart();
  }
  let branch, remaining;
  if (after[0] === '{') {
    const bc = matchClose(after, 0);
    if (bc < 0) return null;
    branch = after.slice(1, bc).trim(); remaining = after.slice(bc + 1).trim();
  } else {
    const semi = topLevelIndex(after, ';');
    branch = (semi < 0 ? after : after.slice(0, semi)).trim(); remaining = semi < 0 ? '' : after.slice(semi + 1).trim();
  }
  return { cond: cond.trim(), branch, remaining };
}


// ── switch / match ──────────────────────────────────────────────────────────────────────────
// Each arm becomes a rule: `subject == value` (several values joined with or), a range, a C#
// relational pattern, or (Go's subject-less switch) the case's own condition; Rust/Python guards
// are added with and. The default arm (default, _, case _) becomes the fallback. Any arm whose
// body does more than give a fixed answer makes the whole switch "not read", never half-guessed.

/** One switch label or pattern as a ThunderLang condition, or null. */
function patternCondition(pattern, subject, inputs, language) {
  const p = pattern.trim();
  let m;
  if (subject == null) return toThunderCondition(p, inputs); // Go: switch { case cond: }
  if ((m = p.match(/^(-?\d+(?:\.\d+)?)\s*\.\.(=?)\s*(-?\d+(?:\.\d+)?)$/))) return `${subject} >= ${m[1]} and ${subject} ${m[2] ? '<=' : '<'} ${m[3]}`;
  if ((m = p.match(/^(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/))) return `${subject} ${m[1]} ${m[2]}`; // C# relational pattern
  if ((m = p.match(/^not\s+(.+)$/)) && language === 'csharp') { const v = toThunderOutcome(m[1]); return v ? `${subject} != ${/^[A-Za-z_]/.test(v) && !/^(true|false)$/.test(v) ? v : v}` : null; }
  const parts = splitTop(p.replace(/\s+or\s+/g, '|'), language === 'rust' || language === 'csharp' || language === 'python' ? '|' : ',').map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) {
    const each = parts.map((x) => patternCondition(x, subject, inputs, language));
    return each.every(Boolean) ? each.map((c) => (/\s(and|or)\s/.test(c) ? `(${c})` : c)).join(' or ') : null;
  }
  const v = valueLiteral(p);
  return v == null ? null : `${subject} == ${v}`;
}

/** A case label value as a ThunderLang literal: "text", 42, true, or an enum member name. */
function valueLiteral(text) {
  const s = text.trim();
  let m;
  if ((m = s.match(/^"([^"\\]*)"$|^'([^'\\]*)'$/))) return JSON.stringify(m[1] ?? m[2]);
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  if (/^(true|false|True|False)$/.test(s)) return s.toLowerCase();
  if ((m = s.match(/^(?:[A-Za-z_]\w*(?:\.|::))*([A-Za-z_]\w*)$/))) return m[1];
  return null;
}

/** Replace a pattern binding (Rust `n if n > 3`) with the subject inside its guard. */
const rebind = (guard, name, subject) => guard.replace(new RegExp(`\\b${name}\\b`, 'g'), subject);

/** The arms of a switch/match body: [{ pattern|null (default), guard, value, line }] or null. */
function switchArms(body, language, baseLine) {
  const arms = [];
  const lineOf = (idx) => baseLine + lineAt(body, idx) - 1;
  if (language === 'rust' || language === 'csharp-expr') {
    // pattern => value, separated by top-level commas (Rust arms may use blocks without commas).
    let i = 0;
    while (i < body.length) {
      while (i < body.length && /[\s,]/.test(body[i])) i++;
      if (i >= body.length) break;
      const arrow = body.indexOf('=>', i);
      if (arrow < 0) return null;
      const head = body.slice(i, arrow).trim();
      let j = arrow + 2;
      while (/\s/.test(body[j] || '')) j++;
      let value, end;
      if (body[j] === '{') { const c = matchClose(body, j); if (c < 0) return null; value = blockOnlyValue(body.slice(j + 1, c), language); end = c + 1; }
      else { const c = topLevelIndex(body, ',', j); end = c < 0 ? body.length : c; value = body.slice(j, end).trim(); }
      const g = head.match(/^(.*?)\s+(?:if|when)\s+(.+)$/s);
      arms.push({ pattern: (g ? g[1] : head).trim(), guard: g ? g[2].trim() : null, value, line: lineOf(i) });
      i = end + 1;
    }
    return arms;
  }
  // C-family: case LABELS: / case LABELS -> / default: / default ->
  const starts = [];
  const re = /(^|[\s;{}:])(case\b|default\b)/g;
  let m;
  while ((m = re.exec(body))) {
    const at = m.index + m[1].length;
    if (depthAt(body, at) === 0) starts.push(at);
  }
  let pending = [];
  for (let k = 0; k < starts.length; k++) {
    const clause = body.slice(starts[k], starts[k + 1] ?? body.length).trim();
    const isDefault = clause.startsWith('default');
    const afterKw = clause.replace(/^(case|default)\b/, '');
    const arrowAt = topLevelIndex(afterKw, '-') >= 0 && /->/.test(afterKw) ? afterKw.indexOf('->') : -1;
    const colonAt = topLevelIndex(afterKw, ':');
    const useArrow = arrowAt >= 0 && (colonAt < 0 || arrowAt < colonAt);
    const cut = useArrow ? arrowAt : colonAt;
    if (cut < 0) return null;
    const label = afterKw.slice(0, cut).trim();
    let rest = afterKw.slice(cut + (useArrow ? 2 : 1)).trim();
    const g = label.match(/^(.*?)\s+when\s+(.+)$/s);
    const pattern = isDefault ? null : (g ? g[1] : label);
    if (!useArrow && !rest) { pending.push(pattern); continue; } // C fall-through: case A: case B: return X;
    let value;
    if (rest.startsWith('{')) value = blockOnlyValue(rest.slice(1, matchClose(rest, 0)), language);
    else {
      rest = rest.replace(/;?\s*break\s*;?\s*$/, '').replace(/;\s*$/, '').trim();
      value = useArrow ? rest : (rest.match(/^return\s+([\s\S]+)$/) || [])[1] ?? null;
      if (value && /;/.test(value)) value = null; // more than one statement
    }
    const patterns = [...pending, pattern];
    pending = [];
    if (patterns.includes(null)) arms.push({ pattern: null, guard: null, value, line: lineOf(starts[k]) });
    else arms.push({ pattern: patterns.join(language === 'go' && patterns.length === 1 ? '' : ', ') || patterns[0], guard: g ? g[2].trim() : null, value, line: lineOf(starts[k]) });
  }
  return arms;
}

function depthAt(s, idx) {
  let d = 0;
  for (let i = 0; i < idx; i++) {
    const c = s[i];
    if (c === '"' || c === '\'' || c === '`') { i = skipString(s, i); continue; }
    if ('({['.includes(c)) d++; else if (')}]'.includes(c)) d--;
  }
  return d;
}

/** The single answer a block gives: `{ return X; }` or a Rust tail value. */
function blockOnlyValue(inner, language) {
  const t = inner.trim().replace(/;\s*$/, '');
  if (/;/.test(t)) return null;
  const m = t.match(/^return\s+([\s\S]+)$/);
  if (m) return m[1].trim();
  return language === 'rust' || language === 'csharp-expr' ? t : null;
}

/**
 * Read a switch/match statement or expression. `text` is `switch (x) {...}`, `switch x {...}`,
 * `match x {...}`, or C# `x switch {...}`. Returns { rules, otherwise } or { unread } or null.
 */
function readSwitch(text, language, inputs, line) {
  let subjectText, body, kind = language;
  let m;
  const t = text.trim();
  if ((m = t.match(/^switch\s*\(([\s\S]*?)\)\s*\{/)) && language !== 'go' && language !== 'rust') {
    const open = t.indexOf('{', m[0].length - 1); subjectText = m[1]; body = t.slice(open + 1, matchClose(t, open));
  } else if (language === 'go' && (m = t.match(/^switch\b([^{]*)\{/))) {
    const open = t.indexOf('{'); subjectText = m[1].trim() || null; body = t.slice(open + 1, matchClose(t, open));
  } else if (language === 'rust' && (m = t.match(/^match\s+([^{]+?)\s*\{/))) {
    const open = t.indexOf('{', m[0].length - 1); subjectText = m[1]; body = t.slice(open + 1, matchClose(t, open));
  } else if (language === 'csharp' && (m = t.match(/^([\w.]+)\s+switch\s*\{/))) {
    const open = t.indexOf('{'); subjectText = m[1]; body = t.slice(open + 1, matchClose(t, open)); kind = 'csharp-expr';
  } else return null;
  if (body == null) return null;
  const subject = subjectText == null ? null : toThunderCondition(subjectText, inputs);
  if (subjectText != null && (!subject || /\s/.test(subject))) return { unread: [{ line, text: t.split('\n')[0].slice(0, 120), reason: 'This switch compares something other than an input or field.' }] };
  const arms = switchArms(body, kind, line);
  if (!arms || !arms.length) return { unread: [{ line, text: t.split('\n')[0].slice(0, 120), reason: 'This switch has a shape the reader does not recognize yet.' }] };
  const rules = [];
  let otherwise = null;
  for (const a of arms) {
    const result = a.value == null ? null : toThunderOutcome(a.value);
    if (!result) return { unread: [{ line: a.line, text: (a.pattern ?? 'default') + ' => ' + String(a.value ?? '...').slice(0, 60), reason: 'This case does more than give a fixed answer, so the switch is not shown as rules.' }] };
    const isDefault = a.pattern == null || a.pattern === '_' || (language === 'rust' && /^[a-z_]\w*$/.test(a.pattern) && !a.guard && !inputs.includes(a.pattern));
    if (isDefault && !a.guard) { otherwise = { result, line: a.line }; break; }
    let when = isDefault ? null : patternCondition(a.pattern, subject, inputs, language);
    if (a.guard) {
      const binding = (a.pattern || '').match(/^([a-z_]\w*)$/);
      const g = toThunderCondition(binding && subject ? rebind(a.guard, binding[1], subject) : a.guard, inputs);
      if (!g) return { unread: [{ line: a.line, text: `${a.pattern} if ${a.guard}`, reason: 'This case guard uses something besides comparisons and and/or/not.' }] };
      when = when && !binding ? `(${when}) and (${g})` : g;
    }
    if (!when) return { unread: [{ line: a.line, text: String(a.pattern).slice(0, 80), reason: 'This case pattern is not a value, range, or comparison the reader recognizes.' }] };
    try { compileExpr(when, { inputs }); } catch { return { unread: [{ line: a.line, text: String(a.pattern), reason: 'This case pattern could not be read as a condition.' }] }; }
    rules.push({ when: simplifyExpr(when), result, line: a.line });
  }
  return { rules, otherwise };
}

// ── Statement readers ───────────────────────────────────────────────────────────────────────

/** Split a brace-language body into top-level statements with their source line numbers. */
function splitStatements(body, baseLine) {
  const src = stripCommentsKeepLayout(body);
  const out = [];
  let i = 0;
  while (i < src.length) {
    while (i < src.length && /[\s;]/.test(src[i])) i++;
    if (i >= src.length) break;
    const start = i;
    let depth = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '"' || c === '\'' || c === '`') { i = skipString(src, i); continue; }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === '{') {
        const close = matchClose(src, i);
        if (close < 0) { i = src.length; break; }
        i = close;
        if (depth === 0) {
          // An if/else chain continues past a closing brace.
          const rest = src.slice(i + 1).match(/^\s*else\b/);
          if (!rest) { i++; break; }
        }
      } else if (c === ';' && depth === 0) { i++; break; }
    }
    const text = src.slice(start, i).trim();
    if (text) out.push({ text, line: baseLine + lineAt(src, start) - 1 });
  }
  return out;
}
const stripCommentsKeepLayout = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Read `if ... else ...` / `return ...` statements into rules. Returns { rules, otherwise, unread }. */
function readBraceStatements(stmts, language, inputs) {
  const rules = [], unread = [], guards = [];
  let otherwise = null;
  const take = (cond, outcomeText, line) => {
    const when = cond == null ? null : toThunderCondition(cond, inputs);
    const result = toThunderOutcome(outcomeText);
    if (cond != null && !when) { unread.push({ line, text: `if ${cond}`, reason: 'This condition uses something besides comparisons and and/or/not.' }); return false; }
    if (!result) { unread.push({ line, text: outcomeText.trim(), reason: 'This answer is computed, not a fixed value.' }); return false; }
    if (when == null) otherwise = { result, line }; else rules.push({ when, result, line });
    return true;
  };
  const blockValue = (block) => {
    // A block that only returns (or, in Rust/Go tail position, yields) one value.
    const inner = block.trim().replace(/^\{|\}$/g, '').trim();
    const m = inner.match(/^return\s+([\s\S]+?);?$/) || (language === 'rust' && !/;/.test(inner) ? [null, inner] : null);
    return m && !/\n\s*\S/.test(m[1].trim()) ? m[1].trim() : null;
  };
  for (const st of stmts) {
    const t = st.text;
    if (/^if\b/.test(t)) {
      // A guard: an `if` with no else whose branch exits without a fixed answer.
      const head = splitIf(t, language);
      if (head && !/^else\b/.test(head.remaining)) {
        const single = head.branch.replace(/^return\s+/, '').replace(/;\s*$/, '');
        // Error values (ErrNotFound, NotFoundError, BadRequestException) are failures, not answers.
        const looksLikeError = /^(Err[A-Z]\w*|\w*(Error|Exception))$/.test(lastSeg(single));
        const isFixedReturn = /^return\s/.test(head.branch) && toThunderOutcome(single) && !looksLikeError && (language !== 'go' || !single.includes(','));
        if (!isFixedReturn) {
          const g = makeGuard(head.cond, head.branch, language, inputs, st.line);
          if (g === 'skip') continue;
          if (g) { guards.push(g); continue; }
        }
      }
      // Walk the chain: if C B (else if C B)* (else B)?
      let rest = t;
      let ok = true;
      while (rest) {
        const head = rest.match(/^(?:else\s+)?if\b\s*/);
        if (!head) break;
        rest = rest.slice(head[0].length);
        let cond, after;
        if (rest[0] === '(' && (language !== 'go' && language !== 'rust' || true)) {
          const close = matchClose(rest, 0);
          const tail = rest.slice(close + 1).trimStart();
          if (language === 'go' || language === 'rust') {
            // Go/Rust may wrap only part of the condition in parentheses: if (a) && b {
            const brace = findTopBrace(rest);
            cond = rest.slice(0, brace).trim(); after = rest.slice(brace);
          } else { cond = rest.slice(1, close); after = tail; }
        } else {
          const brace = findTopBrace(rest);
          if (brace < 0) { ok = false; break; }
          cond = rest.slice(0, brace).trim(); after = rest.slice(brace);
        }
        let value, remaining;
        if (after[0] === '{') {
          const bc = matchClose(after, 0);
          value = blockValue(after.slice(0, bc + 1));
          remaining = after.slice(bc + 1).trim();
        } else {
          const semi = after.indexOf(';');
          const single = (semi < 0 ? after : after.slice(0, semi)).trim();
          value = single.startsWith('return ') ? single.slice(7) : null;
          remaining = (semi < 0 ? '' : after.slice(semi + 1)).trim();
        }
        if (value == null) { unread.push({ line: st.line, text: `if ${cond.trim()}`, reason: 'This branch does more than choose an answer.' }); ok = false; break; }
        if (!take(cond, value, st.line)) { ok = false; break; }
        if (/^else\s+if\b/.test(remaining)) { rest = remaining; continue; }
        if (/^else\b/.test(remaining)) {
          const elseBody = remaining.replace(/^else\s*/, '');
          const v = elseBody.startsWith('{') ? blockValue(elseBody) : (elseBody.startsWith('return ') ? elseBody.slice(7).replace(/;$/, '') : null);
          if (v == null) { unread.push({ line: st.line, text: 'else', reason: 'The fallback branch does more than choose an answer.' }); ok = false; }
          else take(null, v, st.line);
        }
        rest = '';
      }
      if (!ok) continue;
      continue;
    }
    // switch / match, as a statement or as the returned value.
    {
      const isLast = st === stmts[stmts.length - 1];
      const val = (t.match(/^return\s+([\s\S]+?);?$/) || [])[1];
      const candidate = /^(switch|match)\b/.test(t) ? t : val && /^(switch\b|match\b|[\w.]+\s+switch\s*\{)/.test(val) ? val : null;
      const sw = candidate && (candidate === t ? !(language === 'rust' && !isLast && /^match/.test(t) && false) : true) ? readSwitch(candidate, language, inputs, st.line) : null;
      if (sw) {
        if (sw.unread) { unread.push(...sw.unread); continue; }
        rules.push(...sw.rules);
        if (sw.otherwise) otherwise = sw.otherwise;
        continue;
      }
    }
    const ret = t.match(/^return\s+([\s\S]+?);?$/) || (language === 'rust' && st === stmts[stmts.length - 1] && !/;\s*$/.test(t) ? [null, t] : null);
    if (ret) {
      if (readTernary(ret[1], inputs, rules, unread, st.line, (o) => { otherwise = o; })) continue;
      take(null, ret[1], st.line);
      continue;
    }
    unread.push({ line: st.line, text: t.split('\n')[0].slice(0, 120), reason: 'This statement does work besides choosing an answer.' });
  }
  return { rules, otherwise, unread, guards };
}

function findTopBrace(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === '\'') { i = skipString(s, i); continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === '{' && depth === 0) return i;
  }
  return -1;
}

/** `cond ? A : (cond2 ? B : C)` -> rules. Returns false when the text is not a ternary chain. */
function readTernary(text, inputs, rules, unread, line, setOtherwise) {
  let s = text.trim().replace(/;$/, '');
  if (!/\?/.test(s)) return false;
  const local = [];
  while (true) {
    while (s.startsWith('(') && matchClose(s, 0) === s.length - 1) s = s.slice(1, -1).trim();
    const q = topLevelIndex(s, '?');
    if (q < 0) break;
    const c = topLevelIndex(s, ':', q + 1);
    if (c < 0) return false;
    const when = toThunderCondition(s.slice(0, q), inputs);
    const result = toThunderOutcome(s.slice(q + 1, c));
    if (!when || !result) { unread.push({ line, text: s.slice(0, 120), reason: 'This choice uses a condition or answer that is not a fixed value.' }); return true; }
    local.push({ when, result, line });
    s = s.slice(c + 1).trim();
  }
  const fallback = toThunderOutcome(s);
  if (!fallback) { unread.push({ line, text: s.slice(0, 120), reason: 'The fallback answer is computed, not a fixed value.' }); return true; }
  rules.push(...local);
  setOtherwise({ result: fallback, line });
  return true;
}
function topLevelIndex(s, ch, from = 0) {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === '\'') { i = skipString(s, i); continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ':' && s[i + 1] === ':') { i++; continue; }
    else if (c === ch && depth === 0) return i;
  }
  return -1;
}

function readPythonBody(body, inputs) {
  const rules = [], unread = [], guards = [];
  let otherwise = null;
  const base = body[0]?.indent ?? 0;
  for (let i = 0; i < body.length; i++) {
    const { text, line, indent } = body[i];
    if (indent !== base) continue;
    let m;
    if ((m = text.match(/^match\s+(.+?):\s*$/))) {
      const subject = toThunderCondition(m[1], inputs);
      const block = [];
      for (let k = i + 1; k < body.length && body[k].indent > base; k++) block.push(body[k]);
      i += block.length;
      const caseIndent = block[0]?.indent;
      const arms = [];
      for (let k = 0; k < block.length; k++) {
        const c = block[k];
        if (c.indent !== caseIndent) continue;
        const cm = c.text.match(/^case\s+(.+?)(?:\s+if\s+(.+?))?:\s*(.*)$/);
        if (!cm) { arms.length = 0; break; }
        const inner = block.slice(k + 1).filter((x, n, arr) => x.indent > caseIndent && arr.slice(0, n).every((y) => y.indent > caseIndent));
        const valueLine = cm[3].trim() || (inner.length === 1 ? inner[0].text : '');
        const r = valueLine.match(/^return\s+(.+)$/);
        arms.push({ pattern: cm[1].trim(), guard: cm[2]?.trim() || null, value: r ? r[1] : null, line: c.line });
      }
      let ok = !!subject && !/\s/.test(subject) && arms.length > 0;
      const local = [];
      let fallback = null;
      for (const a of ok ? arms : []) {
        const result = a.value == null ? null : toThunderOutcome(a.value);
        if (!result) { ok = false; break; }
        if (a.pattern === '_' && !a.guard) { fallback = { result, line: a.line }; break; }
        const binding = a.pattern.match(/^([a-z_]\w*)$/) && a.pattern !== '_' ? a.pattern : null;
        let when = a.pattern === '_' || binding ? null : patternCondition(a.pattern, subject, inputs, 'python');
        if (a.guard) {
          const g = toThunderCondition(binding ? rebind(a.guard, binding, subject) : a.guard, inputs);
          if (!g) { ok = false; break; }
          when = when ? `(${when}) and (${g})` : g;
        }
        if (!when) { ok = false; break; }
        local.push({ when: simplifyExpr(when), result, line: a.line });
      }
      if (!ok) { unread.push({ line, text: text.slice(0, 120), reason: 'This match has a case that does more than give a fixed answer.' }); continue; }
      rules.push(...local);
      if (fallback) otherwise = fallback;
      continue;
    }
    if ((m = text.match(/^(?:if|elif)\s+(.+?):\s*(.*)$/))) {
      const inline = m[2].trim();
      const next = body[i + 1];
      const valueText = inline ? inline : next && next.indent > base ? next.text : '';
      const deeper = body.slice(i + 1).filter((b, k, arr) => b.indent > base && arr.slice(0, k).every((x) => x.indent > base));
      const r = valueText.match(/^return\s+(.+)$/);
      if (/^if\s/.test(text) && (inline || deeper.length === 1) && !body.slice(i + 1).find((b) => b.indent === base && /^(elif|else)\b/.test(b.text) && b.line > line && body.slice(i + 1, body.indexOf(b)).every((x) => x.indent > base)) && !(r && toThunderOutcome(r[1]))) {
        const g = makeGuard(m[1], valueText, 'python', inputs, line);
        if (g && g !== 'skip') { guards.push(g); continue; }
      }
      if (!r || (!inline && deeper.length > 1)) { unread.push({ line, text: text.slice(0, 120), reason: 'This branch does more than choose an answer.' }); continue; }
      const when = toThunderCondition(m[1], inputs), result = toThunderOutcome(r[1]);
      if (!when) { unread.push({ line, text: `if ${m[1]}`, reason: 'This condition uses something besides comparisons and and/or/not.' }); continue; }
      if (!result) { unread.push({ line, text: r[1], reason: 'This answer is computed, not a fixed value.' }); continue; }
      rules.push({ when, result, line });
      continue;
    }
    if ((m = text.match(/^else:\s*(.*)$/))) {
      const v = (m[1].trim() || body[i + 1]?.text || '').match(/^return\s+(.+)$/);
      const result = v && toThunderOutcome(v[1]);
      if (result) otherwise = { result, line }; else unread.push({ line, text: 'else', reason: 'The fallback branch does more than choose an answer.' });
      continue;
    }
    if ((m = text.match(/^return\s+(.+)$/))) {
      const tern = m[1].match(/^(.+?)\s+if\s+(.+?)\s+else\s+(.+)$/);
      if (tern) {
        const when = toThunderCondition(tern[2], inputs), a = toThunderOutcome(tern[1]), b = toThunderOutcome(tern[3]);
        if (when && a && b) { rules.push({ when, result: a, line }); otherwise = { result: b, line }; }
        else unread.push({ line, text: m[1].slice(0, 120), reason: 'This choice uses a condition or answer that is not a fixed value.' });
        continue;
      }
      const result = toThunderOutcome(m[1]);
      if (result) otherwise = { result, line }; else unread.push({ line, text: m[1].slice(0, 120), reason: 'This answer is computed, not a fixed value.' });
      continue;
    }
    if (/^("""|''')/.test(text)) continue;
    unread.push({ line, text: text.slice(0, 120), reason: 'This statement does work besides choosing an answer.' });
  }
  return { rules, otherwise, unread, guards };
}

// ── Plain English ───────────────────────────────────────────────────────────────────────────

const OP_WORDS = { '>=': 'is at least', '>': 'is more than', '<=': 'is at most', '<': 'is less than', '==': 'is', '!=': 'is not' };

/** Read a ThunderLang condition aloud: `amount <= 100 and withinWindow` -> "amount is at most 100 and withinWindow". */
export function sayCondition(cond) {
  return cond
    .replace(/\s*(>=|<=|==|!=|>|<)\s*/g, (_, op) => ` ${OP_WORDS[op]} `)
    .replace(/\bnot\s+/g, 'not ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sayDecision(rules, otherwise) {
  const parts = rules.map((r, i) => `${i === 0 ? 'If' : 'Otherwise, if'} ${sayCondition(r.when)}, the answer is ${r.result}.`);
  if (otherwise) parts.push(rules.length ? `Otherwise, the answer is ${otherwise.result}.` : `The answer is always ${otherwise.result}.`);
  return parts.join(' ');
}

function decisionSource(name, inputs, rules, otherwise) {
  const L = [`decision ${name}`, '  inputs'];
  for (const p of inputs) L.push(`    ${p.name}${['number', 'boolean', 'string'].includes(p.type) ? `: ${p.type}` : ''}`);
  rules.forEach((r, i) => L.push(`  rule rule_${i + 1}`, `    when ${r.when}`, `    return ${r.result}`));
  if (otherwise) L.push('  default', `    return ${otherwise.result}`);
  return L.join('\n');
}

// ── The reading ─────────────────────────────────────────────────────────────────────────────

/**
 * Read source code into a searchable list of items: each function, the decision rules it makes
 * (as ThunderLang and plain English), the errors it raises, and the tests that exist.
 */
export function readCode(source, { language, file = '' } = {}) {
  const src = String(source ?? '');
  if (src.length > 400000) throw new Error('Source is larger than 400 KB. Read one file or module at a time.');
  const lang = String(language || detectLanguage(src, file)).toLowerCase().replace(/^ts$/, 'typescript').replace(/^js$/, 'javascript').replace(/^py$/, 'python').replace(/^(cs|c#)$/, 'csharp').replace(/^rs$/, 'rust').replace(/^golang$/, 'go');
  if (!READ_LANGUAGES.includes(lang)) throw new Error(`Reading rules supports ${READ_LANGUAGES.join(', ')}. Got "${lang}".`);
  READING_RUST = lang === 'rust';
  const items = [];
  for (const fn of findFunctions(src, lang)) {
    const inputs = fn.params;
    const names = inputs.map((p) => p.name);
    const read = lang === 'python'
      ? readPythonBody(fn.pyBody, names)
      : readBraceStatements(splitStatements(fn.body, lineAt(src, fn.bodyStart)), lang, names);
    const isDecision = read.rules.length > 0 && !!read.otherwise;
    const guards = read.guards || [];
    // In a function that is not a pure decision, early fixed returns are still rules worth reading.
    if (!isDecision) {
      for (const r of read.rules) guards.push({ when: r.when, code: r.when, effect: { kind: 'returns', name: r.result }, line: r.line, readable: true, says: sayGuard({ kind: 'returns', name: r.result }, sayCondition(r.when)) });
      guards.sort((a, b) => a.line - b.line);
    }
    const guardNote = guards.length ? ` It checks ${guards.length} condition${guards.length === 1 ? '' : 's'} first: ${guards.map((g) => g.says.replace(/\.$/, '')).join('; ')}.` : '';
    const base = {
      id: `${fn.name}:${fn.line}`, name: fn.name, line: fn.line, inputs, returns: simpleType(fn.returns),
      ...(fn.route ? { route: fn.route } : {}),
      provenance: 'inferred-from-code',
    };
    if (isDecision) {
      items.push({
        ...base, kind: 'decision', status: read.unread.length ? 'partial' : 'read',
        rules: read.rules.map((r) => ({ ...r, says: sayCondition(r.when) })), otherwise: read.otherwise,
        says: (fn.route ? `Handles ${fn.route.method} ${fn.route.path}. ` : '') + sayDecision(read.rules, read.otherwise) + guardNote, guards,
        thunder: decisionSource(fn.name, inputs, read.rules, read.otherwise),
        unread: read.unread,
      });
    } else {
      items.push({
        ...base, kind: 'function', status: 'signature-only',
        says: fn.route ? `Handles ${fn.route.method} ${fn.route.path || '(this controller\'s path)'}.${guardNote}` : `${fn.name} takes ${inputs.length ? inputs.map((p) => p.type && !/[<>\[\]]/.test(p.type) ? `${p.name} (${p.type})` : p.name).join(', ') : 'no inputs'}${fn.returns ? ` and returns ${simpleType(fn.returns)}` : ''}. ${guards.length ? '' : ' Its body does more than choose between fixed answers, so no rules are shown.'}${guardNote}`,
        guards, unread: read.unread,
      });
    }
  }
  // Errors and tests come from the existing lift adapters (signature-level facts).
  const facts = extractFacts(src, lang, file || undefined);
  for (const e of facts?.errors || []) items.push({ id: `error:${e.name}:${e.line}`, kind: 'error', name: e.name, line: e.line, status: 'read', says: /\s/.test(e.name) ? `Can fail with the error "${e.name}".` : `Raises ${e.name}.`, provenance: 'inferred-from-code' });
  for (const t of facts?.tests || []) items.push({ id: `test:${t.name}:${t.line}`, kind: 'test', name: t.name, line: t.line, status: 'read', says: `A test named "${t.name}".`, provenance: 'inferred-from-code' });
  items.sort((a, b) => a.line - b.line);
  const counts = { decision: 0, function: 0, error: 0, test: 0, partial: 0, guarded: 0, route: 0 };
  for (const it of items) { counts[it.kind]++; if (it.status === 'partial') counts.partial++; if (it.guards?.length) counts.guarded++; if (it.route) counts.route++; }
  return {
    schema: READ_SCHEMA, language: lang, detected: !language, items, counts,
    limitations: [
      'Inferred from code by pattern, not by running it. Confirm a reading before relying on it.',
      'Rules are shown only for functions that choose between fixed answers; other logic is listed as not read.',
    ],
  };
}

/** Filter a reading by free text and facets. Text matches names, inputs, conditions, answers, and plain-English text. */
export function searchReading(reading, { query = '', kinds = [], status = [] } = {}) {
  const q = String(query).trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  return reading.items.filter((it) => {
    if (kinds.length && !kinds.includes(it.kind) && !(kinds.includes('guard') && it.guards?.length) && !(kinds.includes('route') && it.route)) return false;
    if (status.length && !status.includes(it.status)) return false;
    if (!terms.length) return true;
    const hay = [it.name, it.route && `${it.route.method} ${it.route.path}`, it.says, it.thunder, ...(it.guards || []).flatMap((g) => [g.code, g.effect.name, g.says]), ...(it.inputs || []).map((p) => `${p.name} ${p.type ?? ''}`), ...(it.rules || []).flatMap((r) => [r.when, r.result, r.says]), it.otherwise?.result]
      .filter(Boolean).join(' ').toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
