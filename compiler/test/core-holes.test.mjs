// Typed holes (roadmap D.2): ? or ?number in a draft. A hole is a valid part of a draft that never runs or ships;
// the checker says what kind it needs and what is available there, and never chooses a value (TC120).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compileCore } from '../src/core/index.mjs';
import { formatCore } from '../src/core/format.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const thunder = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

const ORDER = [
  'A Line has:', '  Price is money', '  Quantity is whole number', '',
  'Keep tax rate at 7%', '',
  'To line total:', '  Receive price as money and quantity as whole number',
  '  Set line to a Line with price price and quantity ?',
  '  Give ?money', '',
  'To describe:', '  Receive line as Line', '  Give "{line\'s quantity} at {line\'s price}"', '',
  'Set first to a Line with price $2 and quantity 3',
  'say describe with ?',
  'say "{?}"',
].join('\n');

const holes = (src) => compileCore(src, { file: 'm.thunder' }).holes;

test('a draft with holes compiles to holes only: ok is false, draft is true, nothing is generated', () => {
  const r = compileCore(ORDER, { file: 'm.thunder' });
  assert.equal(r.ok, false);
  assert.equal(r.draft, true);
  assert.equal(r.python, null);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ['TC120', 'TC120', 'TC120', 'TC120']);
  assert.deepEqual(r.holes.map((h) => h.line), [9, 10, 17, 18]);
});

test('each hole says what it needs: the kind written after ?, or the kind expected where it stands', () => {
  const [field, give, input, any] = holes(ORDER);
  assert.equal(field.hole.needs, 'a whole number'); // a Line's quantity
  assert.equal(field.hole.written, false);
  assert.equal(give.hole.needs, 'money'); // written: ?money
  assert.equal(give.hole.written, true);
  assert.equal(input.hole.needs, 'a Line'); // describe receives line as Line (the record's own name)
  assert.equal(any.hole.needs, null);
  assert.match(any.message, /it needs a value/);
});

test('it lists only what really is that kind, by name, and never picks one', () => {
  const [field, give, input, any] = holes(ORDER);
  assert.deepEqual(field.hole.available.map((a) => a.name), ['quantity']); // not tax rate, a number
  assert.equal(field.hint, 'Here, a whole number could come from: quantity (input).');
  assert.deepEqual(give.hole.available.map((a) => [a.name, a.what]), [['price', 'input']]);
  assert.deepEqual(input.hole.available.map((a) => a.name), ['first']);
  assert.deepEqual(any.hole.available.map((a) => a.name).sort(), ['first', 'tax rate']);
  assert.match(any.hint, /Write the kind after the \? \(\?number\) to see only what fits/);
  for (const h of [field, give, input, any]) assert.match(h.message, /Thunder won't choose it for you/);
});

test('functions that give the kind are offered too, written the way they are called', () => {
  const src = 'To fee:\n  Receive amount as money\n  Give amount * 2\n\nTo charge:\n  Receive cost as money\n  Give ?money\n';
  const [h] = holes(src);
  assert.deepEqual(h.hole.available.map((a) => [a.name, a.what]), [['cost', 'input'], ['fee', 'function']]);
  assert.equal(h.hint, 'Here, money could come from: cost (input), fee with amount (a function).');
});

test('a hole with nothing to offer says so, and suggests writing or receiving the value', () => {
  const [h] = holes('Set total to ?number\n');
  assert.equal(h.hint, 'Nothing here is a number yet. Write the value, or receive it as an input.');
});

test('a hole has its kind, so nothing else on the line is reported because of it', () => {
  assert.deepEqual(compileCore('Set total to ?number + 1\nsay total + 2\n', { file: 'm.thunder' }).diagnostics.map((d) => d.code), ['TC120']);
  assert.deepEqual(compileCore('Set name to ?text\nsay name + 1\n', { file: 'm.thunder' }).diagnostics.map((d) => d.code).sort(), ['TC120', 'TC305']);
});

test('a misspelt kind right after ? is reported as a kind, not taken as a name', () => {
  const r = compileCore('Set x to ?Habt\n', { file: 'm.thunder' });
  assert.deepEqual(r.diagnostics.map((d) => d.code), ['TC306']);
  assert.equal(r.draft, false);
});

test('a hole next to real problems: both are reported, and it is not called a draft', () => {
  const r = compileCore('Set x to ?number\nsay y\n', { file: 'm.thunder' });
  assert.deepEqual(r.diagnostics.map((d) => d.code).sort(), ['TC120', 'TC201']);
  assert.equal(r.draft, false);
  assert.equal(r.holes.length, 1);
});

test('the column of each hole is given, for editors', () => {
  const [h] = holes('Set total to ?number\n');
  assert.equal(h.hole.col, 14);
});

test('formatting keeps holes exactly as written', () => {
  const src = 'Set total to ?number + 1\nsay "{?}"\n';
  assert.equal(formatCore(src), src);
});

test('the CLI calls a draft a draft: check names the holes, run and build do nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-holes-'));
  try {
    writeFileSync(join(dir, 'main.thunder'), ORDER);
    const c = thunder(['check', 'main.thunder'], dir);
    assert.equal(c.status, 1);
    assert.match(c.stderr, /thunder check: a draft with 4 holes to fill in, and nothing else to fix\./);
    assert.match(c.stderr, /main\.thunder, line 9: This is a hole: it needs a whole number.*\[TC120\]/s);
    const r = thunder(['run', 'main.thunder'], dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /thunder run: this is a draft with 4 holes to fill in; nothing was run\./);
    assert.equal(r.stdout, '');
    const b = thunder(['build', 'main.thunder', '--core', '--target', 'typescript'], dir);
    assert.equal(b.status, 1);
    assert.match(b.stderr, /nothing was built/);
    writeFileSync(join(dir, 'main.thunder'), 'Set x to ?number\nsay y\n');
    assert.match(thunder(['check', 'main.thunder'], dir).stderr, /thunder check: 1 problem and 1 hole in 1 of 1 file\./);
    const j = JSON.parse(thunder(['check', 'main.thunder', '--json'], dir).stdout);
    assert.ok(j.files[0].diagnostics.some((d) => d.code === 'TC120' && d.hole && Array.isArray(d.hole.available)));
    assert.equal(existsSync(join(dir, 'generated')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
