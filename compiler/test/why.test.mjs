// Thunder Why: an AI agent's run explained in plain words (src/why.mjs, docs/why.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { explainRun, renderWhy, renderFull, renderStep, plainError, toolAnnotations } from '../src/why.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'src', 'cli.mjs');
const FIX = join(HERE, 'fixtures', 'why');
const read = (f) => readFileSync(join(FIX, f), 'utf8');
const cli = (...args) => spawnSync(process.execPath, [CLI, 'why', ...args], { encoding: 'utf8' });

/** A small OTLP export from plain objects: [{ id, parent, name, s, e, attrs, error }]. */
const otlp = (spans, trace = 'aaaabbbbccccdddd0000111122223333') => ({
  resourceSpans: [{ scopeSpans: [{ spans: spans.map((x) => ({
    traceId: x.trace ?? trace, spanId: x.id, parentSpanId: x.parent, name: x.name ?? x.id,
    startTimeUnixNano: String(1e18 + (x.s ?? 0) * 1e6), endTimeUnixNano: String(1e18 + (x.e ?? 1) * 1e6),
    attributes: Object.entries(x.attrs || {}).map(([key, v]) => ({ key, value: typeof v === 'number' ? { intValue: String(v) } : { stringValue: v } })),
    status: x.error ? { code: 2, message: x.error } : {},
  })) }] }],
});

