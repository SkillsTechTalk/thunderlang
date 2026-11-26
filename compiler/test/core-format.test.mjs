// Thunder Beautiful Code: records and calls written as blocks, and the formatter (thunder format), which must never
// change what a program means. The proof: every Core program the tests and examples run is formatted, and the
// formatted program parses to the same tree and gives the same output on the Thunder engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCore, parseCore } from '../src/core/index.mjs';
import { formatCore } from '../src/core/format.mjs';
import { runInProcess, testInProcess } from '../src/core/engine-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const tree = (src) => JSON.stringify(parseCore(src).body, (k, v) => (k === 'line' || k === 'raw' ? undefined : v));
const noLines = (s) => String(s).replace(/line \d+/g, 'line N').replace(/, then line N/g, '');

const TRADE = `A Trade has:
  Symbol is text
  Quantity is whole number
  Buy price is money
  Sell price is money
  Never allow a negative quantity

To calculate profit:
  Receive trade as a Trade
  Give (trade's sell price - trade's buy price) * trade's quantity

To taxed:
  Receive price and rate (7% if not given) and note ("" if not given)
  Give price + price * rate
`;

test('a record written as a block is the same program as the one-line record', () => {
  const pairs = [
    ['Set t to a Trade with symbol "ACME" and quantity 10 and buy price $20.00 and sell price $40.00\nsay t\'s symbol',
      'Set t to a Trade:\n  symbol: "ACME"\n  quantity: 10\n  buy price: $20.00\n  sell price: $40.00\nsay t\'s symbol'],
    ['Set trades to an empty list\nAdd a Trade with symbol "G" and quantity 3 and buy price $15.10 and sell price $12.35 to trades',
      'Set trades to an empty list\nAdd a Trade to trades:\n  symbol: "G"\n  quantity: 3\n  buy price: $15.10\n  sell price: $12.35'],
    ['Expect a Trade with symbol "B" and quantity -1 and buy price $1 and sell price $2 to fail with "Never allow a negative quantity"',
      'Expect a Trade to fail with "Never allow a negative quantity":\n  symbol: "B"\n  quantity: -1\n  buy price: $1\n  sell price: $2'],
    ['say calculate profit with a Trade with symbol "A" and quantity 2 and buy price $1 and sell price $3',
      'say calculate profit with a Trade:\n  symbol: "A"\n  quantity: 2\n  buy price: $1\n  sell price: $3'],
  ];
  for (const [one, block] of pairs) {
    const a = compileCore(TRADE + one), b = compileCore(TRADE + block);
    assert.ok(a.ok && b.ok, JSON.stringify(b.diagnostics));
    assert.equal(tree(TRADE + block), tree(TRADE + one), block);
  }
});

test('a function called with names is the same program as the call with values in order; a left-out input uses its default', () => {
  for (const [ordered, named] of [
    ['say calculate profit with a Trade with symbol "A" and quantity 1 and buy price $1 and sell price $2', 'say calculate profit:\n  trade: a Trade with symbol "A" and quantity 1 and buy price $1 and sell price $2'],
    ['say taxed with 100', 'say taxed:\n  price: 100'],
    ['say taxed with 100 and 7% and "x"', 'say taxed:\n  note: "x"\n  price: 100'],
    ['Set p to taxed with 50 and 10%', 'Set p to taxed:\n  rate: 10%\n  price: 50'],
  ]) assert.equal(tree(TRADE + named), tree(TRADE + ordered), named);
  assert.equal(runInProcess({ entry: compileCore(`${TRADE}say taxed:\n  price: 100\n  rate: 20%`) }).stdout, '120\n');
});

