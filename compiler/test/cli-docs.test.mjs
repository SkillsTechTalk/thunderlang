import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { renderLensDoc } from '../src/compile.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');

const FIXTURE = `mission ChargeCard

note pm:
  One click, one charge.

goal
  Charge a card once

input
  amount: Money
    note qa:
      Charge twice with the same key and expect one charge.

guarantee a retried charge does not double-bill
  because a double charge is a trust-breaking billing error
  note qa:
    Replay the request and assert a single charge row.
  verify idempotent charge test
`;

function fixtureFile() {
  const dir = mkdtempSync(join(tmpdir(), 'intent-docs-'));
  const file = join(dir, 'ChargeCard.intent');
  writeFileSync(file, FIXTURE);
  return file;
}

const docs = (file, ...a) => spawnSync(process.execPath, [CLI, 'docs', file, ...a], { encoding: 'utf8' });

test('intent docs --lens weaves that lens notes inline and disclaims verification', () => {
  const res = docs(fixtureFile(), '--lens', 'qa');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /for the qa reader/);
  assert.match(res.stdout, /documentation, not verification/);
  // the two qa notes appear; the pm note does not
  assert.match(res.stdout, /expect one charge/);
  assert.match(res.stdout, /single charge row/);
  assert.doesNotMatch(res.stdout, /One click, one charge/);
  assert.match(res.stdout, /2 `qa` notes in this mission\./);
});

test('intent docs without a lens prints the plain mission doc', () => {
  const res = docs(fixtureFile());
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /^# ChargeCard/m);
  assert.doesNotMatch(res.stdout, /ThunderLens/);
});

test('intent docs reports usage without a file', () => {
  const res = spawnSync(process.execPath, [CLI, 'docs'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /usage: intent docs/);
});

test('renderLensDoc is pure and only includes the requested lens', () => {
  const ast = parseIntent(FIXTURE);
  const doc = renderLensDoc(ast, 'pm');
  assert.match(doc, /One click, one charge/);
  assert.doesNotMatch(doc, /expect one charge/);
  assert.match(doc, /1 `pm` note in this mission\./);
});
