// thunder_runtime.mjs, the runtime compiled TypeScript uses, and its declarations (thunder_runtime.d.mts).
//
// One meaning of Thunder: the runtime is engine-values.mjs, byte for byte (the same values, rules, and messages the
// Thunder engine uses), followed by a small Node part: call frames for error lines, output, reading files, and
// running the program or its tests. compiler/test/core-engines.mjs runs every Core test program on Python, the
// Thunder engine, and compiled TypeScript, and requires the same output from all three.
import { readFileSync } from 'node:fs';
import * as VALUES from './engine-values.mjs';

const VALUES_SOURCE = readFileSync(new URL('./engine-values.mjs', import.meta.url), 'utf8');
// npm packages (Use "<package>" from npm): the boundary between Thunder values and JavaScript values. Its import
// line is dropped: in thunder_runtime.mjs the names it uses are the runtime's own.
const NPM_SOURCE = readFileSync(new URL('./runtime-npm.mjs', import.meta.url), 'utf8').replace(/^import [^\n]*\n/m, '');

/** The Node part: everything here is about running, not about what a value means. */
const NODE_PART = `
// ── Running compiled TypeScript: frames (for error lines), output, files, and the program or its tests ───────────
import { readFileSync as nodeReadFile, realpathSync as nodeRealpath } from 'node:fs';
import { resolve as nodeResolve } from 'node:path';

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
export function run(main) { if (aborted) return; try { main(); } catch (e) { report(e); } }
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

const NODE_EXPORTS = { functions: ['enterFrame', 'enterCall', 'leave', 'topFrame', 'fail', 'keyAt', 'say', 'readText', 'recordKind', 'setAttr', 'setField', 'newRecord', 'init', 'isEntry', 'run', 'runTests', 'toJs', 'fromJs', 'library', 'callLibrary', 'getLibrary'] };

const HEADER = `// thunder_runtime.mjs: written by the Thunder compiler next to compiled TypeScript. Standard library only.
// The values and rules here are the Thunder engine's own (engine-values.mjs), so compiled TypeScript, the Thunder
// engine, and compiled Python say the same thing for the same program.
`;

export const TS_RUNTIME = `${HEADER}\n${VALUES_SOURCE.trimEnd()}\n${NODE_PART}\n${NPM_SOURCE}`;

const isClass = (v) => typeof v === 'function' && /^class\b/.test(Function.prototype.toString.call(v));

/** Declarations for the runtime, made from its exports: every function takes and gives values of any kind. */
function declarations() {
  const L = ['// thunder_runtime.d.mts: types for thunder_runtime.mjs (written by the Thunder compiler).', '// Thunder values are checked when the program runs; to TypeScript they are of any kind.', ''];
  for (const [name, v] of Object.entries(VALUES).sort(([a], [b]) => a.localeCompare(b))) {
    if (isClass(v)) L.push(`export declare class ${name} { constructor(...args: any[]); [key: string]: any; static [key: string]: any; }`);
    else if (typeof v === 'function') L.push(`export declare function ${name}(...args: any[]): any;`);
    else L.push(`export declare const ${name}: any;`);
  }
  for (const f of NODE_EXPORTS.functions) L.push(`export declare function ${f}(...args: any[]): any;`);
  return `${L.join('\n')}\n`;
}

export const TS_RUNTIME_DTS = declarations();
