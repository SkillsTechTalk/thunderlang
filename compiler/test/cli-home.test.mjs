// The human front door of the CLI (src/cli-home.mjs): home screen, help for one command, typo suggestions,
// running outside a project, thunder new, thunder doctor, and shell completion. Exit codes are unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { knownCommands, suggest, doctor, completionScript, nearbyProjects } from '../src/cli-home.mjs';
import { COMPILER_VERSION } from '../src/emit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'src', 'cli.mjs');
const SRC = readFileSync(join(HERE, '..', 'src', 'cli-main.mjs'), 'utf8'); // the CLI's code (cli.mjs only starts it)
const FULL_HELP = SRC.slice(SRC.indexOf('const HELP = `') + 14, SRC.indexOf('`;', SRC.indexOf('const HELP = `')));
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd });
const tmp = () => mkdtempSync(join(tmpdir(), 'thunder-home-'));

test('thunder with nothing shows a short home screen (exit code 2, as before); --help shows it with 0', () => {
  const r = run([]);
  assert.equal(r.status, 2);
  assert.ok(r.stdout.split('\n').length <= 25, `home is ${r.stdout.split('\n').length} lines`);
  assert.match(r.stdout, new RegExp(`^⚡ Thunder™ ${COMPILER_VERSION.replace(/\./g, '\\.')}: programming, made human\\.`));
  for (const s of ['thunder new hello', 'thunder run hello', 'thunder read app.py', 'thunder help --all', 'thunder doctor']) assert.ok(r.stdout.includes(s), s);
  assert.equal(run(['--help']).status, 0);
  assert.equal(run(['help']).stdout, r.stdout);
});

test('thunder help --all is the full list; thunder help <command> is just that command', () => {
  const all = run(['help', '--all']);
  assert.equal(all.status, 0);
  assert.ok(all.stdout.includes('twelve-factor') && all.stdout.split('\n').length > 100);
  assert.equal(run(['--help', '--all']).stdout, all.stdout);
  const read = run(['help', 'read']);
  assert.equal(read.status, 0);
  assert.match(read.stdout, /^ {2}read <file\|dir>/m);
  assert.ok(!read.stdout.includes('twelve-factor'));
  const nope = run(['help', 'raed']);
  assert.equal(nope.status, 2);
  assert.match(nope.stderr, /there is no command "raed"\. Did you mean thunder read\?/);
});

test('every command the CLI handles is known, so none is ever mistaken for a typo', () => {
  const known = new Set(knownCommands(FULL_HELP));
  const used = new Set([...SRC.matchAll(/cmd === '([a-z][a-z0-9:-]*)'/g)].map((m) => m[1]));
  for (const m of SRC.matchAll(/\[((?:'[a-z-]+',? ?)+)\]\.includes\(cmd\)/g)) for (const w of m[1].matchAll(/'([a-z-]+)'/g)) used.add(w[1]);
  assert.deepEqual([...used].filter((c) => !known.has(c)), []);
  // Commands looked up in a table (the focused scan queries) are known too.
  for (const view of ['risks', 'gaps', 'unverified', 'coverage', 'unknowns', 'contradictions']) assert.doesNotMatch(run([view, '/nonexistent']).stderr, /there is no command/, view);
});

test('a mistyped command gets a suggestion, not a crash', () => {
  const r = run(['raed', 'x.py']);
  assert.equal(r.status, 2);
  assert.equal(r.stderr, 'thunder: there is no command "raed". Did you mean thunder read?\nSee the main commands with: thunder help\n');
  assert.deepEqual(suggest('tset', knownCommands(FULL_HELP)), ['test']);
  assert.deepEqual(suggest('doctr', knownCommands(FULL_HELP)), ['doctor']);
  assert.deepEqual(suggest('zzzzzz', knownCommands(FULL_HELP)), []);
});