test('mistakes in a block say exactly what is wrong, with the line and a suggestion', () => {
  const errs = (body) => compileCore(TRADE + body).diagnostics.map((d) => `${d.code} ${d.line}: ${d.message}`);
  const at = TRADE.split('\n').length; // the line of the first statement after TRADE
  assert.deepEqual(errs('Set t to a Trade:\n  symbol: "A"\n  quantty: 1\n  buy price: $1\n  sell price: $2'), [`TC206 ${at + 2}: A Trade has no field "quantty". Did you mean "quantity"?`]);
  assert.deepEqual(errs('Set t to a Trade:\n  symbol: "A"\n  symbol: "B"'), [`TC114 ${at + 2}: "symbol" is given twice (also on line ${at + 1}).`]);
  assert.match(errs('Set t to a Trade:\n  symbol "A"')[0], /^TC113 .*should be "name: value", like: quantity: 10\.$/);
  assert.deepEqual(errs('Set t to a Trade:\n  symbol:'), [`TC113 ${at + 1}: "symbol:" has no value after it.`]);
  assert.match(errs('say 5:\n  x: 1')[0], /^TC117 .*no record or function call at its end to give the lines under it to\.$/);
  assert.deepEqual(errs('say calculate profit:\n  trad: 1'), [`TC115 ${at + 1}: "calculate profit" has no input called "trad". Did you mean "trade"?`]);
  assert.deepEqual(errs('say taxed:\n  rate: 5%'), [`TC116 ${at}: "taxed" needs "price", but it is not given.`]);
  // A record missing a field is still caught by the usual check (TC210), as on one line.
  assert.ok(errs('Set t to a Trade:\n  symbol: "A"').some((e) => e.startsWith('TC210')));
});

