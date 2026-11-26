// Run a Thunder Core program three ways: compiled to Python, on the Thunder engine (src/core/engine.mjs), and
// compiled to TypeScript (src/core/target-typescript.mjs), and require the same output, the same error, and the same
// exit status from all three. Used by every test
// that runs Core programs (core-run, core-stdlib, core-engine), so each program they run is also a conformance
// check. A program that uses a Python module ("Use") is refused by the Thunder engine: that is the one intended
// difference, and it is checked here too.
//
// Not a test file itself (no .test.mjs): it is imported by them.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileCore, PYTHON_RUNTIME } from '../src/core/index.mjs';
import { findPython } from '../src/core/project.mjs';
import { runWithEngine, testWithEngine, pythonModulesUsed } from '../src/core/engine.mjs';
import { writeTypeScript, runTypeScript, typescriptRunner, typecheckTypeScript, typescriptDiagnostics } from '../src/core/typescript-run.mjs';

/** How compiled TypeScript runs here (Node's own type stripping, or the typescript package), or why it can't. */
export const TS = typescriptRunner();
/** Typecheck every compiled TypeScript program with tsc --strict (slow: on when THUNDER_TSC=1, or in the TypeScript test). */
export const tscEvery = { on: process.env.THUNDER_TSC === '1' };

export const PY = findPython();
const tmp = mkdtempSync(join(tmpdir(), 'thunder-engines-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
let n = 0;

/** Programs compared on both engines in this test file, and programs the Thunder engine refused (Use). */
export const tally = { compared: 0, refused: 0, typescript: 0, typechecked: 0 };

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
    tally.refused++;
    return PY.error ? trim(eng) : trim(runPython(results, { tests, entry, cwd: where, dir }));
  }
  const ts = runCompiledTypeScript(results, { tests, entry, cwd: where, dir, label });
  if (ts) assert.deepEqual(ts, trim(eng), `${label}\nCompiled TypeScript and the Thunder engine disagree on this program.`);
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

/** Compile one Core source and run it on both engines. */
export function runBoth(source, { tests = false, file = 'main.thunder', cwd = null } = {}) {
  const r = compileCore(source, { file });
  assert.deepEqual(r.diagnostics, [], JSON.stringify(r.diagnostics));
  return bothEngines([{ ...r, module: 'main' }], { tests, cwd, label: source });
}
