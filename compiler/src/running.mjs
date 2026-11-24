// The running system: what happened when the code ran, shown on Thunder's pictures.
//
// When something runs or breaks, people read logs and stack traces in the original language. Here that evidence is
// placed on the flows Thunder already draws: how many times each step ran, which side of each question was taken,
// how often each Stop happened (with the error and message as seen), which endings were reached, and, per action or
// rule, its calls, failures, and time. A stack trace is explained in Thunder: the action, the step, and, when the
// flow shows it, the answers that led there.
//
// Every source becomes one shape of evidence, an event:
//
//   { file, line, kind: 'decision' | 'return' | 'raise' | 'call' | 'line', side?, error?, message?, value?,
//     durationMs?, count?, function?, source }
//
//   * decision: a question at `line` was answered; side is 'held' / 'not held' (the code's condition), 'case:<line>',
//     'each' / 'done' (a loop), or 'handled' (an error handler ran);
//   * return: the code gave back at `line` (null: it reached the end of the function);
//   * raise: the code raised or threw at `line` (a Stop when Thunder draws one there; otherwise a failure at a step);
//   * call: an action or rule ran (by its file and first line, or by its function name), optionally with its time
//     and whether it failed;
//   * line: something reported from `line` (a log line), so the step on that line ran.
//
// Adapters: fromTrace (proof by running's recorders, executed.mjs), fromStack (Python tracebacks, Node/V8 stacks,
// Java and C# stack traces, Go panics), fromLogs (JSON lines with a file/line or function), fromOtlp (OpenTelemetry
// spans exported as OTLP/JSON with code.* attributes).
//
// Honesty: counts come only from evidence. Nothing is said about a path no evidence shows; a step with no evidence has
// no count (not zero). Evidence that cannot be placed on a step is listed under notMatched with the reason. The one
// thing worked out rather than observed is "how it got there" for an error: the answers that lead to a step in the
// flow as drawn (a step inside a question's Yes side, or after a question whose other side always stops). It is
// worded as such, and left out when the flow does not show it.
//
// Pure and browser-safe (no node: imports).
import { pathsOf, modelText } from './model.mjs';

export const RUNNING_SCHEMA = 'thunder-running-v1';

// ── Small helpers ───────────────────────────────────────────────────────────────────────────────────────────

