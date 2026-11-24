// No loss: every step carries its full meaning (`expr`, thunder-expr-v1) under the short words; Details and the full
// Thunder Text show every detail; and code → Thunder → code gives back the same meaning (TypeScript, Python, Go).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatement, parseExpr, renderStatement, sayFull, detailOf, detailParts, exprCounts, sameExpr, wordsAgree } from '../src/meaning.mjs';
import { stepRoundTrip, behaviorCase, runBehavior } from '../src/round-trip.mjs';
import { readCode } from '../src/read.mjs';
import { thunderModel, modelText, readLevel } from '../src/model.mjs';
import { accountsFor } from '../src/faithful.mjs';

const flat = (steps) => (steps || []).flatMap((s) => [s, ...flat(s.children), ...flat(s.otherwise), ...(s.handlers || []).flatMap((h) => flat(h.steps)), ...flat(s.always?.steps)]);
const stepsOf = (code, language) => readCode(code, { language }).items.find((i) => i.kind === 'function').steps;

// ── 1. The tree ───────────────────────────────────────────────────────────────────────────────────────────

test('a call keeps its callee path and every argument, with exact values', () => {
  const e = parseStatement('this.repo.save(order, { validate: false, retries: 3 });', 'typescript');
  assert.equal(e.kind, 'call');
  assert.deepEqual(e.callee, { kind: 'member', object: { kind: 'member', object: { kind: 'name', name: 'this' }, property: 'repo' }, property: 'save' });
  assert.equal(e.args[0].name, 'order');
  const obj = e.args[1];
  assert.equal(obj.kind, 'object');
  assert.deepEqual(obj.entries.map((x) => [x.key.value, x.value.value]), [['validate', false], ['retries', 3]]);
});

test('an assignment keeps its whole target, keys included, and its value', () => {
  const e = parseStatement('headers["Content-Type"][i] += value * 2', 'python');
  assert.equal(e.kind, 'assign');
  assert.equal(e.op, '+=');
  assert.equal(e.target.kind, 'index');
  assert.equal(e.target.object.index.value, 'Content-Type');
  assert.equal(e.target.index.name, 'i');
  assert.deepEqual(e.value, { kind: 'binary', op: '*', left: { kind: 'name', name: 'value' }, right: { kind: 'literal', type: 'number', value: 2, raw: '2' } });
});

test('conditions keep every operand, operator, and negation', () => {
  const e = parseStatement('if (!user || user.age < 18 && !isAdmin(user)) {', 'typescript');
  assert.equal(e.kind, 'if');
  assert.equal(e.test.kind, 'logic');
  assert.equal(e.test.op, 'or');
  assert.equal(e.test.operands[0].kind, 'not');
  assert.equal(e.test.operands[1].op, 'and', '&& binds tighter than ||');
  assert.equal(e.test.operands[1].operands[0].op, '<');
  assert.deepEqual(exprCounts(e.test), { neg: 2, logic: 2, compare: 1 });
  const py = parseStatement('if key not in self.cache and value is not None:', 'python');
  assert.equal(py.test.operands[0].op, 'not in');
  assert.equal(py.test.operands[1].op, 'is not');
});

test('Go precedence is Go\'s own: | is additive, & is multiplicative', () => {
  const e = parseExpr('a + b | c & d', 'go');
  assert.equal(e.op, '|');
  assert.equal(e.left.op, '+');
  assert.equal(e.right.op, '&');
});

test('literals keep their exact value: numbers, escaped text, f-strings, templates', () => {
  assert.equal(parseExpr('0x1F', 'typescript').value, 31);
  assert.equal(parseExpr('"a\\tb"', 'typescript').value, 'a\tb');
  const f = parseExpr('f"{name!r}: {value:>10}"', 'python');
  assert.equal(f.kind, 'template');
  assert.deepEqual(f.parts[0], { expr: { kind: 'name', name: 'name' }, conv: 'r' });
  assert.equal(f.parts[2].format, '>10');
  const t = parseExpr('`Hello ${user.name}!`', 'typescript');
  assert.deepEqual(t.parts, ['Hello ', { expr: { kind: 'member', object: { kind: 'name', name: 'user' }, property: 'name' } }, '!']);
});

