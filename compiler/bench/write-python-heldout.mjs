// Held-out change requests for Thunder write (scripts/write-bench.mjs --tasks bench/write-python-heldout.mjs).
// Written in full before thunder write was run on these projects, and scored once as written: the first-run result
// is recorded in docs/thunder-write.md and is not improved by editing these tasks. Projects with no dependencies, so
// the hidden tests run with Python's standard library alone.

export const CORPORA = [
  // humanize's version module is written by its build (setuptools-scm); a clone needs it to import.
  { name: 'humanize', repo: 'https://github.com/python-humanize/humanize.git', commit: 'a95004512dde4e8f0269946bb4af754382347441', src: 'src', setup: { 'src/humanize/_version.py': '__version__ = "0+bench"\n' } },
  { name: 'toolz', repo: 'https://github.com/pytoolz/toolz.git', commit: '451af60dec590a6010e2babdbf391ea8f815122f', src: '.' },
];

const m = (file, name, line) => ({ file, name, line });
const NUM = 'humanize/number.py', SIZE = 'humanize/filesize.py', IT = 'toolz/itertoolz.py';

export const TASKS = [
  {
    id: 'apnumber-up-to-five', corpus: 'humanize',
    request: 'Spell out only the numbers 0 to 5; write 6 and up as digits.',
    file: NUM,
    edits: [{ op: 'setValue', member: m(NUM, 'apnumber', 302), step: 'line:338', from: 10, to: 6 }],
    test: `
from humanize.number import apnumber
assert apnumber(5) == "five" and apnumber(0) == "zero"
assert apnumber(6) == "6", apnumber(6)
assert apnumber("x") == "x"
`,
  },
  {
    id: 'naturalsize-refuse-negative', corpus: 'humanize',
    request: 'Refuse a negative file size with an error.',
    file: SIZE,
    edits: [{ op: 'addStop', member: m(SIZE, 'naturalsize', 39), before: 'line:92', when: 'bytes is below 0', message: 'size must not be negative' }],
    test: `
from humanize.filesize import naturalsize
try:
    naturalsize(-5)
except ValueError as e:
    assert "size must not be negative" in str(e)
else:
    raise AssertionError("no error for a negative size")
assert naturalsize(3000000) == "3.0 MB"
`,
  },
  {
    id: 'naturalsize-no-singular-byte', corpus: 'humanize',
    request: 'Show one byte like any other small size ("1 Bytes"), without the special singular case.',
    file: SIZE,
    edits: [{ op: 'removeStep', member: m(SIZE, 'naturalsize', 39), step: 'line:94' }],
    test: `
from humanize.filesize import naturalsize
assert naturalsize(1) == "1 Bytes", naturalsize(1)
assert naturalsize(2) == "2 Bytes"
assert naturalsize(3000) == "3.0 kB"
`,
  },
  {
    id: 'naturalsize-base-inclusive', corpus: 'humanize',
    request: 'Show exactly 1000 bytes as "1000 Bytes", not "1.0 kB".',
    file: SIZE,
    edits: [{ op: 'setCondition', member: m(SIZE, 'naturalsize', 39), step: 'line:97', when: 'abs bytes is at most base' }],
    test: `
from humanize.filesize import naturalsize
assert naturalsize(1000) == "1000 Bytes", naturalsize(1000)
assert naturalsize(1001) == "1.0 kB"
assert naturalsize(999) == "999 Bytes"
`,
  },
  {
    id: 'take-refuse-negative', corpus: 'toolz',
    request: 'Refuse a negative count in take() with a clear error.',
    file: IT,
    edits: [{ op: 'addStop', member: m(IT, 'take', 312), before: 'line:322', when: 'n is below 0', message: 'n must not be negative' }],
    test: `
from toolz.itertoolz import take
try:
    take(-1, [1])
except ValueError as e:
    assert "n must not be negative" in str(e)
else:
    raise AssertionError("no error for a negative n")
assert list(take(2, [1, 2, 3])) == [1, 2]
`,
  },
  {
    id: 'take-nth-start', corpus: 'toolz',
    request: 'Let take_nth start at a chosen position (default 0).',
    file: IT,
    edits: [
      { op: 'addInput', member: m(IT, 'take_nth', 354), name: 'start', default: 0 },
      { op: 'setValue', member: m(IT, 'take_nth', 354), step: 'line:360', from: 0, toValue: 'start' },
    ],
    test: `
from toolz.itertoolz import take_nth
assert list(take_nth(2, [1, 2, 3, 4, 5], 1)) == [2, 4], list(take_nth(2, [1, 2, 3, 4, 5], 1))
assert list(take_nth(2, [1, 2, 3, 4, 5])) == [1, 3, 5]
`,
  },
  {
    id: 'take-nth-refuse-zero', corpus: 'toolz',
    request: 'Refuse a step below 1 in take_nth with a clear error.',
    file: IT,
    edits: [{ op: 'addStop', member: m(IT, 'take_nth', 354), before: 'line:360', when: 'n is below 1', message: 'n must be at least 1' }],
    test: `
from toolz.itertoolz import take_nth
try:
    take_nth(0, [1, 2])
except ValueError as e:
    assert "n must be at least 1" in str(e)
else:
    raise AssertionError("no error for n = 0")
assert list(take_nth(2, [1, 2, 3])) == [1, 3]
`,
  },
  {
    id: 'frequencies-skip-none', corpus: 'toolz',
    request: 'Do not count missing values (None) in frequencies().',
    file: IT,
    edits: [{ op: 'addStep', member: m(IT, 'frequencies', 536), before: 'line:548', step: { if: 'item is nothing', then: ['continue'] } }],
    test: `
from toolz.itertoolz import frequencies
assert frequencies([1, None, 1, None, 2]) == {1: 2, 2: 1}, frequencies([1, None, 1, None, 2])
assert frequencies(["cat", "cat"]) == {"cat": 2}
`,
  },
  {
    id: 'count-rename-input', corpus: 'toolz',
    request: 'Rename the input of count() from seq to items (no change in behavior).',
    file: IT,
    edits: [{ op: 'rename', member: m(IT, 'count', 757), from: 'seq', to: 'items' }],
    test: `
import inspect
from toolz.itertoolz import count
assert list(inspect.signature(count).parameters) == ["items"]
assert count([1, 2, 3]) == 3 and count(iter([1, 2])) == 2
`,
  },
  {
    id: 'interpose-empty-list', corpus: 'toolz',
    request: 'When there is nothing to interpose, give back an empty list.',
    file: IT,
    edits: [{ op: 'setGivesBack', member: m(IT, 'interpose', 520), step: 'line:532', value: '[]' }],
    test: `
from toolz.itertoolz import interpose
assert interpose("a", []) == [], interpose("a", [])
assert list(interpose("a", [1, 2])) == [1, "a", 2]
`,
  },
  {
    id: 'tail-zero-is-empty', corpus: 'toolz',
    request: 'tail(0, seq) gives nothing back (an empty tuple), not the whole sequence.',
    file: IT,
    edits: [{ op: 'addStep', member: m(IT, 'tail', 325), before: 'line:335', step: { if: 'n is 0', then: ['return ()'] } }],
    test: `
from toolz.itertoolz import tail
assert tail(0, [1, 2, 3]) == (), tail(0, [1, 2, 3])
assert tail(2, [1, 2, 3]) == [2, 3]
`,
  },
  {
    id: 'count-none-is-zero', corpus: 'toolz',
    request: 'count(None) is 0.',
    file: IT,
    edits: [{ op: 'addStep', member: m(IT, 'count', 757), before: 'line:767', step: { if: 'seq is nothing', then: ['Give 0'] } }],
    test: `
from toolz.itertoolz import count
assert count(None) == 0
assert count([1, 2]) == 2 and count(iter([1])) == 1
`,
  },
];
