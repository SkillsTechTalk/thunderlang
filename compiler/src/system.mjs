// The whole system: calls across files and services. Browser-safe, zero dependencies.
//
// After every file is read into the model, each step's call (from its meaning tree, `expr`) is followed through the
// file's imports to the member it calls in another file: JS/TS ES modules and CommonJS, Python imports (relative
// too), Go packages (and other files of the same package), Java/Kotlin/C#/PHP imports by class, Ruby constants, and
// Rust `use crate::…` paths. A step that sends an HTTP request the library catalog recognizes ("Sends a POST request
// to /api/orders/…") is linked to the route in this repo that handles that method and path; an event or queue
// message is linked to the code that listens for the same name.
//
// Never a guess: a call is linked only when the import (or the declared type, or a unique class name where the
// language makes class names global) says exactly which member it is. Everything else stays unlinked, and what was
// worth linking but could not be is listed in `model.notLinked` with the reason (dynamic import, computed URL,
// external package, two routes match, an interface whose implementation is chosen when it runs).

const JS = new Set(['typescript', 'javascript']);
const JVM = new Set(['java', 'kotlin']);
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const join = (...parts) => {
  const out = [];
  for (const seg of parts.join('/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (out.length && out.at(-1) !== '..') out.pop(); else out.push('..'); } else out.push(seg);
  }
  return out.join('/');
};
const stripStrings = (s) => s.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, (m) => m.replace(/[^\n]/g, ' '));
const lineAt = (src, idx) => { let n = 1; for (let i = src.indexOf('\n'); i >= 0 && i < idx; i = src.indexOf('\n', i + 1)) n++; return n; };

// ── The calls in a step: callee paths from its meaning tree ──────────────────────────────────────────────

/** `a.b.c` -> ['a', 'b', 'c']; null when the callee is not a plain path (a call's result, an index). */
export function calleePath(e) {
  if (!e) return null;
  if (e.kind === 'name') return [e.name];
  if (e.kind === 'member') { const o = calleePath(e.object); return o ? [...o, e.property] : null; }
  return null;
}

/** Every call in an expression, outside the bodies of functions written in it (those are their own steps). */
export function callsIn(expr, out = []) {
  if (!expr || typeof expr !== 'object') return out;
  if (Array.isArray(expr)) { for (const x of expr) callsIn(x, out); return out; }
  if (expr.kind === 'block' || expr.kind === 'function' || (expr.kind === 'lambda' && expr.body?.kind === 'block')) return out;
  if (expr.kind === 'call') out.push(expr);
  for (const k in expr) { const v = expr[k]; if (v && typeof v === 'object' && k !== 'kind') callsIn(v, out); }
  return out;
}

// ── Imports, per language ────────────────────────────────────────────────────────────────────────────

/** A binding: a local name bound to a module (files) and, optionally, one symbol in it. */
const bind = (files, symbol = null, extra = {}) => ({ files, symbol, ...extra });

