// Faithfulness for C and C++: minimal copies of readings graded false (D) in the fresh audit of ThunderLang 1.0.3
// (jq, cJSON, leveldb, yaml-cpp). The sample is in the test name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

test('jq#3: a brace-less `else if` after a braced if keeps its branch', () => {
  const t = thunderText('a.c', 'int loc(int a, int b, int e) {\n  int res = 0;\n  if (a < b)\n    {\n      res += f(b);\n    }\n  else if (0 <= e && a < e)\n    res += f(e);\n  return res;\n}\n');
  assert.equal(sideOf(t, /Ask: Is a less than b\?/, /Ask: 0 is at most e/), 'no');
});

test('jq#7: `end = mid;` is a step (a variable named end is not the end of a block)', () => {
  const t = thunderText('a.c', 'int bs(int result, int mid) {\n  int end = 9, start = 0;\n  if (result < 0) {\n    end = mid;\n  } else {\n    start = mid + 1;\n  }\n  return end;\n}\n');
  assert.equal(sideOf(t, /Ask: Is result less than 0\?/, /Sets end to mid/), 'yes');
});

test('jq#12/#13: `break` in a switch leaves the switch, not a loop', () => {
  const t = thunderText('a.c', 'int f(char *s, char c) {\n  while (*s) {\n    switch (c) {\n      case \'a\': x = 1; break;\n      default: return 1;\n    }\n    s++;\n  }\n  return 0;\n}\n');
  assert.doesNotMatch(t, /Leaves the loop/);
  assert.match(t, /Leaves the choice/);
});

test('jq#6: a constant keeps its name: `path_max = PATH_MAX`', () => {
  const t = thunderText('a.c', 'int f(void) {\n  int path_max;\n  path_max = PATH_MAX;\n  return path_max;\n}\n');
  assert.match(t, /Sets path max to PATH_MAX/);
});

test('jq#13 / leveldb#4: quoted text is kept exactly (a quote character, leading spaces)', () => {
  const t = thunderText('a.c', 'void f(void) {\n  char delim = \'"\';\n  char *r = "  put \'";\n  g(delim, r);\n}\n');
  assert.match(t, /Sets delim to '"'/);
  assert.match(t, /"  put '"/);
});

test('cJSON#5: a comparison of comparisons is asked as written, with its Stop on the side the code takes', () => {
  const t = thunderText('a.c', 'static int cmp(const char *name, const char *pointer)\n{\n    if (((*pointer != 0) && (*pointer != \'/\')) != (*name != 0))\n    {\n        return 0;\n    }\n    return 1;\n}\n');
  assert.doesNotMatch(t, /\*pointer 0\)/);
  assert.equal(sideOf(t, /Ask: \(\(\*pointer is not 0\)/, /Gives back 0/), 'yes');
});

test('cJSON#14: a loop header inside `#if … #endif` does not make the steps inside it build-only', () => {
  const t = thunderText('a.c', 'int main(void)\n{\n    int s = 0;\n#if AFL\n    while (more())\n    {\n#endif\n    s = step();\n#if AFL\n    }\n#endif\n    return s;\n}\n');
  assert.match(t, /the loop only in builds where `#if AFL`; the steps inside are in every build/);
  assert.doesNotMatch(t, /Works out s from step \(only in builds/);
});

test('leveldb#10/#12/#14 (C++): `Status s = FindTable(…)` calls FindTable; it creates nothing', () => {
  const t = thunderText('a.cc', 'Status TableCache::Get(int n) {\n  Status s = FindTable(n, &handle);\n  Node* x = FindGreaterOrEqual(key, nullptr);\n  return s;\n}\n');
  assert.doesNotMatch(t, /Creates a new FindTable|Creates a new FindGreaterOrEqual/);
});

test('yaml-cpp#1 (C++): a brace-less `else if` keeps its one statement', () => {
  const t = thunderText('a.cpp', 'void Scanner::ScanFlowEntry() {\n  if (InFlowContext()) {\n    if (top() == FLOW_MAP && Verify())\n      push(1);\n    else if (top() == FLOW_SEQ)\n      InvalidateSimpleKey();\n  }\n}\n');
  assert.equal(sideOf(t, /Ask: Is top\(\) FLOW_SEQ\?/, /Calls invalidate simple key/), 'yes');
});

test('yaml-cpp#3/#15 (C++): an enum getter is not a yes/no rule; a tab stays a tab', () => {
  const t = thunderText('a.h', 'class NodeRef {\n  EmitterStyle::value style() const { return m_pData->style(); }\n};\nbool IsWhitespace(char ch) { return (ch == \' \') || (ch == \'\\t\'); }\n');
  assert.doesNotMatch(t, /Answer: Yes/);
  assert.doesNotMatch(t, /\\\\\\\\t/);
});
