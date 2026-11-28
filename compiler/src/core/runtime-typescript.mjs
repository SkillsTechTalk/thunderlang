// thunder_runtime.mjs, the runtime compiled TypeScript uses, and its declarations (thunder_runtime.d.mts).
//
// One meaning of Thunder: the runtime is engine-values.mjs, byte for byte (the same values, rules, and messages the
// Thunder engine uses), followed by a small Node part: call frames for error lines, output, reading files, and
// running the program or its tests. compiler/test/core-engines.mjs runs every Core test program on Python, the
// Thunder engine, and compiled TypeScript, and requires the same output from all three.
import { readFileSync } from 'node:fs';
import * as VALUES from './engine-values.mjs';
import { byText } from '../text-order.mjs';

const VALUES_SOURCE = readFileSync(new URL('./engine-values.mjs', import.meta.url), 'utf8');
// npm packages (Use "<package>" from npm): the boundary between Thunder values and JavaScript values. Its import
// line is dropped: in thunder_runtime.mjs the names it uses are the runtime's own.
const NPM_SOURCE = readFileSync(new URL('./runtime-npm.mjs', import.meta.url), 'utf8').replace(/^import [^\n]*\n/m, '');
// Stored lists (Store habits as a list of Habit): the file format the Thunder engine and Python use, byte for byte,
// so the three read and write the same data/<name>.json. Its import and re-export lines are dropped (the runtime has
// those names already).
const STORE_SOURCE = readFileSync(new URL('./store-format.mjs', import.meta.url), 'utf8')
  .replace(/^import [^\n]*\n/m, '').replace(/^export \{ RecordVal \};\n/m, '');