test('a lambda keeps its parameters; a block body is the step\'s own children', () => {
  const e = parseStatement('items.forEach((item, i) => {\n  save(item);\n});', 'typescript');
  const fn = e.args[0];
  assert.equal(fn.kind, 'lambda');
  assert.deepEqual(fn.params, ['item', 'i']);
  assert.deepEqual(fn.body, { kind: 'block' });
  const g = parseStatement('go func(ctx context.Context) error {\n\treturn nil\n}(ctx)', 'go');
  assert.equal(g.kind, 'go');
  assert.equal(g.value.callee.kind, 'lambda');
});

test('returns and throws keep the value, the error type, and the message', () => {
  const t = parseStatement("throw new HttpError(404, 'Order not found');", 'typescript');
  assert.equal(t.kind, 'throw');
  assert.equal(t.error, 'HttpError');
  assert.equal(t.message, 'Order not found');
  const p = parseStatement('raise ValueError(f"bad {x}") from err', 'python');
  assert.equal(p.error, 'ValueError');
  assert.equal(p.cause.name, 'err');
  const g = parseStatement('return nil, fmt.Errorf("open %s: %w", name, err)', 'go');
  assert.equal(g.kind, 'return');
  assert.equal(g.value.form, 'tuple');
  assert.equal(g.value.items[1].args[0].value, 'open %s: %w');
});

test('Go composite literals and Python comprehensions are read, not guessed', () => {
  const g = parseStatement('cfg := &Config{Name: "x", Ports: []int{80, 443}}', 'go');
  assert.equal(g.value.op, '&');
  assert.equal(g.value.value.type, 'Config');
  assert.deepEqual(g.value.value.entries[1].value.items.map((x) => x.value), [80, 443]);
  const c = parseExpr('[u.name for u in users if u.active]', 'python');
  assert.equal(c.kind, 'comprehension');
  assert.equal(c.clauses[0].conds[0].property, 'active');
});

test('what the reader cannot read is kept as code, never guessed', () => {
  assert.equal(parseStatement('return a ~> b;', 'typescript').kind, 'code');
  assert.equal(parseStatement('import idna', 'python').kind, 'code');
  // JSX is read (tag, attributes, text, values), not kept as code.
  const jsx = parseStatement('return <div className="x">{a}</div>;', 'typescript').value;
  assert.deepEqual([jsx.kind, jsx.tag, jsx.attrs[0].name, jsx.children[0].value.name], ['jsx', 'div', 'className', 'a']);
  assert.equal(parseExpr('a +', 'typescript'), null);
  assert.equal(parseStatement('x = = 1', 'python').kind, 'code');
  // A word that only looks like a value on Object.prototype is a name, not a boolean.
  assert.deepEqual(parseExpr('toString(node)', 'javascript').callee, { kind: 'name', name: 'toString' });
});

// ── 2. Every step carries it ─────────────────────────────────────────────────────────────────────────────