/** 1204 -> "1,204". */
export const countWords = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pct = (part, whole) => { if (!whole) return null; const p = (part / whole) * 100; return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`; };
const times = (n) => `${countWords(n)} time${n === 1 ? '' : 's'}`;
const ms = (x) => (x >= 1000 ? `${(x / 1000).toFixed(x >= 10000 ? 0 : 1)} s` : x >= 10 ? `${Math.round(x)} ms` : `${Number(x.toFixed(2))} ms`);
const norm = (p) => String(p || '').replace(/^file:\/\//, '').replace(/\\/g, '/').replace(/^\.\//, '');
const quoteText = (s, max = 80) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };

// ── Adapters: each source -> events ───────────────────────────────────────────────────────────────────────────

/**
 * Proof by running's record (executed.mjs: { files: { path: { functions, decisions, returns } } }) as events. The
 * recorders note per line which way each question went, how each call ended, and what was raised.
 */
export function fromTrace(trace) {
  const out = [];
  for (const [file, f] of Object.entries(trace?.files || {})) {
    for (const [L, d] of Object.entries(f.decisions || {})) {
      for (const [k, count] of Object.entries(d.obs || {})) {
        const [where, nRaw] = k.split('|');
        const next = nRaw === '' || nRaw == null ? null : Number(nRaw);
        const side = d.kind === 'handler' ? 'handled' : where.startsWith('case:') ? where : d.kind === 'for' ? (where === 'body' ? 'each' : 'done') : where === 'body' ? 'held' : 'not held';
        out.push({ source: 'trace', kind: 'decision', file, line: Number(L), side, count, question: d.kind, ...(next != null ? { next } : {}) });
      }
    }
    for (const [L, fn] of Object.entries(f.functions || {})) {
      const line = Number(L);
      out.push({ source: 'trace', kind: 'call', file, line, fnLine: line, count: fn.runs || 0, failed: fn.unwound || 0 });
      for (const [R, e] of Object.entries(fn.returns || {})) out.push({ source: 'trace', kind: 'return', file, line: Number(R), fnLine: line, count: e.count, ...(e.values?.length ? { value: e.values } : {}), ...(f.returns?.[R] != null ? { within: f.returns[R] } : {}) });
      for (const [R, e] of Object.entries(fn.raises || {})) out.push({ source: 'trace', kind: 'raise', file, line: Number(R), fnLine: line, count: e.count, error: Object.keys(e.types || {}).join(' or ') || undefined });
      if (fn.fellOff) out.push({ source: 'trace', kind: 'return', file, line: null, fnLine: line, count: fn.fellOff, ...(fn.fellOffAt ? { after: Object.keys(fn.fellOffAt).map(Number) } : {}) });
    }
  }
  return out;
}

// Stack traces. Each parser returns { language, error, message, frames: [{ file, line, function }] } with the
// innermost frame (where it failed) first.

const PY_FRAME = /^\s*File "([^"]+)", line (\d+)(?:, in (.+))?\s*$/;
const PY_CHAIN = /^(?:During handling of the above exception, another exception occurred:|The above exception was the direct cause of the following exception:)\s*$/;
const JS_FRAME = /^\s*at (?:(?:async )?(.+?) \()?((?:node:|file:\/\/)?(?:[A-Za-z]:)?[^():]+):(\d+):(\d+)\)?\s*$/;
const JAVA_FRAME = /^\s*at ([\w$.<>/]+)\.([\w$<>]+)\(([^:()]+):(\d+)\)\s*$/;
const CS_FRAME = /^\s*at (.+?)\(.*?\) in (.+):line (\d+)\s*$/;
const GO_FUNC = /^([\w./*()-]+?(?:\.[\w$*()]+)+)\(.*\)\s*$/;
const GO_FILE = /^\t(.+?\.go):(\d+)(?: \+0x[0-9a-f]+)?\s*$/;

function parsePython(lines) {
  // The last traceback in a chain is the one that ended the program; earlier ones are its causes.
  const sections = [];
  let cur = null;
  for (const l of lines) {
    if (/^Traceback \(most recent call last\):/.test(l.trim())) { cur = { frames: [] }; sections.push(cur); continue; }
    if (PY_CHAIN.test(l.trim())) { cur = null; continue; }
    if (!cur) continue;
    const f = l.match(PY_FRAME);
    if (f) { cur.frames.push({ file: f[1], line: Number(f[2]), function: f[3]?.trim() }); continue; }
    // The error is the first line after the frames that is not indented (frames show their code indented).
    if (cur.error == null && cur.frames.length && l.trim() && !/^\s/.test(l)) {
      const m = l.trim().match(/^([A-Za-z_][\w.]*)(?::\s?(.*))?$/);
      if (m) { cur.error = m[1].split('.').pop(); cur.message = (m[2] ?? '').trim(); }
      cur = cur.error ? cur : null;
    }
  }
  const done = sections.filter((x) => x.frames.length && x.error);
  if (!done.length) return null;
  const last = done.at(-1);
  return { language: 'python', error: last.error, message: last.message, frames: [...last.frames].reverse(), ...(done.length > 1 ? { causes: done.slice(0, -1).map((x) => ({ error: x.error, message: x.message })) } : {}) };
}

// pytest's own report of a failing test: code with `>` at the failing line, `E   Error: message`, and a
// `path.py:42: Error` line after each frame (outermost first).
const PYTEST_LOC = /^([^\s:][^:]*\.py):(\d+):(?: in (\S+)| (\w[\w.]*))?\s*$/;
function parsePytest(lines) {
  const frames = [];
  let error = null, message = '';
  let fn = null;
  for (const l of lines) {
    const d = l.match(/^\s*(?:async )?def (\w+)\(/);
    if (d) fn = d[1];
    const e = l.match(/^E\s+([A-Za-z_][\w.]*?)(?::\s?(.*))?$/);
    if (e && error == null && /^[A-Z]/.test(e[1].split('.').pop())) { error = e[1].split('.').pop(); message = (e[2] ?? '').trim(); }
    const loc = l.match(PYTEST_LOC);
    if (loc) { const name = loc[3] ?? fn; frames.push({ file: loc[1], line: Number(loc[2]), ...(name ? { function: name } : {}) }); fn = null; if (loc[4] && error == null) error = loc[4].split('.').pop(); }
  }
  return frames.length && error ? { language: 'python', error, message, frames: frames.reverse() } : null;
}

function parseJs(lines) {
  const at = lines.findIndex((l) => JS_FRAME.test(l));
  if (at < 0) return null;
  // The error line is the last non-frame line above the first frame that names an error ("TypeError: …").
  let error = 'Error', message = '';
  for (let i = at - 1; i >= 0; i--) {
    const m = lines[i].trim().match(/^(?:Uncaught )?([A-Z][\w$]*(?:Error|Exception)|Error|AssertionError(?: \[[A-Z_]+\])?)(?::\s?(.*))?$/);
    if (m) { error = m[1].replace(/ \[.*\]$/, ''); message = (m[2] ?? '').trim(); break; }
  }
  const frames = [];
  for (let i = at; i < lines.length; i++) {
    const f = lines[i].match(JS_FRAME);
    if (!f) { if (frames.length && lines[i].trim() && !/^\s*at /.test(lines[i])) break; continue; }
    if (/^node:/.test(f[2])) { frames.push({ file: f[2], line: Number(f[3]), function: f[1], internal: true }); continue; }
    frames.push({ file: f[2], line: Number(f[3]), function: f[1]?.replace(/^(?:new |Object\.|Function\.)/, '') });
  }
  return frames.length ? { language: 'javascript', error, message, frames } : null;
}

function parseJava(lines) {
  // Java prints the outer exception first and its causes below ("Caused by:"); the deepest cause holds the line
  // where it actually went wrong.
  const blocks = [];
  let cur = null;
  for (const l of lines) {
    const head = l.trim().match(/^(?:Exception in thread "[^"]*"\s+|Caused by:\s+)?((?:[a-z_$][\w$]*\.)+[A-Z][\w$]*(?:Exception|Error|Throwable)?|[A-Z][\w$]*(?:Exception|Error))(?::\s?(.*))?$/);
    const f = l.match(JAVA_FRAME);
    if (f) { if (cur) cur.frames.push({ file: f[3], line: Number(f[4]), function: `${f[1]}.${f[2]}`, className: f[1] }); continue; }
    if (head && !/^\s+at /.test(l) && (/^(?:Exception in thread|Caused by:)/.test(l.trim()) || !cur)) { cur = { qualified: head[1], error: head[1].split('.').pop(), message: (head[2] ?? '').trim(), frames: [] }; blocks.push(cur); }
  }
  const withFrames = blocks.filter((b) => b.frames.length);
  if (!withFrames.length) return null;
  const root = withFrames.at(-1);
  return { language: 'java', error: root.error, message: root.message, frames: root.frames, ...(withFrames.length > 1 ? { wrappedIn: withFrames.slice(0, -1).map((b) => ({ error: b.error, message: b.message })) } : {}) };
}

function parseCSharp(lines) {
  const at = lines.findIndex((l) => CS_FRAME.test(l) || /^\s*at [\w.<>`]+\(.*\)\s*$/.test(l));
  if (at < 0) return null;
  let error = 'Exception', message = '';
  for (let i = at - 1; i >= 0; i--) {
    const m = lines[i].trim().match(/^(?:Unhandled exception\.\s*)?((?:[A-Za-z_][\w]*\.)*[A-Z]\w*Exception)(?::\s?(.*))?$/);
    if (m) { error = m[1].split('.').pop(); message = (m[2] ?? '').replace(/\s*--->.*$/, '').trim(); break; }
  }
  const frames = [];
  for (let i = at; i < lines.length; i++) {
    const f = lines[i].match(CS_FRAME);
    if (f) frames.push({ file: f[2], line: Number(f[3]), function: f[1] });
    else if (/^\s*at /.test(lines[i])) frames.push({ file: null, line: null, function: lines[i].trim().slice(3).replace(/\(.*$/, ''), internal: true });
    else if (frames.length && lines[i].trim() && !/^\s*---/.test(lines[i])) break;
  }
  return frames.some((f) => f.file) ? { language: 'csharp', error, message, frames } : null;
}

