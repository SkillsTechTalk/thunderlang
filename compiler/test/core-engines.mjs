// Run a Thunder Core program every way it can run: compiled to Python, on the Thunder engine (src/core/engine.mjs), compiled to
// TypeScript (src/core/target-typescript.mjs), and compiled to C#, Rust, and Go (src/core/target-csharp.mjs,
// target-rust.mjs, target-go.mjs), and require the same output, the same error, and the same exit status from all of
// them. C# builds are slow, so every C# program a test file runs is collected and built once, together, by the file's
// last test (csharpAgrees); a difference fails it. Each compiled leg is skipped only when its toolchain is missing. Used by every test
// that runs Core programs (core-run, core-stdlib, core-engine), so each program they run is also a conformance
// check. A program that uses a Python module ("Use") is refused by the Thunder engine: that is the one intended
// difference, and it is checked here too.
//
// Not a test file itself (no .test.mjs): it is imported by them.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileCore, PYTHON_RUNTIME } from '../src/core/index.mjs';
import { findPython } from '../src/core/project.mjs';
import { runWithEngine, testWithEngine, pythonModulesUsed } from '../src/core/engine.mjs';
import { writeTypeScript, runTypeScript, typescriptRunner, typecheckTypeScript, typescriptDiagnostics } from '../src/core/typescript-run.mjs';
import { writeCSharpBatch, buildCSharp, runBuiltCSharp, findDotnet, csharpDiagnostics } from '../src/core/csharp-run.mjs';
import { writeRust, runRustFast, rustToolchain, rustDiagnostics } from '../src/core/rust-run.mjs';

/** Whether compiled Rust can be built here (rustc), or why not. */
export const RS = rustToolchain();
import { writeGo, runGo, goToolchain, goDiagnostics } from '../src/core/go-run.mjs';

/** The go toolchain here, or why compiled Go can't run (then the Go leg is skipped). */
export const GO = goToolchain();

/** How compiled TypeScript runs here (Node's own type stripping, or the typescript package), or why it can't. */
export const TS = typescriptRunner();
/** Typecheck every compiled TypeScript program with tsc --strict (slow: on when THUNDER_TSC=1, or in the TypeScript test). */
export const tscEvery = { on: process.env.THUNDER_TSC === '1' };