function jsImports(src, file, ctx, out) {
  const clean = stripComments(src);
  const resolve = (spec) => ctx.jsFile(file, spec);
  const add = (local, spec, symbol, line) => {
    const r = resolve(spec);
    if (r.file) out.bindings.set(local, bind([r.file], symbol, { line, spec }));
    else out.unresolved.push({ file, line, import: spec, why: r.why });
  };
  for (const m of clean.matchAll(/\bimport\s+(?:type\s+)?([\w$*{}\s,]+?)\s+from\s+(['"])([^'"]+)\2/g)) {
    const line = lineAt(clean, m.index);
    let clause = m[1].trim();
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const p = part.trim().replace(/^type\s+/, '').match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
        if (p) add(p[2] || p[1], m[3], p[1], line);
      }
      clause = clause.replace(named[0], '').replace(/,\s*$/, '').replace(/^\s*,/, '').trim();
    }
    const ns = clause.match(/\*\s+as\s+([\w$]+)/);
    if (ns) { add(ns[1], m[3], null, line); clause = clause.replace(ns[0], '').replace(/,/g, '').trim(); }
    if (/^[\w$]+$/.test(clause)) add(clause, m[3], 'default', line);
  }
  for (const m of clean.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*require\(\s*(['"])([^'"]+)\2\s*\)(?:\s*\.\s*([\w$]+))?/g)) add(m[1], m[3], m[4] ?? 'module.exports', lineAt(clean, m.index));
  for (const m of clean.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*(['"])([^'"]+)\2\s*\)/g)) {
    for (const part of m[1].split(',')) { const p = part.trim().match(/^([\w$]+)(?:\s*:\s*([\w$]+))?$/); if (p) add(p[2] || p[1], m[3], p[1], lineAt(clean, m.index)); }
  }
  for (const m of clean.matchAll(/\b(?:import|require)\s*\(\s*([^'"`\s)][^)]*)\)/g)) {
    if (/^\s*$/.test(m[1])) continue;
    out.unresolved.push({ file, line: lineAt(clean, m.index), import: m[1].trim().slice(0, 60), why: 'dynamic import: the module is worked out when it runs' });
  }
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])\/\/.*$/gm, '$1');

/** A JS/TS file's exports: default (a local name), named (exported -> local), and re-exports. */
function jsExports(src) {
  const clean = stripComments(src);
  const named = new Map(), re = [];
  let def = null;
  let m;
  if ((m = clean.match(/\bexport\s+default\s+(?:async\s+)?(?:function\s*\*?\s*|class\s+)?([\w$]+)/))) def = m[1];
  if ((m = clean.match(/\bmodule\.exports\s*=\s*([\w$]+)\s*;?\s*(?:\n|$)/))) def = m[1];
  if ((m = clean.match(/\bmodule\.exports\s*=\s*\{([^}]*)\}/))) for (const part of m[1].split(',')) { const p = part.trim().match(/^([\w$]+)(?:\s*:\s*([\w$]+))?/); if (p) named.set(p[1], p[2] || p[1]); }
  for (const x of clean.matchAll(/\bexport\s*\{([^}]*)\}(?:\s*from\s*(['"])([^'"]+)\2)?/g)) {
    const names = new Map();
    for (const part of x[1].split(',')) { const p = part.trim().replace(/^type\s+/, '').match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/); if (p) names.set(p[2] || p[1], p[1]); }
    if (x[3]) re.push({ spec: x[3], names }); else for (const [k, v] of names) named.set(k, v);
  }
  for (const x of clean.matchAll(/\bexport\s*\*\s*(?:as\s+([\w$]+)\s+)?from\s*(['"])([^'"]+)\2/g)) re.push({ spec: x[3], all: !x[1], as: x[1] });
  return { def, named, re };
}

function pythonImports(src, file, ctx, out) {
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/#.*$/, '');
    let m;
    if ((m = l.match(/^\s*import\s+(.+)$/))) {
      for (const part of m[1].split(',')) {
        const p = part.trim().match(/^([\w.]+)(?:\s+as\s+(\w+))?$/);
        if (!p) continue;
        const r = ctx.pyModule(file, p[1]);
        // `import a.b.c` binds `a.b.c` (used as a.b.c.f); `import a.b as x` binds x.
        if (r.files) out.bindings.set(p[2] || p[1], bind(r.files, null, { line: i + 1, spec: p[1] }));
        else out.unresolved.push({ file, line: i + 1, import: p[1], why: r.why });
      }
    } else if ((m = l.match(/^\s*from\s+(\.*)([\w.]*)\s+import\s+(.+)$/))) {
      let names = m[3].trim();
      if (names.startsWith('(') && !names.includes(')')) { for (let j = i + 1; j < lines.length; j++) { names += ' ' + lines[j].replace(/#.*$/, ''); if (lines[j].includes(')')) { i = j; break; } } }
      names = names.replace(/[()\\]/g, ' ');
      const spec = m[1] + m[2];
      const r = ctx.pyModule(file, spec);
      for (const part of names.split(',')) {
        const p = part.trim().match(/^(\*|\w+)(?:\s+as\s+(\w+))?$/);
        if (!p) continue;
        if (p[1] === '*') { if (r.files) out.star.push(r.files); continue; }
        // `from pkg import name`: a name in pkg/__init__.py, or the submodule pkg/name.py.
        const sub = ctx.pyModule(file, `${spec}${spec.endsWith('.') || !spec ? '' : '.'}${p[1]}`);
        if (r.files && ctx.hasSymbol(r.files, p[1])) out.bindings.set(p[2] || p[1], bind(r.files, p[1], { line: i + 1, spec }));
        else if (sub.files) out.bindings.set(p[2] || p[1], bind(sub.files, null, { line: i + 1, spec: `${spec}.${p[1]}` }));
        else if (r.files) out.bindings.set(p[2] || p[1], bind(r.files, p[1], { line: i + 1, spec }));
        else { out.unresolved.push({ file, line: i + 1, import: spec || '.', why: r.why }); break; }
      }
    }
  }
}

function goImports(src, file, ctx, out) {
  const block = [...src.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)].map((m) => ({ text: m[1], at: m.index }));
  const singles = [...src.matchAll(/^\s*import\s+((?:[\w.]+\s+)?"[^"]+")/gm)].map((m) => ({ text: m[1], at: m.index }));
  for (const b of [...block, ...singles]) {
    for (const m of b.text.matchAll(/(?:^|\n)\s*([\w.]+\s+)?"([^"]+)"/g)) {
      const alias = m[1]?.trim();
      const r = ctx.goPackage(m[2]);
      const line = lineAt(src, b.at);
      if (!r.files) { out.unresolved.push({ file, line, import: m[2], why: r.why }); continue; }
      if (alias === '_') continue;
      if (alias === '.') { out.star.push(r.files); continue; }
      out.bindings.set(alias || r.name, bind(r.files, null, { line, spec: m[2] }));
    }
  }
}

function jvmImports(src, file, ctx, out, language) {
  for (const m of src.matchAll(/^\s*import\s+(static\s+)?([\w.]+)(\.\*)?\s*(?:as\s+(\w+))?\s*;?\s*$/gm)) {
    const line = lineAt(src, m.index);
    const parts = m[2].split('.');
    if (m[3]) { out.packages.push(m[2]); continue; }
    if (m[1]) {
      // `import static a.b.C.m`: m is C's member.
      const cls = parts.at(-2), pkg = parts.slice(0, -2).join('.');
      const t = ctx.classIn(pkg, cls, language);
      if (t.thing) out.bindings.set(m[4] || parts.at(-1), bind([t.thing.file], parts.at(-1), { line, spec: m[2], thing: t.thing }));
      else out.unresolved.push({ file, line, import: m[2], why: t.why });
      continue;
    }
    const name = parts.at(-1), pkg = parts.slice(0, -1).join('.');
    const t = ctx.classIn(pkg, name, language);
    if (t.thing) out.bindings.set(m[4] || name, bind([t.thing.file], name, { line, spec: m[2], thing: t.thing }));
    else if (language === 'kotlin' && ctx.pkgFiles(pkg).length) out.bindings.set(m[4] || name, bind(ctx.pkgFiles(pkg), name, { line, spec: m[2] }));
    else out.unresolved.push({ file, line, import: m[2], why: t.why });
  }
}

function csharpImports(src, file, ctx, out) {
  for (const m of src.matchAll(/^\s*(?:global\s+)?using\s+(?:static\s+)?(?:(\w+)\s*=\s*)?([\w.]+)\s*;/gm)) {
    if (m[1]) { const parts = m[2].split('.'); const t = ctx.classIn(parts.slice(0, -1).join('.'), parts.at(-1), 'csharp'); if (t.thing) out.bindings.set(m[1], bind([t.thing.file], parts.at(-1), { thing: t.thing, line: lineAt(src, m.index) })); continue; }
    out.packages.push(m[2]);
  }
}

function phpImports(src, file, ctx, out) {
  for (const m of src.matchAll(/^\s*use\s+([\w\\]+)(?:\s+as\s+(\w+))?\s*;/gm)) {
    const parts = m[1].replace(/^\\/, '').split('\\');
    const t = ctx.classIn(parts.slice(0, -1).join('\\'), parts.at(-1), 'php');
    if (t.thing) out.bindings.set(m[2] || parts.at(-1), bind([t.thing.file], parts.at(-1), { thing: t.thing, line: lineAt(src, m.index) }));
    else out.unresolved.push({ file, line: lineAt(src, m.index), import: m[1], why: t.why });
  }
}

function rustImports(src, file, ctx, out) {
  for (const m of src.matchAll(/^\s*(?:pub\s+)?use\s+((?:crate|super|self)(?:::\w+)*)(?:::\{([^}]*)\}|::(\w+)(?:\s+as\s+(\w+))?)?\s*;/gm)) {
    const line = lineAt(src, m.index);
    const names = m[2] ? m[2].split(',').map((x) => x.trim().match(/^(\w+)(?:\s+as\s+(\w+))?$/)).filter(Boolean).map((x) => [x[1], x[2] || x[1]]) : m[3] ? [[m[3], m[4] || m[3]]] : [];
    for (const [name, local] of names) {
      const asMod = ctx.rustModule(file, `${m[1]}::${name}`);
      if (asMod.files) { out.bindings.set(local, bind(asMod.files, null, { line })); continue; }
      const r = ctx.rustModule(file, m[1]);
      if (r.files) out.bindings.set(local, bind(r.files, name, { line }));
      else out.unresolved.push({ file, line, import: `${m[1]}::${name}`, why: r.why });
    }
    if (!names.length) {
      // `use crate::orders;` (a module) or `use crate::orders::place;` (an item in one).
      const segs = m[1].split('::');
      const r = ctx.rustModule(file, m[1]);
      if (r.files?.length) { out.bindings.set(segs.at(-1), bind(r.files, null, { line })); continue; }
      const parent = ctx.rustModule(file, segs.slice(0, -1).join('::'));
      if (parent.files?.length) out.bindings.set(segs.at(-1), bind(parent.files, segs.at(-1), { line }));
      else out.unresolved.push({ file, line, import: m[1], why: r.why });
    }
  }
}

/** Names declared with a type in a file: `private repo: OrderRepo`, `OrderRepo repo;`, `self.repo = OrderRepo()`. */
function typesOf(src, language, inMember = false) {
  const types = new Map(), clash = new Set();
  const put = (name, type) => { if (!name || !type || clash.has(name)) return; if (types.has(name) && types.get(name) !== type) { types.delete(name); clash.add(name); } else types.set(name, type); };
  const code = stripStrings(src);
  const each = (re, ni, ti) => { for (const m of code.matchAll(re)) put(m[ni], m[ti]); };
  if (JS.has(language)) {
    each(/(?:\b(?:private|public|protected|readonly)\s+)+([\w$]+)\s*[?!]?\s*:\s*([A-Z][\w$]*)\b(?!\s*[<[.])/g, 1, 2);
    each(/\b(?:const|let|var)\s+([\w$]+)\s*(?::\s*[\w$<>]+\s*)?=\s*new\s+([A-Z][\w$]*)\s*\(/g, 1, 2);
    each(/\bthis\.([\w$]+)\s*=\s*new\s+([A-Z][\w$]*)\s*\(/g, 1, 2);
  } else if (language === 'python') {
    each(/\bself\.(\w+)\s*(?::\s*\w+\s*)?=\s*([A-Z]\w*)\(/g, 1, 2);
    each(/\b(\w+)\s*:\s*([A-Z]\w*)\s*(?=[,)=\n])/g, 1, 2);
    each(/^\s*(\w+)\s*=\s*((?:\w+\.)*[A-Z]\w*)\(/gm, 1, 2);
  } else if (language === 'java' || language === 'csharp') {
    for (const m of code.matchAll(/\b([A-Z]\w*)(?:<[^<>;()]*>)?\s+(\w+)\s*(?=[;=,)])/g)) if (!/^(return|new|throw|else|case)$/.test(m[2])) put(m[2], m[1]);
  } else if (language === 'kotlin') {
    each(/\b(?:val|var)?\s*(\w+)\s*:\s*([A-Z]\w*)\b(?!\s*[<.])/g, 1, 2);
    each(/\b(?:val|var)\s+(\w+)\s*=\s*([A-Z]\w*)\(/g, 1, 2);
  } else if (language === 'php') {
    each(/\b([A-Z]\w*)\s+\$(\w+)/g, 2, 1);
    each(/\$this->(\w+)\s*=\s*new\s+([A-Z]\w*)/g, 1, 2);
    each(/\$(\w+)\s*=\s*new\s+([A-Z]\w*)/g, 1, 2);
  } else if (language === 'ruby') {
    each(/@?(\w+)\s*=\s*([A-Z][\w:]*)\.new\b/g, 1, 2);
  } else if (language === 'go') {
    // Struct fields (`repo *store.Repo`), at file level only.
    if (!inMember) for (const m of code.matchAll(/^[ \t]*(\w+)[ \t]+\*?((?:\w+\.)?[A-Z]\w*)[ \t]*$/gm)) put(m[1], m[2]);
    for (const m of code.matchAll(/\b(\w+)\s*:?=\s*&?((?:\w+\.)?[A-Z]\w*)\{/g)) put(m[1], m[2]);
    // Receivers and parameters: `func (c *Command) Run(cmd *Command, args []string)`.
    for (const sig of code.matchAll(/\bfunc\s*(\([^)]*\))?\s*\w*\s*\(([^)]*)\)/g)) for (const m of `${sig[1] ?? ''},${sig[2]}`.matchAll(/(\w+)\s+\*?((?:\w+\.)?[A-Z]\w*)\s*(?=[,)]|$)/g)) put(m[1], m[2]);
  }
  return types;
}

// ── Services: HTTP requests to routes, events and queues to listeners ─────────────────────────────────

const PLACEHOLDER = '\u0000';
/** The path an HTTP call goes to, from its URL argument. null with a reason when it is worked out at run time. */
function urlOf(e) {
  if (!e) return { why: 'the address is not written in the code' };
  let text = null;
  if (e.kind === 'literal' && e.type === 'text') text = String(e.value);
  else if (e.kind === 'template') text = e.parts.map((p) => (typeof p === 'string' ? p : PLACEHOLDER)).join('');
  else if (e.kind === 'literal' && e.interpolated) text = String(e.value).replace(/\$\{[^}]*\}|\$\w+|#\{[^}]*\}|\{[^}]*\}/g, PLACEHOLDER);
  else if (e.kind === 'binary' && e.op === '+') {
    const parts = [];
    const flat = (x) => { if (x.kind === 'binary' && x.op === '+') { flat(x.left); flat(x.right); } else parts.push(x); };
    flat(e);
    text = parts.map((x) => (x.kind === 'literal' && x.type === 'text' ? String(x.value) : PLACEHOLDER)).join('');
  }
  if (text == null) return { why: 'computed URL: the address is worked out when it runs' };
  if (text.startsWith(PLACEHOLDER)) return { why: 'computed URL: the address starts with a value worked out when it runs' };
  let host = null;
  const abs = text.match(/^[a-z][a-z0-9+.-]*:\/\/([^/]*)(.*)$/i);
  if (abs) { host = abs[1]; text = abs[2] || '/'; }
  if (host && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/.test(host)) return { why: `calls another service at ${host.replace(new RegExp(PLACEHOLDER, 'g'), '…')}`, external: true };
  if (!text.startsWith('/')) return { why: 'computed URL: not a path from the root of this app' };
  const path = text.replace(/[?#].*$/s, '');
  const segs = path.split('/').filter(Boolean).map((s) => (s.includes(PLACEHOLDER) ? '*' : s));
  return { path: '/' + segs.map((s) => (s === '*' ? ':value' : s)).join('/'), segs };
}

/** A route's path as segments; parameters (`:id`, `{id}`, `<int:id>`, `[id]`, `*`) are wildcards. */
const routeSegs = (p) => String(p).split('/').filter(Boolean).map((s) => (/^(:\w+\??|\{[^}]+\}|<[^>]+>|\[[^\]]+\]|\*+|\(\.\*\))$/.test(s) ? '*' : s));
function segsMatch(a, b) {
  if (a.length !== b.length) return -1;
  let exact = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] === b[i] && a[i] !== '*') exact++; else if (a[i] !== '*' && b[i] !== '*') return -1; }
  return exact;
}

const HTTP_SAYS = /^Sends an? ([A-Z]+) request to /;
/** The URL argument of an HTTP call. */
function urlArg(call) {
  const args = call.args || [];
  const path = calleePath(call.callee) || [];
  const last = path.at(-1) || '';
  if (/^NewRequest(WithContext)?$/.test(last)) return args[last.endsWith('Context') ? 2 : 1];
  if (args[0]?.kind === 'object') { const u = args[0].entries?.find((x) => x.key && /^(url|uri)$/.test(x.key.value ?? x.key.name ?? '')); return u?.value ?? null; }
  if (/^(request|Request|exchange|send)$/.test(last) && args[0]?.kind === 'literal' && /^[A-Z]+$/.test(String(args[0].value))) return args[1];
  return args[0];
}

const EVENT_PUBLISH = /^(emit|publish|publishEvent|sendToQueue|enqueue|basic_publish|produce|dispatch)$/;
const EVENT_SUBSCRIBE = /\.(on|once|addListener|subscribe|consume|listen|handle)\(\s*(['"`])([^'"`]+)\2\s*,\s*(?:(?:async\s*)?(?:function\b|\(|[\w$]+\s*=>)|((?:this\.|self\.)?[\w$]+)\s*[,)])/g;
const EVENT_DECORATOR = /@(OnEvent|EventPattern|MessagePattern|KafkaListener|RabbitListener|SqsListener|JmsListener|StreamListener|Subscribe|EventHandler|Consumer)\s*\(\s*(?:\{?\s*)?(?:(?:topics|queues|destination|value|pattern|event)\s*[:=]\s*)?(?:\[\s*)?(['"])([^'"]+)\2/g;
/** Names any emitter uses (a stream's 'error', a socket's 'close'): matching them across files would be a guess. */
const GENERIC_EVENTS = new Set(['error', 'close', 'end', 'data', 'finish', 'open', 'message', 'connect', 'connection', 'request', 'response', 'listening', 'drain', 'pipe', 'unpipe', 'readable', 'timeout', 'abort', 'change', 'click', 'input', 'submit', 'load', 'ready', 'exit', 'mount', 'start', 'stop', 'done', 'update', 'success', 'fail', 'progress', 'headers', 'upgrade', 'secureConnection', 'disconnect', 'reconnect']);

// ── Linking ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Add the whole system's links to a model: `links[]` entries with `crossFile: true` (kind 'uses', with the target's
 * file and the calling step's line) and `kind: 'sends-to'` (an HTTP request to a route; an event or message to its
 * listener), and `model.notLinked` for what was worth linking and could not be. Mutates and returns the model.
 */
export function linkSystem(model, files) {
  const sources = new Map(files.map((f) => [f.path, String(f.source ?? '')]));
  const langOf = new Map(model.files.map((f) => [f.path, f.language]));
  const paths = new Set(model.files.map((f) => f.path));
  const membersOf = new Map(), thingsOf = new Map();
  for (const m of model.members) (membersOf.get(m.file) ?? membersOf.set(m.file, []).get(m.file)).push(m);
  for (const t of model.things) (thingsOf.get(t.file) ?? thingsOf.set(t.file, []).get(t.file)).push(t);
  const memberById = new Map(model.members.map((m) => [m.id, m]));
  const notLinked = [];
  // (One file with no routes and no Things has nothing to link: no other files, services, or instances.)
  if (model.files.length < 2 && !model.members.some((m) => m.route) && !model.things.length) { model.notLinked = notLinked; return model; }

  // Top-level members of a file by name: not a method of a Thing, not written inside another function.
  const topCache = new Map();
  const topOf = (file) => {
    let t = topCache.get(file);
    if (t) return t;
    t = new Map();
    const ms = (membersOf.get(file) || []).filter((m) => !m.callback);
    const lang = langOf.get(file);
    const src = lang === 'go' ? sources.get(file)?.split('\n') : null;
    for (const m of ms) {
      if (m.owner && !(m.kind === 'setup')) continue;
      if (ms.some((o) => o !== m && o.lines[0] < m.lines[0] && m.lines[1] <= o.lines[1] && !o.owner)) continue;
      if (src && /^\s*func\s*\(/.test(src[m.lines[0] - 1] || '')) continue; // a Go method (it has a receiver)
      if (m.owner) continue;
      (t.get(m.name) ?? t.set(m.name, []).get(m.name)).push(m);
    }
    topCache.set(file, t);
    return t;
  };
  const thingNamed = (file, name) => (thingsOf.get(file) || []).find((t) => t.name === name);
  // Overloads (Java, C#, Kotlin): the one that takes as many values as the call gives, when only one does.
  let argc = null;
  const pick = (ms) => (ms.length <= 1 || argc == null ? ms : ms.filter((m) => m.arity === argc).length === 1 ? ms.filter((m) => m.arity === argc) : ms);
  const setupOf = (thing) => { const ms = pick(thing.can.map((id) => memberById.get(id)).filter((m) => m?.kind === 'setup')); return ms.length === 1 ? ms[0] : null; };
  const methodOf = (thing, name) => pick(thing.can.map((id) => memberById.get(id)).filter((m) => m && m.name === name));

  // ── Where things live: JS files, Python modules, Go packages, JVM/C#/PHP packages, Rust modules ──
  const JS_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
  // Manifests, when given with the files: go.mod (module paths), package.json (workspace packages), tsconfig.json /
  // jsconfig.json (path aliases). They are what make a non-relative import this repo's own, not a guess.
  const manifests = files.filter((f) => /(^|\/)(go\.mod|package\.json|[tj]sconfig\.json)$/.test(f.path) && f.source);
  const json = (text) => { try { return JSON.parse(String(text).replace(/\/\*[\s\S]*?\*\/|(^|[^:"])\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1')); } catch { return null; } };
  const goModules = manifests.filter((f) => /(^|\/)go\.mod$/.test(f.path)).map((f) => ({ dir: dirOf(f.path), module: (f.source.match(/^\s*module\s+(\S+)/m) || [])[1] })).filter((x) => x.module);
  const jsPackages = new Map();
  const aliases = [];
  for (const f of manifests) {
    if (/(^|\/)package\.json$/.test(f.path)) { const j = json(f.source); if (j?.name) jsPackages.set(j.name, { dir: dirOf(f.path), entry: j.source || j.module || j.main || null }); }
    else if (/(^|\/)[tj]sconfig\.json$/.test(f.path)) {
      const o = json(f.source)?.compilerOptions;
      const base = join(dirOf(f.path), o?.baseUrl || '.');
      for (const [k, v] of Object.entries(o?.paths || {})) for (const to of [].concat(v)) aliases.push({ from: k, to: join(base, String(to)), dir: dirOf(f.path) });
    }
  }
  const jsFile = (from, spec) => {
    const rel = spec.startsWith('.') || spec.startsWith('/');
    const bases = [];
    // A tsconfig path alias (`@/*` -> `./src/*`) for files under that tsconfig.
    const alias = rel ? [] : aliases.filter((a) => (!a.dir || from.startsWith(a.dir + '/')) && (a.from.endsWith('*') ? spec.startsWith(a.from.slice(0, -1)) : spec === a.from));
    const pkgName = !rel && (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
    if (rel) bases.push(spec.startsWith('/') ? join(spec) : join(dirOf(from), spec));
    bases.push(...alias.map((a) => (a.from.endsWith('*') ? a.to.replace('*', spec.slice(a.from.length - 1)) : a.to)));
    if (!rel && jsPackages.has(pkgName)) {
      // This repo's own package (a workspace, or examples importing the package they sit in).
      const pk = jsPackages.get(pkgName);
      const sub = spec.slice(pkgName.length + 1);
      if (sub) bases.push(join(pk.dir, sub), join(pk.dir, 'src', sub));
      else {
        const entry = pk.entry ? join(pk.dir, pk.entry) : null;
        // A built entry (`dist/index.js`) is not in the repo; its source is the package's src/index when that exists.
        bases.push(...[entry, join(pk.dir, 'index'), ...(!entry || /^(dist|build|lib|out)\//.test(pk.entry || '') ? [join(pk.dir, 'src/index')] : [])].filter((x) => x != null));
      }
    }
    // (`@/lib/x` with no tsconfig saying where `@` points is not guessed.)
    if (!bases.length) return /^[@~#]\//.test(spec) ? { why: `path alias ${spec}: no tsconfig paths say where it points` } : { why: `external package (${pkgName})`, external: true };
    for (const b of bases) { const f = tryJs(b); if (f) return { file: f }; }
    if (alias.length) return { why: `path alias ${spec}: no file in this repo` };
    return { why: `no file ${spec} in this repo` };
  };
  function tryJs(base) {
    if (paths.has(base) && JS.has(langOf.get(base))) return base;
    const noExt = base.replace(/\.(m|c)?js$/, '');
    for (const e of JS_EXT) if (paths.has(noExt + e)) return noExt + e;
    for (const e of JS_EXT) if (paths.has(`${base}/index${e}`)) return `${base}/index${e}`;
    return null;
  }

  const pyIndex = new Map();
  for (const f of model.files) {
    if (f.language !== 'python') continue;
    const segs = f.path.replace(/\.pyi?$/, '').replace(/\/__init__$/, '').split('/');
    for (let i = 0; i < segs.length; i++) { const k = segs.slice(i).join('.'); (pyIndex.get(k) ?? pyIndex.set(k, []).get(k)).push({ file: f.path, prefix: segs.slice(0, i).join('/') }); }
  }
  const pyModule = (from, spec) => {
    const dots = spec.match(/^\.*/)[0].length;
    if (dots) {
      let dir = dirOf(from);
      for (let i = 1; i < dots; i++) dir = dirOf(dir);
      const rest = spec.slice(dots).replace(/\./g, '/');
      const base = join(dir, rest);
      for (const c of [`${base}.py`, `${base}/__init__.py`]) if (paths.has(c)) return { files: [c] };
      if (!rest && [...paths].some((p) => dirOf(p) === dir)) return { files: [] , why: 'a package with no __init__.py' };
      return { why: `no module ${spec} next to this file` };
    }
    const cands = pyIndex.get(spec) || [];
    if (!cands.length) return { why: `external package (${spec.split('.')[0]})`, external: true };
    const home = dirOf(from);
    const near = cands.filter((c) => !c.prefix || home === c.prefix || home.startsWith(c.prefix + '/'));
    const pick = near.length ? near : cands.filter((c) => !c.prefix || /^(src|lib|python)$/.test(c.prefix));
    if (pick.length === 1) return { files: [pick[0].file] };
    // The same module name under two roots: which one Python loads depends on how it is run.
    return { why: pick.length ? `${pick.length} modules in this repo are named ${spec}` : `module ${spec} is not under this file's folder`, ambiguous: true };
  };
  const hasSymbol = (fs, name) => fs.some((f) => topOf(f).has(name) || thingNamed(f, name) || modules.get(f)?.bindings.has(name));

  const goDirs = new Map();
  for (const f of model.files) if (f.language === 'go') { const d = dirOf(f.path); (goDirs.get(d) ?? goDirs.set(d, []).get(d)).push(f.path); }
  const goPkgName = (fs) => (sources.get(fs.find((f) => !/_test\.go$/.test(f)) ?? fs[0])?.match(/^\s*package\s+(\w+)/m) || [])[1];
  const goPackage = (imp) => {
    let best = null;
    const mod = goModules.filter((g) => imp === g.module || imp.startsWith(g.module + '/')).sort((a, b) => b.module.length - a.module.length)[0];
    if (mod) {
      best = join(mod.dir, imp.slice(mod.module.length));
      if (!goDirs.has(best)) return { why: `no package ${imp} in this repo` };
    } else {
      if (!/\./.test(imp.split('/')[0])) return { why: `standard library (${imp})`, external: true };
      // With no go.mod, a folder of this repo whose path ends the import path (two folders deep or more).
      if (!goModules.length) for (const d of goDirs.keys()) if (d.includes('/') && (imp === d || imp.endsWith('/' + d)) && (!best || d.length > best.length)) best = d;
      if (best == null) return { why: `external package (${imp})`, external: true };
    }
    const fs = goDirs.get(best).filter((f) => !/_test\.go$/.test(f));
    return { files: fs, name: goPkgName(fs) || best.split('/').pop() };
  };

  // Packages and namespaces (Java/Kotlin package, C# namespace, PHP namespace).
  const pkgOf = new Map();
  for (const f of model.files) {
    const s = sources.get(f.path) || '';
    if (JVM.has(f.language)) pkgOf.set(f.path, [(s.match(/^\s*package\s+([\w.]+)/m) || [])[1] ?? '']);
    else if (f.language === 'csharp') pkgOf.set(f.path, [...s.matchAll(/^\s*namespace\s+([\w.]+)/gm)].map((m) => m[1]).concat(s.match(/^\s*namespace\s/m) ? [] : ['']));
    else if (f.language === 'php') pkgOf.set(f.path, [(s.match(/^\s*namespace\s+([\w\\]+)\s*;/m) || [])[1] ?? '']);
  }
  const family = (l) => (JVM.has(l) ? 'jvm' : l);
  const classesNamed = new Map();
  for (const t of model.things) { const k = `${family(langOf.get(t.file))}|${t.name}`; (classesNamed.get(k) ?? classesNamed.set(k, []).get(k)).push(t); }
  const classIn = (pkg, name, language) => {
    const all = classesNamed.get(`${family(language)}|${name}`) || [];
    const hit = all.filter((t) => (pkgOf.get(t.file) || ['']).includes(pkg));
    if (hit.length === 1) return { thing: hit[0] };
    if (hit.length > 1) return { why: `${hit.length} classes named ${name} in ${pkg}` };
    return { why: all.length ? `no class ${name} in ${pkg || 'this package'}` : `external package (${pkg || name})`, external: !all.length };
  };
  const pkgFiles = (pkg) => model.files.filter((f) => (pkgOf.get(f.path) || []).includes(pkg)).map((f) => f.path);

  const rustModule = (from, spec) => {
    const segs = spec.split('::');
    let root = from.match(/^(.*?\/?src)\//)?.[1] ?? dirOf(from);
    let dir;
    if (segs[0] === 'crate') dir = root;
    else if (segs[0] === 'self') dir = /\/(mod|lib|main)\.rs$/.test(from) || !from.includes('/') ? dirOf(from) : from.replace(/\.rs$/, '');
    else if (segs[0] === 'super') dir = dirOf(/\/(mod)\.rs$/.test(from) ? dirOf(from) : from.replace(/\.rs$/, ''));
    else return { why: `external crate (${segs[0]})`, external: true };
    const rest = segs.slice(1);
    if (!rest.length) return { files: [] };
    const base = join(dir, ...rest);
    for (const c of [`${base}.rs`, `${base}/mod.rs`]) if (paths.has(c)) return { files: [c] };
    return { why: `no module ${spec} in this crate` };
  };

  const ctx = { jsFile, pyModule, hasSymbol, goPackage, classIn, pkgFiles, rustModule };

  // ── Every file's imports and declared types ──
  const modules = new Map();
  const external = new Map();
  for (const f of model.files) {
    const src = sources.get(f.path);
    if (src == null) continue;
    const out = { bindings: new Map(), unresolved: [], star: [], packages: [], types: null, language: f.language };
    try {
      if (JS.has(f.language)) jsImports(src, f.path, ctx, out);
      else if (f.language === 'go') goImports(src, f.path, ctx, out);
      else if (JVM.has(f.language)) jvmImports(src, f.path, ctx, out, f.language);
      else if (f.language === 'csharp') csharpImports(src, f.path, ctx, out);
      else if (f.language === 'php') phpImports(src, f.path, ctx, out);
      else if (f.language === 'rust') rustImports(src, f.path, ctx, out);
    } catch { /* one file's imports never stop the whole app */ }
    modules.set(f.path, out);
  }
  // Python second: `from pkg import name` looks at names pkg/__init__.py itself imports.
  for (const f of model.files) if (f.language === 'python' && sources.has(f.path)) { try { pythonImports(sources.get(f.path), f.path, ctx, modules.get(f.path)); } catch { /* keep going */ } }
  const once = new Set();
  for (const [file, mod] of modules) {
    for (const u of mod.unresolved) {
      const k = `${file}|${u.line}|${u.import}|${u.why}`;
      if (once.has(k)) continue; // one import statement with several names is listed once
      once.add(k);
      if (/^(external|standard library)/.test(u.why)) {
        const key = u.why;
        const e = external.get(key);
        if (e) e.files++; else external.set(key, { file, line: u.line, import: u.import, why: u.why, files: 1 });
      } else notLinked.push(u);
    }
  }
  notLinked.push(...external.values());
  const typesFor = (file) => { const m = modules.get(file); if (m && !m.types) m.types = typesOf(sources.get(file) || '', m.language); return m?.types ?? new Map(); };

  // ── Resolving one callee path in one file ──
  const jsExportCache = new Map();
  const jsExp = (f) => { let e = jsExportCache.get(f); if (!e) { e = jsExports(sources.get(f) || ''); jsExportCache.set(f, e); } return e; };
  /** A symbol in a module: { member } or { thing }, following JS re-exports and Python re-imports. */
  const symbolIn = (fs, symbol, depth = 0) => {
    if (depth > 6) return null;
    for (const f of fs) {
      let name = symbol;
      const lang = langOf.get(f);
      if (JS.has(lang)) {
        const ex = jsExp(f);
        if (symbol === 'default' || symbol === 'module.exports') name = ex.def ?? (symbol === 'module.exports' ? null : 'default');
        else if (ex.named.has(symbol)) name = ex.named.get(symbol);
        if (name == null) {
          // `require('./x')` of a file that only sets `exports.a = …`: the module itself, as a namespace.
          return { module: [f] };
        }
        // `exports.place = function`, `module.exports.place =`.
        const assigned = (membersOf.get(f) || []).filter((m) => /^(?:module\.)?exports\.([\w$]+)$/.test(m.assignedTo || '') && m.assignedTo.split('.').pop() === name);
        if (assigned.length === 1) return { member: assigned[0] };
      }
      const top = topOf(f).get(name);
      if (top?.length === 1) return { member: top[0] };
      const th = thingNamed(f, name);
      if (th) return { thing: th };
      if (JS.has(lang)) {
        for (const r of jsExp(f).re) {
          if (r.names && !r.names.has(symbol)) continue;
          if (r.as && r.as !== symbol) continue;
          const t = jsFile(f, r.spec);
          if (!t.file) continue;
          if (r.as) return { module: [t.file] };
          const got = symbolIn([t.file], r.names ? r.names.get(symbol) : symbol, depth + 1);
          if (got) return got;
        }
      }
      const b = modules.get(f)?.bindings.get(name);
      if (b && depth < 6) { const got = b.symbol ? symbolIn(b.files, b.symbol, depth + 1) : { module: b.files }; if (got) return got; }
    }
    return null;
  };
  const classByName = (file, name) => {
    const lang = langOf.get(file);
    const mod = modules.get(file);
    const b = mod?.bindings.get(name);
    if (b) { const got = b.thing ? { thing: b.thing } : b.symbol ? symbolIn(b.files, b.symbol) : null; return got?.thing ? got : { why: got ? null : `${name} is not a class in ${b.spec ?? 'its module'}` }; }
    if (JVM.has(lang) || lang === 'csharp' || lang === 'php') {
      const own = pkgOf.get(file) || [''];
      const spaces = new Set([...own, ...(mod?.packages ?? [])]);
      // C#: a namespace also sees its parent namespaces.
      if (lang === 'csharp') for (const n of own) { const parts = n.split('.'); for (let i = 1; i < parts.length; i++) spaces.add(parts.slice(0, i).join('.')); }
      const all = (classesNamed.get(`${family(lang)}|${name}`) || []).filter((t) => (pkgOf.get(t.file) || ['']).some((p) => spaces.has(p)));
      if (all.length === 1) return { thing: all[0] };
      return { why: all.length > 1 ? `${all.length} classes named ${name} are visible here` : null };
    }
    if (lang === 'ruby') {
      // Ruby constants are global: a class name is that class when exactly one is defined in the repo.
      const all = classesNamed.get(`ruby|${name}`) || [];
      if (all.length === 1) return { thing: all[0] };
      return { why: all.length > 1 ? `${all.length} classes named ${name} in this repo` : null };
    }
    if (lang !== 'go' && name.includes('.')) {
      const parts = name.split('.');
      for (let k = parts.length - 1; k >= 1; k--) {
        const pb = mod?.bindings.get(parts.slice(0, k).join('.'));
        if (!pb) continue;
        const target = pb.thing ? { thing: pb.thing } : pb.symbol ? symbolIn(pb.files, pb.symbol) : { module: pb.files };
        let cur = target;
        for (const seg of parts.slice(k)) { if (!cur?.module) { cur = null; break; } cur = symbolIn(cur.module, seg); }
        return cur?.thing ? { thing: cur.thing } : { why: null };
      }
      return { why: null };
    }
    if (lang === 'go' && name.includes('.')) {
      const [pkg, type] = name.split('.');
      const pb = mod?.bindings.get(pkg);
      if (pb) { const th = pb.files.map((f) => thingNamed(f, type)).find(Boolean); if (th) return { thing: th }; }
      return { why: null };
    }
    if (lang === 'go') {
      const th = (goDirs.get(dirOf(file)) || []).map((f) => thingNamed(f, name)).find(Boolean);
      return th ? { thing: th } : { why: null };
    }
    if (JS.has(lang) || lang === 'python') { const th = thingNamed(file, name); return th ? { thing: th } : { why: null }; }
    return { why: null };
  };
  const viaThing = (thing, rest, isNew) => {
    if (!rest.length) {
      const s = setupOf(thing);
      return s ? { member: s } : { why: thing.can.some((id) => memberById.get(id)?.kind === 'setup') ? `${thing.name} has several ways to start; which one depends on the values given` : null };
    }
    if (rest.length > 1) return { why: null };
    const ms = methodOf(thing, rest[0]);
    // Ruby `Order.new(…)`, Rust `Order::new(…)` with no method of that name: how a new one starts.
    if (!ms.length && rest[0] === 'new') return viaThing(thing, [], true);
    if (ms.length === 1) return { member: ms[0] };
    if (thing.kind !== 'thing' && !thing.can.length) return { why: `${thing.name} is an interface: which code runs is chosen when it runs`, worth: true };
    return { why: ms.length > 1 ? `${ms.length} methods named ${rest[0]} in ${thing.name}` : null };
  };
  /** From a module, Thing, or member, follow the rest of a path: `utils.rewind_body`, `models.Order.create`. */
  const walkTail = (target, tail, isNew, spec) => {
    let cur = target;
    for (let i = 0; i < tail.length; i++) {
      if (cur.module) { const got = symbolIn(cur.module, tail[i]); if (!got) return { why: `${spec ?? 'the module'} has no ${tail.slice(0, i + 1).join('.')}`, worth: true }; cur = got; continue; }
      if (cur.thing) return viaThing(cur.thing, tail.slice(i), isNew);
      return { why: null };
    }
    if (cur.member) return { member: cur.member };
    if (cur.thing) return viaThing(cur.thing, [], isNew);
    return { why: null };
  };
  // A name's declared type: in the member's own code first (`s = requests.Session()` in one test), then the file's.
  const memberTypes = new Map(), fileLines = new Map();
  const typeOf = (file, member, name) => {
    if (member) {
      let t = memberTypes.get(member.id);
      if (!t) {
        let lines = fileLines.get(file);
        if (!lines) { lines = (sources.get(file) || '').split('\n'); fileLines.set(file, lines); }
        // (A Go receiver or a typed parameter sits on the signature line, which belongs to the member.)
        t = typesOf(lines.slice(member.lines[0] - 1, member.lines[1]).join('\n'), langOf.get(file), true);
        memberTypes.set(member.id, t);
      }
      if (t.has(name)) return t.get(name);
    }
    return typesFor(file).get(name);
  };
  const resolve = (file, path, isNew, member) => {
    const lang = langOf.get(file);
    const mod = modules.get(file);
    if (!mod) return { why: null };
    const [head, ...rest] = path;
    // `this.repo.find()`, `self.repo.find()`, `s.repo.Find()` (a Go receiver): the field's declared type.
    if (rest.length === 2 && (/^(this|self|@)$/.test(head) || lang === 'go')) {
      const type = typeOf(file, member, rest[0]);
      if (type) { const c = classByName(file, type); if (c.thing) return viaThing(c.thing, [rest[1]]); return { why: c.why ?? null }; }
    }
    // A module or namespace bound by an import, with the longest prefix first (`a.b.f` for Python's `import a.b`).
    for (let k = Math.min(path.length - 1, 4); k >= 1; k--) {
      const b = mod.bindings.get(path.slice(0, k).join('.'));
      if (!b) continue;
      const target = b.thing ? { thing: b.thing } : b.symbol ? symbolIn(b.files, b.symbol) : { module: b.files };
      if (!target) return { why: `${path.slice(0, k).join('.')} was not found in ${b.spec ?? 'its module'}`, worth: true };
      return walkTail(target, path.slice(k), isNew, b.spec ?? path.slice(0, k).join('.'));
    }
    if (!rest.length) {
      const b = mod.bindings.get(head);
      if (b) {
        const target = b.thing ? { thing: b.thing } : b.symbol ? symbolIn(b.files, b.symbol) : null;
        if (!target) return { why: b.symbol ? `${b.spec ?? 'its module'} has no ${b.symbol}` : null, worth: !!b.symbol };
        return walkTail(target, [], isNew);
      }
      // Go: another file of the same package. Python/Go: names a star import brings in.
      if (lang === 'go') {
        // (A test file sees the package's other files; a non-test file never sees a test file.)
        const same = (goDirs.get(dirOf(file)) || []).filter((f) => f !== file && (/_test\.go$/.test(file) || !/_test\.go$/.test(f)));
        const hit = same.map((f) => topOf(f).get(head)).filter((x) => x?.length === 1).map((x) => x[0]);
        if (hit.length === 1) return { member: hit[0] };
        const th = same.map((f) => thingNamed(f, head)).find(Boolean);
        if (th) return { why: null };
      }
      for (const fs of mod.star) { const got = symbolIn(fs, head); if (got?.member) return { member: got.member }; if (got?.thing) return viaThing(got.thing, [], isNew); }
      // Kotlin/Java: a class's constructor written `OrderService(…)` / `new OrderService(…)`; a Kotlin top-level function in the same package.
      if (/^[A-Z]/.test(head) && (isNew || lang === 'kotlin' || lang === 'python' || lang === 'php' || lang === 'csharp' || lang === 'java')) {
        const c = classByName(file, head);
        if (c.thing) return viaThing(c.thing, [], true);
      }
      if (lang === 'kotlin') {
        const hit = pkgFiles((pkgOf.get(file) || [''])[0]).filter((f) => f !== file && langOf.get(f) === 'kotlin').map((f) => topOf(f).get(head)).filter((x) => x?.length === 1).map((x) => x[0]);
        if (hit.length === 1) return { member: hit[0] };
      }
      return { why: null };
    }
    // `OrderService.find(…)`: a class's own method; `orders.place(…)`: a name with a declared type.
    if (rest.length === 1) {
      if (/^[A-Z]/.test(head)) { const c = classByName(file, head); if (c.thing) return viaThing(c.thing, rest); if (c.why) return { why: c.why }; }
      const type = typeOf(file, member, head);
      if (type) { const c = classByName(file, type); if (c.thing) return viaThing(c.thing, rest); return { why: c.why ?? null }; }
    }
    // Ruby `Billing::Charge.run`, PHP `\App\Services\Orders::find`: the last class name in the path.
    if (rest.length >= 2 && (lang === 'ruby' || lang === 'php')) {
      const cls = path.at(-2);
      if (/^[A-Z]/.test(cls)) { const c = classByName(file, cls); if (c.thing) return viaThing(c.thing, [path.at(-1)]); }
    }
    // Rust: `crate::orders::place(…)`.
    if (lang === 'rust' && /^(crate|super|self)$/.test(head) && rest.length >= 2) {
      const r = rustModule(file, path.slice(0, -1).join('::'));
      if (r.files?.length) { const got = symbolIn(r.files, path.at(-1)); if (got?.member) return { member: got.member }; return { why: `${path.slice(0, -1).join('::')} has no ${path.at(-1)}`, worth: true }; }
    }
    return { why: null };
  };

  // ── Routes and listeners ──
  const routes = [];
  for (const m of model.members) {
    if (!m.route) continue;
    const r = m.route.match(/^(\w+)\s+(.*)$/);
    if (r) routes.push({ member: m, method: r[1].toUpperCase(), segs: routeSegs(r[2]), path: r[2] });
  }
  // Next.js route files: app/api/orders/[id]/route.ts exports GET, POST, …; pages/api/orders.ts handles any method.
  for (const m of model.members) {
    if (m.route || m.owner) continue;
    const app = m.file.match(/(?:^|\/)app\/(.*?)\/?route\.(?:ts|js|tsx|jsx|mjs)$/);
    if (app && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(m.name)) routes.push({ member: m, method: m.name, segs: routeSegs('/' + app[1].replace(/\([^)]*\)\/?/g, '')), path: '/' + app[1] });
    const pages = m.file.match(/(?:^|\/)pages\/(api\/.*?)(?:\/index)?\.(?:ts|js|tsx|jsx)$/);
    if (pages && topOf(m.file).get(m.name)?.[0] === m && jsExp(m.file).def === m.name) routes.push({ member: m, method: 'ANY', segs: routeSegs('/' + pages[1]), path: '/' + pages[1] });
  }
  const listeners = new Map();
  const addListener = (name, member, how) => { if (!member) return; const l = listeners.get(name) ?? listeners.set(name, []).get(name); if (!l.some((x) => x.member === member)) l.push({ member, how }); };
  for (const f of model.files) {
    const src = sources.get(f.path);
    if (!src || !/\.(on|once|addListener|subscribe|consume|listen|handle)\(|@\w+(Listener|Pattern|Event|Handler)\b|@Subscribe|@Consumer|new\s+Worker\(/.test(src)) continue;
    const ms = membersOf.get(f.path) || [];
    for (const m of src.matchAll(EVENT_SUBSCRIBE)) {
      if (GENERIC_EVENTS.has(m[3])) continue;
      const line = lineAt(src, m.index);
      // The handler: a function written right there (an item since it has no name of its own), or one named.
      const handler = m[4] ? (ms.find((x) => x.name === m[4].replace(/^(this|self)\./, '') && !x.callback) ?? null) : ms.filter((x) => x.lines[0] >= line && x.lines[0] <= line + 2).sort((a, b) => a.lines[0] - b.lines[0])[0];
      addListener(m[3], handler, m[1]);
    }
    for (const m of src.matchAll(/new\s+Worker\(\s*(['"`])([^'"`]+)\1\s*,/g)) {
      const line = lineAt(src, m.index);
      addListener(m[2], ms.filter((x) => x.lines[0] >= line && x.lines[0] <= line + 2).sort((a, b) => a.lines[0] - b.lines[0])[0], 'worker');
    }
    for (const m of src.matchAll(EVENT_DECORATOR)) {
      const line = lineAt(src, m.index);
      addListener(m[3], ms.filter((x) => x.lines[0] > line && x.lines[0] <= line + 6).sort((a, b) => a.lines[0] - b.lines[0])[0], m[1]);
    }
  }
  // `const emails = new Queue('emails')` then `emails.add(…)`: the queue's name.
  const queueNames = new Map();
  for (const f of model.files) {
    const src = sources.get(f.path);
    if (!src || !/new\s+Queue\(/.test(src)) continue;
    for (const m of src.matchAll(/(?:\b(?:const|let|var)\s+|this\.)([\w$]+)\s*=\s*new\s+Queue\(\s*(['"`])([^'"`]+)\2/g)) queueNames.set(`${f.path}|${m[1]}`, m[3]);
  }

  // ── Walk every step of every member ──
  const seen = new Set();
  const link = (l) => { const k = `${l.from}|${l.to}|${l.node}|${l.kind}`; if (seen.has(k)) return; seen.add(k); model.links.push(l); };
  for (const l of model.links) seen.add(`${l.from}|${l.to}|${l.node}|${l.kind}`);
  const stats = { calls: 0, crossFile: 0, services: 0 };
  for (const m of model.members) {
    for (const nd of m.flow.nodes) {
      if (!nd.expr) continue;
      const calls = callsIn(nd.expr);
      if (!calls.length) continue;
      const http = HTTP_SAYS.exec(nd.text || '');
      let httpDone = false;
      for (const call of calls) {
        const path = calleePath(call.callee);
        if (!path) continue;
        stats.calls++;
        // An HTTP request the library catalog recognized: link it to the route that handles it.
        if (http && !httpDone && /^(fetch|get|post|put|patch|delete|head|request|Get|Post|Put|Patch|Delete|Head|NewRequest|NewRequestWithContext|\w+Async|\w+ForObject|\w+ForEntity|exchange)$/.test(path.at(-1))) {
          httpDone = true;
          const method = http[1];
          const u = urlOf(urlArg(call));
          const service = u.path ? `${method} ${u.path}` : `${method} request`;
          if (!u.segs) { notLinked.push({ from: m.id, node: nd.id, file: m.file, line: nd.line ?? null, call: service, why: u.why }); continue; }
          const matches = routes.map((r) => ({ r, score: (r.method === method || r.method === 'ANY' || r.method === 'ALL') ? segsMatch(r.segs, u.segs) : -1 })).filter((x) => x.score >= 0);
          const best = Math.max(-1, ...matches.map((x) => x.score));
          const top = matches.filter((x) => x.score === best);
          if (top.length === 1) {
            const r = top[0].r;
            link({ from: m.id, to: r.member.id, kind: 'sends-to', node: nd.id, file: r.member.file, line: nd.line ?? null, method, path: u.path, route: r.member.route ?? `${r.method} ${r.path}`, ...(r.member.file !== m.file ? { crossFile: true } : {}) });
            stats.services++;
          } else notLinked.push({ from: m.id, node: nd.id, file: m.file, line: nd.line ?? null, call: service, why: top.length ? `${top.length} routes in this repo match ${method} ${u.path}` : `no route in this repo handles ${method} ${u.path}` });
          continue;
        }
        // An event or a message: link it to the code that listens for the same name.
        const last = path.at(-1);
        const queue = path.length === 2 && /^(add|addBulk)$/.test(last) ? queueNames.get(`${m.file}|${path[0]}`) : null;
        if (queue || (EVENT_PUBLISH.test(last) && call.args?.[0]?.kind === 'literal' && call.args[0].type === 'text')) {
          const name = queue ?? String(call.args[0].value);
          if (GENERIC_EVENTS.has(name)) continue;
          const ls = (listeners.get(name) || []).filter((x) => x.member.id !== m.id);
          for (const x of ls) { link({ from: m.id, to: x.member.id, kind: 'sends-to', node: nd.id, file: x.member.file, line: nd.line ?? null, event: name, ...(x.member.file !== m.file ? { crossFile: true } : {}) }); stats.services++; }
          if (!ls.length && (queue || /^(publish|publishEvent|sendToQueue|enqueue|basic_publish|produce)$/.test(last))) notLinked.push({ from: m.id, node: nd.id, file: m.file, line: nd.line ?? null, call: `${queue ? 'message on' : 'event'} ${name}`, why: `nothing in this repo listens for ${name}` });
          if (ls.length) continue;
        }
        // A task sent to a worker: `send_email.delay(…)` (Celery) runs send_email.
        let p = path, isNew = !!call.new, task = false;
        if (p.length >= 2 && /^(delay|apply_async|send|enqueue|perform_async|perform_later)$/.test(last) && langOf.get(m.file) !== 'go') { p = p.slice(0, -1); task = /^(delay|apply_async|perform_async|perform_later)$/.test(last); }
        argc = (call.args || []).length;
        const r = resolve(m.file, p, isNew, m);
        // (Same-file calls the name match missed, such as `library.can_borrow()` through `library = Library()`,
        // link the same way, without `crossFile`.)
        if (r.member && r.member.id !== m.id) {
          const cross = r.member.file !== m.file;
          link({ from: m.id, to: r.member.id, kind: task ? 'sends-to' : 'uses', node: nd.id, file: r.member.file, line: nd.line ?? null, ...(cross ? { crossFile: true } : {}), ...(task ? { task: r.member.name } : {}) });
          if (!nd.uses) { nd.uses = r.member.id; if (cross) nd.usesFile = r.member.file; }
          if (cross) stats.crossFile++;
        } else if (!r.member && r.worth) notLinked.push({ from: m.id, node: nd.id, file: m.file, line: nd.line ?? null, call: path.join('.'), why: r.why });
      }
    }
  }
  model.notLinked = notLinked;
  return model;
}

// ── The app's map: which areas call which ────────────────────────────────────────────────────────────

/** An area: a file's folder, at most two levels deep ("src/orders"), or "(top)" for files at the top. */
export function areaOf(file) {
  const d = dirOf(file).split('/').filter(Boolean);
  return d.length ? d.slice(0, 2).join('/') : '(top)';
}

/** Which areas call which: [{ from, to, calls, sends, examples }] from the model's cross-file and service links. */
export function callsSummary(model) {
  const byId = new Map(model.members.map((m) => [m.id, m]));
  const pairs = new Map();
  for (const l of model.links) {
    if (!l.crossFile && l.kind !== 'sends-to') continue;
    const a = byId.get(l.from), b = byId.get(l.to);
    if (!a || !b) continue;
    const from = areaOf(a.file), to = areaOf(b.file);
    const k = `${from}\u0000${to}`;
    const p = pairs.get(k) ?? pairs.set(k, { from, to, calls: 0, sends: 0, examples: [] }).get(k);
    if (l.kind === 'sends-to') p.sends++; else p.calls++;
    if (p.examples.length < 3) p.examples.push({ from: a.id, to: b.id, says: l.kind === 'sends-to' ? `${a.label} sends ${l.method ? `${l.method} ${l.path}` : l.event ? `the event ${l.event}` : `a task`} to ${b.label}` : `${a.label} calls ${b.label}` });
  }
  return [...pairs.values()].sort((x, y) => (y.calls + y.sends) - (x.calls + x.sends) || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
}