test('the formatter: short stays short; 4 or more fields, or a long line, become a block; long conditions wrap', () => {
  const f = formatCore(`${TRADE}Set small to a Trade with symbol "A" and quantity 1 and buy price $1\nSet big to a Trade with symbol "ACME" and quantity 10 and buy price $20.00 and sell price $40.00  # the first trade\nWhen big's quantity is at least 5 and big's sell price is more than big's buy price and big's symbol is not "NONE":\n  say "good"\n`);
  assert.match(f, /^Set small to a Trade with symbol "A" and quantity 1 and buy price \$1$/m);
  assert.match(f, /^Set big to a Trade: {2}# the first trade\n {2}symbol: "ACME"\n {2}quantity: 10\n {2}buy price: \$20\.00\n {2}sell price: \$40\.00\n/m);
  assert.match(f, /^When big's quantity is at least 5\n {2}and big's sell price is more than big's buy price\n {2}and big's symbol is not "NONE":\n {2}say "good"$/m);
  assert.equal(formatCore(f), f, 'formatting twice changes nothing');
});

test('the formatter keeps one blank line around functions, records, and tests, and keeps comments where they are', () => {
  const f = formatCore('# Shop\nSet a to 1\nTo double:\n  Receive x\n  Give x * 2\nsay double with a\n# checks\nTest "doubles":\n  Expect double with 2 to be 4\n');
  assert.equal(f, '# Shop\nSet a to 1\n\nTo double:\n  Receive x\n  Give x * 2\n\nsay double with a\n\n# checks\nTest "doubles":\n  Expect double with 2 to be 4\n');
  const canonical = 'Set a to 1\n\nTo double:\n  Receive x\n  Give x * 2\n';
  assert.equal(formatCore(canonical), canonical, 'a program already in the Thunder style is left exactly as it is');
});

// ── the proof: formatting never changes meaning ──────────────────────────────────────────────────────────────

/** Every Core program the examples, the docs, and the Core tests use (string literals that compile as Core). */
function corpus() {
  const out = [];
  const exdir = join(ROOT, 'examples', 'core');
  for (const f of readdirSync(exdir)) if (f.endsWith('.thunder')) out.push(readFileSync(join(exdir, f), 'utf8'));
  for (const f of readdirSync(join(exdir, 'tests'))) if (f.endsWith('.thunder')) out.push(readFileSync(join(exdir, 'tests', f), 'utf8'));
  for (const m of readFileSync(join(ROOT, 'docs', 'core.md'), 'utf8').matchAll(/```thunder\n([\s\S]*?)```/g)) out.push(m[1]);
  for (const file of ['core-run.test.mjs', 'core-stdlib.test.mjs', 'core-engine.test.mjs', 'core-python.test.mjs']) {
    let src = '';
    try { src = readFileSync(join(HERE, file), 'utf8'); } catch { continue; }
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*\\n(?:[^'\\\n]|\\.)*)'/g)) { try { out.push(JSON.parse(`"${m[1].replace(/"/g, '\\"').replace(/\\'/g, "'")}"`)); } catch { /* not a plain string */ } }
  }
  // Programs written to exercise the formatter: long records in every statement, long conditions.
  out.push(`${TRADE}Set trades to an empty list\nAdd a Trade with symbol "ACME" and quantity 10 and buy price $20.00 and sell price $40.00 to trades\nFor each t in trades:\n  When t's quantity is at least 5 and t's sell price is more than t's buy price and t's symbol is not "X":\n    say calculate profit with t\nTo make:\n  Receive s\n  Give a Trade with symbol s and quantity 1 and buy price $1 and sell price $2\nsay make with "Z"\nTest "t":\n  Expect a Trade with symbol "B" and quantity -1 and buy price $1 and sell price $2 to fail with "Never allow a negative quantity"\n`);
  // The trading journal as it was written before the Thunder style (records on one line).
  out.push(`${TRADE}Set trades to an empty list\nAdd a Trade with symbol "ACME" and quantity 10 and buy price $20.00 and sell price $40.00 to trades\nAdd a Trade with symbol "GLOBEX" and quantity 3 and buy price $15.10 and sell price $12.35 to trades\nSet total profit to $0\nFor each trade in trades:\n  Increase total profit by calculate profit with trade\nsay "Total profit: {total profit}"\nSet mistake to a Trade with symbol "OOPS" and quantity -5 and buy price $1 and sell price $2\nIf this fails:\n  say "Refused: {error}"\nTest "profit":\n  Set trade to a Trade with symbol "ACME" and quantity 10 and buy price $20.00 and sell price $40.00\n  Expect calculate profit with trade to be $200\n`);
  return [...new Set(out)].filter((s) => { try { return compileCore(s).ok; } catch { return false; } });
}

test('formatting never changes meaning: the same tree, the same output, the same test results, for every Core program', () => {
  const programs = corpus();
  assert.ok(programs.length >= 60, `only ${programs.length} programs`);
  let expanded = 0;
  for (const src of programs) {
    const out = formatCore(src);
    assert.equal(formatCore(out), out, `formatting twice changes nothing:\n${src}`);
    assert.equal(tree(out), tree(src), `the same program:\n${src}`);
    const a = compileCore(src), b = compileCore(out);
    assert.ok(b.ok, JSON.stringify(b.diagnostics));
    if (a.info.modules.length) continue; // (a program that Uses a Python module does not run on the Thunder engine)
    if (a.program.main?.length) {
      const ra = runInProcess({ entry: a }), rb = runInProcess({ entry: b });
      assert.equal(rb.stdout, ra.stdout, src);
      assert.equal(rb.status, ra.status, src);
      assert.equal(noLines(rb.stderr), noLines(ra.stderr), src);
    }
    if (a.info.tests.length) assert.equal(noLines(testInProcess({ results: [{ ...b, kind: 'src' }] }).stdout), noLines(testInProcess({ results: [{ ...a, kind: 'src' }] }).stdout), src);
    if (out !== src && /:\n {2,}[a-z][a-z ]*: /i.test(out)) expanded++;
  }
  assert.ok(expanded >= 2, 'some programs were reshaped');
  if (process.env.THUNDER_FORMAT_COUNT) console.log(`formatted ${programs.length} programs, ${expanded} reshaped`);
});
