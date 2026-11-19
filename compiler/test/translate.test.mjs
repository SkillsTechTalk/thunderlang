import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseIntent } from '../src/parse.mjs';
import { compileHumanContract } from '../src/human-contract.mjs';
import { translateDecisions, TRANSLATE_LANGUAGES } from '../src/translate.mjs';

const triage = parseIntent(compileHumanContract(`contract SupportTriage
purpose Route each ticket to the right queue.

decision Priority(plan: string, outage: boolean, waitHours: number)
  when outage -> Urgent
  when plan == "enterprise" or waitHours > 24 -> High
  otherwise -> Normal

examples Priority
  case "outage": (plan: "free", outage: true, waitHours: 1) -> Urgent
`));

test('translate covers the six tutorial languages', () => {
  assert.deepEqual(TRANSLATE_LANGUAGES.map((l) => l.key), ['typescript', 'python', 'go', 'rust', 'csharp', 'java']);
});

test('translate emits typed, first-match-wins functions per language', () => {
  const ts = translateDecisions(triage, 'typescript');
  assert.match(ts, /export function Priority\(plan: string, outage: boolean, waitHours: number\): string \{/);
  assert.match(ts, /if \(outage\) return "Urgent";/);
  assert.match(ts, /return "Normal";/);
  assert.match(translateDecisions(triage, 'python'), /def Priority\(plan: str, outage: bool, waitHours: float\) -> str:/);
  assert.match(translateDecisions(triage, 'go'), /func Priority\(plan string, outage bool, waitHours float64\) string \{/);
  assert.match(translateDecisions(triage, 'rust'), /fn Priority\(plan: &str, outage: bool, waitHours: f64\) -> &'static str \{/);
  assert.match(translateDecisions(triage, 'rust'), /waitHours > 24f64/);
  assert.match(translateDecisions(triage, 'csharp'), /public static string Priority\(string plan, bool outage, double waitHours\)/);
  assert.match(translateDecisions(triage, 'java'), /java\.util\.Objects\.equals\(plan, "enterprise"\)/);
});

test('without examples, input types come from how the rules use them', () => {
  const ast = parseIntent(`mission Shipping

decision Fee
  inputs
    total
    member
  rule free
    when total >= 50 or member
    return Free
  default
    return Standard
`);  assert.match(translateDecisions(ast, 'go'), /func Fee\(total float64, member bool\) string/);
});

test('rejects an unknown language with the supported list', () => {
  assert.throws(() => translateDecisions(triage, 'cobol'), /Unknown language cobol\. Use one of: typescript, python, go, rust, csharp, java\./);
});

test('translate stays browser-safe (no Node imports in it or its helpers)', () => {
  for (const f of ['translate.mjs', 'target-types.mjs', 'expr.mjs']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /from 'node:/, `${f} must not import Node modules`);
  }
});
