import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-safe-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const safeGraphOf = (file) => JSON.parse(spawnSync(process.execPath, [CLI, 'graph', file, '--safe'], { cwd: tmp, encoding: 'utf8' }).stdout);

const SRC = `mission M
goal
  do the thing
evidence signupSignal
  classification pii
unknown who owns refunds
  owner finance-team
guarantee total is never negative
`;

test('graph --safe emits a display-safe intent-graph on stdout', () => {
  const g = safeGraphOf(write('m.thunder', SRC));
  assert.equal(g.safe, true);
  assert.equal(g.schema, 'intent-graph-v1');
  assert.ok(g.nodes.length > 0);
});

test('graph --safe strips owner/source provenance from every node', () => {
  const g = safeGraphOf(write('m2.thunder', SRC));
  assert.ok(g.nodes.every((n) => !('owner' in n) && !('source' in n)), 'no node carries owner or source');
});

test('graph --safe redacts free text on a node with a sensitive classification', () => {
  const g = safeGraphOf(write('m3.thunder', SRC));
  const pii = g.nodes.find((n) => String(n.classification).toLowerCase() === 'pii');
  assert.ok(pii, 'the pii-classified node survives structurally');
  assert.equal(pii.description, null, 'its free text is redacted');
  assert.equal(pii.redacted, true);
  assert.ok(g.redactedNodes >= 1);
});
