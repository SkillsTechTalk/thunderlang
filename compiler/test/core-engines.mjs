// Run a Thunder Core program on BOTH engines, Python (the compiled program) and the Thunder engine
// (src/core/engine.mjs), and require the same output, the same error, and the same exit status. Used by every test
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

export const PY = findPython();
const tmp = mkdtempSync(join(tmpdir(), 'thunder-engines-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
let n = 0;

/** Programs compared on both engines in this test file, and programs the Thunder engine refused (Use). */
export const tally = { compared: 0, refused: 0 };

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
    tally.refused++;
    return PY.error ? trim(eng) : trim(runPython(results, { tests, entry, cwd: where, dir }));
  }
  if (PY.error) return trim(eng);
  const py = trim(runPython(results, { tests, entry, cwd: where, dir }));
  assert.deepEqual(trim(eng), py, `${label}\nThe Thunder engine and Python disagree on this program.`);
  tally.compared++;
  return py;
}

/** Compile one Core source and run it on both engines. */
export function runBoth(source, { tests = false, file = 'main.thunder', cwd = null } = {}) {
  const r = compileCore(source, { file });
  assert.deepEqual(r.diagnostics, [], JSON.stringify(r.diagnostics));
  return bothEngines([{ ...r, module: 'main' }], { tests, cwd, label: source });
}
