// Thunder Core: EXECUTION tests. The generated Python is actually run. Skipped, with a message, when Python
// 3.10+ is not installed (set THUNDER_PYTHON to point at one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compileCore, PYTHON_RUNTIME } from '../src/core/index.mjs';
import { findPython } from '../src/core/project.mjs';
import { CASES } from '../scripts/core-read-write.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'src', 'cli.mjs');
const EXAMPLES = join(HERE, '..', '..', 'examples', 'core');
const PY = findPython();
const skip = PY.error ? `Python 3.10+ not found, so the generated code cannot be run here: ${PY.error}` : false;
if (skip) console.log(`# core-run: SKIPPED. ${skip}`);

const tmp = mkdtempSync(join(tmpdir(), 'thunder-core-'));
test.after(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;

/** Compile Thunder Core, run the Python, give back { out, err, status }. */
function run(source, { tests = false } = {}) {
  const r = compileCore(source, { file: 'main.thunder' });
  assert.deepEqual(r.diagnostics, [], JSON.stringify(r.diagnostics));
  const dir = join(tmp, `p${n++}`);
  spawnSync('mkdir', ['-p', dir]);
  writeFileSync(join(dir, 'thunder_runtime.py'), PYTHON_RUNTIME);
  writeFileSync(join(dir, 'main.py'), r.python);
  writeFileSync(join(dir, 'run_tests.py'), 'import thunder_runtime, main\nthunder_runtime.run_tests([main])\n');
  const p = spawnSync(PY.cmd, [tests ? 'run_tests.py' : 'main.py'], { cwd: dir, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  return { out: p.stdout.trim(), err: p.stderr.trim(), status: p.status };
}
const says = (source, expected) => { const r = run(source); assert.equal(r.err, ''); assert.equal(r.status, 0); assert.equal(r.out, expected); };

test('hello world', { skip }, () => says('say "Hello, world!"', 'Hello, world!'));

test('money is exact: $0.10 + $0.20 is $0.30', { skip }, () => {
  says('say $0.10 + $0.20\nsay $0.10 + $0.20 is $0.30\nsay $19.99 * 3', '$0.30\nyes\n$59.97');
});

test('decimal numbers are exact: 0.10 + 0.20 is 0.3', { skip }, () => {
  says('say 0.10 + 0.20\nsay 0.1 + 0.2 is 0.3', '0.3\nyes');
});

test('division is exact and never cut to a whole number', { skip }, () => {
  says('say 7 / 2\nsay 6 / 3\nsay 1 / 3\nsay $10 / 4\nsay $10 / $4', '3.5\n2\n0.3333333333333333333333333333\n$2.50\n2.5');
});

test('rounding goes half away from zero; mod has the sign of the divisor', { skip }, () => {
  says('say round 2.5\nsay round -2.5\nsay round 2.675 to 2 places\nsay round $2.675 to 2 places\nsay 7 mod 3\nsay -7 mod 3', '3\n-3\n2.68\n$2.68\n1\n2');
});

test('nothing: shown as "nothing", and checked with "is nothing"', { skip }, () => {
  says('Set note to nothing\nsay note\nsay note is nothing\nsay note is not nothing', 'nothing\nyes\nno');
});

test('yes/no and lists are shown in Thunder words', { skip }, () => {
  says('say true\nsay [1, 2, 3]\nsay 3 is more than 2', 'yes\n[1, 2, 3]\nyes');
});

test('functions, When/Otherwise, and the founder\'s discount', { skip }, () => {
  says('To calculate discount:\n  Receive total and member\n  When member is true and total is at least 100:\n    Give 20% of total\n  Otherwise:\n    Give 0\nsay calculate discount with 150 and true\nsay calculate discount with 150 and false\nsay calculate discount with 99 and true', '30\n0\n0');
});

test('loops: For each, Repeat while, Repeat N times, For each … from … to', { skip }, () => {
  says('Set total to 0\nFor each n from 1 to 4:\n  Increase total by n\nsay total\nSet left to 2\nRepeat while left is positive:\n  say left\n  Decrease left by 1\nRepeat 2 times:\n  say "hi"', '10\n2\n1\nhi\nhi');
});

test('lists: sum, average, count, smallest, largest, where, sorted by', { skip }, () => {
  says([
    'An Order has:', '  Item is text', '  Price is money', '  Paid is yes/no',
    'Set orders to [an Order with item "pen" and price $1.50 and paid true, an Order with item "ink" and price $3.25 and paid false, an Order with item "pad" and price $2.10 and paid true]',
    'say the sum of prices from orders where paid is true',
    'say the average of prices from orders',
    'say the count of orders where paid is false',
    'say the smallest of prices from orders',
    'say the largest of prices from orders',
    'For each order in orders sorted by price descending:', '  say order\'s item',
  ].join('\n'), '$3.60\n$2.283333333333333333333333333\n1\n$1.50\n$3.25\nink\npad\npen');
});

test('text interpolation, words, and maps', { skip }, () => {
  says('Set counts to an empty map\nFor each word in the words of lowercase of "A b a":\n  Set counts at word to (counts at word otherwise 0) + 1\nsay counts\nsay "a appears {counts at "a"} times"', '{a: 2, b: 1}\na appears 2 times');
});

test('If this fails: the error message is in words', { skip }, () => {
  says('Set x to 1 / 0\nIf this fails:\n  say "Could not: {error}"\nsay "still running"', 'Could not: You divided by zero.\nstill running');
});

test('a runtime error is reported against the Thunder line, with where it was reached from', { skip }, () => {
  const r = run('To share:\n  Receive amount and people\n  Give amount / people\n\nsay share with 10 and 4\nsay share with 10 and 0\nsay "not reached"');
  assert.equal(r.status, 1);
  assert.equal(r.out, '2.5');
  assert.equal(r.err, 'main.thunder, line 3 (reached from line 6): You divided by zero.  [TC501]');
});

test('Stop with a message ends the program with that message and line', { skip }, () => {
  const r = run('Set balance to $5\nWhen balance is less than $10:\n  Stop with "Not enough money"');
  assert.equal(r.status, 1);
  assert.equal(r.err, 'main.thunder, line 3: Not enough money  [TC507]');
});

test('money and a plain number mixed at runtime (kinds unknown in advance) is a clear error', { skip }, () => {
  const r = run('To add one:\n  Receive x\n  Give x + 1\nsay add one with $5');
  assert.equal(r.status, 1);
  assert.match(r.err, /line 3 \(reached from line 4\): I can't add money and the number 1\. Write the number as money, for example \$5\.  \[TC506\]/);
});

test('using nothing where a value is needed is reported in words', { skip }, () => {
  // Known in advance: the checker says it before anything runs.
  const c = compileCore('Set x to nothing\nsay x + 1', { file: 'main.thunder' });
  assert.deepEqual(c.diagnostics.map((d) => [d.code, d.line, d.message]), [['TC305', 2, "I can't add nothing and a whole number."]]);
  // Only known while running: the runtime says it in words, against the Thunder line.
  const r = run('To add one:\n  Receive x\n  Give x + 1\nsay add one with nothing');
  assert.equal(r.status, 1);
  assert.match(r.err, /line 3 \(reached from line 4\): A value was nothing where a value was needed\.  \[TC502\]/);
});

test('Never: a broken rule stops the change, and the old value stays', { skip }, () => {
  says('A Customer has:\n  Balance is money\n  Never allow a negative balance\nSet c to a Customer with balance $10\nSet c\'s balance to c\'s balance - $50\nIf this fails:\n  say error\nsay c\'s balance',
    'Never allow a negative balance (the rule on line 3), but the value is -$40.00.\n$10.00');
  const r = run('Never allow a negative stock\nSet stock to 2\nDecrease stock by 5\nsay stock');
  assert.equal(r.status, 1);
  assert.equal(r.err, 'main.thunder, line 3: Never allow a negative stock (the rule on line 1), but the value is -3.  [TC504]');
});

test('Never: making a record that breaks a rule fails at the line that made it', { skip }, () => {
  const r = run('A Trade has:\n  Quantity is whole number\n  Never allow a negative quantity\nSet t to a Trade with quantity -1');
  assert.equal(r.status, 1);
  assert.equal(r.err, 'main.thunder, line 4: Never allow a negative quantity (the rule on line 3), but the value is -1.  [TC504]');
});

test('Test blocks: passing and failing Expect lines are reported with their lines', { skip }, () => {
  const r = run('To double:\n  Receive x\n  Give x * 2\nTest "doubles":\n  Expect double with 2 to be 4\n  Expect double with $1.50 to be $3\nTest "wrong on purpose":\n  Expect double with 2 to be 5\nTest "fails as expected":\n  Expect 1 / 0 to fail with "divided by zero"', { tests: true });
  assert.equal(r.status, 1);
  assert.equal(r.out, [
    'PASS  doubles (main.thunder, line 4)',
    'FAIL  wrong on purpose (main.thunder, line 7)',
    '      main.thunder, line 8: Expect double with 2 to be 5, but it was 4.  [TC505]',
    'PASS  fails as expected (main.thunder, line 9)',
    '3 tests: 2 passed, 1 failed',
  ].join('\n'));
});

test('Use: a Python module (the escape hatch) can be called', { skip }, () => {
  says('Use math as math\nUse csv as csv\nsay math.floor(2.7)\nSet rows to csv.DictReader(["name,amount", "Ada,5"]) as list\nFor each row in rows:\n  say "{row\'s name}: {row\'s amount as money}"', '2\nAda: $5.00');
});

test('a failure inside a Python module names the Thunder line that called it', { skip }, () => {
  const r = run('Use math as math\nsay math.sqrt(-1)');
  assert.equal(r.status, 1);
  assert.match(r.err, /^main\.thunder, line 2: Python code used by this line failed: ValueError: .*\[TC508\]$/);
});

test('conversions: text to numbers, money, yes/no, with clear errors', { skip }, () => {
  says('say "12" as whole number + 1\nsay "2.50" as number\nsay "$1,234.50" as money\nsay "yes" as yes/no', '13\n2.5\n$1,234.50\nyes');
  const r = run('say "abc" as number');
  assert.match(r.err, /line 1: the text "abc" is not a number\.  \[TC509\]/);
});

test('positions start at 1, and a missing one is explained', { skip }, () => {
  says('Set xs to ["a", "b"]\nsay xs at 1\nsay xs at 2', 'a\nb');
  assert.match(run('Set xs to ["a"]\nsay xs at 3').err, /There is no item 3: the list has 1 item\.  \[TC503\]/);
});

// ---------------------------------------------------------------- the demo programs and the CLI

const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });

const DEMOS = {
  'hello.thunder': 'Hello, world!\nNice to meet you, Ada.',
  'discount.thunder': 'Paid orders come to $3.60, plus $0.25 tax.\nA member spending 150 saves 30.\nA guest spending 150 saves 0.',
  'trading-journal.thunder': 'ACME: $200.00\nGLOBEX: -$8.25\nINITECH: $20.00\nTotal profit: $211.75\nWinning trades: 2 of 3\nRefused: Never allow a negative quantity (the rule on line 8), but the value is -5.',
  'csv-summary.thunder': 'Orders: 5\nTotal: $142.50\nAverage: $28.50\nBy status:\n  paid: $100.00\n  pending: $30.50\n  refunded: $12.00',
  'word-count.thunder': 'Different words: 5\nthe: 4\ncat: 2\nsaw: 2\ndog: 2',
  'savings.thunder': 'Ada reaches $120.00 after 5 weeks, with $135.00.\nNot allowed: Never allow a negative balance (the rule on line 6), but the value is -$365.00.\nAda still has $135.00.',
};

test('every demo program in examples/core passes thunder check', () => {
  const r = cli(['check', EXAMPLES]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no problems in \d+ Thunder Core files/);
  assert.ok(Object.keys(DEMOS).length >= 5);
});

for (const [file, expected] of Object.entries(DEMOS)) {
  test(`demo ${file} runs and prints what it should`, { skip }, () => {
    const r = cli(['run', join(EXAMPLES, file)]);
    assert.equal(r.stderr, '');
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), expected);
  });
}

