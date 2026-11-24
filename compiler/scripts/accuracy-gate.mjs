#!/usr/bin/env node
// The release gate for Thunder's readings. Fails (exit 1) when
//   (a) a run contradicts a reading: proof by running (src/executed.mjs) over the fixtures in
//       test/fixtures/executed and any configured repositories finds a member whose flow the run contradicts; or
//   (b) the static checks find a reading that says something false: scripts/accuracy.mjs reports a step with an
//       invented value, or a question whose words or Yes/No side disagree with the polarity of the code.
//
// Fixtures only by default: fast, offline, no installs (Python 3.12+ and Node 18+). Real repositories are added
// with a config file, a JSON list of runs, each { "root", "lang", and how to run it: "pytest" (arguments),
// "tests" (a folder of test_* functions), or "command" (JS: a shell command, e.g. the project's test runner);
// optional "cwd", "python", "maxSeconds", "generate" }:
//
//   node scripts/accuracy-gate.mjs [--config gate.json] [--json] [--no-static]
//
// Example gate.json (paths are your own scratch copies; install test dependencies there first, never globally):
//   [{ "root": "/tmp/scratch/requests", "lang": "python", "pytest": "tests -q -p no:cacheprovider",
//      "python": "/tmp/scratch/venv/bin/python", "maxSeconds": 300 },
//    { "root": "/tmp/scratch/express", "lang": "js", "maxSeconds": 400,
//      "command": "node ./node_modules/.bin/mocha --require test/support/env --check-leaks test/ test/acceptance/" }]
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRun, executedText } from '../src/executed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'test', 'fixtures');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

export const FIXTURE_RUNS = [
  { root: join(FIX, 'executed', 'python'), lang: 'python', tests: join(FIX, 'executed', 'python', 'tests') },
  { root: join(FIX, 'executed', 'js'), lang: 'js', command: `${JSON.stringify(process.execPath)} tests/run.mjs` },
];
// The static checks read every fixture folder with code in it.
const STATIC_DIRS = ['executed/python', 'executed/js', 'handlers', 'things', 'sql'].map((d) => join(FIX, d));

const runs = [...FIXTURE_RUNS, ...(flag('--config') ? JSON.parse(readFileSync(flag('--config'), 'utf8')) : [])];
const failures = [];
const out = { runs: [], static: null };

for (const r of runs) {
  let res;
  try { res = verifyRun(r.root, r).result; } catch (e) { failures.push(`${r.root}: could not run (${e.message})`); continue; }
  const s = res.summary;
  out.runs.push({ root: r.root, lang: res.language, summary: s, runs: res.runs, contradicted: res.members.filter((m) => m.status === 'contradicted') });
  if (!args.includes('--json')) console.log(`proof by running: ${r.root}\n${executedText(res)}`);
  if (s.contradicted) failures.push(`${r.root}: ${s.contradicted} member(s) contradicted by a run`);
  // A fixture that stops running is a broken gate, not a pass.
  if (FIXTURE_RUNS.includes(r) && !s.executed) failures.push(`${r.root}: no member was proved by a run (did the recorder run? ${JSON.stringify(res.runs.map((x) => x.errors ?? x.exit))})`);
}

if (!args.includes('--no-static')) {
  const dirs = [...STATIC_DIRS, ...runs.slice(FIXTURE_RUNS.length).map((r) => r.root)];
  const a = spawnSync(process.execPath, [join(HERE, 'accuracy.mjs'), ...dirs, '--json'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  let rep;
  try { rep = JSON.parse(a.stdout); } catch { failures.push(`accuracy.mjs did not finish: ${String(a.stderr).slice(-400)}`); }
  if (rep) {
    const t = rep.totals;
    out.static = { invented: t.invented, polarity: t.polarity, questions: t.questions, steps: t.steps };
    if (!args.includes('--json')) console.log(`static checks: ${t.invented} step(s) with an invented value; ${t.polarity} of ${t.questions} question(s) with the wrong polarity`);
    if (t.invented) failures.push(`${t.invented} step(s) with an invented value: ${JSON.stringify(rep.inventedExamples.slice(0, 5))}`);
    if (t.polarity) failures.push(`${t.polarity} question(s) whose words or side disagree with the code: ${JSON.stringify(rep.polarityExamples.slice(0, 5))}`);
  }
}

if (args.includes('--json')) console.log(JSON.stringify({ ...out, failures }, null, 2));
if (failures.length) {
  console.error(`\naccuracy gate FAILED:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
if (!args.includes('--json')) console.log('\naccuracy gate passed: no reading is contradicted by a run, and none says something false.');
