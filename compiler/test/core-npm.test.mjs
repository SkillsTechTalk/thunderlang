// npm packages from Thunder Core (Use "<package>" from npm as <name>), compiled to TypeScript. The packages here are
// written into a temporary node_modules (no network): one with named exports, one CommonJS package that exports a
// single function, and node: built-ins. Every other target refuses the program with TC408.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compileCore } from '../src/core/index.mjs';
import { TS } from './core-engines.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const skipRun = TS.error ? `TypeScript cannot run here: ${TS.error}` : false;

function project(main, target = 'typescript') {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-npm-'));
  writeFileSync(join(dir, 'thunder.toml'), `[project]\nname = "npm-test"\n\n[build]\ntarget = "${target}"\n`);
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'main.thunder'), main);
  const pkg = (name, files) => {
    const d = join(dir, 'node_modules', name);
    mkdirSync(d, { recursive: true });
    for (const [f, text] of Object.entries(files)) writeFileSync(join(d, f), text);
  };
  pkg('money-helper', {
    'package.json': JSON.stringify({ name: 'money-helper', version: '1.0.0', type: 'module', exports: './index.js' }),
    'index.js': [
      'export const RATE = 0.07;',
      'export function addTax(x) { if (typeof x !== "number") throw new TypeError("not a number"); return x * 1.07; }',
      'export function tags(list) { return list.map((s) => s.toUpperCase()); }',
      'export function summary(o) { return { name: o.name, items: o.items.length }; }',
      'export function later() { return Promise.resolve(1); }',
      'export function boom() { throw new RangeError("too big"); }',
    ].join('\n'),
  });
  pkg('just-one', {
    'package.json': JSON.stringify({ name: 'just-one', version: '1.0.0', main: 'index.js' }),
    'index.js': 'module.exports = function double(n) { return n * 2; };',
  });
  return dir;
}
const thunder = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('Use "<package>" from npm parses, and the mistakes say how to write it', () => {
  const ok = compileCore('Use "date-fns" from npm as dates\nUse "@scope/pkg/sub" from npm as sub thing\nUse "node:path" from npm as paths\n', { file: 'm.thunder' });
  assert.equal(ok.ok, true, JSON.stringify(ok.diagnostics));
  assert.deepEqual(ok.info.modules.map((m) => [m.module, m.ecosystem]), [['date-fns', 'npm'], ['@scope/pkg/sub', 'npm'], ['node:path', 'npm']]);
  const py = compileCore('Use csv from Python as csv\n', { file: 'm.thunder' });
  assert.equal(py.info.modules[0].ecosystem, 'python');
  for (const [src, words] of [
    ['Use "date-fns" as dates\n', /Say where "date-fns" comes from/],
    ['Use "date-fns" from npm\n', /Give the package a name/],
    ['Use dates from npm as dates\n', /Write an npm package in quotes/],
    ['Use "date-fns" from maven as dates\n', /comes from Python, npm, \.NET, or NuGet/],
  ]) {
    const r = compileCore(src, { file: 'm.thunder' });
    assert.equal(r.ok, false, src);
    assert.match(r.diagnostics.map((d) => d.message).join('\n'), words, src);
  }
});

test('compiled TypeScript calls npm packages, converting values both ways', { skip: skipRun }, () => {
  const dir = project([
    'Use "money-helper" from npm as helper',
    'Use "just-one" from npm as one',
    'Use "node:path" from npm as paths',
    '',
    'A Cart has:',
    '  Name is text',
    '  Items is list of whole number',
    '',
    'Say helper.addTax(100)',
    'Say helper.RATE',
    'Say helper.tags(["a", "b"])',
    'Set s to helper.summary(a Cart with name "Ada" and items [1, 2, 3])',
    'Say s at "items"',
    'Say one.default(21)',
    'Say paths.basename("/reports/2026/trades.csv")',
    'Set total to helper.RATE + 0.01',
    'Say total',
    '',
  ].join('\n'));
  try {
    const r = thunder(['run'], dir);
    assert.equal(r.status, 0, r.stderr);
    // 0.07 comes back as the exact decimal it is written as, so 0.07 + 0.01 is exactly 0.08.
    assert.equal(r.stdout, ['107', '0.07', '[A, B]', '3', '42', 'trades.csv', '0.08', ''].join('\n'));
    const decl = readFileSync(join(dir, 'generated', 'typescript', 'npm_packages.d.ts'), 'utf8');
    assert.match(decl, /declare module "just-one";/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('library failures are TC508 with the JavaScript reason; promises are refused in words', { skip: skipRun }, () => {
  for (const [line, words] of [
    ['Say helper.boom()', /JavaScript code used by this line failed: RangeError: too big.*\[TC508\]/s],
    ['Say helper.nothingHere()', /The npm package "money-helper" has nothing named "nothingHere".*\[TC508\]/s],
    ['Say helper.later()', /works asynchronously \(it gave back a promise\)/],
  ]) {
    const dir = project(`Use "money-helper" from npm as helper\n${line}\n`);
    try {
      const r = thunder(['run'], dir);
      assert.notEqual(r.status, 0, line);
      assert.match(r.stdout + r.stderr, words, line);
      assert.match(r.stdout + r.stderr, /line 2/, line);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('every other target refuses an npm package with TC408, before anything is written', () => {
  for (const target of ['python', 'csharp', 'go', 'java', 'rust']) {
    const dir = project('Use "money-helper" from npm as helper\nSay helper.RATE\n', target);
    try {
      const r = thunder(['build'], dir);
      assert.notEqual(r.status, 0, target);
      assert.match(r.stdout + r.stderr, /"money-helper" is an npm package.*\[TC408\]/s, target);
      assert.match(r.stdout + r.stderr, /under \[build\] in thunder\.toml/, target);
      assert.equal(existsSync(join(dir, 'generated', target)), false, `${target} wrote output`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('the Thunder engine refuses an npm package and says to run it as TypeScript', () => {
  const dir = project('Use "money-helper" from npm as helper\nSay helper.RATE\n');
  try {
    const r = thunder(['run', '--engine', 'thunder'], dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /uses the npm package "money-helper".*--target typescript/s);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
