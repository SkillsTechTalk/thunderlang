// No silent answers: an untranslatable rule never becomes `false`, money never becomes a float, and a
// failed run never becomes a null answer. Each test names the old behavior it guards against.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { evalExpr, exprToCode } from '../src/expr.mjs';
import { runTypescriptTarget, emitDecisionModule } from '../src/target-ts.mjs';
import { runPythonTarget, pythonAvailable } from '../src/target-py.mjs';
import { runGoTarget, goAvailable, emitGoModule } from '../src/target-go.mjs';
import { runRustTarget, rustAvailable } from '../src/target-rust.mjs';
import { emitJavaModule } from '../src/target-java.mjs';
import { emitKotlinModule } from '../src/target-kotlin.mjs';
import { buildConformance } from '../src/conformance.mjs';
import { translateDecisionsWithDiagnostics } from '../src/translate.mjs';
import { parseMoney, formatMoney, roundHalfUp, minorUnitsFor, moneyTypeMinorUnits, MoneyError } from '../src/money.mjs';
import { isCaseResult, classifySpawn, GEN_UNTRANSLATED } from '../src/target-result.mjs';
import { parsePlainContract, plainToThunder, renderPlainContract } from '../src/plain-contract.mjs';
import { ALL_DIAGNOSTICS } from '../src/intent-schema.mjs';
import * as barrel from '../src/index.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-no-silent-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const HAVE_PY = pythonAvailable();
const NATIVE = process.env.TL_NATIVE_TARGETS === '1';

// `amount ~ 5` cannot be parsed by any translator. Before the fix, every target compiled it to
// `false`, so the "old" case below silently returned "Review" from the default.
const UNTRANSLATED = `mission M
decision D
  inputs
    amount
    days
  rule tooOld
    when days > 30
    return Deny
  rule weird
    when amount ~ 5
    return Hold
  default
    return Review
decision Ok
  inputs
    x
  rule big
    when x > 1
    return Big
  default
    return Small
test D
  case old
    given amount 1, days 40
    expect Deny
test Ok
  case one
    given x 2
    expect Big
`;

// 0.1 + 0.2 must equal 0.3 for Money. Before the fix the semantic engine and every float target said
// false, so "cents" fell through to "Approve".
const MONEY = `mission Refund
decision RefundDecision
  inputs
    amount: Money
    fee: Money
    days
  rule tooOld
    when days > 30
    return Deny
  rule withFee
    when amount + fee == 0.3
    return Exact
  rule small
    when amount <= 12.30
    return Approve
  default
    return Review
test RefundDecision
  case old
    given amount 5.00, fee 0, days 40
    expect Deny
  case cents
    given amount 0.1, fee 0.2, days 1
    expect Exact
  case small
    given amount 12.30, fee 1, days 1
    expect Approve
  case big
    given amount 12.31, fee 1, days 1
    expect Review
`;

// ── 1. Untranslated conditions ───────────────────────────────────────────────

test('IL-GEN-001 is in the canonical diagnostic catalog as an error', () => {
  const row = ALL_DIAGNOSTICS.find((r) => r.ruleId === GEN_UNTRANSLATED);
  assert.ok(row, 'IL-GEN-001 is cataloged');
  assert.equal(row.severity, 'error');
  assert.equal(row.area, 'generation');
});

test('the TypeScript runner refuses an untranslated decision (not-translated), never runs it with false', () => {
  const run = runTypescriptTarget(parseIntent(UNTRANSLATED));
  assert.equal(run.status, 'ok');
  const r = run.results['D / old'];
  assert.equal(r.status, 'error');
  assert.equal(r.kind, 'not-translated');
  assert.match(r.message, /^Thunder could not translate the condition 'amount ~ 5' for TypeScript: /);
  // Decisions that translate fine still run.
  assert.deepEqual(run.results['Ok / one'], { status: 'ok', value: 'Big' });
});

test('the Python runner refuses an untranslated decision', { skip: !HAVE_PY && 'python3 not available' }, () => {
  const run = runPythonTarget(parseIntent(UNTRANSLATED));
  assert.equal(run.results['D / old'].kind, 'not-translated');
  assert.deepEqual(run.results['Ok / one'], { status: 'ok', value: 'Big' });
});

