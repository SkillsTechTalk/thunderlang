import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import * as core from '../src/core.mjs';
import * as main from '../src/index.mjs';

const SRC = "export function refundPolicy(amount: number, withinWindow: boolean): string {\n  if (amount < 100 && withinWindow) return 'Approve';\n  return 'Review';\n}\n";

for (const [name, mod] of [['/core', core], ['main', main]]) {
  test(`${name} exports whole-repo reading and promotion`, () => {
    for (const k of ['readCode', 'readRepo', 'searchRepo', 'groupByFile', 'readableLanguage', 'READ_REPO_SCHEMA', 'promoteDecision', 'PROMOTE_SCHEMA']) {
      assert.ok(k in mod, `${name} is missing ${k}`);
    }
    const reading = mod.readRepo([{ path: 'src/refund.ts', source: SRC }]);
    assert.equal(reading.schema, 'thunder-repo-reading-v1');
    const item = reading.items.find((i) => i.kind === 'decision');
    assert.ok(item, 'the decision is recovered');
    const promo = mod.promoteDecision(item);
    assert.equal(promo.ok, true);
    assert.match(promo.source, /amount: 100, withinWindow: true\) -> Review/, 'the edge example at 100 records what the code does');
  });
}

test('main exports collectReadableFiles for reading a folder on disk', () => {
  const root = mkdtempSync(join(tmpdir(), 'tl-read-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'refund.ts'), SRC);
  const files = main.collectReadableFiles(root);
  assert.deepEqual(files.map((f) => f.path), ['src/refund.ts']);
  assert.equal(main.readRepo(files).items.filter((i) => i.kind === 'decision').length, 1);
});

// dist/ is built by `npm run build:cjs` (and prepack); CI runs the tests on the sources, so skip when it is absent.
const built = existsSync(new URL('../dist/index.cjs', import.meta.url)) && existsSync(new URL('../dist/core.cjs', import.meta.url));
test('the CommonJS builds expose the same functions', { skip: built ? false : 'dist/ not built (run npm run build:cjs)' }, () => {
  const require = createRequire(import.meta.url);
  for (const p of ['../dist/index.cjs', '../dist/core.cjs']) {
    const m = require(p);
    assert.equal(typeof m.readRepo, 'function', `${p} readRepo`);
    assert.equal(typeof m.promoteDecision, 'function', `${p} promoteDecision`);
  }
});
