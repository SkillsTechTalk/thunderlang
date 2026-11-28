// Stored lists (Store habits as a list of Habit): saved in data/<name>.json between runs, on the Thunder engine and
// Python, and compiled TypeScript, in one format (src/core/store-format.mjs, which thunder_runtime.mjs carries;
// runtime-python's _fill_stores/_save_stores). Loaded when the
// program starts, saved only when it finishes well; tests start empty and never save.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compileCore } from '../src/core/index.mjs';
import { findPython } from '../src/core/project.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const PY = findPython();
const thunder = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

const HABITS = [
  'A Habit has:', '  Name is text', '  Streak is whole number', '  Pledge is money', '  Started is date', '  Note is optional text', '',
  'Store habits as a list of Habit', '',
  'To start habit:', '  Receive name',
  '  Add a Habit with name name and streak 0 and pledge $1.50 and started date "2026-11-27" to habits', '',
  'When the count of habits is 0:', '  Start habit with "walk"', '  Start habit with "read"',
  'Set walk to habits at 1', 'Set walk\'s streak to walk\'s streak + 1',
  'say "{the count of habits} habits; walk streak {walk\'s streak}"', '',
  'Test "a test starts with an empty store":', '  Expect the count of habits to be 0', '',
].join('\n');

function project(src, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-store-'));
  try { writeFileSync(join(dir, 'habits.thunder'), src); return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const saved = (dir) => JSON.parse(readFileSync(join(dir, 'data', 'habits.json'), 'utf8'));

test('Store parses and checks; the mistakes say what to write', () => {
  assert.equal(compileCore(HABITS, { file: 'm.thunder' }).ok, true);
  for (const [src, code, words] of [
    [`${HABITS}\nSet habits to []\n`, 'TC205', /stored list.*change its items/],
    ['Store xs as a list of number\n', 'TC306', /holds a list of records/],
    ['A Box has:\n  Items is list of text\nStore boxes as a list of Box\n', 'TC306', /field "Items" is not a plain value/],
    ['To f:\n  Store xs as a list of number\n', 'TC402', /left edge/],
  ]) {
    const r = compileCore(src, { file: 'm.thunder' });
    assert.equal(r.ok, false, src);
    assert.ok(r.diagnostics.some((d) => d.code === code && words.test(d.message)), JSON.stringify(r.diagnostics));
  }
});

test('the Thunder engine keeps a stored list between runs, in a readable file', () => {
  project(HABITS, (dir) => {
    assert.equal(thunder(['run', '--engine', 'thunder', 'habits.thunder'], dir).stdout, '2 habits; walk streak 1\n');
    assert.equal(thunder(['run', '--engine', 'thunder', 'habits.thunder'], dir).stdout, '2 habits; walk streak 2\n');
    assert.deepEqual(saved(dir)[0], { name: 'walk', streak: 2, pledge: '1.50', started: '2026-11-27', note: null });
  });
});

test('a program that stops with a problem saves nothing', () => {
  project(`${HABITS}\nStop with "boom"\n`, (dir) => {
    const r = thunder(['run', '--engine', 'thunder', 'habits.thunder'], dir);
    assert.notEqual(r.status, 0);
    assert.equal(existsSync(join(dir, 'data', 'habits.json')), false);
  });
});

test('tests start with an empty store and never save', () => {
  project(HABITS, (dir) => {
    mkdirSync(join(dir, 'data'));
    writeFileSync(join(dir, 'data', 'habits.json'), '[{"name":"x","streak":5,"pledge":"1","started":"2026-01-01"}]\n');
    const r = thunder(['test', '--engine', 'thunder', 'habits.thunder'], dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1 passed/);
    assert.equal(saved(dir).length, 1);
  });
});

test('a damaged file says where and what is wrong, the same on every engine, and is left as it was', () => {
  project(HABITS, (dir) => {
    mkdirSync(join(dir, 'data'));
    const damaged = '[{"name":"walk","streak":"many","pledge":"1.50","started":"2026-11-27"}]\n';
    writeFileSync(join(dir, 'data', 'habits.json'), damaged);
    const ways = [['--engine', 'thunder'], ['--core', '--target', 'typescript'], ...(PY.error ? [] : [['--core']])];
    for (const way of ways) {
      const r = thunder(['run', 'habits.thunder', ...way], dir);
      assert.notEqual(r.status, 0, way.join(' '));
      assert.equal(r.stderr.trim(), 'habits.thunder, line 8: data/habits.json, item 1, "streak" should be a whole number, but the file has "many".  [TC509]', way.join(' '));
      assert.equal(readFileSync(join(dir, 'data', 'habits.json'), 'utf8'), damaged);
    }
  });
});

test('Python, compiled TypeScript, and the Thunder engine read and write the same file', { skip: PY.error ? `no Python: ${PY.error}` : false }, () => {
  project(HABITS, (dir) => {
    assert.equal(thunder(['run', 'habits.thunder', '--core'], dir).stdout, '2 habits; walk streak 1\n');
    assert.equal(thunder(['run', '--engine', 'thunder', 'habits.thunder'], dir).stdout, '2 habits; walk streak 2\n');
    assert.equal(thunder(['run', 'habits.thunder', '--core', '--target', 'typescript'], dir).stdout, '2 habits; walk streak 3\n');
    const afterTypeScript = readFileSync(join(dir, 'data', 'habits.json'), 'utf8');
    assert.equal(thunder(['run', 'habits.thunder', '--core'], dir).stdout, '2 habits; walk streak 4\n');
    assert.deepEqual(saved(dir)[0], { name: 'walk', streak: 4, pledge: '1.50', started: '2026-11-27', note: null });
    // The same bytes, whichever wrote them (apart from the streak).
    assert.equal(readFileSync(join(dir, 'data', 'habits.json'), 'utf8'), afterTypeScript.replace('"streak": 3', '"streak": 4'));
    for (const way of [['--core'], ['--core', '--target', 'typescript']]) {
      const t = thunder(['test', 'habits.thunder', ...way], dir);
      assert.match(t.stdout, /1 passed/, way.join(' '));
      assert.equal(saved(dir)[0].streak, 4);
    }
  });
});

test('compiled TypeScript keeps a stored list, and a program that stops saves nothing', () => {
  project(HABITS, (dir) => {
    assert.equal(thunder(['run', 'habits.thunder', '--core', '--target', 'typescript'], dir).stdout, '2 habits; walk streak 1\n');
    assert.equal(thunder(['run', 'habits.thunder', '--core', '--target', 'typescript'], dir).stdout, '2 habits; walk streak 2\n');
  });
  project(`${HABITS}\nStop with "boom"\n`, (dir) => {
    assert.notEqual(thunder(['run', 'habits.thunder', '--core', '--target', 'typescript'], dir).status, 0);
    assert.equal(existsSync(join(dir, 'data', 'habits.json')), false);
  });
});

test('every other target refuses a stored list (TC410)', () => {
  project(HABITS, (dir) => {
    for (const target of ['csharp', 'go', 'java', 'rust']) {
      const r = thunder(['build', '--core', 'habits.thunder', '--target', target], dir);
      assert.notEqual(r.status, 0, target);
      assert.match(r.stdout + r.stderr, /"habits" is a stored list.*\[TC410\]/s, target);
    }
  });
});
