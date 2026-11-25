// Say less (src/say-less.mjs): a step is put into words only when the reader recognizes its form and the words account
// for its code; anything else is shown as code, "code, not explained". Each case here is a false reading an
// independent audit found on code Thunder had not seen (docs/accuracy.md), now shown as code instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';
import { thunderModel, modelText } from '../src/model.mjs';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

const steps = (src, language) => readCode(src, { language }).items.flatMap((it) => it.steps || []);
const flat = (list) => list.flatMap((s) => [s, ...flat(s.children || []), ...flat(s.otherwise || []), ...(s.handlers || []).flatMap((h) => flat(h.steps))]);

test('every step says whether it is explained; a worded step is explained, an unrecognized one is not, with a reason', () => {
  const r = readCode('function f(order) {\n  if (order.total > 100) {\n    return true;\n  }\n  options || (options = {});\n  return false;\n}\n', { language: 'javascript' });
  const all = flat(r.items[0].steps);
  assert.ok(all.every((s) => typeof s.explained === 'boolean'), 'every step carries explained');
  const q = all.find((s) => s.kind === 'branch');
  assert.equal(q.explained, true);
  assert.equal(q.says, 'If order.total is more than 100');
  const odd = all.find((s) => /options \|\|/.test(s.code));
  assert.equal(odd.explained, false);
  assert.equal(odd.says, '`options || (options = {});`');
  assert.equal(typeof odd.notExplainedWhy, 'string');
  assert.ok(odd.notExplainedWhy.length > 5);
  assert.equal(r.items[0].totalSteps, all.length);
  assert.equal(r.items[0].explainedSteps, all.filter((s) => s.explained).length);
});

test('flow nodes carry explained / notExplainedWhy; members and the model count how sure they are', () => {
  const m = thunderModel([{ path: 'a.js', source: 'function f(order) {\n  if (order.total > 100) {\n    return true;\n  }\n  options || (options = {});\n  return false;\n}\n' }]);
  const mem = m.members[0];
  assert.ok(mem.flow.nodes.every((n) => typeof n.explained === 'boolean'));
  const code = mem.flow.nodes.find((n) => n.kind === 'code');
  assert.equal(code.explained, false);
  assert.ok(code.notExplainedWhy);
  assert.equal(mem.flow.nodes.find((n) => n.kind === 'decision').explained, true);
  assert.equal(mem.totalSteps, 4);
  assert.equal(mem.explainedSteps, 3);
  assert.equal(m.totalSteps, 4);
  assert.equal(m.explainedSteps, 3);
  assert.match(modelText(m, mem.id), /`options \|\| \(options = \{\}\);` \(code, not explained\)/);
});

test('a keyword is never "called": unsafe, using, type aliases', () => {
  const rs = thunderText('a.rs', 'impl E {\n    fn debug(&self, f: &mut Formatter) -> Result {\n        unsafe { ErrorImpl::debug(self.erase(), f) }\n    }\n}\n');
  assert.doesNotMatch(rs, /Calls unsafe/);
  const cs = thunderText('A.cs', 'class S {\n    public string Serialize(object obj) {\n        using var w = new StringWriter();\n        return w.ToString();\n    }\n}\n');
  assert.doesNotMatch(cs, /Calls using/);
  const ts = thunderText('a.ts', 'export const f = (initial: number) => {\n  type S = typeof initial\n  return initial\n}\n');
  assert.doesNotMatch(ts, /Calls type/);
});

test('a negation the code does not have is not said: Promise.reject is not a filter', () => {
  const t = thunderText('a.ts', 'async function rehydrate() {\n  try {\n    return await load()\n  } catch (error) {\n    return Promise.reject(error)\n  }\n}\n');
  assert.doesNotMatch(t, /do not match/);
  assert.match(t, /`return Promise\.reject\(error\)` \(code, not explained\)/);
});

test('two names that read the same are not said as one: X="${__X}" is not "Sets x to x"', () => {
  const t = thunderText('a.sh', '#!/bin/bash\nreset() {\n  KEY_ALGO="${__KEY_ALGO}"\n}\n');
  assert.doesNotMatch(t, /Sets key algo to key algo/);
  assert.match(t, /`KEY_ALGO="\$\{__KEY_ALGO\}"` \(code, not explained\)/);
});

test('a shell here-string is not running a command; grep -v is not "contains"', () => {
  const t = thunderText('a.sh', '#!/bin/bash\nlast_cn() {\n  <<<"${1}" sed -n 1p | head -n1\n}\ncheck() {\n  if grep -qv "^DNS:" <<<"${names}"; then\n    exit 1\n  fi\n}\n');
  assert.doesNotMatch(t, /Runs the command in the first input/);
  assert.doesNotMatch(t, /contains "\^DNS:"\?/);
});

test('an implicit return is only the last thing the function does: Ruby `x unless y` in the middle is not a return', () => {
  const t = thunderText('a.rb', 'class R\n  def gets\n    make_rewindable unless @rewindable_io\n    @rewindable_io.gets\n  end\nend\n');
  assert.doesNotMatch(t, /Gives back make rewindable/);
  assert.doesNotMatch(t, /Gives back `make_rewindable`/);
});

test('nothing follows an ending: a step after an unconditional return is shown as code', () => {
  const r = readCode('function f(a) {\n  return a\n  cleanup()\n}\n', { language: 'javascript' });
  const after = r.items[0].steps[1];
  assert.equal(after.explained, false);
  assert.equal(after.notExplainedWhy, 'block structure uncertain');
});

test('a question with nothing inside it does not make the next step look unconditional (if constexpr)', () => {
  const t = thunderText('a.cpp', 'template <typename T> auto w(T v) -> int {\n  if constexpr (has_view<T>::value)\n    return write_escaped(v);\n  return other(v);\n}\n');
  assert.doesNotMatch(t, /^\s*- Gives back the result of write escaped/m);
});

test('a cast is not dropped: static_cast is not "Sets lower to value"', () => {
  const t = thunderText('a.cpp', 'void m(unsigned value) {\n  const unsigned lower = static_cast<half_uint>(value);\n  use(lower);\n}\n');
  assert.doesNotMatch(t, /Sets lower to value/);
});

test('inputs are names written as parameters: an attribute macro is not an input', () => {
  const r = readCode('static void disconnect_cb(const redisAsyncContext *ac G_GNUC_UNUSED, int status) {\n  if (status != REDIS_OK) {\n    g_error("x");\n  }\n}\n', { language: 'c' });
  assert.ok(!r.items[0].inputs.some((p) => /G_GNUC/.test(p.name)));
});

test('a guard shown as code keeps its sides: its steps run when the condition does not hold', () => {
  const t = thunderText('a.swift', 'struct S {\n    public var result: Int? {\n        guard case let .stream(result) = event else { return nil }\n        return result\n    }\n}\n');
  assert.equal(sideOf(t, /Ask: `case let \.stream\(result\) = event`\?/, /Gives back nil/), 'no');
});

test('C and C++ statements are read into meaning trees: ->, *, &, casts, declarations, template calls', () => {
  const s = flat(steps('int f(struct ctx *c, char *buf) {\n  redisPollEvents *e = (redisPollEvents*)c->data;\n  *buf = 0;\n  if (c->reader->err == NULL) {\n    free_reply(&e->reply);\n  }\n  return 0;\n}\n', 'c'));
  assert.ok(s.every((x) => x.expr && x.expr.kind !== 'code'), 'every C statement has a tree');
  assert.ok(s.every((x) => x.explained), s.filter((x) => !x.explained).map((x) => x.says).join(' | '));
});
