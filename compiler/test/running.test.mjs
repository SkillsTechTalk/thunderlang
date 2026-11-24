// The running system: evidence of what ran (proof-by-running records, stack traces, logs, OpenTelemetry spans)
// placed on Thunder's flows, and errors explained in Thunder. Fixtures in fixtures/running are real where they could
// be: library-trace.json was recorded by thunder_trace.py running a made-up school day against library.py; the Python
// traceback, Node stack, Go panic, and C# stack trace came from running library.py / library.js / library.go /
// Program.cs (paths changed to neutral ones). The Java stack is written in the JVM's standard format (no Java runtime
// on the machine that made the fixtures).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { thunderModel } from '../src/model.mjs';
import { runtimeOverlay, runtimeText, explainError, parseStack, parseStacks, fromTrace, fromStack, fromLogs, fromOtlp, countWords } from '../src/running.mjs';
import * as core from '../src/core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, 'fixtures', 'running');
const read = (f) => readFileSync(join(FX, f), 'utf8');
const CLI = join(HERE, '..', 'src', 'cli.mjs');

const libModel = () => thunderModel([{ path: 'library.py', source: read('library.py') }]);
const member = (model, name) => model.members.find((m) => m.name === name);
const nodeByText = (m, re) => m.flow.nodes.find((n) => re.test(n.text));
const allModel = () => thunderModel([
  { path: 'school/library.py', source: read('library.py') },
  { path: 'school/library.js', source: read('library.cjs') },
  { path: 'school/library.go', source: read('library.go') },
  { path: 'School/Program.cs', source: read('Program.cs') },
  { path: 'src/main/java/com/school/Library.java', source: read('Library.java') },
  { path: 'shop/orders.py', source: read('orders.py') },
]);

// ── The overlay from a recorded run ───────────────────────────────────────────────────────────────────────

