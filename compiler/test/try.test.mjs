// thunder try: try a rule from your code with your own values ("What if?"). Rules only; nothing changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { READ_LESSONS } from '../src/learn-lessons.mjs';
import { rulesIn, tryRule, parseWith, parseValue } from '../src/try-cli.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const dir = mkdtempSync(join(tmpdir(), 'thunder-try-'));
const LIB = join(dir, 'library.py');
writeFileSync(LIB, READ_LESSONS.find((l) => l.slug === 'flow').files[0].code);
const REG = join(dir, 'register.ts');
writeFileSync(REG, `/** Who can register. */
export function canRegister(age: number, parentApproved: boolean): string {
  if (age >= 18) return "Allowed";
  if (age >= 13 && parentApproved) return "Allowed";
  return "Declined";
}

export function saveUser(db: any, name: string) {
  db.insert(name);
}
`);
const cli = (args, input) => spawnSync(process.execPath, [CLI, 'try', ...args], { encoding: 'utf8', input: input ?? '' });
test.after(() => rmSync(dir, { recursive: true }));

test('one situation with --with: the answer, and why, check by check', () => {
  const r = cli([REG, '--with', 'age=15, parent approved=no']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `Answer: Declined
Why:
  ✗ the age is at least 18  (it is 15), so not Allowed
  ✗ it is parent approved  (no), so not Allowed
  → none of the rules matched, so: Declined (otherwise)
`);
  assert.match(cli([REG, '--with', 'age=15', '--with', 'parent approved=yes']).stdout, /^Answer: Allowed\nWhy:\n {2}✗ the age is at least 18 {2}\(it is 15\), so not Allowed\n {2}✓ the age is at least 13 {2}\(it is 15\)\n {2}✓ it is parent approved {2}\(yes\)\n {2}→ so: Allowed\n$/);
  const j = JSON.parse(cli([LIB, '--with', 'days late=3', '--json']).stdout);
  assert.deepEqual([j.rule, j.answer, j.ruleIndex], ['Late fee', 'Small fee', 0]);
});

test('asking: one value at a time, a mistake gets a plain retry, and another case on request', () => {
  const r = cli([LIB], 'ten\n10\ny\n5\nn\n');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^⚡ Let's try "Late fee" from library\.py\.\nIt takes: days late \(a number\)\n/);
  assert.match(r.stdout, /"ten" isn't a number\. Write one like 10 or 2\.5\./);
  assert.match(r.stdout, /Answer: Big fee[\s\S]*Try another\? \(y\/n\) > y[\s\S]*Answer: Small fee[\s\S]*Try another\? \(y\/n\) > n\n$/);
});

test('only rules: an action is refused with the reason and where to read it', () => {
  const r = cli([REG, '--focus', 'save user']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /"Save user" is not a rule: it does things .* so Thunder won't run it to try it\. Try works on rules: "Can register"\. See what "Save user" does: thunder read .*register\.ts --level flow --focus "Save user"/);
});

test('mistakes say exactly what to write', () => {
  assert.match(cli([REG, '--with', 'age=15']).stderr, /Give a value for parent approved, like --with "parent approved=yes"\./);
  assert.match(cli([REG, '--with', 'height=3, age=1, parent approved=no']).stderr, /This rule has no "height"\. It takes: age, parent approved\./);
  assert.match(cli([REG, '--with', 'age=old, parent approved=no']).stderr, /age: "old" isn't a number\./);
  assert.match(cli([REG, '--focus', 'nope']).stderr, /there is no rule "nope" in .*register\.ts\. The rules: "Can register"\./);
  assert.match(cli([join(dir, 'missing.py')]).stderr, /couldn't open .*missing\.py: there is no such file\./);
  assert.equal(parseValue({ kind: 'yesno' }, 'maybe').error, '"maybe" isn\'t yes or no. Write yes or no.');
  assert.equal(parseValue({ kind: 'number' }, '$1,250.50').value, 1250.5);
});

test('the answer is the engine\'s, from the rule the reader understood', () => {
  const [rule] = rulesIn(`def fee(days_late: int) -> str:\n    if days_late <= 7:\n        return "Small"\n    return "Big"\n`, 'f.py');
  const w = parseWith(rule.plain, ['days late=8']);
  assert.equal(tryRule(rule.plain, w.values).answer, 'Big');
  assert.equal(tryRule(rule.plain, parseWith(rule.plain, ['days late=7']).values).answer, 'Small');
});
