// Read code you don't know: recover the decision rules inside functions written in TypeScript /
// JavaScript, Python, Go, Rust, C#, Java, Kotlin, PHP, Ruby, SQL, C, C++, or Swift, and show them as ThunderLang
// plus plain English.
// Deterministic, no AI, browser-safe. Everything here is INFERRED from code: a reading says what
// the code appears to decide, never what it was meant to decide, and anything it could not read
// is listed rather than guessed.
//
// Recognized shapes (the common ways code chooses an answer):
//   if (cond) return X; ... return Y;        if/else if/else chains returning values
//   return cond ? X : Y   (nested ternaries)  Python: return X if cond else Y
//   Rust/Go tail forms: if cond { X } else { Y }, if cond { return X }
// Conditions may use comparisons, &&/||/!, and/or/not, parentheses, literals, and inputs or fields.
import { sayLess, certainlyYesNo } from './say-less.mjs';
import { sqlItems, sqlTemplateReason } from './sql.mjs';
import { readDockerfile } from './infra-docker.mjs';
import { readWorkflow } from './infra-gha.mjs';
import { readTerraform } from './infra-terraform.mjs';
import { readBicep } from './infra-bicep.mjs';
import { readKubernetes } from './infra-k8s.mjs';
import { readCompose } from './infra-compose.mjs';
import { readableFormat } from './file-formats.mjs';
import { stepsFrom, braceStatements, indentStatements, plainEnums, withLanguage, SWIFT_CLOSURE_PARAMS, VAPOR_STATUS, withFunctionContext, classifyStatement } from './steps.mjs';
import { compileExpr, simplifyExpr } from './expr.mjs';
import { extractFacts, languageForFile } from './lift.mjs';
import { shellReading, shellShebang, SHELL_TRIVIA } from './shell.mjs';
import { powershellReading } from './powershell.mjs';
import { rReading } from './rlang.mjs';

export const READ_SCHEMA = 'thunder-reading-v1';
export const READ_LANGUAGES = ['typescript', 'javascript', 'python', 'go', 'rust', 'csharp', 'java', 'kotlin', 'php', 'ruby', 'sql', 'c', 'cpp', 'swift', 'r', 'shell', 'powershell', 'dockerfile', 'github-actions', 'terraform', 'bicep', 'kubernetes', 'docker-compose'];
/** Formats read as infrastructure and delivery (spec section 12), not as programming languages. */
export const INFRA_LANGUAGES = ['dockerfile', 'github-actions', 'terraform', 'bicep', 'kubernetes', 'docker-compose'];
// Languages whose `if` condition needs no parentheses: `if a && b {` (a leading parenthesis may wrap only part of it).
const BARE_IF = new Set(['go', 'rust', 'swift']);
/** Languages read by their own module (shell.mjs, powershell.mjs, rlang.mjs) into the same reading shape. */
const SCRIPT_READERS = { shell: shellReading, powershell: powershellReading, r: rReading };
const KEYWORDS_NOT_FN = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'else', 'using', 'lock', 'synchronized', 'foreach', 'match', 'loop', 'sizeof', 'typeof', 'nameof']);

