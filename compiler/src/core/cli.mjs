// The Thunder Core commands: thunder new | run | build | test | check | format.
//
// When does a command mean Thunder Core (and not a mission .thunder file)? Deterministically, never by guessing
// from the file's contents:
//   - thunder new <dir>                       always creates a Thunder Core project (missions: thunder init <Name>)
//   - no file given, and a thunder.toml is in this folder or above it
//   - the file is a folder that holds a thunder.toml, or a .thunder file under one
//   - --core is given (a single file with no project)
// Everything else falls through to the mission commands, unchanged.

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { findProjectRoot, buildProject, findPython, runPython, newProject, TARGETS } from './project.mjs';
import { runTypeScript } from './typescript-run.mjs';
import { runGo } from './go-run.mjs';
import { formatDiagnostic } from './diagnostics.mjs';
import { formatCore } from './format.mjs';
import { paint } from '../term.mjs';
import { runWithEngine, testWithEngine, ENGINES } from './engine.mjs';

const CORE_COMMANDS = new Set(['new', 'run', 'build', 'test', 'check', 'format', 'fmt']);

function parse(argv) {
  const a = { _: [], core: false, json: false, write: false, check: false, force: false, mission: false, engine: null, target: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--target') a.target = argv[++i] ?? '';
    else if (x.startsWith('--target=')) a.target = x.slice('--target='.length);
    else if (x === '--engine') a.engine = argv[++i] ?? '';
    else if (x.startsWith('--engine=')) a.engine = x.slice('--engine='.length);
    else if (x === '--core') a.core = true;
    else if (x === '--json') a.json = true;
    else if (x === '--write' || x === '-w') a.write = true;
    else if (x === '--check') a.check = true;
    else if (x === '--force') a.force = true;
    else if (x === '--mission') a.mission = true;
    else if (x === '--run') a.run = true;
    else if (x.startsWith('--')) a.other = true;
    else a._.push(x);
  }
  return a;
}

/** Decide whether this invocation is a Thunder Core one: { root, file } or null. */
export function coreTarget(cmd, argv, cwd = process.cwd()) {
  if (!CORE_COMMANDS.has(cmd)) return null;
  const a = parse(argv);
  if (cmd === 'new') return a.mission || a._.length === 0 || a.other ? null : { new: a._[0] };
  const file = a._[0];
  if (!file) { const root = findProjectRoot(cwd); return root && !a.other ? { root, file: null } : null; }
  const p = resolve(cwd, file);
  if (existsSync(p) && statSync(p).isDirectory()) { const root = existsSync(join(p, 'thunder.toml')) ? p : null; return root ? { root, file: null } : null; }
  if (!file.endsWith('.thunder')) return null;
  const root = findProjectRoot(p);
  if (root || a.core) return { root, file: p };
  return null;
}

const say = (s = '') => process.stdout.write(`${paint(s)}\n`);
const warn = (s = '') => process.stderr.write(`${s}\n`);

function report(build, cwd) {
  let n = 0;
  for (const r of build.results) for (const d of r.diagnostics) { warn(formatDiagnostic(d, relative(cwd, r.path) || r.rel)); n++; }
  return n;
}