export const PY = findPython();
/** The .NET SDK compiled C# is built with, or why not (THUNDER_CSHARP=0 turns the C# leg off). */
export const CS = process.env.THUNDER_CSHARP === '0' ? { error: 'THUNDER_CSHARP=0' } : findDotnet();
const tmp = mkdtempSync(join(tmpdir(), 'thunder-engines-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
if (process.env.THUNDER_TALLY) process.on('exit', () => { if (tally.rust) console.log(`# compiled Rust: ${tally.rust} programs gave the same result as the Thunder engine`); });
let n = 0;

/** Programs compared on both engines in this test file, and programs the Thunder engine refused (Use). */
export const tally = { compared: 0, refused: 0, typescript: 0, typechecked: 0, csharp: 0, rust: 0, go: 0 };

const newDir = () => { const d = join(tmp, `p${n++}`); mkdirSync(d, { recursive: true }); return d; };
const trim = (r) => ({ out: r.stdout.trim(), err: r.stderr.trim(), status: r.status });

/** Run compiled results (one program, or a project's files for tests) with Python, the way thunder run/test do. */
export function runPython(results, { tests = false, entry = results[0], cwd = null, dir = newDir() } = {}) {
  writeFileSync(join(dir, 'thunder_runtime.py'), PYTHON_RUNTIME);
  for (const r of results) writeFileSync(join(dir, `${r.module ?? 'main'}.py`), r.python);
  writeFileSync(join(dir, 'run_tests.py'), `import thunder_runtime\n${results.map((r) => `import ${r.module ?? 'main'}`).join('\n')}\nthunder_runtime.run_tests([${results.map((r) => r.module ?? 'main').join(', ')}])\n`);
  const script = tests ? join(dir, 'run_tests.py') : join(dir, `${entry.module ?? 'main'}.py`);
  return spawnSync(PY.cmd, [script], { cwd: cwd ?? dir, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' } });
}

/**
 * Run compiled results on both engines and require the same result. Gives back the result ({ out, err, status },
 * trimmed) from Python, or from the Thunder engine when Python is missing.
 */
export function bothEngines(results, { tests = false, entry = results[0], cwd = null, label = '' } = {}) {
  const dir = newDir();
  const where = cwd ?? dir; // both engines run in the same folder (read file looks there)
  const eng = tests ? testWithEngine({ results, cwd: where }) : runWithEngine({ entry, cwd: where });
  const uses = pythonModulesUsed(tests ? results : [entry]);
  if (uses.length) {
    assert.equal(eng.status, 2, `${label}: the Thunder engine must refuse a program that uses Python modules`);
    assert.match(eng.stderr, new RegExp(`uses the Python module "${uses[0].module.replace(/\./g, '\\.')}"`));
    // Compiled TypeScript refuses it too, when it is built (TC405): Python modules exist only for the Python target.
    for (const r of tests ? results : [entry]) if (pythonModulesUsed([r]).length) assert.equal(typescriptDiagnostics(r)[0]?.code, 'TC405', `${label}: TypeScript must refuse Use`);
    for (const r of tests ? results : [entry]) if (pythonModulesUsed([r]).length) assert.equal(csharpDiagnostics(r)[0]?.code, 'TC405', `${label}: C# must refuse Use`);
    for (const r of tests ? results : [entry]) if (pythonModulesUsed([r]).length) assert.equal(rustDiagnostics(r)[0]?.code, 'TC405', `${label}: Rust must refuse Use`);
    for (const r of tests ? results : [entry]) if (pythonModulesUsed([r]).length) assert.equal(goDiagnostics(r)[0]?.code, 'TC405', `${label}: Go must refuse Use`);
    tally.refused++;
    return PY.error ? trim(eng) : trim(runPython(results, { tests, entry, cwd: where, dir }));
  }
  const ts = runCompiledTypeScript(results, { tests, entry, cwd: where, dir, label });
  if (ts) assert.deepEqual(ts, trim(eng), `${label}\nCompiled TypeScript and the Thunder engine disagree on this program.`);
  queueCSharp(results, { tests, entry, cwd: where, label, expected: trim(eng) });
  const rust = runCompiledRust(results, { tests, entry, cwd: where, dir, label });
  if (rust) assert.deepEqual(rust, trim(eng), `${label}\nCompiled Rust and the Thunder engine disagree on this program.`);
  const go = runCompiledGo(results, { tests, entry, cwd: where, dir, label });
  if (go) assert.deepEqual(go, trim(eng), `${label}\nCompiled Go and the Thunder engine disagree on this program.`);
  if (PY.error) return trim(eng);
  const py = trim(runPython(results, { tests, entry, cwd: where, dir }));
  assert.deepEqual(trim(eng), py, `${label}\nThe Thunder engine and Python disagree on this program.`);
  tally.compared++;
  return py;
}

/** Compile results to TypeScript and run them (or their tests); null when TypeScript can't run here. */
export function runCompiledTypeScript(results, { tests = false, entry = results[0], cwd = null, dir = newDir(), label = '' } = {}) {
  if (TS.error) return null;
  const withKind = results.map((r) => ({ ...r, module: r.module ?? 'main', kind: r.kind ?? 'src' }));
  for (const r of withKind) assert.deepEqual(typescriptDiagnostics(r), [], `${label}: a program for TypeScript must not use Python modules`);
  const out = join(dir, 'ts');
  writeTypeScript(withKind, out);
  if (tscEvery.on) {
    const tc = typecheckTypeScript(out);
    if (!tc.skipped) { assert.ok(tc.ok, `${label}\ntsc --strict rejects the generated TypeScript:\n${tc.output}`); tally.typechecked++; }
  }
  const main = withKind.find((r) => r.file === entry.file && r.module === (entry.module ?? 'main')) ?? withKind[0];
  const r = runTypeScript(out, tests ? 'run_tests.ts' : `${main.module}.ts`, { cwd: cwd ?? dir });
  tally.typescript++;
  return trim(r);
}

/** Compile results to Rust and run them (or their tests); null when Rust can't be built here. */
export function runCompiledRust(results, { tests = false, entry = results[0], cwd = null, dir = newDir(), label = '' } = {}) {
  if (RS.error) return null;
  const withKind = results.map((r) => ({ ...r, module: r.module ?? 'main', kind: r.kind ?? 'src' }));
  for (const r of withKind) assert.deepEqual(rustDiagnostics(r), [], `${label}: a program for Rust must not use Python modules`);
  const out = join(dir, 'rs');
  const main = withKind.find((r) => r.file === entry.file && r.module === (entry.module ?? 'main')) ?? withKind[0];
  writeRust(withKind, out, { entryModule: main.module });
  const r = runRustFast(out, { tests, cwd: cwd ?? dir });
  assert.ok(!/^The generated Rust did not build/.test(r.stderr ?? ''), `${label}\n${r.stderr}`);
  tally.rust++;
  return trim(r);
}

/** Compile results to Go and run them (or their tests); null when Go can't run here. */
export function runCompiledGo(results, { tests = false, entry = results[0], cwd = null, dir = newDir(), label = '' } = {}) {
  if (GO.error) return null;
  const withKind = results.map((r) => ({ ...r, module: r.module ?? 'main', kind: r.kind ?? 'src' }));
  for (const r of withKind) assert.deepEqual(goDiagnostics(r), [], `${label}: a program for Go must not use Python modules`);
  const out = join(dir, 'go');
  const main = withKind.find((r) => r.file === entry.file && r.module === (entry.module ?? 'main')) ?? withKind[0];
  writeGo(withKind, out, { entry: main.module });
  const r = runGo(out, { tests, cwd: cwd ?? dir });
  assert.ok(!r.buildFailed, `${label}\n${r.stderr}`);
  tally.go++;
  return trim(r);
}

/** Compile one Core source and run it on both engines. */
export function runBoth(source, { tests = false, file = 'main.thunder', cwd = null } = {}) {
  const r = compileCore(source, { file });
  assert.deepEqual(r.diagnostics, [], JSON.stringify(r.diagnostics));
  return bothEngines([{ ...r, module: 'main' }], { tests, cwd, label: source });
}

// ── The C# leg: collected while the tests run, built once, compared after them ─────────────────────────────────────
const csQueue = [];

/** Queue a program (or its tests) for compiled C#; `expected` is what the Thunder engine gave. */
export function queueCSharp(results, { tests = false, entry = results[0], cwd = null, label = '', expected }) {
  if (CS.error) return;
  const withKind = results.map((r) => ({ ...r, module: r.module ?? 'main', kind: r.kind ?? 'src' }));
  for (const r of withKind) assert.deepEqual(csharpDiagnostics(r), [], `${label}: a program for C# must not use Python modules`);
  const main = withKind.find((r) => r.file === entry.file && r.module === (entry.module ?? 'main')) ?? withKind[0];
  // The folder the program runs in may be gone by the time the C# runs (a test cleans up): keep a copy.
  let where = null;
  if (cwd) { where = join(tmp, `cwd${n++}`); cpSync(cwd, where, { recursive: true }); }
  csQueue.push({ results: withKind, entry: main, tests, cwd: where, label, expected });
}

/** Build every queued program in one .NET project, run each, and require the engine's result from each. */
export function flushCSharp() {
  if (!csQueue.length) return;
  const items = csQueue.splice(0);
  const dir = join(tmp, `cs${n++}`);
  writeCSharpBatch(items.map((it) => ({ results: it.results, entry: it.tests ? null : it.entry })), dir);
  const b = buildCSharp(dir, { dotnet: CS });
  assert.ok(b.ok, `The compiled C# for ${items.length} programs did not build:\n${b.output.split('\n').slice(0, 40).join('\n')}`);
  const wrong = [];
  items.forEach((it, i) => {
    const run = runBuiltCSharp(dir, [String(i), ...(it.tests ? ['test'] : [])], { cwd: it.cwd ?? dir, dotnet: CS });
    if (run.error) { wrong.push(`${it.label}\n  C# could not run: ${run.error.message}`); return; }
    const r = trim(run);
    tally.csharp++;
    try { assert.deepEqual(r, it.expected); }
    catch { wrong.push(`${it.label}\n  C#:     ${JSON.stringify(r)}\n  engine: ${JSON.stringify(it.expected)}`); }
  });
  assert.equal(wrong.length, 0, `Compiled C# and the Thunder engine disagree on ${wrong.length} of ${items.length} programs:\n\n${wrong.slice(0, 15).join('\n\n')}`);
}

/** The last test of a file that runs Core programs: compiled C# gave the engine's result for every one of them. */
export function csharpAgrees(test) {
  test('compiled C# gives the same result as the other engines for every program above', { skip: CS.error ? `no C# here: ${CS.error.split('.')[0]}` : false }, () => {
    flushCSharp();
    if (process.env.THUNDER_TALLY) console.log(`# compiled C#: ${tally.csharp} programs matched the Thunder engine`);
  });
}
