// Faithfulness for C: statements that must be said exactly or shown as code. Text with values inside keeps its
// literal parts exactly and shows each value as a «placeholder» (docs/spec.md, "Text with values inside").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

test('printf pairs each conversion with its value; flags, width, and precision are kept; %% stays as written', () => {
  const t = thunderText('a.c', 'void f(const char *dir, int n, double x) {\n    printf("%s/alias %d\\n", dir, n);\n    fprintf(stderr, "took %5.2f s (100%%)\\n", x);\n    snprintf(buf, sizeof(buf), "%lu", n);\n}\n');
  assert.match(t, /Writes a log or message: "«dir»\/alias «n»\\n"/);
  assert.match(t, /Writes a log or message: "took «x as %5\.2f» s \(100%%\)\\n"/);
  assert.match(t, /Writes the text "«n»" into buf/);
});

test('printf whose values cannot be paired (a `*` width, too few values) is shown as code', () => {
  const t = thunderText('a.c', 'void f(int w, int n) {\n    printf("%*d", w, n);\n    printf("%s %s", n);\n}\n');
  assert.match(t, /`printf\("%\*d", w, n\);` \(code, not explained\)/);
  assert.match(t, /`printf\("%s %s", n\);` \(code, not explained\)/);
});

test('`*out = v` writes where out points (out itself is unchanged)', () => {
  const t = thunderText('a.c', 'int count(const char *s, int *out) {\n    *out = 0;\n    return 0;\n}\n');
  assert.match(t, /Writes 0 where out points/);
  assert.doesNotMatch(t, /Sets out to 0/);
});

test('compound operators: += and -= of a call add and subtract; bit operators are shown as code', () => {
  const t = thunderText('a.c', 'void f(int n) {\n    total += size_of(n);\n    left -= used(n);\n    flags &= ~MASK;\n    bits <<= 2;\n}\n');
  assert.match(t, /Adds the result of size of to total/);
  assert.match(t, /Subtracts the result of used from left/);
  assert.match(t, /`flags &= ~MASK;` \(code, not explained\)/);
  assert.match(t, /`bits <<= 2;` \(code, not explained\)/);
});

test('`if (p != NULL) { … }` on one line: the condition is what is inside the parentheses', () => {
  const t = thunderText('a.c', 'void f(char *p) {\n    if (p != NULL) { free(p); }\n}\n');
  assert.equal(sideOf(t, /Ask: Is p set\?/, /Frees p/), 'yes');
});

test('#ifdef: steps that only some builds run say so', () => {
  const t = thunderText('a.c', 'void f(void) {\n#ifdef HAVE_EPOLL\n    use_epoll();\n#else\n    use_select();\n#endif\n}\n');
  assert.match(t, /Calls use epoll \(only in builds where `#ifdef HAVE_EPOLL`\)/);
  assert.match(t, /Calls use select \(only in builds where `#else of #ifdef HAVE_EPOLL`\)/);
});

test('a goto label keeps its name exactly inside quotes (names are not turned into words inside quotes)', () => {
  const t = thunderText('a.c', 'int f(int n) {\n    if (n < 0) goto object_first;\n    return n;\nobject_first:\n    return 0;\n}\n');
  assert.match(t, /Jumps to the "object_first" part/);
  assert.match(t, /The "object_first" part starts here/);
});
