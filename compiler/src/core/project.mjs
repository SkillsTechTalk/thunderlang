// Thunder Core projects on disk: thunder.toml, src/, tests/, generated/python/.
//
// Source ownership: in a Thunder project the .thunder files are the source. generated/ is a build artifact,
// rewritten by every build; it is never read back.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname, relative, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileCore } from './index.mjs';
import { PYTHON_RUNTIME } from './runtime-python.mjs';
import { writeTypeScript, typescriptDiagnostics } from './typescript-run.mjs';
import { writeCSharp, csharpDiagnostics } from './csharp-run.mjs';
import { writeRust, rustDiagnostics } from './rust-run.mjs';
import { writeGo, goDiagnostics } from './go-run.mjs';
import { writeJava, javaDiagnostics } from './java-run.mjs';
import { writeReact, reactDiagnostics } from './react-run.mjs';
import { hasScreens } from './target-react.mjs';
import { diag } from './diagnostics.mjs';

/** The languages a Thunder Core project can be compiled to. */
export const TARGETS = ['python', 'typescript', 'csharp', 'rust', 'go', 'java', 'react'];
/** How a target is named to people. */
export const TARGET_NAMES = { python: 'Python', typescript: 'TypeScript', csharp: 'C#', rust: 'Rust', go: 'Go', java: 'Java', react: 'React' };

export const PROJECT_FILE = 'thunder.toml';

/** A tiny TOML subset: [sections], key = "text" | number | true | false, and # comments. */
export function parseToml(text) {
  const out = {};
  let section = out;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line) return;
    const sec = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (sec) { section = out[sec[1]] ??= {}; return; }
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!kv) throw new Error(`thunder.toml, line ${i + 1}: I can't read "${raw.trim()}". Write key = "value".`);
    const v = kv[2].trim();
    section[kv[1]] = /^".*"$/.test(v) ? JSON.parse(v) : v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  });
  return out;
}

