// Proof by running: the recorders (Python sys.monitoring, V8's debugger), the comparison with Thunder's flow, and the
// reader fixes the runs found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { verifyRun, compareRun, markExecuted, runPython, runJs } from '../src/executed.mjs';
import { thunderModel, modelText } from '../src/model.mjs';
import { readCode } from '../src/read.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PY_FIX = join(HERE, 'fixtures', 'executed', 'python');
const JS_FIX = join(HERE, 'fixtures', 'executed', 'js');
const { condition, startsStatement } = createRequire(import.meta.url)('../src/runners/thunder-trace.cjs');
const py = spawnSync('python3', ['-c', 'import sys; print(sys.version_info >= (3, 12))'], { encoding: 'utf8' });
const NO_PY = py.stdout?.trim() !== 'True' && 'needs Python 3.12 or newer (sys.monitoring)';

const member = (result, name) => result.members.find((m) => m.name === name);
const flowOf = (model, name) => model.members.find((m) => m.name === name).flow;

// ── The comparison alone, on a hand-written record ────────────────────────────────────────────────────

const SRC = `def fee(days: int) -> int:
    if days > 3:
        return 5
    total = days
    return total
`;
const model1 = () => thunderModel([{ path: 'fee.py', source: SRC }]);

test('a reading that matches the run is executed, with how much of it the run checked', () => {
  const trace = { files: { 'fee.py': { functions: { 1: { runs: 2, returns: { 3: { count: 1, values: ['5'] }, 5: { count: 1, values: ['2'] } }, raises: {}, fellOff: 0 } },
    decisions: { 2: { kind: 'if', obs: { 'body|3': 1, 'after|4': 1 } } } } } };
  const m = model1();
  const r = compareRun(m, trace);
  const fee = member(r, 'fee');
  assert.equal(fee.status, 'executed');
  assert.equal(fee.runs, 2);
  assert.deepEqual(fee.questions, { drawn: 1, checked: 1 });
  assert.deepEqual(fee.mismatches, []);
  markExecuted(m, r);
  assert.equal(m.members[0].completeness.level, 'executed');
  assert.match(m.members[0].completeness.reasons[0], /^Ran 2 times; every question and ending/);
});

test('a run that went to the other side contradicts the reading, naming the question, side, and line', () => {
  // The run says: the condition held, and the next step was line 4 (which Thunder draws after the question).
  const trace = { files: { 'fee.py': { functions: { 1: { runs: 1, returns: {}, raises: {}, fellOff: 0 } }, decisions: { 2: { kind: 'if', obs: { 'body|4': 1 } } } } } };
  const fee = member(compareRun(model1(), trace), 'fee');
  assert.equal(fee.status, 'contradicted');
  assert.deepEqual(fee.mismatches.map((x) => [x.line, x.side, x.observed]), [[2, 'Yes', 'the run went to line 4 (the condition held)']]);
  assert.match(fee.mismatches[0].expected, /the Yes side starts with "Gives back 5" \(line 3\)/);
});

test('a member no run reached is "not run"; one with nothing Thunder claims reached is "not checked"', () => {
  const r = compareRun(model1(), { files: {} });
  assert.equal(member(r, 'fee').status, 'not run');
  assert.equal(r.summary.notRun, 1);
});

test('a return on a line Thunder draws as a Stop, and a wrong error type, contradict the reading', () => {
  const src = `class Late(Exception):\n    pass\n\ndef check(days: int) -> int:\n    if days > 3:\n        raise Late("late")\n    return days\n`;
  const model = thunderModel([{ path: 'c.py', source: src }]);
  Object.defineProperty(model, '_sources', { value: new Map([['c.py', src.split('\n')]]), enumerable: false });
  const ok = compareRun(model, { files: { 'c.py': { functions: { 4: { runs: 1, returns: {}, raises: { 6: { count: 1, types: { Late: ['Late', 'Exception', 'BaseException', 'object'] } } }, fellOff: 0 } }, decisions: {} } } });
  assert.equal(member(ok, 'check').status, 'executed');
  const wrongType = compareRun(model, { files: { 'c.py': { functions: { 4: { runs: 1, returns: {}, raises: { 6: { count: 1, types: { KeyError: ['KeyError', 'LookupError', 'Exception'] } } }, fellOff: 0 } }, decisions: {} } } });
  assert.deepEqual(member(wrongType, 'check').mismatches.map((x) => [x.line, x.side, x.observed]), [[6, 'Stop', 'the run raised KeyError']]);
  const returned = compareRun(model, { files: { 'c.py': { functions: { 4: { runs: 1, returns: { 6: { count: 1, values: [] } }, raises: {}, fellOff: 0 } }, decisions: {} } } });
  assert.equal(member(returned, 'check').mismatches[0].observed, 'the run returned there');
});

