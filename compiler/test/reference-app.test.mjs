// The reference application (roadmap 2.5): examples/apps/refund-desk, built only from shipped features. Its tests
// pass on Python, compiled TypeScript, and the Thunder engine, and a client session gets the same answers from each.
// Also the gaps building it found: statuses in helpers, tests calling src/ endpoints, src/ problems first, a value
// hidden by an item's field (TC219), and JSON for either/or values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compileCore } from '../src/core/index.mjs';
import { findPython } from '../src/core/project.mjs';
import { stopChild } from './servers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'src', 'cli.mjs');
const APP = join(HERE, '..', '..', 'examples', 'apps', 'refund-desk');
const PY = findPython();
const WAYS = [['--engine', 'thunder'], ['--target', 'typescript'], ...(PY.error ? [] : [['--core']])];
const thunder = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const codes = (src) => compileCore(src, { file: 'm.thunder' }).diagnostics.map((d) => d.code);

/** A copy of the app, so a run's data/ and generated/ never land in the repository. */
async function appCopy(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'refund-desk-'));
  try {
    cpSync(APP, dir, { recursive: true, filter: (src) => !/[/\\](data|generated)([/\\]|$)/.test(src.slice(APP.length)) });
    return await fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });

test('the reference app checks clean, and its tests pass on every engine', async () => {
  await appCopy((dir) => {
    assert.match(thunder(['check', '.'], dir).stdout, /no problems in 2 Thunder Core files/);
    for (const way of WAYS) {
      const r = thunder(['test', '.', ...way], dir);
      assert.match(r.stdout, /2 tests: 2 passed, 0 failed/, `${way.join(' ')}\n${r.stdout}${r.stderr}`);
    }
  });
});

test('a client session gets the same answers from Python, TypeScript, and the Thunder engine', async () => {
  const session = [
    ['POST', '/products', { code: 'DESK', name: 'Desk', price: '250.00', stock: 1 }],
    ['POST', '/products', { code: 'MUG', name: 'Mug', price: '15', stock: 3 }],
    ['POST', '/products', { code: 'MUG', name: 'Mug', price: '15' }],
    ['POST', '/orders', { code: 'DESK', quantity: 1 }],
    ['POST', '/orders', { code: 'MUG', quantity: 5 }],
    ['POST', '/orders', { code: 'HAT', quantity: 1 }],
    ['POST', '/orders/1/refunds', { amount: '120' }],
    ['POST', '/orders/1/refunds', { amount: '40' }],
    ['POST', '/orders/1/refunds', { amount: '300' }],
    ['GET', '/orders/1'],
    ['GET', '/orders/x'],
  ];
  const all = [];
  for (const way of WAYS) {
    await appCopy(async (dir) => {
      const port = await freePort();
      const child = spawn(process.execPath, [CLI, 'run', '.', ...way, '--port', String(port)], { cwd: dir });
      let log = '';
      child.stdout.on('data', (d) => { log += d; });
      child.stderr.on('data', (d) => { log += d; });
      try {
        for (let i = 0; i < 600 && !log.includes('Thunder is answering') && child.exitCode === null; i++) await new Promise((r) => setTimeout(r, 100));
        assert.match(log, /Thunder is answering/, `${way.join(' ')} did not start:\n${log}`);
        const got = [];
        for (const [m, p, b] of session) {
          const r = await fetch(`http://127.0.0.1:${port}${p}`, { method: m, body: b ? JSON.stringify(b) : undefined, signal: AbortSignal.timeout(15000) });
          got.push(`${r.status} ${await r.text()}`);
        }
        all.push(got);
        assert.deepEqual(JSON.parse(readFileSync(join(dir, 'data', 'products.json'), 'utf8')).map((x) => x.stock), [0, 3]);
      } finally { await stopChild(child); }
    });
  }
  assert.deepEqual(all[0], [
    '201 {"code":"DESK","name":"Desk","price":"250.00","stock":1}',
    '201 {"code":"MUG","name":"Mug","price":"15.00","stock":3}',
    '409 {"problem":"There is already a product MUG."}',
    '201 {"number":1,"code":"DESK","quantity":1,"total":"250.00","refunded":"0.00"}',
    '409 {"problem":"Only 3 of Mug left."}',
    '404 {"problem":"There is no product HAT."}',
    '201 {"which":"review","order_number":1,"amount":"120.00","reason":"Refunds of $100.00 or more are checked by a person."}',
    '201 {"which":"approved","order_number":1,"amount":"40.00"}',
    '201 {"which":"refused","order_number":1,"reason":"Only $210.00 of order 1 can still be refunded."}',
    '200 {"number":1,"code":"DESK","quantity":1,"total":"250.00","refunded":"40.00"}',
    '400 {"problem":"\\"number\\" should be a whole number, but the request has \\"x\\"."}',
  ]);
  for (const other of all.slice(1)) assert.deepEqual(other, all[0]);
});

test('a value hidden by an item\'s field inside where is a problem, with the fix (TC219)', () => {
  const src = 'An Order has:\n  Number is whole number\n\nTo find:\n  Receive number as whole number\n  Receive orders as list of Order\n  Give orders where number is number\n';
  const d = compileCore(src, { file: 'm.thunder' }).diagnostics;
  assert.deepEqual(d.map((x) => x.code), ['TC219']);
  assert.equal(d[0].message, 'Here "number" means each Order\'s number, so your own "number" (line 5) isn\'t used.');
  assert.match(d[0].hint, /where number is wanted number/);
  assert.deepEqual(codes('An Order has:\n  Number is whole number\n\nTo find:\n  Receive wanted as whole number\n  Receive orders as list of Order\n  Give orders where number is wanted\n'), []);
});

test('a Stop can carry a status from a helper; Give\'s status stays in the endpoint (TC218)', () => {
  assert.deepEqual(codes('To find:\n  Stop with "missing" and status 404\n\nWhen someone calls GET /x:\n  Give find\n'), []);
  assert.deepEqual(codes('To f:\n  Give 1 with status 201\n'), ['TC218']);
});

test('while src/ has problems, they are reported alone, not again as unknown names in the tests', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'src-first-'));
  try {
    writeFileSync(join(dir, 'thunder.toml'), '[project]\nname = "p"\n\n[build]\nsource = "src"\ntests = "tests"\nentry = "main.thunder"\n');
    cpSync(join(APP, 'src'), join(dir, 'src'), { recursive: true });
    cpSync(join(APP, 'tests'), join(dir, 'tests'), { recursive: true });
    writeFileSync(join(dir, 'src', 'desk.thunder'), `${readFileSync(join(dir, 'src', 'desk.thunder'), 'utf8')}\nsay nowhere\n`);
    const r = thunder(['check', '.'], dir);
    assert.match(r.stderr, /src\/desk\.thunder, line \d+: I don't know what "nowhere" is/);
    assert.doesNotMatch(r.stderr, /tests\/desk-tests\.thunder/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('one test file named on its own is checked and run against src/, as in the whole project', async () => {
  await appCopy((dir) => {
    assert.match(thunder(['check', 'tests/desk-tests.thunder'], dir).stdout, /no problems in 2 Thunder Core files/);
    assert.match(thunder(['test', 'tests/desk-tests.thunder', '--engine', 'thunder'], dir).stdout, /2 tests: 2 passed, 0 failed/);
  });
});