test('emitted executable modules throw at an untranslated rule instead of using false', () => {
  const ast = parseIntent(UNTRANSLATED);
  for (const [name, src] of [['ts', emitDecisionModule(ast)], ['go', emitGoModule(ast)], ['java', emitJavaModule(ast)], ['kotlin', emitKotlinModule(ast)]]) {
    assert.match(src, /hunder_?[uU]ntranslated\("Thunder could not translate the condition 'amount ~ 5'/, name);
    assert.doesNotMatch(src, /if \(?false\b/, name);
  }
  // The runnable program never calls a refused decision.
  assert.doesNotMatch(emitGoModule(ast), /j\(D\(/);
});

test('translateDecisions reports IL-GEN-001 per language and never shows false', () => {
  const ast = parseIntent(UNTRANSLATED);
  for (const lang of ['typescript', 'python', 'go', 'rust', 'csharp', 'java']) {
    const { code, diagnostics } = translateDecisionsWithDiagnostics(ast, lang);
    assert.equal(diagnostics.length, 1, lang);
    assert.equal(diagnostics[0].decision, 'D');
    assert.doesNotMatch(code, /if \(?(false|False)\b/, lang);
  }
});

test('thunder gen exits 1 and prints IL-GEN-001 on stderr, still emitting a throwing scaffold', () => {
  const p = write('u.thunder', UNTRANSLATED);
  const r = spawnSync(process.execPath, [CLI, 'gen', p, '--target', 'python'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /error IL-GEN-001 \(decision D, rule weird\): Thunder could not translate the condition 'amount ~ 5' for Python/);
  assert.match(r.stdout, /_thunder_untranslated\(/);
  const j = JSON.parse(spawnSync(process.execPath, [CLI, 'gen', p, '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(j.diagnostics[0].code, 'IL-GEN-001');
  assert.equal(spawnSync(process.execPath, [CLI, 'explain', 'IL-GEN-001'], { encoding: 'utf8' }).status, 0);
});

test('thunder test --target reports not translated as an error, not a pass or a null answer', () => {
  const p = write('u2.thunder', UNTRANSLATED);
  const r = spawnSync(process.execPath, [CLI, 'test', p, '--target', 'typescript'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /ERROR D \/ old , not translated: Thunder could not translate/);
  assert.match(r.stdout, /PASS  Ok \/ one/);
  const j = JSON.parse(spawnSync(process.execPath, [CLI, 'test', p, '--target', 'typescript', '--json'], { encoding: 'utf8' }).stdout);
  const old = j.cases.find((c) => c.key === 'D / old');
  assert.equal(old.status, 'error');
  assert.equal(old.kind, 'not-translated');
  assert.equal('actual' in old, false);
});

// ── 3. Failure vs a real null answer ─────────────────────────────────────────

test('a real null answer is { status: ok, value: null }; a crash is a runtime-error', () => {
  const src = `mission N
decision NoDefault
  inputs
    x
  rule big
    when x > 1
    return Big
decision Crash
  inputs
    order
  rule deep
    when order.total > 1
    return Big
  default
    return Small
test NoDefault
  case small
    given x 0
test Crash
  case missing
    given order 1
`;
  const run = runTypescriptTarget(parseIntent(src));
  assert.deepEqual(run.results['NoDefault / small'], { status: 'ok', value: null });
  // order is the number 1, so order.total is undefined and the comparison is false , not a crash.
  assert.equal(run.results['Crash / missing'].status, 'ok');
  // order is 1, so order.total is undefined and `order.total.amount` throws a TypeError: a runtime-error, not null.
  const crash = runTypescriptTarget(parseIntent(src.replace('when order.total > 1', 'when order.total.amount > 1')));
  assert.equal(crash.results['Crash / missing'].status, 'error');
  assert.equal(crash.results['Crash / missing'].kind, 'runtime-error');
  // A case that gives no value for an input is not run with a made-up one: missing-input, not an answer.
  const missing = runTypescriptTarget(parseIntent(src.replace('given order 1', 'given x 1')));
  assert.equal(missing.results['Crash / missing'].kind, 'missing-input');
  assert.match(missing.results['Crash / missing'].message, /gives no value for order/);
  assert.match(crash.results['Crash / missing'].message, /threw while running Crash \/ missing/);
});

test('the Python runner reports a raised exception per case, not None', { skip: !HAVE_PY && 'python3 not available' }, () => {
  const src = `mission N
decision Crash
  inputs
    order
  rule deep
    when order.total > 1
    return Big
  default
    return Small
decision Fine
  inputs
    x
  rule big
    when x > 1
    return Big
test Crash
  case missing
    given order 1
test Fine
  case none
    given x 0
`;
  const run = runPythonTarget(parseIntent(src));
  assert.equal(run.results['Crash / missing'].kind, 'runtime-error');
  assert.match(run.results['Crash / missing'].message, /AttributeError/);
  assert.deepEqual(run.results['Fine / none'], { status: 'ok', value: null });
});

test('classifySpawn tells a missing toolchain, a timeout, a compile failure, and a crash apart', () => {
  assert.equal(classifySpawn({ error: { code: 'ENOENT' } }, { tool: 'go' }).kind, 'missing-toolchain');
  assert.equal(classifySpawn({ error: { code: 'ETIMEDOUT' }, signal: 'SIGTERM', status: null }, { tool: 'go' }).kind, 'timeout');
  assert.equal(classifySpawn({ status: 1, stderr: 'main.go:3: syntax error' }, { tool: 'go', runtimePattern: /panic:/ }).kind, 'compile-failed');
  assert.equal(classifySpawn({ status: 2, stderr: 'panic: boom' }, { tool: 'go', runtimePattern: /panic:/ }).kind, 'runtime-error');
  assert.equal(classifySpawn({ status: 101, stderr: 'thread main panicked' }, { tool: 'bin', phase: 'run' }).kind, 'runtime-error');
});

test('conformance grades a structured error as error (with kind), never as a null answer', () => {
  const ast = parseIntent(UNTRANSLATED);
  const rep = buildConformance(ast, { targets: ['typescript'], results: { typescript: runTypescriptTarget(ast).results } });
  const old = rep.cases.find((c) => c.key === 'D / old');
  assert.equal(old.targets.typescript.status, 'error');
  assert.equal(old.targets.typescript.kind, 'not-translated');
  assert.ok(rep.failures.some((f) => f.case === 'D / old' && f.kind === 'not-translated'));
  // Fed plain values (--results) still grade as before.
  const fed = buildConformance(ast, { targets: ['python'], results: { python: { 'Ok / one': 'Big' } } });
  assert.equal(fed.cases.find((c) => c.key === 'Ok / one').targets.python.status, 'pass');
  assert.equal(isCaseResult({ status: 'ok', value: null }), true);
  assert.equal(isCaseResult(null), false);
});

// ── 2. Money ─────────────────────────────────────────────────────────────────

test('the semantic engine adds decimals exactly: 0.1 + 0.2 == 0.3', () => {
  assert.equal(evalExpr('a + b == 0.3', { a: 0.1, b: 0.2 }), true);
  assert.equal(evalExpr('a * 3 == 0.3', { a: 0.1 }), true);
  assert.equal(evalExpr('a - b == 0.2', { a: 0.3, b: 0.1 }), true);
  assert.equal(evalExpr('a / 0 > 1', { a: 1 }), false); // still neutralized, never Infinity
});

test('Money parses and formats exactly, refuses sub-unit precision, and rounds half-even only on request', () => {
  assert.equal(parseMoney('12.30'), 1230n);
  assert.equal(parseMoney('0.1') + parseMoney('0.2'), parseMoney('0.3'));
  assert.equal(parseMoney('$1,234.5', { allowDollar: true }), 123450n);
  assert.equal(parseMoney('-0.05'), -5n);
  assert.throws(() => parseMoney('12.305'), MoneyError);
  assert.equal(parseMoney('12.300'), 1230n); // trailing zeros are exact, not extra precision
  assert.equal(formatMoney(1230n), '12.30');
  assert.equal(formatMoney(-5n), '-0.05');
  assert.equal(formatMoney(5n, { minorUnits: 0 }), '5');
  // Half up, a half going away from zero: the same rule as Thunder Core's round.
  assert.equal(roundHalfUp('2.345'), 235n);
  assert.equal(roundHalfUp('2.355'), 236n);
  assert.equal(roundHalfUp('2.3449'), 234n);
  assert.equal(roundHalfUp('-2.345'), -235n);
  assert.equal(roundHalfUp('2.5', { minorUnits: 0 }), 3n);
  assert.equal(roundHalfUp('2.344'), 234n);
  assert.equal(minorUnitsFor('JPY'), 0);
  assert.equal(minorUnitsFor('KWD'), 3);
  assert.equal(minorUnitsFor('USD'), 2);
  assert.equal(moneyTypeMinorUnits('Money(JPY)'), 0);
  assert.equal(moneyTypeMinorUnits('Money'), 2);
  assert.equal(moneyTypeMinorUnits('number'), null);
  assert.equal(typeof barrel.parseMoney, 'function');
});

test('Money comparisons render with each target\'s exact type, never a float', () => {
  const opts = (dialect) => ({ inputs: ['amount', 'fee'], dialect, money: { amount: 2, fee: 2 } });
  const w = 'amount + fee == 0.3';
  assert.equal(exprToCode(w, opts('js')), '((amount + fee) === 30n)');
  assert.equal(exprToCode(w, opts('python')), '((amount + fee) == Decimal("0.30"))');
  assert.equal(exprToCode(w, opts('csharp')), '((amount + fee) == 0.30m)');
  assert.equal(exprToCode(w, opts('java')), '(amount.add(fee).compareTo(new java.math.BigDecimal("0.30")) == 0)');
  assert.equal(exprToCode(w, opts('go')), '((amount + fee) == int64(30))');
  assert.equal(exprToCode(w, opts('rust')), '((amount + fee) == 30i64)');
  // No exact representation wired up, or an inexact operation: refused (becomes IL-GEN-001), never a float.
  assert.throws(() => exprToCode(w, opts('kotlin')), /no exact representation/);
  assert.throws(() => exprToCode('amount * 2 > 1', opts('js')), /not translated exactly/);
  assert.throws(() => exprToCode('amount > 1.005', opts('js')), /more decimal places/);
});

test('the TypeScript runner decides Money exactly (0.1 + 0.2 == 0.3)', () => {
  const run = runTypescriptTarget(parseIntent(MONEY));
  assert.deepEqual(run.results['RefundDecision / cents'], { status: 'ok', value: 'Exact' });
  assert.deepEqual(run.results['RefundDecision / small'], { status: 'ok', value: 'Approve' });
  assert.deepEqual(run.results['RefundDecision / big'], { status: 'ok', value: 'Review' });
});

test('the Python runner decides Money with Decimal', { skip: !HAVE_PY && 'python3 not available' }, () => {
  const run = runPythonTarget(parseIntent(MONEY));
  assert.deepEqual(run.results['RefundDecision / cents'], { status: 'ok', value: 'Exact' });
  assert.deepEqual(run.results['RefundDecision / big'], { status: 'ok', value: 'Review' });
});

test('the Go runner decides Money with int64 minor units', { skip: !(NATIVE && goAvailable()) && 'set TL_NATIVE_TARGETS=1 with a Go toolchain to run' }, () => {
  const run = runGoTarget(parseIntent(MONEY));
  assert.deepEqual(run.results['RefundDecision / cents'], { status: 'ok', value: 'Exact' });
});

test('the Rust runner decides Money with i64 minor units', { skip: !(NATIVE && rustAvailable()) && 'set TL_NATIVE_TARGETS=1 with a Rust toolchain to run' }, () => {
  const run = runRustTarget(parseIntent(MONEY));
  assert.deepEqual(run.results['RefundDecision / cents'], { status: 'ok', value: 'Exact' });
});

test('thunder test --target typescript passes the 0.1 + 0.2 Money case', () => {
  const r = spawnSync(process.execPath, [CLI, 'test', write('m.thunder', MONEY), '--target', 'typescript'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /4\/4 passed/);
});

test('plain contracts read dollars as exact cents and refuse sub-cent amounts', () => {
  const src = `Refund approval

We need
  the amount, in dollars

Do we approve?
  Approve when the amount is at most $12.30.
  Otherwise, Review.

Examples
  $12.30   gives Approve   (edge)
  $12.31   gives Review    (over)
`;
  const model = parsePlainContract(src);
  assert.equal(model.rules[0].conditions[0].value, 12.3);
  assert.match(renderPlainContract(model), /at most \$12\.30/); // was "$12.3"
  assert.match(plainToThunder(model), /amount <= 12\.3/);
  assert.throws(() => parsePlainContract(src.replace('$12.31', '$12.315')), /finer than a cent/);
});
