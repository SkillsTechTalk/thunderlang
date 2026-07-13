import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const SRC = `mission Demo
use product

# keep this comment
goal
  original goal

guarantee x holds
  verify t
`;
function tmpFile() {
  const dir = mkdtempSync(join(tmpdir(), 'il-edit-'));
  const f = join(dir, 'demo.intent');
  writeFileSync(f, SRC);
  return f;
}
const run = (f, ...a) => spawnSync(process.execPath, [CLI, 'edit', f, ...a], { encoding: 'utf8' });

test('intent edit applies flag edits to stdout, preserving comments', () => {
  const f = tmpFile();
  const res = run(f, '--set-goal', 'a better goal', '--add-guarantee', 'y also holds');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /# keep this comment/);
  assert.match(res.stdout, /a better goal/);
  assert.match(res.stdout, /guarantee y also holds/);
  // stdout is the source; the file is untouched without --write
  assert.equal(readFileSync(f, 'utf8'), SRC);
});

test('intent edit --write applies in place and reports', () => {
  const f = tmpFile();
  const res = run(f, '--set-goal', 'written goal', '--write');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stderr, /applied 1, skipped 0/);
  const after = readFileSync(f, 'utf8');
  assert.match(after, /written goal/);
  assert.match(after, /# keep this comment/);
});

test('intent edit --edits reads a JSON array (via stdin)', () => {
  const f = tmpFile();
  const edits = JSON.stringify([
    { op: 'addField', section: 'input', name: 'age', type: 'int' },
    { op: 'removeGuarantee', match: 'x holds' },
  ]);
  const res = spawnSync(process.execPath, [CLI, 'edit', f, '--edits', '-'], { encoding: 'utf8', input: edits });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /input\n {2}age: int/);
  assert.ok(!/guarantee x holds/.test(res.stdout));
});

test('intent edit reports skipped edits with a reason on stderr', () => {
  const f = tmpFile();
  const res = run(f, '--remove-never', 'does not exist');
  assert.equal(res.status, 0);
  assert.match(res.stderr, /skipped: no never matching/);
});

test('intent edit with no edits errors with usage', () => {
  const f = tmpFile();
  const res = run(f);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /no edits given/);
});

test('intent edit rejects non-array / invalid JSON', () => {
  const f = tmpFile();
  const res = spawnSync(process.execPath, [CLI, 'edit', f, '--edits', '-'], { encoding: 'utf8', input: '{"op":"setField"}' });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /must be a JSON array/);
});