test("a rule's answer must be the value the run gave back", () => {
  const src = 'def size(n: int) -> str:\n    if n > 10:\n        return "big"\n    return "small"\n';
  const model = thunderModel([{ path: 's.py', source: src }]);
  Object.defineProperty(model, '_sources', { value: new Map([['s.py', src.split('\n')]]), enumerable: false });
  const base = { decisions: { 2: { kind: 'if', obs: { 'body|3': 1 } } }, returns: { 3: 2 } };
  assert.equal(member(compareRun(model, { files: { 's.py': { ...base, functions: { 1: { runs: 1, returns: { 3: { count: 1, values: ['"big"'] } }, raises: {}, fellOff: 0 } } } } }), 'size').status, 'executed');
  const wrong = member(compareRun(model, { files: { 's.py': { ...base, functions: { 1: { runs: 1, returns: { 3: { count: 1, values: ['"huge"'] } }, raises: {}, fellOff: 0 } } } } }), 'size');
  assert.equal(wrong.status, 'contradicted');
  assert.match(wrong.mismatches[0].observed, /gave back "huge"/);
});

test('a question the run reached that the picture leaves out altogether is a contradiction', () => {
  // (A record as if line 3 held an `if` the reader skipped: no node of any member is on it.)
  const src = 'def f(x):\n    a = 1\n\n    return a\n';
  const model = thunderModel([{ path: 'f.py', source: src }]);
  const r = member(compareRun(model, { files: { 'f.py': { functions: { 1: { runs: 1, returns: {}, raises: {}, fellOff: 0 } }, decisions: { 3: { kind: 'if', obs: { 'body|4': 1 } } }, spans: {} } } }), 'f');
  assert.equal(r.status, 'contradicted');
  assert.equal(r.mismatches[0].side, 'missing');
});

// ── Python: the recorder and end to end ───────────────────────────────────────────────────────────────

test('Python end to end: every reading of the fixture is executed by its tests and made-up inputs', { skip: NO_PY }, () => {
  const { result, model } = verifyRun(PY_FIX, { lang: 'python' });
  assert.equal(result.summary.contradicted, 0, JSON.stringify(result.members.filter((m) => m.mismatches.length), null, 1));
  assert.equal(result.summary.executed, result.summary.members);
  assert.ok(result.runs.some((r) => /test functions/.test(r.how)) && result.runs.some((r) => r.how === 'generated inputs'));
  // Every question of the fixture was taken both ways or checked at least once.
  assert.equal(result.summary.questionsChecked, result.summary.questions);
  const discount = member(result, 'discount');
  assert.deepEqual(discount.decisions.find((d) => d.line === 19).observed.No > 0 && discount.decisions.find((d) => d.line === 19).observed.Yes > 0, true);
  assert.equal(model.members.find((m) => m.name === 'take').completeness.level, 'executed');
});

test('Python: a deliberately wrong flow is contradicted with the exact question, side, and line', { skip: NO_PY }, () => {
  const trace = runPython(PY_FIX, { mode: 'discover', tests: join(PY_FIX, 'tests') });
  const model = thunderModel([{ path: 'shop.py', source: readFileSync(join(PY_FIX, 'shop.py'), 'utf8') }]);
  // Swap the sides of "Is code "HALF"?" (line 21): Thunder would now say HALF takes off 1.
  const block = flowOf(model, 'discount').blocks.find((b) => b.yes && b.no && b.yes.length && b.no.length);
  [block.yes, block.no] = [block.no, block.yes];
  const d = member(compareRun(model, trace), 'discount');
  assert.equal(d.status, 'contradicted');
  assert.deepEqual(d.mismatches.map((x) => [x.line, x.side]).sort(), [[21, 'No'], [21, 'Yes']]);
  assert.match(d.mismatches.find((x) => x.side === 'Yes').observed, /went to line 22 \(the condition held\)/);
});

