// Faithfulness, clusters 3, 5, 8 and 12: no construct is hidden or moved. Loops keep their bodies (or are shown as
// code), a loop's `continue` / `break` is a step, a brace-less `if` keeps its one statement, a switch is one
// question with one side per case, and a rule is drawn only when it covers the whole body. Each case is a minimal
// copy of a function graded false (D) in a hand review; the sample number is in the test name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

test('#94 PHP createUri: a `#` inside a string is not a comment, so the body, the return and the final throw are kept', () => {
  const t = thunderText('a.php', "<?php\nclass C {\n    private static function createUri($uri, $uriFactory)\n    {\n        if (\\is_string($uri)) {\n            if (\\preg_match('%\\A[^:/?#]++:[0-9]{1,5}+(?:/|\\z)%', $uri) === 1) {\n                \\trigger_deprecation('guzzlehttp/guzzle', '8.6', 'Deprecated.');\n            }\n            return Idn::createUri($uriFactory, $uri);\n        }\n        throw new InvalidArgumentException('URI must be a string');\n    }\n}\n");
  assert.match(t, /Ask: Is uri text\?/);
  assert.equal(sideOf(t, /Ask: Is uri text/, /Gives back the result of create uri/), 'yes');
  assert.match(t, /\n  - Stop: InvalidArgumentException: "URI must be a string"/);
});

test('#116 PHP foreach with key => value is a loop with its check, not "Calls foreach"', () => {
  const t = thunderText('a.php', "<?php\nclass T {\n    private static function isPeerFingerprint($value): bool\n    {\n        if (!\\is_array($value) || $value === []) {\n            return false;\n        }\n        foreach ($value as $algorithm => $fingerprint) {\n            if (!\\is_string($algorithm) || !\\is_string($fingerprint)) {\n                return false;\n            }\n        }\n        return true;\n    }\n}\n");
  assert.doesNotMatch(t, /Calls foreach/);
  assert.match(t, /For each algorithm and fingerprint in value/);
  assert.equal(sideOf(t, /Ask: Value is not an array or value is \[\]\?/, /Gives back false/), 'yes');
  assert.equal(sideOf(t, /Ask: Algorithm is not text or fingerprint is not text\?/, /Gives back false/), 'yes');
});

