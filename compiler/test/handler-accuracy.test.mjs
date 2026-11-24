// A real handler (from the founder's app) read accurately: what goes in (a header, a value in the address), what
// comes back (each ending, and the statuses it can stop with), its check in words, and no false endings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thunderModel, modelText, readLevel } from '../src/model.mjs';
import { sayCodeCondition, classifyStatement } from '../src/steps.mjs';

const SRC = readFileSync(new URL('./fixtures/handlers/admin-cron.ts', import.meta.url), 'utf8');
const model = () => thunderModel([{ path: 'server.ts', source: SRC }]);

test('inputs: the header and the value in the address, saying where each comes from', () => {
  assert.deepEqual(model().members[0].youGive, ['the x-admin-secret header', 'force (in the address)']);
});

test('outputs: every way it ends, with the values the code makes plain', () => {
  const m = model();
  assert.equal(m.members[0].youGetBack, 'success (yes) and data (result); or it stops with 403 or 500');
  const d = readLevel(m, 'details', m.members[0].id);
  assert.deepEqual(d.givesBack.map((g) => g.text), ['Gives back success (yes) and data (result)'], 'the bare return after the 403 is not an ending');
  assert.deepEqual(d.stops.map((s) => [s.error, s.message]), [['403 Forbidden', 'forbidden'], ['500 Internal Server Error', 'transcript generation failed']]);
});

test('the check reads in words, with the names kept exactly as written', () => {
  const text = modelText(model(), model().members[0].id);
  assert.match(text, /Ask: Is the x-admin-secret header the ADMIN_SECRET setting\?/);
  assert.match(text, /No:\n\s+- Stop: 403 Forbidden: "forbidden"/);
  assert.match(text, /Loads generate weekly transcripts from \.\/lib\/calibration\/generate-transcripts/);
});

test('!== and != read as "is not" (never a stray "!")', () => {
  assert.equal(sayCodeCondition('a !== b'), 'a is not b');
  assert.equal(sayCodeCondition('user.role !== "admin"'), 'user.role is not "admin"');
});

test('request and settings idioms in each language', () => {
  assert.equal(sayCodeCondition("req.headers['x-api-key'] === process.env.API_KEY"), 'the x-api-key header is the API_KEY setting');
  assert.equal(sayCodeCondition("request.args.get('page') == '1'"), 'the page in the address is "1"');
  assert.equal(sayCodeCondition("os.environ['MODE'] == 'prod'"), 'the MODE setting is "prod"');
  assert.equal(classifyStatement("const { a, b } = await import('./lib/x')").says, 'Loads a and b from ./lib/x');
});
