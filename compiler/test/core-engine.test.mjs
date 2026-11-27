// The Thunder engine (src/core/engine.mjs) runs Thunder Core without Python, and must give exactly what the
// compiled Python gives: output, errors (code, message, line, "reached from"), and exit status. core-run and
// core-stdlib already run every one of their programs on both engines (core-engines.mjs). This file adds the
// benchmark programs, the example programs and their tests, the runnable snippets in docs/core.md, programs aimed
// at the rules most likely to differ, and the command line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compileCore } from '../src/core/index.mjs';
import { buildProject } from '../src/core/project.mjs';
import { runWithEngine } from '../src/core/engine.mjs';
import { CASES, INPUTS } from '../scripts/core-read-write.mjs';
import { runBoth, bothEngines, tally, PY, csharpAgrees } from './core-engines.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CLI = join(HERE, '..', 'src', 'cli.mjs');
const skip = PY.error ? `Python 3.10+ not found, so the engines cannot be compared here: ${PY.error}` : false;
test.after(() => console.log(`# core-engine: ${tally.compared} programs gave the same result on Python and the Thunder engine (${tally.typescript} also as TypeScript, ${tally.go} as Go); ${tally.refused} use Python modules and were refused by the engine.`));

/** A Python input like '150, True' or '[1, 2.5]' as Thunder call arguments ("150 and true"), or null. */
function thunderArgs(input) {
  if (/O\(|lambda|\{/.test(input)) return null;
  const parts = [];
  let depth = 0, cur = '', q = null;
  for (const ch of input) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  const lit = (p) => p.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'nothing').replace(/'([^']*)'/g, '"$1"');
  const args = parts.map(lit);
  return args.length <= 1 ? args.join('') : `${args.slice(0, -1).join(', ')} and ${args[args.length - 1]}`;
}

test('the benchmark programs (docs/core-read-write.md), called with their inputs, agree on both engines', { skip }, () => {
  let ran = 0;
  for (const [name, , core] of CASES) {
    const fn = (core.match(/^To ([^:]+):/gm) ?? []).map((l) => l.slice(3, -1)).find((t) => t.replace(/ /g, '_').toLowerCase() === name.toLowerCase());
    if (!fn) continue;
    for (const input of INPUTS[name] ?? []) {
      const args = thunderArgs(input);
      if (args === null) continue;
      const src = `${core}\n\nsay ${fn}${args ? ` with ${args}` : ''}`;
      if (!compileCore(src).ok) continue;
      runBoth(src);
      ran++;
    }
  }
  assert.ok(ran >= 25, `only ${ran} benchmark calls ran`);
});

test('the example programs and their tests (examples/core) agree on both engines', { skip }, () => {
  const root = join(ROOT, 'examples', 'core');
  const build = buildProject({ root, includeTests: true, write: false });
  assert.equal(build.ok, true);
  for (const r of build.results.filter((x) => x.kind === 'src')) bothEngines([r], { entry: r, cwd: root, label: r.file });
  bothEngines(build.results, { tests: true, cwd: root, label: 'examples/core tests' });
});

test('every runnable snippet in docs/core.md agrees on both engines', { skip }, () => {
  const doc = readFileSync(join(ROOT, 'docs', 'core.md'), 'utf8');
  let ran = 0;
  for (const m of doc.matchAll(/```thunder\n([\s\S]*?)```/g)) {
    const r = compileCore(m[1]);
    // An npm package runs only as TypeScript (core-npm.test.mjs covers it), not on Python or the engine.
    if (!r.ok || /read file/.test(m[1]) || r.info.modules.some((x) => (x.ecosystem ?? 'python') !== 'python')) continue;
    runBoth(m[1]);
    if (r.info.tests.length) runBoth(m[1], { tests: true });
    ran++;
  }
  assert.ok(ran >= 2, `only ${ran} snippets ran`);
});

