import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseIntent } from '../src/parse.mjs';
import { toTypeScript, toCSharp, toJava, toPython } from '../src/codegen.mjs';
import { inferInputTypes } from '../src/target-types.mjs';

// The decision OpenThunder reported: promoted from code, so its inputs carry no declared types.
const REFUND = `mission RefundDecision

decision RefundDecision
  inputs
    amount
    withinWindow
  rule condition_1
    when amount >= 0 and amount <= 100 and withinWindow
    return Approve
  default
    return Review
`;
// Declared types, a text comparison, and a mission named differently from its decision.
const PRICING = `mission PricingPolicy

decision ChooseTier
  inputs
    seats: number
    plan: string
    vip: boolean
  rule enterprise
    when plan == "enterprise" or seats >= 50
    return Priority
  default
    return Standard
`;

test('input types: declared first, then example values, then how the rules use them', () => {
  const pricing = parseIntent(PRICING);
  assert.deepEqual(inferInputTypes(pricing, pricing.decisions[0]), { seats: 'number', plan: 'string', vip: 'bool' });
  const refund = parseIntent(REFUND);
  assert.deepEqual(inferInputTypes(refund, refund.decisions[0]), { amount: 'number', withinWindow: 'bool' });
  const text = parseIntent('decision D\n  inputs\n    country\n    other\n  rule r\n    when country == "US"\n    return A\n  default\n    return B\n');
  assert.deepEqual(inferInputTypes(text, text.decisions[0]), { country: 'string', other: 'string' });
});

test('generated decisions have typed parameters and plain names in every language', () => {
  for (const src of [REFUND, PRICING]) {
    const ast = parseIntent(src);
    const ts = toTypeScript(ast), cs = toCSharp(ast), java = toJava(ast), py = toPython(ast);
    for (const code of [ts, cs, java, py]) {
      assert.doesNotMatch(code, /: unknown|dynamic |Object (amount|seats)|: number: |"amount"|"seats"/, code);
    }
  }
  const p = parseIntent(PRICING);
  assert.match(toTypeScript(p), /export function chooseTier\(seats: number, plan: string, vip: boolean\): string/);
  assert.match(toCSharp(p), /public static string ChooseTier\(double seats, string plan, bool vip\)/);
  assert.match(toJava(p), /public static String chooseTier\(double seats, String plan, boolean vip\)/);
  assert.match(toJava(p), /java\.util\.Objects\.equals\(plan, "enterprise"\)/);
  assert.match(toPython(p), /def choose_tier\(seats: float, plan: str, vip: bool\) -> str:/);
});

test('no name clashes: the TypeScript mission function and a C# decision named like its class are renamed', () => {
  const ast = parseIntent(REFUND);
  const ts = toTypeScript(ast);
  assert.equal(ts.match(/export function refundDecision\(/g)?.length, 1);
  assert.match(ts, /export function run\(\): void/);
  const cs = toCSharp(ast);
  assert.match(cs, /public static class RefundDecision/);
  assert.match(cs, /public static string Decide\(double amount, bool withinWindow\)/);
  // A mission named differently keeps its own function name.
  assert.match(toTypeScript(parseIntent(PRICING)), /export function pricingPolicy\(\): void/);
});

test('thunder gen writes Java to a file named after its public class', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tl-gen-'));
  try {
    writeFileSync(join(dir, 'refund.thunder'), REFUND);
    const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
    execFileSync(process.execPath, [cli, 'gen', join(dir, 'refund.thunder'), '--target', 'java', '--out', join(dir, 'out')]);
    assert.deepEqual(readdirSync(join(dir, 'out')), ['RefundDecision.java']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A real type check of the generated TypeScript, when TypeScript is installed (it is in the repository's dev setup).
const require = createRequire(import.meta.url);
let ts = null;
try { ts = require('typescript'); } catch { /* not installed here */ }
test('the generated TypeScript type-checks in strict mode', { skip: ts ? false : 'typescript is not installed' }, () => {
  for (const src of [REFUND, PRICING]) {
    const code = toTypeScript(parseIntent(src));
    const file = '/gen.ts';
    const options = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2020, types: [], noLib: false };
    const host = ts.createCompilerHost(options);
    const read = host.getSourceFile.bind(host);
    host.getSourceFile = (name, lang) => (name === file ? ts.createSourceFile(file, code, lang) : read(name, lang));
    host.fileExists = ((orig) => (name) => name === file || orig(name))(host.fileExists.bind(host));
    const program = ts.createProgram([file], options, host);
    const errors = ts.getPreEmitDiagnostics(program).filter((d) => d.file?.fileName === file).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    assert.deepEqual(errors, [], code);
  }
});
void dirname;
