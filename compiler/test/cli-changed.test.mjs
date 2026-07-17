import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');

test('thunder test --changed selects the changed intent AND graph-impacted intents', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tl-changed-'));
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  // A publishes an event that B consumes -> they share the event symbol in the Intent Graph.
  writeFileSync(join(dir, 'a.thunder'), 'mission A\nservice OrderSvc\n  publishes\n    OrderPlaced\n');
  writeFileSync(join(dir, 'b.thunder'), 'mission B\nservice FulfilSvc\n  consumes\n    OrderPlaced\n');
  git('add', '-A');
  git('commit', '-qm', 'base');

  // change only A
  appendFileSync(join(dir, 'a.thunder'), '# tweak\n');

  const res = spawnSync(process.execPath, [CLI, 'test', '--changed'], { cwd: dir, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /a\.thunder.*\[changed\]/);
  // B was not modified, but the graph selects it because it consumes A's event
  assert.match(res.stdout, /b\.thunder.*impacted via event OrderPlaced/);
});

test('thunder test --changed reports nothing when no source changed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tl-changed2-'));
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  writeFileSync(join(dir, 'a.thunder'), 'mission A\n');
  git('add', '-A');
  git('commit', '-qm', 'base');

  const res = spawnSync(process.execPath, [CLI, 'test', '--changed'], { cwd: dir, encoding: 'utf8' });
  assert.match(res.stdout, /no source files changed/);
});
