import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { runTests } from '../src/testing.mjs';
import { evaluateDecision } from '../src/runtime.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'il-init-'));
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('intent init scaffolds a Name.intent file', () => {
  const res = cli('init', 'Checkout', '--out', tmp);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(existsSync(join(tmp, 'Checkout.thunder')));
  assert.match(res.stdout, /next: thunder check/);
});

test('the scaffold is valid, runnable, and its tests pass (instant success)', () => {
  const src = readFileSync(join(tmp, 'Checkout.thunder'), 'utf8');
  const ast = parseIntent(src);
  assert.equal(ast.mission, 'Checkout');
  // no error-level diagnostics
  assert.ok(!semanticDiagnostics(ast).some((d) => d.level === 'error'));
  // the decision runs and the in-file tests pass
  assert.equal(evaluateDecision(ast.decisions[0], { age: 20 }).result, 'Allowed');
  assert.equal(runTests(ast).ok, true);
});

test('intent init refuses to overwrite without --force, allows with it', () => {
  assert.equal(cli('init', 'Checkout', '--out', tmp).status, 1);           // exists -> refuse
  assert.equal(cli('init', 'Checkout', '--out', tmp, '--force').status, 0); // --force -> ok
});

test('intent init defaults the name to Mission', () => {
  cli('init', '--out', tmp);
  assert.ok(existsSync(join(tmp, 'Mission.thunder')));
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