test('thunder test runs every Test block in examples/core', { skip }, () => {
  const r = cli(['test', EXAMPLES]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /(\d+) tests: \1 passed, 0 failed/);
});

test('thunder new, run, test, build, check, format: a project from scratch', { skip }, () => {
  const dir = join(tmp, 'myapp');
  let r = cli(['new', dir]);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['thunder.toml', 'src/main.thunder', 'tests/greet.thunder', '.gitignore']) assert.ok(existsSync(join(dir, f)), f);
  assert.match(readFileSync(join(dir, 'thunder.toml'), 'utf8'), /\[build\]\ntarget = "python"/);
  r = cli(['run'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'Hello, world!');
  r = cli(['test'], dir);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /PASS {2}greet says hello \(tests\/greet\.thunder, line 3\)/);
  r = cli(['build'], dir);
  assert.equal(r.status, 0);
  assert.ok(readdirSync(join(dir, 'generated', 'python')).includes('main.py'));
  // The generated program runs with plain Python, without Thunder.
  const p = spawnSync(PY.cmd, [join('generated', 'python', 'main.py')], { cwd: dir, encoding: 'utf8' });
  assert.equal(p.stdout.trim(), 'Hello, world!');
  r = cli(['check'], dir);
  assert.equal(r.status, 0);
  writeFileSync(join(dir, 'src', 'messy.thunder'), 'When true:\n      say 1   \n\n\n\nsay 2\n');
  r = cli(['format', '--check'], dir);
  assert.equal(r.status, 1);
  r = cli(['format', '--write'], dir);
  assert.equal(readFileSync(join(dir, 'src', 'messy.thunder'), 'utf8'), 'When true:\n  say 1\n\nsay 2\n');
  assert.equal(cli(['new', dir]).status, 2, 'refuses to overwrite an existing project');
});

