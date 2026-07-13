import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { toTypeScript, CODEGEN_SCHEMA } from '../src/codegen.mjs';
import { exprToJs } from '../src/expr.mjs';
import { evaluateDecision } from '../src/runtime.mjs';
import * as barrel from '../src/index.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'codegen.mjs');
const CLIBIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');

const DECISION = `mission CanReset
decision CanReset
  inputs
    tokenAgeMinutes
    attempts
  rule expired
    when tokenAgeMinutes > 15
    return Denied
  rule tooMany
    when attempts >= 5
    return Denied
  rule allowed
    when attempts < 5
    return Allowed
  default
    return Denied
`;

test('exprToJs translates the when-grammar to correct JS (input-aware literals)', () => {
  assert.equal(exprToJs('x > 5', { inputs: ['x'] }), '(x > 5)');
  assert.equal(exprToJs('status == active', { inputs: ['status'] }), '(status === "active")'); // bare token -> string literal
  assert.equal(exprToJs('a and b or c', { inputs: ['a', 'b', 'c'] }), '((a && b) || c)');
  assert.equal(exprToJs('tier in [1,2,3]', { inputs: ['tier'] }), '[1, 2, 3].includes(tier)');
  assert.equal(exprToJs('not done', { inputs: ['done'] }), '!done');
});

test('generated TypeScript has the provenance header, typed interfaces, and honest TODOs', () => {
  const ts = toTypeScript(parseIntent('mission CreateInvoice\ninput\n  email: Email\n  amount: Money\noutput\n  invoice: Invoice\nguarantee it holds\n  verify t\nnever leak a secret\n'));
  assert.match(ts, /generated from IntentLang/);
  assert.match(ts, /Deterministic, no AI/);
  assert.match(ts, /export interface CreateInvoiceInput \{[\s\S]*email: string;[\s\S]*amount: number;/);
  assert.match(ts, /GUARANTEE: it holds/);
  assert.match(ts, /NEVER: leak a secret/);
  assert.match(ts, /TODO: implement/);
});

test('the generated decision function is behaviorally identical to the runtime evaluator', () => {
  const ast = parseIntent(DECISION);
  const ts = toTypeScript(ast);
  // extract + build the generated function (strip the TS type annotations)
  const body = ts.match(/export function canReset\([^)]*\)[^{]*\{([\s\S]*?)\n\}/)[1];
  const canReset = new Function('tokenAgeMinutes', 'attempts', body);
  for (let t = 0; t <= 30; t += 3) {
    for (let a = 0; a <= 8; a += 1) {
      const gen = canReset(t, a);
      const rt = evaluateDecision(ast.decisions[0], { tokenAgeMinutes: t, attempts: a }).result;
      assert.equal(gen, rt, `t=${t} a=${a}: generated ${gen} != runtime ${rt}`);
    }
  }
});

test('a rule with an untranslatable condition degrades to a marked TODO, never a crash', () => {
  // force a parse failure inside a rule condition
  const ast = parseIntent('mission M\ndecision D\n  inputs\n    x\n  rule bad\n    when x +\n    return A\n  default\n    return B\n');
  const ts = toTypeScript(ast);
  assert.match(ts, /TODO: could not translate/);
  assert.doesNotThrow(() => toTypeScript(ast));
});

test('non-mission roots (event/api/service) generate under their real name, never "null"', () => {
  const ts = toTypeScript(parseIntent('event InvoiceCreated\npayload\n  invoiceId: InvoiceId\n'));
  assert.match(ts, /InvoiceCreated , generated from IntentLang/);
  assert.doesNotMatch(ts, /\bnull\b/);
});

test('barrel + CLI expose codegen', () => {
  assert.equal(barrel.CODEGEN_SCHEMA, 'intent-codegen-v1');
  assert.equal(typeof barrel.toTypeScript, 'function');
  const dir = mkdtempSync(join(tmpdir(), 'intent-gen-'));
  writeFileSync(join(dir, 'M.intent'), DECISION);
  const res = spawnSync(process.execPath, [CLIBIN, 'gen', join(dir, 'M.intent'), '--target', 'typescript'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /export function canReset/);
});