/** Run a Thunder Core command. Returns the process exit code, or null when it is not a Core invocation. */
export function coreMain(cmd, argv, cwd = process.cwd()) {
  const t = coreTarget(cmd, argv, cwd);
  if (!t) return null;
  const a = parse(argv);
  try {
    if (cmd === 'new') {
      const root = newProject(resolve(cwd, t.new), { force: a.force });
      const rel = relative(cwd, root) || '.';
      say(`Created ${rel}, a new Thunder program.`);
      say('');
      say('Run it:');
      say(`  thunder run ${rel}`);
      say('');
      say(`Then change ${join(rel, 'src', 'main.thunder')} and run it again. Check it works with: thunder test ${rel}`);
      say(`(Wanted a mission file instead? thunder init ${t.new})`);
      if (!a.run) return 0;
      say('');
      return coreMain('run', [root], cwd);
    }
    if (cmd === 'format' || cmd === 'fmt') return format(t, a, cwd);
    if (a.engine !== null && !ENGINES.includes(a.engine)) { warn(`thunder ${cmd}: there is no engine "${a.engine}". Use --engine python (the default) or --engine thunder.`); return 2; }
    if (a.engine !== null && cmd !== 'run' && cmd !== 'test') { warn(`thunder ${cmd}: --engine is for thunder run and thunder test.`); return 2; }
    if (a.target !== null && !TARGETS.includes(a.target)) { warn(`thunder ${cmd}: there is no target "${a.target}". Use --target python (the default), --target typescript, or --target go.`); return 2; }
    if (a.target !== null && a.target !== 'python' && a.engine === 'thunder') { warn(`thunder ${cmd}: choose one: --target ${a.target} runs compiled ${a.target === 'go' ? 'Go' : 'TypeScript'}, --engine thunder runs Thunder directly.`); return 2; }
    const build = buildProject({ root: t.root, single: t.file, includeTests: cmd === 'test' || cmd === 'check', write: cmd !== 'check', target: a.target });
    if (cmd === 'check') {
      if (a.json) { say(JSON.stringify({ ok: build.ok, files: build.results.map((r) => ({ file: relative(cwd, r.path), diagnostics: r.diagnostics })) }, null, 2)); return build.ok ? 0 : 1; }
      const n = report(build, cwd);
      if (n) { warn(`thunder check: ${n} problem${n === 1 ? '' : 's'} in ${build.results.filter((r) => !r.ok).length} of ${build.results.length} file${build.results.length === 1 ? '' : 's'}.`); return 1; }
      say(`thunder check: no problems in ${build.results.length} Thunder Core file${build.results.length === 1 ? '' : 's'}.`);
      return 0;
    }
    if (!build.ok) { const n = report(build, cwd); warn(`thunder ${cmd}: ${n} problem${n === 1 ? '' : 's'}; nothing was ${cmd === 'build' ? 'built' : 'run'}.`); return 1; }
    const out = relative(cwd, build.outDir) || '.';
    if (cmd === 'build' && build.target === 'typescript') {
      say(`thunder build: ${build.results.length} file${build.results.length === 1 ? '' : 's'} -> ${out}/ (TypeScript)`);
      for (const r of build.results) say(`  ${relative(cwd, r.path)}  ->  ${out}/${r.module}.ts`);
      say(`  ${out}/thunder_runtime.mjs (the small runtime the generated code uses), with its types and a tsconfig.json`);
      say(`  run it without Thunder: node ${out}/${build.entryModule}.ts   (Node 22.6 or newer; check the types with: tsc -p ${out})`);
      return 0;
    }
    if (cmd === 'build' && build.target === 'go') {
      say(`thunder build: ${build.results.length} file${build.results.length === 1 ? '' : 's'} -> ${out}/ (Go)`);
      for (const r of build.results) say(`  ${relative(cwd, r.path)}  ->  ${out}/${r.module}.go`);
      say(`  ${out}/thunder/thunder_runtime.go (the small runtime the generated code uses), with go.mod`);
      say(`  run it without Thunder: cd ${out} && go run .   (Go 1.21 or newer; its tests: go run -tags thundertests .)`);
      return 0;
    }
    if (cmd === 'build') {
      say(`thunder build: ${build.results.length} file${build.results.length === 1 ? '' : 's'} -> ${out}/ (Python 3.10+)`);
      for (const r of build.results) say(`  ${relative(cwd, r.path)}  ->  ${out}/${r.module}.py`);
      say(`  ${out}/thunder_runtime.py (the small runtime the generated code uses)`);
      say(`  run it without Thunder: cd ${build.base === cwd ? '.' : relative(cwd, build.base)} && python3 ${relative(build.base, build.outDir)}/${build.entryModule}.py`);
      return 0;
    }
    if (a.engine === 'thunder') return runOnEngine(cmd, build, warn, say);
    if (build.target === 'typescript') return runCompiledTypeScript(cmd, build, warn, say);
    if (build.target === 'go') return runCompiledGo(cmd, build, warn, say);
    const python = findPython();
    if (python.error) { warn(`thunder ${cmd}: ${python.error}${['run', 'test'].includes(cmd) ? `\nOr run it without Python, on the Thunder engine: thunder ${cmd} ${argv.filter((x) => !x.startsWith('--engine')).join(' ')}${argv.length ? ' ' : ''}--engine thunder`.replace(/  +/g, ' ') : ''}`); return 2; }
    if (cmd === 'run') {
      if (!build.entryModule) { warn('thunder run: there is no program to run (no .thunder files in src/).'); return 1; }
      const r = runPython(python, build.outDir, `${build.entryModule}.py`, build.base);
      return r.status ?? 1;
    }
    if (cmd === 'test') {
      const tests = build.results.reduce((n, r) => n + r.info.tests.length, 0);
      if (!tests) { say('thunder test: no Test blocks found. Write one: Test "what it checks": then Expect … lines.'); return 0; }
      const r = runPython(python, build.outDir, 'run_tests.py', build.base);
      return r.status ?? 1;
    }
  } catch (e) {
    warn(`thunder ${cmd}: ${e.message}`);
    return 2;
  }
  return null;
}