test('thunder new says exactly how to run it; run outside a project points at the project; --run runs it', { skip: spawnSync('python3', ['--version']).status !== 0 && 'needs Python' }, () => {
  const d = tmp();
  try {
    const n = run(['new', 'hello'], d);
    assert.equal(n.status, 0);
    assert.match(n.stdout, /^Created hello, a new Thunder program\.\n\nRun it:\n {2}thunder run hello\n/);
    const outside = run(['run'], d);
    assert.equal(outside.status, 2);
    assert.match(outside.stderr, /^thunder run: there is no Thunder project in this folder\./);
    assert.match(outside.stderr, /There is one here:\n {2}thunder run hello\n/);
    assert.equal(run(['run', 'hello'], d).stdout, 'Hello, world!\n');
    const both = run(['new', 'second', '--run'], d);
    assert.equal(both.status, 0);
    assert.match(both.stdout, /thunder run second[\s\S]*\nHello, world!\n$/);
    const empty = tmp();
    assert.match(run(['test'], empty).stderr, /Make one with:\n {2}thunder new hello\n {2}thunder test hello/);
    rmSync(empty, { recursive: true });
    assert.deepEqual(nearbyProjects(d).map((p) => p.split(/[\\/]/).pop()), ['hello', 'second']);
  } finally { rmSync(d, { recursive: true }); }
});

test('thunder doctor: what is ready, what is missing, and the exact fix (offline)', () => {
  const nvm = tmp();
  try {
    for (const v of ['v18.0.0', 'v22.0.0']) mkdirSync(join(nvm, 'versions', 'node', v, 'bin'), { recursive: true });
    writeFileSync(join(nvm, 'versions', 'node', 'v18.0.0', 'bin', 'thunder'), '');
    const r = doctor({ version: '9.9.9', cliPath: CLI, cwd: nvm, env: { NVM_DIR: nvm } });
    assert.equal(r.checks[0].what, 'Thunder 9.9.9');
    const lost = r.checks.find((c) => /isn't installed for Node/.test(c.what));
    assert.equal(lost.what, "Thunder isn't installed for Node v22.0.0");
    assert.equal(lost.ok, 'warn');
    assert.equal(lost.fix, 'Install it there too: nvm exec 22.0.0 npm install -g @skillstech/thunderlang');
    assert.equal(r.ok, r.checks.every((c) => c.ok !== false));
    assert.ok(r.optional.some((o) => o.name === 'Go'));
  } finally { rmSync(nvm, { recursive: true }); }
  const cli = run(['doctor', '--json']);
  const j = JSON.parse(cli.stdout);
  assert.equal(cli.status, j.ok ? 0 : 1);
  assert.match(run(['doctor']).stdout, /^Thunder™ doctor\n\n {2}✓ Thunder /);
  assert.equal(run(['doctor', '--bogus']).status, 2);
});

test('thunder completion prints a script for zsh, bash, and fish', () => {
  for (const sh of ['zsh', 'bash', 'fish']) {
    const r = run(['completion', sh]);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes(' doctor ') && r.stdout.includes(' read '), sh);
  }
  assert.equal(completionScript('tcsh', ['a']), null);
  const bad = run(['completion', 'tcsh']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /name your shell: thunder completion zsh, bash, or fish\. \(There is no "tcsh"\.\)/);
});

test('inside a project, its own name runs it; a missing file is said in words, never a crash', { skip: spawnSync('python3', ['--version']).status !== 0 && 'needs Python' }, () => {
  const d = tmp();
  try {
    run(['new', 'hello'], d);
    const inside = join(d, 'hello');
    assert.equal(run(['run', 'hello'], inside).stdout, 'Hello, world!\n');
    assert.equal(run(['run', 'hello'], join(inside, 'src')).stdout, 'Hello, world!\n');
    const missing = run(['test', 'whatever'], join(inside, 'src'));
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /^thunder test: there is no file or folder called "whatever" here\.\nYou're in: .*\nYou're inside the Thunder project "hello"\. Run it with: thunder test\n$/);
    const lift = run(['lift', 'nope.py'], d);
    assert.equal(lift.status, 2);
    assert.match(lift.stderr, /there is no file or folder called "nope\.py" here\.[\s\S]*See the main commands with: thunder help/);
    assert.doesNotMatch(lift.stderr, /node:fs|ENOENT|at /);
  } finally { rmSync(d, { recursive: true }); }
});
