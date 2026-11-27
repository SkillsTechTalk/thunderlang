// Thunder write in Thunder's words, and the fixes found by measuring it on real code (Flask, Click, Requests,
// humanize, toolz): bench/write-python-tasks.mjs, bench/write-python-heldout.mjs, scripts/write-sweep.mjs --verify.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderWrite, followLine } from '../src/write-steps.mjs';
import { thunderTree, thunderStep, nameWords } from '../src/write-words.mjs';
import { renderExpr, renderStatement } from '../src/meaning.mjs';

const say = (text, language, source) => { const r = thunderTree(text, language, source); return r.tree ? renderExpr(r.tree, language) : `ERROR ${r.error}`; };
const added = (r) => (r.patch || '').split('\n').filter((l) => /^\+(?!\+\+)/.test(l)).map((l) => l.slice(1));
const removed = (r) => (r.patch || '').split('\n').filter((l) => /^-(?!--)/.test(l)).map((l) => l.slice(1));
const write = (path, source, edits) => thunderWrite([{ path, source }], edits);

test('conditions in Thunder words are written in each language’s own way', () => {
  const py = 'def f(amount, max_length, words, order, member, name):\n    return 1\n';
  const ts = 'function f(amount, maxLength, words, order, member, name) { return 1; }';
  const rows = [
    ['amount is at least 100', 'amount >= 100', 'amount >= 100', 'amount >= 100'],
    ['total is below 0 and not member', null, null, null],
    ['the length of words is 0', 'len(words) == 0', 'words.length === 0', 'len(words) == 0'],
    ["order's total is more than 50", 'order.total > 50', 'order.total > 50', 'order.total > 50'],
    ['name is nothing', 'name is None', 'name == null', 'name == nil'],
    ['max length is at most 3', 'max_length <= 3', 'maxLength <= 3', 'maxLength <= 3'],
    ['amount is between 1 and 10', 'amount >= 1 and amount <= 10', 'amount >= 1 && amount <= 10', 'amount >= 1 && amount <= 10'],
    ['name starts with "a"', 'name.startswith("a")', 'name.startsWith("a")', 'strings.HasPrefix(name, "a")'],
    ['member is true', 'member is True', 'member === true', 'member == true'],
  ];
  for (const [words, p, t, g] of rows) {
    if (p) assert.equal(say(words, 'python', py), p, words);
    if (t) assert.equal(say(words, 'typescript', ts), t, words);
    if (g) assert.equal(say(words, 'go', ts), g, words);
  }
  assert.equal(say('amount is below 0 and not member', 'python', py), 'amount < 0 and not member');
  // A Thunder word with no fixed meaning in the language is refused, not guessed.
  assert.match(say('name contains "x"', 'go', ts), /^ERROR .*contains/);
});

test('steps in Thunder words: Give, Set, and Stop with', () => {
  const py = 'def f(amount, words):\n    return 1\n';
  assert.equal(renderStatement(thunderStep('Give the length of words', 'python', py).tree, 'python'), 'return len(words)');
  assert.equal(renderStatement(thunderStep('Set amount to amount * 2', 'python', py).tree, 'python'), 'amount = amount * 2');
  assert.deepEqual(thunderStep('Stop with "Amount must be positive"', 'python', py), { stop: 'Amount must be positive' });
  assert.equal(thunderStep('notify(customer)', 'python', py), null);
});

test('names are the function’s own first, never a word from a docstring, and an exact spelling wins', () => {
  assert.equal(nameWords('maxLength'), 'max length');
  assert.equal(nameWords('max_length'), 'max length');
  const src = 'def other():\n    """:param x: Value of the thing."""\n    return 1\n\ndef start(ctx, value):\n    if not value:\n        return False\n    return True\n';
  const r = write('a.py', src, { op: 'setCondition', member: { file: 'a.py', name: 'start', line: 5 }, step: 'line:6', when: 'the length of value is below 2' });
  assert.equal(r.status, 'written', r.reason);
  assert.deepEqual(added(r), ['    if len(value) < 2:']);
});

