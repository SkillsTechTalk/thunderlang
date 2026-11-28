// HTTP in Thunder Core (roadmap 2.3b): endpoints (When someone calls GET /habits:), statuses, calling another
// service (the answer from GET "…" as Rate), and "calling GET /…" in tests. Python, compiled TypeScript, and the
// Thunder engine must answer every request with the same status and the same bytes; other targets refuse (TC411).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { createServer as httpServer } from 'node:http';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compileCore } from '../src/core/index.mjs';
import { findPython } from '../src/core/project.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const PY = findPython();
const thunder = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const WAYS = [['--engine', 'thunder'], ['--core', '--target', 'typescript'], ...(PY.error ? [] : [['--core']])];

const HABITS = `A Habit has:
  Name is text
  Streak is whole number
  Pledge is money
  Never allow a negative streak

Store habits as a list of Habit

When someone calls GET /habits:
  Give habits

When someone calls GET /habits/{wanted}:
  Receive wanted as text
  Set found to habits where name is wanted
  When found is empty:
    Stop with "No habit called {wanted}" and status 404
  Give found at 1

When someone calls POST /habits:
  Receive name as text and pledge as money and streak as whole number (0 if not given)
  Add a Habit with name name and streak streak and pledge pledge to habits
  Give the last of habits with status 201

Test "endpoints called directly":
  Expect calling POST /habits with name "run" and pledge $2 to be a Habit with name "run" and streak 0 and pledge $2
  Expect calling POST /habits with name "row" and pledge $1 and streak 4 to be a Habit with name "row" and streak 4 and pledge $1
  Expect calling GET /habits/walk to fail with "No habit called walk"
`;

const codes = (src) => compileCore(src, { file: 'm.thunder' }).diagnostics.map((d) => d.code);
const problem = (src, code) => compileCore(src, { file: 'm.thunder' }).diagnostics.find((d) => d.code === code);

function project(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-http-'));
  try { for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text); return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
async function project2(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-http-'));
  try { for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text); return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });

/** Start `thunder run` for a program with endpoints, wait for it to answer, and give back { port, stop, log }. */
async function serve(dir, file, way) {
  const port = await freePort();
  const child = spawn(process.execPath, [CLI, 'run', file, ...way, '--port', String(port)], { cwd: dir, env: { ...process.env, NO_COLOR: '1' } });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 200 && !log.includes('Thunder is answering'); i++) await new Promise((r) => setTimeout(r, 100));
  assert.match(log, /Thunder is answering on http:\/\/127\.0\.0\.1:\d+/, `${way.join(' ')} did not start:\n${log}`);
  return { port, log: () => log, stop: () => new Promise((r) => { child.on('exit', r); child.kill('SIGINT'); }) };
}
const ask = async (port, method, path, body) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  return `${r.status} ${await r.text()}`;
};

