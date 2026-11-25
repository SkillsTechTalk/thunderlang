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

test('psf/requests 6f205ff → 6f66281 _encode_files: a review keeps quoted text in a compound condition exactly (never "hasattr(fp, 0)")', async () => {
  const { askAsQuestion } = await import('../src/model.mjs');
  const q = askAsQuestion({ says: 'If fp is a _SupportsRead or hasattr(fp, "read")', code: 'elif isinstance(fp, _SupportsRead) or hasattr(fp, "read"):' });
  assert.equal(q.holds.yes, 'fp is a _SupportsRead or hasattr(fp, "read")');
  assert.equal(q.holds.no, 'it is not true that fp is a _SupportsRead or hasattr(fp, "read")');
  const { thunderReview, renderReview } = await import('../src/review.mjs');
  const before = 'def encode(files):\n    for k, fp in files:\n        if isinstance(fp, (str, bytes)):\n            fdata = fp\n        elif isinstance(fp, _SupportsRead) or hasattr(fp, "read"):\n            fdata = fp.read()\n        elif fp is None:\n            continue\n        else:\n            fdata = fp\n        send(fdata)\n';
  const after = before.replace('isinstance(fp, _SupportsRead) or hasattr(fp, "read")', '_t.has_read(fp)');
  const md = renderReview(thunderReview([{ path: 'm.py', source: before }], [{ path: 'm.py', source: after }]));
  assert.doesNotMatch(md, /hasattr\(fp, \d\)|\u0001/);
  assert.match(md, /hasattr\(fp, "read"\)/);
});

// Real readings hand-checked in a gallery (main e432fac / 1.0.4): each is now said exactly or shown as code.
test('requests should_strip_auth / ripgrep search: a boolean `or` / `||` is not "or y when that has no value"', () => {
  const py = thunderText('a.py', 'def should_strip_auth(changed_port, changed_scheme):\n    return changed_port or changed_scheme\n');
  assert.doesNotMatch(py, /when that has no value/);
  const rs = thunderText('a.rs', 'fn search(matched: bool, s: &S) -> bool {\n    let matched = matched || s.has_match();\n    matched\n}\n');
  assert.doesNotMatch(rs, /when that has no value/);
});

test('ky _calculateRetryDelay: a multiplication is never dropped from the words', () => {
  const t = thunderText('a.ts', "class Ky {\n  _calculateRetryDelay(error) {\n    const retryAfter = error.response.headers.get('Retry-After');\n    if (retryAfter) {\n      let after = Number(retryAfter) * 1000;\n      return after;\n    }\n    return 0.3 * (2 ** (this._retryCount - 1)) * 1000;\n  }\n}\n");
  for (const line of t.split('\n').filter((l) => /1000|retry after/.test(l) && !/code, not explained/.test(l))) assert.match(line, /1000|times/, line);
  assert.doesNotMatch(t, /Sets after to the result of number\s/);
});

test('vercel/ms parse, date-fns: NaN is a value, never "na n"', () => {
  const t = thunderText('a.ts', 'export function parse(str: string): number {\n  if (str.length > 100) {\n    return NaN;\n  }\n  return 1;\n}\n');
  assert.doesNotMatch(t, /na n/i);
});

test('ripgrep special: Rust `use …` inside a function is not "Calls use"', () => {
  const t = thunderText('a.rs', 'fn special(mode: u8) -> u8 {\n    use crate::flags::SpecialMode;\n    mode\n}\n');
  assert.doesNotMatch(t, /Calls use/);
});

test('requests Session.send: `kwargs.setdefault("stream", x)` sets it only if missing, so it is never "Sets stream on kwargs"', () => {
  const t = thunderText('a.py', 'def send(self, request, **kwargs):\n    kwargs.setdefault("stream", self.stream)\n    return adapter.send(request, **kwargs)\n');
  assert.doesNotMatch(t, /Sets "?stream"? on kwargs/);
});

test('net/http cleanPath: a length in an index is kept or shown as code (no garbled "how many p")', () => {
  const t = thunderText('a.go', 'package http\n\nfunc cleanPath(p string) string {\n\tif p == "" {\n\t\treturn "/"\n\t}\n\tnp := path.Clean(p)\n\tif p[len(p)-1] == \'/\' && np != "/" {\n\t\tif len(p) == len(np)+1 && strings.HasPrefix(p, np) {\n\t\t\tnp = p\n\t\t} else {\n\t\t\tnp += "/"\n\t\t}\n\t}\n\treturn np\n}\n');
  for (const line of t.split('\n').filter((l) => /how many p\b/.test(l))) assert.match(line, /how many p - 1|how many p minus 1|how many np|code, not explained/, line);
});

test('commons-lang BooleanUtils.toBooleanObject: Java `str == "true"` compares references, so it is never "Is str true?"', () => {
  const t = thunderText('B.java', 'class BooleanUtils {\n    public static Boolean toBooleanObject(final String str) {\n        if (str == "true") {\n            return Boolean.TRUE;\n        }\n        return null;\n    }\n}\n');
  assert.doesNotMatch(t, /Is str true\?/);
});

test('OpenThunder: `x.length` reads one way everywhere ("the length of password"), never "how many password"', () => {
  const t = thunderText('a.js', 'async function signup(request, reply) {\n  const { password } = request.body;\n  if (password.length < 6) { reply.status(400); return { error: "short" }; }\n  return { ok: true };\n}\n');
  assert.match(t, /Is the length of password less than 6\?/);
  assert.doesNotMatch(t, /how many password|password\.length is/);
  const py = thunderText('a.py', 'def check(password):\n    if len(password) < 6:\n        return False\n    return True\n');
  assert.match(py, /the length of password/);
});

test('a condition written over several lines is shown whole, never its first line alone (semver identifier)', () => {
  const t = thunderText('a.rs', 'fn identifier(pos: Position, segment_len: usize, nondigit: bool) -> Result<(), Error> {\n    if pos == Position::Pre\n        && segment_len > 1\n        && !nondigit\n    {\n        return Err(Error::LeadingZero);\n    }\n    Ok(())\n}\n');
  assert.doesNotMatch(t, /Ask: `pos == Position::Pre`\?/);
});

test('a C `static` local is set once (lz4), Python yield is not "hands control to the given block" (jinja)', () => {
  const c = thunderText('a.c', 'int freq(void) {\n    static int init = 0;\n    if (!init) { init = 1; query(); }\n    return init;\n}\n');
  assert.doesNotMatch(c, /Sets init to 0/);
  const py = thunderText('a.py', 'async def empty():\n    for _ in ():\n        yield\n');
  assert.doesNotMatch(py, /given block/);
});
