'use strict';
// Proof by running, JavaScript side: record what real code actually did, using V8's own debugger in this process
// (node:inspector), with no dependencies. Load it with `node --require <this file>`; set
//   THUNDER_TRACE_ROOT  the folder whose code is recorded (node_modules and test files are left out)
//   THUNDER_TRACE_OUT   a folder; each process writes trace-<pid>.json there when it exits
//   THUNDER_TRACE_MAX_SECONDS  stop recording after this many seconds (default 120)
//
// V8 stops at every statement of the recorded files (its own statement positions, from getPossibleBreakpoints). At
// an `if` / `else if` / `while` it works out the condition's value without side effects (evaluateOnCallFrame with
// throwOnSideEffect; a condition that could change something is left undecided and not recorded), then notes the next
// statement the same call reached. At a return point it notes the line of the `return` and the value; at the end of
// a function body, "reached the end without returning"; at a `throw`, the error's class and its parents. It never
// reads Thunder: compiler/src/executed.mjs compares this record with Thunder's flow.
const inspector = require('node:inspector');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const ROOT = process.env.THUNDER_TRACE_ROOT ? fs.realpathSync(process.env.THUNDER_TRACE_ROOT) : null;
const OUT = process.env.THUNDER_TRACE_OUT;
const MAX_MS = Number(process.env.THUNDER_TRACE_MAX_SECONDS || 120) * 1000;
const TEST = /(^|\/)(test|tests|__tests__|spec|specs|fixtures?)\//;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const CALL_OPENS_CONDITION = /(?:^\s*|[;{}]\s*|\belse\s+)(?:if|while)\s*\(\s*!*\s*(?:await\s+)?[\w$.]*$/;

if (ROOT && OUT) start();

