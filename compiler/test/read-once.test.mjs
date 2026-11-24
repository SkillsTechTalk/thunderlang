// Reading once: whole-app stages reuse the reading readFiles attached, and give exactly the same results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { readFiles } from '../src/read-repo.mjs';
import { thunderModel } from '../src/model.mjs';
import { thunderizeFiles } from '../src/thunderize.mjs';
import { sameMeaning } from '../src/same.mjs';

const DIR = new URL('./fixtures/things/', import.meta.url);
const files = () => readdirSync(DIR).map((f) => ({ path: f, source: readFileSync(new URL(f, DIR), 'utf8') }));

test('the model, Thunder Text, and the compare are the same whether each stage reads the files or they read once', () => {
  const read = readFiles(files());
  assert.ok(read.every((f) => f.reading), 'every file carries its reading');
  // Run every stage on the shared readings first, so a stage that changed a reading would show up below.
  const shared = { model: thunderModel(read), text: thunderizeFiles(read, { name: 'app' }), same: sameMeaning(read, read) };
  assert.deepEqual(shared.model, thunderModel(files()));
  assert.deepEqual(shared.text, thunderizeFiles(files(), { name: 'app' }));
  assert.deepEqual(shared.same, sameMeaning(files(), files()));
  assert.equal(JSON.stringify(thunderModel(read)), JSON.stringify(shared.model), 'a second pass over the same readings gives the same model');
});

test('a file that cannot be read keeps its error, and files Thunder does not read pass through', () => {
  const read = readFiles([{ path: 'notes.txt', source: 'hello' }, { path: 'a.py', source: 'def f(x):\n    return x\n' }]);
  assert.equal(read[0].reading, undefined);
  assert.ok(read[1].reading.items.length);
});
