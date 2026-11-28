// Behaviour changes in Thunder Core programs (roadmap 3.4 + D.5): rules paired by stable names, both versions run on
// the same inputs, tests run before and after, and what to look at again (affectedBy). Also thunder review on Core
// files, thunder affected, the MCP tools, and the engine's step limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { coreChanges, affectedBy, renderAffected } from '../src/core-changes.mjs';
import { thunderReview } from '../src/review.mjs';
import { compileCore } from '../src/core/index.mjs';
import { engineForCalls, OutOfSteps } from '../src/core/engine-core.mjs';
import { createMcpHandler, REMOTE_SAFE_TOOLS } from '../src/mcp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'src', 'cli.mjs');
const APP = join(HERE, '..', '..', 'examples', 'apps', 'refund-desk');
const desk = ['src/desk.thunder', 'tests/desk-tests.thunder'].map((p) => ({ path: p, source: readFileSync(join(APP, p), 'utf8') }));
const edited = (from, to) => desk.map((f) => ({ ...f, source: f.source.split(from).join(to) }));
const byId = (r, id) => r.changes.find((c) => c.id === id);

test('a kept value changes: the rule that uses it is run before and after, and the answers that changed are named', () => {
  const r = coreChanges(desk, edited('Keep review limit at $100', 'Keep review limit at $50'));
  const kept = byId(r, 'keep:review limit');
  assert.equal(kept.says, 'Now $50 (was $100).');
  assert.deepEqual(kept.affects.map((x) => x.subject), ['decide refund', 'POST /orders/{number}/refunds', 'test "the refund rule"', 'test "an order takes stock, and a refund is decided"']);
  assert.deepEqual(kept.affects.find((x) => x.subject === 'POST /orders/{number}/refunds').via, ['decide refund']);
  const rule = byId(r, 'function:decide refund');
  assert.equal(rule.change, 'affected');
  assert.deepEqual(rule.through, ['review limit']);
  const [first, second] = rule.behaviour.groups;
  assert.equal(first.says, 'now a review Refund instead of an approved Refund');
  assert.equal(first.where, 'amount is from $50.00 to $99.99');
  assert.match(second.says, /^still a review Refund, but its reason is now "Refunds of \$50\.00 or more are checked by a person\." instead of "Refunds of \$100\.00/);
  assert.equal(second.where, 'amount is $100.00 or more');
  assert.match(rule.says, /^Its own steps are the same, but it uses review limit, which changed\. On \d+ inputs tried, \d+ answers changed: now a review Refund instead of an approved Refund when amount is from \$50\.00 to \$99\.99 \(\d+ inputs; for example amount \$50\.00, /);
  // The test that checks the old limit passed before and fails now; it is the first thing to read.
  assert.equal(r.changes[0].id, 'test:the refund rule');
  assert.equal(r.changes[0].severity, 'risk');
  assert.match(r.changes[0].says, /^Passed before and fails now: Expect decide refund with big and \$120 /);
  assert.equal(kept.affects.find((x) => x.id === 'test:the refund rule').test, 'fails');
  assert.equal(kept.affects.find((x) => x.id === 'test:an order takes stock, and a refund is decided').test, 'passes');
});

test('a step changes: only the inputs whose answer changed are reported (at least -> more than: exactly $100)', () => {
  const r = coreChanges(desk, edited('When amount is at least review limit:', 'When amount is more than review limit:'));
  assert.deepEqual(r.changes.map((c) => c.id), ['function:decide refund']);
  const [g, ...rest] = r.changes[0].behaviour.groups;
  assert.equal(rest.length, 0);
  assert.equal(g.says, 'now an approved Refund instead of a review Refund');
  assert.equal(g.where, 'amount is $100.00');
  assert.ok(r.changes[0].before.includes('  When amount is at least review limit:'));
  assert.ok(r.changes[0].after.includes('  When amount is more than review limit:'));
});

test('the same inputs every time, so a review comment does not change between runs', () => {
  const a = coreChanges(desk, edited('Keep review limit at $100', 'Keep review limit at $50'));
  const b = coreChanges(desk, edited('Keep review limit at $100', 'Keep review limit at $50'));
  assert.deepEqual(a, b);
});

test('rules are paired by name, not line: moved, re-spaced, and commented code is unchanged', () => {
  const src = desk[0].source;
  const at = src.indexOf('To find product:');
  const block = src.slice(at, src.indexOf('To product exists:'));
  const moved = `${src.slice(0, at)}${src.slice(at + block.length)}\n# Moved to the end, with a comment.\n${block.replace('Give found at 1', 'Give found at 1   ')}`;
  const r = coreChanges(desk, [{ ...desk[0], source: moved }, desk[1]]);
  assert.deepEqual(r.changes, []);
  assert.ok(r.unchanged > 15);
});

test('a function renamed with the same steps is a rename, not one removed and one added', () => {
  const r = coreChanges(desk, edited('product exists', 'has product'));
  const renamed = r.changes.filter((c) => c.change === 'renamed');
  assert.deepEqual(renamed.map((c) => [c.id, c.says.split('.')[0]]), [['function:has product', 'Renamed from product exists, with the same steps']]);
  assert.ok(!r.changes.some((c) => c.change === 'removed' || c.change === 'added'));
});

test('a Never rule removed is a risk, with what relied on it', () => {
  const r = coreChanges(desk, edited('  Never allow a negative stock\n', ''));
  const c = byId(r, 'never:Product: Never allow a negative stock');
  assert.equal(c.severity, 'risk');
  assert.equal(c.says, 'Product no longer has this rule, so values it refused are now allowed.');
  assert.deepEqual(c.affects.map((x) => x.subject), ['POST /products', 'POST /orders', 'test "an order takes stock, and a refund is decided"']);
});

test('a function that uses saved data or another service is not run, and says why', () => {
  const r = coreChanges(desk, edited('There is no product {wanted}.', 'No product {wanted}.'));
  assert.match(byId(r, 'function:find product').says, /Not run: it reads or changes saved data \(a stored list\), so it is not run here\./);
  const call = (msg) => [{ path: 'm.thunder', source: `To rate:\n  Receive code as text\n  Set r to the answer from GET "https://example.com/{code}"\n  Give "${msg}"\n` }];
  assert.match(coreChanges(call('a'), call('b')).changes[0].says, /Not run: it calls another service/);
});

test('when the new version does not compile, that is the one risk (the tests are not blamed for src/)', () => {
  const r = coreChanges(desk, edited('Give products\n', 'Give productz\n'));
  const broken = r.changes.filter((c) => c.change === 'not-compiled');
  assert.deepEqual(broken.map((c) => c.file), ['src/desk.thunder']);
  assert.match(broken[0].says, /^The new version has 1 problem \(line 60: I don't know what "productz" is\.\), so its behaviour can't be compared: fix it first\.$/);
});

test('a call that never finishes stops at the step limit and is counted, not run forever', () => {
  const v = (n) => [{ path: 'm.thunder', source: `To spin:\n  Receive n as whole number\n  Set i to 0\n  Repeat while n is more than ${n}:\n    Set i to i + 1\n  Give i\n` }];
  const t = Date.now();
  const r = coreChanges(v(5), v(6));
  assert.ok(Date.now() - t < 20000);
  const run = r.changes[0].behaviour;
  assert.ok(run.unknown > 0, JSON.stringify(run));
  assert.match(r.changes[0].says, /did not finish within the step limit/);
});

test('running out of steps is never caught by Try or counted as the failure an Expect waits for', () => {
  const src = 'To spin:\n  Set i to 0\n  Repeat while yes:\n    Set i to i + 1\n  Give i\n\nTo guarded:\n  Set x to spin\n  If this fails:\n    Give -1\n  Give x\n\nTest "spins":\n  Expect spin to fail\n';
  const r = Object.assign(compileCore(src, { file: 'm.thunder' }), { kind: 'src' });
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const api = engineForCalls({ results: [r], steps: 1000 });
  const f = (name) => r.info.funcs.find((x) => x.name === name);
  assert.throws(() => api.call(api.mods[0], f('guarded'), []), OutOfSteps);
  assert.throws(() => api.test(api.mods[0], r.info.tests[0]), OutOfSteps);
});

test('affectedBy: functions, endpoints, tests, examples, and what they rely on, each with how it is reached', () => {
  const r = affectedBy(desk, 'review limit');
  assert.deepEqual(r.of.map((x) => x.id), ['keep:review limit']);
  assert.deepEqual(r.functions.map((x) => [x.subject, x.line]), [['decide refund', 32]]);
  assert.deepEqual(r.endpoints.map((x) => [x.subject, x.via]), [['POST /orders/{number}/refunds', ['review limit', 'decide refund']]]);
  assert.deepEqual(r.tests.map((x) => x.subject), ['test "the refund rule"', 'test "an order takes stock, and a refund is decided"']);
  assert.deepEqual(r.examples.map((x) => x.line), [5, 6, 8, 14, 15]);
  assert.deepEqual(r.rules, []); // the Product rules are used only by a test here, which checks and does not run the app
  assert.deepEqual(r.stored.map((x) => [x.subject, x.usedBy]), [['stored list refunds', 'POST /orders/{number}/refunds']]);
  const product = affectedBy(desk, ['Product', 'nope']);
  assert.deepEqual(product.unknown, ['nope']);
  assert.deepEqual(product.rules.map((x) => x.subject), ['Product: Never allow a negative stock', 'Product: Never allow a negative price']);
  assert.match(renderAffected(product), /^No rule called "nope" in these files\./);
  assert.match(renderAffected(r), /POST \/orders\/\{number\}\/refunds {2}src\/desk\.thunder:84 {2}\(through decide refund\)/);
});

test('thunder review reads Thunder Core files instead of listing them as not read', () => {
  const r = thunderReview([desk[0]], [edited('Keep review limit at $100', 'Keep review limit at $50')[0]], { core: coreChanges, context: { old: [desk[1]], new: [desk[1]] } });
  assert.deepEqual(r.notRead, []);
  const kinds = r.items.map((x) => [x.severity, x.kind, x.subject]);
  assert.deepEqual(kinds, [
    ['risk', 'test-fails', 'test "the refund rule"'],
    ['meaning', 'rule-limit', 'review limit (kept value)'],
    ['meaning', 'rule-answer', 'decide refund'],
  ]);
  assert.match(r.items[1].says, /Look again at: decide refund \(`src\/desk\.thunder:32`\), .*test "the refund rule" \(`tests\/desk-tests\.thunder:3`, \*\*fails now\*\*\)/);
  assert.deepEqual(r.items[1].evidence, { before: ['Keep review limit at $100'], after: ['Keep review limit at $50'] });
  // Without the Core comparison (the small /core entry alone), a Thunder program is listed as not read, as before.
  assert.deepEqual(thunderReview([desk[0]], [edited('Keep review limit at $100', 'Keep review limit at $50')[0]]).notRead, [{ path: 'src/desk.thunder', status: 'changed' }]);
});

test('thunder review in git: the rest of the project is read too, so its tests are run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'core-review-'));
  try {
    cpSync(APP, dir, { recursive: true, filter: (p) => !/[/\\](data|generated)([/\\]|$)/.test(p.slice(APP.length)) });
    const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
    git('init', '-q'); git('add', '.'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'a');
    writeFileSync(join(dir, 'src', 'desk.thunder'), readFileSync(join(dir, 'src', 'desk.thunder'), 'utf8').replace('Keep review limit at $100', 'Keep review limit at $50'));
    const out = spawnSync(process.execPath, [CLI, 'review', 'HEAD'], { cwd: dir, encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /\*\*2 changes in meaning, 1 risk, 0 form-only\.\*\*/);
    assert.match(out.stdout, /- \*\*test "the refund rule"\*\* · `tests\/desk-tests\.thunder:3`: Passed before and fails now/);
    assert.match(out.stdout, /now a review Refund instead of an approved Refund when amount is from \$50\.00 to \$99\.99/);
    assert.doesNotMatch(out.stdout, /not read by Thunder/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('thunder affected: what to look at again, in words or JSON; an unknown name is exit 2', () => {
  const run = (...a) => spawnSync(process.execPath, [CLI, 'affected', ...a], { encoding: 'utf8' });
  const r = run('review limit', '--in', APP);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^What to look at again if review limit \(src\/desk\.thunder:29\) changes:\n\nFunctions that use it\n {2}decide refund {2}src\/desk\.thunder:32\n/);
  const j = JSON.parse(run('decide refund', '--in', APP, '--json').stdout);
  assert.equal(j.schema, 'thunder-affected-v1');
  assert.deepEqual(j.endpoints.map((x) => x.subject), ['POST /orders/{number}/refunds']);
  const none = run('nope', '--in', APP);
  assert.equal(none.status, 2);
  assert.match(none.stdout, /No rule called "nope"/);
  assert.match(run().stderr, /Use thunder affected <rule…>/);
});

test('the MCP tools: intent_core_changes (both versions in) and intent_affected (a folder), local only', async () => {
  const mcp = createMcpHandler();
  const call = async (name, args) => {
    const res = await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    return JSON.parse(res.result.content[0].text);
  };
  const r = await call('intent_core_changes', { before: desk, after: edited('Keep review limit at $100', 'Keep review limit at $50') });
  assert.equal(r.schema, 'thunder-core-changes-v1');
  assert.equal(byId(r, 'function:decide refund').behaviour.groups[0].where, 'amount is from $50.00 to $99.99');
  const a = await call('intent_affected', { path: APP, change: 'decide refund' });
  assert.deepEqual(a.tests.map((x) => x.subject), ['test "the refund rule"', 'test "an order takes stock, and a refund is decided"']);
  for (const t of ['intent_core_changes', 'intent_affected']) assert.ok(!REMOTE_SAFE_TOOLS.includes(t), t);
});

test('a project folder is read whole: new and removed files, and a data type that gains a field', () => {
  const extra = { path: 'src/notes.thunder', source: 'To note:\n  Give "hi"\n' };
  const r = coreChanges(desk, [...edited('  Refunded is money\n', '  Refunded is money\n  Note is text\n'), extra]);
  assert.equal(byId(r, 'record:Order').says, 'New field Note.');
  assert.equal(byId(r, 'function:note').change, 'added');
  const gone = coreChanges([...desk, extra], desk);
  assert.equal(byId(gone, 'function:note').says, 'Removed function.');
});
