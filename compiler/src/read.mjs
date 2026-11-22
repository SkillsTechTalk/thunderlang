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
import { stepsFrom, braceStatements, indentStatements } from './steps.mjs';
import { compileExpr, simplifyExpr } from './expr.mjs';
import { extractFacts, languageForFile } from './lift.mjs';

export const READ_SCHEMA = 'thunder-reading-v1';
export const READ_LANGUAGES = ['typescript', 'javascript', 'python', 'go', 'rust', 'csharp', 'java', 'kotlin', 'php', 'ruby'];
const BRACE_LANGS = new Set(['typescript', 'javascript', 'go', 'rust', 'csharp', 'java', 'kotlin', 'php']);
const KEYWORDS_NOT_FN = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'else', 'using', 'lock', 'foreach', 'match', 'loop', 'sizeof', 'typeof', 'nameof']);

/** Best-effort language guess for pasted code (a file name, when known, is more reliable). */
export function detectLanguage(source, file = '') {
  if (file) return languageForFile(file);
  const s = String(source);
  if (/^\s*<\?php\b/.test(s) || /\bfunction\s+\w+\s*\([^)]*\$\w+/.test(s)) return 'php';
  if (/\bfun\s+(<[^>]*>\s*)?[\w.]*\w+\s*\(/.test(s)) return 'kotlin';
  if (/^\s*def\s+[\w.?!]+(\s*\(.*\))?\s*$/m.test(s) && /^\s*end\s*$/m.test(s)) return 'ruby';
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
    if (language === 'ruby') {
      if (/^&/.test(p)) continue; // a block argument
      out.push({ name: p.replace(/^\*+/, '').replace(/:.*$/, '').trim(), type: null });
      continue;
    }
    let name = p, type = null, m;
    if (language === 'go') {
      m = p.match(/^(\w+)\s+(.+)$/);
      if (!m) { pendingGo.push(p); continue; }
      [, name, type] = m;
      for (const g of pendingGo) out.push({ name: g, type: simpleType(type) });
      pendingGo = [];
    } else if (language === 'java' || language === 'csharp' || language === 'php') {
      m = p.replace(/^(final|ref|in|out|params|public|private|protected|readonly)\s+/g, '').replace(/^(public|private|protected|readonly)\s+/g, '').match(/^(.+?)\s+&?(?:\.\.\.)?(\w+)$/);
      if (m) [, type, name] = m;
    } else if ((m = p.match(/^(\w+)\??\s*:\s*(.+)$/))) {
      [, name, type] = m;
    }
    out.push({ name: name.replace(/^(mut|val|var|vararg)\s+/, '').replace(/^[&$]+/, ''), type: simpleType(type ? type.replace(/^\?/, '') : type) });
  }
  for (const g of pendingGo) out.push({ name: g, type: null });
  return out;
}

