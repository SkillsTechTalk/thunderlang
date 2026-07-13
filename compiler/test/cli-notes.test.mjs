import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');

const FIXTURE = `mission ChargeCard

note pm:
  One click, one charge, even on a retry.

goal
  Charge a card once

input
  amount: Money
    note beginner:
      The amount to charge, in the account currency.
    note qa:
      Charge twice with the same key and expect one charge.

output
  receipt: Receipt

guarantee a retried charge does not double-bill
  because a double charge is a trust-breaking billing error
  note risk:
    Double charges create refunds and support load.
  verify idempotent charge test
`;

function fixtureFile() {
  const dir = mkdtempSync(join(tmpdir(), 'intent-notes-'));
  const file = join(dir, 'ChargeCard.intent');
  writeFileSync(file, FIXTURE);
  return file;
}

const notes = (file, ...a) => spawnSync(process.execPath, [CLI, 'notes', file, ...a], { encoding: 'utf8' });

test('intent notes groups the compiled note blocks by lens', () => {
  const res = notes(fixtureFile());
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /4 notes/);
  // one line per lens header
  for (const lens of ['pm', 'beginner', 'qa', 'risk']) assert.match(res.stdout, new RegExp(`\\n${lens}\\b`));
  // target kind + source line are shown, and the note text
  assert.match(res.stdout, /\[mission\] ChargeCard  , line 3/);
  assert.match(res.stdout, /\[input\] amount/);
  assert.match(res.stdout, /\[guarantee\] a-retried-charge-does-not-double-bill/);
  assert.match(res.stdout, /One click, one charge/);
});

test('intent notes --lens filters to a single audience', () => {
  const res = notes(fixtureFile(), '--lens', 'qa');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /\(lens: qa\): 1 note/);
  assert.match(res.stdout, /expect one charge/);
  assert.doesNotMatch(res.stdout, /One click, one charge/);
});

test('intent notes --json emits the intent-notes-v1 report', () => {
  const out = JSON.parse(notes(fixtureFile(), '--json').stdout);
  assert.equal(out.schema, 'intent-notes-v1');
  assert.equal(out.mission, 'ChargeCard');
  assert.equal(out.count, 4);
  assert.ok(out.notes.every((n) => n.id && n.lens && n.text && n.targetKind && n.sourceSpan));
  const qa = out.notes.find((n) => n.lens === 'qa');
  assert.equal(qa.targetKind, 'input');
  assert.equal(qa.targetPath, 'mission.ChargeCard.input.amount');
});

test('intent notes reports usage without a file', () => {
  const res = spawnSync(process.execPath, [CLI, 'notes'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /usage: intent notes/);
});
