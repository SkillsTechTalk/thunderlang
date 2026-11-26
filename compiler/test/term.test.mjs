// Color in the terminal (src/term.mjs): on for a terminal, off for files, pipes, scripts, NO_COLOR, and JSON.
// Color only decorates: the words are always the same with it or without it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paint, paintHelp, plain, commands, useColor } from '../src/term.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'why');
// The color settings are removed (not set empty) unless a test sets them: Node warns on stderr when both are present.
const run = (args, env = {}) => {
  const e = { ...process.env };
  delete e.NO_COLOR; delete e.FORCE_COLOR;
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...e, ...env } });
};
const ANSI = /\x1b\[/;

test('no color when the output is not a terminal (tests, pipes, files); FORCE_COLOR turns it on; NO_COLOR wins', () => {
  assert.doesNotMatch(run([]).stdout, ANSI);
  const on = run([], { FORCE_COLOR: '1' }).stdout;
  assert.match(on, ANSI);
  assert.match(on, /\x1b\[36mthunder new hello\x1b\[39m/);
  assert.doesNotMatch(run([], { NO_COLOR: '1' }).stdout, ANSI);
  assert.equal(useColor({ isTTY: true }), !process.env.NO_COLOR);
  assert.equal(useColor({ isTTY: false }), false);
});

test('JSON is never colored, even when color is forced', () => {
  const j = run(['why', join(FIX, 'refund-stopped.otlp.json'), '--json'], { FORCE_COLOR: '1' }).stdout;
  assert.doesNotMatch(j, ANSI);
  JSON.parse(j);
  assert.doesNotMatch(run(['doctor', '--json'], { FORCE_COLOR: '1' }).stdout, ANSI);
});

test('color only decorates: the same words with it or without it', () => {
  for (const args of [[], ['help', '--all'], ['help', 'read'], ['why', join(FIX, 'refund-stopped.otlp.json')], ['why', join(FIX, 'refund-stopped.otlp.json'), '--steps']]) {
    const off = run(args).stdout, on = run(args, { FORCE_COLOR: '1' }).stdout;
    assert.equal(plain(on), off, args.join(' '));
  }
  const err = run(['raed'], { FORCE_COLOR: '1' }).stderr;
  assert.equal(plain(err), run(['raed']).stderr);
  assert.match(err, /\x1b\[36mthunder read\x1b\[39m\?/);
});

test('marks, labels, and commands', () => {
  const p = paint('  ✓ ok\n  ✗ bad\n  ! careful\n  Why:      because\nNext: thunder read a.py --focus "Late fee"', true);
  assert.match(p, /\x1b\[32m✓/);
  assert.match(p, /\x1b\[31m✗/);
  assert.match(p, /\x1b\[33m!/);
  assert.match(p, /\x1b\[1mWhy:\x1b\[22m/);
  assert.match(p, /\x1b\[36mthunder read a\.py --focus "Late fee"\x1b\[39m/);
  // "thunder" in a sentence is not a command.
  assert.equal(commands('Another thunder comes first on your PATH', true), 'Another thunder comes first on your PATH');
  assert.match(paintHelp('Start\n  doctor [--json]   ready?', true), /\x1b\[1mStart\x1b\[22m\n {2}\x1b\[36mdoctor\x1b\[39m \x1b\[2m\[--json\]/);
});
