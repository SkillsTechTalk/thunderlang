import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { compileHumanContract } from '../src/human-contract.mjs';
import { translateDecisions, TRANSLATE_LANGUAGES } from '../src/translate.mjs';
import { evaluateDecision } from '../src/runtime.mjs';
import { readCode, searchReading, detectLanguage, toThunderCondition, toThunderOutcome, sayCondition } from '../src/read.mjs';

const TRIAGE = `contract SupportTriage
purpose Route each ticket to the right queue.

decision Priority(plan: string, outage: boolean, waitHours: number)
  when outage -> Urgent
  when plan == "enterprise" or waitHours > 24 -> High
  when not outage and waitHours >= 0 -> Normal
  otherwise -> Review

examples Priority
  case "outage": (plan: "free", outage: true, waitHours: 1) -> Urgent
`;
const CASES = [
  { plan: 'free', outage: true, waitHours: 1 },
  { plan: 'enterprise', outage: false, waitHours: 2 },
  { plan: 'free', outage: false, waitHours: 30 },
  { plan: 'free', outage: false, waitHours: 3 },
  { plan: 'free', outage: false, waitHours: -1 },
];
const original = parseIntent(compileHumanContract(TRIAGE));
const decide = (ast, inputs) => evaluateDecision(ast.decisions[0], inputs).result;

// The strongest check: ThunderLang -> each language -> read back -> same answers on every case.
for (const { key } of TRANSLATE_LANGUAGES) {
  test(`round trip through ${key}: the reading decides exactly like the original`, () => {
    const code = translateDecisions(original, key);
    const reading = readCode(code, { language: key });
    const d = reading.items.find((i) => i.kind === 'decision');
    assert.ok(d, `no decision read from ${key}:\n${code}\n${JSON.stringify(reading.items, null, 1)}`);
    assert.equal(d.status, 'read', JSON.stringify(d.unread));
    assert.equal(d.rules.length, 3);
    const back = parseIntent(d.thunder);
    for (const c of CASES) assert.equal(decide(back, c), decide(original, c), `${key} ${JSON.stringify(c)}`);
    assert.deepEqual(d.inputs.map((p) => p.type), ['string', 'boolean', 'number']);
  });
}

test('reads hand-written TypeScript: ternaries, else-if, enum answers, field paths', () => {
  const r = readCode(`
export const shipping = (order: Order): string => order.total >= 50 ? "Free" : "Standard";

function risk(score: number, flagged: boolean): Risk {
  if (flagged) {
    return Risk.High;
  } else if (score < 300) {
    return Risk.Medium;
  } else {
    return Risk.Low;
  }
}

function load(id: string) {
  const row = db.get(id);
  if (!row) throw new NotFoundError(id);
  return row;
}
`, { language: 'typescript' });
  const ship = r.items.find((i) => i.name === 'shipping');
  assert.equal(ship.kind, 'decision');
  assert.equal(ship.rules[0].when, 'order.total >= 50');
  assert.equal(ship.says, 'If order.total is at least 50, the answer is Free. Otherwise, the answer is Standard.');
  const risk = r.items.find((i) => i.name === 'risk');
  assert.deepEqual(risk.rules.map((x) => x.result), ['High', 'Medium']);
  assert.equal(risk.otherwise.result, 'Low');
  const load = r.items.find((i) => i.name === 'load');
  assert.equal(load.kind, 'function');
  assert.ok(load.unread.length >= 1, 'work that is not a rule is listed, not hidden');
  assert.ok(r.items.some((i) => i.kind === 'error' && i.name === 'NotFoundError'));
});

test('reads Java equals() and Python conditional expressions', () => {
  const j = readCode(`public class T {
  public static String tier(String plan, int seats) {
    if (plan.equals("enterprise") || seats > 100) return "Gold";
    return "Standard";
  }
}`, { language: 'java' }).items.find((i) => i.name === 'tier');
  assert.equal(j.rules[0].when, 'plan == "enterprise" or seats > 100');
  const p = readCode(`def label(score: int) -> str:\n    return "pass" if score >= 70 else "fail"\n`, { language: 'python' }).items[0];
  assert.equal(p.kind, 'decision');
  assert.equal(p.rules[0].result, 'pass');
  assert.equal(p.otherwise.result, 'fail');
});

test('never guesses: computed answers and calls with arguments are reported as not read', () => {
  const r = readCode(`function price(qty: number) {
  if (isHoliday(today())) return 0;
  if (qty > 10) return qty * 0.9;
  return qty;
}`, { language: 'typescript' });
  const f = r.items[0];
  assert.equal(f.kind, 'function');
  assert.ok(f.unread.some((u) => /condition/.test(u.reason)));
  assert.equal(toThunderCondition('isHoliday(today())'), null);
  assert.equal(toThunderOutcome('qty * 0.9'), null);
});

test('search and filters narrow the reading', () => {
  const code = translateDecisions(original, 'go') + '\n\nfunc Helper(x int) int {\n\ty := x * 2\n\treturn y\n}\n';
  const reading = readCode(code, { language: 'go' });
  assert.deepEqual(searchReading(reading, { query: 'enterprise' }).map((i) => i.name), ['Priority']);
  assert.deepEqual(searchReading(reading, { kinds: ['function'] }).map((i) => i.name), ['Helper']);
  assert.deepEqual(searchReading(reading, { query: 'urgent outage', kinds: ['decision'] }).map((i) => i.name), ['Priority']);
  assert.equal(searchReading(reading, { query: 'nothing-matches' }).length, 0);
});

test('language detection and plain-English operators', () => {
  assert.equal(detectLanguage('package main\nfunc A() {}'), 'go');
  assert.equal(detectLanguage("fn a(x: f64) -> &'static str { \"x\" }"), 'rust');
  assert.equal(detectLanguage('def a(x):\n    return 1'), 'python');
  assert.equal(detectLanguage('x', 'svc/Rules.java'), 'java');
  assert.equal(sayCondition('amount <= 100 and not late'), 'amount is at most 100 and not late');
});

test('readings drop noise parentheses but keep the ones that aid reading', async () => {
  const { simplifyExpr } = await import('../src/expr.mjs');
  assert.equal(simplifyExpr('((plan == "enterprise") or (waitHours > 24))'), 'plan == "enterprise" or waitHours > 24');
  assert.equal(simplifyExpr('(not outage and (waitHours >= 0))'), 'not outage and waitHours >= 0');
  assert.equal(simplifyExpr('a or (b and c)'), 'a or (b and c)');
  assert.equal(simplifyExpr('(a or b) and not c'), '(a or b) and not c');
  assert.equal(simplifyExpr('not (a and b)'), 'not (a and b)');
});