function start() {
  const began = Date.now();
  const session = new inspector.Session();
  session.connect();
  const post = (method, params) => {
    let out, err;
    session.post(method, params, (e, r) => { err = e; out = r; });
    if (err) throw err;
    return out;
  };
  const scripts = new Map(); // scriptId -> { rel, source, lineStarts, types: Map("line:col" -> type) }
  const files = {};
  const meta = { node: process.version, pid: process.pid, pauses: 0, undecided: 0, capped: false };
  const pending = new Map(); // frame key -> the question waiting for its next step { rel, line, kind, truth }
  const last = new Map(); // frame key -> the last statement it stopped at { at, line }
  let stopped = false;

  const fileOf = (rel) => (files[rel] ||= { functions: {}, decisions: {}, returns: {} });
  const fn = (rel, line) => (fileOf(rel).functions[line] ||= { runs: 0, returns: {}, raises: {}, fellOff: 0, unwound: 0 });
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

  session.on('Debugger.scriptParsed', (m) => {
    if (stopped) return;
    const url = m.params.url;
    if (!url || !/\.[cm]?[jt]sx?$/.test(url) || /node_modules/.test(url)) return;
    let file;
    try { file = url.startsWith('file:') ? fileURLToPath(url) : url; file = fs.realpathSync(file); } catch { return; }
    if (!file.startsWith(ROOT + path.sep)) return;
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (TEST.test(rel) || TEST_FILE.test(rel)) return;
    let source;
    try { source = fs.readFileSync(file, 'utf8'); } catch { return; }
    const lineStarts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
    const types = new Map();
    let locs;
    try { locs = post('Debugger.getPossibleBreakpoints', { start: { scriptId: m.params.scriptId, lineNumber: 0, columnNumber: 0 } }).locations; } catch { return; }
    const lines = source.split('\n');
    const byLine = new Map();
    for (const l of locs) { if (!byLine.has(l.lineNumber)) byLine.set(l.lineNumber, []); byLine.get(l.lineNumber).push(l); }
    for (const [ln, list] of byLine) {
      const text = lines[ln] || '';
      list.sort((a, b) => a.columnNumber - b.columnNumber);
      // An `if (` / `while (` whose condition starts with a call has no stop of its own: V8 stops at the call. That
      // stop is where the question is asked (at = the keyword's column).
      const asks = [...text.matchAll(/(?:^|[^\w$.])((?:if|while)\s*\()/g)].map((x) => x.index + x[0].length - x[1].length);
      const conditionAt = new Map();
      for (const k of asks) {
        if (list.some((l) => l.columnNumber === k && l.type !== 'call')) continue;
        const first = list.find((l) => l.columnNumber > k);
        if (first && first.type === 'call') conditionAt.set(first.columnNumber, k);
      }
      for (const l of list) {
        let type = l.type || 'statement';
        if (l.type === 'call') {
          if (conditionAt.has(l.columnNumber)) type = `condition:${conditionAt.get(l.columnNumber)}`;
          else if (startsStatement(text, l.columnNumber)) {
            // A chain continued from the lines above (`body = body\n  .replace(…)`): the statement starts there.
            let from = ln;
            while (from > 0 && (/^\s*[.?]/.test(lines[from]) || /(?:[=(,+\-*/?:]|&&|\|\|)\s*$/.test(lines[from - 1].replace(/\/\/.*$/, ''))) && from > ln - 8) from--;
            type = from === ln ? 'statement' : `statement:${from}`;
          } else continue; // a call inside a statement: not a step of its own
        }
        types.set(`${ln}:${l.columnNumber}`, type);
        try { post('Debugger.setBreakpoint', { location: l }); } catch { /* not every position takes one */ }
      }
    }
    scripts.set(m.params.scriptId, { rel, source, lineStarts, types });
  });

  const keyOf = (frames) => frames.map((f, i) => (i === 0 ? `${f.functionLocation?.scriptId}:${f.functionLocation?.lineNumber}:${f.functionLocation?.columnNumber}` : `${f.location.scriptId}:${f.location.lineNumber}:${f.location.columnNumber}`)).join('|');
  const offsetOf = (s, loc) => s.lineStarts[loc.lineNumber] + loc.columnNumber;

  session.on('Debugger.paused', (msg) => {
    try { onPause(msg.params); } catch { /* never break the program being run */ }
    session.post('Debugger.resume');
  });

  function onPause({ callFrames, reason, data }) {
    if (stopped) return;
    if (Date.now() - began > MAX_MS) { meta.capped = true; stop(); return; }
    const top = callFrames[0];
    const s = scripts.get(top.location.scriptId);
    if (!s) return;
    meta.pauses++;
    const loc = top.location;
    const where = s.types.get(`${loc.lineNumber}:${loc.columnNumber}`) || 'statement';
    const line = (where.startsWith('statement:') ? Number(where.slice(10)) : loc.lineNumber) + 1;
    const key = keyOf(callFrames);
    const defLine = (top.functionLocation?.lineNumber ?? loc.lineNumber) + 1;
    let at = offsetOf(s, loc);
    const kind = s.types.get(`${loc.lineNumber}:${loc.columnNumber}`) || 'statement';
    // A stop at a call that opens a condition: the question starts at its `if` / `while`, earlier on the line.
    if (kind.startsWith('condition:')) at = s.lineStarts[loc.lineNumber] + Number(kind.slice(10));
    const text = s.source.slice(at, at + 400);
    // Top-level code (the module itself, not a function) is not a member Thunder draws.
    if (callFrames[0].functionLocation && callFrames[0].functionLocation.lineNumber === 0 && callFrames[0].functionLocation.columnNumber === 0 && !/^\s*(?:async\s+)?function\b/.test(s.source)) return;
    if (at >= s.source.trimEnd().length) return;

    if (reason === 'exception') {
      // A throw in this function: the line of the `throw`, the error's class and its parents.
      const p = pending.get(key);
      if (p) { pending.delete(key); if (/^throw\b/.test(text)) record(p, line); }
      if (!/^throw\b/.test(text)) return;
      let names = [data?.className || 'Error'];
      if (data?.objectId) {
        try {
          const r = post('Runtime.callFunctionOn', { objectId: data.objectId, returnByValue: true, functionDeclaration: 'function(){const n=[];let p=Object.getPrototypeOf(this);while(p&&p.constructor&&n.length<12){n.push(p.constructor.name);p=Object.getPrototypeOf(p);}return n}' });
          if (Array.isArray(r.result?.value) && r.result.value.length) names = r.result.value;
        } catch { /* keep the class name */ }
      }
      const f = fn(s.rel, defLine);
      const e = (f.raises[line] ||= { count: 0, types: {} });
      e.count++;
      e.types[names[0]] = names;
      return;
    }
    const p = pending.get(key);
    const prev = last.get(key);
    if (kind === 'return') {
      const f = fn(s.rel, defLine);
      f.runs++;
      pending.delete(key);
      last.delete(key);
      // The `return` this return point closes: the statement the call last stopped at, when that is a `return`;
      // otherwise found by reading back from the return point. The end of the body is "reached the end".
      const ret = s.source[at] === '}' ? null : prev && /^return\b/.test(s.source.slice(prev.at, prev.at + 7)) ? prev.line : returnLine(s, at);
      if (ret === 'arrow') return; // an arrow function's expression body: its value is its answer, no `return` line
      if (p) record(p, ret ?? null);
      if (ret == null) { f.fellOff++; if (prev) bump(f.fellOffAt ||= {}, prev.line); return; }
      const e = (f.returns[ret] ||= { count: 0, values: [] });
      e.count++;
      const v = plain(top.returnValue);
      if (v != null && !e.values.includes(v) && e.values.length < 6) e.values.push(v);
      return;
    }
    if (p) { pending.delete(key); record(p, line); }
    last.set(key, { at, line });
    const m = text.match(/^(if|while)\s*\(/);
    if (!m) return;
    const cond = condition(text, m[0].length - 1);
    if (cond == null) { meta.undecided++; return; }
    let truth = null;
    try {
      const r = post('Debugger.evaluateOnCallFrame', { callFrameId: top.callFrameId, expression: `!!(${cond})`, throwOnSideEffect: true, silent: true, returnByValue: true });
      if (!r.exceptionDetails && typeof r.result?.value === 'boolean') truth = r.result.value;
    } catch { truth = null; }
    if (truth == null) { meta.undecided++; return; }
    pending.set(key, { rel: s.rel, line, kind: m[1], truth });
  }

  function record(p, next) {
    const d = (fileOf(p.rel).decisions[p.line] ||= { kind: p.kind, obs: {} });
    bump(d.obs, `${p.truth ? 'body' : next == null ? 'end' : 'after'}|${next ?? ''}`);
  }

  /** The line of the `return` keyword this return point belongs to, or null for the end of a function body. */
  function returnLine(s, at) {
    if (s.source[at] === '}') return null;
    // V8 puts a return point just after the statement (`return x;|`): step back over the `;` and spaces, then walk
    // back to the statement's start, the nearest `return` keyword at bracket depth 0.
    let end = at - 1;
    while (end >= 0 && /\s/.test(s.source[end])) end--;
    if (s.source[end] === ';') end--;
    const before = s.source.slice(Math.max(0, end - 4000), end + 1);
    const base = Math.max(0, end - 4000);
    let depth = 0;
    for (let i = before.length - 1; i >= 0; i--) {
      const c = before[i];
      if (c === '"' || c === "'" || c === '`') { let j = i - 1; while (j >= 0 && (before[j] !== c || before[j - 1] === '\\')) j--; i = j; continue; }
      if (c === ')' || c === ']' || c === '}') depth++;
      else if (c === '(' || c === '[' || c === '{') { if (depth === 0) return null; depth--; }
      else if (depth === 0 && c === 'r' && before.startsWith('return', i) && !/[\w$]/.test(before[i - 1] || ' ') && !/[\w$]/.test(before[i + 6] || ' ')) {
        const abs = base + i;
        let line = 0;
        while (line + 1 < s.lineStarts.length && s.lineStarts[line + 1] <= abs) line++;
        return line + 1;
      }
      else if (depth === 0 && c === '>' && before[i - 1] === '=') return 'arrow';
      else if (depth === 0 && c === ';') return null;
    }
    return null;
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    try { post('Debugger.disable'); } catch { /* already off */ }
  }

  post('Debugger.enable');
  post('Debugger.setPauseOnExceptions', { state: 'all' });
  process.on('exit', () => {
    stop();
    try {
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, `trace-${process.pid}.json`), JSON.stringify({ meta, files }));
    } catch { /* nothing to write to */ }
  });
}

/**
 * True when the call at `col` begins a statement: nothing before it on the line but an optional `}` / `else` / a
 * closed `if (…)` / `;`, an assignment's left side, `await`, `new`, `void`, and the callee's own path (`res.send`).
 */
function startsStatement(text, col) {
  let p = text.slice(0, col).replace(/(?:await\s+|new\s+|void\s+)?[\w$.]*$/, '');
  p = p.replace(/(?:(?:var|let|const)\s+)?[\w$.[\]'"]+\s*(?:[-+*/%]|\|\||&&|\?\?)?=\s*(?:await\s+|new\s+)?$/, '');
  if (/^\s*$/.test(p) || /[;{}]\s*$/.test(p) || /\belse\s*$/.test(p)) return true;
  // A one-line `if (cond) call()`: the call is the statement the question leads to.
  const m = p.match(/^(.*?\b(?:if|while|for)\s*)\(/);
  if (m && /\)\s*$/.test(p)) { const inner = condition(p, m[1].length); return inner != null && m[1].length + inner.length + 2 === p.trimEnd().length; }
  return false;
}

/** A returned value written so Thunder can compare it: numbers, text, yes/no, null, undefined. */
function plain(v) {
  if (!v) return null;
  if (v.type === 'undefined') return 'undefined';
  if (v.subtype === 'null') return 'null';
  if (v.type === 'number' && 'value' in v) return String(v.value);
  if (v.type === 'boolean') return String(v.value);
  if (v.type === 'string' && typeof v.value === 'string' && v.value.length <= 80) return JSON.stringify(v.value);
  return null;
}

/**
 * The condition inside `( … )` starting at `open` (the index of the bracket): strings, template literals, comments,
 * and regular expressions are skipped so their brackets do not count. Null when the text does not close.
 */
function condition(text, open) {
  let depth = 0, i = open, prev = '(';
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < text.length && text[i] !== q) { if (text[i] === '\\') i++; else if (q === '`' && text[i] === '$' && text[i + 1] === '{') return null; i++; }
      prev = 'a'; i++; continue;
    }
    if (c === '/' && text[i + 1] === '/') return null;
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); if (e < 0) return null; i = e + 2; continue; }
    if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]/.test(prev)) {
      i++;
      let cls = false;
      while (i < text.length && (text[i] !== '/' || cls)) { if (text[i] === '\\') i++; else if (text[i] === '[') cls = true; else if (text[i] === ']') cls = false; else if (text[i] === '\n') return null; i++; }
      prev = 'a'; i++; continue;
    }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return text.slice(open + 1, i); }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return null;
}

module.exports = { condition, plain, startsStatement };