// Programs aimed at the rules that are easiest to get subtly wrong in a second engine.
const L = (...lines) => lines.join('\n');
const PROGRAMS = {
  'exact decimals: long division, trailing zeros, negative zero': L('say 1 / 3', 'say 2 / 3', 'say 10 / 4', 'say 1.10 + 2.20', 'say 0 * -1.5', 'say 1.5 * 2', 'say 100 / 7 * 7', 'say 12345678901234567890.123 * 98765432109876543210', 'say 0.1 * 3 is 0.3', 'say 7.0 / 2.0'),
  'money: display keeps the cents it has, thousands, negatives, division': L('say $1234567.5', 'say $100 * 7%', 'say $10 / 3', 'say $0 - $5.25', 'say $19.99 * 3', 'say $10 / $4', 'say round $2.675 to 2 places', 'say $1.005 + $0', 'say -$3'),
  'rounding and remainders': L('say round 2.5', 'say round -2.5', 'say round 0.5', 'say round 1.45 to 1 places', 'say round 7', 'say 7 mod 3', 'say -7 mod 3', 'say 7 mod -3', 'say 7.5 mod 2', 'say -7.5 mod 2', 'say $7 mod $3'),
  'comparisons across kinds of numbers': L('say 1 is 1.0', 'say 2 is more than 1.5', 'say $5 is $5.00', 'say "a" is less than "b"', 'say [1, 2] is [1, 2]', 'say 3 is between 1 and 5', 'say nothing is nothing'),
  'lists: positions from 1, sorting, where, from, first and last': L('Set xs to [3, 1, 2]', 'say xs at 1', 'Set xs at 2 to 10', 'say xs', 'Sort xs', 'say xs', 'Reverse xs', 'say xs', 'say xs sorted', 'say xs sorted descending', 'say the first of xs', 'say the last of xs', 'say xs at 9 otherwise 0', 'say the count of xs', 'Add 4 to xs', 'Remove 10 from xs', 'say xs', 'say xs contains 4', 'say the sum of xs', 'say the average of xs', 'say the smallest of xs', 'say the largest of xs'),
  'maps: entries, keys, values, sorted by key and value, 1 and 1.0 are one key': L('Set m to an empty map', 'Set m at "b" to 2', 'Set m at "a" to 1', 'Set m at "c" to 3', 'say m', 'say the keys of m', 'say the values of m', 'For each key and value in m:', '  say "{key}={value}"', 'For each pair in m sorted by value descending:', '  say pair', 'Set n to an empty map', 'Set n at 1 to "one"', 'Set n at 1.0 to "uno"', 'say n', 'Remove "a" from m', 'say m', 'say m at "z" otherwise "none"'),
  'records: fields, changes, shown in words, Never rules on fields': L('An Item has:', '  Name is text', '  Price is money', '  Tags is a list of text', '  Never allow a negative price', 'Set pen to an Item with name "pen" and price $1.50', 'say pen', "say pen's tags", "Add \"blue\" to pen's tags", "Set pen's price to $2", 'say pen', "Set pen's price to -$1", 'If this fails:', '  say "refused: {error}"', "say pen's price", 'Set other to an Item with name "pen" and price $2', "say pen's name is other's name"),
  'text: interpolation of every kind, words, lines, case, trimming': L('Set n to 3', 'Set d to 2.50', 'Set m to $4', 'Set ok to true', 'Set nada to nothing', 'say "n={n} d={d} m={m} ok={ok} nada={nada} xs={[1, 2.0]}"', String.raw`say the words of "  Hello, world! It's \"quoted\"... "`, String.raw`say the lines of "a\nb\r\nc"`, 'say uppercase of "abc"', 'say lowercase of "ÄBC"', 'say trimmed of "  x  "', 'say the length of "héllo"', 'say "a-b-c" replacing "-" with ""', 'say "a b" split at " "'),
  'JSON: exact numbers in and out, every kind, escaping': L(String.raw`Set data to the JSON data in "{{\"a\": 1, \"b\": [1.50, true, null, \"x\"], \"c\": {{\"d\": 2e3}}, \"é\": \"\\u00e9\"}}"`, 'say data', 'say the JSON text of data', 'say data at "b"', 'say ((data at "b") at 1) + 1', String.raw`say the JSON text of ["a\"b\\c", "tab\there", "ünï"]`, 'say the JSON text of [1, 2, 3]', 'A Person has:', '  First name is text', '  Age is whole number', 'say the JSON text of a Person with first name "Ada" and age 36'),
  'conversions and their errors': L('say "12" as number', 'say "1,234.50" as number', 'say "3.0" as whole number', 'say "$5" as money', 'say "-$5.5" as money', 'say "yes" as yes/no', 'say "2026-02-28" as date', 'say 5 as text', 'say 2.50 as text', 'Set bad to "x"', 'say bad as money'),
  'dates': L('Set d to date "2026-11-25"', 'say d', 'say d is less than date "2026-12-01"', 'say d is date "2026-11-25"', 'say "2024-02-29" as date', 'say "2023-02-29" as date'),
  'defaults and functions that call functions': L('Keep greeting at "Hello"', 'To greet:', '  Receive name and word (greeting if not given)', '  Give "{word}, {name}!"', 'To taxed:', '  Receive price and rate (7% if not given)', '  Give price + price * rate', 'To twice:', '  Receive x', '  Give (taxed with x) + (taxed with x and 0%)', 'say greet with "Ada"', 'say greet with "Ada" and "Hi"', 'say taxed with 100', 'say twice with $10'),
  'recursion a few hundred levels deep': L('To count down:', '  Receive n', '  When n is 0:', '    Give 0', '  Give 1 + (count down with n - 1)', 'say count down with 300'),
  'recursion past the limit stops at the same call, with the same lines': L('To count down:', '  Receive n', '  When n is 0:', '    Give 0', '  Give 1 + (count down with n - 1)', 'say count down with 5000'),
  'Stop inside a function, reached from two levels up': L('To check:', '  Receive x', '  When x is negative:', '    Stop with "No negatives: {x}"', '  Give x', 'To outer:', '  Receive x', '  Give check with x', 'say outer with 1', 'say outer with -2'),
  'a field read in a sort that fails reports the line twice, as Python does': L(String.raw`Set rows to the JSON data in "[{{\"price\": 2}}, {{\"cost\": 1}}]"`, 'For each row in rows sorted by price:', '  say row'),
  'mixing kinds that the checker cannot see': L(String.raw`Set data to the JSON data in "[1, \"a\", null, 2.5]"`, 'Set x to data at 1', 'Set y to data at 2', 'say x + y'),
  'text plus a number from data': L(String.raw`Set data to the JSON data in "[\"a\", 1]"`, 'say (data at 1) + (data at 2)'),
  'nothing where a value is needed': L('Set data to the JSON data in "[null]"', 'say (data at 1) + 1'),
  'comparing text with a number': L(String.raw`Set data to the JSON data in "[\"a\", 1]"`, 'say (data at 1) is more than (data at 2)'),
  'a yes/no that is not one': L('Set data to the JSON data in "[1]"', 'When data at 1:', '  say "yes"'),
  'a map without the entry': L('Set m to an empty map', 'Set m at "a" to 1', 'say m at "b"'),
  'money times money': L('To product:', '  Receive left and right', '  Give left * right', 'say product with $2 and $3'),
  'money compared with a plain number': L('To bigger:', '  Receive left and right', '  Give left is more than right', 'say bigger with $2 and 3'),
  'dividing money by money and numbers by money': L('To share:', '  Receive left and right', '  Give left / right', 'say share with $9 and $3', 'say share with 9 and $3'),
  'joined with text only': L('Set xs to the JSON data in "[1, 2]"', 'say xs joined with ", "'),
  'average of an empty list': L('Set xs to []', 'say the average of xs'),
  'invalid JSON, many ways': L(String.raw`Set texts to ["", "{{", "{{\"a\" 1}}", "[1 2]", "[1,]", "{{\"a\":1,}}", "\"abc", "1 2", "tru", "{{a:1}}", "[1, 2", "\n\n  x", "01", "\"\\x\"", "\"\\u12\""]`, 'For each t in texts:', '  Set v to the JSON data in t', '  If this fails:', '    say error'),
  'loops: until, times, ranges, each over text, nested Give in loops': L('Set n to 0', 'Repeat until n is 3:', '  Increase n by 1', 'say n', 'Repeat 0 times:', '  say "never"', 'For each i from 3 to 1:', '  say i', 'For each letter in "héy":', '  say letter', 'To find:', '  Receive xs and wanted', '  For each x in xs:', '    When x is wanted:', '      Give "found {x}"', '  Give "missing"', 'say find with [1, 2, 3] and 2', 'say find with [1, 2, 3] and 9'),
  'positions that are not there': L('Set xs to [1, 2, 3]', 'say xs at 0 otherwise "none"', 'Set ys to []', 'say ys at 1'),
  'a position that is not a whole number': L('Set xs to [1, 2, 3]', 'Set data to the JSON data in "[1.5]"', 'say xs at (data at 1)'),
  'removing what is not there': L('Set xs to [1, 2]', 'Remove 5 from xs'),
  'removing a map entry that is not there': L('Set m to an empty map', 'Remove "k" from m'),
  'sums, averages and extremes of money': L('Set prices to [$1.10, $2.25, $3]', 'say the sum of prices', 'say the average of prices', 'say the smallest of prices', 'say the largest of prices', 'say the absolute value of -$4.50', 'say the absolute value of -3', 'say the absolute value of -2.50', 'say round 7 to 2 places', 'say round 2.4999 to 3 places'),
  'JSON with true, false, and null reads as Python reads it': L(String.raw`Set data to the JSON data in "{{\"a\": false, \"b\": true, \"c\": null, \"d\": [false]}}"`, "say data", 'say the JSON text of data'),
  'sorting values of mixed kinds fails the way Python does': L(String.raw`Set data to the JSON data in "[3, \"a\", 1]"`, 'say data sorted'),
  'starts with on something that is not text': L('Set data to the JSON data in "[5]"', 'say (data at 1) starts with "5"'),
  'text contains text, a list contains a value': L('say "hello" contains "ell"', 'say [1, 2, 3] contains 2.0', 'say ["a"] contains "b"', 'Set m to an empty map', 'Set m at "k" to 1', 'say m contains "k"'),
  'whole number conversions that fail': L('say "2.5" as whole number'),
  'percent and increases on fields': L('A Account has:', '  Balance is money', '  Rate is number', 'Set acct to an Account with balance $100 and rate 2%', "Increase acct's balance by acct's balance * acct's rate", "say acct's balance", "Decrease acct's balance by $0.005", "say acct's balance", 'say acct'),
  'optional fields and lists left out of a record': L('A Note has:', '  Text is text', '  Author is optional text', '  Tags is a list of text', 'Set note to a Note with text "hi"', 'say note', "say note's author is nothing"),
  'records compared and listed': L('A Point has:', '  X is whole number', '  Y is whole number', 'Set p to a Point with x 1 and y 2', 'Set q to a Point with x 1 and y 2', 'say p is q', 'Set points to [p, q, a Point with x 0 and y 5]', 'For each pt in points sorted by x:', '  say pt', 'say the count of points where x is 1', "say the sum of ys from points where x is 1"),
  'If this fails catches Stop and keeps going': L('To risky:', '  Receive n', '  When n is more than 1:', '    Stop with "too big: {n}"', '  Give n', 'Set r to risky with 5', 'If this fails:', '  say "caught: {error}"', 'say "after"'),
  'text holes that hold every kind, including one with quotes': L(String.raw`Set q to "say \"hi\""`, 'say "{q} and {q}"', 'Set xs to ["a", "b"]', 'say "list: {xs}, count: {the count of xs}, empty: {xs is empty}"', 'Set m to an empty map', 'say "map: {m}"'),
  'the JSON text of money is refused': L('say the JSON text of [$1]'),
  'the JSON text of a map with a number key is refused': L('Set m to an empty map', 'Set m at 1 to "x"', 'say the JSON text of m'),
  'a bigger program: an order total with tax and a coupon': L('A Line has:', '  Item is text', '  Price is money', '  Quantity is whole number', 'Keep tax rate at 8.25%', 'To line total:', '  Receive line', "  Give line's price * line's quantity", 'To order total:', '  Receive lines and coupon (nothing if not given)', '  Set subtotal to $0', '  For each line in lines:', '    Increase subtotal by line total with line', '  When coupon is not nothing:', '    Decrease subtotal by coupon', '  Give round (subtotal + subtotal * tax rate) to 2 places', 'Set lines to [a Line with item "pen" and price $1.99 and quantity 3, a Line with item "pad" and price $4.25 and quantity 2]', 'say order total with lines', 'say order total with lines and $2', 'For each line in lines sorted by price descending:', "  say \"{line's item}: {line total with line}\""),
  'a Never rule on a value that changes': L('Never allow a negative stock', 'Set stock to 2', 'Decrease stock by 1', 'say stock', 'Decrease stock by 5', 'say stock'),
};