/** The Node part: everything here is about running, not about what a value means. */
const NODE_PART = `
// ── Running compiled TypeScript: frames (for error lines), output, files, and the program or its tests ───────────
import { readFileSync as nodeReadFile, realpathSync as nodeRealpath, writeFileSync as nodeWriteFile, mkdirSync as nodeMkdir, renameSync as nodeRename } from 'node:fs';
import { resolve as nodeResolve, dirname as nodeDirname } from 'node:path';
import { spawnSync as nodeSpawnSync } from 'node:child_process';
import { createServer as nodeCreateServer } from 'node:http';

const frames = [];
let aborted = false;
const snapshot = () => frames.map((f) => ({ file: f.file, line: f.line }));

/** A frame for a program, a test, or a kept value (as the engine's withFrame). */
export function enterFrame(file, line) {
  if (frames.length >= MAX_FRAMES) throw new PyErr('RecursionError', 'maximum recursion depth exceeded');
  const f = { file, line };
  frames.push(f);
  return f;
}
/** A frame for a call; \`first\` is the Thunder line the function starts on (where Python stops when it is too deep). */
export function enterCall(file, line, first) {
  if (frames.length >= MAX_FRAMES) {
    const err = new PyErr('RecursionError', 'maximum recursion depth exceeded');
    if (first != null) err.where = [...snapshot(), { file, line: first }];
    throw err;
  }
  const f = { file, line };
  frames.push(f);
  return f;
}
export function leave() { frames.pop(); }
/** The innermost frame (a record's Never rule runs in its caller's frame). */
export function topFrame() { return frames[frames.length - 1]; }
/** An error on its way out of a frame: remember where it happened (the innermost frames first seen). */
export function fail(e) { const err = asPyErr(e); if (!err.where) err.where = snapshot(); return err; }
function withFrame(frame, fn) {
  if (frames.length >= MAX_FRAMES) throw new PyErr('RecursionError', 'maximum recursion depth exceeded');
  frames.push(frame);
  try { return fn(); } catch (e) { throw fail(e); } finally { frames.pop(); }
}
/** A key for sorting by a field: it runs in a frame at the sorting line, as the generated Python's lambda does. */
export function keyAt(F, get) { const frame = { file: F.file, line: F.line }; return (item) => withFrame(frame, () => get(item)); }

export function say(text) { process.stdout.write(\`\${text}\\n\`); }
export function readText(path) { return readTextVia((p, c) => nodeReadFile(nodeResolve(c, p), 'utf8'), process.cwd(), path); }

/** Records: their kind (name, fields, and Never rules), making one, and setting a field. */
export function recordKind(py, fields, rules = {}) { return { isRecord: true, py, fields, rules }; }
export function setAttr(obj, name, value) {
  setAttrWith((rec) => { for (const r of rec.cls.rules[name] ?? []) never(r.cond(value), r.text, r.line, value); }, obj, name, value);
}
export function setField(obj, key, value) { setFieldWith(setAttr, obj, key, value); }
export function newRecord(cls, pairs) { return newRecordWith(setAttr, cls, new Map(pairs)); }

function report(e) { process.stderr.write(\`\${describeError(asPyErr(e))}\\n\`); process.exitCode = 1; aborted = true; }
/** Work out a file's kept values; an error stops the program with a Thunder message. */
export function init(file, fn) {
  if (aborted) return;
  const F = { file, line: 0 };
  try { withFrame(F, () => fn(F)); } catch (e) { report(e); }
}
/** Is this module the one Node was asked to run? */
export function isEntry(url) {
  const arg = process.argv[1];
  if (!arg) return false;
  const real = (p) => { try { return nodeRealpath(p); } catch { return p; } };
  const strip = (p) => real(p).replace(/\\\\/g, '/').replace(/\\.(ts|mts|js|mjs)$/, '');
  return strip(decodeURIComponent(new URL(url).pathname)) === strip(nodeResolve(arg));
}
/** Stored lists: empty until the program runs (run fills them from data/<name>.json), saved when it finishes well. */
const STORES = [];
export function newStore(file, line, name, cls, fields) { const items = []; STORES.push({ file, line, name, cls, kinds: { fields }, items }); return items; }
function fillStores() {
  for (const st of STORES) {
    const path = \`data/\${st.name}.json\`;
    let text;
    try { text = nodeReadFile(nodeResolve(process.cwd(), path), 'utf8'); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    withFrame({ file: st.file, line: st.line }, () => { st.items.splice(0, st.items.length, ...storeFromText(text, st.kinds, path, (given) => newRecordWith(setAttr, st.cls, given))); });
  }
}
/** A save writes a new file next to the old one, then renames it, so a file is never left half written. */
function saveStores() {
  for (const st of STORES) {
    const path = nodeResolve(process.cwd(), \`data/\${st.name}.json\`);
    nodeMkdir(nodeDirname(path), { recursive: true });
    nodeWriteFile(\`\${path}.saving\`, storeToText(st.items, st.kinds));
    nodeRename(\`\${path}.saving\`, path);
  }
}
// ── HTTP (When someone calls GET /habits: and the answer from GET "…"): data in the stored-list format ──────────
let answeredStatus = null;
/** Give … with status 201: the status this request answers with (a direct call in a test ignores it). */
export function answerStatus(status) { answeredStatus = status; }
/** Stop with "…" and status 404: a Stop that an endpoint answers with that status. */
export function stopWith(message, status) { const e = Stop(message); e.status = status; return e; }

// A call to another service waits for its answer, as every step of a Thunder program does: Node's fetch runs in a
// child process and the program reads what it printed.
const FETCH = "let d='';process.stdin.on('data',(c)=>d+=c).on('end',async()=>{const q=JSON.parse(d);try{const r=await fetch(q.url,{method:q.method,headers:q.body==null?{accept:'application/json'}:{accept:'application/json','content-type':'application/json'},body:q.body??undefined,signal:AbortSignal.timeout(30000)});process.stdout.write(JSON.stringify({status:r.status,text:await r.text()}))}catch(e){process.stdout.write(JSON.stringify({error:String(e.cause?.code??e.cause?.message??e.message),name:e.name}))}})";
/** the answer from GET "…": the answer's text, or records read from it (as = { cls, fields, many }). */
export function httpCall(method, url, body, as) {
  const where = \`The answer from \${method} \${url}\`;
  const r = nodeSpawnSync(process.execPath, ['-e', FETCH], { input: JSON.stringify({ method, url, body: body === null || body === undefined ? null : dataJson(body) }), encoding: 'utf8' });
  let out;
  try { out = JSON.parse(r.stdout); } catch { throw CallFailed(\`\${method} \${url} could not be reached.\`); }
  if (out.error) throw CallFailed(\`\${method} \${url} could not be reached (\${unreachableReason(out)}).\`);
  if (out.status < 200 || out.status > 299) throw CallFailed(\`\${method} \${url} answered \${out.status}: \${out.text.trim().slice(0, 300)}\`);
  if (!as) return out.text;
  let data;
  try { data = JSON.parse(out.text); } catch { throw ConversionFailed(\`\${where} is not JSON Thunder can read.\`); }
  const kind = { fields: as.fields };
  const make = (given) => newRecordWith(setAttr, as.cls, given);
  if (as.many) {
    if (!Array.isArray(data)) throw ConversionFailed(\`\${where} should be a list, written [ … ].\`);
    return data.map((row, i) => recordFrom(row, kind, \`\${where}, item \${i + 1}\`, make, 'it has'));
  }
  return recordFrom(data, kind, where, make, 'it has');
}

const kindName = { whole: 'a whole number', number: 'a number', money: 'money', text: 'text', bool: 'yes or no', date: 'a date' };
/** Answer requests on this machine, one at a time, until stopped (Ctrl+C). Stored lists are saved after each request that finishes well. */
function serve(routes) {
  const host = process.env.THUNDER_HOST || '127.0.0.1';
  const port = Number(process.env.THUNDER_PORT || 8080);
  const table = routes.map((r) => ({ ...r, parts: r.path.split('/').filter(Boolean) }));
  const match = (parts, got) => {
    if (parts.length !== got.length) return null;
    const found = {};
    for (let i = 0; i < parts.length; i++) {
      const m = parts[i].match(/^\\{(.+)\\}$/);
      if (m) found[m[1].trim().toLowerCase()] = decodeURIComponent(got[i]);
      else if (parts[i] !== got[i]) return null;
    }
    return found;
  };
  const server = nodeCreateServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = (status, value) => {
        // A problem the server words itself is plain JSON; a value the program gave is written by its kind.
        let data;
        if (value && value.problem !== undefined && Object.getPrototypeOf(value) === Object.prototype) data = JSON.stringify(value);
        else { try { data = dataJson(value); } catch (e) { status = 500; data = JSON.stringify({ problem: explain(asPyErr(e)) }); } }
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data) });
        res.end(data);
        process.stdout.write(\`\${req.method} \${req.url} -> \${status}\n\`);
      };
      const url = new URL(req.url, 'http://localhost');
      const got = url.pathname.split('/').filter(Boolean);
      const query = Object.fromEntries(url.searchParams);
      let chosen = null;
      const methods = [];
      for (const r of table) {
        const found = match(r.parts, got);
        if (!found) continue;
        methods.push(r.method);
        if (r.method === req.method) chosen = { r, found };
      }
      if (!chosen) {
        if (methods.length) return send(405, { problem: \`\${url.pathname} answers only \${methods.join(', ')}.\` });
        return send(404, { problem: \`Nothing here answers \${req.method} \${url.pathname}.\` });
      }
      const { r, found } = chosen;
      let body = {};
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) {
        try { body = JSON.parse(raw); } catch { return send(400, { problem: "The request's body is not JSON Thunder can read." }); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, { problem: "The request's body should be a JSON object, written { … }." });
      }
      const args = [];
      try {
        for (const inp of r.inputs) {
          const key = inp.text.toLowerCase();
          const where = \`"\${inp.text}"\`;
          if (inp.path) args.push(inputValue(found[key], inp.type, where, true));
          else if (key in query || (inp.py && inp.py in query)) args.push(inputValue(key in query ? query[key] : query[inp.py], inp.type, where, true));
          else if (inp.text in body || key in body || (inp.py && inp.py in body)) args.push(inputValue(inp.text in body ? body[inp.text] : key in body ? body[key] : body[inp.py], inp.type, where, false));
          else if (inp.dflt) args.push(undefined); // its default applies
          else if (inp.type.k === 'optional') args.push(null);
          else return send(400, { problem: \`\${r.method} \${r.path} needs \${inp.text} (\${kindName[inp.type.k] ?? inp.type.k}).\` });
        }
      } catch (e) { return send(400, { problem: explain(asPyErr(e)) }); }
      answeredStatus = null;
      let value;
      try { value = r.handler(...args); } catch (e0) {
        const e = asPyErr(e0);
        if (e.pyType === 'Stop') return send(e.status ?? 400, { problem: explain(e) });
        if (e.pyType === 'RuleBroken') return send(422, { problem: explain(e) });
        process.stderr.write(\`\${describeError(e)}\n\`);
        return send(500, { problem: explain(e) });
      }
      try { saveStores(); dataJson(value); } catch (e0) { const e = asPyErr(e0); process.stderr.write(\`\${describeError(e)}\n\`); return send(500, { problem: explain(e) }); }
      return send(answeredStatus ?? 200, value);
    });
  });
  server.listen(port, host, () => {
    process.stdout.write(\`Thunder is answering on http://\${host}:\${port}\n\${routes.map((r) => \`  \${r.method} \${r.path}\n\`).join('')}Press Ctrl+C to stop.\n\`);
  });
  process.on('SIGINT', () => { process.stdout.write('Stopped answering.\\n'); server.close(); process.exit(0); });
}

/** Run the program: stored lists are filled first and saved only when it finishes well; with endpoints, then answer requests. */
export function run(main, routes) {
  if (aborted) return;
  try { fillStores(); main(); saveStores(); } catch (e) { report(e); return; }
  if (routes && routes.length) serve(routes);
}
/** Every Test block, the way run_tests.py runs them: one line per test, then the totals. */
export function runTests(modules) {
  if (aborted) return;
  let passed = 0, failed = 0;
  for (const [file, tests] of modules) {
    for (const [title, fn, line] of tests) {
      try { fn(); passed++; say(\`PASS  \${title} (\${file}, line \${line})\`); }
      catch (e) { failed++; say(\`FAIL  \${title} (\${file}, line \${line})\`); say(\`      \${describeError(asPyErr(e))}\`); }
    }
  }
  const total = passed + failed;
  say(\`\${total} test\${total === 1 ? '' : 's'}: \${passed} passed, \${failed} failed\`);
  if (failed) process.exitCode = 1;
}
`;

