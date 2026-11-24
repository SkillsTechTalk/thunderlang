// Bash and POSIX shell in Thunder. A small, linear lexer and recursive-descent parser for the shell grammar (words,
// quotes, $(…), ${…}, heredocs, pipes, && and ||, if/elif/else, for, while/until, case, functions, groups), then each
// command in plain words: tests as sentences ("the file config exists"), exits as Stops with the message echoed
// right before them, `set -e` as a note, `trap … EXIT` as what runs at the end, and well-known tools (docker,
// kubectl, helm, az, aws, gcloud, git, npm, curl, files and folders) by what they do. Shell has no classes, so it has
// no Things. Deterministic, browser-safe; a command it does not know reads as "Runs <command>" and keeps its code.
import { sayCommand, gerund, words, cap, listWords, scriptPath, positional } from './commands.mjs';

/** True when the first line is a shell shebang (#!/bin/bash, #!/usr/bin/env sh, zsh, ksh, dash). */
export const shellShebang = (src) => /^#!\s*\S*\/(?:env\s+(?:-\S+\s+)*)?(?:ba|z|k|da|a)?sh\b/.test(String(src));

function lineFinder(src) {
  const starts = [0];
  for (let i = src.indexOf('\n'); i >= 0; i = src.indexOf('\n', i + 1)) starts.push(i + 1);
  return (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };
}

// ── Lexer ─────────────────────────────────────────────────────────────────────────────────────────────

const META = new Set([' ', '\t', '\n', ';', '&', '|', '<', '>', '(', ')', '\r']);
const OPS = [';;&', ';;', ';&', '&&', '||', '|&', '&>>', '&>', '<<<', '<<-', '<<', '<>', '<&', '>>', '>&', '>|', ';', '&', '|', '<', '>', '(', ')'];
const REDIR = new Set(['&>>', '&>', '<<<', '<<-', '<<', '<>', '<&', '>>', '>&', '>|', '<', '>']);
const CMD_START = new Set(['if', 'then', 'elif', 'else', 'while', 'until', 'do', '!', 'time', '{', 'for']);