function simpleType(t) {
  if (!t) return null;
  const s = String(t).trim().replace(/^&(mut\s+)?/, '');
  if (/^(number|int|long|short|float|double|decimal|f32|f64|i\d+|u\d+|usize|isize|float64|float32|int\d*|uint\d*|Integer|Double|Long|BigDecimal|Int|Float|Short|Byte)$/.test(s)) return 'number';
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
  if (language === 'ruby') return findRubyFunctions(src);
  const patterns = {
    typescript: [
      /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*(?:<[^>]*>)?\s*\(/g,
      /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:<[^>]*>)?\(/g,
      /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+|readonly\s+)*(\w+)\s*(?:<[^>]*>)?\s*\(/gm,
    ],
    go: [/func\s+(?:\([^)]*\)\s*)?(\w+)\s*(?:\[[^\]]*\])?\s*\(/g],
    rust: [/(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g],
    java: [/(?:(?:public|private|protected|static|final|synchronized|abstract)\s+)*(?:<[^>]+>\s+)?[\w.<>\[\],?\s]+?\s+(\w+)\s*\(/g],
    kotlin: [/\bfun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(\w+)\s*\(/g],
    php: [/\bfunction\s+&?(\w+)\s*\(/g],
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
      const head = language === 'kotlin'
        ? after.match(/^\s*(?::\s*([^{=]+?))?()()\s*(?:where\s+[^{=]+)?(=(?![=>])|\{)/)
        : after.match(/^\s*(?::\s*([^{=;]+?)|->\s*([^{;]+?)|\s+(\([^)]*\)|[\w.<>\[\]*&' ]+?))?\s*(?:throws\s+[\w.,\s]+)?\s*(=>|\{|;)/);
      if (!head || head[4] === ';') continue;
      if (language === 'kotlin' && head[4] === '=') {
        // Kotlin expression body: fun f(x: Int) = when (x) { ... } / = if (...) "A" else "B" / = "A"
        const markerAt = close + 1 + head[0].length - 1;
        const fnLine = lineAt(src, m.index + m[0].lastIndexOf(name));
        if (seen.has(name + ':' + fnLine)) continue;
        seen.add(name + ':' + fnLine);
        const rest = src.slice(markerAt + 1);
        const lead = rest.match(/^\s*/)[0].length;
        const end = kotlinExprEnd(rest, lead);
        fns.push({ key: `${name}@${m.index}`, name, line: fnLine, params: parseParams(src.slice(open + 1, close), language), returns: (head[1] || '').trim() || null, bodyStart: markerAt + 1 + lead, body: `return ${rest.slice(lead, end).trim()}` });
        continue;
      }
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
  if (language === 'kotlin') {
    // Ktor: get("/x") { ... } inside routing { }
    const re = /\b(get|post|put|patch|delete)\(\s*"([^"]+)"\s*\)\s*\{/g;
    let m;
    while ((m = re.exec(src))) {
      const brace = m.index + m[0].length - 1;
      const bc = matchClose(src, brace);
      if (bc < 0) continue;
      fns.push({ name: `${m[1].toUpperCase()} ${m[2]}`, line: lineAt(src, m.index), params: [], returns: null, bodyStart: brace + 1, body: src.slice(brace + 1, bc), route: { method: m[1].toUpperCase(), path: m[2] } });
    }
  }
  const routeRes = language === 'php'
    ? [/\bRoute::(get|post|put|patch|delete|any)\(\s*['"]([^'"]+)['"]\s*,\s*(?:static\s+)?function\s*\(/g]
    : language === 'go'
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
      if ((m = l.match(/^#\[Route\(\s*(?:path:\s*)?['"]([^'"]*)['"](?:.*methods:\s*\[\s*['"](\w+)['"])?/))) { fn.route = { method: (m[2] || 'ANY').toUpperCase(), path: m[1] }; break; }
      if ((m = l.match(/^\[Http(Get|Post|Put|Patch|Delete)(?:\(\s*"([^"]*)")?/))) { fn.route = { method: m[1].toUpperCase(), path: m[2] || '' }; break; }
      if ((m = l.match(/^@(Get|Post|Put|Patch|Delete)\(\s*(?:['"]([^'"]*)['"])?\s*\)/))) { fn.route = { method: m[1].toUpperCase(), path: m[2] || '' }; break; }
      if (!/^(@|\[|\/\/|#|\*|\/\*)/.test(l) && l) break;
    }
  }
}


// ── Kotlin and PHP: small source normalizations so the brace-language reader applies ────────

const KT_CONTINUES_NEXT = /^\s*(\.|\?\.|\?:|&&|\|\||[+\-*/%]|else\b(?!\s*->)|->|\)|\]|:)/;
const KT_CONTINUES_LINE = /(&&|\|\||[=+\-*/%(,.:[]|->|\belse|\bif\s*\([^)]*\))\s*$/;

/** Where a Kotlin expression body (after `=`) ends: the first line break at depth 0 that is not a continuation. */
function kotlinExprEnd(src, from) {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === '\'') { i = skipString(src, i); continue; }
    if (c === '/' && src[i + 1] === '/') { const n = src.indexOf('\n', i); if (n < 0) return src.length; i = n - 1; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (--depth < 0) return i; }
    else if (c === '\n' && depth === 0) {
      const line = src.slice(src.lastIndexOf('\n', i - 1) + 1, i);
      const next = src.slice(i + 1);
      if (/^\s*\n/.test(next) || !next.trim()) return i;
      if (!KT_CONTINUES_LINE.test(line) && !KT_CONTINUES_NEXT.test(next)) return i;
    }
  }
  return src.length;
}

/** Kotlin has no semicolons: end each top-level statement of a body with one so it splits like Java. */
function kotlinTerminate(body) {
  const src = stripCommentsKeepLayout(body);
  let out = '', depth = 0, last = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === '\'') { i = skipString(src, i); continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === '\n' && depth === 0) {
      const line = src.slice(src.lastIndexOf('\n', i - 1) + 1, i);
      const next = src.slice(i + 1);
      if (line.trim() && !/[{;]\s*$/.test(line) && !KT_CONTINUES_LINE.test(line) && !KT_CONTINUES_NEXT.test(next)) {
        out += src.slice(last, i) + ';';
        last = i;
      }
    }
  }
  return out + src.slice(last);
}

/** Apply `fn` to the code between strings and comments (strings and comments are kept as written). */
function mapCode(src, fn) {
  let out = '', start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    let end = -1;
    if (c === '"' || c === '\'') end = skipString(src, i);
    else if (c === '/' && src[i + 1] === '/') { const n = src.indexOf('\n', i); end = n < 0 ? src.length - 1 : n - 1; }
    else if (c === '/' && src[i + 1] === '*') { const n = src.indexOf('*/', i + 2); end = n < 0 ? src.length - 1 : n + 1; }
    if (end < 0) continue;
    end = Math.max(end, i); // always move forward
    out += fn(src.slice(start, i)) + src.slice(i, end + 1);
    start = i = end + 1;
    i--;
  }
  return out + fn(src.slice(start));
}

/** PHP reads like the other brace languages once `$name` is `name` and `->` is `.` (line numbers unchanged). */
function normalizePhp(src) {
  return mapCode(src.replace(/(^|[^\[])#(?!\[)/gm, '$1//'), (code) => code
    .replace(/\$this\s*->/g, 'this.')
    .replace(/\$(?=[A-Za-z_])/g, '')
    .replace(/(\w|\))\s*(?:\?)?->\s*(?=[A-Za-z_])/g, '$1.')
    .replace(/\belseif\b/g, 'else if'));
}

/** Kotlin `if (c) A else if (c2) B else C` used as a value. Returns false when the text is not one. */
function readKotlinIf(text, inputs, rules, unread, line, setOtherwise) {
  let s = text.trim().replace(/;$/, '');
  if (!/^if\s*\(/.test(s)) return false;
  const local = [];
  const value = (v) => {
    v = v.trim();
    if (v.startsWith('{')) { const c = matchClose(v, 0); return c === v.length - 1 ? v.slice(1, -1).trim() : null; }
    return v;
  };
  while (/^if\s*\(/.test(s)) {
    const open = s.indexOf('(');
    const close = matchClose(s, open);
    if (close < 0) return false;
    const cond = s.slice(open + 1, close);
    const rest = s.slice(close + 1).trim();
    const elseAt = rest.startsWith('{') ? matchClose(rest, 0) + 1 : rest.search(/\belse\b/);
    if (elseAt <= 0) return false;
    const thenPart = value(rest.slice(0, elseAt));
    const after = rest.slice(elseAt).trim();
    if (!/^else\b/.test(after)) return false;
    const when = toThunderCondition(cond, inputs), result = thenPart == null ? null : toThunderOutcome(thenPart);
    if (!when || !result) { unread.push({ line, text: `if (${cond.trim()})`, reason: 'This choice uses a condition or answer that is not a fixed value.' }); return true; }
    local.push({ when, result, line });
    s = after.replace(/^else\s*/, '');
  }
  const fb = value(s);
  const fallback = fb == null ? null : toThunderOutcome(fb);
  if (!fallback) { unread.push({ line, text: s.slice(0, 120), reason: 'The fallback answer is computed, not a fixed value.' }); return true; }
  rules.push(...local);
  setOtherwise({ result: fallback, line });
  return true;
}

/** Kotlin `when` arms: `A, B -> value`, `in 1..5 -> value`, `else -> value`, one per line or `;`. */
function kotlinWhenArms(body, baseLine) {
  const arms = [];
  const src = stripCommentsKeepLayout(body);
  let i = 0;
  while (i < src.length) {
    while (i < src.length && /[\s;]/.test(src[i])) i++;
    if (i >= src.length) break;
    const arrow = (() => {
      let depth = 0;
      for (let j = i; j < src.length; j++) {
        const c = src[j];
        if (c === '"' || c === '\'') { j = skipString(src, j); continue; }
        if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
        else if (c === '-' && src[j + 1] === '>' && depth === 0) return j;
      }
      return -1;
    })();
    if (arrow < 0) return null;
    const pattern = src.slice(i, arrow).trim();
    let j = arrow + 2;
    while (/[ \t]/.test(src[j] || '')) j++;
    let value, end;
    if (src[j] === '{') {
      const c = matchClose(src, j);
      if (c < 0) return null;
      const inner = src.slice(j + 1, c).trim();
      value = /[;\n]/.test(inner) ? null : inner;
      end = c + 1;
    } else {
      end = kotlinExprEnd(src, j);
      const semi = topLevelIndex(src.slice(j, end), ';');
      if (semi >= 0) end = j + semi;
      value = src.slice(j, end).trim();
    }
    if (value) value = value.replace(/^return\s+/, '');
    arms.push({ pattern: pattern === 'else' ? null : pattern, guard: null, value, line: baseLine + lineAt(src, i) - 1 });
    i = end;
  }
  return arms;
}

/** Kotlin `in a..b` (inclusive), `in a until b`, `in a..<b` as the reader's range forms. */
function kotlinPattern(p) {
  return p.split(/,(?![^(]*\))/).map((x) => x.trim()
    .replace(/^in\s+(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)$/, '$1..=$2')
    .replace(/^in\s+(-?[\d.]+)\s*(?:until|\.\.<)\s*(-?[\d.]+)$/, '$1..$2')).join(', ');
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
    if (/^["']/.test(t)) { if (t[0] === '"' && /#\{|\$\{|\$[A-Za-z_]/.test(t)) return null; out.push(JSON.stringify(unquote(t))); continue; }
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
  for (let k = 0; k < out.length; k++) if (/^[<>]=?$/.test(out[k]) && (/^"/.test(out[k - 1] || '') || /^"/.test(out[k + 1] || ''))) return null; // text ordering differs by language
  const expr = out.join(' ').replace(/\( /g, '(').replace(/ \)/g, ')').replace(/not \(/g, 'not (').replace(/\bnot not /g, ''); // !!x is x
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
    // "#{x}" (Ruby) and "$x" / "${x}" (Kotlin, PHP) build the text from values: computed, not fixed.
    if (m[1] != null && /#\{|\$\{|\$[A-Za-z_]/.test(m[1])) return null;
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
  if ((m = s.match(/^throw\s+([A-Z][\w.$]*)\s*\(([\s\S]*)\)$/))) return { kind: 'fails', name: lastSeg(m[1]), detail: firstString(m[2]) }; // Kotlin: no `new`
  if ((m = s.match(/^error\(([\s\S]*)\)$/)) && language === 'kotlin') return { kind: 'fails', name: 'IllegalStateException', detail: firstString(m[1]) };
  if ((m = s.match(/^abort\(\s*(\d{3})\b/))) return { kind: 'responds', name: m[1] }; // Laravel
  if ((m = s.match(/^raise\s+([\w.]+)(?:\(([\s\S]*)\))?$/))) return { kind: 'fails', name: lastSeg(m[1]), detail: m[2] ? firstString(m[2]) : null };
  if (language === 'ruby') {
    if ((m = s.match(/^raise\s+([A-Z][\w:]*)(?:\.new)?\s*(?:,\s*|\(\s*)?([\s\S]*?)\)?$/))) return { kind: 'fails', name: lastSeg(m[1]), detail: firstString(m[2] || '') };
    if ((m = s.match(/^(?:raise|fail)\s+(["'][\s\S]*)$/))) return { kind: 'fails', name: 'RuntimeError', detail: firstString(m[1]) };
    if ((m = s.match(/^(?:head|halt)\s+(?::|")?(\w+)"?/))) return { kind: 'responds', name: m[1] }; // Rails head :forbidden, Sinatra halt 401
  }
  if ((m = s.match(/^panic!?\(([\s\S]*)\)$/))) return { kind: 'fails', name: 'panic', detail: firstString(m[1]) };
  if ((m = s.match(/^return\s+Err\(([\s\S]*)\)$/))) {
    const inner = m[1].trim();
    return { kind: 'fails', name: firstString(inner) ? 'error' : lastSeg(inner.replace(/\(.*$/s, '')), detail: firstString(inner) };
  }
  if (s === 'return') return { kind: 'stops' };
  if ((m = s.match(/^render\b.*\bstatus:\s*(?::|")?(\w+)/)) && language === 'ruby') return { kind: 'responds', name: m[1] };
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
  if (/^(nil|null|None|undefined)$/.test(s)) return null; // "is missing" is not a value a rule can hold
  if ((m = s.match(/^"([^"\\]*)"$|^'([^'\\]*)'$/))) return m[1] != null && /#\{|\$\{|\$[A-Za-z_]/.test(m[1]) ? null : JSON.stringify(m[1] ?? m[2]);
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
  } else if (language === 'php' && (m = t.match(/^match\s*\(([\s\S]*?)\)\s*\{/))) {
    const open = t.indexOf('{', m[0].length - 1); subjectText = /^\s*true\s*$/.test(m[1]) ? null : m[1]; body = t.slice(open + 1, matchClose(t, open)); kind = 'csharp-expr';
  } else if (language === 'kotlin' && (m = t.match(/^when\s*(?:\(([\s\S]*?)\))?\s*\{/))) {
    const open = t.indexOf('{', m[0].length - 1); subjectText = m[1] ?? null; body = t.slice(open + 1, matchClose(t, open)); kind = 'kotlin-when';
  } else if (language === 'csharp' && (m = t.match(/^([\w.]+)\s+switch\s*\{/))) {
    const open = t.indexOf('{'); subjectText = m[1]; body = t.slice(open + 1, matchClose(t, open)); kind = 'csharp-expr';
  } else return null;
  if (body == null) return null;
  const subject = subjectText == null ? null : toThunderCondition(subjectText, inputs);
  if (subjectText != null && (!subject || /\s/.test(subject))) return { unread: [{ line, text: t.split('\n')[0].slice(0, 120), reason: 'This switch compares something other than an input or field.' }] };
  const arms = kind === 'kotlin-when'
    ? (kotlinWhenArms(body, line) || null)?.map((a) => (a.pattern == null || subjectText == null ? a : { ...a, pattern: kotlinPattern(a.pattern) }))
    : switchArms(body, kind, line)?.map((a) => (language === 'php' && a.pattern === 'default' ? { ...a, pattern: null } : a));
  if (!arms || !arms.length) return { unread: [{ line, text: t.split('\n')[0].slice(0, 120), reason: 'This switch has a shape the reader does not recognize yet.' }] };
  return armsToRules(arms, subject, inputs, language);
}

/** Switch arms -> { rules, otherwise } or { unread }. Any arm that is not a fixed answer leaves the whole switch unread. */
function armsToRules(arms, subject, inputs, language) {
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
    let m;
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
    // Kotlin preconditions: require(cond) { "msg" } fails unless cond holds.
    if (language === 'kotlin' && (m = t.match(/^(require|check|requireNotNull|checkNotNull)\s*\(/))) {
      const open = t.indexOf('(');
      const close = matchClose(t, open);
      const cond = t.slice(open + 1, close);
      const name = m[1].startsWith('require') ? 'IllegalArgumentException' : 'IllegalStateException';
      const detail = firstString(t.slice(close + 1).replace(/^\s*\{/, '')) || null;
      const when = /NotNull$/.test(m[1]) ? null : toThunderCondition(`!(${cond})`, inputs);
      const effect = { kind: 'fails', name, detail };
      const condSaid = when ? sayCondition(when) : `\`${/NotNull$/.test(m[1]) ? `${cond.trim()} is null` : `not (${cond.trim()})`}\``;
      guards.push({ when, code: `${m[1]}(${cond.trim()})`, effect, line: st.line, readable: !!when, says: sayGuard(effect, condSaid) });
      continue;
    }
    if (language === 'php' && (m = t.match(/^abort_(if|unless)\s*\(([\s\S]*)\)\s*;?$/))) {
      const args = splitTop(m[2], ',').map((x) => x.trim());
      if (args.length >= 2 && /^\d{3}$/.test(args[1])) {
        const cond = m[1] === 'if' ? args[0] : `!(${args[0]})`;
        const when = toThunderCondition(cond, inputs);
        const effect = { kind: 'responds', name: args[1] };
        guards.push({ when, code: `abort_${m[1]}(${args[0]})`, effect, line: st.line, readable: !!when, says: sayGuard(effect, when ? sayCondition(when) : `\`${cond}\``) });
        continue;
      }
    }
    // switch / match, as a statement or as the returned value.
    {
      const isLast = st === stmts[stmts.length - 1];
      const val = (t.match(/^return\s+([\s\S]+?);?$/) || [])[1];
      const candidate = /^(switch|match|when)\b/.test(t) && (language === 'kotlin' || !/^when\b/.test(t)) ? t : val && /^(switch\b|match\b|when\b|[\w.]+\s+switch\s*\{)/.test(val) && (language === 'kotlin' || !/^when\b/.test(val)) ? val : null;
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
      if (language === 'kotlin' && readKotlinIf(ret[1], inputs, rules, unread, st.line, (o) => { otherwise = o; })) continue;
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

// ── Ruby: `def ... end`, implicit returns, modifier if/unless, case/when ───────────────────

const RB_OPENER = /^(if|unless|while|until|case|begin|for|def|class|module)\b/;
const rbCodeOnly = (l) => l.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').replace(/(^|\s)#.*$/, '$1');
/** A Ruby line without its trailing # comment (strings kept as written). */
function rbNoComment(l) {
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === '"' || c === '\'') { i = skipString(l, i); continue; }
    if (c === '#' && l[i + 1] !== '{' && (i === 0 || /\s/.test(l[i - 1]))) return l.slice(0, i);
  }
  return l;
}

/** How much a Ruby line opens (+) or closes (-) blocks. */
function rbDelta(raw) {
  const l = rbCodeOnly(raw).trim();
  if (!l) return 0;
  let d = 0;
  if (RB_OPENER.test(l) && !/^def\s+[\w.?!]+(\([^)]*\))?\s*=/.test(l)) d++;
  if (/\bdo\s*(\|[^|]*\|)?\s*$/.test(l)) d++;
  if (/[=(,]\s*(if|unless|case|begin)\b/.test(l) && !RB_OPENER.test(l)) d++;
  d -= (l.match(/(^|[^.\w])end\b(?![?!:])/g) || []).length;
  return d;
}

function findRubyFunctions(src) {
  const lines = src.split('\n');
  const fns = [];
  const collect = (from, headIndent) => {
    const body = [];
    let depth = 0;
    for (let j = from; j < lines.length; j++) {
      const t = lines[j];
      const code = rbCodeOnly(t).trim();
      if (!code) continue;
      if (depth === 0 && /^end\b/.test(code)) return body;
      body.push({ text: t.trim(), line: j + 1, depth });
      depth += rbDelta(t);
      if (depth < 0) return body;
    }
    return body;
  };
  lines.forEach((l, i) => {
    let m;
    if ((m = l.match(/^(\s*)def\s+(?:self\.)?([\w]+[?!=]?)\s*(?:\((.*?)\)|\s+([^=#][^#]*?))?\s*(=\s*(.+))?\s*$/))) {
      const params = parseParams(m[3] ?? m[4] ?? '', 'ruby');
      const body = m[5] ? [{ text: m[6].trim(), line: i + 1, depth: 0 }] : collect(i + 1, m[1].length);
      fns.push({ name: m[2], line: i + 1, params, returns: null, rbBody: body });
      return;
    }
    if ((m = l.match(/^\s*(get|post|put|patch|delete)\s+['"]([^'"]+)['"]\s+do\b/))) { // Sinatra
      const method = m[1].toUpperCase();
      fns.push({ name: `${method} ${m[2]}`, line: i + 1, params: [], returns: null, rbBody: collect(i + 1), route: { method, path: m[2] } });
    }
  });
  return fns;
}

const RB_PREDICATE_NOT_FIELD = /^(nil|empty|zero|blank|present|any|none|all|include|key|is_a|kind_of|respond_to|start_with|end_with|between|positive|negative|even|odd)$/;

/** Ruby expression -> the shape the shared converters read: @x -> x, :sym -> "sym", user.admin? -> user.admin. */
function rbExpr(text) {
  let bad = false;
  // Ruby's === is "matches" (a pattern, a class, a range), not equality: never read it as ==.
  // And `<` / `<=` beside a class name asks "is a subclass of", not "is less than".
  const bare = String(text).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  if (/===/.test(bare) || /(<=?|>=?)\s*[A-Z][a-z]\w*(?!\w*\s*[(.])/.test(bare.replace(/<=>/g, '')) || /\b[A-Z][a-z]\w*\s*(<=?|>=?)/.test(bare)) return null;
  const out = mapCode(String(text), (code) => code
    .replace(/@(?=[A-Za-z_])/g, '')
    .replace(/(^|[\s(,=!<>[])::?([A-Za-z_]\w*)\b(?!:)/g, (all, pre, name) => (all.includes('::') ? all : `${pre}"${name}"`))
    .replace(/\.(\w+)\?/g, (all, name) => { if (RB_PREDICATE_NOT_FIELD.test(name)) bad = true; return `.${name}`; })
    .replace(/\bunless\b/g, 'if not'));
  return bad ? null : out;
}
const rbCond = (text, inputs, negate = false) => { const e = rbExpr(text); return e == null ? null : toThunderCondition(negate ? `!(${e})` : e, inputs); };
const rbOutcome = (text) => { const e = rbExpr(String(text).replace(/^return\s+/, '')); return e == null ? null : toThunderOutcome(e); };

/** Ruby ranges as the reader's range forms: a..b is inclusive (a..=b), a...b excludes b (a..b). */
function rbRange(p) {
  return p.split(/,(?![^(]*\))/).map((x) => x.trim().replace(/^\(?(-?\d+(?:\.\d+)?)\s*(\.\.\.?)\s*(-?\d+(?:\.\d+)?)\)?$/,
    (_, a, dots, b) => (dots === '...' ? `${a}..${b}` : `${a}..=${b}`))).join(', ');
}

function readRubyBody(body, inputs) {
  const rules = [], unread = [], guards = [];
  let otherwise = null;
  let top = body.map((b, k) => ({ ...b, k })).filter((b) => b.depth === 0);
  // A method-level `rescue` or `ensure` starts error handling; the answer is what comes before it.
  const rescueAt = top.findIndex((b) => /^(rescue|ensure)\b/.test(rbNoComment(b.text).trim()));
  if (rescueAt >= 0) {
    unread.push({ line: top[rescueAt].line, text: rbNoComment(top[rescueAt].text).trim().slice(0, 120), reason: 'Error handling (rescue) is not read as rules.' });
    top = top.slice(0, rescueAt);
  }
  // The lines inside a block, without the block's own closing `end`.
  const blockOf = (start) => {
    const out = [];
    for (let k = start + 1; k < body.length && body[k].depth > 0; k++) if (!(body[k].depth === 1 && /^end\b/.test(rbNoComment(body[k].text).trim()))) out.push(body[k]);
    return out;
  };
  const sole = (lines) => (lines.length === 1 ? lines[0].text : null);
  top.forEach((st, n) => {
    const t = rbNoComment(st.text).trim();
    const isLast = n === top.length - 1;
    let m;
    // Modifier form: `return X if cond`, `raise Error, "msg" unless cond`.
    if ((m = t.match(/^(return\b.*?|raise\b.*?|fail\b.*?|head\b.*?|halt\b.*?|render\b.*?)\s+(if|unless)\s+(.+)$/))) {
      const when = rbCond(m[3], inputs, m[2] === 'unless');
      const stmt = m[1].trim();
      const fixed = /^return\s+\S/.test(stmt) ? rbOutcome(stmt) : null;
      if (fixed) {
        if (!when) unread.push({ line: st.line, text: t.slice(0, 120), reason: 'This condition uses something besides comparisons and and/or/not.' });
        else rules.push({ when, result: fixed, line: st.line });
        return;
      }
      const effect = terminatorEffect(rbExpr(stmt) ?? stmt, 'ruby');
      if (effect) {
        const code = (m[2] === 'unless' ? 'unless ' : '') + m[3].trim();
        guards.push({ when, code, effect, line: st.line, readable: !!when, says: sayGuard(effect, when ? sayCondition(when) : `\`${code}\``) });
        return;
      }
    }
    // if / unless ... elsif ... else ... end
    if ((m = t.match(/^(if|unless)\s+(.+?)(?:\s+then)?$/))) {
      const block = blockOf(st.k);
      const parts = [];
      let cur = { cond: m[2], negate: m[1] === 'unless', lines: [], line: st.line };
      for (const b of block) {
        const bt = rbNoComment(b.text).trim();
        let e;
        if (b.depth === 1 && (e = bt.match(/^elsif\s+(.+?)(?:\s+then)?$/))) { parts.push(cur); cur = { cond: e[1], negate: false, lines: [], line: b.line }; continue; }
        if (b.depth === 1 && /^else$/.test(bt)) { parts.push(cur); cur = { cond: null, lines: [], line: b.line }; continue; }
        cur.lines.push({ ...b, text: bt });
      }
      parts.push(cur);
      const hasElse = parts.some((p) => p.cond == null);
      // A guard: one branch, no else, that exits without a fixed answer.
      if (parts.length === 1 && !hasElse) {
        const only = sole(parts[0].lines);
        const fixed = only && /^return\s/.test(only) ? rbOutcome(only) : null;
        if (only && !fixed) {
          const effect = terminatorEffect(rbExpr(only) ?? only, 'ruby');
          if (effect && effect.kind !== 'returns-computed') {
            const when = rbCond(parts[0].cond, inputs, parts[0].negate);
            const code = (parts[0].negate ? 'unless ' : '') + parts[0].cond;
            guards.push({ when, code, effect, line: st.line, readable: !!when, says: sayGuard(effect, when ? sayCondition(when) : `\`${code}\``) });
            return;
          }
        }
      }
      const local = [];
      let fallback = null;
      for (const p of parts) {
        const v = sole(p.lines);
        // A bare value only answers when the whole `if` is the method's last expression.
        const valueText = v && (/^return\s/.test(v) || isLast) ? v : null;
        const result = valueText ? rbOutcome(valueText) : null;
        if (!result) { unread.push({ line: p.line, text: p.cond ? `${p.negate ? 'unless' : 'if'} ${p.cond}` : 'else', reason: 'This branch does more than choose an answer.' }); return; }
        if (p.cond == null) { fallback = { result, line: p.line }; continue; }
        const when = rbCond(p.cond, inputs, p.negate);
        if (!when) { unread.push({ line: p.line, text: `if ${p.cond}`, reason: 'This condition uses something besides comparisons and and/or/not.' }); return; }
        local.push({ when, result, line: p.line });
      }
      rules.push(...local);
      if (fallback) otherwise = fallback;
      return;
    }
    // case subject / when values [then answer] / else / end
    if ((m = t.match(/^(?:return\s+)?case(?:\s+(.+))?$/))) {
      const subject = m[1] ? rbCond(m[1], inputs) : null;
      if (m[1] && (!subject || /\s/.test(subject))) { unread.push({ line: st.line, text: t.slice(0, 120), reason: 'This case compares something other than an input or field.' }); return; }
      const block = blockOf(st.k);
      const arms = [];
      let cur = null;
      for (const b of block) {
        const bt = rbNoComment(b.text).trim();
        let w;
        if (b.depth === 1 && (w = bt.match(/^when\s+(.+?)(?:\s+then\s+(.+))?$/))) { cur = { pattern: w[1], value: w[2] ?? null, lines: [], line: b.line }; arms.push(cur); continue; }
        if (b.depth === 1 && (w = bt.match(/^else(?:\s+(.+))?$/))) { cur = { pattern: null, value: w[1] ?? null, lines: [], line: b.line }; arms.push(cur); continue; }
        if (cur) cur.lines.push(bt);
      }
      const answerable = isLast || /^return\s/.test(t);
      const ready = arms.map((a) => {
        const v = a.value ?? (a.lines.length === 1 ? a.lines[0] : null);
        const ok = v && (answerable || /^return\s/.test(v));
        const conv = ok ? rbExpr(v.replace(/^return\s+/, '')) : null;
        // `when SomeClass` asks "is it a kind of SomeClass?" (===), not equality: not read.
        const typeCheck = m[1] && a.pattern != null && a.pattern.split(',').some((x) => /^[A-Z][\w:]*$/.test(x.trim()) && !/^[A-Z][A-Z0-9_]*$/.test(x.trim().split('::').pop()));
        const pattern = a.pattern == null ? null : typeCheck ? null : m[1] ? rbExpr(rbRange(a.pattern)) : rbExpr(a.pattern);
        return { pattern: a.pattern != null && pattern == null ? '\u0000' : pattern, guard: null, value: conv, line: a.line };
      });
      const sw = arms.length ? armsToRules(ready, subject, inputs, 'ruby') : { unread: [{ line: st.line, text: t, reason: 'This case has no when branches the reader recognizes.' }] };
      if (sw.unread) { unread.push(...sw.unread); return; }
      rules.push(...sw.rules);
      if (sw.otherwise) otherwise = sw.otherwise;
      return;
    }
    // The last expression is the answer; `return X` answers anywhere.
    if (/^return\s/.test(t) || isLast) {
      const v = t.replace(/^return\s+/, '');
      const e = rbExpr(v);
      if (e && readTernary(e, inputs, rules, unread, st.line, (o) => { otherwise = o; })) return;
      const result = rbOutcome(v);
      if (result) { otherwise = { result, line: st.line }; return; }
      unread.push({ line: st.line, text: t.slice(0, 120), reason: 'This answer is computed, not a fixed value.' });
      return;
    }
    unread.push({ line: st.line, text: t.slice(0, 120), reason: 'This statement does work besides choosing an answer.' });
  });
  return { rules, otherwise, unread, guards };
}

// ── Plain English ───────────────────────────────────────────────────────────────────────────

const OP_WORDS = { '>=': 'is at least', '>': 'is more than', '<=': 'is at most', '<': 'is less than', '==': 'is', '!=': 'is not' };

/** Read a ThunderLang condition aloud: `amount <= 100 and withinWindow` -> "amount is at most 100 and withinWindow". */
const NOT_OP_WORDS = { '>=': 'is less than', '>': 'is at most', '<=': 'is more than', '<': 'is at least', '==': 'is not', '!=': 'is' };

export function sayCondition(cond) {
  return cond
    // `not x > 0` negates the whole comparison in ThunderLang; say it the way a person would.
    .replace(/\bnot\s+([A-Za-z_][\w.]*)\s*(>=|<=|==|!=|>|<)\s*("[^"]*"|-?[\w.]+)/g, (_, a, op, b) => `${a} ${NOT_OP_WORDS[op]} ${b}`)
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
const BOOL_RETURN = /^(bool|boolean|Boolean|bool\?|Boolean\?|kotlin\.Boolean|System\.Boolean)$/;
const LOGIC_OR_COMPARE = /(&&|\|\||[<>]=?|[!=]==?|\band\b|\bor\b|\bnot\b|^\s*!)/;
/** Read a one-expression boolean body as a decision rule, or return null. Never guesses past one expression. */
function readPredicate(fn, lang, names, code) {
  let expr = null, line = fn.line;
  if (lang === 'python') {
    const body = (fn.pyBody || []).filter((l) => !/^(?:[rbuf]{0,2})(?:"""|\'\'\'|"|')/.test(l.text)); // drop docstrings
    if (body.length !== 1) return null;
    const m = body[0].text.match(/^return\s+(.+)$/);
    if (!m) return null;
    expr = m[1]; line = body[0].line;
  } else if (lang === 'ruby') {
    const body = (fn.rbBody || []).filter((l) => l.text && !/^#/.test(l.text) && l.text !== 'end');
    if (body.length !== 1) return null;
    expr = body[0].text.replace(/^return\s+/, ''); line = body[0].line;
    if (/^(if|unless|case|while|until)\b|\bthen\b/.test(expr)) return null;
  } else {
    if (typeof fn.body !== 'string') return null;
    const body = stripComments(fn.body).trim();
    let m = body.match(/^return\s+([^;{}]+?);?\s*$/s);
    if (!m && lang === 'rust') m = body.match(/^([^;{}]+?)\s*$/s);
    if (!m) return null;
    expr = m[1].replace(/\s+/g, ' ').trim();
    if (fn.bodyStart != null) line = lineAt(code, fn.bodyStart + Math.max(0, fn.body.indexOf(m[1].trim().slice(0, 12))));
  }
  if (!expr || /^(true|false|True|False)$/.test(expr)) return null;
  if (!(BOOL_RETURN.test(String(fn.returns || '').trim()) || LOGIC_OR_COMPARE.test(expr) || /\?$/.test(fn.name))) return null;
  const when = toThunderCondition(expr.replace(/\?$/, ''), names);
  return when ? { rule: { when, result: 'true', line } } : null;
}

function functionSteps(fn, lang, code, names) {
  let stmts = [];
  try {
    if (lang === 'python') stmts = indentStatements(fn.pyBody, { depthKey: 'indent' });
    else if (lang === 'ruby') stmts = indentStatements(fn.rbBody, { depthKey: 'depth' });
    else if (typeof fn.body === 'string' && fn.bodyStart != null) stmts = braceStatements(splitStatements(lang === 'kotlin' ? kotlinTerminate(fn.body) : fn.body, lineAt(code, fn.bodyStart)), splitStatements);
  } catch { return null; }
  if (!stmts.length) return null;
  const r = stepsFrom(stmts);
  for (const st of r.steps) {
    if (st.kind !== 'branch' || !st.cond) continue;
    const cond = toThunderCondition(st.cond, names);
    if (cond) st.says = st.says.replace(/^If .*?( \(\d+ steps? inside\))?$/, (_m, inner) => `If ${st.negate ? 'not: ' : ''}${sayCondition(cond).replace(/ is not ""/g, ' is not empty').replace(/ is ""/g, ' is empty')}${inner || ''}`);
    delete st.cond; delete st.negate;
  }
  return r;
}

export function readCode(source, { language, file = '' } = {}) {
  const src = String(source ?? '');
  if (src.length > 400000) throw new Error('Source is larger than 400 KB. Read one file or module at a time.');
  const lang = String(language || detectLanguage(src, file)).toLowerCase().replace(/^ts$/, 'typescript').replace(/^js$/, 'javascript').replace(/^py$/, 'python').replace(/^(cs|c#)$/, 'csharp').replace(/^rs$/, 'rust').replace(/^golang$/, 'go').replace(/^kts?$/, 'kotlin').replace(/^rb$/, 'ruby');
  if (!READ_LANGUAGES.includes(lang)) throw new Error(`Reading rules supports ${READ_LANGUAGES.join(', ')}. Got "${lang}".`);
  READING_RUST = lang === 'rust';
  // PHP is read after `$name` -> `name` and `->` -> `.`; every line stays on its line.
  const code = lang === 'php' ? normalizePhp(src) : src;
  const items = [];
  for (const fn of findFunctions(code, lang)) {
    const inputs = fn.params;
    const names = inputs.map((p) => p.name);
    const read = lang === 'python'
      ? readPythonBody(fn.pyBody, names)
      : lang === 'ruby'
        ? readRubyBody(fn.rbBody, names)
        : readBraceStatements(splitStatements(lang === 'kotlin' ? kotlinTerminate(fn.body) : fn.body, lineAt(code, fn.bodyStart)), lang, names);
    // Predicates: a body that is only `return <true/false expression>` (Rust: a tail expression; Ruby:
    // an implicit last value) reads as "true when <expression>, otherwise false".
    if (!read.rules.length && !read.otherwise) {
      const pred = readPredicate(fn, lang, names, code);
      if (pred) { read.rules.push(pred.rule); read.otherwise = { result: 'false', line: pred.rule.line }; }
    }
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
      const st = functionSteps(fn, lang, code, names);
      items.push({
        ...base, kind: 'function', status: 'signature-only',
        ...(st ? { steps: st.steps, stepsMore: st.more, stepsReadable: Math.round(st.readable * 100) / 100 } : {}),
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
