// Faithfulness: readings still graded false after the first round of fresh-audit fixes (the regrade of the same
// samples), and false readings found in the new repositories graded afterwards. The sample is in the test name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText } from './faithfulness-helpers.mjs';

test('httparty#2 (Ruby): a last line `multipart << x` gives back the text, not a yes/no', () => {
  const t = thunderText('a.rb', 'class M\n  def generate\n    multipart = +""\n    multipart << "--end"\n  end\nend\n');
  assert.doesNotMatch(t, /whether/);
});

test('serde_json#4 (Rust): a last expression over several lines is shown whole, never cut to its first line', () => {
  const t = thunderText('a.rs', 'impl S {\n    fn serialize_i32(self, value: i32) -> Result<()> {\n        self.formatter\n            .write_i32(&mut self.writer, value)\n            .map_err(Error::io)\n    }\n}\n');
  assert.match(t, /map_err/);
  assert.doesNotMatch(t, /Gives back `self\.formatter`/);
});

test('cJSON#14 (C): `strncmp(a, "yes", 3) == 0` checks only a prefix; it is never said as "a is "yes""', () => {
  const t = thunderText('a.c', 'int main(int argc, char **argv) {\n  if ((argc == 3) && (strncmp(argv[2], "yes", 3) == 0)) {\n    go();\n  }\n  return 0;\n}\n');
  assert.doesNotMatch(t, /argv\[2\] is "yes"/);
});

test('anyhow (Rust): `unsafe { f(x) }` is f(x); nothing calls "unsafe"; `&\'a self` is not an input', () => {
  const t = thunderText('a.rs', 'impl E {\n    fn fmt(&self, formatter: &mut Formatter) -> fmt::Result {\n        unsafe { ErrorImpl::debug(self.inner.by_ref(), formatter) }\n    }\n    fn provide<\'a>(&\'a self, request: &mut Request<\'a>) {\n        unsafe { ErrorImpl::provide(self.inner.by_ref(), request) }\n    }\n}\n');
  assert.doesNotMatch(t, /Calls unsafe|'a self/);
  assert.match(t, /Gives back the result of debug/);
});

test('RestSharp (C#): `using var` and a brace-less `foreach` are not calls to "using" / "foreach"', () => {
  const t = thunderText('a.cs', 'class C {\n    string Serialize(object obj) {\n        using var w = new StringWriter();\n        foreach (var h in headers) client.Add(h);\n        return w.ToString();\n    }\n}\n');
  assert.doesNotMatch(t, /Calls using|Calls foreach/);
});

test('cobra (Go): `make([]string, len(m))` has len(m) items; a range over cmd.ValidArgs names cmd', () => {
  const t = thunderText('a.go', 'package x\n\nfunc sortedKeys(m map[string]int) []string {\n\tkeys := make([]string, len(m))\n\tfor _, v := range cmd.ValidArgs {\n\t\tuse(v)\n\t}\n\treturn keys\n}\n');
  assert.doesNotMatch(t, /empty list/);
  assert.match(t, /For each item in the cmd's valid args/);
});

test('sinatra (Ruby): `super` as the last line is not "the parent version first"', () => {
  const t = thunderText('a.rb', 'class B\n  def inline_templates=(file)\n    watch(file)\n    super\n  end\nend\n');
  assert.doesNotMatch(t, /parent version first/);
});

test('spdlog (C++): a `static_cast` that narrows is not dropped from the value', () => {
  const t = thunderText('a.cc', 'void bigint::multiply(UInt value) {\n  const half_uint lower = static_cast<half_uint>(value);\n  use(lower);\n}\n');
  assert.doesNotMatch(t, /Sets lower to value/);
});

test('neofetch (shell): shell quotes in a pattern are not text; a pattern is kept as written', () => {
  const t = thunderText('a.sh', '#!/bin/bash\nf() {\n  uptime=${uptime%\', \'}\n  [[ $xrdb != *internalBorder:* ]] && return\n}\n');
  assert.match(t, /without ", " at the end/);
  assert.match(t, /`\*internalBorder:\*`/);
});
