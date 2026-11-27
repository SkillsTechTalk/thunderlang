#!/usr/bin/env node
// Thunder write on real change requests (bench/write-python-tasks.mjs): for each task, write the change with
// thunder write, then check it independently:
//   written   thunder write wrote it, and its own proof passed (the edited steps read as intended; nothing else changed)
//   parses    the changed file parses (Python's ast) and the package imports
//   detects   the hidden test fails on the original code (it really tests the change)
//   passes    the hidden test passes on the written code
// A task counts as done only when all four hold. Nothing is installed; the corpus is a pinned public clone, and
// the hidden tests use only Python's standard library.
//
//   node scripts/write-bench.mjs --corpus <dir> [--json] [--only <id>]
//   (the corpus folder gets a clone of the pinned repository if it has none)
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { thunderWrite } from '../src/write-steps.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const corpusDir = opt('--corpus');
if (!corpusDir) { console.error('usage: node scripts/write-bench.mjs --corpus <dir> [--tasks bench/<file>.mjs] [--json] [--only <id>]'); process.exit(2); }
const tasksFile = resolve(opt('--tasks') ?? new URL('../bench/write-python-tasks.mjs', import.meta.url).pathname);
const set = await import(pathToFileURL(tasksFile).href);
const CORPORA = set.CORPORA ?? [set.CORPUS];
const TASKS = set.TASKS;

// Each pinned repository, cloned into the corpus folder and checked out at its commit.
const roots = new Map();
for (const c of CORPORA) {
  const repo = join(corpusDir, c.name);
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!existsSync(join(repo, '.git'))) execFileSync('git', ['clone', '-q', c.repo, repo], { stdio: 'inherit' });
  if (git('rev-parse', 'HEAD') !== c.commit) {
    try { git('cat-file', '-e', `${c.commit}^{commit}`); } catch { git('fetch', '-q', '--depth', '1', 'origin', c.commit); }
    git('checkout', '-q', c.commit);
  }
  // Files an install would generate (a version module written by the build), so the package imports from a clone.
  for (const [f, text] of Object.entries(c.setup ?? {})) if (!existsSync(join(repo, f))) writeFileSync(join(repo, f), text);
  roots.set(c.name, join(repo, c.src));
}

// Run a hidden test against a source tree: python3 -I <test> <src> (the test puts <src> first on sys.path itself).
function runTest(code, src, work) {
  const file = join(work, 'hidden_test.py');
  writeFileSync(file, `import sys\nsys.path.insert(0, sys.argv[1])\n${code.trim()}\nprint("ok")\n`);
  const r = spawnSync('python3', ['-I', file, src], { encoding: 'utf8', timeout: 60000 });
  return { ok: r.status === 0 && /ok\s*$/.test(r.stdout), output: `${r.stdout}${r.stderr}`.trim().split('\n').slice(-4).join('\n') };
}
function parses(code, work) {
  const file = join(work, 'parse_me.py');
  writeFileSync(file, code);
  const r = spawnSync('python3', ['-I', '-c', 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())', file], { encoding: 'utf8' });
  return { ok: r.status === 0, output: r.stderr.trim().split('\n').slice(-1)[0] ?? '' };
}

const only = opt('--only');
const results = [];
for (const task of TASKS.filter((t) => !only || t.id === only)) {
  const work = mkdtempSync(join(tmpdir(), 'thunder-write-bench-'));
  try {
    const srcRoot = roots.get(task.corpus ?? CORPORA[0].name);
    const source = readFileSync(join(srcRoot, task.file), 'utf8');
    const r = thunderWrite([{ path: task.file, source }], task.edits);
    const res = { id: task.id, request: task.request, status: r.status, reason: r.reason ?? null, says: r.says ?? null, patch: r.patch ?? null };
    // The original code must import, or a failing hidden test says nothing about the change.
    const modName = task.file.replace(/\.py$/, '').replace(/\//g, '.');
    const baseline = runTest(`import ${modName}`, srcRoot, work);
    if (!baseline.ok) { results.push({ id: task.id, request: task.request, status: 'corpus-broken', reason: `the original code does not import: ${baseline.output.split('\n').pop()}`, done: false, excluded: true }); continue; }
    // Does the hidden test detect the change? It must fail on the original code, and not by crashing on import.
    const before = runTest(task.test, srcRoot, work);
    res.detects = !before.ok;
    if (!res.detects) res.detectsOutput = 'the hidden test already passes on the original code';
    if (r.status === 'written') {
      const written = r.files[task.file];
      const p = parses(written, work);
      // A copy of the source tree with the written file in it.
      const tree = join(work, 'src');
      cpSync(srcRoot, tree, { recursive: true, filter: (s) => !/__pycache__/.test(s) });
      writeFileSync(join(tree, task.file), written);
      const imp = p.ok ? runTest(`import ${task.file.split('/')[0]}\nimport ${task.file.replace(/\.py$/, '').replace(/\//g, '.')}`, tree, work) : { ok: false, output: 'not parsed' };
      res.parses = p.ok && imp.ok;
      if (!res.parses) res.parseOutput = p.ok ? imp.output : p.output;
      const after = res.parses ? runTest(task.test, tree, work) : { ok: false, output: 'not run: the file does not parse or import' };
      res.passes = after.ok;
      if (!after.ok) res.testOutput = after.output;
    } else { res.parses = null; res.passes = null; }
    res.done = res.status === 'written' && res.parses && res.detects && res.passes;
    results.push(res);
  } finally { rmSync(work, { recursive: true, force: true }); }
}

const excluded = results.filter((r) => r.excluded);
for (const x of excluded) results.splice(results.indexOf(x), 1);
const done = results.filter((r) => r.done).length;
const summary = { corpus: CORPORA.map((c) => `${c.name}@${c.commit.slice(0, 7)}`).join(', '), tasks: results.length, done, written: results.filter((r) => r.status === 'written').length, needsAi: results.filter((r) => r.status === 'needs-ai').length, refused: results.filter((r) => r.status === 'refused').length, wrongAfterWrite: results.filter((r) => r.status === 'written' && (!r.parses || !r.passes)).length, testsThatDetect: results.filter((r) => r.detects).length, excluded: excluded.map((x) => ({ id: x.id, why: x.reason })) };
if (args.includes('--json')) console.log(JSON.stringify({ summary, results }, null, 2));
else {
  console.log(`Thunder write on ${summary.corpus}: ${done} of ${summary.tasks} change requests done (written, parses and imports, hidden test fails before and passes after).`);
  console.log(`written ${summary.written}, needs-ai ${summary.needsAi}, refused ${summary.refused}; written but wrong ${summary.wrongAfterWrite}; hidden tests that detect the change ${summary.testsThatDetect}/${summary.tasks}`);
  for (const x of summary.excluded) console.log(`not counted: ${x.id} (${x.why})`);
  console.log('');
  for (const r of results) {
    const mark = r.done ? 'DONE ' : r.status === 'written' ? 'WRONG' : r.status === 'needs-ai' ? 'AI   ' : 'NO   ';
    console.log(`${mark} ${r.id}: ${r.request}`);
    if (!r.detects) console.log(`      the hidden test does not detect the change: ${r.detectsOutput}`);
    if (r.status !== 'written') console.log(`      ${r.status}: ${r.reason}`);
    else if (!r.parses) console.log(`      does not parse or import: ${r.parseOutput}`);
    else if (!r.passes) console.log(`      hidden test failed:\n${r.testOutput.split('\n').map((l) => `        ${l}`).join('\n')}`);
  }
}
process.exitCode = results.every((r) => r.done) ? 0 : 1;