/** Best-effort language guess for pasted code (a file name, when known, is more reliable). */
export function detectLanguage(source, file = '') {
  const s = String(source);
  if (file) {
    const format = readableFormat(file, s.slice(0, 2048));
    if (format) return format;
    // A file with no extension is a shell script when its first line says so (#!/bin/bash).
    if (!/\.[^./\\]+$/.test(String(file)) && shellShebang(s)) return 'shell';
    return /\.h$/i.test(file) ? (looksCpp(source) ? 'cpp' : 'c') : languageForFile(file);
  }
  if (shellShebang(s)) return 'shell';
  // A Dockerfile: its first instruction is FROM (or ARG before FROM), after comments and parser directives.
  if (/^\s*(?:#[^\n]*\n\s*)*(?:ARG\s[^\n]*\n\s*(?:#[^\n]*\n\s*)*)*FROM\s+\S/i.test(s) && /^(RUN|CMD|COPY|ENTRYPOINT|WORKDIR|EXPOSE)\s/m.test(s)) return 'dockerfile';
  // Bicep: `resource name 'Microsoft.X/y@…'`, `module name './x.bicep'`, `param name type`, or `targetScope =`.
  if (/^(?:resource|module)\s+\w+\s+'[^'\n]+'/m.test(s) || /^targetScope\s*=/m.test(s) || (/^param\s+\w+\s+(?:string|int|bool|object|array)\b/m.test(s) && !/^\s*(?:def|function|class)\b/m.test(s))) return 'bicep';
  // Terraform: `resource "type" "name" {`, `variable "x" {`, `terraform {`, `locals {`.
  if (/^(?:resource|data|module|variable|provider|output)\s+"[\w-]+"/m.test(s) || /^(?:terraform|locals)\s*\{/m.test(s)) return 'terraform';
  // A GitHub Actions workflow: top-level `on:` and `jobs:`.
  if (/^(?:on|"on"|'on'):/m.test(s) && /^jobs:\s*$/m.test(s)) return 'github-actions';
  // Kubernetes YAML: top-level apiVersion: and kind:.
  if (/^apiVersion:\s*\S/m.test(s) && /^kind:\s*\S/m.test(s)) return 'kubernetes';
  // Docker Compose: top-level services: with a service that has an image: or build:.
  if (/^services:\s*$/m.test(s) && /^\s+(?:image|build):/m.test(s)) return 'docker-compose';
  // PowerShell: Verb-Noun functions, [CmdletBinding()], param blocks with [type]$name, -eq style operators.
  if (/^\s*function\s+[A-Za-z]+-[A-Za-z]\w*/m.test(s) || /\[CmdletBinding\(/i.test(s) || /\bparam\s*\(\s*(?:\[[^\]]+\]\s*)*\$\w+/i.test(s) || /\$\w+\s+-(?:eq|ne|gt|ge|lt|le|like|match|contains)\b/i.test(s) || /^\s*(?:Write-Host|Get-[A-Z]\w+|Set-[A-Z]\w+|New-[A-Z]\w+)\b/m.test(s)) return 'powershell';
  // R: name <- function(…), library(pkg), pipes with <-, R6Class, plumber annotations.
  if (/[\w.]\s*<-\s*function\s*\(/.test(s) || /^\s*library\(\w+\)\s*$/m.test(s) || /\bR6Class\(|\bsetRefClass\(|^#\*\s*@(?:get|post)\s/m.test(s) || (/<-/.test(s) && /%>%|\|>/.test(s))) return 'r';
  // Shell without a shebang: its own keywords (fi, done, esac, then) alongside $variables.
  if ([/^\s*fi\s*$/m, /^\s*done\s*$/m, /;\s*then\s*$/m, /^\s*esac\s*$/m, /\[\[ .+ \]\]/, /^\s*set -[euo]/m].filter((re) => re.test(s)).length >= 2) return 'shell';
  // SQL: a file that starts with (or is mostly) schema statements.
  if (/^\s*(?:--[^\n]*\n\s*)*(?:CREATE|ALTER|INSERT\s+INTO|SELECT|WITH)\b/i.test(s) && /\b(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|FUNCTION|PROCEDURE|TRIGGER|TYPE|INDEX)|SELECT\b[\s\S]*\bFROM)\b/i.test(s)) return 'sql';
  if (/^\s*<\?php\b/.test(s) || /\bfunction\s+\w+\s*\([^)]*\$\w+/.test(s)) return 'php';
  if (/\bfun\s+(<[^>]*>\s*)?[\w.]*\w+\s*\(/.test(s)) return 'kotlin';
  // Swift before Go: both write `func`, but only Swift types its parameters with a colon or returns with `->`.
  if (/^[ \t]*import[ \t]+(?:Foundation|UIKit|SwiftUI|Vapor|Combine|XCTest|AppKit|Fluent)\b/m.test(s) || /\bfunc\s+\w+\s*(?:<[^>]*>)?\s*\([^)]*\w\s*:\s*[^)]*\)|\bfunc\s+\w+\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?:async\s+)?(?:throws\s+)?->/.test(s)) return 'swift';
  if (/^\s*def\s+[\w.?!]+(\s*\(.*\))?\s*$/m.test(s) && /^\s*end\s*$/m.test(s)) return 'ruby';
  if (/^\s*package\s+\w+\s*$/m.test(s) || /\bfunc\s+(\([^)]*\)\s*)?\w+\s*\(/.test(s)) return 'go';
  if (/\bfn\s+\w+\s*(<[^>]*>)?\s*\(/.test(s) || /\blet\s+mut\b|->\s*&'static/.test(s)) return 'rust';
  if (/^\s*def\s+\w+\s*\(.*\)\s*(->\s*[^:]+)?:\s*$/m.test(s)) return 'python';
  // C and C++: an #include, or C++ syntax (std::, templates, Type::method definitions), or a C function that uses
  // pointers, NULL, or the C library.
  const cSignature = /^[ \t]*(?:static[ \t]+|inline[ \t]+)*(?:const[ \t]+|unsigned[ \t]+|struct[ \t]+\w+[ \t]*)?(?:void|int|char|long|double|float|size_t|bool|u?int\d+_t)[ \t*]+\w+[ \t]*\([^)]*\)[ \t]*\{/m.test(s)
    && /\bNULL\b|->|\bchar[ \t]*\*|\bprintf\(|\bmalloc\(|\bfree\(|\bsizeof\b|\btypedef\b|\bstruct[ \t]+\w+/.test(s) && !/\b(?:public|private|String|boolean|using)\b/.test(s);
  if (cSignature || /^[ \t]*#[ \t]*(?:include|define|ifndef|pragma)\b/m.test(s) || /\bstd::\w|\btemplate[ \t]*<|\b\w+::~?\w+[ \t]*\([^;{)]*\)[ \t]*(?:const[ \t]*)?\{/.test(s)) return looksCpp(s) ? 'cpp' : 'c';
  if (/\bnamespace\s+[\w.]+|\busing\s+System\b|\bpublic\s+static\s+string\b|\bstring\s+\w+\s*[,)]/.test(s)) return 'csharp';
  if (/\bpublic\s+(static\s+)?(class|String|boolean|int|double|void)\b|\bString\s+\w+\s*[,)]|\bboolean\b/.test(s)) return 'java';
  if (/:\s*(number|string|boolean)\b|\binterface\s+\w+|\bexport\s+(function|const)\b/.test(s)) return 'typescript';
  return 'javascript';
}

/** True when C-family source uses C++ (classes, namespaces, templates, `::`, std), so a `.h` file is read as C++. */
export function looksCpp(source) {
  // A C header may hold a few lines for C++ callers (#ifdef __cplusplus … #endif); those do not make it C++.
  const s = stripComments(String(source).slice(0, 200000)).replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/^[ \t]*#[ \t]*if(?:def)?[ \t]+(?:defined[ \t]*\(?[ \t]*)?__cplusplus[\s\S]*?^[ \t]*#[ \t]*(?:endif|else)\b/gm, '');
  // C allows `template` and `typename` as names (const char *template), so they count only in their C++ shape.
  return /\bclass[ \t]+\w+[ \t]*[:{]|\bnamespace[ \t]+\w*[ \t]*\{|\btemplate[ \t]*<|\btypename[ \t]+\w+[ \t]*[,>=]|^[ \t]*(?:public|private|protected)[ \t]*:|\bnullptr\b|\bconstexpr\b|\w::\w|\bstd::|#[ \t]*include[ \t]*<(?:iostream|string|vector|map|memory|utility|algorithm|functional|optional|cstdint|cstdio|cstdlib|cstring)>/m.test(s);
}

// ── Lexing helpers ──────────────────────────────────────────────────────────────────────────

// Line of a character offset. The line starts of the last few sources are kept, so each lookup is a binary search
// instead of counting every newline from the top (which made large files quadratic).
const lineStarts = new Map();
function startsOf(src) {
  let starts = lineStarts.get(src);
  if (!starts) {
    starts = [0];
    for (let i = src.indexOf('\n'); i >= 0; i = src.indexOf('\n', i + 1)) starts.push(i + 1);
    if (lineStarts.size > 8) lineStarts.delete(lineStarts.keys().next().value);
    lineStarts.set(src, starts);
  }
  return starts;
}
const lineAt = (src, idx) => {
  const starts = startsOf(src);
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; }
  return lo + 1;
};

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
  // A multi-line string (triple quotes in Swift, Kotlin, Java, C#) runs to its closing triple quote.
  if (q === '"' && src[i + 1] === '"' && src[i + 2] === '"') { const e = src.indexOf('"""', i + 3); return e < 0 ? src.length : e + 2; }
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
  // Rust text runs over lines until its closing quote; a raw string `r#"…"#` ends at the quote followed by its hashes.
  if (q === '"' && READING_RUST) {
    const raw = /\br(#*)$/.exec(src.slice(Math.max(0, i - 8), i));
    if (raw) { const e = src.indexOf(`"${raw[1]}`, i + 1); return e < 0 ? src.length : e + raw[1].length; }
    for (let j = i + 1; j < src.length; j++) { if (src[j] === '\\') { j++; continue; } if (src[j] === q) return j; }
    return src.length;
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
  raw = String(raw).replace(/#\[[^\]]*\]\s*/g, ''); // #[SensitiveParameter]
  // C# [FromBody] attributes (in Swift `[Character]` is an array type, not an attribute).
  if (language !== 'swift') raw = raw.replace(/\[\w+(?:\([^)]*\))?\]\s*/g, '');
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
    if (/^&?\s*(?:'\w+\s+)?(mut\s+)?self$|^self$|^cls$|^this$/.test(p)) continue;
    if (language === 'ruby') {
      if (/^&/.test(p)) continue; // a block argument
      out.push({ name: p.replace(/^\*+/, '').replace(/:.*$/, '').trim(), type: null });
      continue;
    }
    let name = p, type = null, m;
    if (language === 'c' || language === 'cpp') {
      const q = p.replace(/\[[^\]]*\]/g, '[]').replace(/\s+/g, ' ').trim();
      if (/^(?:void|\.\.\.)$/.test(q)) continue;
      const fp = q.match(/\(\s*[*&^]\s*(\w+)\s*\)\s*\(/); // a function pointer: int (*compare)(int, int)
      if (fp) { out.push({ name: fp[1], type: 'function' }); continue; }
      const cm = q.match(/^(.*[\s*&])(\w+)(\[\])?$/);
      if (!cm) { if (/^[a-z_]\w*$/.test(q) && !C_TYPE_WORDS.test(q)) out.push({ name: q, type: null }); continue; } // unnamed parameters have only a type
      if (/^(?:const|struct|enum|union|unsigned|signed)?\s*$/.test(cm[1])) { if (!C_TYPE_WORDS.test(cm[2])) out.push({ name: cm[2], type: null }); continue; }
      out.push({ name: cm[2], type: cType(cm[1] + (cm[3] ? '[]' : '')) });
      continue;
    }
    if (language === 'swift') {
      const q = p.replace(/@\w+(?:\([^)]*\))?\s*/g, '').trim();
      const sm = q.match(/^(?:(\w+)\s+)?(\w+)\s*:\s*(.+)$/);
      if (sm) out.push({ name: sm[2], type: simpleType(sm[3].replace(/^(?:inout|borrowing|consuming|sending)\s+/, '').replace(/\.\.\.$/, '').trim()) });
      continue;
    }
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

/**
 * A TypeScript signature head after ")": `: <type>` read with balanced <>, {}, (), [] (so `Promise<{ a: 1 }>` is whole),
 * then the body marker (=>, { or ;). Returns a match-like array [whole, type, , , marker] or null when there is no
 * ": type" (the regular pattern handles that).
 */
function balancedReturnHead(after) {
  const lead = after.match(/^\s*:/);
  if (!lead) return null;
  let i = lead[0].length, depth = 0;
  for (; i < after.length; i++) {
    const c = after[i];
    if (c === '=' && after[i + 1] === '>') { if (depth === 0) break; i++; continue; } // => ends the type, or is a function type's arrow
    if (c === '<' || c === '(' || c === '[') depth++;
    else if (c === '>' || c === ')' || c === ']') depth--;
    else if (c === '{') { if (depth === 0) break; depth++; }
    else if (c === '}') depth--;
    else if (c === ';' && depth === 0) break;
    else if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < after.length && after[i] !== q) i++; }
  }
  const type = after.slice(lead[0].length, i).trim();
  const tail = after.slice(i).match(/^\s*(?:throws\s+[\w.,\s]+)?\s*(=>|\{|;)/);
  if (!type || !tail) return null;
  const whole = after.slice(0, i) + tail[0];
  const m = [whole, type, undefined, undefined, tail[1]];
  return m;
}

/** Type words that are never a C parameter's name (an unnamed parameter is only its type). */
const C_TYPE_WORDS = /^(?:void|int|char|short|long|float|double|bool|_Bool|unsigned|signed|size_t|ssize_t|u?int\d+_t|wchar_t|auto|const)$/;
/** A C or C++ parameter type in reader terms: numbers, text, yes/no, or the type itself (`Library*`, `Book`). */
function cType(raw) {
  let t = String(raw).replace(/\b(?:const|volatile|struct|enum|union|register|restrict|__restrict|typename|class)\b/g, ' ').replace(/\bstd::/g, '').replace(/\s+/g, ' ').trim();
  if (/^(?:unsigned|signed)?\s*char\s*\*$|^(?:string|string_view|wstring|sds)\s*&?$/.test(t)) return 'string';
  t = t.replace(/\s*([*&]+)\s*/g, '$1').replace(/&+$/, '').trim(); // a reference is the value itself
  if (/^(?:(?:unsigned|signed|long|short)\s+)*(?:int|long|short|char|unsigned|signed)$|^(?:float|double|long double|size_t|ssize_t|off_t|ptrdiff_t|u?int\d+_t|u?int_fast\d+_t|intptr_t|uintptr_t|time_t)$/.test(t)) return 'number';
  if (/^(?:bool|_Bool)$/.test(t)) return 'boolean';
  return t || null;
}

function simpleType(t) {
  if (!t) return null;
  const s = String(t).trim().replace(/^&(mut\s+)?/, '');
  if (/^(number|int|long|short|float|double|decimal|f32|f64|i\d+|u\d+|usize|isize|float64|float32|int\d*|uint\d*|Integer|Double|Long|BigDecimal|Int|Float|Short|Byte|Int\d+|UInt\d*|CGFloat|Float\d+)$/.test(s)) return 'number';
  if (/^(bool|boolean|Boolean|Bool)$/.test(s)) return 'boolean';
  if (/^(str|string|String|&str|char)$/.test(s)) return 'string';
  return s;
}

/** Find functions and their bodies. Returns [{ name, line, params, bodyStart, bodyEnd, body, exprBody }]. */
function findFunctions(src, language) {
  const fns = [];
  if (language === 'python') {
    const lines = src.split('\n');
    let decorators = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      // Decorators: `@router.get(` can run over several lines (FastAPI keyword arguments); keep each one whole.
      if (/^\s*@/.test(l)) {
        const { text, end } = pyBalanced(lines, i, l.indexOf('@'));
        decorators.push(text.replace(/\s+/g, ' ').trim());
        i = end;
        continue;
      }
      const start = l.match(/^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/);
      if (!start) { if (l.trim() && !/^\s*#/.test(l)) decorators = []; continue; }
      // The header can span lines: parameters one per line (FastAPI `Depends(...)`), a wrapped return type.
      const head = pyHeader(lines, i, start[0].length - 1);
      if (!head) { decorators = []; continue; }
      const indent = start[1].length;
      const body = [];
      const inline = pyNoComment(head.after).trim();
      if (inline) body.push({ text: inline, line: head.endLine + 1, indent: indent + 4 });
      for (let j = head.endLine + 1; j < lines.length; j++) {
        const t = lines[j];
        if (!t.trim() || /^\s*#/.test(t)) continue;
        const ind = t.match(/^\s*/)[0].length;
        if (ind <= indent) break;
        const code = pyNoComment(t).trim();
        if (!code) continue;
        body.push({ text: code, line: j + 1, indent: ind });
      }
      const doc = inline ? null : pyDocstring(lines, head.endLine + 1);
      fns.push({ name: start[2], line: i + 1, params: parseParams(head.params, language), returns: head.returns, pyBody: body, ...(decorators.length ? { decorators } : {}), ...(doc ? { doc } : {}) });
      decorators = [];
    }
    annotateRoutes(fns, src);
    return fns;
  }
  if (language === 'ruby') return findRubyFunctions(src);
  if (language === 'c' || language === 'cpp') return findCFunctions(src, language);
  if (language === 'swift') return findSwiftFunctions(src);
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
      // After the parameter list: an optional return type / throws clause, then a body. A signature's head is short,
      // so look at a window, not the rest of the file (copying the rest per function made large files slow).
      const after = src.slice(close + 1, close + 1 + 4000);
      // TypeScript return types can hold braces and generics (`: Promise<{ ok: boolean }>`): read them balanced, so
      // the body's "{" is the one after the type, not a brace inside it.
      const typed = (language === 'typescript' || language === 'javascript') ? balancedReturnHead(after) : null;
      const head = typed ?? (language === 'kotlin'
        // (The return type stays on the signature's line: an abstract `fun f(): T` with no body never runs on into
        // the next declarations.)
        ? after.match(/^\s*(?::\s*([^{=\n]+?))?()()\s*(?:where\s+[^{=]+)?(=(?![=>])|\{)/)
        : after.match(/^\s*(?::\s*([^{=;]+?)|->\s*([^{;]+?)|\s+(\([^)]*\)|[\w.<>\[\]*&' ]+?))?\s*(?:throws\s+[\w.,\s]+)?\s*(=>|\{|;)/));
      if (!head || head[4] === ';') continue;
      // `const d = (await res.json()) as {...}` is a value, not a function: a const/let/var only declares a
      // function when its parameter list is followed by `=>`.
      if (/\(\?:const\|let\|var\)/.test(re.source) && head[4] !== '=>') continue;
      if (language === 'kotlin' && head[4] === '=') {
        // Kotlin expression body: fun f(x: Int) = when (x) { ... } / = if (...) "A" else "B" / = "A"
        const markerAt = close + 1 + head[0].length - 1;
        const fnLine = lineAt(src, m.index + m[0].lastIndexOf(name));
        if (seen.has(name + ':' + fnLine)) continue;
        seen.add(name + ':' + fnLine);
        const rest = src.slice(markerAt + 1);
        const lead = rest.match(/^\s*/)[0].length;
        const end = kotlinExprEnd(rest, lead);
        fns.push({ key: `${name}@${m.index}`, name, line: fnLine, params: parseParams(src.slice(open + 1, close), language), returns: (head[1] || '').trim() || null, bodyStart: markerAt + 1 + lead, body: `return ${rest.slice(lead, end).trim()}`, exprBody: rest.slice(lead, end).trim().length });
        continue;
      }
      const key = `${name}@${m.index}`;
      // The function's line is where its name is, not where a multi-line match began.
      const fnLine = lineAt(src, m.index + m[0].lastIndexOf(name));
      if (seen.has(name + ':' + fnLine)) continue;
      seen.add(name + ':' + fnLine);
      // (A Rust `where` clause is a constraint on the types, not part of what comes back.)
      const returns = (head[1] || head[2] || head[3] || '').replace(/\s+where\b[\s\S]*$/, '').trim() || null;
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
          fns.push({ key, name, line: fnLine, params, returns, bodyStart: markerAt + 2 + lead, body: `return ${expr};`, exprBody: expr.length });
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
  // Fastify: fastify.route({ method: 'POST', url: '/orders', handler: async (request, reply) => { ... } })
  if (language === 'typescript' || language === 'javascript') {
    const re = /\b\w+\.route\(\s*\{/g;
    let m;
    while ((m = re.exec(src))) {
      const objOpen = m.index + m[0].length - 1;
      const objClose = matchClose(src, objOpen);
      if (objClose < 0) continue;
      const obj = src.slice(objOpen, objClose);
      const method = (obj.match(/\bmethod\s*:\s*['"`](\w+)['"`]/) || [])[1];
      const url = (obj.match(/\b(?:url|path)\s*:\s*['"`]([^'"`]+)['"`]/) || [])[1];
      const h = obj.match(/\bhandler\s*:\s*(?:async\s*)?(?:function\s*\w*\s*)?\(/);
      if (!method || !url || !h) continue;
      const pOpen = objOpen + h.index + h[0].length - 1;
      const pClose = matchClose(src, pOpen);
      const brace = pClose < 0 ? -1 : src.indexOf('{', pClose);
      if (brace < 0 || !/^\s*(=>\s*)?(:\s*[\w<>\[\]|. ]+)?\s*(=>\s*)?$/.test(src.slice(pClose + 1, brace))) continue;
      const bc = matchClose(src, brace);
      if (bc < 0) continue;
      fns.push({ name: `${method.toUpperCase()} ${url}`, line: lineAt(src, m.index), params: [], returns: null, bodyStart: brace + 1, body: src.slice(brace + 1, bc), route: { method: method.toUpperCase(), path: url } });
    }
  }
  if (language === 'typescript' || language === 'javascript') jsMoreFunctions(src, fns);
  annotateRoutes(fns, src);
  return fns.sort((a, b) => a.line - b.line);
}

// ── JavaScript / TypeScript: functions that have no declaration of their own ─────────────────────────────
// `exports.x = function (…) {…}`, `res.json = function json(obj) {…}`, `Foo.prototype.bar = function`,
// `var app = function (req, res) {…}` inside another function, `{ key: function () {…} }`, and anonymous callbacks
// (`app.use(function (req, res, next) {…})`, `.then(function (x) {…})`, `items.forEach((x) => {…})`). Each is an item
// of its own, so a run, a stack frame, or a link can land on it. A one-line arrow (`(x) => x.id`) stays part of the
// step that uses it. Names: the name it is assigned to, else `<parent> › callback at line N`.

/** What the code just before a function says about it: assigned to `lhs`, a key of an object, or an argument. */
function jsContext(clean, at) {
  // (Scanned backwards by hand: a regex anchored at the end of a long slice is slow on big files.)
  const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  let i = at - 1;
  while (i >= 0 && isSpace(clean[i])) i--;
  if (clean.slice(i - 4, i + 1) === 'async' && !/[\w$]/.test(clean[i - 5] || '')) { i -= 5; while (i >= 0 && isSpace(clean[i])) i--; }
  let m;
  if (clean[i] === '=' && !/[=!<>+\-*/%&|^?]/.test(clean[i - 1] || '')) {
    const seg = clean.slice(Math.max(0, i - 160), i);
    if ((m = seg.match(/(?:^|[^\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]{1,120})?$/))) return { kind: 'assign', lhs: m[1], local: true };
    if ((m = seg.match(/([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*|\[[^\]\n]{1,60}\])*)\s*$/))) return { kind: 'assign', lhs: m[1].replace(/\s+/g, '') };
  }
  if (clean[i] === ':' && (m = clean.slice(Math.max(0, i - 80), i).match(/(?:^|[{,\s])([A-Za-z_$][\w$]*|'[^'\n]+'|"[^"\n]+")\s*$/))) return { kind: 'key', key: m[1].replace(/^['"]|['"]$/g, '') };
  // An argument: find the call it is passed to (the unmatched "(" before it) and that call's name.
  let depth = 0;
  for (i = at - 1; i >= Math.max(0, at - 3000); i--) {
    const c = clean[i];
    if (c === ')' || c === ']' || c === '}') depth++;
    else if (c === '(' || c === '[' || c === '{') {
      if (depth === 0) {
        if (c !== '(') return { kind: 'arg', callee: null };
        const name = clean.slice(Math.max(0, i - 120), i).match(/([A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*)\s*$/);
        const callee = name ? name[1].replace(/\s+/g, '').replace(/\?\./g, '.') : null;
        // A call on the result of another call (`fetch(x).then(…)`) is named by its last part (`then`).
        // `const save = useCallback(() => {…})`: a wrapper that only keeps the function gives it its name.
        const kept = callee && WRAPS_FUNCTION.test(callee) && clean.slice(Math.max(0, i - name[0].length - 120), i - name[0].length).match(/(?:^|[^\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]{1,80})?=\s*(?:await\s+)?$/);
        return { kind: 'arg', callee, ...(kept ? { kept: kept[1] } : {}) };
      }
      depth--;
    }
  }
  return { kind: 'arg', callee: null };
}

const WRAPS_FUNCTION = /^(?:React\.)?(?:useCallback|useMemo|memo|forwardRef|useEvent|useEffectEvent)$|^(?:_\.|lodash\.)?(?:debounce|throttle|once|memoize)$/;
const TEST_CALLS = /^(?:describe|it|test|context|suite|specify|before|after|beforeEach|afterEach|beforeAll|afterAll|setup|teardown|x?it|f?it|xdescribe|fdescribe|xtest|bench)(?:\.\w+)*$/;

function jsMoreFunctions(src, fns) {
  const clean = stripCommentsKeepLayout(src);
  const known = new Set(fns.map((f) => f.bodyStart));
  const found = [];
  const add = (fnIdx, paramsOpen, paramsClose, arrowParam, bo) => {
    if (known.has(bo + 1)) return null;
    const bc = matchClose(src, bo);
    if (bc < 0) return null;
    known.add(bo + 1);
    const line = lineAt(src, fnIdx);
    const params = arrowParam != null ? parseParams(arrowParam, 'typescript') : parseParams(src.slice(paramsOpen + 1, paramsClose), 'typescript');
    const f = { key: `fn@${fnIdx}`, line, params, returns: null, bodyStart: bo + 1, body: src.slice(bo + 1, bc), at: fnIdx, end: bc };
    found.push(f);
    return f;
  };
  // `function (…) {` and `function name(…) {` (a named one was found already; this gives it its assignment).
  const fnRe = /(?<![\w$.])function\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*(?:<[^>()]*>)?\s*\(/g;
  let m;
  while ((m = fnRe.exec(clean))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(src, open);
    if (close < 0) continue;
    const after = clean.slice(close + 1, close + 400);
    const typed = balancedReturnHead(after);
    const head = typed ? typed[0] : (after.match(/^\s*\{/) || [''])[0];
    if (!head.endsWith('{')) continue;
    const bo = close + head.length;
    const ctx = jsContext(clean, m.index);
    if (m[1]) {
      // Named: already an item; record what it is assigned to (`res.json = function json`, `Foo.prototype.bar = function bar`).
      const f = fns.find((x) => x.bodyStart === bo + 1);
      if (f && ctx.kind === 'assign' && !ctx.local) f.assignedTo = ctx.lhs;
      continue;
    }
    const f = add(m.index, open, close, null, bo);
    if (f) f.ctx = ctx;
  }
  // Arrow functions with a block body: `(req, res) => {`, `async x => {`.
  const arrowRe = /=>\s*\{/g;
  while ((m = arrowRe.exec(clean))) {
    const bo = m.index + m[0].length - 1;
    if (known.has(bo + 1)) continue;
    // The parameters: `(…)` (with an optional `: Type` after it) or one bare name, just before the arrow.
    let j = m.index - 1;
    while (j >= 0 && /\s/.test(clean[j])) j--;
    let start, paramText = null, pOpen = -1, pClose = -1;
    if (clean[j] === ')' || /[\w$>\]]/.test(clean[j])) {
      // Skip a return type: `(a: number): Promise<X> =>` — walk back to the ")" that closes the parameters.
      let k = j;
      if (clean[j] !== ')') {
        const bare = clean.slice(Math.max(0, j - 80), j + 1).match(/([A-Za-z_$][\w$]*)$/);
        const beforeBare = bare ? clean.slice(Math.max(0, j - bare[1].length - 40), j - bare[1].length + 1).replace(/\s+$/, '') : '';
        if (bare && !/:$/.test(beforeBare) && clean[j] !== '>' && clean[j] !== ']') { start = j - bare[1].length + 1; paramText = bare[1]; }
        else {
          // A typed return: find the ":" at depth 0 going back, then the ")".
          let d = 0;
          for (k = j; k >= Math.max(0, j - 300); k--) {
            const c = clean[k];
            if (c === '>' || c === ']' || c === ')' || c === '}') d++;
            else if (c === '<' || c === '[' || c === '(' || c === '{') d--;
            else if (c === ':' && d === 0) break;
          }
          k--; while (k >= 0 && /\s/.test(clean[k])) k--;
          if (clean[k] !== ')') continue;
        }
      }
      if (paramText == null) {
        let d = 0;
        for (pClose = k; k >= Math.max(0, pClose - 2000); k--) {
          if (clean[k] === ')') d++;
          else if (clean[k] === '(' && --d === 0) break;
        }
        if (d !== 0 || k < 0) continue;
        pOpen = k; start = k;
      }
    } else continue;
    // `async` and type parameters (`<T,>(x: T) =>`) belong to the function.
    let s = start;
    const lead = clean.slice(Math.max(0, s - 60), s).match(/(?:\basync\s*)?(?:<[^<>()]*>\s*)?$/);
    if (lead) s -= lead[0].length;
    // A call written `fn(x) => {` is not an arrow function's parameters: the "(" must not follow a name.
    if (pOpen >= 0) { const prev = clean.slice(Math.max(0, s - 40), s).replace(/\s+$/, ''); if (/[\w$]$/.test(prev) && !/\b(?:async|return|await|yield|default|in|of|case)$/.test(prev)) continue; }
    const ctx = jsContext(clean, s);
    // `const f = (…) => {` is already an item (found with its name).
    if (ctx.kind === 'assign' && ctx.local && fns.some((x) => x.name === ctx.lhs && x.line === lineAt(src, s))) continue;
    const f = add(s, pOpen, pClose, paramText, bo);
    if (f) f.ctx = ctx;
  }
  if (!found.length) return;
  // A test's body (`describe(…, function () {…})`, `it(…, () => {…})`) is a test, not part of the app: it and every
  // function written inside it stay out (tests are listed as tests).
  const tests = found.filter((f) => f.ctx.kind === 'arg' && TEST_CALLS.test(f.ctx.callee ?? ''));
  if (tests.length) {
    const inTest = (f) => tests.some((t) => t === f || (t.bodyStart <= f.at && f.at <= t.end));
    for (let i = found.length - 1; i >= 0; i--) if (inTest(found[i])) found.splice(i, 1);
  }
  // Names. Every function's range, so a callback is named after the function it is written in.
  const ranges = [...fns, ...found].filter((x) => x.bodyStart != null).map((x) => ({ x, from: x.bodyStart, to: x.end ?? x.bodyStart + (x.body?.length ?? 0) }));
  const parentOf = (f) => {
    let best = null;
    for (const r of ranges) if (r.x !== f && r.x.name && !r.x.callback && r.from <= f.at && f.at <= r.to && (!best || r.from > best.from)) best = r;
    return best?.x ?? null;
  };
  for (const f of found) {
    const ctx = f.ctx;
    if (ctx.kind === 'assign' && !/\]$/.test(ctx.lhs)) {
      const seg = ctx.lhs.split('.').pop();
      f.name = seg;
      if (!ctx.local) f.assignedTo = ctx.lhs;
    } else if (ctx.kind === 'key') f.name = ctx.key;
    else if (ctx.kept) f.name = ctx.kept;
    else f.callback = true;
  }
  // Callbacks are named once every assigned function has its name (a callback inside `exports.x = function` is "x › …").
  for (const f of found) {
    if (!f.callback) continue;
    const parent = parentOf(f);
    const via = f.ctx.kind === 'arg' && f.ctx.callee ? f.ctx.callee : f.ctx.kind === 'assign' ? f.ctx.lhs : null;
    f.name = `${parent?.name ?? via ?? 'function'} › callback at line ${f.line}`;
    if (via) f.passedTo = via;
  }
  for (const f of found) { delete f.ctx; delete f.at; fns.push(f); }
}

// ── C, C++, and Swift: function definitions ──────────────────────────────────────────────────────────

/** C/C++ with every preprocessor line (and its `\` continuations) blanked to spaces, so offsets and lines stay put. */
export function blankPreprocessor(src) {
  const lines = String(src).split('\n');
  let cont = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!cont && !/^[ \t]*#/.test(l)) continue;
    cont = /\\\r?$/.test(l);
    lines[i] = ' '.repeat(l.length);
  }
  return lines.join('\n');
}

/**
 * The source with comments and the inside of strings and chars blanked (same length, same lines), so brackets can be
 * counted without being fooled by a `{` in a string. Handles C++ raw strings R"x(…)x" and triple-quoted strings.
 */
function maskCode(src) {
  const a = String(src).split('');
  const n = a.length;
  const blank = (from, to) => { for (let k = from; k < to && k < n; k++) if (a[k] !== '\n') a[k] = ' '; };
  for (let i = 0; i < n; i++) {
    const c = a[i];
    if (c === '/' && a[i + 1] === '/') { let j = i; while (j < n && a[j] !== '\n') j++; blank(i, j); i = j; continue; }
    if (c === '/' && a[i + 1] === '*') { let j = i + 2; while (j < n && !(a[j] === '*' && a[j + 1] === '/')) j++; blank(i, j + 2); i = j + 1; continue; }
    if (c === '"' && a[i + 1] === '"' && a[i + 2] === '"') { const e = src.indexOf('"""', i + 3); const end = e < 0 ? n : e; blank(i + 3, end); i = end + 2; continue; }
    if (c === '"' && a[i - 1] === 'R' && /(?:^|[^\w])(?:u8|u|U|L)?R$/.test(src.slice(Math.max(0, i - 4), i))) {
      const paren = src.indexOf('(', i);
      const delim = paren > i && paren - i < 18 ? src.slice(i + 1, paren) : null;
      if (delim != null && /^[^\s()\\]*$/.test(delim)) {
        const e = src.indexOf(`)${delim}"`, paren);
        const end = e < 0 ? n : e;
        blank(i + 1, end + delim.length + 1);
        i = end + delim.length + 1;
        continue;
      }
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < n; j++) {
        if (a[j] === '\\') { if (a[j + 1] !== '\n') a[j + 1] = ' '; a[j] = ' '; j++; continue; }
        if (a[j] === c || a[j] === '\n') break;
        a[j] = ' ';
      }
      i = j;
    }
  }
  return a.join('');
}

/** Index of the bracket closing the one at `open` in masked text (no strings or comments left to skip). */
function closeIn(masked, open) {
  const o = masked[open], c = { '{': '}', '(': ')', '[': ']' }[o];
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === o) depth++;
    else if (masked[i] === c && --depth === 0) return i;
  }
  return -1;
}

/** Blank `name(…)` groups (balanced) in a header, keeping its length. */
function blankCalls(h, names) {
  let out = h;
  for (const m of h.matchAll(names)) {
    const open = out.indexOf('(', m.index + m[0].length - 1);
    if (open < 0) continue;
    const close = closeIn(out, open);
    if (close < 0) continue;
    out = out.slice(0, m.index) + ' '.repeat(close + 1 - m.index) + out.slice(close + 1);
  }
  return out;
}

/** A C/C++ declaration header with access labels, templates, and attributes blanked (same length). */
function cleanCHeader(header) {
  let h = header.replace(/(?<![\w:])(?:public|private|protected|signals|slots|Q_SIGNALS|Q_SLOTS)\s*:(?!:)/g, (m) => ' '.repeat(m.length));
  // template <…> (angle brackets balanced) and [[attributes]].
  for (let at = h.indexOf('template'); at >= 0; at = h.indexOf('template', at + 1)) {
    if (/\w/.test(h[at - 1] || '') || /\w/.test(h[at + 8] || '')) continue;
    let j = at + 8;
    while (/\s/.test(h[j] || '')) j++;
    if (h[j] !== '<') continue;
    let depth = 0, k = j;
    for (; k < h.length; k++) { if (h[k] === '<') depth++; else if (h[k] === '>' && --depth === 0) break; }
    if (k >= h.length) break;
    h = h.slice(0, at) + ' '.repeat(k + 1 - at) + h.slice(k + 1);
  }
  for (let at = h.indexOf('[['); at >= 0; at = h.indexOf('[[', at + 2)) {
    const e = h.indexOf(']]', at);
    if (e < 0) break;
    h = h.slice(0, at) + ' '.repeat(e + 2 - at) + h.slice(e + 2);
  }
  return blankCalls(h, /\b(?:__attribute__|__declspec|alignas|_Alignas|__THROW_?\w*|__nonnull|__wur)\s*\(/g);
}

const C_NOT_NAMES = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'else', 'do', 'case', 'defined', 'alignof', 'decltype', 'static_assert', '_Static_assert', 'typeof', '__typeof__', 'asm', '__asm__', 'new', 'delete', 'throw', 'noexcept', 'requires', 'operator', 'using', 'typedef', 'goto']);
const C_STORAGE = /\b(?:static|inline|extern|virtual|explicit|constexpr|consteval|constinit|friend|__inline|__inline__|__forceinline|register|thread_local|_Noreturn|_Thread_local)\b/g;

/** After a parameter list: const, noexcept, override, `-> type`, macros, or a constructor's `: init(…)` list. */
function cSuffixOk(s, language) {
  let i = 0;
  const n = s.length;
  const skipParens = () => { if (s[i] === '(') { const c = closeIn(s, i); i = c < 0 ? n : c + 1; } };
  for (let guard = 0; guard < 40; guard++) {
    while (i < n && /\s/.test(s[i])) i++;
    if (i >= n) return true;
    const rest = s.slice(i, i + 40);
    let m;
    if ((m = rest.match(/^(?:const|volatile|override|final|mutable|noexcept|throw|try|&&|&)(?!\w)/))) { i += m[0].length; while (/\s/.test(s[i] || '')) i++; skipParens(); continue; }
    if (s[i] === '-' && s[i + 1] === '>') return language === 'cpp'; // a trailing return type runs to the body
    if (s[i] === ':' && s[i + 1] !== ':') return language === 'cpp'; // a constructor's member initializer list
    if ((m = rest.match(/^requires\b/))) return language === 'cpp';
    if ((m = rest.match(/^[A-Z_][A-Z0-9_]*(?!\w)/))) { i += m[0].length; while (/\s/.test(s[i] || '')) i++; skipParens(); continue; } // FMT_NOEXCEPT, __THROW
    return false;
  }
  return false;
}

/**
 * What a C/C++ function gives back, from the text before its name and the text after its parameters: macros in front
 * of the type (`FMT_CONSTEXPR void`, `JSON_HEDLEY_ALWAYS_INLINE std::size_t`) are not part of it, `void` is nothing,
 * and `auto f() -> T` gives back T.
 */
function cReturnType(prefix, after) {
  const toks = String(prefix || '').trim().split(/\s+/).filter(Boolean);
  // A leading all-caps word is a macro when a real type follows it (`FILE *` keeps FILE: only `*` follows).
  while (toks.length > 1 && /^[A-Z_][A-Z0-9_]*$/.test(toks[0]) && toks.slice(1).some((t) => /[A-Za-z_]/.test(t))) toks.shift();
  let t = toks.join(' ');
  if (/^auto$/.test(t)) {
    const tr = String(after || '').match(/->\s*([^{;]+?)\s*(?:requires\b[^{;]*)?$/);
    const trail = tr ? tr[1].replace(/\s+/g, ' ').trim() : '';
    if (trail && !/^decltype\b/.test(trail)) t = trail;
  }
  return t && !/^void$/.test(t) && !/^[A-Z_][A-Z0-9_]*$/.test(t) || /^[A-Z][A-Z0-9]*$/.test(t) ? t : null;
}

/** A function definition head (the text before a `{` at file, namespace, or class level), or null. */
function cHead(header, language, container) {
  const h = cleanCHeader(header);
  const start = h.search(/\S/);
  if (start < 0) return null;
  let depth = 0;
  for (let o = 0; o < h.length; o++) {
    if (h[o] === ')') { depth--; continue; }
    if (h[o] !== '(') continue;
    if (depth++ !== 0) continue;
    const c = closeIn(h, o);
    if (c < 0) return null;
    const before = h.slice(Math.max(0, o - 300), o);
    const nm = before.match(/((?:[A-Za-z_]\w*(?:<[^<>()]*>)?\s*::\s*)*)(operator\s*(?:\(\s*\)|\[\s*\]|new\b|delete\b|[^\s\w()]+|[A-Za-z_][\w:<> ]*?)|~?[A-Za-z_]\w*)\s*$/);
    if (!nm || C_NOT_NAMES.has(nm[2]) || !cSuffixOk(h.slice(c + 1), language)) { o = c; depth--; continue; }
    const nameAt = o - nm[0].length + nm[1].length;
    const prefix = blankCalls(h.slice(start, o - nm[0].length), /\b[A-Z_][A-Z0-9_]*\s*\(/g);
    if (!/^[\w\s*&:<>,"~]*$/.test(prefix) || /(?:^|\s)(?:return|else|case|goto|new|delete|throw|typedef|using|co_return|co_await|co_yield|sizeof)\s*$/.test(prefix)) return null;
    const qualifier = nm[1] ? nm[1].replace(/<[^<>]*>/g, '').split('::').map((x) => x.trim()).filter(Boolean).pop() : null;
    const name = nm[2].replace(/\s+/g, ' ').trim();
    const returns = prefix.replace(C_STORAGE, ' ').replace(/""/g, ' ').replace(/\s+/g, ' ').trim();
    if (!returns && language === 'c') return null;
    // No return type: only a constructor or destructor has none (`TEST(A, B) {` is a macro, not a function).
    const ctor = /^~/.test(name) || (qualifier && qualifier === name.replace(/^~/, '')) || (container && container === name.replace(/^~/, ''));
    if (!returns && !ctor) return null;
    return { name, nameAt, open: o, close: c, returns: ctor ? null : cReturnType(returns, h.slice(c + 1)), qualifier, startAt: start };
  }
  return null;
}

/** A class, struct, union, namespace, or extern "C" header whose braces hold more declarations. Gives its name ('' if none) or null. */
function cContainer(header) {
  let h = cleanCHeader(header);
  for (let k = 0; k < 6 && /<[^<>]*>/.test(h); k++) h = h.replace(/<[^<>]*>/g, ' ');
  // A macro may stand in front of the class (NLOHMANN_BASIC_JSON_TPL_DECLARATION class basic_json, FMT_EXPORT class …).
  h = h.trim().replace(/^(?:[A-Z_][A-Z0-9_]*(?:\s*\([^()]*\))?\s+)+(?=(?:typedef\s+)?(?:class|struct|union|namespace|inline\s+namespace|extern)\b)/, '');
  if (/^extern\s*""$/.test(h)) return '';
  if (/^(?:inline\s+)?namespace\b[^()=;]*$/.test(h)) return '';
  const m = h.match(/^(?:typedef\s+)?(?:class|struct|union)\b([^()=;]*)$/);
  if (!m) return null;
  const names = (m[1].split(/:(?!:)/)[0].match(/[A-Za-z_]\w*/g) || []).filter((w) => w !== 'final');
  return names[names.length - 1] || '';
}

/** Lines that can carry the start of a C signature above the name: a return type, a template, a macro. */
const C_SIG_LINE = /^\s*[\w<>:,*&\s]+$/;

/** C and C++ function definitions, found by walking scopes: file, namespaces, extern "C", classes and structs. */
function findCFunctions(code, language) {
  const masked = maskCode(code);
  const lines = code.split('\n');
  const fns = [];
  const stack = [];
  let stmtStart = 0;
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === ';') { stmtStart = i + 1; continue; }
    if (ch === '}') { stack.pop(); stmtStart = i + 1; continue; }
    if (ch !== '{') continue;
    // Comments and #lines are blank in the mask: a header starts at its first real character (a long license
    // comment above the first function must not make its header look too long to be one).
    while (stmtStart < i && /\s/.test(masked[stmtStart])) stmtStart++;
    const header = masked.slice(stmtStart, i);
    const close = closeIn(masked, i);
    const head = header.length < 4000 ? cHead(header, language, stack[stack.length - 1]) : null;
    if (head && close > 0) {
      const nameAt = stmtStart + head.nameAt;
      const fnLine = lineAt(code, nameAt);
      // The doc comment sits above the whole signature: a return type or template may be on the lines above the name.
      let docLine = fnLine;
      for (let k = 0; k < 3 && docLine >= 2 && lineAt(code, stmtStart + head.startAt) < docLine && C_SIG_LINE.test(lines[docLine - 2]) && lines[docLine - 2].trim(); k++) docLine--;
      const doc = leadingDoc(lines, docLine, language);
      fns.push({
        key: `${head.name}@${nameAt}`, name: head.name, line: fnLine,
        params: parseParams(code.slice(stmtStart + head.open + 1, stmtStart + head.close), language),
        returns: head.returns ? cType(head.returns) : null, bodyStart: i + 1, body: code.slice(i + 1, close),
        ...(head.qualifier ? { qualifier: head.qualifier } : {}), ...(doc ? { doc } : {}),
      });
      i = close; stmtStart = close + 1;
      continue;
    }
    const container = cContainer(header);
    if (container != null) { stack.push(container); stmtStart = i + 1; continue; }
    if (close < 0) break;
    i = close; // an initializer, an enum, a lambda: braces that hold no functions
  }
  return fns;
}

/** After a Swift parameter list: async, throws, `-> Type`, `where …`, then the body's `{`. Null for a bodiless requirement. */
function swiftHead(after) {
  const brace = after.indexOf('{');
  if (brace < 0) return null;
  const mid = after.slice(0, brace);
  if (/[;}=]/.test(mid.replace(/->/g, '')) || /\n\s*(?:@|func\b|var\b|let\b|case\b|init\b|deinit\b|static\b|class\b|struct\b|enum\b|public\b|private\b|internal\b|fileprivate\b|open\b|mutating\b|override\b|subscript\b|typealias\b|associatedtype\b|convenience\b|required\b|final\b|#)/.test(mid)) return null;
  let rest = mid.replace(/^\s*(?:async\s+)?(?:(?:re)?throws(?:\s*\([^)]*\))?\s*)?(?:async\s+)?/, '');
  let returns = null;
  if (/^->/.test(rest)) {
    rest = rest.slice(2);
    const where = rest.search(/\bwhere\b/);
    returns = (where < 0 ? rest : rest.slice(0, where)).trim() || null;
  } else if (rest.trim() && !/^where\b/.test(rest.trim())) return null;
  return { returns, brace };
}


/** Swift functions: func, init, computed properties, and Vapor route closures (`app.get("orders", ":id") { req in … }`). */
function findSwiftFunctions(src) {
  const masked = maskCode(src);
  const fns = [];
  // extension Library { … }: the methods inside belong to Library, though they are written outside the type.
  const exts = [];
  for (const m of masked.matchAll(/(?:^|[\s;}])extension[ \t]+([\w.]+)[^{\n]*\{/g)) {
    const open = m.index + m[0].length - 1, close = closeIn(masked, open);
    if (close > 0) exts.push([open, close, m[1].split('.').pop()]);
  }
  const extOf = (at) => exts.find(([a, b]) => at > a && at < b)?.[2] ?? null;
  const bodies = [];
  const push = (fn, open, close) => { fns.push({ ...fn, bodyStart: open + 1, body: src.slice(open + 1, close) }); bodies.push([open, close]); };
  for (const m of masked.matchAll(/(?:^|[^\w.])(?:func[ \t]+([A-Za-z_]\w*|`\w+`|[^\s(<\w`]+)|(init)[?!]?|(subscript))[ \t]*(?:<[^>{}()]*>)?[ \t]*\(/g)) {
    const name = (m[1] || m[2] || m[3]).replace(/`/g, '');
    const open = m.index + m[0].length - 1;
    const close = closeIn(masked, open);
    if (close < 0) continue;
    const head = swiftHead(masked.slice(close + 1, close + 1 + 2000));
    if (!head) continue;
    const bo = close + 1 + head.brace, bc = closeIn(masked, bo);
    if (bc < 0) continue;
    const nameAt = m.index + m[0].indexOf(m[1] || m[2] || m[3]);
    const qualifier = extOf(m.index);
    // A subscript with get { … } set { … }: what it gives back is its getter.
    const getter = name === 'subscript' ? masked.slice(bo + 1, bc).match(/^\s*get\s*\{/) : null;
    if (getter) { const go = bo + 1 + getter[0].length - 1, gc = closeIn(masked, go); if (gc > 0) { push({ key: `${name}@${nameAt}`, name, line: lineAt(src, nameAt), params: parseParams(src.slice(open + 1, close), 'swift'), returns: head.returns, ...(qualifier ? { qualifier } : {}) }, go, gc); continue; } }
    push({ key: `${name}@${nameAt}`, name, line: lineAt(src, nameAt), params: parseParams(src.slice(open + 1, close), 'swift'), returns: head.returns, ...(qualifier ? { qualifier } : {}) }, bo, bc);
  }
  // Computed properties read like a function with no inputs: var total: Int { … } (or its get { … }).
  for (const m of masked.matchAll(/(?:^|[\s;{}])(?:@\w+(?:\([^()\n]*\))?[ \t]+)*(?:(?:public|private|internal|fileprivate|open|static|class|override|final|nonisolated)(?:\(set\))?[ \t]+)*var[ \t]+(\w+)[ \t]*:[ \t]*([^={}\n]+)\{/g)) {
    let open = m.index + m[0].length - 1;
    let close = closeIn(masked, open);
    if (close < 0 || bodies.some(([a, b]) => open > a && open < b)) continue;
    const inner = masked.slice(open + 1, close).trim();
    if (/^(?:willSet|didSet|set|_read|_modify)\b/.test(inner) || /^get\s*(?:set\s*)?$|^get\s+(?:async|throws)/.test(inner)) continue;
    const g = masked.slice(open + 1, close).match(/^\s*get\s*\{/);
    if (g) { open = open + 1 + g[0].length - 1; close = closeIn(masked, open); if (close < 0) continue; }
    const nameAt = masked.indexOf(m[1], m.index + m[0].lastIndexOf('var') + 3);
    const qualifier = extOf(m.index);
    push({ key: `${m[1]}@${nameAt}`, name: m[1], line: lineAt(src, nameAt), params: [], returns: m[2].trim(), computed: true, ...(qualifier ? { qualifier } : {}) }, open, close);
  }
  // Vapor routes. Literal path pieces only; grouped(...) prefixes are followed when they are literal too.
  const literalPath = (args) => {
    const pieces = [];
    for (const raw of splitTop(args, ',').map((x) => x.trim()).filter(Boolean)) {
      if (/^\w+\s*:/.test(raw)) continue; // named arguments (use:, body:)
      let m;
      if ((m = raw.match(/^"([^"\\]*)"$/))) pieces.push(m[1].replace(/^\/+|\/+$/g, ''));
      else if (raw === '.catchall' || raw === '"**"') pieces.push('**');
      else if (raw === '.anything') pieces.push('*');
      else if (/^\.(?:GET|POST|PUT|PATCH|DELETE)$/.test(raw)) continue;
      else return null;
    }
    return pieces.filter(Boolean).join('/');
  };
  const groups = new Map();
  for (const m of src.matchAll(/\blet[ \t]+(\w+)[ \t]*=[ \t]*(\w+)\.grouped\(([^()\n]*)\)/g)) groups.set(m[1], { parent: m[2], path: literalPath(m[3]) });
  const prefixOf = (v, depth = 0) => { const g = groups.get(v); if (!g || g.path == null || depth > 6) return g ? null : ''; const up = prefixOf(g.parent, depth + 1); return up == null ? null : [up, g.path].filter(Boolean).join('/'); };
  const routeFor = new Map();
  for (const m of masked.matchAll(/\b(\w+)\.(get|post|put|patch|delete|on)\(([^()]*?)\buse:[ \t]*(?:self\.)?(\w+)[ \t]*\)/g)) {
    if (!(groups.has(m[1]) || /^(?:app|routes?|router|r|api|v\d+|\w*(?:[Rr]outes?|[Gg]roup|[Rr]outer))$/.test(m[1]))) continue;
    const args = src.slice(m.index + m[0].indexOf('(') + 1, m.index + m[0].length - 1);
    const method = m[2] === 'on' ? (args.match(/\.(GET|POST|PUT|PATCH|DELETE)\b/) || [])[1] : m[2].toUpperCase();
    const path = literalPath(args.replace(/\buse:[\s\S]*$/, '')), prefix = prefixOf(m[1]);
    if (method && path != null && prefix != null) routeFor.set(m[4], { method, path: `/${[prefix, path].filter(Boolean).join('/')}` });
  }
  for (const m of masked.matchAll(/\b(\w+)\.(get|post|put|patch|delete|on)\(([^()]*)\)[ \t]*\{/g)) {
    const argsAt = m.index + m[0].indexOf('(') + 1;
    const args = src.slice(argsAt, argsAt + m[3].length);
    const method = m[2] === 'on' ? (args.match(/\.(GET|POST|PUT|PATCH|DELETE)\b/) || [])[1] : m[2].toUpperCase();
    const path = literalPath(args), prefix = prefixOf(m[1]);
    // Only a router registers routes (app, routes, a grouped(...) value): `cache.get("x") { … }` is a callback.
    if (!method || path == null || prefix == null || !(groups.has(m[1]) || /^(?:app|routes?|router|r|api|v\d+|\w*(?:[Rr]outes?|[Gg]roup|[Rr]outer))$/.test(m[1]))) continue;
    const bo = m.index + m[0].length - 1, bc = closeIn(masked, bo);
    if (bc < 0) continue;
    const params = src.slice(bo + 1, bc).match(SWIFT_CLOSURE_PARAMS);
    if (!params) continue; // a route's handler always takes the request
    const full = `/${[prefix, path].filter(Boolean).join('/')}`;
    push({ name: `${method} ${full}`, line: lineAt(src, m.index), params: [], returns: null, route: { method, path: full } }, bo + params[0].length, bc);
  }
  for (const fn of fns) if (!fn.route && routeFor.has(fn.name)) fn.route = routeFor.get(fn.name);
  return fns.sort((a, b) => a.line - b.line);
}

// ── Labels, plumbing, and completeness: facts views need, so they never re-derive them ─────────────────

/** A display name: late_fee -> "Late fee", deliveryFee -> "Delivery fee", __init__ -> "Init". */
export function displayLabel(name) {
  const w = String(name).replace(/^_+|_+$/g, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : String(name);
}

/** Inputs that are framework plumbing rather than something a person gives. */
const PLUMBING = /^(self|this|cls|db|session|conn|connection|cursor|tx|transaction|request|req|res|response|ctx|context|c|w|r|next|logger|log|deps|container|di|cancellationToken|ct|ec|app|g)$/i;
/**
 * Framework plumbing is left out of "You give it". A plain `Request` or `Response` (the fetch types, or a response
 * a helper inspects) is plumbing only in a web handler: in `cancelBody(value: Response, keep?: Response)` or
 * `streamRequest(request: Request, …)` it is the very thing the function works on.
 */
function isPlumbing(p, params, fn) {
  if (/^(self|this|cls)$/i.test(p.name)) return true;
  const web = !!fn.route || params.some((x) => /^(?:req|res|reply|ctx|c|w|r|next)$/.test(x.name) || /HttpRequest|HttpResponse|ResponseWriter|NextFunction|HttpContext|ServerRequest|FastifyRequest|FastifyReply|NextRequest|HttpServletRequest/.test(String(x.type || '')));
  const t = String(p.type || '');
  if (/^(?:request|response)$/i.test(p.name) || (t && /^(?:Request|Response)(?:\s*\|.*)?$|\|\s*(?:Request|Response)\b/.test(t) && !/Http|Servlet|Fastify|Next/.test(t))) return web;
  return t ? PLUMBING_TYPE.test(t) : PLUMBING.test(p.name);
}
const PLUMBING_TYPE = /\b(Session|AsyncSession|DbContext|Connection|HttpRequest|HttpResponse|Request|Response|Context|ResponseWriter|CancellationToken|ILogger|Logger|NextFunction)\b/;

const allSteps = (steps) => (steps || []).flatMap((s) => [s, ...allSteps(s.children), ...allSteps(s.otherwise), ...(s.handlers || []).flatMap((h) => allSteps(h.steps)), ...allSteps(s.always?.steps)]);

/**
 * How completely Thunder explains an item, with the reasons. "explained": every step says what it does and every
 * branch is shown; "partly explained": something is shown as code or not read; "found": Thunder found the function
 * but could not turn it into steps or rules. ("executed" is for a view that has also run it.)
 */
export function completenessOf(item) {
  const reasons = [];
  if (item.kind === 'decision') {
    if (item.unread?.length) reasons.push(`${item.unread.length} line${item.unread.length === 1 ? '' : 's'} not read`);
    return { level: reasons.length ? 'partly explained' : 'explained', reasons };
  }
  const steps = allSteps(item.steps);
  if (!steps.length) return { level: 'found', reasons: ['No steps could be read; see the original code.'] };
  const code = steps.filter((s) => s.kind === 'other').length;
  const restated = steps.filter((s) => s.restates).length;
  if (code) reasons.push(`${code} step${code === 1 ? '' : 's'} shown as code`);
  const named = steps.filter((s) => s.unknownCommand).length;
  if (named) reasons.push(`${named} command${named === 1 ? '' : 's'} only named, not explained`);
  if (restated) reasons.push(`${restated} step${restated === 1 ? '' : 's'} only restate the code`);
  if (item.anchor && item.anchor.coverage < 1) reasons.push(`${item.anchor.missing.length ? `lines ${item.anchor.missing.join(', ')}` : 'some lines'} not tied to a step`);
  return { level: reasons.length ? 'partly explained' : 'explained', reasons };
}

// ── Python helpers: balanced text across lines, multi-line `def` headers, docstrings ─────────────────
/** Text from lines[i] at column `col` until brackets balance (strings skipped). Returns { text, end } (end line index). */
function pyBalanced(lines, i, col) {
  let depth = 0, text = '', quote = null;
  for (let j = i; j < lines.length; j++) {
    const l = j === i ? lines[j].slice(col) : lines[j];
    for (let k = 0; k < l.length; k++) {
      const c = l[k];
      if (quote) { if (c === '\\') k++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '#') break;
      else if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
    }
    text += (j === i ? '' : '\n') + l;
    quote = null; // Python strings do not span lines without triple quotes; triple-quoted args are rare in headers
    if (depth <= 0) return { text, end: j };
  }
  return { text, end: lines.length - 1 };
}

/** A `def name(` header starting at lines[i], `open` = column of `(`. Returns { params, returns, after, endLine } or null. */
function pyHeader(lines, i, open) {
  let depth = 0, quote = null, params = '', closed = false, tail = '';
  for (let j = i; j < lines.length && j < i + 80; j++) {
    const l = lines[j];
    for (let k = j === i ? open : 0; k < l.length; k++) {
      const c = l[k];
      if (!closed) {
        if (quote) { params += c; if (c === '\\') { params += l[k + 1] ?? ''; k++; } else if (c === quote) quote = null; continue; }
        if (c === '#') break;
        if (c === '"' || c === "'") { quote = c; params += c; continue; }
        if (c === '(') { if (depth++ === 0) continue; }
        else if (c === ')') { if (--depth === 0) { closed = true; continue; } }
        params += c;
        continue;
      }
      // After the parameter list: `-> type` (brackets may wrap lines), then the header's own colon.
      if (c === '#' && depth === 0) break;
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      if (c === ':' && depth === 0) {
        const ret = tail.trim().replace(/^->\s*/, '').replace(/\s+/g, ' ').trim();
        return { params: params.replace(/\s+/g, ' ').trim(), returns: ret || null, after: l.slice(k + 1), endLine: j };
      }
      tail += c;
    }
    if (!closed) params += ' ';
    else tail += ' ';
  }
  return null;
}

/** The function's docstring (first statement), as plain text: its first paragraph, without Args/Returns sections. */
function pyDocstring(lines, from) {
  let j = from;
  while (j < lines.length && (!lines[j].trim() || /^\s*#/.test(lines[j]))) j++;
  const first = lines[j]?.trim();
  const m = first?.match(/^([rRuU]?)("""|\'\'\'|"|')/);
  if (!m) return null;
  const q = m[2];
  let text = first.slice(m[0].length);
  if (text.includes(q)) text = text.slice(0, text.indexOf(q));
  else {
    if (q.length === 1) return null;
    for (let k = j + 1; k < lines.length && k < j + 60; k++) {
      const at = lines[k].indexOf(q);
      if (at >= 0) { text += '\n' + lines[k].slice(0, at); break; }
      text += '\n' + lines[k];
    }
  }
  return cleanDoc(text);
}

/** First paragraph of a doc comment, whitespace collapsed, without parameter sections. Null when empty. */
function cleanDoc(text) {
  const para = [];
  for (const raw of String(text).split('\n')) {
    const t = raw.replace(/^\s*(\*|\/\/\/?|#)?\s?/, '').trim();
    if (/^(@\w+|:(param|return|rtype|raises|type)\b|(Args|Arguments|Parameters|Returns|Raises|Yields|Example|Examples|Note|Notes)\s*:|<\/?(summary|param|returns)\b)/i.test(t)) break;
    if (!t) { if (para.length) break; continue; }
    para.push(t.replace(/<\/?summary>/g, ''));
  }
  const s = para.join(' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > 300 ? `${s.slice(0, 299)}…` : s;
}

// A doc comment directly above a function (a /** block, /// lines, Go // lines, Ruby # lines), skipping annotations.
function leadingDoc(lines, fnLine, language) {
  let k = fnLine - 2;
  while (k >= 0 && /^\s*(@|#\[|\[[A-Z])/.test(lines[k])) k--; // annotations and attributes
  if (k < 0) return null;
  // C and C++ document with plain block comments (/* … */) as often as with /** … */.
  if ((language === 'c' || language === 'cpp') && /\*\/\s*$/.test(lines[k])) {
    const end = k;
    while (k >= 0 && !/\/\*/.test(lines[k])) k--;
    if (k < 0 || !/^\s*\/\*/.test(lines[k])) return null; // a comment at the end of a line of code is not a doc
    return cleanDoc(lines.slice(k, end + 1).join('\n').replace(/^\s*\/\*+!?/, '').replace(/\*+\/\s*$/, ''));
  }
  if (/\*\/\s*$/.test(lines[k])) {
    const end = k;
    // (The block that ends here starts at the nearest /*; a plain /* … */ such as /*#__PURE__*/ is not a doc, and
    // a doc comment further up belongs to something else.)
    while (k >= 0 && !/\/\*/.test(lines[k])) k--;
    if (k < 0 || !/^\s*\/\*\*(?!\/)/.test(lines[k])) return null;
    return cleanDoc(lines.slice(k, end + 1).join('\n').replace(/^\s*\/\*\*/, '').replace(/\*\/\s*$/, ''));
  }
  const lineDoc = language === 'go' || language === 'c' || language === 'cpp' ? /^\s*\/\/(?!\/)|^\s*\/\/\/(?!\/)/ : language === 'ruby' ? /^\s*#(?![!{])/ : /^\s*\/\/\//;
  const got = [];
  while (k >= 0 && lineDoc.test(lines[k])) got.unshift(lines[k--]);
  return got.length ? cleanDoc(got.join('\n')) : null;
}

/**
 * A controller's route prefix joined to a method's path: ASP.NET `[Route("api/[controller]")]` on the class (with
 * [controller] the class name less "Controller") or Spring `@RequestMapping("/api")` on the class. A method path
 * that starts at the root (`/x`, or `~/x` in ASP.NET) keeps no prefix. With neither, the method's own path, from "/".
 */
function withClassPrefix(lines, fnLine, path, style) {
  // ASP.NET: a method template starting at the root (/x or ~/x) replaces the controller's. Spring always joins them.
  if (style === 'aspnet' && /^~?\//.test(path)) return '/' + path.replace(/^~?\/+/, '');
  let prefix = '';
  for (let i = fnLine - 2; i >= 0; i--) {
    const c = lines[i].match(/\bclass\s+(\w+)/);
    if (!c) continue;
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      const t = lines[j].trim();
      const r = style === 'aspnet' ? t.match(/^\[(?:Route|RoutePrefix)\(\s*"([^"]*)"/) : t.match(/^@RequestMapping\(\s*(?:value\s*=\s*|path\s*=\s*)?(?:\{\s*)?["']([^"']*)["']/);
      if (r) { prefix = r[1].replace(/\[controller\]/gi, c[1].replace(/Controller$/, '')); break; }
      if (t && !/^(\[|@|\/\/|\*|\/\*)/.test(t)) break;
    }
    break;
  }
  return '/' + [prefix, path].map((x) => x.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
}

/** Mark functions that a decorator or annotation binds to an HTTP route. */
function annotateRoutes(fns, src) {
  // Decorated handlers: @app.get("/x") / @router.post (Python), @GetMapping (Spring), [HttpGet] (ASP.NET), @Get() (NestJS).
  const lines = src.split('\n');
  for (const fn of fns) {
    if (fn.route) continue;
    // Python collects whole decorators (they can span lines); other languages look at the few lines above.
    const above = fn.decorators
      ? [...fn.decorators].reverse()
      : lines.slice(Math.max(0, fn.line - 6), Math.max(0, fn.line - 1)).reverse().map((x) => x.trim());
    for (const l of above) {
      let m;
      if ((m = l.match(/^@\w+\.(get|post|put|patch|delete)\(\s*['"]([^'"]*)['"]/i))) { fn.route = { method: m[1].toUpperCase(), path: m[2] }; break; }
      if ((m = l.match(/^@\w+\.route\(\s*['"]([^'"]*)['"](?:.*methods\s*=\s*\[\s*['"](\w+)['"])?/))) { fn.route = { method: (m[2] || 'GET').toUpperCase(), path: m[1] }; break; }
      if ((m = l.match(/^@(Get|Post|Put|Patch|Delete|Request)Mapping(?:\(\s*(?:value\s*=\s*|path\s*=\s*)?(?:\{\s*)?["']([^"']*)["'])?/))) { fn.route = { method: m[1] === 'Request' ? 'ANY' : m[1].toUpperCase(), path: withClassPrefix(lines, fn.line, m[2] || '', 'spring') }; break; }
      if ((m = l.match(/^#\[Route\(\s*(?:path:\s*)?['"]([^'"]*)['"](?:.*methods:\s*\[\s*['"](\w+)['"])?/))) { fn.route = { method: (m[2] || 'ANY').toUpperCase(), path: m[1] }; break; }
      if ((m = l.match(/^\[Http(Get|Post|Put|Patch|Delete)(?:\(\s*"([^"]*)")?/))) { fn.route = { method: m[1].toUpperCase(), path: withClassPrefix(lines, fn.line, m[2] || '', 'aspnet') }; break; }
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
      const next = src.slice(i + 1, i + 400); // only the start of the next line matters
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
  return mapCode(phpHashComments(src), (code) => code
    // `.` is PHP's text join (`$a.$b`, `'x'.$y`); spaced, it can never be read as `a.b` (a property) below.
    .replace(/(?<![.\d])\.(?![.=\d])/g, ' . ')
    .replace(/\$this\s*->/g, 'this.')
    .replace(/\$(?=[A-Za-z_])/g, '')
    .replace(/(\w|\))\s*(?:\?)?->\s*(?=[A-Za-z_])/g, '$1.')
    .replace(/\belseif\b/g, 'else if'));
}

const stripRubyStrings = (t) => String(t).replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, 'Q');

/** PHP `# comment` as `// comment`, outside strings (a `#` inside '[^:/?#]' is text). Attributes `#[…]` stay. */
function phpHashComments(src) {
  let out = '', last = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipString(src, i); continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e - 1; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === '#' && src[i + 1] !== '[') { out += `${src.slice(last, i)}//`; last = i + 1; const e = src.indexOf('\n', i); i = e < 0 ? src.length : e - 1; }
  }
  return out + src.slice(last);
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

// The text a quoted literal stands for: `'\t'` is a tab, not a backslash and a t (written back with JSON escapes).
const ESCAPES = { t: '\t', n: '\n', r: '\r', 0: '\0', '\\': '\\', '"': '"', "'": "'", '`': '`' };
const unquote = (t) => t.slice(1, -1).replace(/\\([tnr0\\"'`])/g, (m, c) => ESCAPES[c]);

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
      while ((toks[i + 1] === '.' || toks[i + 1] === '->') && /^[A-Za-z_$]/.test(toks[i + 2] || '')) {
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
      if (/^(null|nil|None|undefined|NULL|nullptr)$/.test(path)) return null;
      out.push(path);
      continue;
    }
    // Swift's implicit enum member: `status == .active` compares with the case `active`.
    if (t === '.' && /^[a-z_]\w*$/.test(next || '') && (!out.length || ['==', '!=', '(', 'and', 'or', 'not'].includes(out[out.length - 1]))) { out.push(next); i++; continue; }
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
  let m0;
  s = s.replace(/^Ok\((.*)\)$/, '$1').replace(/\.(to_string|into|to_owned)\(\)$/, '').replace(/^String::from\((.*)\)$/, '$1').trim();
  // Absence is not an answer: None/null/nil/undefined are "returns nothing", handled as guards.
  if (/^(None|null|nil|undefined|Nothing|NULL|nullptr)$/.test(s)) return null;
  if ((m0 = s.match(/^\.([a-z]\w*)$/))) return m0[1]; // Swift: return .premium
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
  if ((m = s.match(/^throw\s+([\w.$]+)$/))) return { kind: 'fails', name: /^[A-Z]\w*\.[a-z]\w*$/.test(m[1]) ? m[1] : lastSeg(m[1]) }; // Swift: throw LibraryError.full
  if ((m = s.match(/^throw\s+Abort\(\s*\.(\w+)/)) && VAPOR_STATUS[m[1]]) return { kind: 'responds', name: String(VAPOR_STATUS[m[1]]) }; // Vapor
  if ((m = s.match(/^throw\s+([A-Z][\w.$]*)\s*\(([\s\S]*)\)$/))) return { kind: 'fails', name: /^[A-Z]\w*\.[a-z]\w*$/.test(m[1]) ? m[1] : lastSeg(m[1]), detail: firstString(m[2]) }; // Kotlin and Swift: no `new`
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
  if (/^(null|undefined|None|nil|void 0|NULL|nullptr)$/.test(v)) return { kind: 'nothing' };
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
  if (BARE_IF.has(language) || rest[0] !== '(') {
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
  if ((m = s.match(/^\.([a-z_]\w*)$/))) return m[1]; // Swift: case .premium
  return null;
}

/** A Swift one-expression body (an implicit return): not a declaration, an assignment, or a statement keyword. */
function swiftImplicitValue(text) {
  const t = String(text).trim();
  return !!t && !/\n\s*\S/.test(t) && !/^(?:if|guard|for|while|switch|let|var|return|throw|defer|do|repeat|print|try|await)\b/.test(t) && !/^[\w.]+\s*(?:[-+*/]?=)(?!=)/.test(t) && !/^[\w.]+\s*\(/.test(t);
}

/** A Swift one-statement body that gives back its value: the function returns something, and the statement is an expression. */
function swiftImplicitResult(text, returns) {
  const r = String(returns || '').trim();
  if (!r || /^(?:Void|\(\s*\)|Never)$/.test(r)) return false;
  const t = String(text).trim();
  return !!t && !/^(?:if|guard|for|while|switch|let|var|return|throw|defer|do|repeat|fatalError|preconditionFailure|precondition|assert|assertionFailure|break|continue|case|default)\b/.test(t) && !/^[\w.\[\]]+\s*(?:[-+*/]?=)(?!=)/.test(t) && !/^\$0\s*=/.test(t);
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
      if (value && (/;/.test(value) || (language === 'swift' && /\n\s*\S/.test(value)))) value = null; // more than one statement
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
  } else if ((language === 'go' || language === 'swift') && (m = t.match(/^switch\b([^{]*)\{/))) {
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
        // A brace after a block header (if/for/else/try/=>/a closing paren …) is a code block and ends the
        // statement. Any other brace is part of an expression (an object literal, destructuring, a struct
        // literal, JSX): keep reading to the end of the statement.
        const prefix = src.slice(start, i).trim();
        // A Go composite literal (`[]string{…}`, `map[string]int{…}`) inside a header is a value: read past it.
        if (/(?:\[\d*\][\w.*]+|map\[[^\]]+\][\w.*[\]]+)$/.test(prefix) && /^(?:for|if|switch)\b/.test(prefix)) { i = close; continue; }
        const blockHeader = !prefix
          || /^(?:if|else|for|foreach|while|switch|try|catch|finally|do|function|class|fn|func|match|loop|unsafe|impl|struct|enum|trait|mod|go|defer|select|using|lock|synchronized|namespace|interface|record|object|init|when|static|guard|repeat|extension|protocol|actor|async\s+function|export\s+(?:default\s+)?(?:function|class))\b/.test(prefix)
          || (/(?:\)|=>|\belse|\btry|\bdo|\bfinally|\bloop|\bunsafe|\bdefer)\s*$/.test(prefix) && !/^(?:return|throw|yield)\b/.test(prefix) && !/[=:]\s*\w*\s*\(/.test(prefix.replace(/=>\s*$/, '')) )
          || (/=>\s*$/.test(prefix));
        if (depth === 0 && !blockHeader) { i = close; continue; }
        i = close;
        if (depth === 0) {
          // An if/else chain continues past a closing brace, and so do `do { … } while (…)` and a Go function
          // called where it is written (`go func() { … }()`). Only the next few characters matter.
          const next = src.slice(i + 1, i + 40);
          const goes = /^\s*else\b/.test(next) || (/^(?:do|repeat)\b/.test(prefix) && /^\s*while\b/.test(next)) || (/^\(/.test(next) && /^(?:go\s+|defer\s+)?func\s*\(/.test(prefix));
          if (!goes) { i++; break; }
        }
      } else if (c === ';' && depth === 0) {
        // Go: `if err := open(); err != nil {` and `for i := 0; i < n; i++ {` keep their header together.
        if (/^\s*(?:if|for|switch|else\s+if)\b/.test(src.slice(start, i)) && !src.slice(start, i).includes('{') && /\{/.test(src.slice(i, src.indexOf('\n', i) < 0 ? undefined : src.indexOf('\n', i)))) continue;
        // (Go: the condition after `;` can go on over lines, `if w, ok := f(); !ok ||\n  g() {`.)
        if (/^\s*(?:if|switch|else\s+if)\b/.test(src.slice(start, i)) && !src.slice(start, i).includes('{') && /(?:\|\||&&|[,(])\s*\n[^;{}]*\{/.test(src.slice(i, i + 600))) { const nb = src.indexOf('{', i), ns = src.indexOf(';', i + 1); if (nb > 0 && (ns < 0 || nb < ns)) continue; }
        i++; break;
      }
      else if (c === '\n' && depth === 0) {
        // Newline-terminated statements (Go, Kotlin, JavaScript without semicolons): a complete line
        // ends the statement unless the next line continues it.
        const before = src.slice(start, i).trimEnd();
        // Only the start of the next line matters; never copy the rest of the source (that made this quadratic).
        let j = i + 1;
        while (j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r')) j++;
        const after = src.slice(j, j + 24);
        // A switch label (`case 'a':`, `default:`) is a statement of its own: what follows it is the case's first step.
        if (/^(?:case\b[^\n]*|default\s*):$/.test(before)) { i++; break; }
        // A loop label (`outer:`) is its own line, and so is a C label (`cleanup:`), the place a goto jumps to.
        if (/^[A-Za-z_]\w*\s*:$/.test(before) && !/^(?:public|private|protected|else)\s*:$/.test(before)) { i++; break; }
        // A brace-less `if (x)` / `for (…)` / `else` carries on into the one statement on the next line.
        if (/^(?:(?:\}\s*)?else\s+if|if|for|foreach|while|using|lock|fixed)\s*\(/.test(before) && headerClosed(before)) continue;
        // (Nested: `for (…)\n  if (…)\n    return 1;` is one statement: the last line is itself a brace-less header.)
        const lastLine = before.slice(before.lastIndexOf('\n') + 1).trim();
        if (lastLine !== before && /^(?:(?:\}\s*)?else\s+if|if|for|foreach|while|using|lock|fixed)\s*\(/.test(before) && /^(?:(?:\}\s*)?else\s+if|if|for|foreach|while)\s*\(/.test(lastLine) && headerClosed(lastLine.replace(/^(?:\}\s*)?else\s+/, ''))) continue;
        // (`} else if (x)` / `} else` closing a braced if, with its one statement on the next line.)
        if (/^(?:\}\s*)?else$/.test(before) || (lastLine !== before && /^(?:if|else)\b/.test(before) && /^(?:\}\s*)?else$/.test(lastLine))) continue;
        // (`i++` / `n--` at the end of a line is a whole statement, not an operator waiting for more.)
        // (`do { … }` with its `while (…)` on the next line, Allman style, is one statement.)
        if (before && (!/[,(\[{+\-*/%&|^=<>?:.!]$/.test(before) || /[\w)\]](?:\+\+|--)$/.test(before)) && !/^[.)\]}{+\-*/%&|^=<>?:,]/.test(after) && !/^(?:else|catch|finally)\b/.test(after) && !(/^(?:do|repeat)\b/.test(before) && /\}$/.test(before) && /^while\b/.test(after))) { i++; break; }
      }
    }
    const raw = src.slice(start, i);
    const text = raw.trim();
    // Offsets are into the body as given (comments are blanked in place, so lengths are unchanged).
    // Trim trailing whitespace and semicolons by scanning back (the /[\s;]+$/ regex is quadratic on long bodies).
    let e = raw.length;
    while (e > 0 && /[\s;]/.test(raw[e - 1])) e--;
    const end = start + e;
    if (text) out.push({ text, line: baseLine + lineAt(src, start) - 1, endLine: baseLine + lineAt(src, Math.max(start, end - 1)) - 1, start, end });
  }
  return out;
}
/** `if (a && b)` with its parentheses closed and nothing after them: a header still waiting for its statement. */
function headerClosed(before) {
  const o = before.indexOf('(');
  let d = 0;
  for (let k = o; k < before.length; k++) {
    const c = before[k];
    if (c === '"' || c === '\'' || c === '`') { k = skipString(before, k); continue; }
    if (c === '(') d++;
    else if (c === ')' && --d === 0) return !before.slice(k + 1).trim();
  }
  return false;
}
/**
 * Comments blanked to spaces (lines and offsets unchanged), outside strings only: `'… use \`//\` …'` and
 * `"https://…"` keep their text, so a string can never swallow the rest of a line. One pass, linear.
 */
const INTERESTING = /["'`/]/g;
function stripCommentsKeepLayout(s) {
  if (!s.includes('/')) return s; // no comment can start without a slash
  let out = '', last = 0;
  for (let i = 0; i < s.length; i++) {
    // Jump to the next quote or slash: nothing else matters here.
    INTERESTING.lastIndex = i;
    const hit = INTERESTING.exec(s);
    if (!hit) break;
    i = hit.index;
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      // A quote is a string only when it closes (on the same line, except template and raw strings).
      let j = i + 1;
      if (c === '"' && READING_RUST) { const e = skipString(s, i); if (e < s.length) i = e; continue; }
      for (; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === c || (s[j] === '\n' && c !== '`')) break; }
      if (j < s.length && s[j] === c) i = j;
      continue;
    }
    if (c === '/' && s[i + 1] === '/' && s[i - 1] !== ':') {
      let e = s.indexOf('\n', i); if (e < 0) e = s.length;
      out += s.slice(last, i) + ' '.repeat(e - i); last = i = e; i--; continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      let e = s.indexOf('*/', i + 2); e = e < 0 ? s.length : e + 2;
      out += s.slice(last, i) + s.slice(i, e).replace(/[^\n]/g, ' '); last = e; i = e - 1; continue;
    }
  }
  return out + s.slice(last);
}

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
    // Swift: guard cond else { return … } stops unless the condition holds; `guard let x = …` stops when x is not set.
    if (language === 'swift' && (m = t.match(/^guard\s+([\s\S]+?)\s+else\s*\{([\s\S]*)\}\s*$/))) {
      const branch = m[2].trim();
      const stmts1 = splitTop(branch.replace(/;\s*$/, ''), ';').flatMap((x) => x.split('\n')).map((x) => x.trim()).filter(Boolean);
      const effect = stmts1.length === 1 ? terminatorEffect(stmts1[0], language) : null;
      if (effect && effect.kind !== 'passes-error') {
        const parts = splitTop(m[1], ',').map((x) => x.trim()).filter(Boolean);
        const bound = parts.map((p) => p.match(/^(?:let|var)\s+(\w+)/)?.[1]).filter(Boolean);
        const plain = parts.filter((p) => !/^(?:let|var|case)\b/.test(p));
        const when = !bound.length && !parts.some((p) => /^case\b/.test(p)) ? toThunderCondition(`!(${plain.join(' && ')})`, inputs) : null;
        const said = when ? sayCondition(when) : [...bound.map((b) => `${displayLabel(b).toLowerCase()} is not set`), ...plain.map((p) => { const w = toThunderCondition(`!(${p})`, inputs); return w ? sayCondition(w) : `not \`${p}\``; })].join(' or ');
        guards.push({ when, code: `guard ${m[1].trim()}`, effect, line: st.line, readable: !!when || (!plain.length && !!bound.length), says: sayGuard(effect, said) });
        continue;
      }
    }
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
      // Each `else if` / `else` is on its own line of the statement: its rule is placed there, not on the first `if`.
      const lineOf = (part) => { const at = t.lastIndexOf(part); return st.line + (at > 0 ? (t.slice(0, at).match(/\n/g) || []).length : 0); };
      while (rest) {
        const here = lineOf(rest);
        const head = rest.match(/^(?:else\s+)?if\b\s*/);
        if (!head) break;
        rest = rest.slice(head[0].length);
        let cond, after;
        if (rest[0] === '(' && (language !== 'go' && language !== 'rust' || true)) {
          const close = matchClose(rest, 0);
          const tail = rest.slice(close + 1).trimStart();
          if (BARE_IF.has(language)) {
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
        if (!take(cond, value, here)) { ok = false; break; }
        if (/^else\s+if\b/.test(remaining)) { rest = remaining; continue; }
        if (/^else\b/.test(remaining)) {
          const elseBody = remaining.replace(/^else\s*/, '');
          const v = elseBody.startsWith('{') ? blockValue(elseBody) : (elseBody.startsWith('return ') ? elseBody.slice(7).replace(/;$/, '') : null);
          if (v == null) { unread.push({ line: lineOf(remaining), text: 'else', reason: 'The fallback branch does more than choose an answer.' }); ok = false; }
          else take(null, v, lineOf(remaining));
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
    // Rust's last expression, and a Swift body that is one expression, give the answer without `return`.
    const ret = t.match(/^return\s+([\s\S]+?);?$/) || (language === 'rust' && st === stmts[stmts.length - 1] && !/;\s*$/.test(t) ? [null, t] : null)
      || (language === 'swift' && stmts.length === 1 && swiftImplicitValue(t) ? [null, t] : null);
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
/** A Python line without its trailing # comment. Outside a string, # always starts a comment in Python. */
export function pyNoComment(l) {
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === '"' || c === '\'') { i = skipString(l, i); continue; }
    if (c === '#') return l.slice(0, i).replace(/\s+$/, '');
  }
  return l;
}

/** A Ruby line without its trailing # comment (strings kept as written). */
export function rbNoComment(l) {
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
  // A function with no name of its own ("format › callback at line 579") is written under a name a card can hold.
  const L = [`decision ${/^[A-Za-z_$][\w$]*$/.test(name) ? name : String(name).replace(/[^\w$]+/g, "_").replace(/^_+|_+$/g, "") || "callback"}`, "  inputs"];
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
    if (!m && (lang === 'rust' || (lang === 'swift' && swiftImplicitValue(body)))) m = body.match(/^([^;{}]+?)\s*$/s);
    if (!m) return null;
    expr = m[1].replace(/\s+/g, ' ').trim();
    if (fn.bodyStart != null) line = lineAt(code, fn.bodyStart + Math.max(0, fn.body.indexOf(m[1].trim().slice(0, 12))));
  }
  if (!expr || /^(true|false|True|False)$/.test(expr)) return null;
  // C, C++, and Swift say what comes back: only a yes/no function is a rule (a String property is text, even when the
  // text holds a comparison sign), and quoted text never makes a value a yes/no.
  // (C and C++ yes/no functions often return int, so only Swift is held to its declared type.)
  if (lang === 'swift' && fn.returns && !/^(?:Bool|bool|_Bool|boolean)\??$/.test(String(fn.returns).trim())) return null;
  if (/^(?:c|cpp)$/.test(lang) && fn.returns && /^(?:string|char\*|const char\*)$/.test(String(fn.returns).trim())) return null;
  // (C/C++ yes/no functions return bool or int; one that returns an enum or a class gives back that value.)
  if (/^(?:c|cpp)$/.test(lang) && fn.returns && !/^(?:(?:static\s+|inline\s+|const\s+)*(?:bool|_Bool|int|BOOL|\w*_bool|gboolean|unsigned|long|short|char))$/.test(String(fn.returns).trim())) return null;
  // (`p->style()` is a field of a pointer, not a comparison.)
  expr = expr.replace(/->/g, '.');
  if (/^(?:swift|c|cpp)$/.test(lang) && !BOOL_RETURN.test(String(fn.returns || '').trim()) && !/^Bool\??$/.test(String(fn.returns || '').trim()) && !LOGIC_OR_COMPARE.test(expr.replace(/"(?:\\.|[^"\\])*"/g, 'Q'))) return null;
  if (!(BOOL_RETURN.test(String(fn.returns || '').trim()) || LOGIC_OR_COMPARE.test(expr) || /\?$/.test(fn.name))) return null;
  const when = toThunderCondition(expr.replace(/\?$/, ''), names);
  return when ? { rule: { when, result: 'true', line } } : null;
}

const TRIVIA_LINE = /^\s*(?:$|\/\/|#(?!\[)|\/\*|\*|\*\/|[{}()\[\];,]+\s*$|\}\s*else\b.*\{\s*$|else\s*:?\s*\{?\s*$|end\s*$|"""|''')/;

/** The original lines a function body spans: [firstLine, lastLine] (1-based, inclusive). */
function bodyRange(fn, lang, code) {
  if (lang === 'python' && fn.pyBody?.length) return [fn.pyBody[0].line, fn.pyBody[fn.pyBody.length - 1].line];
  if (lang === 'ruby' && fn.rbBody?.length) return [fn.rbBody[0].line, fn.rbBody[fn.rbBody.length - 1].line];
  // Expression bodies (=> expr / = expr) are read through a stand-in "return expr"; measure the real expression.
  if (fn.exprBody != null && fn.bodyStart != null) return [lineAt(code, fn.bodyStart), lineAt(code, fn.bodyStart + Math.max(0, fn.exprBody - 1))];
  if (typeof fn.body === 'string' && fn.bodyStart != null) {
    // The body starts right after "{", usually on the signature line; start counting at the first code line.
    const lead = fn.body.match(/^[ \t]*\r?\n/) ? 1 : 0;
    return [lineAt(code, fn.bodyStart) + lead, lineAt(code, fn.bodyStart + Math.max(0, fn.body.length - 1))];
  }
  return null;
}

/** Make a step span absolute in the file. Offsets are exact except for PHP, which is read after normalizing. */
function anchorSpan(span, fn, lang) {
  if (!span) return;
  if (fn.exprBody != null && span.start != null) {
    // Stand-in body: shift past the synthetic "return " so offsets land on the real expression.
    span.start = Math.max(0, span.start - 7) + fn.bodyStart; span.end = Math.min(fn.bodyStart + fn.exprBody, span.end - 7 + fn.bodyStart); span.exact = 'offset'; return;
  }
  if (span.start != null && fn.bodyStart != null && lang !== 'php') { span.start += fn.bodyStart; span.end += fn.bodyStart; span.exact = 'offset'; }
  else { delete span.start; delete span.end; span.exact = 'lines'; }
}

/**
 * C and C++ steps inside `#if` / `#ifdef` / `#elif` / `#else` run only in some builds: each says so, with the line that
 * decides it, so alternatives (`#if A … #elif B …`) are never read as steps that all run one after another.
 */
function markBuildOnlySteps(steps, fn, lang, code, srcLines) {
  const range = srcLines.length ? bodyRange(fn, lang, code) : null;
  if (!range) return;
  const only = new Map();
  const stack = [];
  const clean = (t) => t.replace(/\s*\/[/*].*$/, '').replace(/\s+/g, ' ').trim();
  for (let l = range[0]; l <= range[1]; l++) {
    let t = (srcLines[l - 1] ?? '').trim();
    // A directive continued with `\` takes its next lines.
    while (/^#/.test(t) && /\\$/.test(t) && l < range[1]) t = `${t.slice(0, -1).trim()} ${(srcLines[l++] ?? '').trim()}`;
    let m;
    if ((m = t.match(/^#\s*(if|ifdef|ifndef)\b(.*)$/))) stack.push({ first: clean(`#${m[1]}${m[2]}`), label: clean(`#${m[1]}${m[2]}`) });
    else if ((m = t.match(/^#\s*(elif|elifdef|elifndef)\b(.*)$/)) && stack.length) stack[stack.length - 1].label = clean(`#${m[1]}${m[2]}`);
    else if (/^#\s*else\b/.test(t) && stack.length) stack[stack.length - 1].label = `#else of ${stack[stack.length - 1].first}`;
    else if (/^#\s*endif\b/.test(t)) stack.pop();
    else if (stack.length) only.set(l, stack.map((x) => x.label).join(', '));
  }
  if (!only.size) return;
  const walk = (list, outer) => {
    for (const st of list) {
      const label = only.get(st.line);
      // (A question or a loop keeps its own words, which the views turn into "Ask: …?"; the steps under it say it.)
      const holds = st.kind === 'branch' || st.kind === 'loop' || st.kind === 'try';
      if (label && label !== outer && !holds) st.says = `${st.says} (only in builds where \`${label}\`)`;
      // A loop header inside `#if … #endif` with its body outside it (`#if X\n while (…) {\n #endif`): the loop is
      // only in those builds; the steps inside are in every build. (Steps under a header are never given its label:
      // each says its own, from its own line.)
      if (label && label !== outer && st.kind === 'loop') st.says = `${st.says} (the loop only in builds where \`${label}\`${(st.children || []).some((k) => !only.has(k.line)) ? '; the steps inside are in every build' : ''})`;
      const inner = holds ? outer : label || outer;
      if (st.children) walk(st.children, inner);
      for (const h of st.handlers || []) if (h.steps) walk(h.steps, inner);
    }
  };
  walk(steps, null);
}

/** Go named results: `(head, tail string, err error)` -> ['head', 'tail', 'err']; [] when they have no names. */
function goResultNames(returns) {
  const r = String(returns || '').trim();
  if (!/^\(.*\)$/.test(r)) return [];
  const parts = splitTop(r.slice(1, -1), ',').map((x) => x.trim()).filter(Boolean);
  // Named when the last part is "name type"; then each part's first word is a name.
  if (!parts.length || !/^[A-Za-z_]\w*\s+\S/.test(parts[parts.length - 1])) return [];
  return parts.map((p) => p.split(/\s+/)[0]).filter((n) => /^[A-Za-z_]\w*$/.test(n) && n !== '_').map((n) => displayLabel(n).toLowerCase());
}

function functionSteps(fn, lang, code, names, srcLines = []) {
  let stmts = [];
  try {
    if (lang === 'python') stmts = indentStatements(fn.pyBody, { depthKey: 'indent' });
    // For steps, elsif / else / rescue / ensure sit beside their if or begin (the rule reader keeps the raw depth).
    else if (lang === 'ruby') stmts = indentStatements(fn.rbBody.map((l) => (/^(elsif|else|rescue|ensure)\b/.test(l.text) ? { ...l, depth: Math.max(0, l.depth - 1) } : l)), { depthKey: 'depth' });
    else if (typeof fn.body === 'string' && fn.bodyStart != null) stmts = withLanguage(lang, () => braceStatements(splitStatements(lang === 'kotlin' ? kotlinTerminate(fn.body) : fn.body, lineAt(code, fn.bodyStart)), splitStatements));
  } catch { return null; }
  if (!stmts.length) return null;
  // A Swift body that is one expression gives it back without `return` (`var isEmpty: Bool { count == 0 }`).
  // So does one that is a single call or expression when the function says it gives something back
  // (`func base32Bytes() -> [UInt8] { Base32.default.encode(…) }` gives back what encode makes).
  if (lang === 'swift' && stmts.length === 1 && ((!stmts[0].children?.length && swiftImplicitValue(stmts[0].text)) || swiftImplicitResult(stmts[0].text, fn.returns || (fn.route ? 'a response' : null)))) stmts[0] = { ...stmts[0], implicitReturn: true };
  // Rust gives back the value of its last expression (written without `;`): `Ok(n)` at the end is what comes back.
  let rustTail = null;
  if (lang === 'rust' && fn.returns && !/^\(\s*\)$/.test(String(fn.returns).trim())) {
    const last = stmts[stmts.length - 1];
    const ends = last && last.end != null ? /^\s*;/.test(fn.body.slice(last.end)) : true;
    if (last && !ends) {
      if (/^(?:match|if)\b/.test(String(last.text).trim())) rustTail = last;
      else if (!/^(?:let|for|while|loop|return|break|continue|const|static|use|fn|impl|struct|enum)\b|^[\w.\[\]*]+\s*(?:[-+*/%|&^]|<<|>>)?=(?!=)|!\s*\(|^[a-z_][\w:]*!/.test(String(last.text).trim()) || /^(?:vec|format|matches)!/.test(String(last.text).trim())) stmts[stmts.length - 1] = { ...last, implicitReturn: true };
    }
  }
  const r = withLanguage(lang, () => withFunctionContext({ params: fn.params || [], language: lang, route: !!fn.route }, () => {
    const out = stepsFrom(stmts);
    // Rust: a `match` / `if` that ends the function gives back what each arm or side ends with.
    if (rustTail) {
      const tail = out.steps[out.steps.length - 1];
      const giveBack = (list) => {
        const k = list?.[list.length - 1];
        if (!k) return;
        if (k.caseLabel || (k.kind === 'branch' && /^(?:match|if)\b/.test(String(k.code || '')))) { for (const arm of k.caseLabel ? [k] : []) giveBack(arm.children); if (!k.caseLabel) { for (const arm of (k.children || []).filter((c) => c.caseLabel)) giveBack(arm.children); if (!(k.children || []).some((c) => c.caseLabel)) giveBack(k.children); giveBack(k.otherwise); } return; }
        if (!/^(?:call|other)$/.test(k.kind) || k.jump || !k.code || /;\s*$/.test(k.code) || /^[\w.\[\]*]+\s*(?:[-+*/%|&^]|<<|>>)?=(?!=)|^(?:let|for|while|loop|unsafe)\b|^(?:panic|unreachable|todo|unimplemented)!/.test(String(k.code).replace(/,\s*$/, ''))) return;
        const v = classifyStatement(`return ${String(k.code).replace(/,\s*$/, '')}`);
        if (v.kind === 'return' || v.kind === 'fail') { list[list.length - 1] = { ...k, ...v, code: k.code }; delete list[list.length - 1].callee; delete list[list.length - 1].restates; }
      };
      if (tail) { if (tail.kind === 'branch' && (tail.children || []).some((c) => c.caseLabel)) for (const arm of tail.children.filter((c) => c.caseLabel)) giveBack(arm.children); else if (tail.kind === 'branch') { giveBack(tail.children); giveBack(tail.otherwise); } }
    }
    // Ruby gives back its last value: in a yes/no method (`def accepts?`) or a last line that is a comparison or
    // and/or, that value is the answer, not a call made for its effect.
    const last = out.steps[out.steps.length - 1];
    if (lang === 'ruby' && last && last.kind === 'call' && !last.jump && !last.library && (/\?$/.test(fn.name) || /&&|\|\||\band\b|\bor\b|[!=]=|[<>]/.test(stripRubyStrings(last.code || '')))) {
      const v = classifyStatement(`return ${String(last.code || '').trim()}`);
      if (v.kind === 'return') out.steps[out.steps.length - 1] = { ...last, ...v, code: last.code, ...(/^Returns (?:a computed value|a value)$/.test(v.says) ? { restates: true } : {}) };
      delete out.steps[out.steps.length - 1].callee;
    }
    // Ruby, otherwise: a last line that is a value (shown as code, or read) is what the method gives back
    // (`cache[input].dup`), so the ending is never hidden. (Not `initialize` or a setter, whose value is not used.)
    else if (lang === 'ruby' && last && (last.kind === 'other' || (last.kind === 'call' && /^Reads /.test(last.says || ''))) && !last.jump && !last.children?.length && !/^(?:initialize|\w+=)$/.test(fn.name) && !/^[@$]?[\w.\[\]:]+\s*(?:[-+*/|&]{0,2})=(?![=~])|^(?:puts|print|p|pp|raise|fail|yield|super|require|include|extend|attr_\w+|private|protected|public|alias\w*|define_method)\b/.test(String(last.code || '').trim())) {
      const v = classifyStatement(`return ${String(last.code || '').trim()}`);
      if (v.kind === 'return') { out.steps[out.steps.length - 1] = { ...last, ...v, code: last.code, ...(/^Returns (?:a computed value|a value)$/.test(v.says) ? { restates: true } : {}) }; delete out.steps[out.steps.length - 1].callee; }
    }
    return out;
  }));
  if (lang === 'c' || lang === 'cpp') markBuildOnlySteps(r.steps, fn, lang, code, srcLines);
  // Go: a bare `return` in a function with named results gives back those results as they are then.
  if (lang === 'go') {
    const named = goResultNames(fn.returns);
    if (named.length) {
      const walk = (list) => { for (const st of list || []) { if (st.nested) continue; if (st.kind === 'return' && st.says === 'Stops here' && /^return\s*;?$/.test(String(st.code || '').trim())) st.says = `Returns ${named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named.at(-1)}` : named[0]}`; walk(st.children); walk(st.otherwise); for (const h of st.handlers || []) walk(h.steps); } };
      walk(r.steps);
    }
  }
  // A Swift `switch` that is the whole body of a function that gives something back: each case's one expression is
  // what comes back (`case .key(let key): String(reflecting: key)` gives back that text; it is not just a call).
  // So does an if / else if / else that is the whole body (Swift if-expressions).
  if (lang === 'swift' && fn.returns && !/^(?:Void|\(\s*\)|Never)$/.test(String(fn.returns).trim()) && r.steps.length === 1 && r.steps[0].kind === 'branch' && /^(?:switch|if)\b/.test(String(r.steps[0].code || ''))) {
    const giveBack = (list) => {
      const only = list?.length === 1 ? list[0] : null;
      if (!only) return;
      if (only.kind === 'branch' && only.elseIf) { giveBack(only.children); giveBack(only.otherwise); return; }
      if (only.children?.length || !/^(?:call|set|other)$/.test(only.kind) || !only.code || !swiftImplicitResult(only.code, fn.returns) || /^[\w.]+\s*=(?!=)/.test(only.code)) return;
      const v = withLanguage(lang, () => classifyStatement(`return ${only.code}`));
      if (v.kind === 'return') { list[0] = { ...only, ...v, code: only.code }; delete list[0].restates; delete list[0].callee; }
    };
    const top = r.steps[0];
    if (/^switch\b/.test(String(top.code))) for (const arm of top.children || []) giveBack(arm.children);
    else if (top.otherwise) { giveBack(top.children); giveBack(top.otherwise); }
  }
  // Anchoring: every step (and child step) points at its exact place in the original file.
  const walk = (list) => { for (const st of list) { anchorSpan(st.span, fn, lang); if (st.children) walk(st.children); } };
  walk(r.steps);
  // Every step carries its meaning tree (`expr`); a step made without one keeps its code, never a guess.
  const withExpr = (list) => {
    for (const st of list || []) {
      if (!st.expr) st.expr = { kind: 'code', text: String(st.code ?? '').replace(/\s+/g, ' ').trim() };
      withExpr(st.children); withExpr(st.otherwise); for (const h of st.handlers || []) withExpr(h.steps); withExpr(st.always?.steps);
    }
  };
  withExpr(r.steps);
  for (const sk of r.skipped) anchorSpan(sk, fn, lang);
  const range = bodyRange(fn, lang, code);
  if (range) {
    const covered = new Set();
    for (const sp of [...r.steps.map((x) => x.span), ...r.skipped]) if (sp) for (let l = sp.startLine; l <= sp.endLine; l++) covered.add(l);
    let real = 0, hit = 0;
    const missing = [];
    for (let l = range[0]; l <= range[1]; l++) {
      const t = srcLines[l - 1] ?? '';
      if (TRIVIA_LINE.test(t)) continue;
      real++;
      if (covered.has(l)) hit++; else if (missing.length < 5) missing.push(l);
    }
    r.anchor = { schema: 'thunder-anchor-v1', bodyLines: range, codeLines: real, coveredLines: hit, coverage: real ? Math.round((hit / real) * 1000) / 1000 : 1, missing };
  }
  for (const st of r.steps) {
    if (st.kind !== 'branch' || !st.cond) continue;
    // A bare yes/no property (`order.refunded`) already reads as a sentence from the step itself; keep it.
    const bareProperty = /^(not\s+|!)?(?:self\.|this\.)?\w+\.\w+(\(\))?$/.test(st.cond.trim()) && !/\./.test(st.says.replace(/\(\d+ steps? inside\)$/, ''));
    // A plain name used as a yes/no (`if (!slug)`) already reads as "slug is not set"; keep it rather than "not slug".
    const bareName = /^(not\s+|!)?(?:self\.|this\.)?\w+$/.test(st.cond.trim()) && /\bis (not )?set\b/.test(st.says);
    // Request and settings idioms (a header, a value in the address, a setting) already read as words; keep them.
    const idiom = /\b(?:req|request|ctx|c)\s*\.\s*(?:headers|header|query|params|body|searchParams)\b|\bprocess\s*\.\s*env\b|\bos\s*\.\s*(?:environ|getenv)\b|getenv|GetEnvironmentVariable/.test(st.cond);
    const cond = bareProperty || bareName || idiom ? null : toThunderCondition(st.cond, names);
    if (cond) st.says = st.says.replace(/^If .*?( \(\d+ steps? inside\))?$/, (_m, inner) => `If ${st.negate ? 'not: ' : ''}${plainEnums(sayCondition(cond)).replace(/ is not ""/g, ' is not empty').replace(/ is ""/g, ' is empty')}${inner || ''}`);
    delete st.negate;
  }
  // C++ member names carry a mark that means nothing to a reader: items_ and m_items are both "items".
  if (lang === 'cpp') {
    const clean = (x) => String(x).replace(/\bm_(?=[A-Za-z])/g, '').replace(/\b([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*)_(?![\w])/g, '$1');
    const tidy = (list) => { for (const st of list || []) { st.says = clean(st.says); tidy(st.children); tidy(st.otherwise); for (const h of st.handlers || []) { h.says = clean(h.says); tidy(h.steps); } if (st.always) tidy(st.always.steps); } };
    tidy(r.steps);
  }
  return r;
}

export function readCode(source, opts = {}) {
  const reading = readCodeAsIs(source, opts);
  // Say less (say-less.mjs): a step stays in words only when the words account for its code; the rest is code.
  return opts.sayEverything ? reading : sayLess(reading, String(source ?? ''));
}

function readCodeAsIs(source, { language, file = '', allSteps = false } = {}) {
  const src = String(source ?? '');
  if (src.length > 400000) throw new Error('Source is larger than 400 KB. Read one file or module at a time.');
  const lang = String(language || detectLanguage(src, file)).toLowerCase().replace(/^ts$/, 'typescript').replace(/^js$/, 'javascript').replace(/^py$/, 'python').replace(/^(cs|c#)$/, 'csharp').replace(/^rs$/, 'rust').replace(/^golang$/, 'go').replace(/^kts?$/, 'kotlin').replace(/^rb$/, 'ruby').replace(/^(postgres(ql)?|pgsql|plpgsql|mysql|sqlite|tsql|t-sql|mssql)$/, 'sql').replace(/^(docker|containerfile)$/, 'dockerfile').replace(/^(gha|github[ -]?actions?|workflow)$/, 'github-actions').replace(/^(tf|hcl|opentofu|tofu)$/, 'terraform').replace(/^(k8s|kube|kubectl)$/, 'kubernetes').replace(/^(compose|docker[ -]?compose)$/, 'docker-compose').replace(/^(c\+\+|cxx|cc|hpp|hxx|hh)$/, 'cpp').replace(/^h$/, 'c')
    .replace(/^(sh|bash|zsh|ksh|dash|posix)$/, 'shell').replace(/^(ps1|psm1|pwsh|ps)$/, 'powershell').replace(/^(rlang|rscript)$/, 'r');
  if (!READ_LANGUAGES.includes(lang)) throw new Error(`Reading rules supports ${READ_LANGUAGES.join(', ')}. Got "${lang}".`);
  READING_RUST = lang === 'rust';
  // SQL is read by its own reader: tables, rules (CHECK, UNIQUE), views, functions, procedures, triggers.
  if (lang === 'sql') return sqlReading(src);
  // Infrastructure and delivery (spec section 12): Dockerfile stages and workflow jobs as steps, plus what they make.
  if (INFRA_LANGUAGES.includes(lang)) return infraReading(lang, src, file);
  // Shell, PowerShell, and R are read by their own modules into the same items.
  if (SCRIPT_READERS[lang]) return scriptReading(lang, src, file, !language);
  // PHP is read after `$name` -> `name` and `->` -> `.`; every line stays on its line.
  // C and C++ are read with preprocessor lines blanked (#include, #define, #if): they are not statements.
  const code = lang === 'php' ? normalizePhp(src) : lang === 'c' || lang === 'cpp' ? blankPreprocessor(src) : src;
  const items = [];
  const srcLines = src.split('\n');
  const codeLines = code.split('\n');
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
      // (Only when the answer is certainly yes or no: a declared boolean result, a name asked as a question, or an
      // expression that is a comparison; `state.copy_ || state.base_` gives back an object.)
      if (pred && (certainlyYesNo(pred.rule.when, lang) || /^(?:bool|boolean|Bool|Boolean|BOOL|_Bool)$/.test(String(simpleType(fn.returns) ?? '').trim()) || /\?$/.test(fn.name))) { read.rules.push(pred.rule); read.otherwise = { result: 'false', line: pred.rule.line }; read.unread = []; }
    }
    // A rule is drawn only when every statement was read into it; a body with other steps (a loop, an assignment, a
    // later check) is read as steps instead, so no check is silently left out of the picture.
    // (A check that returns or stops before the rules — `if shape != Line { return shape }` — is part of the answer: with
    // one, the body is read as steps, so no rule card claims fewer answers than the code can give.)
    const isDecision = read.rules.length > 0 && !!read.otherwise && !read.unread.length && !(read.guards || []).length;
    const guards = read.guards || [];
    // In a function that is not a pure decision, early fixed returns are still rules worth reading.
    if (!isDecision) {
      for (const r of read.rules) guards.push({ when: r.when, code: r.when, effect: { kind: 'returns', name: r.result }, line: r.line, readable: true, says: sayGuard({ kind: 'returns', name: r.result }, sayCondition(r.when)) });
      guards.sort((a, b) => a.line - b.line);
    }
    const guardNote = guards.length ? ` It checks ${guards.length} condition${guards.length === 1 ? '' : 's'} first: ${guards.map((g) => g.says.replace(/\.$/, '')).join('; ')}.` : '';
    // The author's own words for what the function means (docstring or doc comment), kept apart from the
    // reading inferred from the code so a view can show both and say which is which.
    const doc = fn.doc ?? (lang === 'python' ? null : leadingDoc(codeLines, fn.line, lang));
    const base = {
      id: `${fn.name}:${fn.line}`, name: fn.name, label: displayLabel(fn.name), line: fn.line,
      // Framework plumbing (a database session, the request, a context) is marked so views can leave it out of "You give it".
      // Plumbing (the framework's request, a database session, a context) by its type when it has one, else by name:
      // `Handle(PingResource request, …)` takes a PingResource, which is the real input although it is named request.
      inputs: inputs.map((p) => (isPlumbing(p, inputs, fn) ? { ...p, plumbing: true } : p)), returns: simpleType(fn.returns),
      ...(fn.route ? { route: fn.route } : {}),
      // JS/TS: what a function is assigned to (`exports.x`, `Foo.prototype.bar`), or that it is a callback.
      ...(fn.assignedTo ? { assignedTo: fn.assignedTo } : {}), ...(fn.callback ? { callback: true } : {}), ...(fn.passedTo ? { passedTo: fn.passedTo } : {}),
      ...(doc ? { doc } : {}),
      // C++ `Library::lateFee` and Swift methods in `extension Library { … }`: the type they belong to, by name.
      ...(fn.qualifier ? { qualifier: fn.qualifier } : {}),
      provenance: 'inferred-from-code',
    };
    if (isDecision) {
      items.push({
        ...base, kind: 'decision', status: read.unread.length ? 'partial' : 'read',
        rules: read.rules.map((r) => ({ ...r, says: sayCondition(r.when) })), otherwise: read.otherwise,
        says: (fn.route ? `Handles ${fn.route.method} ${fn.route.path}. ` : '') + sayDecision(read.rules, read.otherwise) + guardNote, guards,
        thunder: decisionSource(fn.name, inputs, read.rules, read.otherwise),
        unread: read.unread,
        // `allSteps`: a decision also carries its steps (for writing in Thunder, which edits any function by its steps).
        ...(allSteps ? (() => { const st = functionSteps(fn, lang, code, names, srcLines); return st ? { steps: st.steps, ...(st.anchor ? { anchor: st.anchor } : {}) } : {}; })() : {}),
      });
    } else {
      const st = functionSteps(fn, lang, code, names, srcLines);
      items.push({
        ...base, kind: 'function', status: 'signature-only',
        ...(st ? { steps: st.steps, stepsMore: st.more, stepsReadable: Math.round(st.readable * 100) / 100, ...(st.anchor ? { anchor: st.anchor } : {}) } : {}),
        says: fn.route ? `Handles ${fn.route.method} ${fn.route.path || '(this controller\'s path)'}.${guardNote}` : `${fn.name} takes ${inputs.length ? inputs.map((p) => p.type && !/[<>\[\]]/.test(p.type) ? `${p.name} (${p.type})` : p.name).join(', ') : 'no inputs'}${fn.returns ? ` and returns ${simpleType(fn.returns)}` : ''}. ${guards.length ? '' : ' Its body does more than choose between fixed answers, so no rules are shown.'}${guardNote}`,
        // The same facts as separate fields, so a view never has to cut sentences out of `says`.
        headline: fn.route ? `Handles ${fn.route.method} ${fn.route.path || "(this controller's path)"}.` : `${displayLabel(fn.name)} takes ${inputs.length ? inputs.map((p) => p.name).join(', ') : 'no inputs'}${fn.returns ? ` and returns ${simpleType(fn.returns)}` : ''}.`,
        ...(guards.length ? {} : { note: 'Its body does more than choose between fixed answers, so no rules are shown.' }),
        guards, unread: read.unread,
      });
    }
  }
  // Errors and tests come from the existing lift adapters (signature-level facts).
  const facts = extractFacts(src, lang, file || undefined);
  for (const e of facts?.errors || []) items.push({ id: `error:${e.name}:${e.line}`, kind: 'error', name: e.name, line: e.line, status: 'read', says: /\s/.test(e.name) ? `Can fail with the error "${e.name}".` : `Raises ${e.name}.`, provenance: 'inferred-from-code' });
  for (const t of facts?.tests || []) items.push({ id: `test:${t.name}:${t.line}`, kind: 'test', name: t.name, line: t.line, status: 'read', says: `A test named "${t.name}".`, provenance: 'inferred-from-code' });
  items.sort((a, b) => a.line - b.line);
  for (const it of items) if (it.kind === 'function' || it.kind === 'decision') it.completeness = completenessOf(it);
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

/** A reading of a SQL file in the same shape as every other language's. */
function sqlReading(src) {
  // A dbt / Jinja template is listed as skipped with the reason: its SQL is not known until the template is filled in.
  const template = sqlTemplateReason(src);
  if (template) return { schema: READ_SCHEMA, language: 'sql', detected: false, items: [], counts: { decision: 0, function: 0, error: 0, test: 0, partial: 0, guarded: 0, route: 0 }, skipped: template, limitations: [template] };
  const items = sqlItems(src);
  for (const it of items) it.completeness = completenessOf(it);
  const counts = { decision: 0, function: items.length, error: 0, test: 0, partial: 0, guarded: 0, route: 0 };
  return {
    schema: READ_SCHEMA, language: 'sql', detected: false, items, counts,
    limitations: [
      'Read by pattern, not by running it on a database. PostgreSQL first; other dialects where their syntax agrees.',
      'Tables are drawn as Data or Things; CHECK and UNIQUE as rules the database enforces; views, functions, procedures, and triggers as steps.',
      'Routine bodies (PL/pgSQL, MySQL stored programs, T-SQL) are read block by block; a statement Thunder cannot say exactly is shown as code, and a body whose blocks do not match is shown as not read.',
    ],
  };
}

/**
 * A reading of a Dockerfile or GitHub Actions workflow in the same shape as every other language's, plus `infra`:
 * the Resources it makes, Permissions, Settings (secrets named only), Facts, and the links between its items.
 */
function infraReading(lang, src, file) {
  const r = lang === 'dockerfile' ? readDockerfile(src, file || 'Dockerfile') : lang === 'terraform' ? readTerraform(src, file || 'main.tf') : lang === 'bicep' ? readBicep(src, file || 'main.bicep') : lang === 'kubernetes' ? readKubernetes(src, file || 'k8s.yaml') : lang === 'docker-compose' ? readCompose(src, file || 'compose.yaml') : readWorkflow(src, file || 'workflow.yml');
  for (const it of r.items) it.completeness = completenessOf(it);
  const counts = { decision: 0, function: r.items.length, error: 0, test: 0, partial: 0, guarded: 0, route: r.items.filter((i) => i.route).length };
  return {
    schema: READ_SCHEMA, language: lang, detected: false, items: r.items, counts,
    ...(r.purpose ? { purpose: r.purpose } : {}),
    infra: { things: r.things, permissions: r.permissions, settings: r.settings, facts: r.facts, links: r.links, unknowns: r.unknowns ?? [] },
    limitations: [
      'Read from the file, not from what is running: the live system may differ.',
      'Secret values are never shown, only their names. Values worked out when it runs or is built say so; the original lines are one click away.',
      lang === 'dockerfile' ? 'Each build stage is a Steps card; RUN commands are read in words, and commands Thunder does not know are named as they are.'
        : lang === 'terraform' || lang === 'bicep' ? `Each ${lang === 'bicep' ? 'resource and module' : 'resource, data source, and module'} is a Resource; the order they are created is one Steps card, from the references between them. Links to resources in other files of the same ${lang === 'bicep' ? 'deployment' : 'folder (module)'} are drawn when those files are read together.`
        : lang === 'kubernetes' ? 'Each resource is a Resource; the order they are made is one Steps card. A Service is linked to the workloads its selector picks, and names in settings (redis:6379) to the Service they name, also across files read together. Helm templates are not read.'
        : lang === 'docker-compose' ? 'Each service, named volume, network, secret, and config is a Resource; the order services start, from depends_on, is one Steps card. A service built from a folder is linked to the Dockerfile in that folder when both are read together.'
        : 'Each job is an Action with a "When" badge; well-known actions and common commands are read in words, others are named as they are.',
    ],
  };
}

// ── Shell, PowerShell, and R: read by their own modules, shown in the same shape ──────────────────────────

const SCRIPT_TRIVIA = {
  shell: SHELL_TRIVIA,
  powershell: /^\s*(?:[{}()\[\];,]+|<#.*|#>.*|\.[A-Z]+\b.*|\[CmdletBinding\(\)\]|param\s*\(?)\s*$/i,
  r: /^\s*(?:[{}()\[\],]+\s*)*$/,
};
const SCRIPT_NOTES = {
  shell: 'Shell has no classes, so a shell file has no Things; its functions and its top-level script are read as steps.',
  powershell: 'Cmdlets are read by their Verb-Noun names; native tools (git, docker, az, kubectl, …) by what their arguments show.',
  r: 'Data-frame pipelines (|> and %>%) are read one verb at a time; S3 methods are read as plain functions.',
};
/**
 * A question about something missing is asked the positive way, with "not:" in front, so the picture asks "Does the
 * file exist?" and puts the Stop on No: "If there is no file x" -> "If not: the file x exists".
 */
const positiveAsk = (says) => String(says)
  .replace(/^If there is no (file|folder) (.+)$/, 'If not: the $1 $2 exists')
  .replace(/^If (?!not: )(.+) does not exist$/, 'If not: $1 exists');
const dropConds = (steps) => { for (const s of steps || []) { delete s.cond; if (s.kind === 'branch' && s.says) s.says = positiveAsk(s.says); dropConds(s.children); dropConds(s.otherwise); for (const h of s.handlers || []) dropConds(h.steps); if (s.always) dropConds(s.always.steps); } };

/** A reading for a language with its own module (shell.mjs, powershell.mjs, rlang.mjs). */
function scriptReading(lang, src, file, detected) {
  const r = SCRIPT_READERS[lang](src, file);
  const srcLines = src.split('\n');
  const trivia = SCRIPT_TRIVIA[lang];
  const items = [];
  // The script's own top-level code leaves out the lines of the functions and classes defined in it.
  const defined = [...r.fns.filter((f) => !f.topLevel).map((f) => [f.line, Math.max(f.line, f.body?.[1] ?? f.line)]), ...(r.things || []).map((t) => t.lines)];
  const inDefinition = (l) => defined.some(([a, b]) => l >= a && l <= b);
  // PowerShell block comments (<# … #>) are comments on every line they cover.
  const commentLines = new Set();
  if (lang === 'powershell') {
    for (let at = src.indexOf('<#'); at >= 0; at = src.indexOf('<#', at + 2)) {
      const end = src.indexOf('#>', at + 2);
      const a = lineAt(src, at), b = lineAt(src, end < 0 ? src.length - 1 : end);
      for (let l = a; l <= b; l++) commentLines.add(l);
      if (end < 0) break;
      at = end;
    }
  }
  for (const fn of r.fns) {
    const inputs = fn.params.map((p) => ({ name: p.name, type: p.type ?? null }));
    const names = inputs.map((p) => (lang === 'r' ? p.name.replace(/\./g, '_') : p.name));
    dropConds(fn.steps);
    let decision = null;
    if (fn.decision) {
      const rules = [];
      for (const x of fn.decision.rules) {
        const when = toThunderCondition(x.cond, names), result = toThunderOutcome(x.result);
        if (!when || !result) { rules.length = 0; break; }
        rules.push({ when, result, line: x.line });
      }
      const otherwise = toThunderOutcome(fn.decision.otherwise.result);
      if (rules.length && otherwise) decision = { rules, otherwise: { result: otherwise, line: fn.decision.otherwise.line } };
    }
    const base = {
      id: `${fn.name}:${fn.line}`, name: fn.name, label: fn.topLevel ? fn.name : displayLabel(fn.name), line: fn.line,
      inputs: inputs.map((p) => (fn.route && PLUMBING.test(p.name) ? { ...p, plumbing: true } : p)), returns: simpleType(fn.returns ?? null),
      ...(fn.route ? { route: fn.route } : {}), ...(fn.doc ? { doc: fn.doc } : {}), ...(fn.topLevel ? { topLevel: true } : {}),
      provenance: 'inferred-from-code',
    };
    const takes = `${inputs.length ? inputs.map((p) => p.name).join(', ') : 'no inputs'}`;
    if (decision) {
      const thunderName = String(fn.name).replace(/[^\w]/g, '_');
      items.push({
        ...base, kind: 'decision', status: 'read', rules: decision.rules.map((x) => ({ ...x, says: sayCondition(x.when) })), otherwise: decision.otherwise,
        says: (fn.route ? `Handles ${fn.route.method} ${fn.route.path}. ` : '') + sayDecision(decision.rules, decision.otherwise), guards: [],
        thunder: decisionSource(thunderName, inputs, decision.rules, decision.otherwise), unread: [],
      });
      continue;
    }
    const steps = fn.steps || [];
    let anchor = null;
    if (fn.body) {
      const covered = new Set();
      for (const st of steps) if (st.span) for (let l = st.span.startLine; l <= st.span.endLine; l++) covered.add(l);
      let real = 0, hit = 0;
      const missing = [];
      for (let l = fn.body[0]; l <= fn.body[1]; l++) {
        const t = srcLines[l - 1] ?? '';
        if (TRIVIA_LINE.test(t) || trivia.test(t) || commentLines.has(l) || (fn.topLevel && inDefinition(l))) continue;
        real++;
        if (covered.has(l)) hit++; else if (missing.length < 5) missing.push(l);
      }
      anchor = { schema: 'thunder-anchor-v1', bodyLines: fn.body, codeLines: real, coveredLines: hit, coverage: real ? Math.round((hit / real) * 1000) / 1000 : 1, missing };
    }
    for (const st of allSteps(steps)) if (st.span && st.span.exact == null) st.span.exact = 'lines';
    const readable = steps.length ? steps.filter((x) => x.kind !== 'other' && !x.restates).length / steps.length : 0;
    const headline = fn.headline ?? (fn.route ? `Handles ${fn.route.method} ${fn.route.path}.` : `${displayLabel(fn.name)} takes ${takes}${fn.returns ? ` and returns ${simpleType(fn.returns)}` : ''}.`);
    items.push({
      ...base, kind: 'function', status: 'signature-only',
      ...(steps.length ? { steps, stepsMore: Math.max(0, steps.length - 14), stepsReadable: Math.round(readable * 100) / 100, ...(anchor ? { anchor } : {}) } : {}),
      says: fn.headline ?? (fn.route ? headline : `${fn.name} takes ${takes}${fn.returns ? ` and returns ${simpleType(fn.returns)}` : ''}.`),
      headline, guards: [], unread: [],
    });
  }
  for (const e of r.errors || []) items.push({ id: `error:${e.name}:${e.line}`, kind: 'error', name: e.name, line: e.line, status: 'read', says: `Can fail with the error "${e.name}".`, provenance: 'inferred-from-code' });
  for (const t of r.tests || []) items.push({ id: `test:${t.name}:${t.line}`, kind: 'test', name: t.name, line: t.line, status: 'read', says: `A test named "${t.name}".`, provenance: 'inferred-from-code' });
  items.sort((a, b) => a.line - b.line);
  for (const it of items) if (it.kind === 'function' || it.kind === 'decision') it.completeness = completenessOf(it);
  const counts = { decision: 0, function: 0, error: 0, test: 0, partial: 0, guarded: 0, route: 0 };
  for (const it of items) { counts[it.kind]++; if (it.route) counts.route++; }
  return {
    schema: READ_SCHEMA, language: lang, detected, items, counts,
    limitations: [
      'Inferred from code by pattern, not by running it. Confirm a reading before relying on it.',
      SCRIPT_NOTES[lang],
    ],
  };
}