for (const [name, src] of Object.entries(PROGRAMS)) {
  test(`both engines agree: ${name}`, { skip }, () => { runBoth(src); });
}

test('both engines agree on a test run with passes, failures, and output in between', { skip }, () => {
  runBoth([
    'To half:', '  Receive x', '  Give x / 2',
    'Test "halves":', '  say "in the test"', '  Expect half with 3 to be 1.5', '  Expect half with $3 to be $1.50',
    'Test "wrong":', '  Expect half with 4 to be 3',
    'Test "fails as expected":', '  Expect half with nothing to fail',
    'Test "fails with the wrong message":', '  Expect half with nothing to fail with "zero"',
    'Test "true":', '  Expect half with 2 is 1',
    'Test "nothing":', '  Expect nothing is nothing', '  Expect [1, 2] contains 2', '  Expect 3 to be between 1 and 4', '  Expect 3 to be at least 4',
  ].join('\n'), { tests: true });
});

test('a project: tests in tests/ use the functions in src/, and an error in src/ names the src file', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-engine-proj-'));
  try {
    mkdirSync(join(dir, 'src')); mkdirSync(join(dir, 'tests'));
    writeFileSync(join(dir, 'thunder.toml'), '[project]\nname = "p"\n');
    writeFileSync(join(dir, 'src', 'main.thunder'), 'To share:\n  Receive total and people\n  Give total / people\n\nsay share with $10 and 4\n');
    writeFileSync(join(dir, 'tests', 'split.thunder'), 'Test "shares":\n  Expect share with $9 and 3 to be $3\nTest "by zero":\n  Expect share with $9 and 0 to be $0\n');
    const build = buildProject({ root: dir, includeTests: true, write: false });
    assert.equal(build.ok, true);
    const r = bothEngines(build.results, { tests: true, cwd: dir, label: 'project tests' });
    assert.match(r.out, /src\/main\.thunder, line 3 \(reached from line 4\): You divided by zero\.  \[TC501\]/);
    bothEngines([build.entry], { entry: build.entry, cwd: dir, label: 'project run' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── the engine on its own (no Python needed) ──

const cli = (args, cwd, env = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });

test('thunder run / test --engine thunder: no Python needed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-engine-cli-'));
  try {
    assert.equal(cli(['new', 'hello'], dir).status, 0);
    const noPython = { PATH: dirname(process.execPath), THUNDER_PYTHON: join(dir, 'no-python-here') };
    const run = cli(['run', 'hello', '--engine', 'thunder'], dir, noPython);
    assert.equal(run.stdout, 'Hello, world!\n', run.stderr);
    assert.equal(run.status, 0);
    const t = cli(['test', 'hello', '--engine=thunder'], dir, noPython);
    assert.equal(t.stdout, 'PASS  greet says hello (tests/greet.thunder, line 3)\n1 test: 1 passed, 0 failed\n');
    assert.equal(t.status, 0);
    // Without --engine, Python is still the default, so it says Python is missing.
    assert.match(cli(['run', 'hello'], dir, noPython).stderr, /Thunder needs Python 3\.10 or newer/);
    writeFileSync(join(dir, 'hello', 'src', 'main.thunder'), 'say 1 / 0\n');
    const bad = cli(['run', 'hello', '--engine', 'thunder'], dir, noPython);
    assert.equal(bad.status, 1);
    assert.equal(bad.stderr, 'src/main.thunder, line 1: You divided by zero.  [TC501]\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unknown engine, or --engine on another command, is a plain error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-engine-cli-'));
  try {
    cli(['new', 'hello'], dir);
    const r = cli(['run', 'hello', '--engine', 'java'], dir);
    assert.equal(r.status, 2);
    assert.equal(r.stderr, 'thunder run: there is no engine "java". Use --engine python (the default) or --engine thunder.\n');
    const b = cli(['build', 'hello', '--engine', 'thunder'], dir);
    assert.equal(b.status, 2);
    assert.match(b.stderr, /--engine is for thunder run and thunder test/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a program that uses a Python module is refused by the Thunder engine, never imitated', () => {
  const r = runWithEngine({ entry: compileCore('Use csv as csv\nsay "hi"', { file: 'main.thunder' }) });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'This program uses the Python module "csv" (main.thunder, line 1). The Thunder engine runs Thunder only and never imitates a library, so run it with Python: leave out --engine thunder.\n');
  const c = cli(['run', join(ROOT, 'examples', 'core', 'csv-summary.thunder'), '--engine', 'thunder']);
  assert.equal(c.status, 2);
  assert.match(c.stderr, /^thunder run: This program uses the Python module "csv"/);
});

// Last: every program above, compiled to C# and built together, gives the same result (see core-engines.mjs).
csharpAgrees(test);
