import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileHumanContract, previewHumanContract, renderHumanContract } from '../src/human-contract.mjs';
import { parseIntent } from '../src/parse.mjs';
import { evaluateDecision } from '../src/runtime.mjs';
import { toTypeScript, toPython } from '../src/codegen.mjs';
import { liftSource } from '../src/lift.mjs';

const fixture = new URL('../../examples/human/RefundReview.thunder-human', import.meta.url);
const source = readFileSync(fixture, 'utf8');
const CLI = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

test('compact refund notation lowers to the existing grammar and runs all five examples', () => {
  const report = previewHumanContract(source);
  assert.equal(report.tests.total, 5); assert.equal(report.tests.passed, 5);
  assert.equal(report.application, 'not_checked');
  assert.equal(report.origin, 'human-v1');
  assert.match(report.canonicalSource, /^mission RefundReview/);
  assert.match(report.canonicalSource, /case exactly at the limit/);
  assert.equal(parseIntent(report.canonicalSource).decisions[0].name, 'RefundPolicy');
});

test('readable and canonical forms preserve the same behavior across a boundary sweep', () => {
  const canonical = compileHumanContract(source);
  const ast = parseIntent(canonical);
  for (let amount = -2; amount <= 102; amount++) for (const withinWindow of [false, true]) {
    const result = evaluateDecision(ast.decisions[0], { amount, withinWindow });
    assert.equal(result.result, amount >= 0 && amount <= 100 && withinWindow ? 'Approve' : 'Review');
    assert.equal(result.ok, true);
  }
  assert.deepEqual(previewHumanContract(canonical).tests, previewHumanContract(source).tests);
});

test('reading view spells out boundaries and first-match semantics without claiming application verification', () => {
  const text = renderHumanContract(previewHumanContract(source));
  assert.match(text, /amount is at most 100/);
  assert.match(text, /first match wins/);
  assert.match(text, /Application: not checked/);
  assert.match(text, /Purpose is author-stated/);
});

test('off-by-one condition fails the named example with expected and actual outputs', () => {
  const report = previewHumanContract(source.replace('amount <= 100', 'amount < 100'));
  assert.equal(report.tests.failed, 1);
  assert.equal(report.tests.results[1].case, 'exactly at the limit');
  assert.equal(report.tests.results[1].actual, 'Review');
});

test('the lowered representation still works with existing language generators', () => {
  const ast = parseIntent(compileHumanContract(source));
  assert.match(JSON.stringify(toTypeScript(ast)), /RefundPolicy/);
  assert.match(JSON.stringify(toPython(ast)), /RefundPolicy/);
});

test('unknown vocabulary and input typos are errors rather than inferred behavior', () => {
  assert.throws(() => compileHumanContract(source.replace('purpose ', 'intention ')), /Expected contract/);
  assert.throws(() => compileHumanContract(source.replace('amount >= 0', 'ammount >= 0')), /Unknown input ammount/);
  assert.throws(() => compileHumanContract(source.replace('amount >= 0', 'amount >= (')), /Line/);
});

test('missing defaults, examples, headers, cells, duplicate cases, and undeclared outcomes are rejected', () => {
  for (const changed of [
    source.replace('  otherwise -> Review', ''),
    source.split('examples RefundPolicy')[0],
    source.replace('| case ', '| name '),
    source.replace('| 99     | true', '|        | true'),
    source.replace('below the limit', 'exactly at the limit'),
    source.replace('| Approve |', '| Wrong |'),
    source.replace('withinWindow)', 'withinWindow, amount)'),
    source.replace('examples RefundPolicy', 'examples Refund'),
  ]) assert.throws(() => compileHumanContract(changed));
});

test('string literals stay quoted in reading views and all input columns remain explicit', () => {
  const text = `contract Account\npurpose Choose an account route.\ndecision Route(status)\n  when status == "active" -> Allow\n  otherwise -> Review\nexamples Route\n  | case | status | expect |\n  | active | "active" | Allow |\n  | new | "new" | Review |\n`;
  const report = previewHumanContract(text);
  assert.equal(report.tests.passed, 2);
  assert.match(renderHumanContract(report), /status equals "active"/);
});

test('an existing incomplete example is not presented as a successful check', () => {
  const ordinary = compileHumanContract(source).replace('    expect Approve', '');
  assert.equal(previewHumanContract(ordinary).tests.failed, 1);
});

test('CLI produces reading text, canonical source, and JSON using the same model', () => {
  for (const flags of [[], ['--format', 'source'], ['--json']]) {
    const run = spawnSync(process.execPath, [CLI, 'human', fileURLToPath(fixture), ...flags], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    if (flags.includes('--json')) assert.equal(JSON.parse(run.stdout).tests.passed, 5);
    else if (flags.includes('source')) assert.equal(run.stdout, compileHumanContract(source));
    else assert.match(run.stdout, /Contract examples: 5\/5 passed/);
  }
  const help = spawnSync(process.execPath, [CLI, 'help'], { encoding: 'utf8' });
  assert.match(help.stdout, /human <file>/);
});

test('code lifted from TypeScript and Python remains source-linked, inferred, and untested in the reading view', () => {
  const sources = [
    ['typescript', 'refund.ts', 'export function refund(amount: Money): Result { return approve(amount); }'],
    ['python', 'refund.py', 'def refund(amount: Money) -> Result:\n    return approve(amount)\n'],
  ];
  for (const [language, file, source] of sources) {
    const lifted = liftSource(source, { language, file });
    assert.equal(lifted.ok, true);
    const report = previewHumanContract(lifted.intentText);
    assert.equal(report.origin, 'inferred-code');
    assert.ok(report.sourceReferences.length > 0);
    assert.deepEqual(report.unknowns, lifted.lifted.unknown);
    const text = renderHumanContract(report);
    assert.match(text, /inferred draft, needs human review/);
    assert.match(text, /Business purpose is not established/);
    assert.match(text, /Behavior rules: not recovered/);
    assert.match(text, /Application: not checked/);
  }
});