/** thunder run / test with the TypeScript target: the compiled TypeScript runs on Node. */
function runCompiledTypeScript(cmd, build, warn, say) {
  if (cmd === 'run' && !build.entryModule) { warn('thunder run: there is no program to run (no .thunder files in src/).'); return 1; }
  if (cmd === 'test' && !build.results.reduce((n, r) => n + r.info.tests.length, 0)) { say('thunder test: no Test blocks found. Write one: Test "what it checks": then Expect … lines.'); return 0; }
  const r = runTypeScript(build.outDir, cmd === 'run' ? `${build.entryModule}.ts` : 'run_tests.ts', { cwd: build.base, stdio: 'inherit' });
  if (r.error && typeof r.error === 'string') { warn(`thunder ${cmd}: ${r.error}`); return 2; }
  return r.status ?? 1;
}

/** thunder run / test with the Go target: the compiled Go is built and run with the go toolchain. */
function runCompiledGo(cmd, build, warn, say) {
  if (cmd === 'run' && !build.entryModule) { warn('thunder run: there is no program to run (no .thunder files in src/).'); return 1; }
  if (cmd === 'test' && !build.results.reduce((n, r) => n + r.info.tests.length, 0)) { say('thunder test: no Test blocks found. Write one: Test "what it checks": then Expect … lines.'); return 0; }
  const r = runGo(build.outDir, { tests: cmd === 'test', cwd: build.base, stdio: 'inherit' });
  if (r.error && typeof r.error === 'string') { warn(`thunder ${cmd}: ${r.error}`); return 2; }
  if (r.buildFailed) { warn(`thunder ${cmd}: ${r.stderr}`); return 2; }
  return r.status ?? 1;
}

/** thunder run / test --engine thunder: the program runs on the Thunder engine, with no Python. */
function runOnEngine(cmd, build, warn, say) {
  if (cmd === 'run') {
    if (!build.entry) { warn('thunder run: there is no program to run (no .thunder files in src/).'); return 1; }
    const r = runWithEngine({ entry: build.entry, cwd: build.base });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr.startsWith('This program uses') ? `thunder run: ${r.stderr}` : r.stderr);
    return r.status;
  }
  const tests = build.results.reduce((n, r) => n + r.info.tests.length, 0);
  if (!tests) { say('thunder test: no Test blocks found. Write one: Test "what it checks": then Expect … lines.'); return 0; }
  const r = testWithEngine({ results: build.results, cwd: build.base });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(`thunder test: ${r.stderr}`);
  return r.status;
}

function format(t, a, cwd) {
  let files = [];
  if (t.file) files = [t.file];
  else {
    const b = buildProject({ root: t.root, includeTests: true, write: false });
    files = b.results.map((r) => r.path);
  }
  let changed = 0;
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const out = formatCore(src);
    if (out === src) continue;
    changed++;
    if (a.write) { writeFileSync(f, out); say(`formatted ${relative(cwd, f)}`); }
    else if (a.check) warn(`would format ${relative(cwd, f)}`);
    else process.stdout.write(out);
  }
  if (a.check) return changed ? 1 : 0;
  if (a.write && !changed) say('thunder format: nothing to change.');
  return 0;
}
