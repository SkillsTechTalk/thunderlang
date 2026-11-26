// Thunder Core's standard operations for text, numbers, lists, and JSON (docs/core.md, "Text, lists, and JSON"),
// and how Python's built-ins are read as them (src/core/from-python.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileCore, PYTHON_RUNTIME } from '../src/core/index.mjs';
import { findPython } from '../src/core/project.mjs';
import { pythonToCore } from '../src/core/from-python.mjs';
import { verifyRoundTrip } from '../src/core/round-trip.mjs';
import { runBoth, tally, csharpAgrees } from './core-engines.mjs';

const PY = findPython();
const skip = PY.error ? `Python 3.10+ not found: ${PY.error}` : false;
const tmp = mkdtempSync(join(tmpdir(), 'thunder-stdlib-'));
test.after(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
// Every program runs on both engines (Python and the Thunder engine), which must agree (core-engines.mjs).
const run = (source) => runBoth(source);
test.after(() => console.log(`# core-stdlib: ${tally.compared} programs gave the same result on Python and the Thunder engine.`));
const codes = (src) => compileCore(src, { file: 'main.thunder' }).diagnostics.map((d) => [d.code, d.message]);

test('text: joined with, split at, the parts of, replacing, starts with, ends with', { skip }, () => {
  const r = run([
    'say ["Ada", "Grace"] joined with ", "',
    'say "a,,b" split at ","',
    'say the parts of "  the cat.  sat "',
    'say "2026-11-25" replacing "-" with "/"',
    'say "report.csv" ends with ".csv"',
    'say "report.csv" starts with "data"',
  ].join('\n'));
  assert.equal(r.err, '');
  assert.equal(r.out, 'Ada, Grace\n[a, , b]\n[the, cat., sat]\n2026/11/25\nyes\nno');
});

test('numbers and lists: the absolute value of, sorted, sorted descending', { skip }, () => {
  const r = run('say the absolute value of -2.5\nsay the absolute value of -$4.10\nsay [3, 1, 2] sorted\nsay [3, 1, 2] sorted descending');
  assert.equal(r.out, '2.5\n$4.10\n[1, 2, 3]\n[3, 2, 1]');
});

test('JSON: numbers are read exactly (0.1 + 0.2 is 0.3) and written back as they are held', { skip }, () => {
  const r = run('Set data to the JSON data in "{{\\"total\\": 0.1, \\"items\\": [1, 2.50], \\"ok\\": true, \\"none\\": null}"\nsay data at "total" + 0.2\nsay the JSON text of data');
  assert.equal(r.err, '');
  assert.equal(r.out, '0.3\n{"total": 0.1, "items": [1, 2.50], "ok": true, "none": null}');
  const bad = run('say the JSON data in "{{oops"');
  assert.equal(bad.status, 1);
  assert.match(bad.err, /This is not JSON: Expecting property name enclosed in double quotes \(line 1, column 2\)\.\s+\[TC509\]/);
});

test('kinds are checked: before running when known, while running when not', { skip }, () => {
  assert.deepEqual(codes('say [1, 2] joined with ", "'), [['TC305', '"joined with" joins text, but this list holds a whole number.']]);
  assert.deepEqual(codes('say 5 starts with "a"'), [['TC305', '"starts with" compares text, but this is a whole number.']]);
  assert.deepEqual(codes('Set m to an empty map\nsay m sorted'), [['TC305', 'Only a list can be sorted this way, but this is a map.']]);
  const r = run('To glue:\n  Receive xs\n  Give xs joined with "-"\nsay glue with ["a", "b"]\nsay glue with [1, 2]');
  assert.equal(r.out, 'a-b');
  assert.match(r.err, /"joined with" joins text, but item 1 is the number 1\. Turn it into text first\./);
  assert.match(run('To cut:\n  Receive t\n  Give t split at ""\nsay cut with "ab"').err, /needs something to split at, not empty text/);
});

const py = (src) => { const r = pythonToCore(src); return { core: r.core, f: r.functions.at(-1), ok: compileCore(r.core).ok }; };

test('Python built-ins read as Core: join, split, replace, startswith, abs, max/min, sorted, list(), dict(), json', () => {
  const cases = [
    ['def f(xs):\n    return ", ".join(xs)\n', 'Give xs joined with ", "'],
    ['def f(t):\n    return t.split(",")\n', 'Give t split at ","'],
    ['def f(t):\n    return t.lower().split()\n', 'Give the parts of (the lowercase of t)'],
    ['def f(t):\n    return t.replace("-", "/")\n', 'Give t replacing "-" with "/"'],
    ['def f(t):\n    return t.endswith(".csv")\n', 'Give t ends with ".csv"'],
    ['def f(x):\n    return abs(x)\n', 'Give the absolute value of x'],
    ['def f(low, high):\n    return max(low, high)\n', 'Give the largest of [low, high]'],
    ['def f(xs):\n    return sorted(xs, reverse=True)\n', 'Give xs sorted descending'],
    ['def f(xs):\n    return list(xs)\n', 'Give xs as list'],
    ['def f():\n    return dict()\n', 'Give an empty map'],
    ['import json\n\ndef f(t):\n    return json.loads(t)\n', 'Give the JSON data in t'],
    ['import json\n\ndef f(v):\n    return json.dumps(v)\n', 'Give the JSON text of v'],
  ];
  for (const [src, line] of cases) {
    const r = py(src);
    assert.ok(r.core.includes(`  ${line}\n`), `${src}\n${r.core}`);
    assert.equal(r.f.exact, true, src);
    assert.equal(r.ok, true, src);
  }
});

test('Python calls whose meaning differs are still refused', () => {
  const refused = [
    ['def f(t):\n    return t.startswith(("a", "b"))\n', /tuple of choices/],
    ['def f(t):\n    return t.split(",", 1)\n', /maximum number of parts/],
    ['def f(t):\n    return t.replace("a", "b", 1)\n', /with a count/],
    ['def f(xs):\n    return max(xs, key=len)\n', /calls max\(\)|key= or default=/],
    ['def f(t):\n    return json.loads(t)\n', /calls json\.loads/], // json was not imported: it could be anything
    ['import json\n\ndef f(v):\n    return json.dumps(v, indent=2)\n', /name=value inputs/],
  ];
  for (const [src, why] of refused) {
    const r = py(src);
    assert.equal(r.f.exact, false, src);
    assert.match(r.f.notTranslated.map((x) => x.why).join(' | '), why, src);
  }
});

test('round trip: text, lists, and JSON give the same results as the original Python', { skip }, () => {
  const python = [
    'import json',
    '',
    'def summary(raw, prefix):',
    '    data = json.loads(raw)',
    '    names = sorted(data["names"])',
    '    label = ", ".join(names).replace("a", "A")',
    '    if label.startswith(prefix):',
    '        return max(len(names), data["min"])',
    '    return json.dumps(names)',
  ].join('\n');
  const r = pythonToCore(python);
  assert.equal(r.functions[0].exact, true, r.core);
  const v = verifyRoundTrip({ python, core: r.core, name: 'summary', inputs: ['\'{"names": ["bo", "al"], "min": 5}\', "Al"', '\'{"names": ["bo", "al"], "min": 1}\', "Al"', '\'{"names": ["zed"], "min": 0}\', "Al"'] });
  assert.equal(v.ran, true, v.error);
  assert.deepEqual(v.cases.map((c) => [c.same, c.why ?? null]), [[true, null], [true, null], [true, null]]);
});

// Last: every program above, compiled to C# and built together, gives the same result (see core-engines.mjs).
csharpAgrees(test);