function skipSingle(s, i) { const j = s.indexOf("'", i + 1); return j < 0 ? s.length : j + 1; }
function skipBacktick(s, i) { for (let j = i + 1; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === '`') return j + 1; } return s.length; }
function skipAnsi(s, i) { for (let j = i + 2; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === "'") return j + 1; } return s.length; }
function skipDouble(s, i) {
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === '"') return j + 1;
    if (c === '`') { j = skipBacktick(s, j) - 1; continue; }
    if (c === '$' && s[j + 1] === '(') { j = skipBalanced(s, j + 1) - 1; continue; }
    if (c === '$' && s[j + 1] === '{') { j = skipBrace(s, j + 1) - 1; continue; }
  }
  return s.length;
}
function skipBrace(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === "'" && depth > 0 && false) continue;
    if (c === '"') { j = skipDouble(s, j) - 1; continue; }
    if (c === '$' && s[j + 1] === '(') { j = skipBalanced(s, j + 1) - 1; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return j + 1;
  }
  return s.length;
}
/** From the `(` at i to just past its matching `)`, skipping quotes, comments, nested substitutions, and heredocs. */
function skipBalanced(s, i) {
  let depth = 0, pending = [];
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === "'") { j = skipSingle(s, j) - 1; continue; }
    if (c === '"') { j = skipDouble(s, j) - 1; continue; }
    if (c === '`') { j = skipBacktick(s, j) - 1; continue; }
    if (c === '#' && /[\s(;]/.test(s[j - 1] || ' ') && depth > 0) { const n = s.indexOf('\n', j); if (n < 0) return s.length; j = n - 1; continue; }
    if (c === '<' && s[j + 1] === '<' && s[j + 2] !== '<') {
      const m = s.slice(j + 2, j + 200).match(/^(-?)\s*(['"]?)([A-Za-z_][\w-]*)\2/);
      if (m) { pending.push({ delim: m[3], strip: !!m[1] }); j += 1 + m[0].length; continue; }
    }
    if (c === '\n' && pending.length) { j = skipHeredocs(s, j + 1, pending) - 1; pending = []; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return j + 1;
  }
  return s.length;
}
/** Skip heredoc bodies starting at `at` (the line after the redirect); gives the offset after the last delimiter line. */
function skipHeredocs(s, at, list) {
  let i = at;
  for (const h of list) {
    for (;;) {
      if (i >= s.length) return s.length;
      const eol = s.indexOf('\n', i);
      const end = eol < 0 ? s.length : eol;
      let l = s.slice(i, end).replace(/\r$/, '');
      if (h.strip) l = l.replace(/^\t+/, '');
      i = eol < 0 ? s.length : eol + 1;
      if (l === h.delim || l.trimEnd() === h.delim) break;
    }
  }
  return i;
}

function lex(src) {
  const toks = [];
  let i = 0, test = false;
  const pending = [];
  const prev = () => toks[toks.length - 1];
  const atStart = () => { const t = prev(); return !t || t.t === 'nl' || (t.t === 'op' && !REDIR.has(t.v)) || (t.t === 'word' && CMD_START.has(t.v)); };
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; continue; }
    if (c === '\n') {
      toks.push({ t: 'nl', at: i, end: i + 1 });
      i++;
      if (pending.length) {
        for (const h of pending) { const from = i; i = skipHeredocs(src, i, [h]); h.tok.end = Math.max(h.tok.end, i - 1); h.tok.body = src.slice(from, i); }
        pending.length = 0;
      }
      continue;
    }
    if (c === '#') { const n = src.indexOf('\n', i); i = n < 0 ? src.length : n; continue; }
    if (test) {
      if (src.startsWith(']]', i) && (i + 2 >= src.length || META.has(src[i + 2]))) { toks.push({ t: 'word', v: ']]', at: i, end: i + 2 }); i += 2; test = false; continue; }
      if (src.startsWith('&&', i) || src.startsWith('||', i)) { toks.push({ t: 'word', v: src.slice(i, i + 2), at: i, end: i + 2 }); i += 2; continue; }
    } else {
      if (src.startsWith('((', i) && atStart() || (src.startsWith('((', i) && prev()?.v === 'for')) {
        const e = skipBalanced(src, i);
        toks.push({ t: 'word', v: src.slice(i, e), arith: src.slice(i + 2, Math.max(i + 2, e - 2)), at: i, end: e });
        i = e;
        continue;
      }
      if ((c === '<' || c === '>') && src[i + 1] === '(') { const e = skipBalanced(src, i + 1); toks.push({ t: 'word', v: src.slice(i, e), at: i, end: e }); i = e; continue; }
      const fd = src.slice(i, i + 3).match(/^\d+(?=[<>])/);
      const op = OPS.find((o) => src.startsWith(o, fd ? i + fd[0].length : i));
      if (op && (fd || !/^\d/.test(c))) {
        const at = i;
        i += (fd ? fd[0].length : 0) + op.length;
        const tok = { t: 'op', v: op, at, end: i, ...(fd ? { fd: fd[0] } : {}) };
        toks.push(tok);
        if (op === '<<' || op === '<<-') {
          while (src[i] === ' ' || src[i] === '\t') i++;
          let e = i;
          while (e < src.length && !META.has(src[e])) e++;
          tok.target = src.slice(i, e);
          tok.end = e;
          i = e;
          pending.push({ delim: tok.target.replace(/["'\\]/g, ''), strip: op === '<<-', tok });
        }
        continue;
      }
    }
    // A word.
    const start = i;
    while (i < src.length) {
      const ch = src[i];
      if (META.has(ch)) {
        if (test && (ch === '(' || ch === ')' || ch === '<' || ch === '>' || (ch === '|' && src[i + 1] !== '|'))) { i++; continue; }
        if (ch === '(' && /(?:^|[^\\])(?:[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=|[@!*+?])$/.test(src.slice(start, i))) { i = skipBalanced(src, i); continue; }
        break;
      }
      if (ch === '\\') { i += 2; continue; }
      if (ch === "'") { i = skipSingle(src, i); continue; }
      if (ch === '"') { i = skipDouble(src, i); continue; }
      if (ch === '`') { i = skipBacktick(src, i); continue; }
      if (ch === '$') {
        const n = src[i + 1];
        if (n === '(') { i = skipBalanced(src, i + 1); continue; }
        if (n === '{') { i = skipBrace(src, i + 1); continue; }
        if (n === "'") { i = skipAnsi(src, i); continue; }
        if (n === '"') { i = skipDouble(src, i + 1); continue; }
      }
      i++;
    }
    if (i === start) { i++; continue; }
    const v = src.slice(start, i);
    toks.push({ t: 'word', v, at: start, end: i });
    if (v === '[[' && !test && atStartBefore(toks)) test = true;
  }
  return toks;
}
function atStartBefore(toks) {
  const t = toks[toks.length - 2];
  return !t || t.t === 'nl' || (t.t === 'op' && !REDIR.has(t.v)) || (t.t === 'word' && CMD_START.has(t.v));
}

// ── Parser ────────────────────────────────────────────────────────────────────────────────────────────

function parse(src) {
  const toks = lex(src);
  let p = 0, last = null;
  const tok = () => toks[p];
  const take = () => { const t = toks[p++]; if (t && t.t !== 'nl') last = t; return t; };
  const isW = (v) => tok()?.t === 'word' && tok().v === v;
  const isOp = (v) => tok()?.t === 'op' && tok().v === v;
  const skipNl = () => { while (tok()?.t === 'nl') p++; };
  const finish = (node, first) => Object.assign(node, { at: first.at, end: last ? last.end : first.end });

  function list(stops) {
    const items = [];
    for (;;) {
      while (tok() && (tok().t === 'nl' || (tok().t === 'op' && (tok().v === ';' || tok().v === '&')))) p++;
      const t = tok();
      if (!t || stops.has(t.v) && (t.t === 'word' || t.t === 'op')) break;
      const before = p;
      const node = andOr(stops);
      if (node) { if (isOp('&')) node.background = true; items.push(node); }
      if (p === before) take();
    }
    return items;
  }
  function andOr(stops) {
    const first = tok();
    const head = pipeline(stops);
    if (!head) return null;
    const rest = [];
    while (isOp('&&') || isOp('||')) {
      const op = take().v;
      skipNl();
      const n = pipeline(stops);
      if (!n) break;
      rest.push({ op, node: n });
    }
    return rest.length ? finish({ type: 'andor', first: head, rest }, first) : head;
  }
  function pipeline(stops) {
    const first = tok();
    let negate = false;
    if (isW('!')) { take(); negate = true; }
    const c0 = command(stops);
    if (!c0) return null;
    const cmds = [c0];
    while (isOp('|') || isOp('|&')) { take(); skipNl(); const c = command(stops); if (!c) break; cmds.push(c); }
    return cmds.length === 1 && !negate ? c0 : finish({ type: 'pipeline', cmds, negate }, first);
  }
  function redirsAfter(node) {
    while (tok()?.t === 'op' && REDIR.has(tok().v)) node.redirs.push(redir());
    if (last) node.end = Math.max(node.end, last.end);
    return node;
  }
  function redir() {
    const r = take();
    if (r.target != null) return { op: r.v, fd: r.fd, target: r.target, body: r.body };
    const t = tok();
    if (t?.t === 'word') { take(); return { op: r.v, fd: r.fd, target: t.v }; }
    return { op: r.v, fd: r.fd, target: '' };
  }
  function command(stops) {
    const t = tok();
    if (!t) return null;
    if (t.t === 'op') {
      if (t.v !== '(') return null;
      take();
      const body = list(new Set([')']));
      if (isOp(')')) take();
      return redirsAfter(finish({ type: 'subshell', body, redirs: [] }, t));
    }
    if (t.t !== 'word') return null;
    if (t.arith != null) { take(); return redirsAfter(finish({ type: 'arith', expr: t.arith, redirs: [] }, t)); }
    switch (t.v) {
      case 'if': return redirsAfter(ifCmd());
      case 'for': case 'select': return redirsAfter(forCmd());
      case 'while': case 'until': return redirsAfter(whileCmd());
      case 'case': return redirsAfter(caseCmd());
      case '{': { take(); const body = list(new Set(['}'])); if (isW('}')) take(); return redirsAfter(finish({ type: 'group', body, redirs: [] }, t)); }
      case 'function': return fnDef(true);
      case '[[': {
        take();
        const ws = [];
        while (tok() && !(tok().t === 'word' && tok().v === ']]') && tok().t !== 'nl') ws.push(take().v);
        if (isW(']]')) take();
        return redirsAfter(finish({ type: 'simple', words: ['[[', ...ws, ']]'], assigns: [], redirs: [] }, t));
      }
      default: break;
    }
    if (toks[p + 1]?.t === 'op' && toks[p + 1].v === '(' && toks[p + 2]?.t === 'op' && toks[p + 2].v === ')' && /^[\w:.@-]+$/.test(t.v)) return fnDef(false);
    return simple();
  }
  function fnDef(keyword) {
    const first = take();
    const name = keyword ? take()?.v ?? '' : first.v;
    if (isOp('(')) { take(); if (isOp(')')) take(); }
    skipNl();
    const body = command(new Set());
    return finish({ type: 'function', name, body: body ? (body.type === 'group' ? body.body : [body]) : [], redirs: [] }, first);
  }
  function simple() {
    const first = tok();
    const node = { type: 'simple', words: [], assigns: [], redirs: [] };
    while (tok()) {
      const t = tok();
      if (t.t === 'op' && REDIR.has(t.v)) { node.redirs.push(redir()); continue; }
      if (t.t !== 'word') break;
      take();
      if (!node.words.length && /^[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=/.test(t.v)) node.assigns.push(t.v);
      else node.words.push(t.v);
    }
    return finish(node, first);
  }
  function ifCmd() {
    const first = take();
    const clauses = [];
    let cond = list(new Set(['then']));
    if (isW('then')) take();
    let body = list(new Set(['elif', 'else', 'fi']));
    clauses.push({ cond, body, at: first.at });
    let otherwise = null;
    while (isW('elif')) {
      const at = take().at;
      cond = list(new Set(['then']));
      if (isW('then')) take();
      body = list(new Set(['elif', 'else', 'fi']));
      clauses.push({ cond, body, at });
    }
    let elseAt = null;
    if (isW('else')) { elseAt = take().at; otherwise = list(new Set(['fi'])); }
    if (isW('fi')) take();
    return finish({ type: 'if', clauses, otherwise, elseAt, redirs: [] }, first);
  }
  function loopBody() {
    while (tok() && (tok().t === 'nl' || isOp(';'))) p++;
    if (isW('do')) { take(); const b = list(new Set(['done'])); if (isW('done')) take(); return b; }
    if (isW('{')) { take(); const b = list(new Set(['}'])); if (isW('}')) take(); return b; }
    return [];
  }
  function forCmd() {
    const first = take();
    if (tok()?.arith != null) { const expr = take().arith; return finish({ type: 'for', cstyle: expr, body: loopBody(), redirs: [] }, first); }
    const name = tok()?.t === 'word' ? take().v : '';
    skipNl();
    let items = null;
    if (isW('in')) { take(); items = []; while (tok()?.t === 'word') items.push(take().v); }
    return finish({ type: 'for', select: first.v === 'select', name, items, body: loopBody(), redirs: [] }, first);
  }
  function whileCmd() {
    const first = take();
    const cond = list(new Set(['do']));
    return finish({ type: 'while', until: first.v === 'until', cond, body: loopBody(), redirs: [] }, first);
  }
  function caseCmd() {
    const first = take();
    const word = tok()?.t === 'word' ? take().v : '';
    skipNl();
    if (isW('in')) take();
    const arms = [];
    for (;;) {
      skipNl();
      if (!tok() || isW('esac')) { if (tok()) take(); break; }
      const at = tok().at;
      if (isOp('(')) take();
      const patterns = [];
      while (tok() && !isOp(')')) { const t = take(); if (t.t === 'word') patterns.push(t.v); else if (t.t === 'nl') break; }
      if (isOp(')')) take();
      const before = p;
      const body = list(new Set([';;', ';&', ';;&', 'esac']));
      const endAt = last ? last.end : at;
      if (isOp(';;') || isOp(';&') || isOp(';;&')) take();
      arms.push({ patterns, body, at, end: endAt });
      if (p === before && !patterns.length) take();
    }
    return finish({ type: 'case', word, arms, redirs: [] }, first);
  }
  return list(new Set());
}

// ── Words: a shell word in plain words ──────────────────────────────────────────────────────────────────

const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
const SPECIAL = { '@': 'all the inputs', '*': 'all the inputs', '#': 'how many inputs', '?': "the last command's result", '0': 'this script', $: "this script's process id", '!': 'the last background command', PWD: 'the current folder', HOME: 'the home folder', RANDOM: 'a random number', USER: 'the user name', BASH_SOURCE: 'this file', OLDPWD: 'the previous folder', PATH: 'the PATH (where commands are found)' };
function varWords(name) {
  if (/^[1-9]$/.test(name)) return `the ${ORDINAL[name]} input`;
  if (SPECIAL[name]) return SPECIAL[name];
  return words(name.replace(/\[.*$/, '')) || name;
}
/** `${…}` in words: ${x:-d} -> "x (or "d" when not set)", ${#x} -> "the length of x". */
function braceWords(inner) {
  let m;
  if ((m = inner.match(/^#([A-Za-z_]\w*|[@*])(\[[@*]\])?$/))) return m[1] === '@' || m[1] === '*' ? 'how many inputs' : m[2] ? `how many ${varWords(m[1])}` : `the length of ${varWords(m[1])}`;
  if ((m = inner.match(/^([A-Za-z_]\w*|[0-9@*#?$!])(?:\[[^\]]*\])?(:?[-=])(.*)$/))) { const d = sayWord(m[3]); return d && d !== '""' ? `${varWords(m[1])} (or ${d} when not set)` : varWords(m[1]); }
  if ((m = inner.match(/^!?([A-Za-z_]\w*|[0-9@*#?$!])/))) return varWords(m[1]);
  return 'a value';
}

/** A word's parts: literal text and expansions (variables, command output, arithmetic). */
function partsOf(raw) {
  const out = [];
  const lit = (s) => { if (!s) return; const l = out[out.length - 1]; if (l && l.lit != null) l.lit += s; else out.push({ lit: s }); };
  const walk = (s, quoted) => {
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { const n = s[i + 1] ?? ''; if (n === '\n') { i++; continue; } lit(quoted && !'$`"\\'.includes(n) ? c + n : n); i++; continue; }
      if (c === "'" && !quoted) { const e = skipSingle(s, i); lit(s.slice(i + 1, e - 1)); i = e - 1; continue; }
      if (c === '"' && !quoted) { const e = skipDouble(s, i); walk(s.slice(i + 1, e - 1), true); i = e - 1; continue; }
      if (c === '`') { const e = skipBacktick(s, i); out.push({ cmd: s.slice(i + 1, e - 1) }); i = e - 1; continue; }
      if (c === '$') {
        const n = s[i + 1];
        if (n === '(' && s[i + 2] === '(') { const e = skipBalanced(s, i + 1); out.push({ arith: s.slice(i + 3, e - 2) }); i = e - 1; continue; }
        if (n === '(') { const e = skipBalanced(s, i + 1); out.push({ cmd: s.slice(i + 2, e - 1) }); i = e - 1; continue; }
        if (n === '{') { const e = skipBrace(s, i + 1); out.push({ v: braceWords(s.slice(i + 2, e - 1)), name: s.slice(i + 2, e - 1).match(/^#?!?(\w+)/)?.[1] }); i = e - 1; continue; }
        if (n === "'" && !quoted) { const e = skipAnsi(s, i); lit(s.slice(i + 2, e - 1).replace(/\\n/g, ' ').replace(/\\t/g, ' ')); i = e - 1; continue; }
        const m = s.slice(i + 1).match(/^(?:[A-Za-z_]\w*|[0-9@*#?$!-])/);
        if (m) { out.push({ v: varWords(m[0]), name: m[0] }); i += m[0].length; continue; }
      }
      if (!quoted && /[*?]/.test(c)) out.push({ glob: true });
      lit(c);
    }
  };
  walk(String(raw), false);
  return out;
}
const isGlob = (raw) => partsOf(raw).some((p) => p.glob);

/** Command output in words: "the output of building the Docker image web". */
function outputWords(cmdText) {
  try {
    const nodes = parse(cmdText);
    const n = nodes[0];
    if (!n) return 'the output of a command';
    const say = sayNode(n);
    return `the output of ${say ? gerund(say) : 'a command'}`;
  } catch { return 'the output of a command'; }
}

/** One word in plain words: "prod" in quotes, $ENV_NAME as "env name", "$DIR/app.yaml" as "{dir}/app.yaml". */
export function sayWord(raw) {
  const parts = partsOf(raw).filter((p) => !p.glob);
  if (!parts.length) return '""';
  if (parts.length === 1) {
    const p = parts[0];
    if (p.lit != null) return /^-?\d+(\.\d+)?$/.test(p.lit) ? p.lit : `"${p.lit.length > 80 ? `${p.lit.slice(0, 79)}…` : p.lit}"`;
    if (p.v) return p.v;
    if (p.cmd != null) return outputWords(p.cmd);
    if (p.arith != null) return arithWords(p.arith);
  }
  return `"${textOf(parts)}"`;
}
/** Text with its variables as {words}: "Deploying {app} to {env}". */
function textOf(parts) {
  const t = parts.map((p) => (p.lit != null ? p.lit : p.v ? `{${p.v}}` : p.cmd != null ? `{${outputWords(p.cmd)}}` : p.arith != null ? `{${arithWords(p.arith)}}` : '')).join('');
  return t.length > 120 ? `${t.slice(0, 119)}…` : t;
}
const message = (raws) => textOf(raws.flatMap((r, i) => [...(i ? [{ lit: ' ' }] : []), ...partsOf(r).filter((p) => !p.glob)])).replace(/\\[nt]/g, ' ').replace(/\s+/g, ' ').trim();

const ARITH_OPS = { '==': 'is', '!=': 'is not', '>=': 'is at least', '<=': 'is at most', '>': 'is more than', '<': 'is less than', '&&': 'and', '||': 'or', '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided by', '%': 'remainder after dividing by', '!': 'not' };
function arithWords(expr) {
  const toks = String(expr).match(/\$?\{?[A-Za-z_]\w*\}?|\$[0-9#?]|\d+|==|!=|>=|<=|&&|\|\||[-+*/%<>!()]/g) || [];
  return toks.map((t) => (ARITH_OPS[t] ?? (/^\$?\{?[A-Za-z_]/.test(t) ? varWords(t.replace(/[${}]/g, '')) : /^\$/.test(t) ? varWords(t.slice(1)) : t))).join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');
}
function arithStatement(expr) {
  const e = String(expr).trim();
  let m;
  if ((m = e.match(/^(\w+)\s*\+\+$|^\+\+\s*(\w+)$/))) return `Adds one to ${varWords(m[1] ?? m[2])}`;
  if ((m = e.match(/^(\w+)\s*--$|^--\s*(\w+)$/))) return `Subtracts one from ${varWords(m[1] ?? m[2])}`;
  if ((m = e.match(/^(\w+)\s*([-+])=\s*(.+)$/))) return `${m[2] === '+' ? 'Adds' : 'Subtracts'} ${arithWords(m[3])} ${m[2] === '+' ? 'to' : 'from'} ${varWords(m[1])}`;
  if ((m = e.match(/^(\w+)\s*=(?!=)\s*(.+)$/))) return `Sets ${varWords(m[1])} to ${arithWords(m[2])}`;
  return null;
}

// ── Tests and conditions ──────────────────────────────────────────────────────────────────────────────

const PLACE = /(?:^|\s)(?:file|dir|directory|folder|path)$/;
const fileLeaf = (noun, x, neg) => { const w = sayWord(x); const own = PLACE.test(w); return neg ? (own ? `${w} does not exist` : `there is no ${noun} ${w}`) : (own ? `${w} exists` : `the ${noun} ${w} exists`); };
const UNARY = {
  '-f': (x, n) => fileLeaf('file', x, n), '-d': (x, n) => fileLeaf('folder', x, n),
  '-e': (x, n) => `${sayWord(x)} ${n ? 'does not exist' : 'exists'}`, '-a': (x, n) => `${sayWord(x)} ${n ? 'does not exist' : 'exists'}`,
  '-s': (x, n) => `${sayWord(x)} ${n ? 'is empty or missing' : 'has something in it'}`,
  '-r': (x, n) => `${sayWord(x)} ${n ? 'cannot' : 'can'} be read`, '-w': (x, n) => `${sayWord(x)} ${n ? 'cannot' : 'can'} be written`,
  '-x': (x, n) => `${sayWord(x)} ${n ? 'cannot' : 'can'} be run`, '-L': (x, n) => `${sayWord(x)} is ${n ? 'not ' : ''}a link`, '-h': (x, n) => `${sayWord(x)} is ${n ? 'not ' : ''}a link`,
  '-z': (x, n) => `${sayWord(x)} is ${n ? 'set' : 'empty'}`, '-n': (x, n) => `${sayWord(x)} is ${n ? 'empty' : 'set'}`,
  '-v': (x, n) => `${varWords(x.replace(/["']/g, ''))} is ${n ? 'not ' : ''}set`, '-t': (x, n) => `it is ${n ? 'not ' : ''}running in a terminal`,
};
const BINARY = {
  '=': ['is', 'is not'], '==': ['is', 'is not'], '!=': ['is not', 'is'], '-eq': ['is', 'is not'], '-ne': ['is not', 'is'],
  '-lt': ['is less than', 'is at least'], '-le': ['is at most', 'is more than'], '-gt': ['is more than', 'is at most'], '-ge': ['is at least', 'is less than'],
  '=~': ['matches the pattern', 'does not match the pattern'], '<': ['comes before', 'does not come before'], '>': ['comes after', 'does not come after'],
  '-nt': ['is newer than', 'is not newer than'], '-ot': ['is older than', 'is not older than'], '-ef': ['is the same file as', 'is not the same file as'],
};
/** A test's words ([ … ], [[ … ]], test …) as a sentence, or null when they are not a test it knows. */
function testWords(ws, neg, double) {
  let i = 0;
  const peek = () => ws[i];
  const orExpr = (n) => {
    const parts = [andExpr(n)];
    while (peek() === '-o' || peek() === '||') { i++; parts.push(andExpr(n)); }
    return parts.some((x) => x == null) ? null : parts.join(n ? ' and ' : ' or ');
  };
  const andExpr = (n) => {
    const parts = [notExpr(n)];
    while (peek() === '-a' && ws.length - i > 1 && ws[i + 2] !== undefined || peek() === '&&') { i++; parts.push(notExpr(n)); }
    return parts.some((x) => x == null) ? null : parts.join(n ? ' or ' : ' and ');
  };
  const notExpr = (n) => { if (peek() === '!') { i++; return notExpr(!n); } return primary(n); };
  const primary = (n) => {
    const t = peek();
    if (t === undefined) return null;
    if (t === '(' || t === '\\(') { i++; const e = orExpr(n); if (peek() === ')' || peek() === '\\)') i++; return e; }
    if (UNARY[t] && ws[i + 1] !== undefined && !BINARY[ws[i + 1]]) { i += 2; return UNARY[t](ws[i - 1], n); }
    if (BINARY[ws[i + 1]] && ws[i + 2] !== undefined) {
      const [a, op, b] = [ws[i], ws[i + 1], ws[i + 2]];
      i += 3;
      if ((op === '==' || op === '=' || op === '!=') && double && isGlob(b)) { const pos = op !== '!='; return `${sayWord(a)} ${pos !== n ? 'matches' : 'does not match'} ${b}`; }
      const pair = BINARY[op];
      const right = op === '=~' ? `"${b.replace(/^["']|["']$/g, '')}"` : sayWord(b);
      return `${sayWord(a)} ${pair[n ? 1 : 0]} ${right}`;
    }
    i++;
    return `${sayWord(t)} is ${n ? 'empty' : 'set'}`;
  };
  const r = orExpr(neg);
  return i >= ws.length ? r : null;
}

const PREDICATE_FN = /^(?:_*(?:is|has|can|should|was|are|does|needs?|uses?)_|.*_(?:exists|installed|available|enabled|running|ok|ready)$)/;
/** A list of commands used as a question (`if …; then`, `while …`): its last command's success, in words. */
function condWords(nodes, neg = false) {
  const n = nodes[nodes.length - 1];
  if (!n) return 'it is true';
  return nodeCond(n, neg);
}
function nodeCond(n, neg) {
  if (n.type === 'pipeline') {
    if (n.cmds.length === 1) return nodeCond(n.cmds[0], neg !== n.negate);
    const lastCmd = n.cmds[n.cmds.length - 1];
    if (lastCmd.type === 'simple' && /^e?grep$/.test(lastCmd.words[0]) && lastCmd.words.some((w) => /^-[a-zA-Z]*q/.test(w))) {
      const pat = positional(lastCmd.words.slice(1), ['-e'])[0];
      const from = sayNode({ ...n, cmds: n.cmds.slice(0, -1), negate: false });
      return `the output of ${from ? gerund(from) : 'the command'} ${neg !== n.negate ? 'does not contain' : 'contains'} ${sayWord(pat ?? '?')}`;
    }
    const s = sayNode({ ...n, negate: false });
    return `${gerund(s ?? 'Runs the commands')} ${neg !== n.negate ? 'fails' : 'works'}`;
  }
  if (n.type === 'andor' && n.rest.every((r) => r.op === '&&')) return [n.first, ...n.rest.map((r) => r.node)].map((x) => nodeCond(x, neg)).join(neg ? ' or ' : ' and ');
  if (n.type === 'andor' && n.rest.every((r) => r.op === '||')) return [n.first, ...n.rest.map((r) => r.node)].map((x) => nodeCond(x, neg)).join(neg ? ' and ' : ' or ');
  if (n.type === 'arith') { const w = arithWords(n.expr); return neg ? `not: ${w}` : w; }
  if (n.type === 'group' || n.type === 'subshell') return condWords(n.body, neg);
  if (n.type !== 'simple') return `${gerund(sayNode(n) ?? 'Runs the commands')} ${neg ? 'fails' : 'works'}`;
  const [name0, ...args] = n.words;
  const name = String(name0 ?? "").replace(/^\\(?=[\w.])/, "");
  if (name === '[' || name === 'test' || name === '[[') {
    const inner = name === 'test' ? args : args.slice(0, -1);
    const r = testWords(inner, neg, name === '[[');
    if (r) return r;
  }
  if ((name === 'command' && args[0] === '-v') || name === 'which' || name === 'type' || name === 'hash') {
    const what = positional(args)[0];
    return `${sayWord(what ?? '?')} is ${neg ? 'not ' : ''}installed`;
  }
  if (/^e?grep$/.test(name) && args.some((a) => /^-[a-zA-Z]*q/.test(a))) {
    const pos = positional(args, ['-e', '-m']);
    const pat = /** @type {string} */ (pos.shift());
    return `${pos.length ? listWords(pos.map(sayWord)) : 'the input'} ${neg ? 'does not contain' : 'contains'} ${sayWord(pat ?? '?')}`;
  }
  if (name === 'true' || name === ':') return neg ? 'never' : 'always';
  if (name === 'false') return neg ? 'always' : 'never';
  if (KNOWN_FNS.has(name) && PREDICATE_FN.test(name)) return `${neg ? 'not: ' : ''}${words(name)}${args.length ? ` (${listWords(args.map(sayWord))})` : ''}`;
  const s = sayNode(n);
  return `${gerund(s ?? `Runs ${name}`)} ${neg ? 'fails' : 'works'}`;
}

// ── Commands in words ─────────────────────────────────────────────────────────────────────────────────

let KNOWN_FNS = new Set();
let DIES = new Map(); // functions whose last step stops the script: name -> exit code

const SET_FLAGS = { e: 'stops at the first command that fails', u: 'treats a missing setting as a mistake', x: 'shows each command as it runs', o: '' };
const SET_LONG = { errexit: 'e', nounset: 'u', xtrace: 'x', pipefail: 'pipefail' };
function setWords(args) {
  if (args[0] === '--') return args.length > 1 ? `Replaces the inputs with ${listWords(args.slice(1).map(sayWord))}` : 'Clears the inputs';
  const on = [], off = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const m = a.match(/^([-+])([a-zA-Z]+)$/);
    if (!m) continue;
    for (const f of m[2]) {
      if (f === 'o') { const l = SET_LONG[args[i + 1]] ?? null; i++; if (l) (m[1] === '-' ? on : off).push(l); continue; }
      (m[1] === '-' ? on : off).push(f);
    }
  }
  const phrase = { e: 'Stops at the first command that fails', u: 'Treats a missing setting as a mistake', x: 'Shows each command as it runs', pipefail: 'Counts a failure anywhere in a pipe as a failure' };
  const offPhrase = { e: 'Carries on even when a command fails', u: 'Allows missing settings', x: 'Stops showing each command', pipefail: 'Counts only the last command of a pipe' };
  const said = [...on.filter((f) => phrase[f]).map((f) => phrase[f]), ...off.filter((f) => offPhrase[f]).map((f) => offPhrase[f])];
  if (!said.length) return `Changes shell options (${args.join(' ')})`;
  return [said[0], ...said.slice(1).map((s) => s.charAt(0).toLowerCase() + s.slice(1))].join(', ').replace(/, ([^,]*)$/, said.length > 1 ? ', and $1' : ', $1');
}
const TRAP_WHEN = (sigs) => {
  const s = sigs.map((x) => x.replace(/^SIG/, '').toUpperCase());
  if (s.includes('EXIT') || s.includes('0')) return 'At the end, even if something fails';
  if (s.includes('ERR')) return 'Whenever a command fails';
  if (s.some((x) => ['INT', 'TERM', 'HUP', 'QUIT'].includes(x))) return 'If it is stopped (Ctrl+C or a stop signal)';
  if (s.includes('RETURN')) return 'When the function finishes';
  return `When it gets the signal ${s.join(' or ')}`;
};

/** One assignment word (`X=val`, `X+=val`, `arr=(a b)`) in words. */
function assignWords(a, { exported = false, readonly = false } = {}) {
  const m = a.match(/^([A-Za-z_]\w*)(\[[^\]]*\])?(\+?)=([\s\S]*)$/);
  if (!m) return null;
  const [, name, index, plus, val] = m;
  const who = `${varWords(name)}${index ? `'s ${sayWord(index.slice(1, -1))}` : ''}`;
  const tail = exported ? ' and shares it with the programs it runs' : readonly ? ' (it cannot change after this)' : '';
  if (name === 'PATH' && /\$\{?PATH\}?/.test(val)) { const added = val.split(':').filter((x) => !/\$\{?PATH\}?/.test(x)); return `Adds ${listWords(added.map(sayWord))} to the PATH (where commands are found)`; }
  if (/^\(/.test(val)) {
    const inner = val.slice(1, -1).trim();
    if (!inner) return `Starts ${who} as an empty list`;
    const items = inner.split(/\s+/).filter(Boolean);
    return `${plus ? 'Adds' : 'Sets'} ${plus ? `${listWords(items.map(sayWord))} to ${who}` : `${who} to the list ${listWords(items.slice(0, 6).map(sayWord))}${items.length > 6 ? ', …' : ''}`}${tail}`;
  }
  if (val === '' || val === '""' || val === "''") return `Empties ${who}${tail}`;
  const pos = val.match(/^"?\$\{?([1-9])(?::?[-=]([^}]*))?\}?"?$/);
  if (pos) return `Takes ${who} from the ${ORDINAL[pos[1]]} input${pos[2] ? ` (${sayWord(pos[2])} when not given)` : ''}${tail}`;
  const parts = partsOf(val).filter((p) => !p.glob);
  if (parts.length === 1 && parts[0].arith != null) return `Works out ${who}: ${arithWords(parts[0].arith)}${tail}`;
  if (plus) return `Adds ${sayWord(val)} to ${who}${tail}`;
  return `Sets ${who} to ${sayWord(val)}${tail}`;
}

const isDevNull = (t) => /^\/dev\/null$/.test(t) || t === '&1' || t === '&2';
/** What happens to a command's output: ", saving what it prints to log.txt". */
function redirWords(redirs) {
  const bits = [];
  for (const r of redirs) {
    if (r.fd === '2' || r.op === '>&' || r.op === '<&' || r.op === '&>' || r.op === '&>>') { if (r.op === '&>' && !isDevNull(r.target)) bits.push(`, saving everything it prints to ${sayWord(r.target)}`); continue; }
    if ((r.op === '>' || r.op === '>|') && !isDevNull(r.target)) bits.push(`, saving what it prints to ${sayWord(r.target)}`);
    else if (r.op === '>>' && !isDevNull(r.target)) bits.push(`, adding what it prints to the end of ${sayWord(r.target)}`);
    else if (r.op === '<') bits.push(`, reading from ${sayWord(r.target)}`);
    else if (r.op === '<<' || r.op === '<<-') bits.push(', given the text written below it');
    else if (r.op === '<<<') bits.push(`, given ${sayWord(r.target)}`);
  }
  return bits.join('');
}
const toStderr = (redirs) => redirs.some((r) => (r.op === '>&' && r.target === '2' && (!r.fd || r.fd === '1')) || (r.fd === '1' && r.op === '>&' && r.target === '2') || ((r.op === '>' || r.op === '>>') && r.target === '/dev/stderr'));

/** A simple command as { kind, says, ... }, or null when it does nothing a reader needs (`:`, `true`). */
function simpleSays(n) {
  // `\command`, `\cd`: a leading backslash only skips aliases; the command is the same.
  let ws = n.words.map((w, i) => (i === 0 ? w.replace(/^\\(?=[\w.])/, '') : w));
  if (!ws.length) {
    if (!n.assigns.length) { const r = n.redirs.find((x) => x.op === '>' || x.op === '>|'); return r ? { kind: 'call', says: `Empties the file ${sayWord(r.target)}` } : null; }
    const said = n.assigns.map((a) => assignWords(a)).filter(Boolean);
    return { kind: 'set', says: said.join('; then ') };
  }
  let suffix = '';
  let admin = false;
  for (;;) {
    const w = ws[0];
    if (w === 'sudo' || w === 'doas') { admin = true; ws = ws.slice(1).filter((x, i) => !(i === 0 && /^-/.test(x))); continue; }
    if (w === 'command' && ws[1] !== '-v' || w === 'builtin' || w === 'time' || w === 'exec' || w === 'nohup' || w === 'noglob') { if (w === 'nohup') suffix += ', even after logging out'; ws = ws.slice(1); continue; }
    if (w === 'env' && ws.length > 1) { ws = ws.slice(1).filter((x) => !/^[A-Za-z_]\w*=/.test(x) && !/^-/.test(x)); continue; }
    break;
  }
  if (!ws.length) return null;
  const [name, ...args] = ws;
  if (n.background) suffix += ', in the background';
  if (admin) suffix += ' (as an administrator)';
  if (n.assigns.length) suffix += ` (with ${n.assigns.map((a) => { const m = a.match(/^(\w+)=(.*)$/); return m ? `${varWords(m[1])} set to ${sayWord(m[2])}` : a; }).join(', ')})`;
  const out = (s, extra = {}) => ({ kind: 'call', says: s + redirWords(n.redirs) + suffix, ...extra });
  switch (name) {
    case ':': case 'true': return null;
    case 'break': return { kind: 'call', says: 'Stops repeating' };
    case 'continue': return { kind: 'call', says: 'Skips to the next one' };
    case 'setopt': case 'unsetopt': return { kind: 'set', says: `Turns ${name === 'setopt' ? 'on' : 'off'} the zsh option${args.length > 1 ? 's' : ''} ${listWords(args.map(sayWord))}` };
    case 'command': if (args[0] === '-v') return { kind: 'check', says: `Checks whether ${sayWord(positional(args)[0] ?? '?')} is installed` }; break;
    case 'false': return { kind: 'fail', says: 'Fails (the command false)', error: 'failure' };
    case 'echo': case 'printf': case 'print': {
      let a = args;
      if (name === 'echo') while (/^-[neE]+$/.test(a[0] ?? '')) a = a.slice(1);
      let msg;
      if (name === 'printf') {
        const [fmt, ...rest] = a.filter((x) => x !== '--' && !/^-v$/.test(x));
        let k = 0;
        msg = message([fmt ?? '']).replace(/%(?:-?\d*\.?\d*)[sdifbqx]/g, () => (rest[k] != null ? `{${sayWord(rest[k++]).replace(/^"|"$/g, '')}}` : '…')).replace(/%%/g, '%');
      } else msg = message(a);
      const file = n.redirs.find((r) => (r.op === '>' || r.op === '>>' || r.op === '>|') && !r.fd && !isDevNull(r.target) && r.target !== '/dev/stderr');
      if (toStderr(n.redirs)) return { kind: 'call', says: `Writes an error message: "${msg}"${suffix}`, stderr: msg };
      if (file) return { kind: 'call', says: `${file.op === '>>' ? 'Adds' : 'Writes'} "${msg}" ${file.op === '>>' ? 'to the end of' : 'to'} ${sayWord(file.target)}${suffix}` };
      if (n.redirs.some((r) => isDevNull(r.target) && !r.fd)) return null;
      return { kind: 'call', says: msg ? `Writes a message: "${msg}"${suffix}` : 'Writes an empty line' };
    }
    case 'exit': {
      const code = args[0] ?? '0';
      if (code === '0') return { kind: 'return', says: 'Stops the script here, finished without errors' };
      if (/^\d+$/.test(code)) return { kind: 'fail', says: `Fails with exit code ${code}`, error: `exit code ${code}`, exitCode: code };
      return { kind: 'return', says: `Stops the script with the exit code in ${sayWord(code)}` };
    }
    case 'return': {
      const code = args[0] ?? '0';
      if (code === '0') return { kind: 'return', says: 'Returns success' };
      if (/^\d+$/.test(code)) return { kind: 'return', says: `Returns failure (code ${code})`, failCode: code };
      return { kind: 'return', says: `Returns the code in ${sayWord(code)}` };
    }
    case 'set': return { kind: 'set', says: setWords(args) };
    case 'shopt': return { kind: 'set', says: `${args.includes('-u') ? 'Turns off' : 'Turns on'} the shell option ${positional(args).map(sayWord).join(', ')}` };
    case 'trap': {
      const [handler, ...sigs] = args;
      if (!sigs.length) return out('Lists the traps');
      const when = TRAP_WHEN(sigs);
      if (handler === '-' ) return { kind: 'set', says: `Stops handling ${sigs.join(', ')}` };
      const body = partsOf(handler ?? '').map((p) => p.lit ?? '').join('');
      if (!body.trim()) return { kind: 'set', says: `Ignores ${sigs.join(', ')}` };
      const nodes = parse(body);
      if (nodes.length === 1 && nodes[0].type === 'simple' && KNOWN_FNS.has(nodes[0].words[0])) return { kind: 'call', says: `${when}, runs ${words(nodes[0].words[0])}`, callee: nodes[0].words[0] };
      return { kind: 'call', says: `${when}, it runs these steps`, trap: nodes };
    }
    case 'export': case 'local': case 'declare': case 'typeset': case 'readonly': {
      const flags = args.filter((a) => /^[-+][a-zA-Z]+$/.test(a)).join('');
      const items = args.filter((a) => !/^[-+][a-zA-Z]+$/.test(a));
      const exported = name === 'export' || /x/.test(flags);
      const ro = name === 'readonly' || /r/.test(flags);
      const said = items.map((a) => (/=/.test(a) ? assignWords(a, { exported, readonly: ro }) : exported ? `Shares ${varWords(a)} with the programs it runs` : /A/.test(flags) ? `Starts ${varWords(a)} as an empty table` : /a/.test(flags) ? `Starts ${varWords(a)} as an empty list` : `Starts with no ${varWords(a)} yet`)).filter(Boolean);
      if (!said.length) return null;
      return { kind: 'set', says: said.join('; then ').replace(/; then (\w)/g, (m, c) => `; then ${c.toLowerCase()}`) };
    }
    case 'unset': return { kind: 'set', says: `Forgets ${listWords(positional(args).map(varWords))}` };
    case 'source': case '.': return out(`Loads the commands and settings in ${sayWord(args[0] ?? '?')}`);
    case 'shift': return { kind: 'set', says: args[0] && args[0] !== '1' ? `Moves past the next ${sayWord(args[0])} inputs` : 'Moves on to the next input' };
    case 'read': {
      const prompt = args.includes('-p') ? args[args.indexOf('-p') + 1] : null;
      const names = positional(args, ['-p', '-t', '-n', '-d', '-u', '-a', '-N']).filter((x) => /^\w+$/.test(x));
      const into = names.length ? listWords(names.map(varWords)) : 'a line';
      return out(prompt ? `Asks ${sayWord(prompt)} and keeps the answer as ${into}` : `Reads ${into} from what is typed in`);
    }
    case 'eval': return out(`Runs the text ${listWords(args.map(sayWord))} as a command`);
    case 'getopts': return { kind: 'set', says: `Reads the next option into ${varWords(args[1] ?? 'opt')}` };
    case 'alias': return { kind: 'set', says: `Makes the shortcut ${sayWord((args[0] ?? '').split('=')[0])}` };
    case 'cat': case 'tee': {
      const doc = n.redirs.find((r) => r.op === '<<' || r.op === '<<-');
      if (!doc || positional(args).length && name === 'cat') break;
      const lines = Math.max(0, (doc.body ?? '').split('\n').length - 2);
      const file = name === 'tee' ? positional(args)[0] : n.redirs.find((r) => (r.op === '>' || r.op === '>>') && !r.fd && !isDevNull(r.target))?.target;
      const appending = name === 'tee' ? args.includes('-a') : n.redirs.some((r) => r.op === '>>');
      return { kind: 'call', says: file ? `${appending ? 'Adds' : 'Writes'} the text written below (${lines} line${lines === 1 ? '' : 's'}) ${appending ? 'to the end of' : 'to'} ${sayWord(file)}${suffix}` : `Writes out the text written below (${lines} line${lines === 1 ? '' : 's'})${suffix}` };
    }
    case 'cd': case 'pushd': case 'popd': break;
    case 'wait': break;
    case '[': case 'test': case '[[': {
      const inner = name === 'test' ? args : args.slice(0, -1);
      const t = testWords(inner, false, name === '[[');
      return { kind: 'check', says: `Checks whether ${t ?? 'the test passes'}` };
    }
    default: break;
  }
  if (DIES.has(name)) {
    const msg = message(args);
    return { kind: 'fail', says: `Fails with exit code ${DIES.get(name)}${msg ? `: "${msg}"` : ''}`, error: `exit code ${DIES.get(name)}`, ...(msg ? { message: msg } : {}), callee: name };
  }
  if (KNOWN_FNS.has(name)) return out(`Runs ${words(name)}${args.length ? ` with ${listWords(args.slice(0, 4).map(sayWord))}${args.length > 4 ? ', …' : ''}` : ''}`, { callee: name });
  const known = sayCommand(name, args, sayWord);
  if (known) return out(known, { callee: name });
  if (scriptPath(name) || /^"?\$/.test(name)) return out(`Runs the script ${sayWord(name)}`, { callee: name });
  return out(`Runs ${name}${args[0] && /^[a-z][\w-]*$/.test(args[0]) ? ` ${args[0]}` : ''}`, { callee: name });
}

/** Any node as one short sentence (used inside questions and "the output of …"). */
function sayNode(n) {
  if (n.type === 'simple') return simpleSays(n)?.says ?? null;
  if (n.type === 'pipeline') {
    const said = n.cmds.map((c) => sayNode(c)).filter(Boolean);
    if (n.cmds.length === 2 && n.cmds[1].type === 'simple' && /^(?:ba|z)?sh$/.test(n.cmds[1].words[0]) && n.cmds[0].type === 'simple' && /^(curl|wget)$/.test(n.cmds[0].words[0])) {
      const url = n.cmds[0].words.slice(1).find((a) => /:\/\/|\$/.test(a));
      return `Downloads ${sayWord(url ?? '?')} and runs it as a script`;
    }
    return said.length ? [said[0], ...said.slice(1).map((s) => `then ${s.charAt(0).toLowerCase()}${s.slice(1)}`)].join(', ') : null;
  }
  if (n.type === 'arith') return arithStatement(n.expr) ?? `Works out ${arithWords(n.expr)}`;
  if (n.type === 'andor') return sayNode(n.first);
  if (n.type === 'group' || n.type === 'subshell') return n.body[0] ? sayNode(n.body[0]) : null;
  if (n.type === 'if') return 'Checks a condition';
  if (n.type === 'for' || n.type === 'while') return 'Repeats some steps';
  return null;
}

// ── Steps ─────────────────────────────────────────────────────────────────────────────────────────────

const CODE_MAX = 160;
function makeStepper(src) {
  const lineAt = lineFinder(src);
  const codeOf = (n) => { const t = src.slice(n.at, n.end).replace(/\s+/g, ' ').trim(); return t.length > CODE_MAX ? `${t.slice(0, CODE_MAX - 1)}…` : t; };
  const headOf = (n) => { const t = src.slice(n.at, n.end).split('\n')[0].trim(); return t.length > CODE_MAX ? `${t.slice(0, CODE_MAX - 1)}…` : t; };
  const span = (n) => ({ startLine: lineAt(n.at), endLine: lineAt(Math.max(n.at, n.end - 1)) });
  const base = (n, code = codeOf(n)) => ({ code, line: lineAt(n.at), span: span(n) });

  function steps(nodes) {
    const out = [];
    for (let k = 0; k < nodes.length; k++) {
      const n = nodes[k];
      const got = nodeSteps(n);
      // An error message written right before an exit or a failing return is that Stop's message.
      const next = nodes[k + 1];
      if (got.length === 1 && got[0].stderr != null && next && next.type === 'simple') {
        const ex = simpleSays(next);
        if (ex && (ex.kind === 'fail' || ex.failCode) && !ex.message) {
          const code = ex.exitCode ?? ex.failCode;
          const what = ex.exitCode ? `exit code ${code}` : `return code ${code}`;
          out.push({ kind: 'fail', says: `Fails with ${what}: "${got[0].stderr}"`, error: what, message: got[0].stderr, code: `${codeOf(n)}; ${codeOf(next)}`, line: lineAt(n.at), span: { startLine: lineAt(n.at), endLine: lineAt(next.end - 1) } });
          k++;
          continue;
        }
      }
      for (const s of got) { delete s.stderr; delete s.exitCode; delete s.failCode; out.push(s); }
    }
    return out;
  }

  function branch(says, n, children, extra = {}) {
    return { kind: 'branch', says, ...base(n, headOf(n)), ...(children.length ? { children } : {}), ...extra };
  }

  function nodeSteps(n) {
    switch (n.type) {
      case 'simple': {
        const s = simpleSays(n);
        if (!s) return [];
        const st = { ...s, ...base(n) };
        if (s.trap) { delete st.trap; const kids = steps(s.trap).map((c) => ({ ...c, line: st.line, span: st.span })); if (kids.length) { st.children = kids; st.nested = true; } }
        return [st];
      }
      case 'function': return [{ kind: 'set', says: `Defines a helper, ${words(n.name)}`, ...base(n, headOf(n)) }];
      case 'arith': return [{ kind: 'set', says: arithStatement(n.expr) ?? `Works out ${arithWords(n.expr)}`, ...base(n) }];
      case 'group': return steps(n.body);
      case 'subshell': { const kids = steps(n.body); return [{ kind: 'call', says: 'Runs these steps in a separate shell (folder and setting changes stay inside it)', ...base(n, headOf(n)), ...(kids.length ? { children: kids } : {}) }]; }
      case 'pipeline': return pipelineSteps(n);
      case 'andor': return andOrSteps(n);
      case 'if': {
        let first = null, tail = null;
        for (const c of n.clauses) {
          const b = { kind: 'branch', says: `If ${condWords(c.cond)}`, code: src.slice(c.at, src.indexOf('\n', c.at) < 0 ? undefined : src.indexOf('\n', c.at)).trim().slice(0, CODE_MAX), line: lineAt(c.at), span: first ? { startLine: lineAt(c.at), endLine: lineAt(n.end - 1) } : span(n) };
          const kids = steps(c.body);
          if (kids.length) b.children = kids;
          if (!first) first = b; else { b.elseIf = true; tail.otherwise = [b]; }
          tail = b;
        }
        if (n.otherwise) { const kids = steps(n.otherwise); tail.otherwise = kids; tail.otherwiseLine = lineAt(n.elseAt); }
        return [first];
      }
      case 'for': {
        const kids = steps(n.body);
        let says;
        if (n.cstyle != null) {
          const [init, cond] = n.cstyle.split(';').map((x) => x.trim());
          const im = init.match(/^(\w+)\s*=\s*(.+)$/);
          says = im ? `Counts ${varWords(im[1])} from ${arithWords(im[2])}${cond ? ` while ${arithWords(cond)}` : ''}` : `Repeats while ${arithWords(cond || 'true')}`;
        } else {
          const items = n.items;
          let what;
          if (!items || (items.length === 1 && /^"?\$[@*]"?$/.test(items[0]))) what = 'the inputs';
          else if (items.length === 1) { const p = partsOf(items[0]); what = isGlob(items[0]) ? `the files matching ${items[0].replace(/^"|"$/g, '')}` : p.length === 1 && p[0].cmd != null ? outputWords(p[0].cmd) : sayWord(items[0]); }
          else what = listWords(items.slice(0, 6).map(sayWord)) + (items.length > 6 ? ', …' : '');
          says = n.select ? `Asks the person to pick ${varWords(n.name)} from ${what}` : `For each ${varWords(n.name)} in ${what}`;
        }
        return [{ kind: 'loop', says, ...base(n, headOf(n)), ...(kids.length ? { children: kids } : {}) }];
      }
      case 'while': {
        const kids = steps(n.body);
        const last = n.cond[n.cond.length - 1];
        let says;
        if (last?.type === 'simple' && last.words[0] === 'read') {
          const names = positional(last.words.slice(1), ['-p', '-t', '-n', '-d', '-u', '-a']).filter((x) => /^\w+$/.test(x));
          const from = n.redirs.find((r) => r.op === '<');
          says = `For each line${names.length > 1 ? ` (${listWords(names.map(varWords))})` : names[0] && names[0] !== 'line' ? ` (as ${varWords(names[0])})` : ''}${from ? ` in ${sayWord(from.target)}` : n.redirs.some((r) => r.op === '<<<') ? ` in ${sayWord(n.redirs.find((r) => r.op === '<<<').target)}` : ''}`;
        } else if (last?.type === 'simple' && last.words[0] === 'getopts') {
          const letters = (partsOf(last.words[1] ?? '')[0]?.lit ?? '').replace(/[:]/g, '').split('').filter(Boolean);
          says = `For each option given${letters.length ? ` (${letters.map((l) => `-${l}`).join(', ')})` : ''}`;
        } else if (last?.type === 'simple' && /^(true|:)$/.test(last.words[0])) says = n.until ? 'Never repeats' : 'Repeats until something stops it';
        else says = `Repeats ${n.until ? 'until' : 'while'} ${condWords(n.cond)}`;
        return [{ kind: 'loop', says, ...base(n, headOf(n)), ...(kids.length ? { children: kids } : {}) }];
      }
      case 'case': {
        const arms = n.arms.map((a) => {
          const pats = a.patterns.filter((p) => p !== '(');
          let says;
          if (pats.length === 1 && pats[0] === '*') says = 'Otherwise';
          else if (pats.every((p) => !isGlob(p))) says = `When it is ${listWords(pats.map(sayWord)).replace(/, and |\sand\s(?=[^,]*$)/, ' or ')}`;
          else says = `When it matches ${pats.map((p) => p.replace(/^["']|["']$/g, '')).join(' or ')}`;
          const kids = steps(a.body);
          return { kind: 'check', says, caseLabel: true, code: src.slice(a.at, src.indexOf(')', a.at) + 1).trim().slice(0, 90), line: lineAt(a.at), span: { startLine: lineAt(a.at), endLine: lineAt(Math.max(a.at, a.end - 1)) }, ...(kids.length ? { children: kids } : {}) };
        });
        return [{ kind: 'branch', says: `Chooses by ${sayWord(n.word)}`, ...base(n, headOf(n)), ...(arms.length ? { children: arms } : {}) }];
      }
      default: return [];
    }
  }

  function pipelineSteps(n) {
    const lastCmd = n.cmds[n.cmds.length - 1];
    if (lastCmd.type === 'while' && n.cmds.length > 1) {
      const [loop] = nodeSteps(lastCmd);
      const from = sayNode({ ...n, cmds: n.cmds.slice(0, -1), negate: false });
      loop.says = loop.says.replace(/^For each line.*$/, (m) => `${m} from ${from ? gerund(from) : 'the command'}`);
      return [{ ...loop, ...base(n, headOf(n)) }];
    }
    const s = sayNode(n);
    if (n.negate) return [{ kind: 'check', says: `Checks that ${gerund(s ?? 'Runs the commands')} fails`, ...base(n) }];
    return s ? [{ kind: 'call', says: s, ...base(n) }] : [{ kind: 'other', says: codeOf(n), ...base(n) }];
  }

  function andOrSteps(n) {
    const chain = [n.first, ...n.rest.map((r) => r.node)];
    const ops = n.rest.map((r) => r.op);
    const isTest = (x) => x.type === 'arith' || (x.type === 'simple' && /^(\[\[?|test)$/.test(x.words[0] ?? ''));
    // `test && a || b` is the shell's if/else.
    if (ops.length === 2 && ops[0] === '&&' && ops[1] === '||' && isTest(chain[0])) {
      const kids = steps([chain[1]]), other = steps([chain[2]]);
      return [branch(`If ${nodeCond(chain[0], false)}`, n, kids, { otherwise: other })];
    }
    // a && b && c: each runs only if the one before worked; a || b: b runs only if a failed.
    const build = (i) => {
      if (i === chain.length - 1) return steps([chain[i]]);
      const op = ops[i];
      const head = chain[i];
      const cond = nodeCond(head, op === '||');
      const kids = build(i + 1);
      const b = { kind: 'branch', says: `If ${cond}`, ...base(n, i === 0 ? codeOf(n) : codeOf(head)), ...(kids.length ? { children: kids } : {}) };
      if (isTest(head) || head.type === 'pipeline' && head.negate) return [b];
      // The command itself is a step too, when it does something besides answering yes or no.
      const own = steps([head]);
      const question = /\b(?:works|fails)$/.test(cond) && own.length === 1 && own[0].kind === 'call';
      if (question || own.length === 0) return [b];
      if (head.type === 'simple' && ((head.words[0] === 'command' && head.words[1] === '-v') || /^(which|type|hash)$/.test(head.words[0]) || (/^e?grep$/.test(head.words[0]) && head.words.some((w) => /^-[a-zA-Z]*q/.test(w))))) return [b];
      return [...own, { ...b, says: `If that ${op === '&&' ? 'worked' : 'failed'}` }];
    };
    return build(0);
  }
  return { steps, lineAt, codeOf, headOf };
}

// ── Reading a file ────────────────────────────────────────────────────────────────────────────────────

/** The comment lines right above line `line` (1-based), as the author's note; null when there are none. */
function docAbove(lines, line) {
  const run = [];
  for (let k = line - 2; k >= 0; k--) {
    const t = lines[k].trim();
    if (!t.startsWith('#') || t.startsWith('#!')) break;
    run.unshift(t.replace(/^#+\s?/, '').trim());
  }
  return cleanDoc(run);
}
function cleanDoc(run) {
  const para = [];
  for (const t of run) {
    if (/^[-=#*~_ ]*$/.test(t)) { if (para.length) break; continue; }
    if (/^(usage|example|examples|arguments|args|options|returns?|outputs?|globals|params?)\s*:/i.test(t)) break;
    para.push(t);
  }
  const s = para.join(' ').replace(/\s+/g, ' ').trim();
  return s ? (s.length > 300 ? `${s.slice(0, 299)}…` : s) : null;
}
/** The comment block at the top of the file, after the shebang: what the script is for. */
function headerDoc(lines) {
  const run = [];
  let k = 0;
  if (/^#!/.test(lines[0] ?? '')) k = 1;
  while (k < lines.length && !lines[k].trim()) k++;
  for (; k < lines.length && /^\s*#/.test(lines[k]); k++) {
    const t = lines[k].trim();
    if (/^#\s*(shellcheck|-\*-|vim:)/.test(t)) continue;
    run.push(t.replace(/^#+\s?/, '').trim());
  }
  return cleanDoc(run);
}

/** Inputs a function (or script) takes, from `local name="$1"` and the positional inputs it uses. */
function inputsOf(nodes, src) {
  const named = [];
  let max = 0;
  const visit = (list) => {
    for (const n of list || []) {
      if (n.type === 'function') continue;
      if (n.type === 'simple') {
        const items = /^(local|declare|typeset|readonly|export)$/.test(n.words[0] ?? '') ? n.words.slice(1) : n.assigns;
        for (const a of items) { const m = a.match(/^([A-Za-z_]\w*)="?\$\{?([1-9])(?:[:?=-][^}]*)?\}?"?$/); if (m && !named[m[2]]) named[m[2]] = m[1]; }
      }
      for (const k of ['body', 'otherwise', 'cond', 'cmds']) if (Array.isArray(n[k])) visit(n[k]);
      if (n.first) visit([n.first, ...n.rest.map((r) => r.node)]);
      if (n.clauses) for (const c of n.clauses) { visit(c.cond); visit(c.body); }
      if (n.arms) for (const a of n.arms) visit(a.body);
      const text = src.slice(n.at, n.end);
      for (const m of text.matchAll(/\$\{?([1-9])\b/g)) if (n.type !== 'function') max = Math.max(max, Number(m[1]));
    }
  };
  visit(nodes);
  const out = [];
  for (let i = 1; i <= Math.max(max, named.length - 1); i++) out.push({ name: named[i] ?? `input_${i}`, type: null });
  return out;
}

/**
 * Read a shell script: each function, and the script's own top-level code as one item named after the file, in the
 * shape read.mjs turns into reading items.
 */
export function shellReading(src, file = '') {
  const nodes = parse(src);
  const lines = src.split('\n');
  const fns = [];
  const all = [];
  const collect = (list) => {
    for (const n of list || []) {
      if (n.type === 'function') { all.push(n); collect(n.body); continue; }
      for (const k of ['body', 'otherwise', 'cond', 'cmds']) if (Array.isArray(n[k])) collect(n[k]);
      if (n.first) collect([n.first, ...n.rest.map((r) => r.node)]);
      if (n.clauses) for (const c of n.clauses) collect(c.body);
      if (n.arms) for (const a of n.arms) collect(a.body);
    }
  };
  collect(nodes);
  KNOWN_FNS = new Set(all.map((f) => f.name));
  DIES = new Map();
  // Helpers like die() { echo "$*" >&2; exit 1; }: a call to one is a Stop.
  for (const f of all) {
    const last = f.body[f.body.length - 1];
    if (last?.type === 'simple' && last.words[0] === 'exit' && /^[1-9]\d*$/.test(last.words[1] ?? '')) DIES.set(f.name, last.words[1]);
  }
  const { steps, lineAt } = makeStepper(src);
  const errors = new Map();
  const noteErrors = (list) => { for (const s of list || []) { if (s.kind === 'fail' && s.message && !errors.has(s.message)) errors.set(s.message, s.line); noteErrors(s.children); noteErrors(s.otherwise); } };
  for (const f of all) {
    const line = lineAt(f.at);
    const st = steps(f.body);
    // `name() { :; }` (a stub, or a test's stand-in) does nothing, and says so.
    if (!st.length) st.push({ kind: 'return', says: 'Does nothing', code: src.slice(f.at, f.end).replace(/\s+/g, ' ').trim().slice(0, 160), line, span: { startLine: line, endLine: lineAt(f.end - 1) } });
    noteErrors(st);
    const first = f.body[0], lastN = f.body[f.body.length - 1];
    fns.push({ name: f.name, line, params: inputsOf(f.body, src), doc: docAbove(lines, line), steps: st, body: first ? [lineAt(first.at), lineAt(lastN.end - 1)] : null });
  }
  const top = nodes.filter((n) => n.type !== 'function');
  if (top.length) {
    const st = steps(top);
    noteErrors(st);
    const name = file ? String(file).split(/[\\/]/).pop() : 'script';
    fns.push({ name, line: lineAt(top[0].at), params: inputsOf(top, src), doc: headerDoc(lines), steps: st, body: [lineAt(top[0].at), lineAt(top[top.length - 1].end - 1)], topLevel: true, headline: `Runs ${name}, from top to bottom.` });
  }
  fns.sort((a, b) => a.line - b.line);
  KNOWN_FNS = new Set(); DIES = new Map();
  return { fns, errors: [...errors].map(([name, line]) => ({ name, line })), tests: [] };
}

export const SHELL_TRIVIA = /^\s*(?:fi|done|esac|then|do|else|;;|\{|\}|\)|\(|[;&|]+)\s*(?:#.*)?$/;
export { cap };