function parseGo(lines) {
  const p = lines.findIndex((l) => /^panic: /.test(l) || /^fatal error: /.test(l));
  if (p < 0) return null;
  const head = lines[p].replace(/^panic: |^fatal error: /, '').replace(/ \[recovered\]$/, '');
  const rt = head.match(/^runtime error: (.*)$/);
  const err = head.match(/^([\w.*]+(?:Error|Err)\w*)?:?\s*(.*)$/);
  const error = rt ? 'runtime error' : /^fatal/.test(lines[p]) ? 'fatal error' : 'panic';
  const message = rt ? rt[1] : head;
  const frames = [];
  for (let i = p + 1; i < lines.length - 1; i++) {
    if (/^goroutine \d+ \[/.test(lines[i]) && frames.length) break;
    const fn = lines[i].match(GO_FUNC), loc = lines[i + 1].match(GO_FILE);
    if (fn && loc) {
      const internal = /^runtime\.|^panic\(/.test(fn[1]) || /\/src\/runtime\//.test(loc[1]);
      frames.push({ file: loc[1], line: Number(loc[2]), function: fn[1], ...(internal ? { internal: true } : {}) });
      i++;
    } else if (/^panic\(/.test(lines[i]) && loc) { frames.push({ file: loc[1], line: Number(loc[2]), function: 'panic', internal: true }); i++; }
  }
  void err;
  return frames.length ? { language: 'go', error, message, frames } : null;
}

/** Read one stack trace in any of the languages Thunder knows (Python, JavaScript/TypeScript, Java, C#, Go). */
export function parseStack(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const tries = [];
  if (lines.some((l) => /^Traceback \(most recent call last\):/.test(l.trim()))) tries.push(parsePython);
  if (lines.some((l) => /^E\s{2,}\S/.test(l)) && lines.some((l) => PYTEST_LOC.test(l))) tries.push(parsePytest);
  if (lines.some((l) => /^(?:panic|fatal error): /.test(l)) && lines.some((l) => GO_FILE.test(l))) tries.push(parseGo);
  if (lines.some((l) => CS_FRAME.test(l))) tries.push(parseCSharp);
  if (lines.some((l) => JAVA_FRAME.test(l))) tries.push(parseJava);
  if (lines.some((l) => JS_FRAME.test(l))) tries.push(parseJs);
  for (const t of tries) { const r = t(lines); if (r) return r; }
  return null;
}

/** Every stack trace in a text (a log of many failures): split on where each one starts. */
export function parseStacks(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const starts = [];
  lines.forEach((l, i) => {
    const prev = lines[i - 1] ?? '';
    if (/^Traceback \(most recent call last\):/.test(l.trim()) && !PY_CHAIN.test(lines[i - 2]?.trim() ?? '')) starts.push(i);
    else if (/^_{3,} .+ _{3,}$/.test(l)) starts.push(i);
    else if (/^(?:panic|fatal error): /.test(l)) starts.push(i);
    else if (/^(?:Exception in thread |Unhandled exception\.)/.test(l)) starts.push(i);
    else if (/^\s*at /.test(lines[i + 1] ?? '') && !/^\s*at /.test(l) && l.trim() && !/^\s/.test(l) && !/^Caused by:/.test(l) && !/^\s*at /.test(prev) && !/^\s*\.\.\. \d+ more/.test(prev)) starts.push(i);
  });
  // A Python chain keeps its sections together; everything else is cut at each start.
  const cuts = [...new Set(starts)].sort((a, b) => a - b);
  if (!cuts.length) { const one = parseStack(text); return one ? [one] : []; }
  const out = [];
  for (let k = 0; k < cuts.length; k++) {
    const r = parseStack(lines.slice(cuts[k], cuts[k + 1] ?? lines.length).join('\n'));
    if (r) out.push(r);
  }
  return out;
}

/** Stack traces as events: each failure is a `raise` at its frames (placed on the innermost frame Thunder read). */
export function fromStack(text, { count = 1 } = {}) {
  return parseStacks(text).map((s) => ({ source: 'stack', kind: 'raise', file: s.frames[0]?.file ?? null, line: s.frames[0]?.line ?? null, error: s.error, message: s.message, frames: s.frames, language: s.language, count, ends: true }));
}

const LEVEL_NUM = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };
// A field by name: flat ("log.origin" as one key, as ECS writes it), or nested (log -> origin).
const pick = (o, keys) => {
  for (const k of keys) {
    const v = o?.[k] ?? k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
    if (v != null && v !== '') return v;
  }
  return undefined;
};

/** Where a structured log line says it came from: { file, line, function }. */
function logSource(o) {
  const nested = pick(o, ['logging.googleapis.com/sourceLocation', 'sourceLocation', 'source', 'src', 'location', 'log.origin', 'caller', 'callsite']);
  let file = pick(o, ['file', 'filename', 'pathname', 'code.filepath', 'code.file.path', 'log.origin.file.name', 'source_file']);
  let line = pick(o, ['line', 'lineno', 'lineNumber', 'code.lineno', 'code.line.number', 'log.origin.file.line', 'source_line']);
  let fn = pick(o, ['function', 'funcName', 'func', 'method', 'code.function', 'code.function.name', 'log.origin.function']);
  if (typeof nested === 'string') {
    const m = nested.match(/^(.*?):(\d+)(?::\d+)?$/);
    if (m) { file ??= m[1]; line ??= m[2]; }
  } else if (nested && typeof nested === 'object') {
    file ??= pick(nested, ['file.name', 'file', 'filename', 'path']);
    line ??= pick(nested, ['file.line', 'line', 'lineno', 'lineNumber']);
    fn ??= pick(nested, ['function', 'func', 'method', 'functionName']);
  }
  if (typeof file === 'object') file = undefined;
  return { file: file != null ? String(file) : null, line: line != null && /^\d+$/.test(String(line)) ? Number(line) : null, function: fn != null ? String(fn) : null };
}

/**
 * Structured logs (JSON lines: one object per line) as events: a `line` event where a log line names its file and
 * line, a `call` of the named function otherwise. An error logged with its stack (exc_info, err.stack) is also read
 * as a stack trace. Lines that are not JSON, or name no place in the code, are kept as not matched.
 */
export function fromLogs(text) {
  const out = [];
  const lines = String(text ?? '').split(/\r?\n/);
  let notJson = 0, noPlace = 0;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    let o;
    try { o = JSON.parse(l); } catch { notJson++; continue; }
    if (!o || typeof o !== 'object') { notJson++; continue; }
    const lv = pick(o, ['level', 'severity', 'levelname', 'lvl', 'log.level']);
    const level = String(typeof lv === 'number' ? LEVEL_NUM[lv] ?? lv : lv ?? 'info').toLowerCase();
    const message = pick(o, ['message', 'msg', 'event', 'text']);
    const src = logSource(o);
    const stack = pick(o, ['exc_info', 'stack', 'stack_trace', 'err.stack', 'error.stack', 'error.stack_trace', 'exception']);
    if (typeof stack === 'string' && /\n/.test(stack)) out.push(...fromStack(stack).map((e) => ({ ...e, source: 'logs', ends: false })));
    if (!src.file && !src.function) { noPlace++; continue; }
    out.push({ source: 'logs', kind: src.line != null ? 'line' : 'call', file: src.file, line: src.line, function: src.function, level, ...(message != null ? { message: String(message) } : {}), count: 1, ...(src.line == null ? { fromLog: true } : {}) });
  }
  if (notJson) out.push({ source: 'logs', kind: 'line', file: null, line: null, count: notJson, unplaced: 'the line is not JSON, so Thunder cannot tell where in the code it came from' });
  if (noPlace) out.push({ source: 'logs', kind: 'line', file: null, line: null, count: noPlace, unplaced: 'the log line names no file, line, or function' });
  return out;
}

const otlpValue = (v) => (v == null ? undefined : v.stringValue ?? (v.intValue != null ? Number(v.intValue) : undefined) ?? v.doubleValue ?? v.boolValue);
const otlpAttrs = (list) => Object.fromEntries((list || []).map((a) => [a.key, otlpValue(a.value)]));

/**
 * OpenTelemetry spans (an OTLP/JSON export: { resourceSpans: [...] }, or one such object per line, as the
 * collector's file exporter writes) as events: each span with code.filepath / code.lineno / code.function (or the
 * newer code.file.path / code.line.number / code.function.name) is a `call` with its duration and whether it failed;
 * an exception event with a stack trace is read as one.
 */
export function fromOtlp(input) {
  const docs = [];
  if (typeof input === 'string') {
    try { docs.push(JSON.parse(input)); } catch { for (const l of input.split(/\r?\n/)) { if (l.trim()) { try { docs.push(JSON.parse(l)); } catch { /* not a JSON line */ } } } }
  } else if (input) docs.push(input);
  const out = [];
  let noCode = 0;
  for (const d of docs) {
    for (const rs of d.resourceSpans || []) {
      for (const ss of [...(rs.scopeSpans || []), ...(rs.instrumentationLibrarySpans || [])]) {
        for (const sp of ss.spans || []) {
          const a = otlpAttrs(sp.attributes);
          const file = a['code.filepath'] ?? a['code.file.path'] ?? null;
          const line = a['code.lineno'] ?? a['code.line.number'] ?? null;
          const fnFull = a['code.function'] ?? a['code.function.name'] ?? null;
          const ns = a['code.namespace'] ?? null;
          const start = Number(sp.startTimeUnixNano), end = Number(sp.endTimeUnixNano);
          const durationMs = Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 1e6 : undefined;
          const failed = sp.status && (sp.status.code === 2 || sp.status.code === 'STATUS_CODE_ERROR');
          const exc = (sp.events || []).find((e) => e.name === 'exception');
          const ex = exc ? otlpAttrs(exc.attributes) : {};
          if (!file && !fnFull) { noCode++; continue; }
          // code.function.name may be fully qualified ("Library.borrow"); the last part is the function.
          const fn = fnFull ? String(fnFull).split(/[.:]+/).pop() : null;
          const owner = ns ?? (fnFull && /[.:]/.test(String(fnFull)) ? String(fnFull).split(/[.:]+/).slice(-2, -1)[0] : null);
          out.push({ source: 'otlp', kind: 'call', file, line: line != null ? Number(line) : null, function: fn, ...(owner ? { namespace: String(owner).split('.').pop() } : {}), span: sp.name, count: 1, ...(durationMs != null ? { durationMs } : {}), failed: failed ? 1 : 0, ...(failed ? { error: ex['exception.type'] ? String(ex['exception.type']).split('.').pop() : 'error', message: ex['exception.message'] ?? sp.status.message ?? '' } : {}) });
          if (typeof ex['exception.stacktrace'] === 'string') out.push(...fromStack(ex['exception.stacktrace']).map((e) => ({ ...e, source: 'otlp', ends: false })));
        }
      }
    }
  }
  if (noCode) out.push({ source: 'otlp', kind: 'call', file: null, line: null, count: noCode, unplaced: 'the span has no code.filepath, code.lineno, or code.function attributes' });
  return out;
}

// ── Placing evidence on the model ─────────────────────────────────────────────────────────────────────────────

/** Find the model's file for a path from elsewhere (absolute, another machine's folder, a Java file name). */
function fileMatcher(model) {
  const paths = [...new Set([...(model.files || []).map((f) => f.path), ...model.members.map((m) => m.file)])];
  const split = paths.map((p) => ({ p, parts: norm(p).split('/').filter(Boolean) }));
  return (raw, hint) => {
    const want = norm(raw);
    if (!want) return { reason: 'it names no file' };
    if (paths.includes(want)) return { file: want };
    const parts = want.split('/').filter(Boolean);
    // Java names only the file ("Library.java"); its class's package says the folders (com.school.Library).
    if (parts.length === 1 && hint) parts.unshift(...hint.split('.').slice(0, -1));
    let best = 0, found = [];
    for (const s of split) {
      let k = 0;
      while (k < s.parts.length && k < parts.length && s.parts[s.parts.length - 1 - k] === parts[parts.length - 1 - k]) k++;
      if (k > best) { best = k; found = [s.p]; } else if (k === best && k > 0) found.push(s.p);
    }
    if (!best) return { reason: `no file Thunder read is ${parts.at(-1)}` };
    if (found.length > 1) return { reason: `${found.length} files Thunder read end with ${parts.slice(-best).join('/')}; the evidence does not say which` };
    return { file: found[0] };
  };
}

/** The innermost member of a file holding a line. */
function memberAt(model, file, line) {
  const hits = model.members.filter((m) => m.file === file && line >= m.lines[0] && line <= m.lines[1]);
  return hits.sort((a, b) => (a.lines[1] - a.lines[0]) - (b.lines[1] - b.lines[0]))[0] ?? null;
}

/** Members by function name (and its class, when given). */
function membersNamed(model, fn, { file, namespace } = {}) {
  const name = String(fn).replace(/^.*[.:#]/, '').replace(/^<|>$/g, '');
  let hits = model.members.filter((m) => m.name === name && (!file || m.file === file));
  if (namespace && hits.length > 1) {
    const ns = hits.filter((m) => m.owner && String(m.owner).split('#').pop() === namespace);
    if (ns.length) hits = ns;
  }
  return hits;
}

/**
 * The node of a member's flow at a line, for one kind of evidence: a question (for a decision), a Stop or ending, or
 * any step. `approximate` when the line is inside a step that starts above it (a statement written over several
 * lines); never a question's or loop's lines, which hold other steps.
 */
function nodeAt(member, line, want) {
  const here = member.flow.nodes.filter((n) => n.line === line && n.kind !== 'start');
  if (want === 'decision') return here.find((n) => n.kind === 'decision' && !n.handler) ?? here.find((n) => n.kind === 'loop') ?? null;
  if (here.length) {
    const order = want === 'raise' ? ['stop', 'step', 'code', 'end', 'decision', 'loop'] : ['step', 'code', 'stop', 'end', 'decision', 'loop'];
    return { node: [...here].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0], approximate: false };
  }
  const above = member.flow.nodes.filter((n) => n.line != null && n.line < line && n.kind !== 'start').sort((a, b) => b.line - a.line)[0];
  if (above && (above.kind === 'step' || above.kind === 'code' || above.kind === 'stop' || above.kind === 'end')) {
    // Only when no other drawn node of this member starts between it and the line (it is the statement in progress).
    return { node: above, approximate: true };
  }
  return null;
}

/** Which side of a question a decision event took, in Thunder's words, and its block key. */
function sideOf(node, block, ev) {
  if (node.kind === 'loop') return ev.side === 'each' || ev.side === 'held' ? { key: 'each', label: 'For each' } : { key: 'done', label: 'Done' };
  if (node.cases) {
    const P = String(ev.side).startsWith('case:') ? Number(String(ev.side).slice(5)) : null;
    const c = P != null ? (block?.cases || []).find((x) => x.line === P) : null;
    return c ? { key: `case:${P}`, label: c.label } : P == null ? { key: 'none', label: 'None of these' } : null;
  }
  if (ev.side === 'yes' || ev.side === 'no') return { key: ev.side, label: ev.side === 'yes' ? 'Yes' : 'No' };
  const yesWhen = node.whenTrue || 'yes';
  const s = ev.side === 'held' ? yesWhen : yesWhen === 'yes' ? 'no' : 'yes';
  return { key: s, label: s === 'yes' ? 'Yes' : 'No' };
}

function blocksById(flow) {
  const out = new Map();
  const walk = (bs) => { for (const b of bs || []) { out.set(b.id, b); walk(b.yes); walk(b.no); walk(b.each); walk(b.body); for (const c of b.cases || []) walk(c.blocks); for (const h of b.handlers || []) { out.set(h.id, h); walk(h.blocks); } if (b.always) walk(b.always.blocks); } };
  walk(flow.blocks);
  return out;
}

/** A plain literal from a recorded value ('"NoFee"', 'True', '3'), or undefined. */
function literal(v) {
  const s = String(v ?? '').trim();
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  if (/^(True|true)$/.test(s)) return true;
  if (/^(False|false)$/.test(s)) return false;
  if (/^(None|null|nil|undefined)$/.test(s)) return null;
  const q = s.match(/^(["'])(.*)\1$/);
  return q ? q[2] : s ? s : undefined;
}

/**
 * Project evidence onto the model's flows. `evidence` is a list of events (from the adapters above, or your own in
 * the same shape). Returns thunder-running-v1:
 *
 *   members: { [memberId]: { calls, failures, timing?, nodes: { [nodeId]: NodeRun }, hotPath, says } }
 *   notMatched: [{ source, kind, file, line, function?, what, reason, count }]
 *
 * A NodeRun has `ran` (times seen), and for a question `sides` ({ Yes: n, No: n } or each case), for a Stop
 * `errors` ([{ error, message?, count }]), for a step that failed `failed` (the same), for a log `levels`.
 */
export function runtimeOverlay(model, evidence = []) {
  const findFile = fileMatcher(model);
  const members = {};
  const notMatched = [];
  const sources = {};
  const unplaced = (ev, reason, what) => {
    const key = `${ev.source}|${ev.kind}|${ev.file ?? ''}|${ev.line ?? ''}|${ev.function ?? ''}|${reason}`;
    const had = notMatched.find((x) => x.key === key);
    if (had) { had.count += ev.count ?? 1; return; }
    notMatched.push({ key, source: ev.source ?? 'evidence', kind: ev.kind, file: ev.file ?? null, line: ev.line ?? null, ...(ev.function ? { function: String(ev.function) } : {}), what: what ?? describe(ev), reason, count: ev.count ?? 1 });
  };
  const mem = (m) => (members[m.id] ||= { id: m.id, name: m.name, label: m.label, file: m.file, lines: m.lines, calls: 0, failures: 0, nodes: {}, sources: [] });
  const nodeRun = (r, n) => (r.nodes[n.id] ||= { id: n.id, kind: n.kind, text: n.text, line: n.line ?? null });
  const addError = (list, ev, c) => {
    const e = list.find((x) => x.error === (ev.error ?? 'an error') && (x.message ?? '') === (ev.message ?? ''));
    if (e) e.count += c; else list.push({ error: ev.error ?? 'an error', ...(ev.message ? { message: ev.message } : {}), count: c });
  };
  // Where the evidence itself says functions start (a recorder's per-function record).
  const fnStarts = new Set(evidence.filter((e) => e.fnLine != null).map((e) => `${norm(e.file)}|${e.fnLine}`));
  const blocks = new Map();
  const blockOf = (m, id) => { if (!blocks.has(m.id)) blocks.set(m.id, blocksById(m.flow)); return blocks.get(m.id).get(id); };

  for (const ev of evidence) {
    const c = ev.count ?? 1;
    sources[ev.source ?? 'evidence'] = (sources[ev.source ?? 'evidence'] || 0) + c;
    if (ev.unplaced) { unplaced(ev, ev.unplaced, ev.source === 'logs' ? 'log lines' : 'spans'); continue; }
    if (!c) continue;

    // Where: a stack's frames are tried innermost first, until one is in code Thunder read.
    let file = null, line = ev.line ?? null, member = null, outside = [];
    const frames = ev.frames?.length ? ev.frames : [{ file: ev.file, line: ev.line, function: ev.function, className: undefined }];
    let why = null;
    for (const f of frames) {
      if (f.internal || f.file == null) { outside.push(f); continue; }
      const got = findFile(f.file, f.className);
      if (!got.file) { why ??= got.reason; outside.push(f); continue; }
      file = got.file; line = f.line ?? null;
      // A recorder's return or raise belongs to the function it was recorded in (by that function's first line).
      // (A recorder may place a function where its header starts, a few lines below the member's first line; but a
      // function inside it that starts there is another function, not this member.)
      if (ev.fnLine != null) member = model.members.filter((m) => m.file === file && m.lines[0] <= ev.fnLine && ev.fnLine <= Math.min(m.lines[1], m.lines[0] + 3) && (m.lines[0] === ev.fnLine || !fnStarts.has(`${file}|${m.lines[0]}`))).sort((a, b) => b.lines[0] - a.lines[0])[0] ?? null;
      else if (line != null && ev.kind !== 'call') member = memberAt(model, file, line);
      else if (ev.kind === 'call' && ev.fnLine == null) {
        if (line != null) {
          const starts = model.members.filter((m) => m.file === file && m.lines[0] <= line && line <= m.lines[0] + 3).sort((a, b) => a.lines[0] - b.lines[0]);
          member = starts.find((m) => m.lines[0] === line) ?? starts[0] ?? null;
          // A span placed on a decorator or the line of a call into it: fall back to the function name.
          if (!member && f.function) { const named = membersNamed(model, f.function, { file, namespace: ev.namespace }); if (named.length === 1) member = named[0]; }
          if (!member) member = memberAt(model, file, line);
        } else if (f.function) {
          const named = membersNamed(model, f.function, { file, namespace: ev.namespace });
          if (named.length === 1) member = named[0];
          else { why = named.length ? `${named.length} actions or rules in ${file} are named ${f.function}` : `no action or rule in ${file} is named ${f.function}`; continue; }
        }
      } else if (f.function) {
        const named = membersNamed(model, f.function, { file });
        if (named.length === 1) member = named[0];
      }
      if (member) break;
      why = ev.fnLine != null ? `no action or rule Thunder read starts at line ${ev.fnLine} of ${file}` : line != null ? `line ${line} of ${file} is not inside any action or rule Thunder read` : `${file} has no action or rule Thunder can place this on`;
      outside.push(f);
    }
    if (!file && !member && ev.kind === 'call' && ev.function && !ev.file) {
      const named = membersNamed(model, ev.function, { namespace: ev.namespace });
      if (named.length === 1) { member = named[0]; file = member.file; }
      else why = named.length ? `${named.length} actions or rules are named ${ev.function}; the evidence names no file` : `no action or rule Thunder read is named ${ev.function}`;
    }
    if (!member) { unplaced(ev, why ?? 'it names no place in the code'); continue; }
    const r = mem(member);
    if (!r.sources.includes(ev.source)) r.sources.push(ev.source);

    if (ev.kind === 'call') {
      r.calls += c;
      if (ev.failed) { r.failures += ev.failed; if (ev.error) addError((r.errors ||= []), ev, ev.failed); }
      if (ev.durationMs != null) {
        const t = (r.timing ||= { count: 0, totalMs: 0, maxMs: 0 });
        t.count += c; t.totalMs += ev.durationMs * c; t.maxMs = Math.max(t.maxMs, ev.durationMs);
      }
      if (ev.fromLog) { r.logged = (r.logged || 0) + c; r.calls -= c; }
      continue;
    }
    if (ev.kind === 'decision') {
      let n = nodeAt(member, line, 'decision');
      let side = null;
      // A handler: the "If it goes wrong" question on this line.
      if (ev.side === 'handled') n = member.flow.nodes.find((x) => x.line === line && x.handler) ?? null;
      // A `match` Thunder drew as a chain of questions: case P taken = the question at line P answered Yes.
      if (!n && String(ev.side).startsWith('case:')) {
        const P = Number(String(ev.side).slice(5));
        const q = nodeAt(member, P, 'decision');
        if (q && !q.cases) { n = q; side = { key: 'yes', label: 'Yes' }; }
      }
      if (!n) { unplaced(ev, `Thunder draws no question at line ${line} of ${member.label}`); continue; }
      if ((ev.side === 'each' || ev.side === 'done') && n.kind !== 'loop') { unplaced(ev, `the run went round a loop at line ${line}, where Thunder draws the question "${n.text}"`); continue; }
      const nr = nodeRun(r, n);
      if (ev.side === 'handled') { nr.ran = (nr.ran || 0) + c; continue; }
      side ??= sideOf(n, blockOf(member, n.id), ev);
      if (!side) { unplaced(ev, `the case at line ${String(ev.side).slice(5)} is not one Thunder draws for "${n.text}"`); continue; }
      (nr.sides ||= {})[side.label] = (nr.sides[side.label] || 0) + c;
      if (n.kind !== 'loop') nr.ran = (nr.ran || 0) + c;
      continue;
    }
    if (ev.kind === 'return') {
      const ends = member.flow.nodes.filter((n) => n.kind === 'end');
      let hit = [];
      if (line == null) {
        hit = ends.filter((n) => n.line == null);
        // Reaching the end of a handler that answers with res.send(...) on its last line: that ending.
        if (!hit.length && ev.after?.length) hit = ends.filter((n) => ev.after.includes(n.line));
        if (!hit.length) {
          const stops = member.flow.nodes.filter((n) => n.kind === 'stop' && ev.after?.includes(n.line));
          if (stops.length === 1) { const nr = nodeRun(r, stops[0]); nr.ran = (nr.ran || 0) + c; continue; }
        }
      } else {
        hit = ends.filter((n) => n.line === line);
        // A rule's answer is drawn on its question's line; the return that gives it is on that line or below.
        if (!hit.length) {
          const answers = ends.filter((n) => n.answer && n.line != null);
          const qs = member.flow.nodes.filter((n) => n.kind === 'decision' && n.line != null).map((n) => n.line);
          if (ev.within != null) hit = answers.filter((n) => n.line === ev.within);
          if (!hit.length) { const up = answers.filter((n) => n.line <= line).sort((a, b) => b.line - a.line)[0]; if (up && !qs.some((q) => q > up.line && q <= line)) hit = [up]; }
        }
      }
      if (hit.length > 1 && ev.value?.length) {
        const vals = ev.value.map(literal);
        const byVal = hit.filter((n) => vals.some((v) => v !== undefined && (literal(n.value) === v || (typeof v === 'boolean' && n.value == null && String(n.text) === (v ? 'Yes' : 'No')))));
        if (byVal.length) hit = byVal;
      }
      if (hit.length !== 1) {
        unplaced(ev, hit.length ? `Thunder draws ${hit.length} answers at line ${line} of ${member.label}${ev.value?.length > 1 ? ` and the run gave back ${ev.value.length} different values` : ''}; the evidence does not say how many times each` : line == null ? `${member.label} has no "Done" ending, yet the run reached its end` : `Thunder draws no ending at line ${line} of ${member.label}`);
        continue;
      }
      const nr = nodeRun(r, hit[0]);
      nr.ran = (nr.ran || 0) + c;
      if (ev.value?.length) { nr.values ||= []; for (const v of ev.value) if (!nr.values.includes(v) && nr.values.length < 6) nr.values.push(v); }
      continue;
    }
    if (ev.kind === 'raise' || ev.kind === 'line') {
      const at = line != null ? nodeAt(member, line, ev.kind) : null;
      if (ev.kind === 'raise' && ev.ends) { r.failures += c; addError((r.errors ||= []), ev, c); }
      if (!at) { unplaced(ev, line == null ? `it names ${member.label} but no line` : `Thunder draws no step at line ${line} of ${member.label}`); continue; }
      const nr = nodeRun(r, at.node);
      if (at.approximate) nr.approximate = true;
      // A crash at a step says it ran (and failed) that often, not how often it ran in all: no `ran` from it.
      if (ev.kind === 'line' || at.node.kind === 'stop') nr.ran = (nr.ran || 0) + c;
      if (ev.kind === 'raise') addError(at.node.kind === 'stop' ? (nr.errors ||= []) : (nr.failed ||= []), ev, c);
      else if (ev.level) (nr.levels ||= {})[ev.level] = (nr.levels[ev.level] || 0) + c;
      if (outside.length && ev.kind === 'raise') nr.raisedInside = [...new Set([...(nr.raisedInside || []), ...outside.filter((f) => f.file && !f.internal).slice(0, 1).map((f) => norm(f.file).split('/').slice(-2).join('/'))])];
      continue;
    }
    unplaced(ev, `"${ev.kind}" is not a kind of evidence Thunder reads`);
  }

  for (const r of Object.values(members)) {
    const m = model.members.find((x) => x.id === r.id);
    if (r.timing) { r.timing.avgMs = r.timing.totalMs / r.timing.count; delete r.timing.totalMs; }
    r.hotPath = hotPath(m, r);
    r.says = runSays(m, r);
  }
  for (const x of notMatched) delete x.key;
  return { schema: RUNNING_SCHEMA, members, notMatched, sources, summary: { members: Object.keys(members).length, events: evidence.length, notMatched: notMatched.reduce((a, x) => a + x.count, 0) } };
}

function describe(ev) {
  const where = `${ev.file ?? '?'}${ev.line != null ? `:${ev.line}` : ''}${ev.function ? ` (${ev.function})` : ''}`;
  if (ev.kind === 'raise') return `${ev.error ?? 'an error'}${ev.message ? `: ${quoteText(ev.message, 60)}` : ''} at ${where}`;
  if (ev.kind === 'decision') return `a question answered at ${where}`;
  if (ev.kind === 'return') return `a return at ${where}`;
  if (ev.kind === 'line') return `a log line at ${where}`;
  return `a call of ${where}`;
}

/**
 * The most-taken way through a flow: at each question the side seen most often. Only questions and endings with
 * evidence are on it; it stops where the evidence does.
 */
function hotPath(m, r) {
  const out = [];
  const byId = new Map(m.flow.nodes.map((n) => [n.id, n]));
  const go = (bs) => {
    for (const b of bs || []) {
      const n = byId.get(b.id);
      const nr = r.nodes[b.id];
      if (!n || !nr) { if (b.body && !b.nested) go(b.body); continue; }
      if (nr.sides) {
        const [label, count] = Object.entries(nr.sides).sort((a, b2) => b2[1] - a[1])[0];
        out.push({ id: n.id, text: n.text, side: label, count });
        const key = label === 'Yes' ? 'yes' : label === 'No' ? 'no' : label === 'For each' ? 'each' : null;
        const next = key ? b[key] : (b.cases || []).find((c) => c.label === label)?.blocks;
        if (next?.length) { if (go(next)) return true; }
        if (n.kind === 'loop' && label === 'For each') continue;
      } else if (nr.ran && (n.kind === 'stop' || n.kind === 'end')) {
        out.push({ id: n.id, text: n.text, count: nr.ran });
        return true;
      }
      if (b.body && !b.nested) { if (go(b.body)) return true; }
    }
    return false;
  };
  go(m.flow.blocks);
  // "Done" (the end of the function) is not in the drawn blocks.
  const done = m.flow.nodes.find((n) => n.kind === 'end' && n.line == null);
  if (done && r.nodes[done.id]?.ran && out.length && !['stop', 'end'].includes(byId.get(out.at(-1).id)?.kind)) out.push({ id: done.id, text: done.text, count: r.nodes[done.id].ran });
  return out.some((h) => h.side) ? out : [];
}

// "Is user set? was No"; an error handler's side reads "LocationParseError went wrong".
const whenWords = (when) => when.filter((w) => w.question).map((w) => {
  const h = w.question.match(/^If (.+) goes wrong\??$/);
  return h ? `${h[1]} ${w.answer === 'Yes' ? 'went' : 'did not go'} wrong` : `${w.question.replace(/\?$/, '')}? was ${w.answer}`;
}).join(' and ');

/** The Details sentence: "Ran 1,204 times; stopped with NotAvailable 37 times (3%), when …". */
function runSays(m, r) {
  if (!m) return '';
  const parts = [];
  const total = r.calls;
  const logged = (r.logged || 0) + Object.values(r.nodes).reduce((a, n) => a + (n.levels ? n.ran : 0), 0);
  if (total) parts.push(`Ran ${times(total)}`);
  else if (logged) parts.push(`Wrote ${countWords(logged)} log line${logged === 1 ? '' : 's'}`);
  const paths = new Map(pathsOf(m.flow).map((p) => [p.node.id, p.when]));
  for (const nr of Object.values(r.nodes)) {
    if (nr.kind === 'stop' && nr.ran) {
      const errs = (nr.errors || []).map((e) => `${e.error}${e.message ? ` "${quoteText(e.message, 60)}"` : ''}`);
      const when = paths.get(nr.id);
      parts.push(`stopped with ${errs.length ? errs.join(' or ') : nr.text.replace(/^Stop:\s*/, '')} ${times(nr.ran)}${pct(nr.ran, total) ? ` (${pct(nr.ran, total)})` : ''}${when?.length ? `, when ${whenWords(when)}` : ''}`);
    }
    if (nr.failed?.length) parts.push(`failed at “${nr.text}” (line ${nr.line}) with ${nr.failed.map((e) => `${e.error}${e.message ? ` "${quoteText(e.message, 60)}"` : ''}`).join(' or ')} ${times(nr.failed.reduce((a, e) => a + e.count, 0))}`);
  }
  // A rule's answers: how often each was given.
  const answers = m.flow.nodes.filter((n) => n.kind === 'end' && n.answer && r.nodes[n.id]?.ran);
  if (answers.length) parts.push(`answered ${answers.map((n) => `${n.text} ${times(r.nodes[n.id].ran)}${pct(r.nodes[n.id].ran, total) ? ` (${pct(r.nodes[n.id].ran, total)})` : ''}`).join(', ')}`);
  const stopsSeen = Object.values(r.nodes).filter((n) => n.kind === 'stop').reduce((a, n) => a + (n.ran || 0), 0);
  const crashes = Object.values(r.nodes).reduce((a, n) => a + (n.failed || []).reduce((b, e) => b + e.count, 0), 0);
  const elsewhere = r.failures - stopsSeen - crashes;
  if (elsewhere > 0) parts.push(`ended with an error ${times(elsewhere)} that is not one of its Stops${r.errors?.length ? ` (${[...new Set(r.errors.map((e) => e.error))].join(', ')})` : ''}${crashes ? '' : '; the evidence does not say at which step'}`);
  if (r.timing) parts.push(`took ${ms(r.timing.avgMs)} on average, ${ms(r.timing.maxMs)} at the slowest`);
  return parts.length ? `${parts.join('; ')}.` : '';
}

// ── Words: an error explained in Thunder, and the flow with its counts ──────────────────────────────────────────

/**
 * Explain one stack trace in Thunder's words: the action or rule and the step where it failed, the error as seen,
 * and, when the flow shows it, the answers that led there. Returns { matched, text, error, message, member, step,
 * path, calledFrom, raisedInside, reason? }. `stack` may be the text or a parsed stack (parseStack).
 */
export function explainError(model, stack) {
  const s = typeof stack === 'string' ? parseStack(stack) : stack;
  if (!s) return { matched: false, reason: 'Thunder found no stack trace it can read (Python, JavaScript, Java, C#, or Go)', text: 'Thunder found no stack trace it can read in this text.' };
  const findFile = fileMatcher(model);
  const placed = [];
  let reason = null;
  for (const f of s.frames) {
    if (f.internal || f.file == null) { placed.push({ frame: f }); continue; }
    const got = findFile(f.file, f.className);
    if (!got.file) { reason ??= got.reason; placed.push({ frame: f }); continue; }
    const m = memberAt(model, got.file, f.line);
    if (!m) { reason ??= `line ${f.line} of ${got.file} is not inside any action or rule Thunder read`; placed.push({ frame: f, file: got.file }); continue; }
    placed.push({ frame: f, file: got.file, member: m, at: nodeAt(m, f.line, 'raise') });
  }
  const first = placed.findIndex((p) => p.member);
  const errWords = `${s.error}${s.message ? `: ${s.message}` : ''}`;
  if (first < 0) {
    const top = s.frames.find((f) => !f.internal) ?? s.frames[0];
    return { matched: false, error: s.error, message: s.message, language: s.language, reason: reason ?? 'none of its lines are in code Thunder read', text: `Thunder could not place this error on a flow: ${reason ?? 'none of its lines are in code Thunder read'}. ${errWords} (at ${top?.file ?? '?'}:${top?.line ?? '?'}).` };
  }
  const hit = placed[first];
  const m = hit.member;
  const raisedInside = placed.slice(0, first).filter((p) => p.frame.file && !p.frame.internal).map((p) => norm(p.frame.file).split('/').slice(-2).join('/'));
  const step = hit.at?.node ?? null;
  const when = step ? pathsOf(m.flow).find((p) => p.node.id === step.id)?.when ?? null : null;
  const calledFrom = placed.slice(first + 1).filter((p) => p.member).map((p) => ({ member: { id: p.member.id, label: p.member.label }, step: p.at?.node ? { id: p.at.node.id, text: p.at.node.text, line: p.at.node.line } : null, line: p.frame.line, file: p.file }));
  const isStop = step?.kind === 'stop';
  const where = step ? `at “${step.text}” (line ${hit.frame.line}${hit.at.approximate ? `, part of the step that starts at line ${step.line}` : ''})` : `at line ${hit.frame.line}, which Thunder draws no step for`;
  let text = `${isStop ? 'Stopped' : 'Failed'} in ${m.label}, ${where}: ${errWords.replace(/[.\s]+$/, '')}`;
  if (raisedInside.length) text += ` (raised inside ${raisedInside[0]}, which this step called)`;
  if (when && when.length) text += `; it got there because ${whenWords(when)}`;
  else if (when && !when.length && step) text += '; no question comes before this step, so it happens every time';
  text += '.';
  if (isStop) text += ' This is one of the ways Thunder shows it can end.';
  if (calledFrom.length) text += ` Called from ${calledFrom.slice(0, 3).map((c) => `${c.member.label}${c.step ? `, at “${c.step.text}”` : ''} (line ${c.line})`).join(', called from ')}${calledFrom.length > 3 ? `, and ${calledFrom.length - 3} more` : ''}.`;
  if (s.causes?.length) text += ` It happened while handling ${s.causes.map((c) => c.error).join(', then ')}.`;
  if (s.wrappedIn?.length) text += ` It reached the top as ${s.wrappedIn[0].error}.`;
  return {
    matched: true, text, error: s.error, message: s.message, language: s.language,
    file: hit.file, line: hit.frame.line,
    member: { id: m.id, label: m.label, name: m.name },
    step: step ? { id: step.id, text: step.text, kind: step.kind, line: step.line ?? null, ...(hit.at.approximate ? { approximate: true } : {}) } : null,
    path: when && when.length ? when : null,
    calledFrom, raisedInside,
  };
}

/** The words after a node in the overlay's Thunder Text: "(ran 1,204×: Yes 1,167, No 37)". */
export function nodeNote(nr) {
  if (!nr) return '';
  const bits = [];
  if (nr.sides) {
    const s = Object.entries(nr.sides).map(([k, v]) => `${k} ${countWords(v)}`).join(', ');
    bits.push(nr.kind === 'loop' ? `${nr.sides['For each'] ? `went round ${countWords(nr.sides['For each'])}×` : ''}${nr.sides['For each'] && nr.sides.Done ? '; ' : ''}${nr.sides.Done ? `left ${countWords(nr.sides.Done)}×` : ''}` : `ran ${countWords(nr.ran)}×: ${s}`);
  } else if (nr.kind === 'stop' && nr.ran) bits.push(`happened ${countWords(nr.ran)}×${nr.errors?.length ? `: ${nr.errors.map((e) => `${e.error}${e.message ? ` "${quoteText(e.message, 50)}"` : ''} ${countWords(e.count)}`).join(', ')}` : ''}`);
  else if (nr.kind === 'end' && nr.ran) bits.push(`reached ${countWords(nr.ran)}×`);
  else if (nr.kind === 'decision' && nr.ran) bits.push(`caught ${countWords(nr.ran)}×`);
  else if (nr.ran) bits.push(nr.levels ? `logged ${countWords(nr.ran)}×: ${Object.entries(nr.levels).map(([k, v]) => `${k} ${countWords(v)}`).join(', ')}` : `ran ${countWords(nr.ran)}×`);
  if (nr.failed?.length) bits.push(`failed ${nr.failed.map((e) => `${countWords(e.count)}×: ${e.error}${e.message ? ` "${quoteText(e.message, 50)}"` : ''}`).join(', ')}`);
  if (nr.approximate) bits.push('placed on the step that starts above');
  return bits.length ? `  (${bits.join('; ')})` : '';
}

/**
 * The overlay in Thunder Text: each member with evidence (most calls first), its flow with counts after the nodes,
 * then what could not be matched. Options: member (an id or name: only that one), top (how many members; default 10).
 */
export function runtimeText(model, overlay, { member = null, top = 10 } = {}) {
  const out = [];
  let list = Object.values(overlay.members).sort((a, b) => (b.calls + b.failures) - (a.calls + a.failures) || Object.keys(b.nodes).length - Object.keys(a.nodes).length);
  if (member) list = list.filter((r) => r.id === member || r.name === member || r.label === member);
  const shown = list.slice(0, top);
  for (const r of shown) {
    const m = model.members.find((x) => x.id === r.id);
    out.push(`${r.file}:${r.lines[0]}  ${r.says || 'Seen in the evidence.'}`);
    out.push(modelText(model, m.id, { note: (n) => nodeNote(r.nodes[n.id]) }).replace(/\n$/, ''));
    // "Done" (reaching the end) is not a drawn step in the text; its count goes after the flow.
    for (const n of m.flow.nodes) if (n.kind === 'end' && n.line == null && r.nodes[n.id]?.ran) out.push(`  - ${n.text}${nodeNote(r.nodes[n.id])}`);
    if (r.hotPath.length > 1) out.push(`  Most often: ${r.hotPath.map((h) => (h.side ? `${h.text.replace(/\?$/, '')}? ${h.side}` : h.text)).join(' → ')}`);
    out.push('');
  }
  if (list.length > shown.length) out.push(`(${list.length - shown.length} more with evidence; pass --member <name> or --top <n>)`, '');
  if (!list.length) out.push(member ? `No evidence for ${member}.` : 'No evidence could be placed on any flow.', '');
  if (overlay.notMatched.length) {
    const total = overlay.notMatched.reduce((a, x) => a + x.count, 0);
    out.push(`Not matched (${countWords(total)}): evidence Thunder could not place on a step, and why`);
    for (const x of [...overlay.notMatched].sort((a, b) => b.count - a.count).slice(0, 12)) out.push(`  - ${x.what}${x.count > 1 ? ` (${countWords(x.count)}×)` : ''}: ${x.reason}`);
    if (overlay.notMatched.length > 12) out.push(`  … and ${overlay.notMatched.length - 12} more (see --json)`);
  }
  return out.join('\n').replace(/\n+$/, '\n');
}
