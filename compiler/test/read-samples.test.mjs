// /read shows these samples; prove each one reads into exactly the decisions the page promises.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';
import { READ_SAMPLES } from '../../src/app/read/samples.mjs';

for (const s of READ_SAMPLES) {
  test(`sample "${s.key}" reads as promised (and its language is detected)`, () => {
    const r = readCode(s.source, { file: s.file });
    assert.equal(r.language, s.language);
    const decisions = r.items.filter((i) => i.kind === 'decision');
    assert.deepEqual(decisions.map((d) => d.name), s.expect.decisions, JSON.stringify(r.items.map((i) => [i.kind, i.name, i.unread]), null, 1));
    assert.ok(decisions.every((d) => d.status === 'read'), JSON.stringify(decisions.map((d) => d.unread)));
    for (const f of s.expect.functions) assert.ok(r.items.some((i) => i.kind === 'function' && i.name === f), `missing function ${f}`);
    assert.equal(readCode(s.source).language, s.language, 'language detection from pasted text');
    // "Show line N" must land on the function itself, never on a comment above it.
    const lines = s.source.split('\n');
    for (const it of r.items.filter((i) => i.kind === 'decision' || i.kind === 'function')) {
      assert.ok(lines[it.line - 1].includes(it.name), `${it.name} points at line ${it.line}: ${lines[it.line - 1]}`);
    }
  });
}