test('changing an elif comparison does not double its colon', () => {
  const src = 'def f(matches):\n    if len(matches) == 1:\n        return matches[0]\n    elif len(matches) > 1:\n        raise ValueError("many")\n    return None\n';
  const r = write('a.py', src, { op: 'setCondition', member: { file: 'a.py', name: 'f', line: 1 }, step: 'line:4', compare: '>=' });
  assert.equal(r.status, 'written', r.reason);
  assert.deepEqual(added(r), ['    elif len(matches) >= 1:']);
});

test('removing the only step of a Python function leaves pass, unless a docstring fills the body', () => {
  const src = 'def main() -> None:\n    cli.main()\n\n\ndef doc():\n    """Docs."""\n    run()\n';
  const a = write('b.py', src, { op: 'removeStep', member: { file: 'b.py', name: 'main', line: 1 }, step: 'line:2' });
  assert.deepEqual(added(a), ['    pass']);
  const b = write('b.py', src, { op: 'removeStep', member: { file: 'b.py', name: 'doc', line: 5 }, step: 'line:7' });
  assert.deepEqual(added(b), []);
  assert.deepEqual(removed(b), ['    run()']);
});

test('an input added and routed into the steps, on a signature over several lines: lines follow, and the proof holds', () => {
  const src = 'def iter_rows(\n    rows, col_count\n):\n    for row in rows:\n        yield row + ("",) * (col_count - len(row))\n';
  const M = { file: 'f.py', name: 'iter_rows', line: 1 };
  const r = write('f.py', src, [{ op: 'addInput', member: M, name: 'fill', default: '""' }, { op: 'setValue', member: M, step: 'line:5', from: '', toValue: 'fill' }]);
  assert.equal(r.status, 'written', r.reason);
  assert.ok(added(r).some((l) => /fill=""/.test(l)), r.patch);
  assert.ok(added(r).some((l) => l.includes('(fill,) *')), r.patch);
  assert.equal(r.proof.edited.status, 'proven');
});

test('a value can become a name or an expression (toValue), checked like any other change', () => {
  const src = 'def short(help, max_length=45):\n    if max_length < len("..."):\n        return "..."\n    return help\n';
  const M = { file: 's.py', name: 'short', line: 1 };
  const r = write('s.py', src, [{ op: 'addInput', member: M, name: 'placeholder', default: '"..."' }, { op: 'setValue', member: M, step: 'line:3', from: '...', toValue: 'placeholder' }, { op: 'setValue', member: M, step: 'line:2', from: '...', toValue: 'placeholder' }]);
  assert.equal(r.status, 'written', r.reason);
  assert.deepEqual(added(r), ['def short(help, max_length=45, placeholder="..."):', '    if max_length < len(placeholder):', '        return placeholder']);
});

test('steps inside except, catch, and finally can be changed', () => {
  const src = 'def interpose(el, seq):\n    inposed = concat(seq)\n    try:\n        next(inposed)\n    except StopIteration:\n        return iter([])\n    return inposed\n';
  const M = { file: 'a.py', name: 'interpose', line: 1 };
  assert.deepEqual(added(write('a.py', src, { op: 'setGivesBack', member: M, step: 'line:6', value: '[]' })), ['        return []']);
  assert.deepEqual(added(write('a.py', src, { op: 'removeStep', member: M, step: 'line:6' })), ['        pass']);
  assert.deepEqual(added(write('a.py', src, { op: 'addStop', member: M, before: 'line:6', when: 'el is nothing', message: 'el is required' })), ['        if el is None:', '            raise ValueError("el is required")']);
});

