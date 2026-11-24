// The small YAML reader used for workflow files: the subset GitHub Actions files use, with lines kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYaml, parseYamlAll, toJS, get, entry, text, stripComment } from '../src/yaml.mjs';

test('mappings, sequences, and scalars in YAML core types', () => {
  const y = parseYaml(`name: CI
count: 3
ratio: 1.5
on: push
flag: true
off: false
none: null
tilde: ~
empty:
list:
  - a
  - 2
nested:
  deeper:
    key: value
`);
  assert.deepEqual(toJS(y), { name: 'CI', count: 3, ratio: 1.5, on: 'push', flag: true, off: false, none: null, tilde: null, empty: null, list: ['a', 2], nested: { deeper: { key: 'value' } } });
});

test('a sequence may sit at the same indentation as its key, and `- key: value` starts a mapping', () => {
  const y = parseYaml(`steps:
- uses: actions/checkout@v4
- name: Test
  run: npm test
  with:
    node-version: 22
jobs:
  a:
    steps:
      - run: x
      -
        run: y
`);
  assert.deepEqual(toJS(y), { steps: [{ uses: 'actions/checkout@v4' }, { name: 'Test', run: 'npm test', with: { 'node-version': 22 } }], jobs: { a: { steps: [{ run: 'x' }, { run: 'y' }] } } });
});

test('flow lists and maps, including nesting, quotes, and lists that span lines', () => {
  const y = parseYaml(`branches: [main, 'release/*', "v1, v2"]
matrix: { node: [20, 22], os: ubuntu-latest }
empty: []
spread: [
  a,   # first
  b
]
`);
  assert.deepEqual(toJS(y), { branches: ['main', 'release/*', 'v1, v2'], matrix: { node: [20, 22], os: 'ubuntu-latest' }, empty: [], spread: ['a', 'b'] });
});

test('quoted scalars: escapes in double quotes, doubled quotes in single quotes, a # inside quotes is not a comment', () => {
  const y = parseYaml(`a: "tab\\there \\"q\\" \\u00e9"
b: 'it''s # not a comment'
c: plain # a comment
d: "x: y"
'quoted key': 1
url: https://example.com/a#b
`);
  assert.deepEqual(toJS(y), { a: 'tab\there "q" é', b: "it's # not a comment", c: 'plain', d: 'x: y', 'quoted key': 1, url: 'https://example.com/a#b' });
});

test('block scalars: literal and folded, with clip, strip, and keep chomping, and an indentation indicator', () => {
  const y = parseYaml(`lit: |
  line one
    indented
  line three

strip: |-
  no newline
keep: |+
  kept

folded: >
  folded
  together

  new paragraph
digit: |2
    two extra
after: done
`);
  const js = toJS(y);
  assert.equal(js.lit, 'line one\n  indented\nline three\n');
  assert.equal(js.strip, 'no newline');
  assert.equal(js.keep, 'kept\n\n');
  assert.equal(js.folded, 'folded together\nnew paragraph\n');
  assert.equal(js.digit, '  two extra\n');
  assert.equal(js.after, 'done');
});

test('a block scalar knows the line its text starts on, so each command can point at its own line', () => {
  const y = parseYaml('job:\n  run: |\n    echo one\n    echo two\n');
  const run = get(get(y, 'job'), 'run');
  assert.equal(run.valueLine, 3);
  assert.equal(entry(get(y, 'job'), 'run').line, 2);
});

test('${{ … }} expressions stay exactly as written, even with braces, colons, and # inside', () => {
  const y = parseYaml(`if: \${{ github.ref == 'refs/heads/main' && !cancelled() }}
name: Test on \${{ matrix.os }} # trailing comment
list: [\${{ matrix.a }}, b]
map: { k: \${{ fromJSON('{"x": 1}') }} }
`);
  const js = toJS(y);
  assert.equal(js.if, "${{ github.ref == 'refs/heads/main' && !cancelled() }}");
  assert.equal(js.name, 'Test on ${{ matrix.os }}');
  assert.deepEqual(js.list, ['${{ matrix.a }}', 'b']);
  assert.equal(js.map.k, `\${{ fromJSON('{"x": 1}') }}`);
});

test('multi-line plain and quoted scalars fold into one line', () => {
  const y = parseYaml('a: one\n  two\n  three\nb: "x\n  y"\n');
  assert.deepEqual(toJS(y), { a: 'one two three', b: 'x y' });
});

test('anchors, aliases, merge keys, tags, and several documents', () => {
  const docs = parseYamlAll('base: &b\n  x: 1\nother:\n  <<: *b\n  y: !!str 2\nalias: *b\n---\nsecond: true\n');
  assert.equal(docs.length, 2);
  assert.deepEqual(toJS(docs[0]), { base: { x: 1 }, other: { x: 1, y: '2' }, alias: { x: 1 } });
  assert.deepEqual(toJS(docs[1]), { second: true });
});

test('comments, blank lines, and a key named `on` are kept as text, not turned into true', () => {
  const y = parseYaml('# top\n\non:   # trigger\n  push:\n    branches: [main]\n\n# between\njobs: {}\n');
  assert.deepEqual(toJS(y), { on: { push: { branches: ['main'] } }, jobs: {} });
  assert.equal(entry(y, 'on').line, 3);
});

test('bad indentation and an unclosed quote are errors with a line number, never a wrong reading', () => {
  assert.throws(() => parseYaml('a:\n  b: 1\n    c: 2\n'), /line 3/);
  assert.throws(() => parseYaml('a: "open\nb: 1\n'), /not closed/);
});

test('stripComment and long runs of spaces or # do not slow the reader down', () => {
  assert.equal(stripComment("a: 'x # y' # z"), "a: 'x # y'");
  const long = `key: ${'a '.repeat(50000)}#${' '.repeat(50000)}\n${'#'.repeat(100000)}\n${' '.repeat(100000)}\nnext: 1\n`;
  const t0 = Date.now();
  const y = parseYaml(long);
  assert.equal(toJS(y).next, 1);
  assert.ok(Date.now() - t0 < 500, `took ${Date.now() - t0} ms`);
});

test('every workflow in this repository parses', () => {
  for (const f of ['ci.yml', 'release.yml', 'intent-check.yml']) {
    const y = parseYaml(readFileSync(new URL(`../../.github/workflows/${f}`, import.meta.url), 'utf8'));
    assert.ok(get(y, 'jobs'), f);
    assert.ok(text(get(y, 'name')), f);
  }
});