test('thunder check reports problems with file, line, words, and code; nothing is run', () => {
  const dir = join(tmp, 'broken');
  cli(['new', dir]);
  writeFileSync(join(dir, 'src', 'main.thunder'), 'Set cards to [1, 2]\nShuffle cards\n');
  const r = cli(['check'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /src\/main\.thunder, line 2: I don't know how to 'shuffle' a list yet\. Supported: sort, reverse, add, remove\./);
  const j = JSON.parse(cli(['check', '--json'], dir).stdout);
  assert.equal(j.ok, false);
  assert.equal(j.files.find((f) => f.file.endsWith('main.thunder')).diagnostics[0].code, 'TC401');
  assert.equal(cli(['run'], dir).status, 1);
});

test('missing Python is a clear error, not a crash', () => {
  const dir = join(tmp, 'nopy');
  cli(['new', dir]);
  const r = spawnSync(process.execPath, [CLI, 'run'], { cwd: dir, encoding: 'utf8', env: { ...process.env, THUNDER_PYTHON: '/nonexistent/python', PATH: '/nonexistent' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Thunder needs Python 3\.10 or newer/);
});

test('mission .thunder files outside a project still use the mission commands', () => {
  const r = cli(['check', join(HERE, '..', '..', 'examples', 'CreateInvoice.thunder')]);
  assert.doesNotMatch(r.stdout + r.stderr, /Thunder Core/);
});

test('read <-> write: the 20 hand-written Core versions compile, and the report is up to date', () => {
  for (const [name, , core] of CASES) assert.equal(compileCore(core).ok, true, name);
  const r = spawnSync(process.execPath, [join(HERE, '..', 'scripts', 'core-read-write.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('the site playground example runs exactly as written: several Receive lines, "yes or no", a condition on two lines', { skip }, () => {
  says([
    'To calculate discount:',
    '  Receive total as a number',
    '  Receive member as yes or no',
    '',
    '  When member is yes',
    '    and total is at least 100:',
    '    Give 20% of total',
    '',
    '  Otherwise:',
    '    Give 0',
    '',
    'Say "Hello, world!"',
    'say calculate discount with 150 and yes',
    'say calculate discount with 150 and no',
  ].join('\n'), 'Hello, world!\n30\n0');
});

test('a continued condition keeps the first line number, and "and" alone never starts a statement', () => {
  const r = compileCore('Set x to 1\nWhen x is 1\n  and y is 2:\n  say x', { file: 'main.thunder' });
  assert.deepEqual(r.diagnostics.map((d) => [d.code, d.line]), [['TC201', 2]]);
  const t = compileCore('To pick:\n  Receive amount as a number\n  Receive flag as yes or no\n  Give amount\nsay pick with 1 and "no"', { file: 'main.thunder' });
  assert.deepEqual(t.diagnostics.map((d) => d.code), ['TC303']);
});
