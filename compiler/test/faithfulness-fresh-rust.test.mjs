// Faithfulness for Rust: minimal copies of readings graded false (D) in the fresh audit of ThunderLang 1.0.3
// (ripgrep, serde_json). The sample is in the test name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText } from './faithfulness-helpers.mjs';

test('ripgrep#3: `static MSG: &str = "…"` names a value; nothing is called "static"', () => {
  const t = thunderText('a.rs', 'impl T {\n    pub fn add_defaults(&mut self) {\n        static MSG: &\'static str = "never fail";\n        for &(names, exts) in DEFAULT_TYPES {\n            for name in names {\n                self.add(name).expect(MSG);\n            }\n        }\n    }\n}\n');
  assert.doesNotMatch(t, /Calls static/);
  // Say less: a loop over a pattern (`&(names, exts)`) is shown as code; the loop inside it is still worded.
  assert.match(t, /Repeats: `for &\(names, exts\) in DEFAULT_TYPES` \(code, not explained\)/);
  assert.match(t, /For each name in names/);
});

test('ripgrep#8/#9/#14: lines inside text written over several lines are not steps', () => {
  const t = thunderText('a.rs', 'fn haystack() {\n    let haystack = "\\\na\nb\n  c\nd\n";\n    assert_eq!(got, haystack);\n}\n');
  assert.match(t, /Sets haystack to a text written over several lines/);
  assert.doesNotMatch(t, /Calls c|Calls d/);
  assert.match(t, /assert_eq!/);
});

test('ripgrep#9/#14/#15: `Builder::new()….build()` holds what build makes, never "a new Builder"', () => {
  const t = thunderText('a.rs', 'fn p() {\n    let mut printer = StandardBuilder::new()\n        .heading(true)\n        .build(NoColor::new(vec![]));\n    let j = JSONBuilder::new().build(vec![]);\n}\n');
  assert.doesNotMatch(t, /a new StandardBuilder|a new JSONBuilder/);
});

test('the last expression gives back its value: `Ok(n)`, `Some(v)` are not calls', () => {
  const t = thunderText('a.rs', 'impl T {\n    fn write(&mut self, buf: &[u8]) -> Result<usize, Error> {\n        let n = self.w.write(buf)?;\n        Ok(n)\n    }\n    fn find(&self, k: &str) -> Option<u32> {\n        match self.map.get(k) {\n            Some(v) => Some(*v),\n            None => None,\n        }\n    }\n}\n');
  assert.doesNotMatch(t, /Calls ok|Calls some/);
  assert.match(t, /Gives back n/);
  assert.match(t, /Gives back v \(Some\)/);
});

test('a string ending a function is not a modifier `if`: "Use PCRE2 if appropriate."', () => {
  const t = thunderText('a.rs', 'impl T {\n    fn doc_short(&self) -> &\'static str {\n        "(DEPRECATED) Use PCRE2 if appropriate."\n    }\n}\n');
  assert.doesNotMatch(t, /Ask:/);
});