test('#275 resolveInput: `//` inside a string is not a comment, so the throw and the return are kept', () => {
  const t = thunderText('a.ts', "const resolveInput = (input: string, baseUrl: string): string => {\n\tif (baseUrl) {\n\t\tif (bad.test(input)) {\n\t\t\tthrow new TypeError('`input` url protocol must be followed by `//` when using `baseUrl`');\n\t\t}\n\t\treturn new URL(input, baseUrl).href;\n\t}\n\treturn input;\n};\n");
  assert.match(t, /Stop: TypeError: "`input` url protocol must be followed by `\/\/`/);
  assert.match(t, /return new URL\(input, baseUrl\)\.href;/);
  assert.match(t, /\n  - Gives back input/);
});

test('#176 C# brace-less `if (…)\\n throw` is one question; `*=` multiplies', () => {
  const t = thunderText('A.cs', 'class S {\n    public static List<int> Generate(List<int> lists, int depth = 0)\n    {\n        if (depth == 0)\n        {\n            if (Max > 0 && lists.Count > Max)\n                throw new ArgumentException($"Too many: {lists.Count}.");\n            long total = 1;\n            foreach (var list in lists)\n            {\n                total *= list.Count;\n            }\n        }\n        if (depth >= lists.Count)\n            return new List<int>();\n        return lists;\n    }\n}\n');
  assert.equal(sideOf(t, /Ask: Max is more than 0 and how many lists is more than Max\?/, /Stop: ArgumentException/), 'yes');
  assert.equal(sideOf(t, /Ask: Is depth at least the lists's count\?/, /Gives back an empty list/), 'yes');
  assert.match(t, /Multiplies total by how many list/);
  assert.doesNotMatch(t, /Sets total to how many list/);
});

test('#179 C# one-line `if (!TryGetValue(…)) into[k] = …` keeps its assignment on the right side', () => {
  const t = thunderText('A.cs', 'class S {\n    private static void Merge(Dictionary<Type, HashSet<Type>> into, Dictionary<Type, HashSet<Type>> from)\n    {\n        foreach (var pair in from)\n        {\n            if (!into.TryGetValue(pair.Key, out var types)) into[pair.Key] = types = new HashSet<Type>();\n            types.UnionWith(pair.Value);\n        }\n    }\n}\n');
  assert.equal(sideOf(t, /Ask: Into\.TryGetValue/, /Stores a new HashSet under the pair's key in into/), 'no');
});

test('#199 Python `if not chunk: break` leaves the loop on the No side of "Is chunk set?"', () => {
  const t = thunderText('a.py', 'def generate(raw):\n    while True:\n        chunk = raw.read(10)\n        if not chunk:\n            break\n        yield chunk\n');
  assert.equal(sideOf(t, /Ask: Is chunk set\?/, /Leaves the loop/), 'no');
  assert.doesNotMatch(t, /Yes: continue\n\s+No: continue/);
});

test('#328 Go `continue` in a loop is a step on the side that skips', () => {
  const t = thunderText('a.go', 'package doc\n\nfunc Gen(children []*Command) []string {\n\tresult := []string{}\n\tfor _, child := range children {\n\t\tif !child.IsAvailableCommand() || child.IsAdditionalHelpTopicCommand() {\n\t\t\tcontinue\n\t\t}\n\t\tresult = append(result, child.Name())\n\t}\n\treturn result\n}\n');
  assert.match(t, /Ask: Child is not available command or child is additional help topic command\?/);
  assert.equal(sideOf(t, /Ask: Child is not available/, /Skips to the next one/), 'yes');
  assert.match(t, /Adds the result of name to the end of result/);
});

test('#84 Java switch: one question with one side per case (fall-through labels share one), break is not a step', () => {
  const t = thunderText('A.java', 'class R {\n  public double nextDouble() {\n    switch (p) {\n      case PEEKED_LONG:\n        peeked = PEEKED_NONE;\n        return (double) peekedLong;\n      case PEEKED_SINGLE_QUOTED:\n      case PEEKED_DOUBLE_QUOTED:\n        peekedString = nextQuotedValue(p);\n        break;\n      default:\n        throw unexpectedTokenError("a double");\n    }\n    double result;\n    if (strictness != Strictness.LENIENT && (Double.isNaN(result) || Double.isInfinite(result))) {\n      throw syntaxError("JSON forbids NaN and infinities: " + result);\n    }\n    return result;\n  }\n}\n');
  assert.doesNotMatch(t, /Ask: Chooses by p/);
  assert.match(t, /- Chooses by p .*\n\s+When it is peeked long:\n/);
  assert.match(t, /When it is peeked single quoted or peeked double quoted:\n\s+- Works out peeked string/);
  assert.match(t, /Otherwise:\n\s+- Stop: the error made by unexpected token error/);
  assert.equal(sideOf(t, /Ask: Strictness is not lenient and \(/, /JSON forbids NaN/), 'yes');
});

test('#323 Go composite literal in a range header is the list, not the loop body', () => {
  const t = thunderText('a.go', 'package cobra\n\nfunc validArgs(toComplete string) []string {\n\tvar completions []string\n\tfor _, comp := range []string{"one\\tThe first", "two\\tThe second"} {\n\t\tif strings.HasPrefix(comp, toComplete) {\n\t\t\tcompletions = append(completions, comp)\n\t\t}\n\t}\n\treturn completions\n}\n');
  assert.doesNotMatch(t, /Gives back "one/);
  assert.match(t, /For each item in \[\]string\{[^\n]*\n\s+For each:\n\s+- Ask: Strings\.HasPrefix/);
});

test('#237 Rust cfg! chain: every else-if branch is kept as a question, not "Checks: …: nothing"', () => {
  const t = thunderText('a.rs', 'fn test_level() {\n    if cfg!(feature = "max_level_off") {\n        assert_eq!(STATIC_MAX_LEVEL, LevelFilter::Off);\n    } else if cfg!(feature = "max_level_error") {\n        assert_eq!(STATIC_MAX_LEVEL, LevelFilter::Error);\n    } else {\n        assert_eq!(STATIC_MAX_LEVEL, LevelFilter::Trace);\n    }\n}\n');
  assert.doesNotMatch(t, /: nothing/);
  assert.equal((t.match(/Ask: Cfg/g) || []).length, 2);
  assert.match(t, /LevelFilter::Trace/);
});

test('#302 Go tests: t.Fatal stops the test, t.Errorf marks it failed and goes on', () => {
  const t = thunderText('a_test.go', 'package cobra\n\nfunc checkErr(err error, t *testing.T) {\n\tif err == nil {\n\t\tt.Fatal("Expected an error")\n\t}\n\tif got != expected {\n\t\tt.Errorf("Expected %q, got %q", expected, got)\n\t}\n}\n');
  assert.doesNotMatch(t, /Checks: t\./);
  assert.equal(sideOf(t, /Ask: Is err empty\?/, /Fails the test: "Expected an error"/), 'yes');
  assert.equal(sideOf(t, /Ask: Is got expected\?/, /Marks the test as failed/), 'no');
});

test('#27 Kotlin abstract funs without a body are not merged into one function', () => {
  const t = thunderText('Tree.kt', 'abstract class Tree {\n  protected open fun isLoggable(tag: String?, priority: Int): Boolean\n\n  /** Formats a log message. */\n  protected open fun formatMessage(message: String, args: Array<out Any?>): String\n\n  protected abstract fun log(priority: Int, tag: String?, message: String, t: Throwable?)\n}\n');
  assert.doesNotMatch(t, /protected open fun formatMessage/);
  assert.doesNotMatch(t, /Defines a helper/);
});

test('#62 Java enum constant body: the override is a method, never "Calls public"', () => {
  const t = thunderText('F.java', "public enum FieldNamingPolicy {\n  UPPER_CASE_WITH_UNDERSCORES() {\n    @Override\n    public String translateName(Field f) {\n      return separateCamelCase(f.getName(), '_').toUpperCase(Locale.ENGLISH);\n    }\n  },\n}\n");
  assert.doesNotMatch(t, /Calls public/);
  assert.match(t, /Defines a helper, translate name/);
});

test('#144 throttle: a returned function is shown with its steps, not "the result of function"', () => {
  const t = thunderText('a.ts', 'export const throttle = (func: any, limit: any) => {\n  let inThrottle: any;\n  return function () {\n    if (!inThrottle) {\n      func.apply(this, arguments);\n      inThrottle = true;\n    }\n  };\n};\n');
  assert.doesNotMatch(t, /the result of function/);
  assert.match(t, /Makes a new function that does these steps/);
  assert.equal(sideOf(t, /Ask: Is in throttle set\?/, /Sets in throttle to true/), 'no');
  assert.match(t, /Gives back that function/);
});

test('#102 / #206: a rule is drawn only when it covers the whole body; otherwise every check is a step', () => {
  const php = thunderText('a.php', "<?php\nclass F {\n    private function isOpaque($request, string $proxy, array $conf): bool\n    {\n        if (!$this->cache || !CurlVersion::supports()) {\n            return false;\n        }\n        $parts = \\parse_url($proxy);\n        if (\\is_array($parts) && \\array_key_exists('user', $parts)) {\n            return false;\n        }\n        return true;\n    }\n}\n");
  assert.doesNotMatch(php, /a rule/);
  assert.equal(sideOf(php, /Ask: Not cache or not supports\?/, /Gives back false/), 'yes');
  assert.equal(sideOf(php, /Ask: Parts is an array and/, /Gives back false/), 'yes');
  const py = thunderText('a.py', 'def proxy_bypass(host):\n    if not proxyEnable or not proxyOverride:\n        return False\n    for test in proxyOverride:\n        if re.match(test, host, re.I):\n            return True\n    return False\n');
  assert.match(py, /For each test in proxy override/);
  assert.equal(sideOf(py, /Ask: Re\.match/, /Gives back True/), 'yes');
});

test('#197 Python `elif (` over several lines is one condition, not "Calls and"', () => {
  const t = thunderText('a.py', 'class P:\n    def prepare(self, body):\n        if body is not None:\n            length = super_len(body)\n        elif (\n            self.method not in ("GET", "HEAD")\n            and self.headers.get("Content-Length") is None\n        ):\n            self.headers["Content-Length"] = "0"\n');
  assert.doesNotMatch(t, /Calls and|Ask: \(\?/);
  assert.match(t, /Ask: The method is not in \("GET", "HEAD"\) and the headers\.get\("Content-Length"\) is empty\?/);
  assert.equal(sideOf(t, /Ask: The method is not in/, /Stores "0" under "Content-Length" in headers/), 'yes');
});

test('#30 Kotlin `?: return null` is an early way out; Integer.TYPE is not "type"', () => {
  const t = thunderText('W.kt', 'class W {\n  private fun getType(call: Call): Class<*>? {\n    val method = call.resolveMethod() ?: return null\n    if (method.name == GET_STRING) {\n      return Integer.TYPE\n    }\n    return null\n  }\n}\n');
  assert.equal(sideOf(t, /Ask: Is method empty\?/, /Gives back null/), 'yes');
  assert.match(t, /Gives back Integer\.TYPE/);
});

test('a loop whose body could not be read is shown as code, never an empty "For each:"', () => {
  const t = thunderText('a.rs', 'impl R {\n    pub fn module_path(&self) -> Option<&str> {\n        self.module_path.map(|s| s.get())\n    }\n}\n');
  assert.doesNotMatch(t, /For each:\n(?!\s+-)/);
  assert.doesNotMatch(t, /For each item in module path/);
});