test('numbers keep the file’s own way of writing them: hex, octal, groups, decimals', () => {
  const one = (code, from, to) => added(write('a.py', `def f(n):\n    x = ${code} + n\n    return x\n`, { op: 'setValue', member: { file: 'a.py', name: 'f', line: 1 }, step: 'line:2', from, to }))[0]?.trim();
  assert.equal(one('0xFFFFFFFF', 4294967295, 4294967296), 'x = 0x100000000 + n');
  assert.equal(one('0o17', 15, 16), 'x = 0o20 + n');
  assert.equal(one('1_000_000', 1000000, 2500000), 'x = 2_500_000 + n');
  assert.equal(one('2.5', 2.5, 3), 'x = 3.0 + n');
});

test('followLine: lines above and below a change keep their place; a rewritten line is found by its text, or not at all', () => {
  const before = 'a\nb\nc\nd\ne';
  assert.equal(followLine(before, 'a\nb\nX\nY\nc\nd\ne', 4), 6);
  assert.equal(followLine(before, 'a\nb\nX\nY\nc\nd\ne', 1), 1);
  assert.equal(followLine(before, 'a\nB\nc\nd\ne', 2), null);
  assert.equal(followLine(before, 'a\nB\nc\nd\ne', 2, { start: true }), 2);
});

test('lines in an edit list stay the original lines even when the member is named without its file', () => {
  const src = 'def refund(amount, member):\n    if amount > 100:\n        return "review"\n    return "approve"\n';
  const r = write('refund.py', src, [
    { op: 'addStop', member: 'refund', before: 'line:2', when: 'amount is below 0', message: 'Amount cannot be negative' },
    { op: 'setCondition', member: 'refund', step: 'line:2', when: 'amount is at least 75 and not member' },
  ]);
  assert.equal(r.status, 'written', r.reason);
  assert.deepEqual(added(r), ['    if amount < 0:', '        raise ValueError("Amount cannot be negative")', '    if amount >= 75 and not member:']);
});

test('coding agents can change code through Thunder over MCP (intent_write), with the proof, and nothing written to disk', async () => {
  const { createMcpHandler, REMOTE_SAFE_TOOLS } = await import('../src/mcp.mjs');
  assert.ok(REMOTE_SAFE_TOOLS.includes('intent_write'));
  const handle = createMcpHandler();
  const source = 'def refund(amount):\n    if amount > 100:\n        return "review"\n    return "approve"\n';
  const res = handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'intent_write', arguments: { files: [{ path: 'refund.py', source }], edits: { op: 'setCondition', member: 'refund', step: 'line:2', when: 'amount is at least 75' } } } });
  const out = JSON.parse(res.result.content[0].text);
  assert.equal(out.status, 'written');
  assert.match(out.files['refund.py'], /if amount >= 75:/);
  assert.equal(out.proof.edited.status, 'proven');
});

test('a comment between a question and its first step stays, and the question keeps its colon', () => {
  const src = 'def divide(words, width):\n    for word in words:\n        if word > width:\n            # The word does not fit\n            if fold:\n                cut(word)\n    return 1\n';
  const r = write('a.py', src, { op: 'setCondition', member: { file: 'a.py', name: 'divide', line: 1 }, step: 'line:3', compare: '>=' });
  assert.equal(r.status, 'written', r.reason);
  assert.deepEqual(added(r), ['        if word >= width:']);
  assert.deepEqual(removed(r), ['        if word > width:']);
});

test('a step added before a decorated function goes above its decorators', () => {
  const src = 'def group(fit):\n    def decorator(method):\n        @wraps(method)\n        def _replace(*args):\n            return method(*args)\n        return _replace\n    return decorator\n';
  const r = write('b.py', src, { op: 'addStop', member: { file: 'b.py', name: 'decorator', line: 2 }, before: 'line:4', when: 'method is None', message: 'method is required' });
  assert.equal(r.status, 'written', r.reason);
  const lines = r.files['b.py'].split('\n');
  assert.ok(lines.indexOf('        if method is None:') < lines.indexOf('        @wraps(method)'), r.patch);
});
