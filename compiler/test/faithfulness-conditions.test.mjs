// Faithfulness, cluster 2: a condition's words keep every negation and every and/or of the code, and the Stop is
// drawn on the side where the code takes it. Each case is a minimal copy of a function a hand review graded
// false (D) in real open-source code; the sample number is in the test name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLogic, accountsFor, codeCounts } from '../src/faithful.mjs';
import { sayCodeCondition } from '../src/steps.mjs';
import { askAsQuestion } from '../src/model.mjs';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

test('the gate: splitting at top-level and/or, counting negations on both sides', () => {
  assert.deepEqual(splitLogic('!a || (b && c) || f(x || y)'), { terms: ['!a', '(b && c)', 'f(x || y)'], ops: ['or', 'or'] });
  assert.deepEqual(splitLogic("s === '||' && t"), { terms: ["s === '||'", 't'], ops: ['and'] });
  assert.equal(splitLogic('a ? b : c'), null, 'a ternary is never split');
  assert.equal(codeCounts('x != null').neg, 0, 'a loose "!= null" reads as "is set": its negation is part of the meaning');
  assert.equal(codeCounts('!isObject(x)').neg, 1);
  assert.equal(accountsFor('!isObject(x)', 'is object'), false, 'a dropped "!" fails the gate');
  assert.equal(accountsFor('!isObject(x)', 'x is not object'), true);
  assert.equal(accountsFor("c is >= 'A'", "c is is at least 'A'"), false, 'garbled words fail the gate');
});

test('a condition the words cannot keep is given back as code, never half-said', () => {
  assert.equal(sayCodeCondition("c is >= 'A' and <= 'Z' or '-'"), "`c is >= 'A' and <= 'Z' or '-'`");
  assert.equal(sayCodeCondition('!isObject(x) || typeof v !== "function"'), 'x is not object or v is not a function');
  // Strict equality keeps null and undefined apart (#300 read both as "Is search empty?").
  assert.equal(sayCodeCondition('search === undefined'), 'search is undefined');
  assert.equal(sayCodeCondition('search === null'), 'search is null');
  // `!==` before `null`/`undefined` is never read as "! is empty" (#281).
  assert.equal(sayCodeCondition('code !== undefined && typeof code !== "string"'), 'code is not undefined and code is not text');
});

test('askAsQuestion asks a compound condition as written, so the Stop never changes side', () => {
  assert.deepEqual(askAsQuestion({ says: 'If not body or response is body used' }), { text: 'Not body or response is body used?', flip: false, holds: { yes: 'not body or response is body used', no: 'it is not true that not body or response is body used' } });
  assert.deepEqual(askAsQuestion({ says: 'If x is not y' }), { text: 'Is x y?', flip: true, holds: { yes: 'x is y', no: 'x is not y' } }, 'a single condition is still asked the positive way, with the flip');
  assert.deepEqual(askAsQuestion({ says: 'If not: a and b' }), { text: 'A and b?', flip: true, holds: { yes: 'a and b', no: 'it is not true that a and b' } }, '`unless a && b`: the steps are on the No side');
  assert.deepEqual(askAsQuestion({ says: 'If `a ? b : c`' }), { text: '`a ? b : c`?', flip: false, code: true });
});

test('#54 jsonp: `typeof callback === "string" && callback.length !== 0` runs its steps on Yes', () => {
  const t = thunderText('a.js', "function jsonp(obj) {\n  var callback = obj.cb;\n  if (typeof callback === 'string' && callback.length !== 0) {\n    this.set('Content-Type', 'text/javascript');\n  }\n  return this.send(body);\n}\n");
  assert.match(t, /Ask: Callback is text and the length of callback is not 0\?/);
  assert.equal(sideOf(t, /Ask: Callback is text/, /Content-Type/), 'yes');
});

test('#85 consumeNonExecutePrefix: the comparison and the ! are both kept; a call inside a bigger condition is not asked by its name', () => {
  const t = thunderText('A.java', "class A {\n  private void consume() {\n    if (pos + 5 > limit && !fillBuffer(5)) {\n      return;\n    }\n    if (buf[p] != ')'\n        || buf[p + 1] != ']') {\n      return;\n    }\n    pos += 5;\n  }\n  private boolean fillBuffer(int n) { return true; }\n}\n");
  assert.match(t, /Ask: Pos \+ 5 is more than limit and not fill buffer\(5\)\?/);
  assert.doesNotMatch(t, /Ask: Fill buffer\?/);
  assert.match(t, /Ask: Buf\[p\] is not '\)' or buf\[p \+ 1\] is not '\]'\?/, 'a quoted ")" does not end the condition');
  assert.equal(sideOf(t, /Ask: Buf\[p\]/, /Stops here/), 'yes');
});

