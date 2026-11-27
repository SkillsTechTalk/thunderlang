// Which kind of .thunder file: a mission or a Thunder Core program (src/core/kind.mjs, used by src/core/cli.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { fileKind, MISSION_KEYWORDS } from '../src/core/kind.mjs';
import { findProjectRoot } from '../src/core/project.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CLI = join(HERE, '..', 'src', 'cli.mjs');

test('every .thunder file in the repository is read as the kind it is', () => {
  const files = execFileSync('git', ['ls-files', '*.thunder'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  assert.ok(files.length > 40);
  for (const f of files) {
    const path = join(ROOT, f);
    // The truth: a file in a Thunder Core project is a program; every other .thunder file here is a mission.
    const truth = findProjectRoot(path) ? 'program' : 'mission';
    assert.equal(fileKind(readFileSync(path, 'utf8')).kind, truth, `${f}: ${fileKind(readFileSync(path, 'utf8')).reason}`);
  }
});

test('the first line decides, and anything that could be a mission stays one', () => {
  const cases = [
    ['mission Checkout\ngoal\n  Sell things.', 'mission'],
    ['# a comment\n\nservice BillingService', 'mission'],
    ['use product\nmission M', 'mission'],
    ['use csv', 'mission'], // could be either: stays a mission, as before
    ['', 'mission'],
    ['say "Hello, world!"', 'program'],
    ['Say "Hi"', 'program'],
    ['Set total to 0', 'program'],
    ['set total to 0', 'program'],
    ['To greet:\n  Say "hi"', 'program'],
    ['A Trade has:\n  Symbol is text', 'program'],
    ['Screen Today:\n  Show a heading "Hi"', 'program'],
    ['Use csv as csv', 'program'],
    ['Use "date-fns" from npm as dates', 'program'],
    ['Test "adds":\n  Expect 1 + 1 is 2', 'program'],
    ['  mission Indented', 'program'],
  ];
  for (const [src, kind] of cases) assert.equal(fileKind(src).kind, kind, JSON.stringify(src));
  assert.match(fileKind('Set total to 0').reason, /cannot start a mission/);
  assert.match(fileKind('mission M').reason, /mission keyword "mission"/);
});

test('the mission keyword list matches the mission parser', () => {
  const parse = readFileSync(join(HERE, '..', 'src', 'parse.mjs'), 'utf8');
  // The top-level switch: from "switch (kw) {" to its closing brace at the same depth.
  const start = parse.indexOf('    switch (kw) {');
  const body = parse.slice(start, parse.indexOf('\n    }\n', start));
  const lines = body.split('\n').filter((l) => /^ {6}case '/.test(l));
  const cases = new Set(lines.flatMap((l) => [...l.matchAll(/case '([a-z_]+)'/g)].map((m) => m[1])));
  assert.ok(cases.size > 60, `only ${cases.size} keywords found`);
  for (const k of cases) assert.ok(MISSION_KEYWORDS.has(k), `the mission parser has "${k}" but kind.mjs does not`);
});

test('a program file outside any project runs without --core; --mission and missions are unchanged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-kind-'));
  try {
    writeFileSync(join(dir, 'hello.thunder'), 'say "Hello"\n');
    writeFileSync(join(dir, 'Checkout.thunder'), 'mission Checkout\ngoal\n  Sell things.\n');
    const run = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    const check = run(['check', 'hello.thunder']);
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /Thunder Core/);
    const mission = run(['check', 'Checkout.thunder']);
    assert.match(mission.stdout, /mission: Checkout/);
    const forced = run(['check', 'hello.thunder', '--mission']);
    assert.notEqual(forced.status, 0);
    assert.match(forced.stdout + forced.stderr, /add --core/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