test('every step the reader makes carries an expr, in every language', () => {
  const samples = {
    typescript: 'function f(a: number, opts: Opts) {\n  if (a > 1 && !opts.dry) {\n    save(a, { validate: false });\n    return 1;\n  }\n  for (const x of items) { log(x) }\n  try { run() } catch (e) { report(e) }\n  return a ?? 0;\n}',
    python: 'def f(a, b=None):\n    if not a:\n        raise ValueError("no a")\n    for k, v in b.items():\n        out[k] = v\n    with open(p) as fh:\n        data = fh.read()\n    return [x for x in data if x]\n',
    go: 'package main\n\nfunc f(a int) (int, error) {\n\tif err := check(a); err != nil {\n\t\treturn 0, err\n\t}\n\tfor i := 0; i < a; i++ {\n\t\ttotal += i\n\t}\n\tswitch a {\n\tcase 1:\n\t\treturn 1, nil\n\t}\n\treturn total, nil\n}\n',
    java: 'class A {\n  int f(int a) {\n    String s = name.trim();\n    if (a > 0) { return a; }\n    return -1;\n  }\n}\n',
    ruby: 'def f(a)\n  return nil unless a\n  a.each { |x| puts x }\n  a.size\nend\n',
  };
  for (const [language, code] of Object.entries(samples)) {
    const steps = flat(stepsOf(code, language));
    assert.ok(steps.length > 2, `${language}: steps read`);
    for (const s of steps) assert.ok(s.expr && s.expr.kind, `${language}: step "${s.says}" has an expr`);
  }
});

test('Go: `i++` followed by another statement is two steps (nothing joined, nothing lost)', () => {
  const steps = stepsOf('package main\n\nfunc f() {\n\ti++\n\tdone()\n}\n', 'go');
  assert.deepEqual(steps.map((s) => s.expr.kind), ['unary', 'call']);
});

test('the words stay consistent with the tree (numbers, quoted text, the call made)', () => {
  for (const s of flat(stepsOf('function f(order) {\n  if (order.total > 100) { notify("big order"); }\n  return save(order);\n}', 'typescript'))) assert.deepEqual(wordsAgree(s), [], s.says);
  const wrong = { kind: 'call', says: 'Calls notify: "small order" 7 times', expr: parseStatement('notify("big order", 100)', 'typescript') };
  assert.equal(wordsAgree(wrong).length, 2);
});

test('the faithfulness gate counts operators from the tree: a TypeScript non-null `!` is not a negation', () => {
  const tree = parseExpr('response!.ok', 'typescript');
  assert.equal(exprCounts(tree).neg, 0);
  assert.equal(accountsFor('response!.ok', "the response's ok is set", tree), true);
  // Without the tree, the text count sees a `!` and rejects the words.
  assert.equal(accountsFor('response!.ok', "the response's ok is set"), false);
  // A real negation is still required in the words.
  assert.equal(accountsFor('!response.ok', "the response's ok is set", parseExpr('!response.ok', 'typescript')), false);
});

// ── 3. Details on demand ─────────────────────────────────────────────────────────────────────────────────

const app = [{ path: 'orders.ts', source: 'export function placeOrder(order: Order) {\n  persist(order, { validate: false });\n  const total = order.price * order.quantity + shipping(order);\n  if (total > 100 && !order.vip) {\n    throw new Error("Too big");\n  }\n  return total;\n}\n' }];

test('Details gives each step its tree and what the short words leave out', () => {
  const model = thunderModel(app);
  const m = model.members.find((x) => x.name === 'placeOrder');
  const d = readLevel(model, 'details', m.id);
  const save = d.steps.find((s) => /persist/i.test(s.text));
  assert.equal(save.expr.kind, 'call');
  assert.equal(save.full, `${save.text} — with: order, { validate: false }`);
  const total = d.steps.find((s) => /total/i.test(s.text) && s.expr?.kind === 'assign');
  assert.match(total.detail, /order\.price \* order\.quantity \+ shipping\(order\)/);
  assert.equal(detailOf({ kind: 'call', says: 'Calls save', expr: parseStatement('save(order, { validate: false })', 'typescript') }), 'Calls save — with: order, { validate: false }');
  assert.deepEqual(detailParts({ kind: 'return', says: 'Returns total', expr: parseStatement('return total', 'typescript') }), [], 'nothing left out: no detail');
});