test('a run that stopped: the problem, its retries, what happened just before, and what would have changed it', () => {
  const r = explainRun(read('refund-stopped.otlp.json'));
  assert.equal(r.status, 'stopped');
  assert.equal(r.headline, 'The agent "support-bot" stopped with a problem after 12 seconds.');
  assert.equal(r.asked, 'Please refund order 1042, it arrived broken.');
  assert.equal(r.problem.tries, 3);
  assert.equal(r.problem.what, "Called POST pay.example.com/v1/refunds: it couldn't reach the service.");
  assert.deepEqual(r.problem.inside, { step: 5, text: '"refund_payment"' });
  assert.equal(r.problem.before.text, 'Asked the AI (claude-sonnet-5-5), which decided to use "refund_payment".');
  assert.match(r.problem.wouldHaveChanged, /^If any of the 3 tries had worked, the run would have gone past this step\. Thunder can't say/);
  // The lone top-level agent is the headline, not step 1.
  assert.equal(r.steps[0].text, 'Asked the AI (claude-sonnet-5-5), which decided to use "lookup_order"');
  const text = renderFull(r);
  for (const line of ['What happened', 'What went wrong', 'What it did', 'Step by step', 'How sure:']) assert.ok(text.includes(line), line);
  assert.match(text, /✗ 5\. Used "refund_payment" with order_id 1042, amount 40\.00, api_key \(hidden\): it stopped because step 6 did not work\./);
  assert.match(text, /✗ 6\. Called POST pay\.example\.com\/v1\/refunds: it couldn't reach the service \(3 tries\)\./);
});

test('a failed change is never reported as done, and a request inside a tool is not counted twice', () => {
  const r = explainRun(read('refund-stopped.otlp.json'));
  assert.deepEqual(r.changes.map((c) => [c.step, c.kind, c.worked, c.basis]), [[5, 'money', false, 'name']]);
  assert.match(renderWhy(r), /Did: {6}Tried to move money with "refund_payment" \(guessed from its name\)\. It did not go through, but may have partly happened\./);
});

test('a run that finished but recovered from a problem says so, and names what it changed', () => {
  const r = explainRun(read('research-finished.json'));
  assert.equal(r.status, 'finished-with-problems');
  assert.equal(r.answered, 'I emailed the team a summary of three papers.');
  assert.equal(r.recovered.length, 1);
  assert.match(r.recovered[0].text, /it worked on the second try \(before that, it asked too often, and the service told it to slow down\)/);
  assert.deepEqual(r.changes.map((c) => [c.text.split(' with ')[0], c.worked]), [['Used "send_email"', true]]);
});

test("the Python console exporter's output is read, and a cut-off answer is a problem along the way", () => {
  const r = explainRun(read('report-console.txt'));
  assert.equal(r.headline, 'The agent "report-bot" finished after 950 ms, but one step had a problem along the way.');
  assert.equal(r.steps[0].text, 'Asked the database (postgresql) to SELECT from invoices');
  assert.equal(r.warnings[0].text, "The AI's answer was cut off: it reached its length limit.");
  assert.match(renderWhy(r), /Did: {6}Only read things\./);
});

test('the collector file exporter (one OTLP object per line) is read', () => {
  const a = otlp([{ id: '01', name: 'execute_tool get_weather', attrs: { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': 'get_weather' } }]);
  const b = otlp([{ id: '02', s: 2, e: 3, attrs: { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': 'list_files' } }]);
  const r = explainRun(`${JSON.stringify(a)}\n${JSON.stringify(b)}\n`);
  assert.deepEqual(r.steps.map((s) => s.text), ['Used "get_weather"', 'Used "list_files"']);
  assert.equal(r.status, 'finished');
  assert.equal(r.headline, 'The agent finished after 3 ms with no problems.');
});

test('values that look like secrets are hidden everywhere: by name and by shape', () => {
  const r = explainRun(otlp([{ id: '01', attrs: {
    'gen_ai.tool.name': 'call_api',
    'gen_ai.tool.call.arguments': JSON.stringify({ url: 'https://x.test', headers: { Authorization: 'Bearer abcdefghijklmnop' }, note: 'use sk-proj-1234567890abcdef or ghp_abcdefghijklmnop', password: 'hunter2' }),
  } }]));
  const all = JSON.stringify(r) + renderWhy(r) + renderStep(r, 1);
  for (const secret of ['abcdefghijklmnop', 'sk-proj-1234567890abcdef', 'hunter2', 'ghp_']) assert.ok(!all.includes(secret), secret);
  assert.match(renderStep(r, 1), /"password": "\(hidden\)"/);
});

test('whether a step changes something: by request method, database operation, or tool name; otherwise unknown', () => {
  const r = explainRun(otlp([
    { id: '01', s: 0, attrs: { 'http.request.method': 'GET', 'url.full': 'https://a.test/x', 'http.response.status_code': 200 } },
    { id: '02', s: 1, attrs: { 'http.request.method': 'DELETE', 'url.full': 'https://a.test/x/1', 'http.response.status_code': 204 } },
    { id: '03', s: 2, attrs: { 'db.system.name': 'postgresql', 'db.query.text': 'INSERT INTO audit (who) VALUES ($1)' } },
    { id: '04', s: 3, attrs: { 'gen_ai.tool.name': 'searchDocs' } },
    { id: '05', s: 4, attrs: { 'gen_ai.tool.name': 'cancelSubscription' } },
    { id: '06', s: 5, attrs: { 'gen_ai.tool.name': 'run_python' } },
  ]));
  assert.deepEqual(r.steps.map((s) => s.effect), ['read', 'delete', 'create', 'read', 'change', 'unknown']);
  assert.equal(r.steps[2].text, 'Asked the database (postgresql) to INSERT into audit');
  assert.match(renderFull(r), /Could not judge whether this step changes anything: step 6 \(Used "run_python"\)\./);
  assert.match(renderWhy(r), /Unclear: {2}can't tell what "run_python" does\./);
});

test('a parent that failed only because a step inside it failed says which step', () => {
  const r = explainRun(otlp([
    { id: '01', name: 'pipeline', s: 0, e: 10, error: 'boom' },
    { id: '02', parent: '01', s: 1, e: 5, attrs: { 'gen_ai.tool.name': 'fetch_report', 'http.response.status_code': 0 } },
    { id: '03', parent: '01', s: 6, e: 9, attrs: { 'gen_ai.tool.name': 'update_ledger', 'error.type': 'KeyError' }, error: "'account_id'" },
  ]));
  assert.equal(r.status, 'stopped');
  assert.equal(r.problem.what, `Used "update_ledger": a name it looked for wasn't there: account_id.`);
  assert.equal(r.problem.before.text, 'Used "fetch_report": it worked.');
  // The wrapper span ("pipeline") is not a step: its failure is explained by the step inside it.
  assert.deepEqual(r.steps.map((s) => s.n), [1, 2]);
});

test('errors in plain words: no codes or jargon in the sentence', () => {
  const cases = [
    [{ type: 'TimeoutError' }, 'It waited too long for an answer and gave up.'],
    [{ status: 401 }, "The service didn't accept its sign-in."],
    [{ status: 403 }, "It wasn't allowed to do that."],
    [{ status: 404 }, "What it asked for wasn't there."],
    [{ status: 429 }, 'It asked too often, and the service told it to slow down.'],
    [{ status: 503 }, 'The service had a problem on its side.'],
    [{ status: 422 }, "The service didn't accept what it sent."],
    [{ type: 'TypeError', message: "unsupported operand type(s) for +: 'NoneType' and 'int'" }, 'A value it needed was empty.'],
    [{ type: 'ZeroDivisionError' }, 'It tried to divide by zero.'],
    [{ type: 'json.decoder.JSONDecodeError' }, "What came back wasn't in the expected form."],
    [{ finish: 'content_filter' }, "The AI's answer was held back by a safety filter."],
    [{ type: 'Weird' }, 'Something went wrong.'],
  ];
  for (const [e, want] of cases) {
    const p = plainError(e);
    assert.equal(p.what, want);
    assert.ok(!/\d{3}|Error|NoneType/.test(p.what), p.what);
  }
});

test('a file with several runs explains the latest and lists the others; --run picks one', () => {
  const two = { resourceSpans: [...otlp([{ id: '01', s: 0, attrs: { 'gen_ai.tool.name': 'old_lookup' } }], '1111aaaa'.padEnd(32, '0')).resourceSpans,
    ...otlp([{ id: '02', s: 100, e: 101, attrs: { 'gen_ai.tool.name': 'new_lookup' } }], '2222bbbb'.padEnd(32, '0')).resourceSpans] };
  const r = explainRun(two);
  assert.equal(r.steps[0].text, 'Used "new_lookup"');
  assert.match(renderWhy(r), /This file has 2 runs; this is the latest\. Others: --run 1111aaaa/);
  assert.equal(explainRun(two, { run: '1111' }).steps[0].text, 'Used "old_lookup"');
  assert.match(explainRun(two, { run: '9999' }).why, /No run in this file starts with 9999\. The runs are: 1111aaaa, 2222bbbb\./);
});

test('thunder why: the story, one step, JSON, and plain errors', () => {
  const ok = cli(join(FIX, 'refund-stopped.otlp.json'));
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^✗ The agent "support-bot" stopped after 12 seconds\.\n/);
  assert.ok(ok.stdout.split('\n').length <= 12, `the first screen is ${ok.stdout.split('\n').length} lines`);
  assert.match(cli(join(FIX, 'refund-stopped.otlp.json'), '--steps').stdout, /^What happened\n[\s\S]*Step by step/);
  const step = cli(join(FIX, 'refund-stopped.otlp.json'), '--step', '5');
  assert.match(step.stdout, /^Step 5\. Used "refund_payment"/);
  assert.match(step.stdout, /"api_key": "\(hidden\)"/);
  assert.match(cli(join(FIX, 'refund-stopped.otlp.json'), '--step', '99').stdout, /There is no step 99\. This run has steps 1 to 6\./);
  const json = JSON.parse(cli(join(FIX, 'research-finished.json'), '--json').stdout);
  assert.equal(json.status, 'finished-with-problems');
  const missing = cli(join(FIX, 'nope.json'));
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /couldn't open .*nope\.json: there is no such file\./);
  const empty = spawnSync(process.execPath, [CLI, 'why', '-'], { input: '{"hello": 1}', encoding: 'utf8' });
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /Thunder found no steps in this file\. It reads OpenTelemetry traces/);
  assert.match(cli('--bogus').stderr, /there is no option --bogus/);
});

test("a tool's name: every word counts and the most serious wins, so get_and_delete deletes", () => {
  const r = explainRun(otlp([
    { id: '01', s: 0, attrs: { 'gen_ai.tool.name': 'get_and_delete' } },
    { id: '02', s: 1, attrs: { 'gen_ai.tool.name': 'lookupThenRefund' } },
    { id: '03', s: 2, attrs: { 'gen_ai.tool.name': 'notify_customer' } },
  ]));
  assert.deepEqual(r.effects.map((e) => [e.name, e.kind, e.basis]), [['get_and_delete', 'delete', 'name'], ['lookupThenRefund', 'money', 'name'], ['notify_customer', 'send', 'name']]);
});

test('what a tool declares (MCP annotations, or thunder.effect on the span) beats its name', () => {
  const tools = toolAnnotations({ tools: [
    { name: 'get_and_delete', annotations: { readOnlyHint: true } },
    { name: 'sync_records', annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'wipe_cache', annotations: { readOnlyHint: false } },
    { name: 'plain_tool' },
  ] });
  const r = explainRun(otlp([
    { id: '01', s: 0, attrs: { 'gen_ai.tool.name': 'get_and_delete' } },
    { id: '02', s: 1, attrs: { 'gen_ai.tool.name': 'sync_records' } },
    { id: '03', s: 2, attrs: { 'gen_ai.tool.name': 'wipe_cache' } },
    { id: '04', s: 3, attrs: { 'gen_ai.tool.name': 'plain_tool' } },
    { id: '05', s: 4, attrs: { 'gen_ai.tool.name': 'helper', 'thunder.effect': 'send' } },
  ]), { tools });
  assert.deepEqual(r.steps.map((s) => s.effect), ['read', 'change', 'delete', 'unknown', 'send']);
  assert.deepEqual(r.effects.filter((e) => e.basis === 'declared').map((e) => e.name), ['get_and_delete', 'sync_records', 'wipe_cache', 'helper']);
  assert.match(renderWhy(r), /Changed something with "sync_records" \(the tool says so\)\./);
});

test('--allow: anything beyond the allowed kinds is named, and the command exits 1', () => {
  const r = explainRun(read('research-finished.json'), { allow: ['read'] });
  assert.deepEqual(r.notAllowed.map((e) => [e.name, e.kind]), [['send_email', 'send']]);
  assert.match(renderWhy(r), /Not OK: {3}"send_email" sent something\. Only read is allowed\./);
  assert.equal(cli(join(FIX, 'research-finished.json'), '--allow', 'read,send').status, 0);
  const no = cli(join(FIX, 'research-finished.json'), '--allow', 'read');
  assert.equal(no.status, 1);
  assert.match(cli(join(FIX, 'research-finished.json'), '--allow', 'write').stderr, /--allow takes kinds from: money, delete, send, create, change, read\. There is no "write"\./);
  assert.match(cli(join(FIX, 'research-finished.json'), '--tools', join(FIX, 'none.json')).stderr, /couldn't read the tool list .*none\.json: there is no such file\./);
});