/** The nearest folder at or above `start` that holds a thunder.toml, or null. */
export function findProjectRoot(start) {
  let dir = resolve(start);
  if (existsSync(dir) && !statSync(dir).isDirectory()) dir = dirname(dir);
  for (;;) {
    if (existsSync(join(dir, PROJECT_FILE))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function loadProject(root) {
  const toml = parseToml(readFileSync(join(root, PROJECT_FILE), 'utf8'));
  const build = toml.build ?? {};
  const target = String(build.target ?? 'python');
  if (!TARGETS.includes(target)) throw new Error(`thunder.toml: target "${target}" is not supported yet. Thunder Core builds ${TARGETS.map((t) => `${TARGET_NAMES[t] ?? t} (target = "${t}")`).join(', ')}.`);
  return {
    root,
    name: toml.project?.name ?? basename(root),
    version: toml.project?.version ?? '0.1.0',
    target,
    src: build.source ?? 'src',
    tests: build.tests ?? 'tests',
    out: build.output ?? `generated/${target}`,
    entry: build.entry ?? null,
  };
}

const thunderFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.thunder')).sort().map((f) => join(dir, f)) : []);

// Python standard-library modules a generated file must not shadow (a src/csv.thunder must not become csv.py).
const STDLIB = new Set('abc argparse array ast asyncio base64 bisect calendar cmath code collections contextlib copy csv dataclasses datetime decimal difflib dis email enum fractions functools getpass glob gzip hashlib heapq hmac html http importlib inspect io ipaddress itertools json keyword linecache locale logging math mimetypes numbers operator os pathlib pickle platform pprint queue random re secrets select shutil signal site socket sqlite3 statistics string struct subprocess sys tempfile test tests textwrap this threading time timeit token tokenize traceback types typing unicodedata unittest urllib uuid warnings weakref xml zipfile zlib thunder_runtime run_tests'.split(' '));

export function moduleNameFor(file) {
  let n = basename(file, '.thunder').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^(\d)/, '_$1') || 'program';
  if (STDLIB.has(n)) n = `${n}_program`;
  return n;
}

/**
 * Compile a project (or a single file when `single` is given). Writes generated/python/<module>.py for every
 * file plus thunder_runtime.py. Returns { ok, results: [{ file, module, ok, diagnostics }], outDir, entryModule }.
 */
export function buildProject({ root, single = null, includeTests = false, write = true, config = null, target = null, refuseScreens = false }) {
  const cfg = config ?? (single && !findProjectRoot(single) ? null : loadProject(root));
  const base = cfg ? cfg.root : dirname(resolve(single));
  // --target overrides thunder.toml; a different target than the project's builds into generated/<target>.
  const tgt = target ?? cfg?.target ?? 'python';
  if (!TARGETS.includes(tgt)) throw new Error(`there is no target "${tgt}". Thunder Core builds ${TARGETS.join(', ')} (python is the default).`);
  const srcFiles = cfg ? thunderFiles(join(cfg.root, cfg.src)) : [];
  if (single && !srcFiles.includes(resolve(single))) srcFiles.unshift(resolve(single));
  const testFiles = includeTests && cfg ? thunderFiles(join(cfg.root, cfg.tests)) : [];
  const outDir = join(base, cfg && (target == null || target === cfg.target) ? cfg.out : `generated/${tgt}`);
  const results = [];
  const used = new Set();
  const uniqueModule = (f, prefix = '') => { let n = prefix + moduleNameFor(f); let k = 2; while (used.has(n)) n = `${prefix}${moduleNameFor(f)}_${k++}`; used.add(n); return n; };
  for (const f of srcFiles) {
    const rel = relative(base, f).split('\\').join('/');
    const r = compileCore(readFileSync(f, 'utf8'), { file: rel });
    results.push({ ...r, path: f, rel, module: uniqueModule(f), kind: 'src' });
  }
  const srcOk = results.filter((r) => r.ok);
  for (const f of testFiles) {
    const rel = relative(base, f).split('\\').join('/');
    const r = compileCore(readFileSync(f, 'utf8'), { file: rel, imported: srcOk, srcModules: srcOk.map((x) => x.module) });
    results.push({ ...r, path: f, rel, module: uniqueModule(f, 'tests_'), kind: 'test' });
  }
  // A Python module (Use) cannot be compiled to TypeScript: refuse it before anything is written (TC405).
  if (tgt === 'typescript') for (const r of results.filter((x) => x.ok)) { const d = typescriptDiagnostics(r); if (d.length) { r.diagnostics = [...r.diagnostics, ...d]; r.ok = false; } }
  if (tgt === 'csharp') for (const r of results.filter((x) => x.ok)) { const d = csharpDiagnostics(r); if (d.length) { r.diagnostics = [...r.diagnostics, ...d]; r.ok = false; } }
  if (tgt === 'rust') for (const r of results.filter((x) => x.ok)) { const d = rustDiagnostics(r); if (d.length) { r.diagnostics = [...r.diagnostics, ...d]; r.ok = false; } }
  if (tgt === 'go') for (const r of results.filter((x) => x.ok)) { const d = goDiagnostics(r); if (d.length) { r.diagnostics = [...r.diagnostics, ...d]; r.ok = false; } }
  // The same for Java: Python modules exist only for the Python target.
  if (tgt === 'java') for (const r of results.filter((x) => x.ok)) { const d = javaDiagnostics(r); if (d.length) { r.diagnostics = [...r.diagnostics, ...d]; r.ok = false; } }
  const entryPath = single ? resolve(single) : cfg?.entry ? join(cfg.root, cfg.entry) : join(base, cfg?.src ?? '.', 'main.thunder');
  const entry = results.find((r) => r.path === entryPath) ?? results.find((r) => r.kind === 'src');
  // Screens are built for React; building one for another target would leave them out, so it is refused (TC406).
  if (tgt === 'react') for (const r of results.filter((x) => x.ok && x.kind !== 'test')) { const d = reactDiagnostics(r, { entry: r === entry }); if (d.length) { r.diagnostics = [...r.diagnostics, ...d]; r.ok = false; } }
  else if (refuseScreens) for (const r of results.filter((x) => x.ok && hasScreens(x.info))) {
    r.diagnostics = [...r.diagnostics, diag('TC406', r.info.screens[0].line, `"${r.info.screens[0].text}" is a screen, and screens are built as a React app, not for ${TARGET_NAMES[tgt]}.`, 'Build it with: thunder build --target react. thunder run shows the screen as an outline.')];
    r.ok = false;
  }
  const ok = results.every((r) => r.ok);
  if (ok && write && tgt === 'typescript') writeTypeScript(results, outDir);
  if (ok && write && tgt === 'react') writeReact(results, outDir, { entry });
  if (ok && write && tgt === 'java') writeJava(results, outDir);
  if (ok && write && tgt === 'python') {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'thunder_runtime.py'), PYTHON_RUNTIME);
    for (const r of results) writeFileSync(join(outDir, `${r.module}.py`), r.python);
    writeFileSync(join(outDir, 'run_tests.py'), [
      '# Generated by the Thunder compiler: runs every Test block in this project. Run with: python3 run_tests.py',
      'import thunder_runtime',
      ...results.map((r) => `import ${r.module}`),
      '',
      `thunder_runtime.run_tests([${results.map((r) => r.module).join(', ')}])`,
      '',
    ].join('\n'));
  }
  if (ok && write && tgt === 'csharp') writeCSharp(results, outDir, { entry });
  if (ok && write && tgt === 'rust') writeRust(results, outDir, { entryModule: entry?.module ?? null });
  if (ok && write && tgt === 'go') writeGo(results, outDir, { entry: entry?.module ?? null });
  return { ok, results, outDir, base, entryModule: entry?.module ?? null, entry, config: cfg, target: tgt };
}

