# How accurate is Thunder?

Thunder is only useful if people can trust it: a picture that is wrong gives a false sense of security. This page
measures it on real open-source code, with `compiler/scripts/accuracy.mjs`, and is updated as the reader changes.

```
node compiler/scripts/accuracy.mjs <repo>... [--io] [--failures] [--steps] [--samples out.md --per-language 40]
```

## What is measured

1. **Round trip (exact).** A rule is read into a Thunder card, written back as code in every language Thunder
   writes (TypeScript, Python, Go, Rust, C#, Java), read again, and both are run on every edge case. "Same" means the
   same answer everywhere. "Different" would mean Thunder changed what a rule decides.
2. **What a step keeps.** Every number and quoted text in Thunder's wording must appear in the code ("invented"
   counts the steps where one does not), and how many of the code's names a reader can see: in the short words, and
   in Details (the words plus every detail one level down, from the step's meaning tree). Steps Thunder shows as code
   are honest but not explained. Names in a line's comment, and keywords, are not counted.
3. **Steps round trip (TypeScript, JavaScript, Python, Go).** Each step's meaning tree (`expr`) is written back as
   code, read again by the same reader, and compared. "Exact" means the same tree came back. Conditions and values
   made only of names, values, and operators are also run, original against written-back code, on generated inputs.
4. **Big Picture against an independent count.** Classes, routes, and methods counted by a separate, simple scan:
   classes drawn, routes drawn, and methods owned by the wrong Thing.
5. **Inputs and outputs.** Parameter names and values read from a request, against "You give it"; functions whose
   code returns, sends, or throws something, against whether Thunder shows an ending.

## Latest results (eleven repositories, nine languages)

| Repo | rules | round trips same | steps explained | names kept (short words) | names kept (Details) | steps round-trip exact | steps with an invented value | classes drawn | routes drawn | methods misplaced | inputs shown | endings shown |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| JakeWharton__timber | 0 | n/a (0/0) | 94.5% | 54.1% | 95.3% | n/a | 0 of 497 | 100% (10/10) | 0/0 | 0 of 94 | 80.4% (123/153) | 100% |
| expressjs__express | 3 | 33.3% (6/18) | 90.2% | 58.9% | 96.6% | 100% (819/819) | 0 of 739 | n/a (0/0) | 51/68 | 0 of 143 | 100% (98/98) | 87.7% |
| google__gson | 11 | 9.1% (6/66) | 90.3% | 68.2% | 99.1% | n/a | 0 of 5232 | 100% (164/164) | 0/0 | 0 of 1214 | 100% (898/898) | 96% |
| guzzle__guzzle | 10 | 18.3% (11/60) | 88.5% | 62.1% | 96.3% | n/a | 3 of 4901 | 96.2% (51/53) | 0/0 | 0 of 714 | 99.8% (664/665) | 99.4% |
| jaredpalmer__formik | 3 | 66.7% (12/18) | 91.8% | 63.1% | 96.4% | 97% (1216/1253) | 0 of 1150 | 100% (7/7) | 0/0 | 0 of 202 | 93.7% (208/222) | 97.7% |
| jbogard__MediatR | 2 | 100% (12/12) | 90.1% | 50.1% | 94.8% | n/a | 0 of 1016 | 100% (90/90) | 0/0 | 0 of 228 | 81.9% (254/310) | 99.2% |
| psf__requests | 1 | 0% (0/6) | 92.4% | 73.9% | 100% | 99.8% (1641/1644) | 0 of 1519 | 100% (40/40) | 0/0 | 0 of 268 | 99.7% (295/296) | 98.9% |
| rust-lang__log | 1 | 0% (0/6) | 87.1% | 45.9% | 95.4% | n/a | 0 of 858 | 100% (30/30) | 0/0 | 0 of 412 | 75.9% (202/266) | 100% |
| sinatra__sinatra | 17 | 0% (0/102) | 79.9% | 51% | 90.6% | n/a | 0 of 1541 | 100% (44/44) | 3/4 | 0 of 542 | 78.5% (402/512) | 96.5% |
| sindresorhus__ky | 0 | n/a (0/0) | 92% | 66.2% | 96.4% | 99.5% (745/749) | 0 of 689 | 0% (0/2) | 0/7 | 0 of 117 | 95.5% (127/133) | 100% |
| spf13__cobra | 0 | n/a (0/0) | 95.5% | 53.8% | 99.9% | 99.7% (5483/5500) | 0 of 5251 | 100% (9/9) | 0/0 | 0 of 589 | 99.7% (648/650) | 81.3% |

All: round trips same 16.3% (47/288; different 0, not read back 108, cannot run 133, not written 0); steps explained
90.4%; names kept 59.5% in the short words, 97.4% in Details; steps with an invented value 3; words that disagree
with the meaning tree 0. Steps round trip (TypeScript, JavaScript, Python, Go): exact 99.4% (9,904 of 9,965;
different 0; kept as code 61). Run before and after: 1,069 same, 0 different (Go's 1,060 cases are not run: its
values need declared types; 17 TypeScript cases use type syntax plain JavaScript cannot run).

(Names kept in the short words was 58% before this measure stopped counting names inside a line's comment and a few
more keywords; the same correction applies to both columns.)

Before the faithfulness gate (same repositories): steps explained 89.3%, names kept 59%, 72 rules and 65 of 372 round
trips the same. The rule count fell because a function is now drawn as a rule only when the rule covers its whole
body (see below); the 18 round trips that left with them had only ever checked part of those functions. The three
"invented" values are PHP steps whose line is off by one in one file (a line-numbering gap, not a made-up value:
the numbers are in the code one line below).

## No loss: every detail, one level down

Thunder's words are short on purpose, so they leave things out: "Calls save" does not say what is saved. Since the
meaning tree (`expr`, see [the spec](./spec.md#every-detail-one-level-down-works-today)), every step keeps everything
its statement says, and a reader opens it one level down: Details shows each step's tree and what the words left
out ("Calls save — with: order, { validate: false }"), and the full Thunder Text puts it after the words.

- **Names a reader can see**: 59.5% in the short words, **97.4% in Details** (from 90.6% for Ruby to 100% for Python).
- **Round trip of meaning** (TypeScript, JavaScript, Python, Go): 99.4% of steps come back exactly; every step that
  was read into a tree comes back exactly; none comes back different. 1,069 conditions and values were run before
  and after on generated inputs; all gave the same answers.
- **What is still kept as code** (no tree, shown as code, never guessed), all eleven repositories: 465 of 25,864
  steps (1.8%). By repository: Sinatra (Ruby) 199 of 1,928, MediatR (C#) 60 of 1,128, log (Rust) 58 of 985, guzzle
  (PHP) 46 of 5,538, formik 37 of 1,253, gson 24 of 5,794, timber 17 of 526, cobra 17 of 5,500, ky 4 of 749, requests
  3 of 1,644, express 0 of 819. The rest: Ruby commands written without brackets inside conditions and endless ranges,
  C# `using` / `out var` / local functions, Rust `use`, `impl`, patterns (`Some(ref x)`), and `#[cfg]`, type and
  import declarations inside functions, JSX that a statement splitter cut short, and a Go `if` whose first statement
  ends a line.
- **Limits**: the tree is checked against the same reader that made it (a round trip proves the tree is complete and
  writable, not that the reader understood the language perfectly); behavior is run only for conditions and values
  made of names, values, and operators (not calls); Go is compared by tree only. Names in the remaining 2.6% are mostly
  in parts the reader keeps as code, or written on the same line as a step that is another step's child.

## The faithfulness gate

A hand review of 330 sampled readings (30 functions per repository, ten languages) graded each against its code:
32 accurate, 188 true but vague, 53 misleading, and **57 false**. Most false readings had one cause: a condition's
words lost a negation or a term (`!a || b` read as "a or b", with the Stop on the wrong side), or a value was cut to
its first clause. The reader now checks its own words before it shows them:

- **Conditions.** A condition is split at its top-level and / or; each part is said on its own; and each part's
  words must keep that part's negations (`!`, `not`, `!=`, `!==`, `is not`, `not in`, `unless`) and comparisons.
  A loose `!= null` reads "is set" (its negation is part of the meaning); strict `=== null` and `=== undefined` stay
  apart. When the words cannot keep everything, the question is the code itself: "Ask: `…`? (code, not
  explained)". A compound question is asked as written, never turned positive, so the Stop stays on the side where
  the code takes it; `unless` is the only thing that flips a whole question.
- **Values.** A value stored under a key keeps its key ("Stores v under key in headers", never "Sets headers to
  v"); a returned `a && b` or `a || !b` keeps every part or is shown as code; a ternary whose side cannot be said is
  not half-said; `a or b` keeps its fallback; a call names a value only when the call is the whole value.
- **Structure.** No construct is dropped: a loop's `continue` and `break` are steps; a brace-less `if` keeps its
  statement; a switch is one question with one side per case; a loop whose body could not be read is shown as code
  (never an empty "For each:"); comment marks inside strings (`'//'`, PHP `'#'`) no longer cut a body short; a
  function is drawn as a rule only when every statement was read into it.

How often the gate gives code back (all eleven repositories): 66 of 4,727 questions (1.4%) are asked as code; 571
of 4,080 endings (14%) and 1,168 of 8,027 values (14.6%) are shown as code (before: 497 of 3,855 and 1,223 of 7,466).
A self-check over every question (the polarity of the words and the Yes/No side against the polarity of the code)
finds no mismatch, against 63 before.

### Hand review, re-graded

The 110 samples graded misleading (C) or false (D) were re-read against the new Thunder Text (same functions, same
code):

| | false (D) | misleading (C) | true but vague (B) | accurate (A) |
|---|---|---|---|---|
| The 57 that were D | 0 | 0 | 44 | 13 |
| The 53 that were C | 0 | 5 | 48 | 0 |

The five still misleading: a promise chain whose `.then`/`.catch` steps are not shown (Express), a lazy getter made
with `Object.defineProperty`, a returned anonymous class (Gson), a returned stream with its progress logic hidden
behind "the result of pipe through" (ky), and a Go `ctx` input left out as plumbing. Each sample's regression test is
in `compiler/test/faithfulness-*.test.mjs`.

## Proof by running

Sampling and self-checks show that a reading is careful. Running the code shows whether it is right. `thunder verify
--run` runs real code, records what actually happened, and compares it with the flow Thunder drew:

```
thunder verify --run <folder> [--lang python|js] [--pytest "<args>" | --tests <dir> | --command "<test command>"]
                              [--cwd <dir>] [--python <path>] [--max-seconds 120] [--no-generate] [--all] [--json]
npm run accuracy:gate         # the release gate: fixtures, offline, in CI
```

**What is run.** The project's own tests when Thunder is told how to run them (`--pytest`, `--command`, or a folder
of `test_*` functions), and made-up inputs for functions that look free of side effects (they call only built-ins,
text and list methods, and their own module; inputs are each value the body mentions, one either side, 0, empty
text, None). Code that needs files, the network, processes, or clocks is never called with made-up inputs.

**What is recorded**, with no packages installed:

- Python (3.12+): `sys.monitoring` notes every statement each call reaches; Python's own parser (`ast`) says whether
  the statement after an `if` / `elif` / `while` / `for` / `match` / `except` is in its body, its else, a case, or
  past it; and each `return` (with its value when it is a number, text, yes/no, or None), each `raise` (with the
  error's class and parents), and each call that reaches the end of its body.
- JavaScript: V8's own debugger, in the same process (`node:inspector`), stops at every statement V8 itself knows.
  At an `if` / `while` it works out the condition's value without side effects (a condition that could change
  something is left undecided and not counted); it notes the next statement of the same call, each return point
  (line and value), each `throw` (class and parents), and the end of each body.

**What is compared.** For each question in a member's flow: when the code's condition held, the side Thunder says
it takes then (`whenTrue`: Yes, or No for a negated condition asked the positive way round) must hold the next step
that ran, and when it did not hold, the other side must (or the flow must carry straight on when that side is
empty); a loop must reach its "For each" steps when entered; a case or error handler must hold the step that ran;
a `return` line must be one of Thunder's endings, and a rule's answer the value actually given back; a `raise` /
`throw` line must be a Stop, of the error Thunder names; reaching the end of a body needs a "Done" (or, for a web
handler, the response it sends last). A question the run reached that the picture leaves out altogether (not even
as code) is a contradiction too. A member is **executed** when it ran and every claim the run reached matched,
**contradicted** when any did not (each mismatch names the question, the side, and the line), and **not run**
otherwise. Only a run writes `completeness.level = 'executed'` into the model.

### Results

| Code | Run by | Members | Ran | Executed | Contradicted | Not run | Questions checked by a run | Time |
|---|---|---|---|---|---|---|---|---|
| requests | its own 619 tests (pytest) + made-up inputs | 268 | 194 | 194 | 0 (1 before the fixes) | 74 | 386 of 451 | 75 s |
| urllib3 2.8 | requests' tests | 513 | 173 | 173 | 0 (8 before) | 340 | 402 of 904 | 75 s |
| werkzeug 3.1 | requests' tests (its test server) | 1,127 | 221 | 220 | 0 (4 before) | 906 | 434 of 1,670 | 74 s |
| Express 5 | its own 1,290 tests (mocha, Node 22) | 143 | 118 | 118 | 0 | 25 | 95 of 160 | 349 s (2 s untraced) |
| Fixtures (Python, JS) | their tests + made-up inputs | 14 | 14 | 14 | 0 | 0 | 24 of 25 | < 1 s |

Python tracing costs almost nothing: requests' suite takes the same 75 s with and without it (most of that is the
suite's own network timeouts). JavaScript tracing stops V8 at every statement, which is slow: Express's suite takes 349 s traced against 2 s
untraced. Runs are
capped (`--max-seconds`, default 120; the cap is reported, and a capped run is partial, never complete).

**What the runs found** (reader bugs, all fixed in the same change, each with a regression test in
`compiler/test/executed.test.mjs`):

- Python `try … else:` bodies were dropped from the picture (requests `super_len`: three questions the run reached
  were not drawn at all), and so were `for` / `while … else:` bodies. They are now "If nothing went wrong" and "If
  it did not leave the loop early".
- Python `with self.lock:` (a `with` without `as`) read "Calls with" and dropped every step inside it: eight urllib3
  members (`RecentlyUsedContainer`, `PoolManager.connection_from_pool_key`, `HTTPResponse._raw_read`, …) and four
  werkzeug members (`Headers.set`, `Map.update`, `MapAdapter.match`, …) were contradicted. It now reads "Uses
  self.lock" with its steps.
- JavaScript `else if` rules were all placed on the first `if`'s line, so the run's answers could not be matched to
  their questions. Each now sits on its own line.
- Express: no reader bug. Its first runs showed contradictions that were the recorder's own (a statement that is
  only a call, such as `res.setHeader(…)`, has no V8 stop of its own; a chain continued on the next line stops on
  that line), fixed in the recorder before the numbers above. A handler that ends by `res.send(…)` or `next(err)`
  matches Thunder's ending or Stop on that last line.

How strong the check is: swapping the Yes and No sides of every question in the model (a deliberately wrong reading)
makes the same runs contradict 99 of the 116 requests members, all 46 Express members, and 117 of the 120 urllib3
members whose questions were checked; the rest have only loops or error handlers, which have no Yes and No to swap.

The static gate found one more: a SQL CHECK / UNIQUE refusal was written in quotes ("Each email can be used only
once") as if the database said those words; it is now described, not quoted.

**Limits.** "Not run" is most members of a library whose tests do not reach them; made-up inputs only reach
functions that look free of side effects. A run checks the paths it took, not every path: "executed" means every
claim the runs reached matched, and the result says how many of a member's questions were checked. Loops are
checked in Python only (JavaScript loops are recorded but not judged), Python `match` cases and JavaScript
`switch` cases only where Thunder draws them as questions, and JavaScript conditions only when V8 can evaluate them
without side effects. TypeScript is run only where Node runs it directly.

### Running it on a real repository

Work on a copy in a scratch folder, and install the project's test dependencies there, never globally:

```
python3 -m venv /tmp/scratch/venv && /tmp/scratch/venv/bin/pip install -e "/tmp/scratch/requests[socks]" pytest pytest-httpbin
thunder verify --run /tmp/scratch/requests --pytest "tests -q -p no:cacheprovider" --python /tmp/scratch/venv/bin/python --max-seconds 300
thunder verify --run /tmp/scratch/venv/lib/python3.12/site-packages/urllib3 --cwd /tmp/scratch/requests --pytest "tests -q" --python /tmp/scratch/venv/bin/python
cd /tmp/scratch/express && npm install --ignore-scripts
thunder verify --run /tmp/scratch/express --lang js --command "node ./node_modules/.bin/mocha --require test/support/env --check-leaks test/ test/acceptance/" --max-seconds 600
```

To gate a release on them, list the same runs in a JSON file and pass it to the gate: `node
compiler/scripts/accuracy-gate.mjs --config gate.json` (the format is at the top of the script). With configured
repositories the gate also runs the static checks over them; the three "invented" PHP values in guzzle (a line
numbering gap, see above) would fail it today.

## C, C++, and Swift

Hand review (same samples before and after; C from a 43-file redis `src/` subset, C++ from fmt and nlohmann/json,
Swift from Alamofire and vapor; Python/JavaScript files in those repositories not counted):

| | accurate (A) | vague (B) | misleading (C) | false (D) |
|---|---|---|---|---|
| C, before (22) | 3 | 4 | 7 | 8 |
| C, after | 10 | 12 | 0 | 0 |
| C++, before (39) | 5 | 11 | 10 | 13 |
| C++, after | 15 | 24 | 0 | 0 |
| Swift, before (38) | 10 | 8 | 18 | 2 |
| Swift, after | 16 | 22 | 0 | 0 |

Fresh samples drawn after the first round of fixes (57, not used to write the fixes) found 3 more false and 5
misleading Swift readings (a String property read as a rule, `Logger(…)` as "writes a message", a tuple as
"whether"; array inputs, switch / if-expression / route bodies not giving back); after the second round none of
them is C or D. Each is a test in `compiler/test/faithfulness-{c,cpp,swift}.test.mjs`.

Automatic numbers (before → after): steps explained fmt 86.6 → 83.9%, json 88.7 → 87.2%, redis 95.9 → 93.6%,
Alamofire 93.8 → 92.6%, vapor 91.6 → 90.8% (the gate shows code instead of false words); steps with an invented value
json 68 → 8, redis 44 → 12, vapor 36 → 32 (vapor's are status numbers from `.notFound`-style names, a checker
artifact); inputs shown Alamofire 91.3 → 91.8%, vapor 67.5 → 71.4% (the earlier 61% / 37% came from the checker
taking Swift's external labels, `to request:`, as names); endings shown vapor 93.6 → 96.3%. Text with values inside
is checked with its «placeholders» removed: every literal part must appear in the code.

## What the numbers say

- **No false readings in the re-graded sample, and no changed answers.** Every condition keeps its polarity or is
  shown as code; no rule gave a different answer after the round trip.
- **The round trip is mostly unchecked, not wrong.** Most rules cannot yet be written back or run on both sides
  (string comparisons, calls, and rules that use facts the class keeps), so they are counted as not checked. That
  is coverage to win, and it is never reported as "same".
- **Inputs and endings are near complete** for Java, Go, PHP, Python, TypeScript, and JavaScript; Rust, Ruby,
  Kotlin, and C# miss some inputs, and some Go and Express endings are missed.
- **Names kept** is about how much detail the wording carries ("Calls save" without what it saves). The words still
  leave detail out on purpose to stay short, but the detail is no longer lost: 97.4% of the names are one level down
  in Details and the full Thunder Text, and the remaining gap is mostly code Thunder keeps as code.

This is measured on code, not by watching people read it. A person's own check of hundreds of sampled readings is
the next step.
