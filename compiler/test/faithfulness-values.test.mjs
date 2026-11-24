// Faithfulness, clusters 9, 10, 11 and 13: values keep everything they are made of. A keyed assignment keeps its
// key, a compound value is never cut to its first clause, `next(…)` is middleware only when it is the middleware's
// own `next`, and a multi-line value is read whole (or shown as code). Each case is a minimal copy of a function
// graded false (D) in a hand review; the sample number is in the test name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStatement } from '../src/steps.mjs';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

test('#55 / #115 / #131 / #210 / #296: a value stored under a key keeps the key, never "Sets <container> to …"', () => {
  const js = thunderText('a.js', "function download(opts) {\n  var headers = {};\n  var keys = Object.keys(opts.headers)\n  for (var i = 0; i < keys.length; i++) {\n    var key = keys[i]\n    if (key.toLowerCase() !== 'content-disposition') {\n      headers[key] = opts.headers[key]\n    }\n  }\n  opts = Object.create(opts)\n  return headers\n}\n");
  assert.match(js, /Stores the key entry in the opts's headers under key in headers/);
  assert.doesNotMatch(js, /Sets headers to the key entry/);
  assert.doesNotMatch(js, /Saves a new object/, 'Object.create makes an object; it saves nothing');
  const php = thunderText('a.php', "<?php\nclass S {\n    private function apply(array &$context, $value): void\n    {\n        $context['ssl']['local_pk'] = $value;\n    }\n}\n");
  assert.match(php, /Stores value at "ssl", then "local_pk" in context/);
  const ts = thunderText('a.ts', "export function prepare(values: any): any {\n  let data: any = {};\n  for (let k in values) {\n    const key = String(k);\n    data[key] = values[key] !== '' ? values[key] : undefined;\n  }\n  return data;\n}\n");
  assert.match(ts, /Stores under key in data: the key entry in values if values\[key\] is not empty, otherwise undefined/);
  const py = thunderText('a.py', 'def unquote(uri):\n    parts = uri.split("%")\n    for i in range(1, len(parts)):\n        parts[i] = f"%{parts[i]}"\n    return "".join(parts)\n');
  assert.match(py, /Stores text built from its parts under i in parts/);
  assert.doesNotMatch(py, /Sets parts to text/);
  const ts2 = thunderText('b.ts', "const toHeaderObject = (source: any): Record<string, string | undefined> => {\n\tconst result: Record<string, string | undefined> = {};\n\tfor (const [key, value] of source.entries()) {\n\t\tresult[key] = isHeadersInstance && value === 'undefined' ? undefined : value;\n\t}\n\treturn result;\n};\n");
  assert.match(ts2, /Stores under key in result: undefined if is headers instance is set and value is 'undefined', otherwise value/);
});

test('#246 Ruby `options[:outvar] ||= x unless y`: the key and the "if nothing is there yet" are kept', () => {
  const t = thunderText('a.rb', "class Base\n  def render(options, exclude_outvar)\n    options[:outvar] ||= '@_out_buf' unless exclude_outvar\n    options[:default_encoding] ||= settings.default_encoding\n    output\n  end\nend\n");
  assert.equal(sideOf(t, /Ask: Is exclude outvar set\?/, /Stores "@_out_buf" under "outvar" in options, if nothing is there yet/), 'no');
  assert.match(t, /Stores the settings's default encoding under "default_encoding" in options, if nothing is there yet/);
  assert.doesNotMatch(t, /Sets options to/);
});

test('operators that are not "=" are said as what they do', () => {
  assert.equal(classifyStatement('total *= list.Count;').says, 'Multiplies total by how many list');
  assert.equal(classifyStatement('resolved ??= copy').says, 'Sets resolved to copy, if it has no value yet');
  assert.equal(classifyStatement('values[] = value;').says, 'Adds value to the end of values');
  assert.equal(classifyStatement('contents .= chunk;').says, 'Adds chunk to the end of contents');
  assert.equal(classifyStatement('result = append(result, comp)').says, 'Adds comp to the end of result');
});

test('#126 / #129 a multi-line ternary is read whole, or shown as code; never cut to its first line', () => {
  const t = thunderText('a.ts', 'export function useField(propsOrFieldName: any) {\n  const isAnObject = isObject(propsOrFieldName);\n  const props: FieldHookConfig = isAnObject\n    ? propsOrFieldName\n    : { name: propsOrFieldName };\n  return [getFieldProps(props), fieldHelpers];\n}\n');
  assert.doesNotMatch(t, /Sets props to is an object/);
  assert.match(t, /`return \[getFieldProps\(props\), fieldHelpers\];` \(code, not explained\)/, 'raw code is always tagged as code');
  const r = thunderText('b.ts', 'class F {\n  render() {\n    return component\n      ? React.createElement(component, props)\n      : render\n      ? render(props)\n      : null;\n  }\n}\n');
  assert.doesNotMatch(r, /Gives back component/);
  assert.match(r, /`return component \? React\.createElement\(component, props\) : render \? render\(props\) : null;` \(code, not explained\)/);
});

test('#165 / #178 a returned `a && b` / `a || !b` keeps every part; a C# local function is a helper', () => {
  const t = thunderText('A.cs', "class L {\n    internal static bool IsWellFormed(string licenseKey)\n    {\n        var segments = licenseKey.Split('.');\n        return segments.Length == 3\n            && segments[2].Length == SignatureLength;\n\n        static bool IsBase64UrlChar(char c) =>\n            c is >= 'A' and <= 'Z' or '-' or '_';\n    }\n}\n");
  assert.match(t, /Gives back whether how many segments is 3 and segments\[2\]\.Length is SignatureLength/);
  assert.doesNotMatch(t, /Calls static/);
  assert.match(t, /Defines a helper, is base64 url char/);
  assert.match(t, /`return c is >= 'A' and <= 'Z' or '-' or '_';` \(code, not explained\)/, 'a C# pattern the words cannot keep is code');
  const s = thunderText('B.cs', 'class S {\n    private static bool RequiresExplicitClosing(Type a, Type b)\n    {\n        var interfaces = Get(a, b);\n        if (interfaces.Length == 0) return false;\n        return interfaces.Length > 1\n            || !interfaces[0].GetGenericArguments().SequenceEqual(a.GetGenericArguments());\n    }\n}\n');
  assert.match(s, /Gives back whether how many interfaces is more than 1 or not interfaces\[0\]/);
});

test('#78 a ternary whose side cannot be said is not half-said; a simple one is', () => {
  const t = thunderText('A.java', 'class S {\n    public TypeAdapter create(Gson gson, TypeToken type) {\n      boolean matches =\n          exactType != null\n              ? exactType.equals(type) || (matchRawType && exactType.getType() == type.getRawType())\n              : hierarchyType.isAssignableFrom(type.getRawType());\n      return matches\n          ? new TreeTypeAdapter<>(serializer, deserializer, gson, type, this)\n          : null;\n    }\n}\n');
  assert.doesNotMatch(t, /the result of equals if/);
  assert.match(t, /`boolean matches = exactType != null \?/);
  assert.match(t, /Gives back a new TreeTypeAdapter if matches is set, otherwise null/);
  assert.doesNotMatch(t, /Gives back matches\b/);
});

test('#314 Go `return output, err` gives both back; `return nil, err` is the error return', () => {
  const t = thunderText('a.go', 'package cobra\n\nfunc executeCommand(root *Command, args ...string) (output string, err error) {\n\t_, output, err = executeCommandC(root, args...)\n\treturn output, err\n}\n\nfunc load(p string) (*Config, error) {\n\tc, err := read(p)\n\tif err != nil {\n\t\treturn nil, err\n\t}\n\treturn c, nil\n}\n');
  assert.match(t, /Gives back output and err/);
  assert.equal(sideOf(t, /Ask: Is err set\?/, /Returns an error to the caller/), 'yes');
  assert.equal((t.match(/Returns an error to the caller/g) || []).length, 1);
});

test('#121 / #175 `next(…)` is middleware only when it is the middleware\'s own `next`', () => {
  const local = thunderText('a.js', 'const Wizard = ({ children, onSubmit }) => {\n  const next = values => {\n    setSnapshot(values);\n  };\n  const handleSubmit = async (values, bag) => {\n    if (isLastStep) {\n      return onSubmit(values, bag);\n    } else {\n      next(values);\n    }\n  };\n  return null;\n};\n');
  assert.doesNotMatch(local, /passes it on|Lets the request go on/);
  const pipeline = thunderText('A.cs', 'class B {\n    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)\n    {\n        foreach (var processor in _preProcessors)\n        {\n            await processor.Process(request, cancellationToken).ConfigureAwait(false);\n        }\n        return await next(cancellationToken).ConfigureAwait(false);\n    }\n}\n');
  assert.doesNotMatch(pipeline, /Stop: the error/);
  assert.match(pipeline, /Gives back the answer of the next handler in the pipeline/);
  const express = thunderText('b.js', "function auth(req, res, next) {\n  if (!req.user) return next(new Error('no user'));\n  next();\n}\n");
  assert.equal(sideOf(express, /Ask: Is the req's user set\?/, /Stop: Error: passes it on/), 'no');
  assert.match(express, /Lets the request go on to the next step/);
});

test('#70 `list.add(index, element)` does not say the index is what is added', () => {
  const t = thunderText('A.java', 'class W<E> {\n  public void add(int index, E element) {\n    delegate.add(index, nonNull(element));\n  }\n}\n');
  assert.doesNotMatch(t, /Adds index to delegate/);
  assert.match(t, /Adds to delegate/);
});

test('#92 PHP `$a.$b` joins text; it is not "the a\'s b"', () => {
  const t = thunderText('a.php', "<?php\nclass A {\n    private function sendBasic($request, string $username, string $password)\n    {\n        if (\\preg_match('/[\\x00-\\x1F\\x7F]/', $username.$password) !== 0) {\n            throw new InvalidArgumentException('Bad');\n        }\n        $auth = 'Basic '.\\base64_encode($username.':'.$password);\n        return $auth;\n    }\n}\n");
  assert.doesNotMatch(t, /the username's password/);
  assert.match(t, /Sets auth to text built from its parts/);
});

test('#198 Python: a bare `self.content` only reads it; a dict comprehension is a lookup, not "attr"', () => {
  const t = thunderText('a.py', 'class R:\n    def __getstate__(self):\n        if not self._content_consumed:\n            self.content\n        return {attr: getattr(self, attr, None) for attr in self.__attrs__}\n');
  assert.doesNotMatch(t, /Gives back content|Gives back attr\b/);
  assert.equal(sideOf(t, /Ask: Is self content consumed\?/, /Reads content/), 'no');
  assert.match(t, /Gives back a lookup by attr built from attrs/);
});

test('#248 / #249 Ruby `return x unless y` and `warn … unless y` put the step on the No side', () => {
  const t = thunderText('a.rb', "class Base\n  def mime_type(type, value = nil)\n    return type.to_s if type.to_s.include?('/')\n    return Rack::Mime.mime_type(type, nil) unless value\n    Rack::Mime::MIME_TYPES[type] = value\n  end\n  def quit!\n    return unless running?\n    warn '== Sinatra has ended his set (crowd applauds)' unless suppress_messages?\n    set :running_server, nil\n  end\nend\n");
  assert.equal(sideOf(t, /Ask: Is value set\?/, /Gives back the result of mime type/), 'no');
  assert.match(t, /Gives back type as text/);
  assert.equal(sideOf(t, /Ask: Is it suppress messages\?/, /Calls warn/), 'no');
  assert.doesNotMatch(t, /Ask: Set\?|Ask: Mime type\?/);
});

test('#242 Ruby: the last value of a yes/no method is its answer, with every part', () => {
  const t = thunderText('a.rb', 'class Entry\n  def accepts?(entry)\n    File.fnmatch(entry, self) && matches_params?(entry.params)\n  end\nend\n');
  assert.doesNotMatch(t, /Calls fnmatch/);
  assert.match(t, /Gives back whether File\.fnmatch\(entry, self\) and matches_params\?\(entry\.params\)/);
});