test('#91 selectChallenge: `!== "digest" || invalid` skips on Yes', () => {
  const t = thunderText('a.php', "<?php\nclass D {\n  public static function select($response) {\n    foreach ($response->getHeader('WWW-Authenticate') as $header) {\n      if ($challenge['scheme'] !== 'digest' || $challenge['invalid']) {\n        continue;\n      }\n      $digest = self::createChallenge($challenge);\n    }\n    return $selected;\n  }\n}\n");
  assert.match(t, /Ask: Challenge\['scheme'\] is not 'digest' or challenge\['invalid'\]\?/);
  assert.equal(sideOf(t, /Ask: Challenge/, /Skips to the next one/), 'yes');
});

test('#106 execute: `!active && delays && queue empty` sleeps on Yes', () => {
  const t = thunderText('a.php', "<?php\nclass M {\n  public function execute(): void {\n    while (!$this->closed) {\n      if (!$this->active && $this->delays && $queue->isEmpty()) {\n        Clock::sleep($this->timeToNext());\n      }\n      $this->tick();\n    }\n  }\n}\n");
  assert.match(t, /Ask: This is not active and this has delays and queue is empty\?/);
  assert.equal(sideOf(t, /Ask: This is not active/, /Calls sleep/), 'yes');
});

test('#124 shouldComponentUpdate: every `!==` and `||` term kept; true on Yes', () => {
  const t = thunderText('a.ts', "class E {\n  shouldComponentUpdate(props) {\n    if (\n      getIn(this.props.formik.errors, this.props.name) !==\n        getIn(props.formik.errors, this.props.name) ||\n      Object.keys(this.props).length !== Object.keys(props).length\n    ) {\n      return true;\n    } else {\n      return false;\n    }\n  }\n}\n");
  assert.match(t, /is not get in\(.*\) or Object\.keys\(the props\)\.length is not Object\.keys\(props\)\.length\?/);
  assert.equal(sideOf(t, /Ask: Get in/, /Gives back true/), 'yes');
  assert.equal(sideOf(t, /Ask: Get in/, /Gives back false/), 'no');
});

test('#133 getIn: `p !== path.length && !obj` gives back def on Yes', () => {
  const t = thunderText('a.ts', "export function getIn(obj: any, key: string, def?: any, p: number = 0) {\n  const path = toPath(key);\n  if (p !== path.length && !obj) {\n    return def;\n  }\n  return obj === undefined ? def : obj;\n}\n");
  assert.match(t, /Ask: P is not the length of path and not obj\?/);
  assert.equal(sideOf(t, /Ask: P is not/, /Gives back def  /), 'yes');
  assert.match(t, /Gives back def if obj is undefined, otherwise obj/);
});