const NODE_EXPORTS = { functions: ['enterFrame', 'enterCall', 'leave', 'topFrame', 'fail', 'keyAt', 'say', 'readText', 'recordKind', 'setAttr', 'setField', 'newRecord', 'init', 'isEntry', 'run', 'runTests', 'newStore', 'answerStatus', 'stopWith', 'httpCall', 'toJs', 'fromJs', 'library', 'callLibrary', 'getLibrary'] };

const HEADER = `// thunder_runtime.mjs: written by the Thunder compiler next to compiled TypeScript. Standard library only.
// The values and rules here are the Thunder engine's own (engine-values.mjs), so compiled TypeScript, the Thunder
// engine, and compiled Python say the same thing for the same program.
`;

export const TS_RUNTIME = `${HEADER}\n${VALUES_SOURCE.trimEnd()}\n${STORE_SOURCE.trimEnd()}\n${NODE_PART}\n${NPM_SOURCE}`;

const isClass = (v) => typeof v === 'function' && /^class\b/.test(Function.prototype.toString.call(v));

/** Declarations for the runtime, made from its exports: every function takes and gives values of any kind. */
function declarations() {
  const L = ['// thunder_runtime.d.mts: types for thunder_runtime.mjs (written by the Thunder compiler).', '// Thunder values are checked when the program runs; to TypeScript they are of any kind.', ''];
  for (const [name, v] of Object.entries(VALUES).sort(([a], [b]) => byText(a, b))) {
    if (isClass(v)) L.push(`export declare class ${name} { constructor(...args: any[]); [key: string]: any; static [key: string]: any; }`);
    else if (typeof v === 'function') L.push(`export declare function ${name}(...args: any[]): any;`);
    else L.push(`export declare const ${name}: any;`);
  }
  for (const f of NODE_EXPORTS.functions) L.push(`export declare function ${f}(...args: any[]): any;`);
  return `${L.join('\n')}\n`;
}

export const TS_RUNTIME_DTS = declarations();
