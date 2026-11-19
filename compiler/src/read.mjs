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

function skipString(src, i) {
  const q = src[i];
  // Rust lifetimes ('static, 'a) are not strings.
  if (q === '\'' && /[A-Za-z_]/.test(src[i + 1] || '') && src[i + 2] !== '\'') return i;
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
          const end = rest.search(/;\s*(\n|$)|\n\s*\n/);
          const expr = (end < 0 ? rest : rest.slice(0, end)).trim();
          fns.push({ key, name, line: fnLine, params, returns, bodyStart: markerAt + 2 + lead, body: `return ${expr};` });
        }
      } else {
        const bc = matchClose(src, markerAt);
        if (bc > 0) fns.push({ key, name, line: fnLine, params, returns, bodyStart: markerAt + 1, body: src.slice(markerAt + 1, bc) });
      }
    }
  }
  return fns.sort((a, b) => a.line - b.line);
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
  let m;
  if ((m = s.match(/^"([^"\\]*)"$|^'([^'\\]*)'$|^`([^`$\\]*)`$/))) {
    const v = m[1] ?? m[2] ?? m[3];
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(v) ? v : JSON.stringify(v);
  }
  if (/^-?\d+(\.\d+)?(f64|f32|[fFdDmMlL])?$/.test(s)) return s.replace(/(f64|f32|[fFdDmMlL])$/, '');
  if (/^(true|false|True|False)$/.test(s)) return s.toLowerCase();
  if ((m = s.match(/^(?:[A-Za-z_][\w]*(?:\.|::))+([A-Z][A-Za-z0-9_]*)$/))) return m[1];
  if (/^[A-Z][A-Za-z0-9_]*$/.test(s)) return s;
  return null;
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
  const rules = [], unread = [];
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
    const ret = t.match(/^return\s+([\s\S]+?);?$/) || (language === 'rust' && st === stmts[stmts.length - 1] && !/;\s*$/.test(t) ? [null, t] : null);
    if (ret) {
      if (readTernary(ret[1], inputs, rules, unread, st.line, (o) => { otherwise = o; })) continue;
      take(null, ret[1], st.line);
      continue;
    }
    unread.push({ line: st.line, text: t.split('\n')[0].slice(0, 120), reason: 'This statement does work besides choosing an answer.' });
  }
  return { rules, otherwise, unread };
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
  const rules = [], unread = [];
  let otherwise = null;
  const base = body[0]?.indent ?? 0;
  for (let i = 0; i < body.length; i++) {
    const { text, line, indent } = body[i];
    if (indent !== base) continue;
    let m;
    if ((m = text.match(/^(?:if|elif)\s+(.+?):\s*(.*)$/))) {
      const inline = m[2].trim();
      const next = body[i + 1];
      const valueText = inline ? inline : next && next.indent > base ? next.text : '';
      const deeper = body.slice(i + 1).filter((b, k, arr) => b.indent > base && arr.slice(0, k).every((x) => x.indent > base));
      const r = valueText.match(/^return\s+(.+)$/);
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
  return { rules, otherwise, unread };
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
  const items = [];
  for (const fn of findFunctions(src, lang)) {
    const inputs = fn.params;
    const names = inputs.map((p) => p.name);
    const read = lang === 'python'
      ? readPythonBody(fn.pyBody, names)
      : readBraceStatements(splitStatements(fn.body, lineAt(src, fn.bodyStart)), lang, names);
    const isDecision = read.rules.length > 0 && !!read.otherwise;
    const base = {
      id: `${fn.name}:${fn.line}`, name: fn.name, line: fn.line, inputs, returns: simpleType(fn.returns),
      provenance: 'inferred-from-code',
    };
    if (isDecision) {
      items.push({
        ...base, kind: 'decision', status: read.unread.length ? 'partial' : 'read',
        rules: read.rules.map((r) => ({ ...r, says: sayCondition(r.when) })), otherwise: read.otherwise,
        says: sayDecision(read.rules, read.otherwise),
        thunder: decisionSource(fn.name, inputs, read.rules, read.otherwise),
        unread: read.unread,
      });
    } else {
      items.push({
        ...base, kind: 'function', status: 'signature-only',
        says: `${fn.name} takes ${inputs.length ? inputs.map((p) => p.type && !/[<>\[\]]/.test(p.type) ? `${p.name} (${p.type})` : p.name).join(', ') : 'no inputs'}${fn.returns ? ` and returns ${simpleType(fn.returns)}` : ''}. Its body does more than choose between fixed answers, so no rules are shown.`,
        unread: read.unread,
      });
    }
  }
  // Errors and tests come from the existing lift adapters (signature-level facts).
  const facts = extractFacts(src, lang, file || undefined);
  for (const e of facts?.errors || []) items.push({ id: `error:${e.name}:${e.line}`, kind: 'error', name: e.name, line: e.line, status: 'read', says: /\s/.test(e.name) ? `Can fail with the error "${e.name}".` : `Raises ${e.name}.`, provenance: 'inferred-from-code' });
  for (const t of facts?.tests || []) items.push({ id: `test:${t.name}:${t.line}`, kind: 'test', name: t.name, line: t.line, status: 'read', says: `A test named "${t.name}".`, provenance: 'inferred-from-code' });
  items.sort((a, b) => a.line - b.line);
  const counts = { decision: 0, function: 0, error: 0, test: 0, partial: 0 };
  for (const it of items) { counts[it.kind]++; if (it.status === 'partial') counts.partial++; }
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
    if (kinds.length && !kinds.includes(it.kind)) return false;
    if (status.length && !status.includes(it.status)) return false;
    if (!terms.length) return true;
    const hay = [it.name, it.says, it.thunder, ...(it.inputs || []).map((p) => `${p.name} ${p.type ?? ''}`), ...(it.rules || []).flatMap((r) => [r.when, r.result, r.says]), it.otherwise?.result]
      .filter(Boolean).join(' ').toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