test('endpoints check: the path, the inputs, the statuses, and calls in tests say what is wrong', () => {
  assert.deepEqual(codes(HABITS), []);
  assert.match(problem('When someone calls GET /habits/{name}:\n  Give 1\n', 'TC207').message, /The path has \{name\}, but the endpoint doesn't receive "name"/);
  assert.match(problem('When someone calls GET /x:\n  Give 1\n\nWhen someone calls GET /x:\n  Give 2\n', 'TC203').message, /"GET \/x" is already defined on line 1/);
  assert.match(problem('When someone calls GET /x/{code}:\n  Receive code\n  Give 1\n\nWhen someone calls GET /x/{name}:\n  Receive name\n  Give 2\n', 'TC203').message, /GET \/x\/\{name\} is answered already, by GET \/x\/\{code\}/);
  assert.match(problem('A Habit has:\n  Name is text\n\nWhen someone calls POST /x:\n  Receive habit as Habit\n  Give 1\n', 'TC306').message, /can't come from a request/);
  assert.match(problem('To f:\n  Give 1 with status 201\n', 'TC218').message, /goes inside "When someone calls/);
  assert.match(problem('When someone calls GET /x:\n  Give 1 with status 404\n', 'TC303').message, /from 200 to 299/);
  assert.match(problem('When someone calls GET /x:\n  Stop with "no" and status 200\n', 'TC303').message, /from 400 to 599/);
  assert.match(problem(`${HABITS}\nTest "t":\n  Expect calling GET /nope to be 1\n`, 'TC207').message, /Nothing in this program answers GET \/nope/);
  assert.match(problem(`${HABITS}\nTest "t":\n  Expect calling POST /habits with name "x" to be 1\n`, 'TC207').message, /needs "pledge"/);
  assert.match(problem('Set x to the answer from GET "https://x.test" as number\n', 'TC306').message, /read as a record or a list of records/);
  assert.match(problem('Set x to the answer from GET 5\n', 'TC305').message, /The address to call is text/);
});

test('tests call endpoints directly, the same on every engine, and never open a port', () => {
  project({ 'habits.thunder': HABITS }, (dir) => {
    for (const way of WAYS) {
      const r = thunder(['test', 'habits.thunder', ...way], dir);
      assert.match(r.stdout, /1 test: 1 passed, 0 failed/, `${way.join(' ')}\n${r.stdout}${r.stderr}`);
    }
  });
});

test('Python, compiled TypeScript, and the Thunder engine answer every request the same way, and save after each', async () => {
  const requests = [
    ['GET', '/habits'],
    ['POST', '/habits', { name: 'walk', pledge: '1.50' }],
    ['POST', '/habits', { name: 'read', pledge: '2', streak: 3 }],
    ['GET', '/habits/walk'],
    ['GET', '/habits/swim'],
    ['GET', '/habits?x=1'],
    ['POST', '/habits', { name: 'x' }],
    ['POST', '/habits', { name: 'x', pledge: 'lots' }],
    ['POST', '/habits', { name: 'x', pledge: '1', streak: -1 }],
    ['POST', '/habits', 'not json'],
    ['POST', '/habits', '[1]'],
    ['DELETE', '/habits'],
    ['GET', '/nope'],
  ];
  const answers = {};
  for (const way of WAYS) {
    await project2({ 'habits.thunder': HABITS }, async (dir) => {
      const s = await serve(dir, 'habits.thunder', way);
      try {
        answers[way.join(' ')] = [];
        for (const [m, p, b] of requests) answers[way.join(' ')].push(`${m} ${p} -> ${await ask(s.port, m, p, b)}`);
        assert.deepEqual(JSON.parse(readFileSync(join(dir, 'data', 'habits.json'), 'utf8')).map((h) => h.name), ['walk', 'read']);
        assert.match(s.log(), /POST \/habits -> 201/);
      } finally { await s.stop(); }
    });
  }
  const [first, ...rest] = Object.values(answers);
  assert.deepEqual(first, [
    'GET /habits -> 200 []',
    'POST /habits -> 201 {"name":"walk","streak":0,"pledge":"1.50"}',
    'POST /habits -> 201 {"name":"read","streak":3,"pledge":"2.00"}',
    'GET /habits/walk -> 200 {"name":"walk","streak":0,"pledge":"1.50"}',
    'GET /habits/swim -> 404 {"problem":"No habit called swim"}',
    'GET /habits?x=1 -> 200 [{"name":"walk","streak":0,"pledge":"1.50"},{"name":"read","streak":3,"pledge":"2.00"}]',
    'POST /habits -> 400 {"problem":"POST /habits needs pledge (money)."}',
    'POST /habits -> 400 {"problem":"\\"pledge\\" should be money, but the request has \\"lots\\"."}',
    'POST /habits -> 422 {"problem":"Never allow a negative streak (the rule on line 5), but the value is -1."}',
    'POST /habits -> 400 {"problem":"The request\'s body is not JSON Thunder can read."}',
    'POST /habits -> 400 {"problem":"The request\'s body should be a JSON object, written { … }."}',
    'DELETE /habits -> 405 {"problem":"/habits answers only GET, POST."}',
    'GET /nope -> 404 {"problem":"Nothing here answers GET /nope."}',
  ]);
  for (const other of rest) assert.deepEqual(other, first);
});

test('calling another service: records read by kind, text as is, and failures in words, the same on every engine', async () => {
  const port = await freePort();
  const svc = httpServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (status, text) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(text); };
      if (req.url === '/rates/usd') return send(200, '{"code":"usd","rate":"1.08","updated":"2026-11-28"}');
      if (req.url === '/rates') return send(200, '[{"code":"usd","rate":"1.08","updated":"2026-11-28"},{"code":"eur","rate":1,"updated":"2026-11-27"}]');
      if (req.url === '/echo') return send(201, body);
      if (req.url === '/odd') return send(200, '{"code":"usd","rate":"lots","updated":"2026-11-28"}');
      return send(404, '{"problem":"No rate"}');
    });
  });
  await new Promise((ok) => svc.listen(port, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${port}`;
  const client = `A Rate has:
  Code is text
  Rate is number
  Updated is date

A Note has:
  Amount is money
  Note is text

Set usd to the answer from GET "${base}/rates/usd" as Rate
say "{usd's code}: {usd's rate} on {usd's updated}, doubled {usd's rate * 2}"
Set all to the answer from GET "${base}/rates" as list of Rate
say the count of all
say the answer from GET "${base}/rates/usd"
Set note to a Note with amount $2.50 and note "hi"
say the answer from POST "${base}/echo" with note
Set back to the answer from POST "${base}/echo" with note as Note
say back's amount + $1
Set missing to the answer from GET "${base}/rates/gbp" as Rate
If this fails:
  say "failed: {error}"
Set odd to the answer from GET "${base}/odd" as Rate
If this fails:
  say "failed: {error}"
Set gone to the answer from GET "http://127.0.0.1:1"
If this fails:
  say "failed"
`;
  try {
    const outs = await project2({ 'client.thunder': client }, async (dir) => {
      const got = {};
      for (const way of WAYS) {
        const child = spawn(process.execPath, [CLI, 'run', 'client.thunder', ...way], { cwd: dir, env: { ...process.env, NO_COLOR: '1' } });
        let out = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { out += d; });
        await new Promise((r) => child.on('exit', r));
        got[way.join(' ')] = out;
      }
      return got;
    });
    const [first, ...rest] = Object.values(outs);
    assert.equal(first, [
      'usd: 1.08 on 2026-11-28, doubled 2.16',
      '2',
      '{"code":"usd","rate":"1.08","updated":"2026-11-28"}',
      '{"amount":"2.50","note":"hi"}',
      '$3.50',
      `failed: GET ${base}/rates/gbp answered 404: {"problem":"No rate"}`,
      `failed: The answer from GET ${base}/odd, "rate" should be a number, but it has "lots".`,
      'failed',
      '',
    ].join('\n'));
    for (const other of rest) assert.equal(other, first);
  } finally { svc.close(); }
});

test('every other target refuses endpoints and calls to other services (TC411)', () => {
  project({ 'habits.thunder': HABITS, 'client.thunder': 'Set x to the answer from GET "https://x.test"\nsay x\n' }, (dir) => {
    for (const target of ['csharp', 'go', 'java', 'rust']) {
      for (const file of ['habits.thunder', 'client.thunder']) {
        const r = thunder(['build', '--core', file, '--target', target], dir);
        assert.notEqual(r.status, 0, `${target} ${file}`);
        assert.match(r.stdout + r.stderr, /HTTP works only on Python, TypeScript, and the Thunder engine for now.*\[TC411\]/s, `${target} ${file}`);
      }
    }
  });
});

test('the CLI refuses an option it does not know, instead of quietly running the default', () => {
  project({ 'm.thunder': 'say 1\n' }, (dir) => {
    const joined = thunder(['run', 'm.thunder', '--core --target typescript'], dir);
    assert.equal(joined.status, 2);
    assert.match(joined.stderr, /I don't know the option "--core --target typescript"\. Options are separate words/);
    assert.match(thunder(['run', 'm.thunder', '--enigne', 'thunder'], dir).stderr, /Did you mean --engine\?/);
    assert.match(thunder(['check', 'm.thunder', '--port', '8080'], dir).stderr, /--port is for thunder run/);
  });
});