test('a recorded run counts each side of each question, each Stop, and each ending', () => {
  const model = libModel();
  const o = runtimeOverlay(model, fromTrace(JSON.parse(read('library-trace.json'))));
  const borrow = member(model, 'borrow');
  const r = o.members[borrow.id];
  assert.equal(r.calls, 201);
  const shelf = r.nodes[nodeByText(borrow, /on shelf\?$/).id];
  assert.deepEqual(shelf.sides, { Yes: 84, No: 117 });
  assert.equal(shelf.ran, 201);
  const can = r.nodes[nodeByText(borrow, /^Can borrow\?$/).id];
  assert.deepEqual(can.sides, { Yes: 71, No: 13 });
  // Each Stop with the error as recorded.
  const na = r.nodes[nodeByText(borrow, /^Stop: NotAvailable/).id];
  assert.equal(na.ran, 117);
  assert.deepEqual(na.errors, [{ error: 'NotAvailable', count: 117 }]);
  assert.equal(r.nodes[nodeByText(borrow, /^Stop: CannotBorrow/).id].ran, 13);
  // Reaching the end: "Done", 201 - 117 - 13 - 1 (one crash).
  assert.equal(r.nodes[borrow.flow.nodes.find((n) => n.kind === 'end' && n.line == null).id].ran, 70);
  // Steps no evidence speaks for have no count (not zero).
  assert.equal(r.nodes[nodeByText(borrow, /^Sets the book's status/).id], undefined);
  // The Details sentence, with percentages and the answers that lead to each Stop.
  assert.match(r.says, /^Ran 201 times; stopped with NotAvailable 117 times \(58%\), when Is the book's status on shelf\? was No; stopped with CannotBorrow 13 times \(6%\), when Is the book's status on shelf\? was Yes and Can borrow\? was No/);
  // One call ended with an error that is not a Stop; the record does not say where, and the words say so.
  assert.match(r.says, /ended with an error 1 time that is not one of its Stops; the evidence does not say at which step/);
});

test('a rule: answers reached, by the return under each question', () => {
  const model = libModel();
  const o = runtimeOverlay(model, fromTrace(JSON.parse(read('library-trace.json'))));
  const fee = member(model, 'late_fee');
  const r = o.members[fee.id];
  const ran = Object.fromEntries(Object.values(r.nodes).filter((n) => n.kind === 'end').map((n) => [n.text, n.ran]));
  assert.deepEqual(ran, { 'No fee': 4, 'Small fee': 5, 'Big fee': 3 });
  assert.deepEqual(r.hotPath.map((h) => h.side ?? h.text), ['No', 'Yes', 'Small fee']);
});

test('not matched, honestly: two answers on one line, and the record does not split its count', () => {
  const model = libModel();
  const o = runtimeOverlay(model, fromTrace(JSON.parse(read('library-trace.json'))));
  const nm = o.notMatched.find((x) => x.kind === 'return' && x.line === 32);
  assert.ok(nm, 'the return of can_borrow is listed as not matched');
  assert.equal(nm.count, 84);
  assert.match(nm.reason, /Thunder draws 2 answers at line 32 of Can borrow .* the evidence does not say how many times each/);
  // And nothing was guessed for those answers.
  const can = member(model, 'can_borrow');
  assert.ok(!Object.values(o.members[can.id].nodes).some((n) => n.kind === 'end'));
});

test('evidence for code Thunder did not read is listed with the reason, never dropped or guessed', () => {
  const model = libModel();
  const o = runtimeOverlay(model, [
    { source: 'trace', kind: 'call', file: 'other.py', line: 3, fnLine: 3, count: 5 },
    { source: 'trace', kind: 'decision', file: 'library.py', line: 12, side: 'held', count: 2 },
    { source: 'trace', kind: 'decision', file: 'library.py', line: 40, side: 'held', count: 2 },
    { source: 'logs', kind: 'line', file: null, line: null, count: 3, unplaced: 'the log line names no file, line, or function' },
  ]);
  const reasons = o.notMatched.map((x) => x.reason);
  assert.ok(reasons.includes('no file Thunder read is other.py'));
  assert.ok(reasons.includes('line 12 of library.py is not inside any action or rule Thunder read'));
  assert.ok(reasons.includes('Thunder draws no question at line 40 of Borrow'));
  assert.ok(reasons.includes('the log line names no file, line, or function'));
  assert.equal(o.summary.notMatched, 12);
  assert.deepEqual(Object.values(o.members).map((r) => Object.keys(r.nodes).length), [0]);
});

test('Thunder Text overlay: counts after each node, the hottest path, and what was not matched', () => {
  const model = libModel();
  const o = runtimeOverlay(model, fromTrace(JSON.parse(read('library-trace.json'))));
  const text = runtimeText(model, o, { member: 'borrow' });
  assert.match(text, /- Ask: Is the book's status on shelf\?  \(line 36\)  \(ran 201×: Yes 84, No 117\)/);
  assert.match(text, /- Stop: NotAvailable: "Someone else has this book"  \(line 37\)  \(happened 117×: NotAvailable 117\)/);
  assert.match(text, /- Done  \(reached 70×\)/);
  assert.match(text, /Most often: Is the book's status on shelf\? No → Stop: NotAvailable/);
  assert.match(text, /Not matched \(84\)/);
  assert.equal(countWords(1204), '1,204');
});

// ── Stack traces ──────────────────────────────────────────────────────────────────────────────────────────

test('a Python traceback: the failing step, in words, with the answers that led there', () => {
  const s = parseStack(read('py-traceback.txt'));
  assert.equal(s.language, 'python');
  assert.equal(s.error, 'AttributeError');
  assert.equal(s.frames[0].line, 42);
  const x = explainError(allModel(), read('py-traceback.txt'));
  assert.equal(x.matched, true);
  assert.equal(x.text, 'Failed in Borrow, at “Adds book to student\'s books” (line 42): AttributeError: \'tuple\' object has no attribute \'append\'; it got there because Is the book\'s status on shelf? was Yes and Can borrow? was Yes.');
  // Each answer also says what is true on that side when the question splits cleanly (from review in Thunder).
  assert.deepEqual(x.path, [{ question: "Is the book's status on shelf?", answer: 'Yes', says: "the book's status is on shelf" }, { question: 'Can borrow?', answer: 'Yes' }]);
});

test('a Node stack: innermost frame Thunder read, and who called it', () => {
  const s = parseStack(read('node-stack.txt'));
  assert.equal(s.language, 'javascript');
  assert.equal(s.error, 'TypeError');
  assert.ok(s.frames.filter((f) => f.internal).length >= 5, 'node: internals are marked');
  const x = explainError(allModel(), read('node-stack.txt'));
  assert.match(x.text, /^Failed in Borrow, at “Adds book to student's books” \(line 15\): TypeError: Cannot read properties of undefined \(reading 'push'\)/);
  assert.match(x.text, /Called from Checkout, at “Calls borrow” \(line 21\)\.$/);
});

test('a Java stack: the deepest cause, the file found by its package, library frames named', () => {
  const s = parseStack(read('java-stack.txt'));
  assert.equal(s.language, 'java');
  assert.equal(s.error, 'UnsupportedOperationException');
  assert.equal(s.wrappedIn[0].error, 'RuntimeException');
  const x = explainError(allModel(), read('java-stack.txt'));
  assert.equal(x.file, 'src/main/java/com/school/Library.java');
  assert.equal(x.line, 22);
  assert.match(x.text, /^Failed in Borrow, at “Calls add” \(line 22\): UnsupportedOperationException \(raised inside ImmutableCollections.java, which this step called\)/);
  assert.match(x.text, /It reached the top as RuntimeException\.$/);
});

test('a C# stack trace and a Go panic', () => {
  const cs = explainError(allModel(), read('cs-stack.txt'));
  assert.equal(cs.language, 'csharp');
  assert.match(cs.text, /^Failed in Find, at “Gives back the title entry in books” \(line 18\): KeyNotFoundException: The given key 'Matilda' was not present in the dictionary; it got there because/);
  assert.match(cs.text, /Called from Main/);
  const go = explainError(allModel(), read('go-panic.txt'));
  assert.equal(go.language, 'go');
  assert.equal(go.error, 'runtime error');
  assert.match(go.text, /^Failed in First book, at .* \(line 26\): runtime error: index out of range \[0\] with length 0; no question comes before this step, so it happens every time\. Called from Main/);
});

test('a Stop is named as one of the ways Thunder shows it can end', () => {
  const stack = 'Traceback (most recent call last):\n  File "/srv/app/library.py", line 37, in borrow\n    raise NotAvailable("Someone else has this book")\nlibrary.NotAvailable: Someone else has this book\n';
  const x = explainError(libModel(), stack);
  assert.match(x.text, /^Stopped in Borrow, at “Stop: NotAvailable: "Someone else has this book"” \(line 37\): NotAvailable: Someone else has this book; it got there because Is the book's status on shelf\? was No\. This is one of the ways Thunder shows it can end\.$/);
});

test('pytest failure reports, and several stacks in one text', () => {
  const pytest = [
    '___________________________ test_tuple ___________________________', '',
    '    def test_tuple():', '>       lib.borrow(s, b)', '', 'tests/test_day.py:45: ', '_ _ _ _ _ _ _ _ _ _', '',
    '    def borrow(self, student, book):', '>       student.books.append(book)', "E       AttributeError: 'tuple' object has no attribute 'append'", '',
    'library.py:42: AttributeError',
  ].join('\n');
  const s = parseStack(pytest);
  assert.equal(s.error, 'AttributeError');
  assert.deepEqual(s.frames.map((f) => f.line), [42, 45]);
  assert.equal(explainError(libModel(), pytest).step.line, 42);
  const two = parseStacks(`${read('py-traceback.txt')}\n${read('node-stack.txt')}`);
  assert.deepEqual(two.map((x) => x.language), ['python', 'javascript']);
});

test('a stack Thunder cannot place says why, and still shows the error', () => {
  const x = explainError(libModel(), read('go-panic.txt'));
  assert.equal(x.matched, false);
  assert.match(x.text, /^Thunder could not place this error on a flow: no file Thunder read is library.go\. runtime error: index out of range/);
  assert.equal(explainError(libModel(), 'just some words').matched, false);
});

test('stack traces as evidence: a failure at its step, counted for its member', () => {
  const model = allModel();
  const o = runtimeOverlay(model, fromStack(read('py-traceback.txt')));
  const borrow = model.members.find((m) => m.file === 'school/library.py' && m.name === 'borrow');
  const r = o.members[borrow.id];
  assert.equal(r.failures, 1);
  const n = Object.values(r.nodes)[0];
  assert.equal(n.line, 42);
  assert.deepEqual(n.failed, [{ error: 'AttributeError', message: "'tuple' object has no attribute 'append'", count: 1 }]);
  assert.equal(n.ran, undefined, 'a crash says it failed there, not how often the step ran');
  // The test file's frame is not Thunder-read code: listed, not guessed.
  assert.equal(o.notMatched.length, 0, 'the stack was placed on its innermost frame Thunder read');
});

// ── Logs and spans ────────────────────────────────────────────────────────────────────────────────────────

test('structured logs: counts per step from file and line, every log shape, unplaced lines listed', () => {
  const model = allModel();
  const ev = fromLogs(read('logs.jsonl'));
  const o = runtimeOverlay(model, ev);
  const get = model.members.find((m) => m.name === 'get_order');
  const r = o.members[get.id];
  const at = (line) => Object.values(r.nodes).find((n) => n.line === line);
  assert.equal(at(19).ran, 3);
  assert.deepEqual(at(19).levels, { info: 3 });
  assert.deepEqual(at(13).levels, { warning: 1 });
  // ECS (log.origin) and the error with exc_info at line 15: a log line, and the crash it carried.
  assert.equal(at(15).ran, 2);
  assert.equal(at(15).failed[0].error, 'AttributeError');
  // Google Cloud's sourceLocation, on the JavaScript file.
  const jsb = model.members.find((m) => m.file === 'school/library.js' && m.name === 'borrow');
  assert.equal(Object.values(o.members[jsb.id].nodes)[0].line, 15);
  const reasons = o.notMatched.map((x) => `${x.count} ${x.reason}`);
  assert.ok(reasons.includes('1 the log line names no file, line, or function'), reasons.join('\n'));
  assert.ok(reasons.includes('1 the line is not JSON, so Thunder cannot tell where in the code it came from'));
  assert.ok(reasons.includes('1 no file Thunder read is charge.go'));
});

test('OpenTelemetry spans: calls, failures, and time per member; spans without code attributes listed', () => {
  const model = allModel();
  const o = runtimeOverlay(model, fromOtlp(read('otlp.json')));
  const get = model.members.find((m) => m.name === 'get_order');
  const r = o.members[get.id];
  assert.equal(r.calls, 2);
  assert.equal(r.failures, 1);
  assert.equal(r.timing.maxMs, 48);
  assert.ok(Math.abs(r.timing.avgMs - 30.25) < 0.01);
  // The exception's stack trace places the Stop it ended at.
  const stop = Object.values(r.nodes).find((n) => n.kind === 'stop');
  assert.equal(stop.line, 18);
  assert.deepEqual(stop.errors, [{ error: 'NotFound', message: 'Not Found', count: 1 }]);
  assert.match(r.says, /^Ran 2 times; stopped with NotFound "Not Found" 1 time \(50%\), when Is user empty\? was No and Is order empty\? was Yes; took 30 ms on average, 48 ms at the slowest\.$/);
  // The newer attribute names (code.function.name "Library.borrow", code.file.path, code.line.number).
  const borrow = model.members.find((m) => m.file === 'school/library.py' && m.name === 'borrow');
  assert.equal(o.members[borrow.id].calls, 1);
  const reasons = o.notMatched.map((x) => x.reason);
  assert.ok(reasons.includes('the span has no code.filepath, code.lineno, or code.function attributes'));
  assert.ok(reasons.includes('no file Thunder read is payments.py'));
});

test('a function name alone: placed only when exactly one member has it', () => {
  const model = allModel();
  const o = runtimeOverlay(model, [
    { source: 'otlp', kind: 'call', file: null, line: null, function: 'get_order', count: 4 },
    { source: 'otlp', kind: 'call', file: null, line: null, function: 'borrow', count: 2 },
  ]);
  assert.equal(o.members[model.members.find((m) => m.name === 'get_order').id].calls, 4);
  assert.match(o.notMatched[0].reason, /actions or rules are named borrow; the evidence names no file/);
});

// ── Surfaces ──────────────────────────────────────────────────────────────────────────────────────────────

test('/core exports the running system (browser-safe)', () => {
  for (const k of ['runtimeOverlay', 'explainError', 'fromTrace', 'fromStack', 'fromLogs', 'fromOtlp', 'runtimeText', 'parseStack']) assert.equal(typeof core[k], 'function', k);
});

test('thunder runtime prints the overlay and explains the errors', () => {
  const res = spawnSync(process.execPath, [CLI, 'runtime', FX, '--traces', join(FX, 'library-trace.json'), '--stack', join(FX, 'py-traceback.txt'), '--member', 'borrow'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Errors, explained in Thunder:\n  - Failed in Borrow, at “Adds book to student's books” \(line 42\)/);
  assert.match(res.stdout, /\(ran 201×: Yes 84, No 117\)/);
  const json = spawnSync(process.execPath, [CLI, 'runtime', FX, '--otlp', join(FX, 'otlp.json'), '--json'], { encoding: 'utf8' });
  assert.equal(json.status, 0, json.stderr);
  const o = JSON.parse(json.stdout);
  assert.equal(o.schema, 'thunder-running-v1');
  assert.ok(Object.values(o.members).some((r) => r.name === 'get_order' && r.calls === 2));
  const none = spawnSync(process.execPath, [CLI, 'runtime', FX], { encoding: 'utf8' });
  assert.equal(none.status, 2);
  assert.match(none.stderr, /no evidence given/);
});