test('Thunder Text: short by default, every argument and value with { full: true }', () => {
  const model = thunderModel(app);
  const id = model.members.find((x) => x.name === 'placeOrder').id;
  const short = modelText(model, id);
  const full = modelText(model, id, { full: true });
  assert.doesNotMatch(short, /validate: false/);
  assert.match(full, /Calls persist — with: order, \{ validate: false \}/);
  assert.equal(full.split('\n').length, short.split('\n').length, 'the full form adds detail, not lines');
  assert.equal(readLevel(model, 'text', id, { full: true }).text, full);
  assert.equal(sayFull(parseExpr('a && !b || c', 'typescript')), 'a and not b or c');
});

// ── 4. Round trip ────────────────────────────────────────────────────────────────────────────────────────

const ROUND = {
  typescript: 'function f(a: number, opts: Opts) {\n  const { x, y } = await load(a);\n  headers[key] = value ?? `v${a}`;\n  if (a > 1 && !opts.dry) {\n    save(a, { validate: false, ...opts });\n  }\n  for (let i = 0; i < a; i++) { log(i) }\n  items.forEach((item) => {\n    use(item);\n  });\n  return a > 0 ? x : -y;\n}',
  python: 'def f(a, b=None):\n    if not a or a.x is None:\n        raise ValueError(f"bad {a!r}") from None\n    for k, v in b.items():\n        out[k] = v * 2\n    x, y = y, x\n    return [i for i in a if i % 2 == 0]\n',
  go: 'package main\n\nfunc f(a int) (int, error) {\n\tif err := check(a); err != nil {\n\t\treturn 0, fmt.Errorf("check: %w", err)\n\t}\n\tcfg := &Config{Name: "x", Ports: []int{80, 443}}\n\tfor _, p := range cfg.Ports {\n\t\ttotal += p << 1\n\t}\n\tdefer f.Close()\n\treturn total, nil\n}\n',
};

for (const [language, code] of Object.entries(ROUND)) {
  test(`round trip (${language}): every step written back from its tree reads back as the same tree`, () => {
    const steps = flat(stepsOf(code, language));
    assert.ok(steps.length >= 6);
    for (const s of steps) {
      const r = stepRoundTrip(s, language);
      assert.equal(r.result, 'exact', `${s.code} -> ${r.code} (${r.why})`);
    }
  });
}

test('round trip: a written-back tree that differs is reported, never called exact', () => {
  const step = { expr: parseStatement('return a + b * c', 'typescript') };
  // Tamper with the tree: what was read back must be compared, not assumed.
  const r = stepRoundTrip(step, 'typescript');
  assert.equal(r.result, 'exact');
  assert.equal(sameExpr(parseStatement('return (a + b) * c', 'typescript'), step.expr), false, 'brackets change meaning, so they change the tree');
  assert.equal(stepRoundTrip({ expr: { kind: 'code', text: 'x' } }, 'typescript').result, 'code');
  assert.equal(stepRoundTrip({ expr: parseStatement('a ?? b', 'typescript') }, 'python').result, 'not-written', 'Python has no ??');
});

test('behavior: original and written-back code give the same answers on generated inputs (Node and Python)', () => {
  const ts = behaviorCase({ expr: parseStatement('return a - (b - c) * 2 > 0 || !d', 'typescript') }, 'return a - (b - c) * 2 > 0 || !d', 'typescript');
  assert.ok(ts && ts.names.length === 4);
  assert.equal(runBehavior([ts], 'typescript')[0].result, 'same');
  // A wrong rendering is caught by running it.
  assert.equal(runBehavior([{ ...ts, written: 'a - b - c * 2 > 0 || !d' }], 'typescript')[0].result, 'different');
  const py = behaviorCase({ expr: parseStatement('return -x ** 2 if not y else x // 2', 'python') }, 'return -x ** 2 if not y else x // 2', 'python');
  const [r] = runBehavior([py], 'python');
  assert.ok(r.result === 'same' || r.result === 'not-run', r.why);
  assert.equal(runBehavior([{ names: ['a'], original: 'a', written: 'a' }], 'go')[0].result, 'not-run', 'Go is not run, and says so');
});