test('the Python recorder notes where each decision went by Python\'s own parser: body, else, case, after', { skip: NO_PY }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-py-'));
  try {
    writeFileSync(join(dir, 'm.py'), [
      'def f(xs: list) -> int:', '    for x in xs:', '        if x > 1:', '            break', '    else:', '        return -1', '    return x', '',
      'def g(k: str) -> str:', '    match k:', '        case "a":', '            return "A"', '        case _:', '            return "?"', ''].join('\n'));
    const t = runPython(dir, { mode: 'generate' });
    const d = t.files['m.py'].decisions;
    assert.ok(d[2].obs['body|3'] > 0 && d[2].obs['after|6'] > 0, JSON.stringify(d[2])); // the loop's else runs when it was not left early
    assert.ok(d[3].obs['body|4'] > 0 && d[3].obs['after|2'] > 0, JSON.stringify(d[3]));
    assert.ok(d[10].obs['case:11|12'] > 0 && d[10].obs['case:13|14'] > 0, JSON.stringify(d[10]));
    assert.deepEqual(t.files['m.py'].functions[9].returns[12].values, ['"A"']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── JavaScript: the recorder and end to end ───────────────────────────────────────────────────────────

test('JS: the condition reader skips strings, regular expressions, and comments', () => {
  assert.equal(condition('if (a === ")" && /\\)/.test(b)) {', 3), 'a === ")" && /\\)/.test(b)');
  assert.equal(condition('if (x /* ) */ > 1) y()', 3), 'x /* ) */ > 1');
  assert.equal(condition('if (x', 3), null);
  assert.equal(startsStatement('  if (user) res.send(user);', 13), true);
  assert.equal(startsStatement('  x(a(b))', 4), false);
});

test('JS end to end: the fixture\'s readings are executed by its own test script and made-up inputs', () => {
  const { result } = verifyRun(JS_FIX, { lang: 'js', command: `${JSON.stringify(process.execPath)} tests/run.mjs` });
  assert.equal(result.summary.contradicted, 0, JSON.stringify(result.members.filter((m) => m.mismatches.length), null, 1));
  assert.equal(result.summary.executed, result.summary.members);
  const fee = member(result, 'deliveryFee');
  assert.deepEqual(fee.endings.filter((e) => e.kind === 'return').map((e) => e.line).sort((a, b) => a - b), [7, 10, 12, 14]);
  assert.deepEqual(member(result, 'take').endings.find((e) => e.kind === 'raise').types, ['OutOfStock']);
});

test('JS: a deliberately wrong flow is contradicted', () => {
  const trace = runJs(JS_FIX, { mode: 'command', command: `${JSON.stringify(process.execPath)} tests/run.mjs` });
  const model = thunderModel([{ path: 'shop.mjs', source: readFileSync(join(JS_FIX, 'shop.mjs'), 'utf8') }]);
  const q = flowOf(model, 'take').nodes.find((n) => n.kind === 'decision');
  q.whenTrue = q.whenTrue === 'yes' ? 'no' : 'yes'; // the question's words now say the opposite of the code
  const take = member(compareRun(model, trace), 'take');
  assert.equal(take.status, 'contradicted');
  assert.equal(take.mismatches[0].line, 31);
});

// ── Reader fixes found by running ─────────────────────────────────────────────────────────────────────

const pyText = (src) => { const m = thunderModel([{ path: 'x.py', source: src }]); return m.members.map((x) => modelText(m, x.id)).join('\n'); };

test('Python try … else and for … else are drawn, not dropped (requests super_len)', () => {
  const t = pyText('def size(o):\n    try:\n        n = o.fileno()\n    except AttributeError:\n        pass\n    else:\n        if n > 3:\n            n = 3\n    return n\n\n\ndef first(xs):\n    for x in xs:\n        if x:\n            break\n    else:\n        return None\n    return x\n');
  assert.match(t, /If nothing went wrong/);
  assert.match(t, /Is n more than 3\?/);
  assert.match(t, /If it did not leave the loop early[^\n]*\n\s+- Gives back None/);
});

test('Python `with self.lock:` keeps its steps (it read "Calls with" and dropped them; urllib3)', () => {
  const t = pyText('def get(self, key):\n    with self.lock:\n        item = self._container.pop(key)\n        return item\n');
  assert.doesNotMatch(t, /Calls with/);
  assert.match(t, /Uses self\.lock[^\n]*\n\s+- .*\n\s+- Gives back item/);
});

test('JS else-if rules sit on their own lines (they were all placed on the first `if`)', () => {
  const r = readCode('function fee(d) {\n  if (d > 20) {\n    return 3;\n  } else if (d > 5) {\n    return 2;\n  }\n  return 1;\n}\n', { language: 'javascript' });
  assert.deepEqual(r.items.find((i) => i.name === 'fee').rules.map((x) => x.line), [2, 4]);
});