/** The local Python 3.10+: $THUNDER_PYTHON, then python3, then python. Returns { cmd, version } or { error }. */
export function findPython() {
  const candidates = [process.env.THUNDER_PYTHON, 'python3', 'python'].filter(Boolean);
  for (const cmd of candidates) {
    const r = spawnSync(cmd, ['-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], { encoding: 'utf8' });
    if (r.status !== 0 || !r.stdout) continue;
    const [maj, min] = r.stdout.trim().split('.').map(Number);
    if (maj > 3 || (maj === 3 && min >= 10)) return { cmd, version: r.stdout.trim() };
    return { error: `Thunder needs Python 3.10 or newer, but "${cmd}" is Python ${r.stdout.trim()}. Install a newer Python from https://www.python.org/downloads/ or set THUNDER_PYTHON to its path.` };
  }
  return { error: 'Thunder needs Python 3.10 or newer to run this program, and I could not find it (tried THUNDER_PYTHON, python3, python). Install it from https://www.python.org/downloads/ or set THUNDER_PYTHON to its path. "thunder build" still works without Python.' };
}

export function runPython(python, outDir, script, cwd) {
  return spawnSync(python.cmd, [join(outDir, script)], { cwd, stdio: 'inherit', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' } });
}

export function newProject(dir, { force = false } = {}) {
  const root = resolve(dir);
  if (existsSync(join(root, PROJECT_FILE)) && !force) throw new Error(`${join(dir, PROJECT_FILE)} already exists (use --force to overwrite).`);
  const name = basename(root);
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'tests'), { recursive: true });
  writeFileSync(join(root, PROJECT_FILE), `# A Thunder project. The .thunder files in src/ are the source; generated/ is rebuilt from them.
[project]
name = "${name}"
version = "0.1.0"

[build]
target = "python"
source = "src"
tests = "tests"
output = "generated/python"
entry = "src/main.thunder"
`);
  writeFileSync(join(root, 'src', 'main.thunder'), `# Your first Thunder program. Run it with: thunder run

To greet:
  Receive name
  Give "Hello, {name}!"

say greet with "world"
`);
  writeFileSync(join(root, 'tests', 'greet.thunder'), `# Tests see everything in src/. Run them with: thunder test

Test "greet says hello":
  Expect greet with "Ada" to be "Hello, Ada!"
`);
  writeFileSync(join(root, '.gitignore'), 'generated/\n');
  return root;
}

export function cleanOutput(outDir) { if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true }); }
