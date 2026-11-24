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

test('redis#5: a brace-less for holding a brace-less if keeps the return inside both (it is not given back always)', () => {
  const t = thunderText('a.c', 'int contains(slotRangeArray *slots, unsigned int slot) {\n    for (int i = 0; i < slots->num_ranges; i++)\n        if (slots->ranges[i].start <= slot && slots->ranges[i].end >= slot)\n            return 1;\n    return 0;\n}\n');
  assert.match(t, /Counts i from 0 while i is less than slots\.num_ranges.*\n    For each:\n      - Ask: .*\n        Yes:\n          - Gives back 1/);
  assert.match(t, /\n  - Gives back 0/);
  assert.doesNotMatch(t, /\n  - Gives back 1/);
});

test('redis#1: a brace-less for keeps its one statement, and an indexed field keeps its index and field', () => {
  const t = thunderText('a.c', 'void init(aeEventLoop *eventLoop) {\n    int i;\n    for (i = 0; i < eventLoop->nevents; i++)\n        eventLoop->events[i].mask = AE_NONE;\n}\n');
  assert.match(t, /For each:\n\s+- Sets the mask of eventLoop\.events\[i\] to ae none/);
  assert.doesNotMatch(t, /Sets the event loop's events to/);
});

test('redis#7/#10: two names declared at once are code; `unsigned long long x = f()` is a value, not a call to unsigned', () => {
  const t = thunderText('a.c', 'void f(int *eb) {\n    eItem newitem, curitem = ebGetListPtr(type, *eb);\n    unsigned long long keys_count = kvstoreSize(kvs);\n}\n');
  assert.match(t, /`eItem newitem, curitem = ebGetListPtr\(type, \*eb\);` \(code, not explained\)/);
  assert.match(t, /Works out keys count from kvstore size/);
  assert.doesNotMatch(t, /Calls e item|Calls unsigned/);
});

test('redis#19/#21: a value under an index keeps its owner (`c->argv[j]->ptr`, `c->argv[1]`)', () => {
  const t = thunderText('a.c', 'void cmd(client *c) {\n    char *opt = c->argv[j]->ptr;\n    robj *key = c->argv[1];\n}\n');
  assert.match(t, /Sets opt to the ptr of c\.argv\[j\]/);
  assert.match(t, /Sets key to the 1 entry in the c's argv/);
  assert.doesNotMatch(t, /the j's ptr|the argv's 1/);
});

test('redis#9: `!strcasecmp(u, "m")` asks whether u is "m" (the gate knows it is a comparison)', () => {
  const t = thunderText('a.c', 'double unit(char *u) {\n    if (!strcasecmp(u, "m")) {\n        return 1;\n    }\n    return -1;\n}\n');
  assert.equal(sideOf(t, /Ask: Is u "m"\?/, /Gives back 1/), 'yes');
});
