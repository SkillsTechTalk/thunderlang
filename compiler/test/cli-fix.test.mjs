import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { autocorrectSource, getCodeActions } from '../src/intellisense.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');

const MESSY = `mission Messy

goal:
  Do a thing

guarantees
  the thing is safe

nevers
  leak a secret

decision D
  inputs
    a
  rule r
    when a == true
    return Yes
  default
    return No
`;

function messyFile() {
  const dir = mkdtempSync(join(tmpdir(), 'intent-fix-'));
  const file = join(dir, 'Messy.intent');
  writeFileSync(file, MESSY);
  return file;
}

test('autocorrectSource fixes header aliases and stray colons only', () => {
  const { fixed, changes } = autocorrectSource(MESSY);
  assert.equal(changes.length, 2);
  assert.ok(changes.some((c) => c.from === 'goal:' && c.to === 'goal' && c.rule === 'strip-colon'));
  assert.ok(changes.some((c) => c.from === 'nevers' && c.to === 'never' && c.rule === 'header-alias'));
  assert.match(fixed, /^goal$/m);
  assert.match(fixed, /^never$/m);
});

test('autocorrect never rewrites a decision `inputs` sub-block', () => {
  // `inputs` is canonical inside a decision; aliasing it to `input` would break parsing.
  const { fixed } = autocorrectSource(MESSY);
  assert.match(fixed, /^ {2}inputs$/m);
  assert.doesNotMatch(fixed, /^ {2}input$/m);
});

test('autocorrect is idempotent and leaves canonical headers alone', () => {
  const once = autocorrectSource(MESSY).fixed;
  const twice = autocorrectSource(once);
  assert.equal(twice.changes.length, 0);
  assert.equal(twice.fixed, once);
});

test('getCodeActions grades safe autocorrects and reviewable quick-fixes', () => {
  // A diagnostic-like object carrying a fix.
  const diags = [{ code: 'guarantee-without-verification', line: 6, fix: [{ label: 'Attach a verify', insert: 'x', block: 'top' }] }];
  const actions = getCodeActions(MESSY, diags);
  assert.ok(actions.some((a) => a.safety === 'safe' && a.kind === 'autocorrect'));
  const rev = actions.find((a) => a.safety === 'reviewable');
  assert.equal(rev.kind, 'quickfix');
  assert.equal(rev.code, 'guarantee-without-verification');
});

test('intent code-actions lists safety-graded actions', () => {
  const res = spawnSync(process.execPath, [CLI, 'code-actions', messyFile()], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /\[safe\] autocorrect/);
  assert.match(res.stdout, /\[reviewable\] quickfix/);
});

test('intent apply-fix --write applies safe fixes and the result compiles', () => {
  const file = messyFile();
  const dry = spawnSync(process.execPath, [CLI, 'apply-fix', file], { encoding: 'utf8' });
  assert.match(dry.stdout, /dry run/);
  assert.equal(readFileSync(file, 'utf8'), MESSY, 'dry run must not modify the file');

  const res = spawnSync(process.execPath, [CLI, 'apply-fix', file, '--write'], { encoding: 'utf8' });
  assert.match(res.stdout, /2 safe fixes applied/);
  const after = readFileSync(file, 'utf8');
  assert.match(after, /^goal$/m);
  assert.match(after, /^never$/m);

  const check = spawnSync(process.execPath, [CLI, 'check', file], { encoding: 'utf8' });
  assert.match(check.stdout, /0 error\(s\)/);
});