test('#163 compareByAssembly: each `==` / `!=` stays on its own name', () => {
  const t = thunderText('A.cs', 'class O {\n    private int? CompareByAssembly(ObjectDetails x, ObjectDetails y)\n    {\n        if (x.AssemblyName == AssemblyName && y.AssemblyName != AssemblyName)\n        {\n            return -1;\n        }\n        if (x.AssemblyName != AssemblyName && y.AssemblyName != AssemblyName)\n        {\n            return 0;\n        }\n        return null;\n    }\n}\n');
  assert.match(t, /Ask: The x's assembly name is AssemblyName and the y's assembly name is not AssemblyName\?/);
  assert.match(t, /Ask: The x's assembly name is not AssemblyName and the y's assembly name is not AssemblyName\?/);
  assert.equal(sideOf(t, /Ask: The x's assembly name is AssemblyName/, /Gives back -1/), 'yes');
});

test('#202 rebuild_method: `method != "HEAD"` is kept and the change is on Yes; response is an input', () => {
  const t = thunderText('a.py', 'class S:\n    def rebuild_method(self, prepared_request, response):\n        method = prepared_request.method\n        if response.status_code == codes.see_other and method != "HEAD":\n            method = "GET"\n        prepared_request.method = method\n');
  assert.match(t, /You give it: prepared request, response/);
  assert.match(t, /and method is not "HEAD"\?/);
  assert.equal(sideOf(t, /Ask: The response's status code/, /Sets method to "GET"/), 'yes');
});

test('#207 guess_filename: four terms, two `!=`, basename on Yes', () => {
  const t = thunderText('a.py', 'def guess_filename(obj):\n    name = getattr(obj, "name", None)\n    if name and isinstance(name, (str, bytes)) and name[0] != "<" and name[-1] != ">":\n        return os.path.basename(name)\n');
  assert.match(t, /Ask: Name is set and name is one of str, bytes and name\[0\] is not "<" and name\[-1\] is not ">"\?/);
  assert.equal(sideOf(t, /Ask: Name is set/, /basename/), 'yes');
});

test('#209 parse header: `(idx := find("=")) != -1` keeps its "not"; the slice is not read as a key', () => {
  const t = thunderText('a.py', 'def parse(params):\n    for param in params:\n        if param and (idx := param.find("=")) != -1:\n            key = param[:idx]\n    return key\n');
  assert.match(t, /Ask: Param is set and \(idx := param\.find\("="\)\) is not -1\?/);
  assert.equal(sideOf(t, /Ask: Param is set/, /key = param\[:idx\]/), 'yes');
  assert.doesNotMatch(t, /"idx" value/);
});

test('#247 handle_exception!: `raise boom if a && b != :after_handler` raises on Yes; `not_found?` is not flipped into "found"', () => {
  const t = thunderText('a.rb', "class Base\n  def handle_exception!(boom)\n    if server_error?\n      raise boom if settings.show_exceptions? && (settings.show_exceptions != :after_handler)\n    elsif not_found?\n      headers['X-Cascade'] = 'pass' if settings.x_cascade?\n    end\n  end\nend\n");
  assert.equal(sideOf(t, /Ask: Settings is show exceptions/, /Stop: the error made by boom/), 'yes');
  assert.match(t, /Ask: Is it not-found\?/);
  assert.equal(sideOf(t, /Ask: Is it not-found\?/, /Ask: Is settings x cascade/), 'yes');
});

test('#273 isJsonContentType: three `!==` kept; false on Yes', () => {
  const t = thunderText('a.ts', "const isJson = (separator: string): boolean => {\n\tif (separator !== '.' && separator !== '+' && separator !== '-') {\n\t\treturn false;\n\t}\n\treturn true;\n};\n");
  assert.match(t, /Ask: Separator is not "\." and separator is not "\+" and separator is not "-"\?/);
  assert.equal(sideOf(t, /Ask: Separator is not/, /Answer: No/), 'yes');
});

test('#277 validateJsonWithSchema: `!isObject(s) || typeof s.validate !== "function"` throws on Yes', () => {
  const t = thunderText('a.ts', "const validate = async (schema: any): Promise<unknown> => {\n\tif (\n\t\t!isObject(schema)\n\t\t|| typeof schema.validate !== 'function'\n\t) {\n\t\tthrow new TypeError(invalidSchemaMessage);\n\t}\n\treturn schema.value;\n};\n");
  assert.match(t, /Ask: Schema is not object or the schema's validate is not a function\?/);
  assert.equal(sideOf(t, /Ask: Schema is not object/, /Stop: TypeError/), 'yes');
});

test('#281 ForceRetry: `code !== undefined && typeof code !== "string"` throws on Yes, with its whole message', () => {
  const t = thunderText('a.ts', "class E {\n\tconstructor(options?: Options) {\n\t\tif (options?.code !== undefined && typeof options.code !== 'string') {\n\t\t\tthrow new TypeError('The `ky.retry()` `code` option must be a string');\n\t\t}\n\t}\n}\n");
  assert.match(t, /Ask: The options's code is not undefined and the options's code is not text\?/);
  assert.equal(sideOf(t, /Ask: The options's code/, /Stop: TypeError/), 'yes');
  assert.match(t, /"The `ky\.retry\(\)` `code` option must be a string"/, 'the message is not cut at its inner backtick');
});

test('#285 cancelBody: `body && body !== keep.body` cancels on Yes; value and keep are inputs', () => {
  const t = thunderText('a.ts', 'export const cancelBody = (value: Request | Response | undefined, keep?: Request | Response): void => {\n\tconst body = value?.body;\n\tif (body && body !== keep?.body) {\n\t\tvoid body.cancel().catch(() => undefined);\n\t}\n};\n');
  assert.match(t, /You give it: value, keep/);
  assert.match(t, /Ask: Body and body is not the keep's body\?/);
  assert.equal(sideOf(t, /Ask: Body and/, /Calls catch/), 'yes');
});

test('#289 wrappableBody: `!body || …` gives back undefined on Yes', () => {
  const t = thunderText('a.ts', 'const wrappableBody = (response: Response): ReadableStream | undefined => {\n\tconst {body} = response;\n\tif (!body || response.bodyUsed || body.locked) {\n\t\treturn undefined;\n\t}\n\treturn body;\n};\n');
  assert.match(t, /Ask: Not body or the response's body used or the body's locked\?/);
  assert.equal(sideOf(t, /Ask: Not body/, /Gives back undefined/), 'yes');
});

test('#291 streamRequest: a fetch Request is the input, and its body is not "a field it was sent"', () => {
  const t = thunderText('a.ts', "export const streamRequest = (request: Request, onUploadProgress: any) => {\n\tif (!request.body || request.body.locked) {\n\t\treturn request;\n\t}\n\treturn new Request(request, {duplex: 'half'});\n};\n");
  assert.match(t, /You give it: request, on upload progress/);
  assert.doesNotMatch(t, /sent in the request|it was sent/);
  assert.equal(sideOf(t, /Ask: The request's body is not set or/, /Gives back request/), 'yes');
});

test('#299 appendSearchParameters: `!isArray(pair) || pair.length !== 2` throws on Yes', () => {
  const t = thunderText('a.ts', "const append = (input: any) => {\n\tfor (const pair of input) {\n\t\tif (!Array.isArray(pair) || pair.length !== 2) {\n\t\t\tthrow new TypeError('Array search parameters must be provided in [[key, value], ...] format');\n\t\t}\n\t}\n};\n");
  assert.match(t, /Ask: Not Array\.is array\(pair\) or the length of pair is not 2\?/);
  assert.equal(sideOf(t, /Ask: Not Array/, /Stop: TypeError/), 'yes');
});

test('#300 hasSearchParameters: undefined and null are told apart; a comparison is not "the result of trim"', () => {
  const t = thunderText('a.ts', "export const has = (search: any): boolean => {\n\tif (search === undefined) {\n\t\treturn false;\n\t}\n\tif (search === null) {\n\t\tthrow new TypeError('The `searchParams` option must not be `null`.');\n\t}\n\tif (typeof search === 'string') {\n\t\treturn search.trim().length > 0;\n\t}\n\treturn Boolean(search);\n};\n");
  assert.match(t, /Ask: Is search undefined\?/);
  assert.match(t, /Ask: Is search null\?/);
  assert.match(t, /Gives back whether search\.trim\(\)\.length is more than 0/);
  assert.doesNotMatch(t, /the result of trim/);
});

test('#35 Express error handler: a call to console.error is not this file\'s `error` rule; a bare status is not a Stop', () => {
  const t = thunderText('a.js', "function error(err, req, res, next) {\n  if (!test) console.error(err.stack);\n  res.status(500);\n  res.send('Internal Server Error');\n}\n");
  assert.doesNotMatch(t, /Ask: Error\?/);
  assert.match(t, /Ask: Is test set\?/);
  assert.equal(sideOf(t, /Ask: Is test set/, /Writes a log/), 'no');
  assert.match(t, /Sets the response status to 500 Internal Server Error/);
  assert.doesNotMatch(t, /Stop: 500/);
});

test('#146 visitCard: a brace-less multi-line `if (…)\\n  return;` stops on Yes, not unconditionally', () => {
  const t = thunderText('a.js', "function visitCard(node) {\n  if (\n    !node.children ||\n    !node.properties\n  )\n    return;\n  const anchor = node.children.find(n => n.tagName === 'a');\n  if (!anchor || !anchor.children) return;\n  anchor.children = [];\n}\n");
  assert.match(t, /Ask: Not the node's children or not the node's properties\?/);
  assert.equal(sideOf(t, /Ask: Not the node's children/, /Stops here/), 'yes');
  assert.equal(sideOf(t, /Ask: Not anchor/, /Stops here/), 'yes');
  assert.doesNotMatch(t, /Yes: continue\n\s+No: continue/);
});
