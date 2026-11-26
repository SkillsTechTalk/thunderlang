# Unreleased

- **Thunder Core compiles to Rust.** `thunder build|run|test --target rust` (or `target = "rust"` in `thunder.toml`)
  writes a small Cargo project: one `.rs` per Thunder file, `main.rs`, and `thunder_runtime.rs`, a line-by-line port
  of the Thunder engine's value code that uses only the standard library (exact decimals of any size, money rounded
  half up, positions from 1, the same words for every value and error), so it builds offline. 136 Core test programs
  give the same output, errors, and exit status on Python, the Thunder engine, TypeScript, and Rust; programs that use
  a Python module are refused (TC405). Running needs `rustc` and `cargo`; without them Thunder says what to install.
- **Fix: JSON `false`.** "the JSON data in" read `false` one character short, so `{"a": false}` failed with
  "Expecting ',' delimiter". It now reads it as Python does (Thunder engine and TypeScript).

# 1.2.0

**Upgrade note.** Every existing command, flag, and exit code is unchanged, with one JSON change: in `thunder why
--json`, a step's `effect` is now one of six kinds (`money`, `delete`, `send`, `create`, `change`, `read`; or
`unknown` / `none`) instead of `change`, and `changes[]` items gain `kind`. `thunder` with no command now prints a
short home screen; the full list is `thunder help --all`. Color is used only when the output is a terminal.

- **`thunder init` is friendlier, and mission rules can be tried without JSON.** `thunder init` now says what it made
  (a starter mission: a product's rules and the examples that prove them), lists what to try next, and points
  beginners to `thunder new hello`. Its template's comments name the right file (they said `Mission.intent`) and
  suggest `thunder try`. `thunder try Mission.thunder` works on mission decisions: it asks for each value (or takes
  `--with "age=20"`), says the kind each value should be (worked out from the rules), and explains the answer in words
  ("age is at least 18 (age is 20)").
- **Trademark marks.** Thunder™ and ThunderLang™ now carry ™ where the brand is shown prominently: the CLI's home
  screen, `thunder --version`, `thunder help --all`, `thunder doctor`, the npm and VS Code descriptions (and the
  extension's display name), the compiler README, and the site's logo and footer.
- **Color in the terminal, and an easier full command list.** Screens people read (the home screen, `help`,
  `doctor`, `new`, `why`, `try`, `read --level`, and the "did you mean" and "no project here" messages) use calm color:
  green ✓, red ✗ only for real problems, yellow ! for warnings, commands to type in cyan, bold labels and headings.
  Color is off for files, pipes, scripts, editors reading the output, `NO_COLOR`, and all JSON; `FORCE_COLOR=1` keeps
  it. The words are identical with or without color (a test checks it). `thunder help --all` now starts with what most
  people need (Start, Write and run programs, Read and understand code, Change code) and puts missions, proofs, and
  editor tools under "Advanced"; every command is still listed. The home screen adds `thunder try`.
- **Thunder Core compiles to TypeScript.** `thunder build --target typescript` (or `target = "typescript"` in
  thunder.toml) writes one readable `.ts` file per Thunder file into `generated/typescript/`, with `// thunder:N` line
  marks, the runtime, its types, and a `tsconfig.json`; `thunder run --target typescript` and `thunder test --target
  typescript` run it on Node (Node 22.6+ strips the types itself; on an older Node, Thunder uses the `typescript`
  package when it can find it, and otherwise says what is needed). One meaning: the runtime is the Thunder engine's own
  value code (engine-values.mjs, byte for byte), and every Core test program now runs three ways (Python, the Thunder
  engine, and compiled TypeScript), with the same output, errors, and exit status required: 136 programs on Node 18,
  22, and 24. `tsc --strict` accepts the code generated for all of them. A program that uses a Python module (`Use`) is
  refused for TypeScript before anything is written (new code TC405). The site lists Core → TypeScript as Available;
  Java, C#, Go, and Rust stay Planned. CI now runs the compiler tests on Node 22, and the site job checks every
  generated file with tsc.
- **The tutorial teaches writing and running Thunder.** `@skillstech/thunderlang/learn` gains part 2, "write and run":
  seven lessons (`part: 'write'`), each naming the concept it teaches: your first program in two commands
  (`thunder new hello`, `thunder run hello`, and why a bare `thunder run` right after fails), conditions, loops and
  lists (positions from 1), records with a Never rule, reading Python as Thunder (and what is marked not translated),
  check vs test vs verify, and `thunder why` with its limits. Every answer is worked out by running the lesson's
  program on the Thunder engine. New optional lesson fields: `concept`, `commands` (what to type), and `output` (what
  the program prints). Same schema (`thunder-learn-v1`); the 12 reading lessons are unchanged. The engine's language
  core is now `engine-core.mjs` with no Node APIs, so the tutorial still runs in a browser.
- **Fix (Core → Python): a whole number written with leading zeros (`007`) compiled to Python that would not run**
  (Python refuses `007`). It now compiles to `7`, as Thunder means it.
- When Python is missing, `thunder run` and `thunder test` now also say how to run without it: `--engine thunder`.
- **The Thunder engine: run Thunder Core without Python.** `thunder run --engine thunder` and
  `thunder test --engine thunder` run a program on the Thunder engine, a second engine that runs the same checked
  program the Python compiler uses. Python is not needed, and is still the default. Both engines must agree: every
  Core test program now runs on both (output, errors with code, words, line and "reached from", and exit status),
  and any difference fails the tests. A program that uses a Python module (`Use csv as csv`) is refused on the
  Thunder engine before it runs; Thunder never imitates a library. Also available as `runWithEngine` /
  `testWithEngine` in `src/core/engine.mjs`.
- **`thunder try`: what if?** Try a rule from your code with your own values: `thunder try register.ts --with
  "age=15, parent approved=no"` prints the answer and why, check by check (✓/✗ with the value it saw). Without
  `--with`, it asks for each value, explains a mistyped one, and offers another case. Only rules can be tried (they
  change nothing); an action is refused with the command to read it, and a rule too complex for the engine is refused
  with the reason. `--focus` picks a rule; `--json` gives data. Same engine as the web rule editor.
- **`thunder read --level`: read at one depth, in the terminal.** The five levels OpenThunder shows: `big-picture`
  (the Things, what they know and can do), `flow` (one action or rule as a tree of questions, branches, error
  handlers, and "always"), `details` (every way it ends, what it changes and when, and what the code cannot tell),
  `text` (Thunder Text), and `original` (the exact lines, numbered). `--focus "<name>"` picks an action, rule, or
  Thing; without it, `flow` and `details` list the choices as commands. Each level suggests the next. Steps Thunder
  could not explain stay marked. `--json` prints the model level itself, the same data OpenThunder reads. Works on a
  file or a folder. `thunder read` without `--level` is unchanged.
- **`thunder why` is short now, and says what the agent did to the world.** The first screen is a few lines: what
  happened, why it stopped, what it did, and what to do next; `--steps` gives every step. Each step that does something
  gets one kind, most serious first: moves money, deletes, sends, creates, changes, reads. The kind comes from the
  strongest evidence: what the tool declares (its MCP annotations with `--tools tools.json`, or `thunder.effect` on the
  span), then the request method or database operation, and only then the tool's name, where every word counts and the
  most serious wins (`get_and_delete` now deletes; it was read as `get`). Guesses are labeled. `--allow read,send`
  names anything beyond those kinds and exits 1. JSON: new `effects` (and `allowed`/`notAllowed`); `changes` items now
  carry `kind`, and a step's `effect` is one of the six kinds (it was `change`).
- **A friendlier first minute in the terminal.** `thunder` on its own now shows a short home screen (five things
  to do, with examples) instead of 120 lines; `thunder help --all` is the full list, and `thunder help <command>`
  shows one command. A mistyped command says "Did you mean thunder read?" instead of failing later (it used to crash
  reading a file). `thunder new hello` says exactly how to run it (`thunder run hello`), and `--run` runs it too.
  `thunder run` (or test, build, check) outside a project says where the nearby projects are and the exact command.
  New: `thunder doctor` checks Thunder, Node.js, Python 3.10+, PATH, Node versions (nvm) missing Thunder, and
  optional toolchains, offline, with the fix for each problem; `thunder completion zsh|bash|fish` completes commands
  on Tab. Every existing command, flag, exit code, and JSON output is unchanged.

# 1.1.0

- **Thunder Why: what an AI agent did, in plain words.** `thunder why run.json` reads an agent run's OpenTelemetry
  record and says what the agent was asked and answered, what went wrong, what happened just before, what would have
  changed the outcome, and what it changed, with every step in order. It reads OTLP JSON, the collector's file
  exporter, the Python console exporter, and OpenInference span arrays, with the GenAI, OpenInference, HTTP, and
  database conventions. Retries are one step ("3 tries"); a failed change is never reported as done; a tool whose
  name doesn't say whether it changes anything is listed as "could not judge". Errors are in plain words, with the
  original kept in the details. Values that look like secrets are hidden. `--step n` shows one step in full;
  `--json` gives the same as data. Nothing is run and no AI is used. Also available as `@skillstech/thunderlang/why`.
- **Inputs with defaults.** `Receive price and rate (7% if not given)`: a call may leave the input out. A default
  is a fixed value: a number, money, a percent, text, yes/no, `nothing`, or a kept value. It comes after the inputs
  without one. A list or map default is an error (TC404), because Python would share it between calls. `--as-core`
  reads Python's fixed defaults (`rate=0.07`, `label="x"`, `flag=None`, `rate=TAX`) this way, and still refuses list,
  dict, and computed defaults. Real Python (150 files): 240 → 261 exact functions. Core text also accepts `\r`.
- **Core's standard operations for text, lists, numbers, and JSON.** The new forms:
  - text: `names joined with ", "`, `line split at ","`, `the parts of text`, `date replacing "-" with "/"`,
    `name starts with "Dr"`, `file ends with ".csv"`;
  - lists and numbers: `scores sorted` and `sorted descending`, `the absolute value of x`;
  - JSON: `the JSON data in text`, which reads numbers exactly, and `the JSON text of value`.
  Each checks its kinds: before running when known, while running otherwise. Invalid JSON stops with TC509. The
  words `joined`, `split`, `replacing`, `starts`, and `ends` now belong to Thunder and cannot be part of a name.
  `--as-core` reads Python's `join`, `split`, `replace`, `startswith`/`endswith`, `abs`, `max`/`min` of several
  values, `sorted(xs)`, `list()`, `dict()`, and `json.loads`/`json.dumps` (only when the file imports `json`) as
  these forms. A call whose meaning differs is still refused: `maxsplit`, a replace count, a tuple of prefixes, or
  `key=`. The benchmark's exact functions rose to 19 of 20, and all 19 give the same results as the original.
- **Methods read as Core.** `thunder read <file.py> --as-core` now prints each method of a class as a Core function
  that receives the object first (`To Account withdraw:` / `Receive self and amount`). `self.other()` calls that
  class's own function, and this is written down as an assumption, since a subclass could replace it. Static methods
  are printed as plain functions. Special methods, inner functions, and `self.other()` calls the class does not
  define are refused. The round trip now runs methods too, and compares the object afterwards. Benchmark:
  `Account` 6 of 6 and `Cart` 4 of 5 methods printed exactly, all giving the same results. On 150 real Python
  files, exact functions rose from 66 to 236 (3% to 12%), and every file's Core still compiles.
- **Fix (Core): changing a field or an entry whose kind is not known.** `Add 3 to box's items`, `Increase box's count
  by 1`, and `Set xs at 1 to v` on a value from Python compiled to invalid Python (`get_field(...) = …`) or set the
  wrong list position (`xs[1]` for Core's position 1). They now read and store through the same helpers as `Set`.
  Reading `pair at 1` works on a Python tuple.
- **Read Python as Thunder Core: reading and writing are one language.** `thunder read <file.py> --as-core` prints
  the reader's meaning tree as Core you can edit, compile, and run. It never prints from the English. A line Core
  cannot say with the same meaning becomes `# Not translated (line N): <why>` plus a `Stop with` line. Such a
  function is reported as not safely editable; Thunder never rewrites a line into something close. Assumptions are
  written next to the line. The output always compiles. On the 20-function benchmark (`docs/core-read-write.md`),
  the printed Core compiles 20 of 20, is exact 18 of 20, and the 18 exact ones give the same results as the
  original Python on 52 of 52 sample inputs, checked by running both (`verifyRoundTrip`, `compiler/src/core/round-trip.mjs`).
- **Core is strict about yes/no and exact with Python floats.** A condition, `and`/`or`/`not`, or a comparison with
  `true`/`false` on a value of unknown kind now checks it is yes/no while running. `1` or `"yes"` stops with a
  clear error instead of being treated as true or false. A Python float reaching Core arithmetic or a comparison
  becomes the exact decimal it is written as (`19.99`). Before, `float * Decimal` crashed, and a float `0.1`
  compared as more than `0.1`.
- **Thunder Trace: how your repositories depend on each other.** `thunder trace <folder…>` links HTTP requests to
  the routes that handle them and published events to their listeners, across repositories, and cites every link
  `repo@sha:file:line`. `thunder trace impact "<route | event | repo:file[:line]>" <folder…>` and
  `thunder trace impact --diff [--base ref] <folder…>` list what a change can affect, ranked high/medium/low, one
  hop out. A route or event that was removed is caught by reading each changed file as it was before. Links are made
  only on a fact: `/health`-style paths, paths with no fixed part, and two equal matches are never linked, and each
  is listed with the reason. The graph (`thunder-trace-v1`) is fingerprinted. The MCP server offers it as
  `intent_trace` (local only). Reference: `docs/trace.md`.
- **Routes include their controller's prefix.** ASP.NET `[Route("api/[controller]")]` and Spring
  `@RequestMapping("/api")` on a class now prefix each handler's path (`POST /api/Orders`, not `POST`). An ASP.NET
  path with no prefix now starts at the root (`/docs/{id}`).
- **Thunder Core: write a program in Thunder and run it (Python first).** `thunder new <dir>` creates a project
  (`thunder.toml`, `src/main.thunder`, `tests/`); `thunder run`, `build`, `test`, `check` and `format` work in it,
  or on one file with `--core`. Core has values, kept values, functions, conditions, loops, lists, maps, records with
  `Never allow` rules, `If this fails:`, tests, and `Use <python module>` to reach the Python ecosystem. It compiles
  to readable Python 3.10+ plus a standard-library-only `thunder_runtime.py`: division and money are exact, rounding
  is half up, positions start at 1, `nothing` is never silently a value, and every failure names the Thunder line
  (TC5xx). The site's playground example (several `Receive` lines, `yes or no`, a condition continued on an
  `and …` line) compiles and runs as written. Reference: `docs/core.md`. Demos: `examples/core/`. Python is the only
  target so far.
- **`thunder new` now creates a Core project.** For an intent mission file, use `thunder init <Name>` (or
  `thunder new --mission <Name>`); `thunder new` says so when it runs.
- **Fix: a rule Thunder cannot translate never becomes `false`.** The scaffolds (`thunder gen`, all four targets),
  the executable targets (TypeScript, Python, C#, Java, Go, Rust, Kotlin, Scala, Elixir) and the in-browser
  translator used to replace an untranslatable rule condition with `false` (Python with no note at all), so generated
  or executed code silently skipped that rule and returned another answer. Now generation reports the new diagnostic
  **`IL-GEN-001`** ("Thunder could not translate the condition '…' for <target>: <reason>"), `thunder gen` prints it
  on stderr and exits 1, the generated rule throws with that message (`throw new Error(...)`,
  `raise NotImplementedError(...)`), and `thunder test --target`, `--all-targets` and `thunder conform --run` refuse
  to run that decision and report its cases as *not translated*, never as an answer. New API:
  `generateWithDiagnostics(ast, target)` and `translateDecisionsWithDiagnostics(ast, lang)`.
- **Fix: Money is exact, never binary floating point.** `Money` is a decimal with 2 minor units (or the currency's:
  `Money(JPY)` 0, `Money(KWD)` 3); extra precision is an error, never rounded; rounding, where a spec asks, is half
  up (a half goes away from zero), the same rule as Thunder Core's `round`. TypeScript Money was `number`; it is now `bigint` minor units with a generated zero-dependency
  `parseMoney` / `formatMoney` helper. Python Money was `float`; it is now `decimal.Decimal`. Decision inputs typed
  `Money` were `double`/`float64`/`f64` in every target; they are now `decimal` (C#), `BigDecimal` (Java), `int64`
  (Go) and `i64` (Rust) minor units, and a Money comparison a target cannot do exactly (Kotlin, Scala, Elixir, or
  multiplying Money) is refused with `IL-GEN-001`. The decision engine adds, subtracts and multiplies decimals
  exactly, so `0.1 + 0.2 == 0.3`. Plain contracts read `$12.30` as exact cents (and show `$12.30`, not `$12.3`), and
  reject `$12.305` instead of rounding it. JSON Schema / OpenAPI describe Money as a decimal string, not a number.
  See "Money is exact" in `docs/spec.md`.
- **Fix: a failed run is never a `null` answer.** The live target runners turned a missing toolchain, a compile
  failure, a crash or a timeout into `null` (and Python turned an exception into `None`), so a real null answer
  looked the same as a failure. Each run now returns `{ status: 'ok', results }` with one
  `{ status: 'ok', value }` or `{ status: 'error', kind, message }` per case (`kind`: `missing-toolchain`,
  `compile-failed`, `runtime-error`, `timeout`, `assertion-failed`, `not-translated`, `missing-input`), or a whole-run
  `{ status: 'error', kind, message }`. `thunder test --target` / `--all-targets` and `thunder conform` show
  `ERROR` with the kind and reason (and fail the run); a missing toolchain is still skipped. Conformance evidence
  counts an error as a failure. Types: `compiler/src/target-result.d.mts`. The playground's Code tab lists any rule
  that was not translated.
- **Fix: a case is never run with a made-up input.** A test case that left out an input was run in Java, Go, Rust
  and the others with `0`, `false`, `""` (or `$0` for Money), so a typed target answered for a value nobody wrote and
  its FAIL blamed the target (Python crashed instead). Every target now reports such a case as `missing-input`,
  naming the inputs to add. Target names print as TypeScript and C# (not Typescript and Csharp).
- **Say less: words only where Thunder is sure (`src/say-less.mjs`).** Every worded step is now checked after it is
  read, and a step stays in words only when its form is recognized and the words account for its code (every word from
  the code or Thunder's own wording, every value exact, no negation, and/or, comparison, arithmetic, cast, or named
  argument part dropped, no ambiguous names, recognized endings, certain block structure, inputs from the signature).
  Anything else is shown as its code, exactly as written. On new repositories graded independently the false rate fell
  from 10.4% to 3–4% (target 1% not yet reached; see docs/accuracy.md); steps explained fell from 90.0% to 81.7%.
  - **New fields (OpenThunder):** every step and flow node has `explained` and, when false, `notExplainedWhy`;
    functions and members have `explainedSteps` / `totalSteps`; the model has `explainedSteps` / `totalSteps`.
  - **C and C++ meaning trees:** `->`, unary `*` / `&`, C casts, typed and array declarations, `struct` / `static`
    declarations, C++ template calls (`static_cast<T>(x)` is a call, never a comparison), range-for with `const auto&`.
    Swift `try f()` is an expression, not a try block.
  - **Rules** are drawn only for a certain yes/no answer (`state.copy_ || state.base_` is not a rule); **doc comments**
    only from the `/** … */` right above a function (a `/*#__PURE__*/` no longer pulls in another function's doc).
  - **Reviews:** a question's two sides keep quoted text exactly (`hasattr(fp, "read")`, never `hasattr(fp, 0)`).
  - A length reads one way: "the length of password" (never "how many password").
  - `scripts/form-words.mjs` regenerates the readers' fixed wording list; `SAYLESS_DEBUG=1` prints why each step was
    shown as code.
  - Tests changed only where a reading correctly became code: gin#13 (an `if` with a setup statement other than the
    err idiom), ripgrep#3 (a loop over a pattern), Kingfisher#2 / Alamofire#3 (`guard case`), Rectangle#5 (`for …
    where`), nvm#18 (`test && cmd || other`), neofetch#3 and nvm#2 (`ls` alone is not "the files in ".""), #179
    (`out var`), vapor#8 (a closure with a capture list), the Swift `if let …, cond` reading, httr#19 (quotes inside a
    value), jquery#15 (`queue || []` is not "when that has no value"), #165 (the shown code is the source as written),
    and four expectations of "how many x" that now read "the length of x".
- **Fix (writing in Thunder):** an inline route handler's own model id (`auth.ts##POST/api/auth/register#3`) now resolves in `thunderWrite`, and `says` names only the changed step, once, when a one-line `if` holds several steps. Reported by OpenThunder.
- **Thunder review on every pull request (GitHub Action).** `uses: SkillsTechTalk/thunderlang@main` (the repository's
  root `action.yml`) runs `thunder review` on the pull request's two commits with the published compiler, writes the
  review to the job summary, and keeps one pull request comment up to date (found by `<!-- thunder-review -->`), with
  the workflow's own `GITHUB_TOKEN`. Inputs: `base`, `head`, `comment`, `fail-on` (none | risk), `paths` (globs),
  `version`. Pull requests from forks get the job summary only, and it says why; `pull_request_target` is never
  needed. Runs in your CI: no code leaves GitHub, no AI. Docs: `docs/github-action.md`. The `.thunder` check action
  moved to `SkillsTechTalk/thunderlang/check` (the old root action pointed at a package name that does not exist).
- **`renderReviewComment(review)`** (core, browser-safe): the comment, grouped by changed action, rule, or function,
  risks first, with honest counts (explained in sentences, shown as code, Thunder cannot check), a link to
  thunderlang.dev, and a size cap that leaves out whole entries and says "N more not shown".
- **`thunder review --base <ref> --head <ref> --format markdown|json --paths <glob,...>`**: flag forms of the existing
  positional arguments and `--json`, and `--paths` to review only matching files.

# 1.0.4

- **Fix: no false readings left in the fresh audit outside SQL.** An independent review of 1.0.3 on 32 repositories
  it had never seen (480 non-SQL samples) graded 53 readings false (11%). Each now reads true or is shown as code, and
  each has a regression test (`compiler/test/faithfulness-fresh-*.test.mjs`). What changed:
  - **Endings.** A bare `raise` / `throw;` passes the error on ("Stop: the same error again"), never "Gives back
    raise". Rust gives back its last expression (`Ok(n)`, `Some(v)`, a `match` arm, a value over several lines); Go's
    bare `return` with named results gives back those results; Ruby's last value is shown as given back; R's
    `stop_input_type`, `ui_abort`, `*_abort` and `stop_*` always stop; shell `exec prog` runs prog in place of the
    script (and `exec -a NAME prog` never "Runs -a"). `try … finally` and Swift `do { }` without `catch` no longer
    claim to handle any error. A value given back that could not be put into words says "Gives back `…`".
  - **Structure.** A brace-less `else if` / `else` after a braced `if` keeps its branch (C, C++, Java, JavaScript, …);
    a variable named `end` is a step, not the end of a block; `break` in a `switch` "Leaves the choice", never the
    loop; a check that returns before the rules (`if shape != Line { return shape }`) means the body is read as
    steps, so no rule card drops an answer; a C loop header inside `#if … #endif` no longer marks the steps after
    `#endif` as build-only; Go `if init; a ||\n b {` keeps its whole condition; Go `for {` keeps its body; Rust text
    over several lines is one value, not steps; Ruby calls over several lines are one step.
  - **Values, not yes/no.** `queue || []`, `(@cache[k] ||= {})`, `a << b`, `x.filterIsInstance<T>()` and value-giving
    calls are never worded "whether"; `+=` adds to a total; `== null` / `is None` / `== nil` say null / None / nil,
    never "empty"; Ruby `reject` keeps the items that do not match; a C/C++ function that returns an enum is not a
    yes/no rule; Swift `guard` on a known closure, `guard case T.x = v`, and `for x in xs where c` keep their meaning;
    `strncmp(a, b, n) == 0` (a prefix check) is never said as "a is b".
  - **Literal fidelity.** Quoted text keeps its spaces, case, sign, escapes, and quote characters (`"  put '"`,
    `` "`-Inf`" ``, `'"'`, `'\t'`); constants keep their names (`PATH_MAX`, R `.stroke`); shell quotes in a pattern are not
    text; PowerShell lists are never said with fewer items than they have, a backtick-escaped quote inside `$( … )`
    no longer swallows the next line, and a table made with entries is not "an empty table"; shell `$( … )` inside a
    list is one item; a path that goes on past an index is shown as written.
  - **Calls and creation.** `Status s = FindTable(…)` calls FindTable (C++); `Builder::new()….build()` is what build
    makes; a list or table made with items is not "empty"; `static` / `const` in a Rust body names a value; keywords
    (`unsafe`, `using`, `foreach`, `for`, …) are never "called"; `@GetMapping({"/vets"})` is GET /vets; a static
    `Factory::create()` saves nothing; `return md5(…)` gives back what md5 makes; `[ -d "$path" ]` asks about a
    folder; narrowing `static_cast` is kept.
- **Checker (`compiler/scripts/accuracy.mjs`).** `--seed N` picks samples in a seeded random order (`--only`
  narrows to one language); samples leave out test code (`*.test.ts`, `*_test.go`, `*Tests.swift`, `*Spec.*`, Rust
  `#[cfg(test)]` modules); the polarity self-check no longer flags `!= nullptr`, `!strcmp`, names that contain
  "no"/"not", Rust `matches!`/`cfg!`, TypeScript and Kotlin `!`/`!!`, or regex `(?!…)`, and now catches a question
  turned round at an "is" inside brackets and a Swift `guard` asked by a rule's name; «placeholders», `‹secrets›`
  and "(worked out when it runs)" are not invented values, and a workflow step is checked against its whole block;
  a step the run check cannot build a case for (JSX) is skipped, never a crash (`meaning.mjs` span fix).

- **Fix: SQL routines never read falsely.** An independent review of 1.0.3 found half of its SQL readings stated
  something false: an `ELSE`'s `RAISE` shown as an unconditional Stop, steps hoisted out of their `IF`, `CASE`, or
  `FOR`, `ELSIF x = 'id'` read as "Sets x to "id"", `IF v_done THEN LEAVE` read as "Yes: continue", `EXECUTE stmt`
  missing, and `"stack_created"` rewritten as "stack created". Routine bodies are now tokenized and parsed block by
  block (`compiler/src/sql-proc.mjs`) for PL/pgSQL, MySQL/MariaDB stored programs, and T-SQL:
  `IF`/`ELSIF`/`ELSEIF`/`ELSE`, `CASE` (with no `ELSE`, a value that matches no `WHEN` is an error, as the database
  says), `LOOP`/`WHILE`/`FOR`/`FOREACH`/`REPEAT`, labels, `EXIT`/`LEAVE`/`ITERATE`/`CONTINUE`/`BREAK` ("Leaves the
  loop", "Skips to the next round of the loop"), `RAISE`/`SIGNAL`/`THROW`/`RAISERROR` (a `RAISE NOTICE`, a
  severity-10 `RAISERROR`, or `PRINT` is a message, not a Stop; a severity-16 `RAISERROR` outside `TRY` reports the
  error and carries on), `RETURN` / `RETURN NEXT` / `RETURN QUERY` (rows added, "and carries on"; a set-returning
  function's last `RETURN` "Gives back the rows it has added"), `BEGIN … EXCEPTION … END` and `BEGIN TRY … CATCH`,
  `DECLARE … HANDLER`, `PREPARE`/`EXECUTE`/`DEALLOCATE`, cursors, and dynamic SQL (`EXECUTE format('…%I…', x)` →
  "Runs the SQL "…«x as %I»…"").
- **Faithful words.** Every condition and value passes the faithfulness gate or is shown as code; quoted text is held
  aside and kept exactly (`IN ('create_table')` stays `"create_table"`); `%` in a `RAISE` message pairs with its
  argument as a «placeholder»; two names compared read "is the same as"; `<>` and `NOT IN` are asked as written ("is different from", "is none
  of"), so a NULL lands on the side the code takes; MySQL `/*!50602 … */` versioned comments are read as the
  statements they are, on the versions that run them; a name whose words would read as logic
  (`v_is_default`, `p_control_not_null`) is kept as written; MySQL `@variables` and `@@system` values stay as written.
  A body whose blocks do not match (an `IF` without its `END IF`) is shown as not read, never guessed.
- **Inputs and spans.** Routine inputs come from a real parameter list (`IN`/`OUT`/`INOUT`, defaults, T-SQL
  `@params` with or without parentheses; `OUT` parameters are what it gives back); every routine and view spans its
  whole definition, not its first line.
- **T-SQL procedures** (`CREATE`/`ALTER PROCEDURE … AS BEGIN … END`, up to `GO`) are read; **dbt models** (Jinja
  templates) are listed as skipped with the reason, never guessed.
- Regression tests: `compiler/test/faithfulness-sql.test.mjs`, one case per false reading found.

# 1.0.3

- **Version:** ThunderLang now shares OpenThunder's version number, so the two always go together. 1.0.3 has the same contents as 0.5.12; nothing in the language or the compiler changed.

# 0.5.12

- **Fix:** a call through an instance made in the same file (`library = Library()` then `library.can_borrow(…)`; `const svc = new Service()` then `svc.canShip(…)`) links to the rule again, as in 0.5.11. Details "Rules it relies on" and Flow "Open the rule" depend on it. Reported by OpenThunder.

**Language: writing in Thunder** (`compiler/src/write-steps.mjs`; `thunderWrite` in `/core`; `thunder write <file>
--edit '<json>' [--apply] [--test "<cmd>"] [--candidate <file>]`). A person changes software in Thunder and the code is
written for them, then proven.
- **Thunder edits**, by function and step: `setValue`, `setCondition` (whole condition, comparison, one side,
  negation, add or remove an `and`/`or` part), `addStep`, `removeStep`, `moveStep`, `addStop`, `removeStop`,
  `addInput`, `removeInput`, `setGivesBack`, `rename` (an input, a name, or the function with its calls), and
  `addFunction` (simple cases). Each is validated against the meaning tree; one that does not fit is refused with the
  reason.
- **Written deterministically** for TypeScript, JavaScript, Python, and Go as a minimal patch: only the touched lines
  (often characters) change; comments, quotes, indentation, and formatting stay byte for byte.
- **Otherwise `needs-ai`** with a self-contained instruction for an AI coding agent (the compiler makes no AI or
  network call); code an AI wrote is checked by the same proof (`options.candidate`) and labeled **AI-written**.
- **Proven** by reading the changed files again: the edited steps equal the intended steps tree for tree, and every
  other function means the same (identical trees, and `thunder same`). A patch that fails its proof is never returned
  as written. `--test` runs a command on the change; `--apply` saves only then.
- On five audit repositories, 2,846 of 3,069 generated edits (92.7%) were written and proven, 210 needed AI, 13 were
  refused (`scripts/write-sweep.mjs`).
- `/zoom` Details has **Change this**: change a limit or add a Stop on the sample and see the Thunder edit, the code
  change, and the proof, computed in the browser; nothing is saved.
- `readCode(…, { allSteps: true })` also gives decisions their steps; `parseStatementSpans` gives each part's offsets.
- Fix: `thunder --help` is flushed before exit, so a long help is never cut off in a pipe.

**Fix (serious): `thunder same` could call different code "same".** It compared steps by their short words and
ignored the code of steps shown as code, so `x = a + b` and `x = a - b`, or `compute(o.items)` and
`compute(o.lines)`, were reported as the same. Steps are now also compared by a language-neutral signature of their
code (names in any convention, operators, values); when the words match but the code does not, the answer is "cannot
check: Thunder reads these the same, but the code differs at step N", with both lines. A faithful conversion across
languages is still proven the same.

**Language: the whole application, next two readers: Kubernetes YAML and Docker Compose (spec section 12).**
- **Kubernetes** (`.yaml`/`.yml` known by `apiVersion:` and `kind:` in its first lines; multi-document files and
  `kind: List`): each resource is a Resource (`resourceType` the kind as written, `address` `Deployment/api` or
  `Service/shop/web` in a namespace). Workloads (Deployment, StatefulSet, DaemonSet, Job, CronJob, Pod) know copies,
  image, command, ports, settings (`secretKeyRef` only named), CPU and memory, health checks in words, the user they
  run as, and their mounts; Services, Ingresses, ConfigMaps, Secrets (values never shown), PersistentVolumeClaims,
  ServiceAccounts, NetworkPolicies (in words), autoscalers, Namespaces, and kustomizations are read too; other kinds
  are still drawn, with their type as written.
- **Docker Compose** (`docker-compose.yml`, `compose.yaml`, `*.compose.yml`, `docker-compose.<name>.yml`): services,
  named volumes, networks, secrets, and configs are Resources (`compose-service`, `services.web`). A service knows its
  image or build folder, published ports and to whom, settings (`${VAR}` computed; secret-looking literals not shown),
  env files, volumes, what it starts after, networks, health check, restarts, user, limits, and profiles.
- **Links** with file and line: a Service **sends to** the workloads its selector picks; an Ingress to its Services; a
  setting that names a Service or Compose service exactly (`redis:6379`, `http://api:8080`) **sends to** it; ConfigMaps
  and Secrets are **read from**; Namespaces and Compose networks are **run in**; service accounts, storage claims,
  roles, `depends_on`, and named volumes are **used**. Links to resources in other files are drawn when the files are
  read together (same folder first; another folder only when exactly one has it). A Compose `build:` is linked to that
  folder's Dockerfile image by exact path, and a Kubernetes image to a Dockerfile whose folder has exactly its name.
- **Flow**: "Applying shop.yaml" (the order things are made) and "Starting compose.yaml" (networks and volumes, then
  each service after what it waits for: "Builds and starts api (from ./api), once db is healthy"; "Is the profile
  monitoring turned on?").
- **Permissions**: Role/ClusterRole rules ("can read (get, list, and watch) configmaps in the namespace shop") and
  RoleBinding/ClusterRoleBinding ("The service account ci/deployer can do anything (cluster-admin) in the whole
  cluster"), wide for `*` verbs or resources, cluster-admin, admin/edit cluster-wide, or a role given to everyone.
- **Facts**, two new kinds: `privileged-container` (`privileged: true`, SYS_ADMIN/ALL, host network/PID/IPC, the
  Docker socket or the node's root mounted) and `no-resource-limits`; and `runs-as-root`, `image-not-pinned`,
  `public-ingress` (NodePort, LoadBalancer, Ingress, a Compose port published on every address),
  `secret-in-plain-env`, `secret-in-plain-config`, and `wide-permission`.
- Helm and other `{{ … }}` templates are listed as skipped with the reason, never read as YAML. The YAML reader has
  `parseYamlDocs`: each document of a multi-document file parsed on its own, so one bad document does not hide the
  rest. `readableFile(path, head)` is now given each file's first lines everywhere a repository is read.
- Read on real repositories: kubernetes/examples, GoogleCloudPlatform/microservices-demo, docker/awesome-compose, and
  dockersamples/example-voting-app.
- thunderlang.dev/read has Kubernetes and Docker Compose in its picker, with a sample each.

**Language: the whole application, next two readers: Terraform and Bicep (spec section 12).**
- **Terraform** (`*.tf`): each `resource` is a Resource (`resourceType` exactly as written, `address`
  `azurerm_storage_account.main`) that knows its arguments in words: a value only when the file writes it
  ("Account tier: Standard"), a reference as what it names ("the location of the resource group rg (worked out when
  it is applied)", `computed: true`), nested blocks summed up in a line, `lifecycle { prevent_destroy }` as
  "Protected: Terraform refuses to destroy it". `data` sources are looked up (`existing: true`, "Looks up an existing
  subscription, made elsewhere"); a `module` is a Resource of its own ("Uses the module …"). `count`/`for_each` read
  "One for each item in the setting names"; `count = x ? 1 : 0` reads "one, only when …".
- **Bicep** (`*.bicep`): `resource` (`resourceType` 'Microsoft.Storage/storageAccounts', `address` the symbolic name),
  nested resources (full type, `parent::child`), `existing`, `module`, `for` and `if (…)`, `targetScope`, and
  `metadata description` as the file's purpose.
- **Links** with `file` and `line`: references, `depends_on`/`dependsOn`, and `parent`, as `runs-in`
  (`resource_group_name`, `service_plan_id`, `serverFarmId`, `parent`, …), `reads-from` (data sources, `existing`),
  `sends-to` (workspaces, endpoints), or `uses`; one link per pair, the most exact kind kept. A reference to a resource
  in another `.tf` file of the same folder is linked once the folder is read together.
- **Flow**: one Steps card per file, the order things are created from those links ("Keeps what it made in an Azure
  storage account", "Works in Azure", "Creates the resource group rg", "Creates the storage account main in the
  resource group rg"), with a question for each conditional resource and "For each …" for repeated ones.
- **Permissions** (`role?` added): `azurerm_role_assignment`, Key Vault access policies, AWS IAM (inline JSON,
  `jsonencode`, `aws_iam_policy_document`, trust policies, policy attachments), `google_*_iam_member`/`_binding`,
  and Bicep `roleAssignments` with 48 built-in Azure role ids named (checked against Azure Verified Modules: Owner,
  Contributor, Reader, Storage Blob Data Reader, Key Vault Secrets User, AcrPull, …), followed through a `var`.
  Wide: Owner/Contributor/User Access Administrator on a subscription or management group, `roles/owner` or
  `roles/editor` on a project, IAM `"*"` actions or changes on `Resource: "*"`, AdministratorAccess.
- **Settings** (`default?`, `type?`, `doc?`, `output?`, `from?`, `allowed?` added): `variable`/`param` (sensitive and
  `@secure()` only named), `locals`/`var`, `output`. Text says "given when it is applied (westeurope unless told
  otherwise)".
- **Facts**, new kinds: `storage-public`, `secret-in-plain-config`, `encryption-off`, `wide-permission`; and
  `public-ingress` for security groups, NSG rules, and firewalls open to `0.0.0.0/0`, `*`, or `Internet` beyond ports
  80 and 443 (ICMP reads "ping").
- Small HCL and Bicep parsers (no dependency, linear): strings with `${…}`, heredocs, for expressions, multi-line
  calls and ternaries, safe access and non-null assertions, lambdas, spreads, union types, decorators. A block or
  declaration that cannot be parsed is listed in `unknowns` with its line ("Not read yet: …"); the rest of the file
  is read.
- Read on real repositories: terraform-aws-vpc, terraform-aws-iam, terraform-google-network, two Azure Verified
  Modules for Terraform, two Azure Samples, and all 1,880 Bicep files of the Azure Verified Modules: every file read.
- thunderlang.dev/read has Terraform and Bicep in its picker, with a sample each; a Resource card says when it is
  looked up rather than made, and settings show their default and whether they are secret.

**Language: the whole application, first two readers: Dockerfiles and GitHub Actions workflows (spec section 12).**
- **Dockerfile**: each build stage is a Steps card ("Image build", or "The build stage" for `AS build`), its
  instructions in words: "Starts from node:22-slim", "Starts from the build stage", "Copies package.json and
  package-lock.json into the image", "Installs what it needs (npm ci)", "Sets NODE_ENV to production", "Opens port
  3000", "Runs as the user node", "Checks its health with …", and "Starts with …" last. `RUN` chains are split into
  steps; continuation lines, heredocs, `# escape=`, `--mount=type=secret` (named only) are read.
- The image a Dockerfile makes is a **Resource** (`kind: 'resource'`, `resourceType: 'docker-image'`, `address:
  'image:<path>'`) that knows what it starts from, its working folder, ports, user, start command, health check, and
  its ENV settings (a value only when the file writes it; a secret-looking one is never shown).
- **GitHub Actions**: each job is a pipeline member with a "When" badge (`route: { method: 'When', path }` and
  `when`): "When someone pushes to main", "When a pull request is opened", "When someone starts it by hand", "On a
  schedule: every day at 02:00 UTC" (else "On a schedule (cron …)"), several joined with "or". Steps: well-known
  actions in words ("Gets the code", "Sets up Node 22", "Builds and pushes the image"), others "Uses owner/action";
  `run:` one step per command ("Runs the tests", "Publishes the package to npm"; unknown commands "Runs `…`", kept
  and counted as only named); `if:` as a question (steps sharing one share the question; `always()` is a note, not a
  question); `needs:` as "After the Test job finishes"; a matrix as "For each …"; `environment:` as "Deploys to the
  production environment (it may need someone's approval first)"; `exit 1` as a Stop; `continue-on-error` noted.
  Shell `if`/`for`/`case`, `cmd || { …; exit 1; }`, `[ … ] && cmd`, heredocs, and quotes across lines are read.
- **Permissions** (`model.permissions[]`: `{ id, who, can, on, wide, why?, says, file, line }`): "This workflow can
  read the code"; `write-all` is wide: "can change everything in the repository (wide)".
- **Settings** (`model.settings[]`: `{ name, source, secret, file, line }`): parameters, variables, secrets (named,
  never shown), literals, and values worked out when it runs (`computed: true`). `${{ … }}` reads "worked out when it
  runs"; `${{ secrets.X }}` reads "the secret X".
- **Facts** (`model.facts[]`, what the file says, not advice): `write-all-permissions`, `untrusted-trigger-with-secrets`,
  `action-pinned-by-tag` (GitHub's own actions marked `firstParty`), `image-not-pinned`, `runs-as-root`,
  `secret-in-plain-env`.
- Model, additive: `files[].category` ('application' | 'infrastructure' | 'delivery') and `files[].skipped` (why a
  file could not be read); member kinds `pipeline` and `image-build`; links with `file` and `line`; Big Picture at app
  scope has `resources`, `permissions`, `settings`, and `facts`; Text lists Permissions and Settings.
- `readableFile(path, head?)` (read-repo and /core) says which language or format a file is; `Dockerfile`,
  `Dockerfile.*`, `*.dockerfile`, `Containerfile`, and `.github/workflows/*.yml|yaml` are read, and folder reading
  no longer skips `.github`. Hooks are in place for Terraform, Bicep, Compose, Azure Pipelines, Helm, and Kubernetes.
- A small YAML reader (no dependency): block and flow collections, quoted and plain scalars, block scalars with
  chomping, anchors, comments, and `${{ … }}` kept as text, line by line.
- Grammar: symbols `resource` (a block) and `permission` (a key), a `when` mark, elements Resource, Permission,
  Setting, Pipeline, and Image build, and Dockerfile and GitHub Actions in LANGUAGES. thunderlang.dev draws a
  Resource card, who can do what, and the settings; /read has a Dockerfile and a workflow sample.

**Language: the running system — what happened when it ran, on Thunder's pictures** (`compiler/src/running.mjs`,
`thunder runtime <folder>`). Evidence of a run is placed on the flows Thunder draws, so nobody needs to read a stack
trace or a log in the original language: per question, how many times each side was taken; per Stop, how many times
it happened with the error and message as seen; per ending, how many times it was reached; per action or rule, its
calls, failures, and average and slowest time, a Details sentence ("Ran 201 times; stopped with NotAvailable 117
times (58%), when Is the book's status on shelf? was No"), and the most-taken way through it.
- Sources, each an adapter to one event shape (`{ file, line, kind, side?, error?, message?, value?, durationMs?,
  count? }`): proof by running's records (`fromTrace`), stack traces (`fromStack`: Python tracebacks and pytest
  reports, Node/V8 stacks, Java with its causes, C#, Go panics), structured logs (`fromLogs`: JSON lines with a
  file/line or function, including Python logging, Google Cloud's sourceLocation, ECS, zap's caller; an error's
  stack in a log is read too), and OpenTelemetry spans (`fromOtlp`: OTLP/JSON with `code.filepath` / `code.lineno`
  / `code.function` or the newer `code.file.path` / `code.line.number` / `code.function.name`, with the exception
  event's stack).
- `explainError(model, stack)`: "Failed in Borrow, at “Adds book to student's books” (line 42): AttributeError: …;
  it got there because Is the book's status on shelf? was Yes and Can borrow? was Yes. Called from …". The answers
  that led there come from the flow as drawn and are left out when it does not show them.
- Honest by rule: counts only from evidence (no count is not zero); evidence that cannot be placed is listed as
  **not matched** with the reason (spec section 13).
- `thunder runtime <folder> --traces <file|dir> [--stack <file>] [--logs <file>] [--otlp <file>] [--member <name>]
  [--top n] [--json]` prints the flows in Thunder Text with counts ("- Ask: Is the book's status on shelf?  (line
  36)  (ran 201×: Yes 84, No 117)"), each error explained, and what was not matched.
- Site: Semantic Zoom's School library (Python) example has "What happened when it ran" at Flow and Details, from a
  recorded sample run (labeled as one), with counts beside each node and on each side.
- `modelText(model, id, { note })` and `pathsOf(flow)` are exported for tools that draw their own overlays.

**Language: proof by running — readings are checked against what the code actually does** (`compiler/src/executed.mjs`,
`thunder verify --run <folder>`). Thunder runs real code (the project's own tests, and made-up inputs for functions
that look free of side effects), records which way every question went and how every call ended, and compares that
with the flow it drew: when a condition held, the side Thunder says it takes then must hold the next step that ran;
a loop must reach its "For each" steps; a `return` must be one of Thunder's endings (and a rule's answer the value
given back); a `raise` / `throw` must be a Stop of the error Thunder names; reaching the end needs a "Done". Each
member is **executed**, **contradicted** (with the question, side, and line), ran with nothing to check, or not run;
only a run writes `member.completeness.level = 'executed'` (`markExecuted`). Python uses `sys.monitoring` and `ast`
(3.12+, no packages); JavaScript uses V8's own debugger in-process (`node:inspector`), no dependencies.
- Release gate: `npm run accuracy:gate` (`compiler/scripts/accuracy-gate.mjs`, in CI) fails when a run contradicts
  any reading of the fixtures (or configured repositories), when a step invents a value, or when a question's words
  or Yes/No side disagree with the code's polarity (a new check in `scripts/accuracy.mjs`: 0 of 4,494 questions in
  the eleven audit repositories).
- On real code (docs/accuracy.md): requests, urllib3, and werkzeug run by requests' 619-test suite, and Express by
  its own 1,290 tests. The runs found reader bugs, now fixed: Python `try … else:` and `for` / `while … else:`
  bodies were dropped from the picture; `with self.lock:` (no `as`) read "Calls with" and dropped every step inside
  it; JavaScript `else if` rules were all placed on the first `if`'s line; a SQL CHECK / UNIQUE refusal was quoted as
  if the database said those words (it is now described, not quoted).
- Decision nodes carry `whenTrue` ('yes' | 'no'): the side the code takes when its condition holds.

**Language: review in Thunder** (`compiler/src/review.mjs`, `thunder review`, spec section 14). A pull request is
shown by what it changed in meaning, in plain sentences, so it can be reviewed without reading the code diff.
`thunderReview(oldFiles, newFiles)` (exported from `/core`) pairs each action, rule, and function with its other
version (by file and name, by a name used once, by a route's code, or by meaning) and compares the ways it stops and
when ("Now stops with 403 Forbidden ("forbidden") when the x-admin-secret header is not the ADMIN_SECRET setting"),
rules by running both versions on every edge case ("the limit between Small fee and Big fee moved from 7 to 10 days
late", with the case 8 days late as evidence), inputs, what it gives back, what it changes or reaches (another
service, a payment, stored data), what it relies on, addresses, records and choices, new, removed, renamed, and moved
functions, imports, and code outside every function. Items are ordered risk, meaning, form, each with the before and
after. "Only the form changed" is said only when it is shown (same code apart from spacing and comments, consistent
renames of names the function declares, or a rule with the same answers on every edge case); when Thunder's words
read the same but the code differs, it says "Changed, check". Infrastructure and pipeline files are flagged to check,
not read. `thunder review <base-ref> [head-ref] [--json] [--out file]` reads both versions from git (no network) and
prints Markdown for a pull request comment; `.github/actions/thunder-review` posts and updates one comment with the
adopting repository's own token (not enabled on this repository). Decision nodes in the model now carry `holds` (each
side of a yes/no question as a statement) and Details' `when` entries a `says`, so sentences read "when the header is
not the setting" rather than quoting the question. /zoom shows a sample review computed by the compiler.

**Language: the whole system — calls across files and services** (`compiler/src/system.mjs`, in `/core`). The model
now links a step's call to the member it calls in another file, and a request or event to the code that handles it
(docs/spec.md, "The whole system"):
- **Calls across files**: `links[]` gains `kind: 'uses'` entries with `crossFile: true`, the target's `file`, and the
  calling step's `line`, resolved through imports: JS/TS ES modules, CommonJS, re-exports, tsconfig path aliases,
  workspace packages; Python absolute and relative imports and packages; Go packages (by `go.mod`) and the same
  package's other files; Java/Kotlin imports by class, C# `using`, PHP `use`, Ruby class names, Rust `use crate::`.
  Methods are followed through declared types (fields, constructor parameters, Go receivers), and overloads by how
  many values a call gives. The calling flow node gets `uses` and `usesFile`, so Open → opens the other file.
- **Service calls**: `kind: 'sends-to'` links an HTTP request the library catalog recognizes to the route in this
  repo with the same method and path (path parameters are wildcards; Next.js route files count), an event or queue
  message to its listeners by name, and a Celery `delay()` to its task.
- **Never guessed**: `model.notLinked` lists what was worth linking and could not be, with the reason (external
  package, dynamic import, computed URL, another service's host, no or two matching routes, an interface).
- **Views**: `readLevel(model, 'big-picture')` for the app adds `calls` (which areas call which, with examples) and
  `notLinked`; `uses`/`usedBy` and Details' `reliesOn` say the file, service, and route; Details adds the member's
  `notLinked`. The site shows "How the parts connect", "Open in orders.ts →", and the file of each link.
- `collectReadableFiles(root, { manifests: true })` also returns go.mod, package.json, and tsconfig/jsconfig files.
- On the eleven audit repositories, of calls whose name matches a function defined in another file, 47.8% are now
  linked (55.5% where that name is defined only once in the repo; cobra 82%, gson 75%, formik 61%, requests 51%);
  the rest are mostly calls on values whose type is not written down. Reading time is about 1.04× before overall.
- A comment with an apostrophe (`// it's`) no longer stretches a TypeScript class or interface over the functions
  after it (they were wrongly owned by it, so their ids lose that owner); `lift.mjs` finds line numbers without
  re-splitting the file each time.

**Language: JavaScript functions with no declaration of their own are items.** `exports.x = function`,
`module.exports.x =`, `obj.method = function`, `Foo.prototype.bar = function`, functions inside functions (the inner
`app` in Express's `createApplication`), object-literal methods, and anonymous callbacks (`app.use(function …)`,
`.then(function …)`, block-bodied arrows) are now items, named by what they are assigned to or
`<parent> › callback at line N` (items carry `assignedTo`, `callback`, `passedTo`). Prototype methods belong to their
Thing, and `function Foo()` is how a new Foo starts; an object given two or more methods (`res.json`, `res.send` on
`var res = Object.create(…)`) is a Thing. Declared functions keep their ids, and methods owned by assignment keep the
id they had. Test bodies (`describe`/`it` callbacks) stay tests; Big Picture does not list callbacks on their own.
On Express, the share of recorded executions Thunder can place on a member went from 71.9% to 99.7% (functions
drawn in lib/: 76 to 109).

**Language: no loss — every detail, one level down** (`compiler/src/meaning.mjs`, `compiler/src/round-trip.mjs`).
Thunder's words stay short, and nothing in the code is lost: every step now carries `expr`, its full meaning as a
small language-neutral tree (`thunder-expr-v1`): calls with their whole callee path and every argument, assignments
with their full target (index, keys) and value, conditions with every operand and negation, exact literals, object,
list, and JSX contents, lambdas (their body is the step's children), returns and throws with value, error type, and
message. What the reader cannot read exactly is `{ kind: 'code', text }`, never a guess.
- **Details** gives each step its `expr` and `detail`, what the short words leave out ("Calls save — with: order,
  { validate: false }"). **Thunder Text** stays short; `modelText(model, id, { full: true })` (and Text with
  `{ full: true }`) shows every argument and value. On the eleven audit repositories, a reader can now see 97.4% of
  each step's code names in Details, against 59.5% in the short words (58% before, counted the old way).
- **Code → Thunder → code.** For TypeScript, JavaScript, Python, and Go, a step's tree is written back as code, read
  again by the same reader, and compared: 99.4% of 9,965 steps come back exactly (every step that was read into a
  tree; the rest are kept as code), none different. Conditions and values made of names and operators are also run
  before and after on generated inputs (Node, Python): 1,069 run the same, none differently (Go is compared by tree
  only). `scripts/accuracy.mjs` adds "names kept (Details)" and "steps round-trip exact" (and `--steps` to list
  failures); 465 of 25,864 steps across all eleven repositories are still kept as code (docs/accuracy.md).
- **The faithfulness gate reads the tree**: a condition's negations and comparisons are counted from `expr` when it
  parses (a TypeScript non-null `x!` is no longer a negation; operators inside strings never count), and
  `wordsAgree(step)` checks that every number, quoted text, and "Calls X" in the words is in the tree (no step on the
  eleven repositories disagrees).
- Reader fixes the tree found: `i++` at the end of a line (Go, JavaScript without semicolons) no longer swallows the
  next statement; a one-line `if (x) { a(); }` no longer puts its block in its words; `case A: case B:` keeps both
  labels in its tree; Kotlin `require(x) { "message" }` keeps its message.
- No existing test changed.

**Language: C, C++, and Swift.** Three more languages (with R, shell, and PowerShell below, seventeen in all). `.c` is C; `.cc`/`.cpp`/`.cxx`/`.hpp`/`.hh`/`.hxx`
are C++; a `.h` is C unless it uses classes, namespaces, templates, or `::` (C++ lines kept for C++ callers inside
`#ifdef __cplusplus` do not count); `.swift` is Swift. Pasted code is recognized too.
- **Functions.** C and C++ functions are found by walking scopes (file, namespaces, `extern "C"`, classes): return
  types on their own line, `static`/`inline`, macros, templates, attributes, constructors with initializer lists,
  destructors ("Clean up"), operators, and `Type::method` definitions (with the type they belong to). Swift `func`,
  `init`, subscripts, computed properties, and Vapor routes (`app.get("orders", ":id") { req in … }`,
  `routes.post(…, use: handler)`, literal `grouped(…)` prefixes). Doc comments: C/C++ `/* … */`, `/** … */`, `//`;
  Swift `///`.
- **Steps.** C/C++: `malloc`/`calloc`/`new T[n]` ("Gets memory for 10 books as books"), `free`/`delete` ("Frees buf"),
  `memcpy`/`strcpy`, `memset`, `strlen`, `strcmp(a, b) == 0` ("a is b"), `exit`/`abort`, `cout`/`printf`, `p->x`,
  casts, declarations, designated initializers, labels and `goto`, `do … while` (also Allman style), endless loops,
  range-for, `try`/`catch` by type, `throw;`, lambdas as their own sub-flow, `(void)x` skipped. A C/C++/Swift
  `switch` is one question with one side per case; a C case without `break` says "then carries on into the next
  case". Swift: `guard … else` ("If not: …" with the Stop inside), `if let`/`guard let` ("x is set"), `defer`,
  `do`/`try`/`catch` by type, ranges (`0..<3` is "from 0 to 2"), enum cases (`.cancelled`), trailing closures,
  one-expression bodies, `throw LibraryError.full`, Vapor `throw Abort(.notFound)` ("Fails with 404 Not Found").
  C error returns stay what the code says ("Returns -1 early if fd is less than 0").
- **Things.** C `struct`/`typedef struct` (Data, or a Thing when functions take it first or are named after it, with
  the type's name left out of the label) and `enum` (shared prefixes dropped); C++ `class`/`struct`/`enum class`,
  methods outside the class (also in another file), constructors, initializer lists, and default member initializers
  as starting values; Swift `class`/`struct`/`actor`/`enum`, `extension` methods (also in another file), `init`, stored
  properties with defaults; `protocol` is a contract, not a Thing.
- Measured on redis (227 C files, 5,667 functions, 95% of steps explained), nlohmann/json and fmt (C++, 87–90%),
  Alamofire and vapor (Swift, 92–96%), no reader errors; see the PR. The older readers are unchanged (the switch
  grouping, `blockBrace`, and C/Swift wording run only for the new languages); `readableLanguage(path, source?)`
  takes the source to decide a `.h`.
- thunderlang.dev says fourteen languages; /read has C, C++, and Swift samples, and the Original view colors them.

**Language: C, C++, and Swift held to the faithfulness bar.** The C, C++, and Swift readers pass the faithfulness
gate (`faithful.mjs`, below) and fix every false or misleading reading found in a hand
review of fmt, nlohmann/json, redis, Alamofire, and vapor (see docs/accuracy.md, "C, C++, and Swift"):
- **Text with values inside** (docs/spec.md): `printf`/`fprintf`/`snprintf`, `fmt::print`, `cout <<`, and Swift
  interpolation keep every literal character and show each value as a «placeholder» (`"«dir»/alias «n»\n"`,
  `«x as %5.2f»`); text whose values cannot be paired is shown as code.
- C/C++: macros in front of a return type are dropped (`FMT_CONSTEXPR void` gives back nothing; `auto f() -> T`
  gives back T); `using` is no step; `*p = v` "Writes v where p points"; `+=` of a call adds; bit operators,
  statement ternaries, and multi-name declarations are code; brace-less `for`/`while`/`if` (also nested, `++q`,
  `*err = …`, `[[unlikely]]`) keep their bodies on the right side; `events[i].mask` and `c->argv[j]->ptr` keep their
  index; `p != nullptr` and `!strcmp(a, b)` pass the gate; steps under `#if`/`#elif`/`#else` say which build runs
  them; a block starting `p->x = …` is no longer cut as a lambda parameter; goto labels keep their names.
- Swift: a one-expression body (also a switch or if/else body, a trailing closure, a Vapor route closure) gives back
  its value; `[Character]` parameters are inputs; a String property is never a yes/no rule; `Logger(…)` and Apple C
  functions (`SecPolicyCreateSSL`) are not "writes a message"/"a new"; `guard case .x = event` asks about event;
  `T.self is String.Type`; `for _ in xs`; code shown "not explained" is exactly as written.
- Regression tests: `test/faithfulness-c.test.mjs`, `-cpp`, `-swift` (one per false or misleading sample).

**Language: readings never say something false — the faithfulness gate** (`compiler/src/faithful.mjs`). A hand
review of 330 real readings found 57 false ones; re-graded after this change, none of them is false and 5 of the 53
misleading ones still are (docs/accuracy.md). Before Thunder shows words for code, it checks that the words keep
everything the code says, and shows the code (marked "not explained") when they cannot:
- Conditions are split at their top-level and / or, each part said on its own, and each part must keep its
  negations (`!`, `not`, `!=`, `!==`, `is not`, `not in`, `unless`) and comparisons. Compound questions are asked as
  written, so the Stop is always on the side the code takes (`!body || used` read "Body or used? No: stop"); only
  `unless` flips a whole question. `=== null` and `=== undefined` are told apart, `typeof x === 'string'` reads "x
  is text", PHP `is_string($x)` "x is text", `x instanceof Foo` "x is a Foo"; a question is asked by a rule's name
  only when the condition is that call alone; `!==` before `null` no longer reads "! is empty".
- Values keep what they are made of: `headers[key] = v` reads "Stores v under key in headers" (it read "Sets headers
  to …"); a returned `a && b` / `a || !b` keeps every part; multi-line returns and assignments are read whole (JSX
  `return (` reads "what to show on screen"); `a or b` keeps its fallback; `*=`, `??=`, `||=`, `.=`, Go `append`
  and PHP `$a[] =` say what they do; a call names a value only when it is the whole value; a returned function is
  shown with its steps.
- Nothing is dropped or moved: a loop's `continue` / `break` are steps ("Skips to the next one", "Leaves the loop");
  a brace-less `if (x)\n  stmt;` keeps its statement; a C-like switch is one question with each case's steps under
  it; Go `t.Fatal` / `t.Errorf` and Rust `cfg!` chains are no longer "Checks: …: nothing"; PHP `foreach ($a as $k =>
  $v)` is a loop; `//` or PHP `#` inside a string no longer cuts the body short; a loop whose body could not be read
  is shown as code; a function is drawn as a rule only when every statement was read into it (partial rules hid
  later checks).
- `next(…)` passes an error on only in middleware (`(req, res, next)`, a route, a `NextFunction`); a .NET handler
  delegate "returns the answer of the next handler"; a local helper named `next` is an ordinary call.
- Smaller fixes: messages are no longer cut at an inner quote; PHP `$a.$b` joins text (it read "the a's b"); Go
  `return out, err` gives both back; Kotlin `?: return null`, `require`, abstract `fun`s; Ruby implicit last values,
  `unless`, one-line blocks, `case … else`, `halt`; Python continued lines and bare `self.x`; destructured inputs;
  a fetch `Request` / `Response` is an input outside web handlers.
- Tests updated where they encoded a lossy reading: "whether proxy and …" is now "whether proxy is set and …", a
  keyed store reads "Stores True under arg in seen", a switch's cases hold their steps, and a value keeps its owner
  ("otherwise the order's total", "Sets name to the user's name").

**Language: common libraries, read as what they do** (`compiler/src/libraries.mjs`). Calls into well-known libraries
read with their arguments instead of "Calls find unique": ORMs (Prisma, Mongoose, Sequelize, Django, SQLAlchemy,
Spring Data incl. derived names like `findByEmailAndActive`, Entity Framework, GORM, `database/sql`, ActiveRecord,
Eloquent and Laravel's query builder) say what they find, save, change, or remove and by what ("Finds the user whose
email is email"); HTTP clients name the method and address ("Sends a POST request to …/orders"); tokens, passwords,
caches, Stripe, email, background jobs, JSON, files, and the current time read in words. Go's `if err := <call>; err
!= nil` says what could not be done ("If it cannot find the first user whose id is id").

**Language: inputs and outputs, read accurately.** Measured on eleven open-source repositories with the new
`scripts/accuracy.mjs` (see docs/accuracy.md):
- What goes in says where it comes from: "the x-admin-secret header", "force (in the address)", "email (sent in the
  request)"; Details gives each input's kind when the code says it ("days late: a number", "request: a
  PingResource"). Plumbing is decided by type when there is one, so `Handle(PingResource request, …)` takes a request.
- What comes back: an action's "You get back" lists every way it ends ("success (yes) and data (result); or it stops
  with 403 or 500"); returned objects give their plain values; `yield` gives back one at a time; a redirect and
  `next()` end the response ("Lets the request go on to the next step"); a bare `return` after a Stop is not a new
  ending, and nothing after a Stop on the same path is listed as an ending.
- Conditions: `!==` reads "is not" (it read as a stray "!"); request and settings idioms read as words with their
  names kept exactly (`req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET`: "Is the x-admin-secret header
  the ADMIN_SECRET setting?"); dynamic imports read "Loads … from ./lib/…".
- Text inside quotes is never changed (it was: "charset_normalizer" became "charset normalizer").

**Language: what a handler sends back.** A response sent to the caller reads as what the person gets back:
`res.json(user)` reads "Returns user" (not "Calls json"), `res.status(201).json(order)` "Returns order (201 Created)",
`res.sendStatus(204)` "Returns nothing (204 No Content)", `res.render('profile')` "Shows the profile page", across
Express, Fastify, Koa, Gin, ASP.NET (`Ok`, `CreatedAtAction`, `NoContent`), Spring (`ResponseEntity`), Flask
(`jsonify`), and FastAPI (`JSONResponse`). Their error forms (`NotFound(...)`, `ResponseEntity.notFound()`,
`res.sendStatus(404)`, Gin `c.JSON(http.StatusNotFound, …)`) are Stops with their status. Details lists them under
what it gives back and when.

**Language: R, Bash/POSIX shell, and PowerShell.** Thunder reads three more languages, each by its own module
(`rlang.mjs`, `shell.mjs`, `powershell.mjs`, with a shared phrasebook of command-line tools in `commands.mjs`) into
the same items as every other language.
- **R** (`.R`, `.r`): `name <- function(a, b = 3)` functions; `if`/`else if`/`else`, `return()` guards, and `switch()`
  (with fall-through) as decisions; `for`/`while`/`repeat`, `stop()` as a Stop with its message, `warning()`,
  `message()`, `tryCatch(error =, warning =, finally =)` as handlers and what always runs at the end, the implicit last
  value; `library()` as setup; data-frame pipelines (`|>`, `%>%`) one verb at a time ("Keeps only the rows where total
  is more than 100", "Groups the rows by region", "Sorts the rows by revenue, highest first"); `R6Class`,
  `setRefClass`, and `setClass` as Things; roxygen `#'` as the author's note; plumber `#* @get /path` as actions;
  testthat tests.
- **Shell** (`.sh`, `.bash`, `.zsh`, `.ksh`, and extensionless files with a shell shebang): a linear lexer and parser
  for words, quotes, `$(…)`, heredocs, pipes, `&&`/`||`, `if`/`elif`/`else`, `for`, `while`/`until`, `case`, and
  functions. Tests in words ("the file … exists", "x is empty", "is at least"), `exit N` as a Stop with the message
  echoed to stderr right before it, `set -euo pipefail` as a note, `trap … EXIT` as what runs at the end,
  `cmd || { …; exit 1; }` as a question, and docker, kubectl, helm, az, aws, gcloud, git, npm, curl, and file commands
  by what they do. The script's own top-level code is one item named after the file. Shell has no classes, so it has
  no Things (it is left out of `THING_LANGUAGES` on purpose).
- **PowerShell** (`.ps1`, `.psm1`): `function Verb-Noun` with `param()` inputs and their kinds, comment-based help
  (`.SYNOPSIS`) as the author's note, `if`/`elseif`/`else` and `switch` as decisions, `foreach`, `ForEach-Object`,
  `try`/`catch [Type]`/`finally`, `throw` as a Stop, `Write-Error` as a Stop only when errors are set to stop,
  comparison operators in words, cmdlets by Verb-Noun ("Gets the Azure resource groups"), `class` and `enum` as Things
  and Choices, Pode routes as actions, Pester tests.
- `readableLanguage(path, source)` reads an extensionless file as shell when its first line is a shell shebang;
  `collectReadableFiles` looks at the first bytes of extensionless files to find them.
- Flows link a shell or PowerShell call to the function it runs (by the step's callee). Steps that write a message
  or send an HTTP request get the "send" and "ask" shapes.
- `/read` has R, Shell (Bash), and PowerShell in its language picker, a sample for each, and editor colors for them.
- `scripts/language-audit.mjs` audits tidyverse/dplyr, nvm-sh/nvm, and PowerShell/PSScriptAnalyzer, and leaves a
  script's own functions out of its top-level item's branch count. Spec section 9 updated.

**Language: R, shell, and PowerShell held to the faithfulness bar.** A hand review of 112 samples (nvm, neofetch,
posh-git, PSScriptAnalyzer, httr, dplyr) found 41 readings that stated something false (D) and 14 that misled (C);
after this change the same samples have 0 D and 0 C (each fix has a regression test in
`test/faithfulness-{shell,powershell,r}.test.mjs`).
- **Text with values inside** (spec section 9): quoted text keeps every literal character as written, escapes included,
  and each inserted value is a `«…»` placeholder: a plain variable by its exact name (`"${NVM_DIR}/alias"` →
  `"«NVM_DIR»/alias"`), anything else by its code (`«$1»`, `«${1-}»`, `«$(cat)»`). printf, sprintf, glue/cli, and
  PowerShell `-f` pair each conversion with its argument (`«n as %5d»`); when they cannot be paired the step is shown
  as code. Names are no longer turned into words inside quotes ("{nvm dir}", "{all the inputs}"), and quoted text is
  never rewritten by the possessive pass (`liblzma.so` was "the liblzma's so", `binfmt_misc` "binfmt misc").
- **Shell**: `${x#p}`, `${x%%p}`, `${x/a/b}`, `${x:+w}`, `${#x[@]}`, `${x[0]}` say what they do (they read as the bare
  variable before: "Sets version to version"); `${x:-d}` says "empty or not set", `${x-d}` "not set"; arithmetic
  Thunder cannot say exactly (`?:`, commas inside conditions, `++` in a test) is shown as code; `a && b || c` runs `c`
  when a or b failed (it was read as "only if a worked"); `test && a || b` is if/else only when `a` cannot fail; a bare
  `return`/`exit` gives back the last command's code (it said "success"); `$1`…`$9` inside single quotes (awk) are not
  inputs; `$(< file)` is the file's contents; case patterns are shown as written; `read -a … <<<`, `printf -v`.
- **commands.mjs**: `curl` sends to its address (not to the value after `--max-time`); `wget --version` / `curl
  --version` download nothing; `find` with `!`, `-prune`, `-links` shows those tests as code instead of dropping them;
  `head`/`tail -1` keep their count; `git config name` reads the setting; `choco -s .` is a source, not a package.
- **PowerShell**: conditions pass the faithfulness gate (`-not`, `-ne`, `-and`, `-or` counted like `!`, `!=`, `&&`,
  `||`; otherwise the code is shown); arguments run to the next space (`-Color $s.X` no longer splits); `$_` in a catch
  is "the error"; `$args[0]` is "the first input"; spaces inside quoted text are kept.
- **R**: calls not put into words keep every argument; `names(x) <- v` is "Sets the names of x"; `if`/`switch` used as
  a value sets the variable on each side; `is.null` says "is NULL"; `cat` keeps escapes and its separator;
  `!(a && b)` is shown as code, not rewritten.
- **Shared (ported from fix/faithfulness, identical code)**: `src/faithful.mjs`, `test/faithfulness-helpers.mjs`;
  `askAsQuestion` asks a compound condition as written and a code condition as code, and asks by a rule's name only
  when the condition is that call (`askedByRule`); words inside quotes, code, and placeholders are never the question's
  verb ("^«COMMAND» is an alias for" is not split at "is"). `req`/`app` are plumbing only in web handlers.

# 0.5.11

**Language: choices among cases, and inner functions, in the flow.**
- A `switch`, `when`, `match`, or `select` is one question with one side per case ("Chooses by score": "When it is
  from 90 to 100", …, "Otherwise"), not a yes/no question. Flow blocks carry `cases: [{ label, blocks }]`, the
  decision node `cases: true`, and its edges `label: 'case'` with the case's `text` (the edge into an inner function's steps is `label: 'nested'`). Without an Otherwise, "None of
  these" carries straight on.
- An inner function (a React hook, a callback, `go`/`defer`, a closure) is its own sub-flow (`nested: true` on its
  block): a return or stop inside it ends only that function, and the outer flow carries on from the step. Details no
  longer lists its returns and stops as the outer action's endings.
- Destructured parameters (React props `{ userId, name }`) are what goes in: "user id, name".
- SQL is in the reader on thunderlang.dev/read, with a sample; pasted SQL is recognized.

# 0.5.10

**Language: SQL.** Thunder reads `.sql` files: tables become Data or Things (columns in words, defaults, always
set, what they point to), `CREATE TYPE … AS ENUM` becomes Choices, `CHECK` and `UNIQUE` become rules the table
enforces (a No stops the row: "Refused by the database"), and views, functions, procedures (PL/pgSQL), and triggers
become steps. PostgreSQL first; MySQL, SQLite, and SQL Server where their syntax agrees. Spec section 9 updated.

**Read once.** `readFiles(files)` (in `/core`) reads every file once; `thunderModel`, `thunderizeFiles`, and
`sameMeaning` reuse each file's `reading`, with identical results. On Django (2,376 files) the three stages together
take 3.8 s reading once, against 11.6 s when each stage reads. The model no longer checks every Thing against every
member when it tidies empty classes (13.3 s to 3.4 s on Django). `scripts/perf.mjs` reports both totals.

**Language: Big Picture in all ten languages.** Classes, structs, records, data classes, and enums become Things,
Data, and Choices in Java, C#, Kotlin, PHP, Go, Rust, and Ruby, as they already did in Python, TypeScript, and
JavaScript: what each knows (with its kind in words and how it starts, from constructors, `init`, `__construct`,
`initialize`, Go `NewX`, and Rust `new`), its choices, its doc comment, and what it can do. Go methods with a
receiver and Rust `impl` blocks belong to their type although they are written outside it. Interfaces and traits
are contracts, not Things. Empty error classes are left out (errors show where they stop a path); other empty classes
are records. Checked on cobra, log, MediatR, gson, timber, guzzle, and sinatra.

**Language: Details for web handlers.** What follows a guard that can stop only happens on its other side (an
action's answer says "when Is org set? Yes", not "Always"), and a returned object names its keys ("Gives back org,
repos, avg, and failing").
**Language: functions inside functions, values chosen by if / match / when, do … while, and Go select are read.**
Fewer steps are left as code ("Not read yet"); see docs/language-audit.md for the numbers on 11 open-source repos
(formik branches shown 52% → 91%, timber 73% → 91%, cobra 64% → 81%).
- Functions written inside a function show their own steps under the step that holds them (marked `nested: true`):
  React `useEffect` ("When this first shows on screen, and whenever user id changes", "Every time this is drawn on
  screen", cleanup "When this is taken off the screen, cleans up"), `useMemo` ("Works out full name and remembers
  it until user changes"), `useCallback` and `use…Callback` ("Defines how handle save works"), inner functions and
  Python inner `def`s, Go `go func() {…}()` ("Starts these steps running alongside, without waiting for them") and
  `defer func() {…}()` ("At the end, runs these steps"), Go function values, Java/C# lambdas, Rust closures,
  Kotlin trailing lambdas (`user?.let { … }` reads "If user is set", `repeat(3)` "Repeats 3 times"), Ruby `do`
  blocks, `setTimeout` ("After 300 milliseconds"), event listeners (`Whenever "click" happens`) and promise
  callbacks ("When load is done", "If load goes wrong"). `return new Promise((resolve) => { … })` reads "Makes a
  new Promise with these steps", then "Returns a new Promise". Python `with`, C# `using`/`lock` and Java
  `synchronized` blocks show their steps (Java `synchronized (x) {` is no longer read as a function).
- `if` used as a value reads like a ternary: Kotlin `val x = if (a) b else c`, Rust `let x = if a { b } else { c }`,
  Ruby `x = if a then b else c end` ("Sets bonus to 5 if score is more than 90, otherwise 0"). Over several lines
  it reads as the question, each side ending in "Sets label to …" (or "Returns …" for `return if` / `return when`).
- The arms of a Rust `match`, Kotlin `when`, C# `switch` expression and PHP `match` are read one by one, each with
  what it does: "When it is from 0 to 49" → "Sets label to "fail"", "When it is stop or halt", "Otherwise".
  Kotlin `when (x) {` reads "Chooses by x" (was "If x is set").
- `do { … } while (cond)` reads "Runs once, then repeats while …" with its steps (was "Calls do" plus a separate
  loop with no steps). `for (; i < n; i++)` reads "Repeats while i is less than n".
- Go `select` reads "Waits for whichever of these is ready first" (with `default`: "Checks which of these is ready,
  without waiting"); its cases read "When msg arrives from ch", "When ctx is cancelled or times out", "When 5
  seconds have passed", "When 1 can be sent to out", "If none is ready yet". `fallthrough` reads "Carries on into
  the next case too". `switch {` reads "Checks these cases in order" and its cases "When age is more than 65".
- A `case 'a':` / `default:` label is a statement of its own, so the first step of every case is shown (it was
  folded into the label). A bare `{ … }` block inside a case is read in place.
- Also fixed: a Python comprehension filter (`[i for i in xs if keep(i)]`) is no longer read as "If keep(i)]";
  an `if` condition written over several lines is read whole; `(x as T).then(…)` keeps its parentheses;
  `delete registry[name]` reads "Removes name from registry"; Ruby `else "value"` on one line keeps its value.

# 0.5.9

**Language: redirects say where the person goes.** A redirect reads "Sends the person to /login" (or "the Google
auth URL", "the dashboard page") instead of "Gives back the result of redirect", and has its own step kind,
`redirect` (mark ↪), in `THUNDER_VISUAL.does`. Fastify and Express `redirect`, `Response`/`NextResponse.redirect`,
Flask/Django/Next `redirect(...)`, `HttpResponseRedirect`, FastAPI `RedirectResponse`, Laravel `redirect()->route()`.
Found by OpenThunder on its own sign-in route.

# 0.5.8

**Language: Details is a fact sheet.** `readLevel(model, 'details', id)` now gives what you need to check before you
trust or change an action or rule, computed by the compiler: `stops` (every way it can stop, the error, the message
people see, and the answers that lead there), `givesBack`, `changes` (data it changes, saves, or sends), `inputs`
(and the lines where each is used), `reliesOn` (each rule or action it uses, summarized), for rules `answers` (in
words) and `limits` (exact ranges found by running the rule, e.g. 0 or less: No fee, 1 to 7: Small fee, 8 or more:
Big fee), and `openQuestions` (what the code cannot tell you). The step list stays as `steps`.

**Language: web handlers read the way people think about them.**
- An HTTP error response is a **Stop** with its status and message: Fastify `reply.code(400).send({ error })`,
  Express `res.status(404).json({ message })`, `new Response(..., { status })`, FastAPI `JSONResponse(...,
  status_code=...)`, Flask `return ..., 400` ("Fails with 400 Bad Request: \"slug is required.\"").
- Facts a handler unpacks from the request (`const { slug, name } = request.body`, `req.params`, `request.json()`)
  are what goes in; framework plumbing (`request`, `reply`, a database session) is not.
- A one-line `if (x) return reply.code(400).send({ ... })` keeps its return; the object's braces are not a block
  (found by OpenThunder).
- `if (!slug)` reads "If slug is not set" (asked as "Is slug set?") instead of "If not slug".

# 0.5.7

**Language: the five reading levels.** Every Thunder view now offers the same five levels, in this order, with
these names: **Big Picture** (what is it, and what can it do?), **Flow** (how does it go?), **Details** (exactly
what happens, and how sure is Thunder?), **Text** (what does it say, in words?), and **Original** (which code says
so?). They are separate from **places** (App, Area, File, Thing, Action, Rule): where you are versus how deep you
read. Spec section 3 defines both.
- `LEVELS` (names, questions, what each shows) and `PLACES` in `THUNDER_VISUAL` and `/core`.
- `readLevel(model, level, focus)` in `/core`: exactly what a level shows for the whole app, one Thing, or one action
  or rule. Details lists every step in order with its line, its path (Yes, No, For each), what was not explained,
  and what it uses and is used by. Flow and Details without an action or rule give back the list to choose from.
- thunderlang.dev: the home page and /language lead with "One program. Five ways to read it.", and Semantic Zoom
  (/zoom) uses the same five levels in place of its two separate controls.

# 0.5.6

Entries that change what Thunder means or how it reads (the language itself) start with **Language:**. Courses and
tools built on `@skillstech/thunderlang/learn` should re-check their lessons when one appears.

**The Thunder tutorial ships with the compiler.**
- **`@skillstech/thunderlang/learn`** (`learnThunder()`, ESM and CommonJS, browser-safe):
  `{ schema: 'thunder-learn-v1', languageVersion, lessons }`. Each lesson has its idea, a picture to hold in mind, its
  code, the Thunder Text the compiler gives for it, quick-check questions (`{ prompt, choices, answer, explain }`),
  and open questions (`reflect`). **Every answer is worked out by the compiler from the lesson's code**; if it ever
  differs from what the lesson expects, building the lessons throws, so a release cannot carry a lesson that
  disagrees with its language. thunderlang.dev/learn and the Skills Tech Talk course are built from this export.
- Twelve lessons: the last one became two, **Read a whole app in OpenThunder** (zoom App, File, Action, Rule on a
  small two-door app; what the From code, Author's note, AI summary, and Not read yet labels mean) and **Study your
  own app** (browser, terminal, OpenThunder, and checking a rewrite with `thunder same`).

# 0.5.5

**Complete behavior: every branch, at every depth, in every language.**
- **Fix (serious):** `else`, `elif`/`else if`/`elsif`, `except`/`catch`/`rescue`, and `finally`/`ensure` were
  dropped from steps while the reading still claimed 100% anchored (OpenThunder found it on a real app; the language
  audit found 0% of these branches shown in eleven open-source repositories). They are now read at every depth and
  attached to their `if`/`try`: `otherwise`, `handlers` ("If DatabaseError goes wrong"), `always` ("Always, at the
  end"). Steps are no longer folded below one level. Thunder Text, the model's flow (`blocks` tree plus graph),
  and `modelText` all show them.
- **`scripts/language-audit.mjs`** reads one open-source repository per language and reports branches shown, steps
  explained, and fully explained functions; results in `docs/language-audit.md` (branches shown: 0% → 52–95%).
- Wording fixes found by reading real code: Go `if err := f(); err != nil` ("If f fails"), counted loops, switch
  cases, casts, typed declarations, `foreach`, one-line ifs, Ruby modifiers, predicates, bare-word calls and
  method-level `rescue`, PHP attributes, `isset`/`empty`/`count`, ternaries, comparisons as words, plain names as
  set / not set, declarations without a value, functions stored under a name, pairs in loops.

**Semantic Zoom: one model, read from the big picture down to one decision.**
- **`thunder-model-v1`** (`thunderModel(files)`, `/core`): the one meaning every Thunder view is drawn from.
  Things (classes: what they know and how they start, what they can do), Data (records and choices, from
  dataclasses, pydantic, TypeScript interfaces, enums), members (actions, rules, steps, setup) with their **flow as
  a graph** (start, questions with Yes/No sides, steps, loops, stops, answers), links between members ("Can borrow?"
  opens the rule it uses), source lines, and every unknown. Python and TypeScript classes today; other languages
  list their classes as unknowns and still read every function.
- Questions are asked the positive way round for a kid: `if book.status != Status.ON_SHELF: raise` becomes "Is the
  book's status on shelf?" with the Stop on **No**. A call to a rule is asked by the rule's own name ("Can
  borrow?"). Rules are drawn as questions in order, each Yes giving its answer in words ("No fee"), otherwise the
  fallback.
- **`modelText(model, id)`**: Thunder Text projected from the same model nodes as the picture, so the two views
  cannot disagree.
- **Thunder symbols as data** (`THUNDER_VISUAL.symbols`, `does`, `beginner`): one shape per kind of thing (Thing,
  Data, Record, Choices, Action, Rule, Steps, Starts with, Stop, Not read yet, App, Area, File) as SVG path data, and
  what each step does in a kid's words (find, keep only, check, ask, work out, save, tell someone, ask another
  part, for each, give back, stop). Six are beginner concepts.
- Wording: enum values read as words (`Status.ON_SHELF` is "on shelf"); `book.status = …` is "Sets the book's
  status"; `self.max_books = max_books` is "Keeps the max books it is given"; `student.books.append(book)` is "Adds
  book to student's books".
- Site: `/zoom`, Semantic Zoom (preview): How deep (Big picture, Flow, Details) and Show as (Thunder, Thunder Text,
  Original), breadcrumbs, the symbols, Try the rule (runs the rule as read), and line links to the original.
**A whole app in Thunder Text, and proof that a conversion kept its meaning.**
- **`thunder thunderize <folder | owner/repo> [--out dir]`**: every readable file becomes `<file>.thunder-text`
  beside a mirror of its path, plus `APP.thunder-text`, which reads the app top-down (areas, files, actions,
  rules). Files Thunder cannot read are listed, never dropped. `/core`: `thunderizeFiles`, `thunderizeFile`.
- **`thunder same <old> <new>`**: does new code mean the same as old code, in any languages Thunder reads?
  Functions pair by file stem and name in any convention (`delivery_fee` ↔ `deliveryFee`), falling back to a
  unique name when a file was renamed. Rules are compared by running both on every edge case either one
  mentions, so reordered conditions count as the same and a changed limit is caught with a counterexample in
  plain words ("the total 20, the distance km 0: Free before, Standard after"). Steps are compared in order.
  Code Thunder cannot read is never counted as the same: the verdict is then `partly-checked`. Exit 0 only when
  the meaning is the same. `/core`: `sameMeaning`, `compareRules`, `renderSame`. Docs: `docs/converting-code.md`.

**Thunder V1: the Thunder Programming Language.** Thunder is a human-native programming language: people work
with the meaning of software while machines handle most of the implementation. Specified in `docs/spec.md`,
which replaces the mission specification draft v0.2 (kept as `docs/spec-v0.2.md`).

- **`thunder-visual-v1`**, the visual grammar as data, exported from `/core` and the root: `THUNDER_VISUAL`
  (zoom levels shared with the Thunder Atlas, color roles with green/red reserved for checks that ran, step marks,
  elements with honest status, provenance, the eleven languages with SQL marked planned, and the rules every view
  follows), `visualFor(item)` (how to draw any reader item), `visualForStep(step)`, and `thunderText(item)` (the
  same item as Thunder Text). The picture and the text are rendered from the same reading, so they cannot disagree.
  A decision's docstring becomes its Thunder Text `Why:` line.
- Yes/no properties read as sentences: `if order.refunded` is "If order is refunded"; `!user.isAdmin` is "user is
  not admin". Other property paths are left as they are.
- A test keeps `docs/spec.md` naming every element, step, and language in the grammar.
- **Learn Thunder** (thunderlang.dev/learn), the Thunder V1 tutorial: seven lessons on reading software in Thunder,
  built on one pizza-delivery app and produced by this compiler at build time. `test/learn-thunder.test.mjs` proves
  each lesson shows what it teaches, including identical Thunder for one rule in Python, TypeScript, Java, and Go.
- Wording: a collection used as a condition reads "order has items" / "order has no items"; `total += item.price`
  reads "Adds item price to total"; a parenthesized calculation is a computed value, not "an object".

Read a whole app, not just its decisions: every Python endpoint is found, the author's docstring is kept as the
function's meaning, and steps that only restate code are no longer counted as read.

**Behavior changes**
- **Stricter `stepsReadable`.** A step that only puts the code's syntax into English ("Works out actives", "Returns
  the result of any", "Calls set") is marked `restates: true` and does not count as read. Scores drop where steps
  only restated code. The eleven-repository benchmark is now 78% of 12,087 functions at least 80% readable (was
  94% under the old rule); see `docs/thunder-repo-results.md`.

**Read code in Thunder**
- **Python headers that span lines.** Functions whose parameters run over several lines (FastAPI `Depends(...)`
  one per line, wrapped return types) were skipped; they are read now, with their decorators. Multi-line route
  decorators (`@router.get(\n "/x",\n response_model=...)`) give the route. On a 111-file FastAPI backend: 516 of
  516 functions read (was 254), 234 endpoints recognized (was 19). psf/requests: 708 functions (was 632).
- **The author's words: `doc`.** Each function or decision carries `doc`, the first paragraph of its docstring or
  doc comment (Python docstrings, JSDoc `/** */`, `///`, Go `//`, Ruby `#`), without Args/Returns sections. It is
  the author's statement, kept apart from the reading inferred from code. `thunder read` shows it as "The author
  says".
- **Steps that explain.** Python comprehensions and `any`/`all`/`sum`/`min`/`max`/`len` read as what they produce
  ("the items in rules where active", "whether any item in actives matches"); common shapes read as what they are
  in every language: a new object (`&Command{`, `Server::new(`), a value by key (`headers.get("content-type")`),
  text built from parts, a copy, a conversion, JSON in or out, a boolean result ("Returns whether …"), several
  returned values, `seen[k] = …` ("Records k in seen"), `.set("Key", v)`, `.append(x)`.
- Types: `ReadItem.doc`, `ReadItem.steps`, `ReadStep` (with `restates`) in `read.d.mts`.

Not yet: identifiers in other languages (French names, for example) are still turned into English-looking words.

# 0.5.4

Read code in Thunder, change a rule safely, and review AI changes against stricter evidence. Pre-1.0: the stricter
evidence rules intentionally change some earlier permissive results (see **Behavior changes**). 0.5.3 was not
published to npm; its additions (below) ship for the first time in this release.

**Behavior changes**
- **Strict named evidence.** CLI, MCP, and embedding products share `resolveObligations`. References must match a complete, case-sensitive target (`verify Target` or `verify test Target`). Previously fuzzy references such as `verify Target test` stay declared (unverified) until rewritten. All references must resolve and pass; one passing subset cannot verify a claim.
- **Fail closed on invalid tests.** Evaluation errors cannot pass through a matching fallback. Cases need assertions, empty test blocks fail, and lifecycle paths must be valid unless explicitly asserted invalid. Files with no test blocks still report zero cases; zero cases do not establish verified behavior.
- **Generated code is typed.** `thunder gen` decision parameters now carry types (see Fixes), and Java is written to `<Class>.java` instead of a lowercase file name.

**Read code in Thunder**
- **Thunder steps (`thunder-steps-v1`).** Every function that is not a decision reads as a short list of steps: checks, branches, loops, assignments, and calls (payments, HTTP, database, events, email). Statements Thunder cannot explain are kept as their original code, never guessed. On eleven public repositories (all ten languages), 94% of 12,011 functions are at least 80% readable as steps. `STEPS_SCHEMA` and `classifyStatement` are exported from `/core`.
- **More decisions read.** One-expression boolean functions read as decisions in all ten languages; the statement splitter keeps object literals, destructuring, struct literals, and JSX whole; Python lines with a trailing `#` comment are read (the comment is kept).
- **Lossless anchoring (`thunder-anchor-v1`).** Every step points at its exact place in the file (character offsets; whole lines for PHP), with per-function anchor coverage. `editStep` replaces one step's code and verifies the result by reading it again, keeping a Python or Ruby line's trailing comment. `thunder anchor <file>` shows it. Exported from `/core`: `spanRange`, `spanText`, `replaceSpan`, `editStep`, `anchorReport`.
- **Thunder Text (`thunder-plain-v1`, experimental).** A readable written form of a Thunder rule: `thunder text <file>` (alias `thunder plain`) runs its examples. Exported from `/core`: `parsePlainContract`, `renderPlainContract`, `plainToThunder`, `compilePlainContract`, `previewPlainContract`, `explainPlain`.
- **`thunder repo <owner/repo | GitHub URL | folder>`.** Reads a whole repository in Thunder (shallow clone for GitHub; read-only, nothing is executed) and prints a brief: languages, decisions, functions read as steps, and what was not read.
- **Code reader exports (from 0.5.3).** `readCode`, `readRepo`, `searchRepo`, `groupByFile`, `readableLanguage`, and `promoteDecision` from the main entry and `/core`, plus `collectReadableFiles` from the main entry.
- **Typed round trips.** Thunder source carries input types, so code read into Thunder and generated back keeps `bool` and number types.

**Change a rule (Thunder write, experimental)**
- `thunder write <file> --decision <name> --rule <n|otherwise> --when "<condition>" | --answer <Outcome> [--write]` changes a number, comparison, text value, or answer in a recovered decision and writes only those characters back, keeping the file's own spelling (`===`, `100.0`, `100m`, quote style). It reads the file again and refuses, leaving it untouched, unless the edited rule reads as intended and everything else reads as before. It lists the boundary inputs whose answer changes. Previews by default; `--write` saves. Rule shape changes and new enum names are refused.
- Exported from the package and `/core`: `writeRule`, `changedCases`, `ruleParts`, `joinRuleParts`, `COMPARISON_CHOICES`.

**Review AI changes**
- **Review Atlas.** `thunder atlas --review` executes contract cases, preserves invalid files, ranks evidence gaps, and exports `intent-review-atlas-v1`. `--agent-brief` produces bounded review context; `--strict` exits 2 for incomplete evidence and 1 for evaluated failures. `--openthunder <report.json>` compares source hashes and compiler versions without promoting imported claims. The browser-safe `buildReviewAtlas`, `renderReviewBrief`, and `reviewAtlasExitCode` and the `intent_atlas` MCP tool share this policy. Original graph navigation is unchanged.
- **Browser-safe evidence API.** `/core` exports `runTests`, `TEST_SCHEMA`, and `resolveObligations` with public types. Passing results cover the declared cases, not arbitrary inputs or repository implementation.

**Fixes**
- **`thunder gen` TypeScript, Java, and C# compile.** Decision parameters were untyped (`unknown`, `Object`, `dynamic`), so comparisons such as `amount >= 0` did not compile, and typed Thunder inputs (`amount: number`) produced broken signatures. Each input now gets one type: its declared type, else the decision's example values, else how the rules use it. Python gains type hints. The TypeScript mission stub is named `run` when a decision shares the mission's name (it was a duplicate function), a C# decision named like its class becomes `Decide` (CS0542), and C# numbers are `double`, matching the live C# target. Verified with tsc (strict), javac, and dotnet, and against the Thunder runtime.
- **Python rules with trailing comments.** `if amount <= 100:  # limit` was read as "does more than choose an answer"; it now reads as a rule.

# 0.5.3

- Export the code reader from the package: `readCode`, `readRepo`, `searchRepo`, `groupByFile`, `readableLanguage`, and `promoteDecision` (turn a recovered decision into a contract with edge-case examples) from both the main entry and the browser-safe `/core` entry, plus `collectReadableFiles` (read a folder on disk) from the main entry. Tools such as OpenThunder can now import them directly instead of going through the MCP tool interface. Additive; no behavior changes.

# 0.5.2

- Add named example inputs with one `->` arrow, optional primitive input annotations, and multiline cases in human-v1. Existing tables and canonical source remain supported.
- Generate example tables from the canonical parsed cases; preserve separate contract and application evidence.

# 0.5.1

- Add experimental `thunder human` shorthand, readable decision preview, example tables, and canonical source output.
- Expose the browser-safe human contract helpers through `/core`. Existing grammar and commands are unchanged.
- Preview reports contract examples separately from application evidence.

# Changelog

All notable changes to `@skillstech/thunderlang`. Pre-1.0: the language and the
`intent-graph-v1` schema version independently and may still change.

## 0.5.0

The executable-targets release. Additive; no breaking changes. Minor bump to keep the 0.x lockstep
with OpenThunder.

- **Five more live execution targets.** `thunder test <file> --target <lang>`,
  `thunder conform <file> --run <lang>`, and `--all-targets` now compile and run the
  generated decision in Go, Rust, Kotlin, Scala, and Elixir, grading real executed
  outputs. Live execution now spans nine languages (TypeScript, Python, C#, Java, Go,
  Rust, Kotlin, Scala, Elixir); each target is probed with a real compile+run smoke and
  skips cleanly (never fails) when its toolchain is absent. New aliases: `golang`, `rs`,
  `kt`, `sc`, `ex`. The expression translator gained matching dialects (`exprToGo`,
  `exprToRust`, `exprToKotlin`, `exprToScala`, `exprToElixir`); existing JS/C#/Java/Python
  output is unchanged.
- **Language support matrix.** `docs/language-support-matrix.md` updated: lift (14), gen
  (4), live execution (9).

## 0.4.2

The evidence-graph release. Additive; no breaking changes.

- **Evidence projections.** ThunderLang can now project its verification into `evidence-event-v1`
  events (`evidenceType: tool_verified`) for the shared SkillsTech proof spine: `thunder evidence
  <file>` emits `intent.proven`, and `--evidence` on `verify-diff` / `conform` / `drift` emits
  `change.gated` / `conformance.verified` / `intent.drift`. The projections are pure, offline, and
  safe-derived (ids, hashes, verdicts, diagnostic codes, and counts only , never source, secret
  values, finding messages, or expected/actual values). The library exports `toEvidenceEvents`,
  `verifyDiffToEvidence`, `conformToEvidence`, and `driftToEvidence`. The network push to the spine
  is intentionally left to the org-layer/CI, so the compiler stays offline and deterministic.
- **Fix: `thunder lift` emits canonical `.thunder` drafts** instead of the legacy `.intent`
  extension, on both single-file and repo lifts.

## 0.4.1

The coherence release. Additive; no breaking changes. Version chosen to align with OpenThunder
(TL and OT version in lockstep; OT is moving from 0.4.0 to match).

- **Python code generation.** `thunder gen <file> --target python` now emits a typed Python 3
  scaffold, aligning the codegen axis with live execution. Also fixes a real gap: C# and Java `gen`
  silently dropped `requires` preconditions that TypeScript emitted; they are now emitted as guided
  TODOs.
- **Language support matrix.** New `docs/language-support-matrix.md` documents the three axes , lift
  (14 languages), gen, and live target execution (4) , and makes them discoverable.
- **VS Code extension.** `editors/vscode/` ships a real extension: syntax highlighting and a Language
  Server client that launches `thunder lsp`. Packageable with `vsce package`.
- **Grouped, scannable CLI help.** `thunder --help` is reorganized into nine labeled groups with a
  one-line mental model. Command behavior is unchanged (help text only); a test guards that no
  command was dropped.
- **Verify-real-code loop, productized.** New MCP tools `intent_prove`, `intent_conform`, and
  `intent_drift` let AI agents drive the full loop. `docs/verifying-ai-changes.md` is rewritten as
  the headline workflow (author intent, write code, prove conformance, gate the merge) with a CI
  recipe.
- **Honest Playwright scaffolds.** The exported Playwright tests now open with `test.fixme` so an
  unfilled scaffold cannot pass vacuously.
- **intent-graph-v1 stability policy.** New `docs/schema-stability.md` commits to additive-only type
  sets within v1, an IR version that moves independently of the package, a deprecation policy, and a
  road to 1.0, so consumers like OpenThunder can depend on the IR safely.

## 0.3.0

The 14-language lift release. Additive; no breaking changes. Restores the OpenThunder -> ThunderLang
recover-intent loop for every language OpenThunder's archgraph core can now discover.

- **Kotlin, Scala, and Elixir lift adapters.** `thunder lift` now extracts candidate intent from
  `.kt`/`.kts`, `.scala`/`.sc`, and `.ex`/`.exs`, bringing the supported-language count to 14. A new
  `name: Type` parameter parser handles the JVM signature shape; Elixir joins the dynamic-language set.
- **Fix: repo-walk language coverage.** `LIFT_EXTS` was stale and silently skipped Python, Java, C#,
  Go, C++, PHP, and Ruby during repo/`--all` lifts; it now mirrors the full adapter set.
- **Fix: single-file lift language detection.** `thunder lift <file>` now auto-detects the language by
  extension instead of defaulting to TypeScript, consistent with `--all`/repo modes.

## 0.2.0

The cross-language target execution release. Additive; no breaking changes.

Version alignment: starting with 0.2.0, ThunderLang and OpenThunder version in lockstep, since most
OpenThunder changes land in the language first. (0.1.8 and 0.1.9 were never published; the last
release on npm was 0.1.7.)

- **Live target adapters.** `thunder test <file> --target typescript|python|csharp|java` and
  `thunder conform <file> --run <targets>` now compile the generated decision(s) and execute them
  for real, grading the actual outputs instead of fed results. TypeScript/JS runs in-process,
  Python through `python3`, C# through a throwaway `dotnet` console project, and Java through the
  JDK 11+ single-file launcher (`java ThunderTarget.java`).
- **`--all-targets`.** `thunder test <file> --all-targets` and `thunder conform <file> --all-targets`
  run every target whose toolchain is available in one pass, side by side, and skip any target whose
  runtime is absent (it stays declared in the conformance matrix) rather than failing.
- **Static-target type inference.** Because C# and Java are statically typed, each decision
  parameter's type is inferred from the test-case values it receives (numeric wins, then boolean,
  else string), and each language gets its own equality translation.
- Missing toolchains are detected via cached smoke checks and skipped cleanly, so builds never fail
  for a runtime that is not installed.

## 0.1.8

The testing and verification release. Additive; no breaking changes.

- **Rename to ThunderLang.** Package is `@skillstech/thunderlang`; the CLI binary is `thunder`
  (with `intent` kept as a legacy alias). `.thunder` is the canonical source extension; `.tl` and
  `.intent` are accepted. The Intent Graph and Intent-Oriented Programming vocabulary are retained.
- **`thunder prove`** emits an `intent-proof-v1` artifact with honest per-claim verdicts
  (verified / failed / declared / needs_verification, with `provenBy`). An unverified claim never
  reads as proven.
- **`thunder test --contracts [--strict]`** derives an obligation from every `guarantee` and
  `never`, resolved against the specific test that verifies it. `--strict` fails CI on any unverified.
- **Verification classification**: `verify by assertion|static|runtime|evidence|tool|approval|formal`.
- **Stable IDs**: explicit `id INV-G-001` on guarantees / never-rules (slug fallback).
- **Proof freshness**: the proof records intent hash, compiler, git commit, dependency-lockfile hash,
  and environment; `thunder verify` marks a proof STALE when the implementation, dependencies, or
  compiler move since it was generated.

## 0.1.6

The agent-conformance release (skills on intents + 12-factor scoring). Additive; no breaking
changes to 0.1.5.

### Added

- **12-Factor Agents conformance lens (`twelve-factor-v1`).** Deterministically scores an intent
  against the 13 principles of [humanlayer/12-factor-agents](https://github.com/humanlayer/12-factor-agents),
  which map onto structure IL already models (decisions, lifecycles, typed I/O, approvals,
  errors/handlers, events, a pure runtime). `twelveFactorReport(ast)` returns a per-factor verdict
  (`satisfied` | `partial` | `absent`) with evidence + a fix and a 0–100 score; `twelveFactorSummary`
  is the compact form. `compileSource` and the proof envelope now carry a `twelveFactor` summary, so
  "12-factor compliant" is a claim the proof asserts. CLI: `thunder twelve-factor <file> [--json]`.
  Findings catalogued as `IL-12F-01..13`. Exported from `/core` and the root. See
  `docs/twelve-factor-agents.md` and `examples/TwelveFactorAgent.intent` (scores 100/100).

- **Skills + required-understanding on intents (the Ownership Graph skill↔intent join).** A mission
  can declare the skills it requires and what a human must be able to explain to own it:
  ```
  requires_skill Distributed Systems, Idempotency
  demonstrates understands the idempotency-key guarantee
  ```
  - `requires_skill` (inline comma list or a block) normalizes each skill to the shared
    `skill:<slug>` id (`skillRefId`); `demonstrates` captures the understanding a human must show.
  - New `Skill` node type (`NODE_TYPES` 41 → 42) + `requires_skill` relationship (20 → 21) in
    `intent-graph-v1`; the mission `requires_skill` each Skill node. Additive for consumers that
    subset the vocabulary.
  - The proof envelope and `compileSource` now carry `skillsRequired` (the `skill:` ids) and
    `demonstrates` (prose), so producers drop `skillsRequired` straight into
    `evidence-event-v1` `skillIds[]`, and `demonstrates` feeds Skills Tech Talk defense.
  - `requires_skill` round-trips through `graphToSource`.

## 0.1.5

The rule-catalog namespace release. Additive; no breaking changes to 0.1.4.

### Added

- **Verify-time rule namespace.** The canonical rule catalog is now one id space across two phases:
  author-time (ThunderLang) and verify-time (OpenThunder). Every rule row self-describes `owner`
  (`IL` | `OT`) and `phase` (`author` | `verify`); `RULE_NAMESPACES` declares prefix ownership
  (`IL-*` author, `OT-*` verify); `VERIFICATION_RULES` reserves the OpenThunder verify namespace
  (`OT-REQ-*`, `reserved: true` until OT defines them); `ruleNamespace(ruleId)` resolves owner+phase
  for any id. `ALL_DIAGNOSTICS` now spans both phases. Existing consumers keying on `ruleId` are
  unaffected (owner/phase are additive fields). Exported from `/core` and the root.

## 0.1.4

The shared-skill-namespace release. Additive; no breaking changes to 0.1.3.

### Added

- **Canonical skill id (`skillRefId`).** IL owns the `skill:` id namespace (founder decision
  2026-07-14); SkillsTech Certified owns the curated content (which skills exist, cert->skill maps).
  `skillRefId('TypeScript') -> 'skill:typescript'` , deterministic, browser-safe, so every product
  emits the SAME skill id in Workspace `evidence-event-v1` `skillIds[]`. The id primitive only; the
  curated taxonomy list lands separately (STCE, post-loop). Exported from `/core` and the root.

### Fixed

- **`compileSource` type now includes `origin`.** The `.d.ts` opts omitted `origin?: string` even
  though the runtime has honored it since 0.1.1 (OpenThunder confirmed `origin: 'recovered'`
  round-trips). Typed consumers can now pass it without a cast. Runtime behavior unchanged.

## 0.1.3

The Ownership-Loop seam release. Additive; no breaking changes to 0.1.2.

### Added

- **Canonical intent reference id (`intentRefId`).** The stable string every SkillsTech product
  puts in Workspace `evidence-event-v1` / `proof-bundle-v1` `intentReferences[]` so an evidence
  record or Ownership Proof cites the exact intent it supports:
  `intent:<mission-slug>` (subject-level) and `intent:<mission-slug>@<sha8>` (version-pinned to the
  proof `sourceHash`). Deterministic, browser-safe, exported from `/core` and the root.
- **`compileSource` returns `intentRef` + `intentRefPinned`,** so a producer that already compiled
  a mission gets both ids for free (no need to recompute). This closes the `ThunderLang -> evidence
  model` seam of the Skills Ownership Loop.

## 0.1.2

The ecosystem-consumption release. Additive; no breaking changes to 0.1.1.

### Added

- **Dual CommonJS + ESM build.** The package now ships a `require`-able CommonJS build
  (`dist/index.cjs`, `dist/core.cjs`) alongside the ESM sources, via conditional exports.
  CommonJS consumers (OpenThunder, the SkillsTech backend) can now
  `const { NODE_TYPES } = require('@skillstech/thunderlang/core')` synchronously , no async
  bootstrap, no ESM migration. The runtime stays zero-dependency (esbuild is dev-only).
- **Seeded lift.** `liftSource(source, { seeds })` accepts OpenThunder's `intent-ir-v1` nodes
  (`IntentSeed`: `nodeId` + `evidenceRef` with `signals`, `sourceLocations`, optional
  `ledgerRef` , see `SEED_SCHEMA`). The lifted draft then references OT's exact node ids in
  `maps_to` (no divergent second reading of the repo) and returns the linkage structurally via
  `result.seeds` / `summary.seeds`. Additive: with no `seeds`, output is byte-identical to 0.1.1.
  Exports `SEED_SCHEMA` and `normalizeSeeds` from `/core` and the root.

## 0.1.1

The executable + interoperable release. Everything is deterministic and requires no AI.

### Added

- **Executable intent (the Intent Runtime).** `evaluateDecision` (FIRST-hit, full trace),
  `simulateLifecycle` (walk a state machine, reject illegal transitions), and
  `checkDecisionCases`, powered by a safe no-`eval` expression engine. CLI: `thunder run`,
  `thunder simulate`.
- **First-class tests.** `test` blocks (`case` / `scenario`) inside a `.intent` file, run
  with `thunder test` and `runTests`. The spec proves itself.
- **Outcome contracts.** `outcome_contract` binds an outcome to a target; `evaluateOutcomes`
  and `thunder outcomes` judge it met / missed / pending against a delivery `result`.
- **Full five-profile language.** System (`capability`, `interface`), delivery (`release`,
  `result`, `learning`), and design (`component`, `artifact`) profiles join core, product,
  and experience. Governance (`waiver`) and data privacy (`data`) too.
- **Interop.** Export to DMN, BPMN, NuSMV, JSON Schema, OpenAPI, W3C Design Tokens, and
  Mermaid , the whole Intent Graph as a paste-anywhere diagram , (`thunder export`, `toMermaid`);
  import from DMN and BPMN with a fidelity report (`thunder import`, `importReport`); native
  graph <-> source round-trip (`graphToSource`, `thunder source`); schema migrations
  (`migrateGraph`, `validateGraph`, `thunder migrate` / `validate`); semantic diff + 3-way
  merge (`thunder diff` / `merge`).
- **Editor support.** A Language Server (`thunder lsp`, `startLspServer`) providing
  diagnostics, completion, and hover over LSP; a TextMate grammar
  (`syntaxes/intent.tmLanguage.json`) for syntax highlighting.
- **Onboarding + CI.** `thunder init` scaffolds a runnable starter; `thunder check <dir>`
  recurses and gates a whole repo; `thunder check --json` and `thunder explain <CODE>` for
  tooling; a composite GitHub Action.
- **Style intent.** `style_intent` models brand + visual language as a governed
  Experience-profile extension: design tokens bind to a canonical, lockable address space,
  and `accessibility_target` is always a `proposed` claim (never IL-verified). `analyzeStyle`,
  `styleDiagnostics`, `thunder style`, diagnostics `IL-STYLE-001..005`, canonical `StyleIntent`
  node with graph round-trip. Browser-safe via `/core`. Exports to **W3C Design Tokens
  (DTCG)** via `thunder export --format tokens` / `toDesignTokens` (`intent-design-tokens-v1`)
  and to a ready-to-use **CSS** custom-property sheet via `--format css` / `toCss`. Experiences
  export to a **Playwright** E2E test scaffold via `--format playwright` / `toPlaywright`.
- **Security + type diagnostics.** Deterministic checks for the mistakes prompts ship:
  `IL-SEC-001` (secret-typed field on an event payload), `IL-SEC-002` (API returns a secret
  with no auth requirement), `IL-TYPE-001` (unrecognized, likely-mistyped field type).
  `securityDiagnostics`, `isRecognizedType`, catalog now 49 rules.
- **Human <-> Structured <-> ThunderLang sync (`intent-sync-v1`).** `parseToStructured(source)`
  returns the canonical graph + flat PM fields; `proposeIntent(structured, { base })` regenerates
  ThunderLang source with a reviewable diff, surfaced ambiguities (non-factual nodes), round-trip
  fidelity gaps, and validation , never a silent rewrite. Browser-safe via `/core` (for Studio).
- **Comment-preserving structural editing (`intent-patch-v1`).** `applyEdits(source, edits)`
  applies field-level edits (`setField`, `add/removeGuarantee`, `add/removeNever`,
  `add/removeField`, `setFieldType` on inputs/outputs, `add/removeMetric`, `setMetricField`,
  `add/removeOutcome`, and decision rules `add/removeRule`/`setRule`/`setDefault`) directly to
  the `.intent` source, touching
  only the target lines so comments, formatting, and untouched blocks stay byte-identical. Closes
  the sync fidelity gap: a PM edits fields and IL keeps the comments. Field removal takes the
  field's indented modifiers with it (no orphans). Unmatched/unsupported edits are reported,
  never applied blindly. Browser-safe. Also a CLI: `thunder edit <file> --edits <json|-> |
  --set-goal | --add-guarantee | ... [--write]`.
- **Verify a code change against its intent (`intent-verify-diff-v1`).** `thunder verify-diff
  <intent> --after <code> [--before <code>]` / `verifyDiff()` proves, deterministically and with
  no AI, which of the intent's guarantees/never-rules a change upholds or breaks, and returns a
  gate verdict (PASS/BLOCK, non-zero exit on BLOCK). Blocks on regressions (a claim that held
  before and broke after) and guardrail hits (an added line pushing a never-rule's protected
  secret into a log/response). The keystone of the AI generate-verify loop; honest (catches
  mechanical violations, does not claim to prove correctness).
- **Intent Atlas + lift-all.** `liftAll(source)` / `thunder lift <file> --all` lifts EVERY public
  function in a file into its own inferred mission (not just the first), filtering internal
  helpers (Go: exported-only; Python/Ruby: top-level, non-underscore) , so a whole module reads
  as intent. Powers the Intent Atlas: `scripts/build-atlas.mjs` lifts well-known OSS projects
  (Requests, Express, Flask, gorilla/mux, chi) into a browsable /atlas of ~99 inferred missions.
- **Prompt -> intent (`intent-draft-v1`).** `draftIntent(brief)` / `thunder draft --brief <json|->`
  turns a structured brief into a rigorous, canonically-formatted intent draft PLUS a review
  checklist of what a human must still fill in (unverified guarantee, decision with no default,
  unguarded secret, missing goal). The deterministic half of prompt->intent , an agent produces
  the brief (MCP tool `intent_draft`), IL makes it rigorous, a human approves. Never verified.
  Browser-safe.
- **Runtime enforcement (`intent-guard-v1`).** `compileGuard(intentSource)` / `buildGuard(ast)`
  turns intent into a guard that runs IN the application: `redact(obj)` masks every field the
  intent declares secret (Secret/Password/Token type, pii/sensitive data, or a secret-looking
  name), deeply , so wrapping a logger enforces "never expose the token"; `assertAllowed(name,
  inputs)` runs a declared decision and THROWS `INTENT_GUARD_DENIED` when the intent denies the
  action , the intent's rules become a hard production gate. `thunder guard <file>` previews it.
  Browser-safe.
- **MCP server for AI agents.** `thunder mcp` / `startMcpServer` speaks the Model Context
  Protocol over stdio, exposing ThunderLang as native tools for coding agents (Claude Code,
  Cursor, ...): `intent_verify_diff` (the gate), `intent_check`, `intent_lift`, `intent_run`,
  `intent_test`, `intent_graph`, `intent_explain`. The agent checks its own output against the
  intent before shipping.
- **Hardening: two runtime correctness bugs fixed + a focus performance fix.**
  - *Divide/modulo by zero* leaked `Infinity`/`NaN` into comparisons, so a decision rule like
    `when balance / count > threshold` would silently MATCH when `count == 0` (`Infinity > 1`
    is true). Non-finite arithmetic is now neutralized to `null`.
  - *Unknown-operand ordering* was inconsistent: `null < 1` was `true` (JS coerces `null` to 0)
    while `null > 1` was `false`. Every ordering comparison against an unknown / neutralized
    value (a missing input, a divide-by-zero) is now `false` , unknowns are un-orderable.
  - *Lifecycle initial state* was picked as "the first state with no inbound transition," which
    is wrong when the start state is in a cycle (`A -> B -> A`: every cyclic state has inbound, so
    it wrongly chose an isolated terminal). A legal first transition was then reported invalid.
    The initial state is now the first declared state (the canonical start).
  - *Guard `redact` could stack-overflow* on a pathologically deep object (it was cycle-safe but
    not depth-bounded). Since it runs in production wrapping a logger, it must never throw; it is
    now depth-capped and stops descending instead of crashing.
  - *`buildFocusGraph` was O(n²)* (it scanned every relationship for every frontier node); an
    adjacency index makes it O(n + e). A 20k-node focus dropped from ~2s to ~85ms.
  - Adds `test/hardening-edge.test.mjs`: div/zero + null-ordering regressions, a "parser never
    throws on disruptive input" sweep (empty / CRLF / tabs / unicode / malformed), a CRLF
    value-corruption guard, malformed-`when` and no-default runtime robustness, round-trip
    fidelity, and a performance guard against the O(n²) regression.
- **One compiler for five consumers (universal `@skillstech/thunderlang/core`).** The whole
  analysis layer is now Node-free, so OpenThunder (Node), the `intent` CLI (Node), SkillsTech
  Studio (browser), Repo Mastery (web), and SkillsTech Mobile (React Native) run the SAME
  code, not a fork. The one blocker , `emit.mjs` importing `node:crypto` for SHA-256 , is
  replaced by a pure, dependency-free `hash.mjs` whose output is **byte-identical** to
  `node:crypto` (proven over 2000+ cases + a known-answer test), so every existing proof,
  ledger, and join-key hash is unchanged. `./core` now exports the full compiler surface
  (`parseIntent`, `buildIntentGraph`, `compileSource`, `scanIntent`/`scanProject`, the scan
  query views, `buildAtlas`/`searchAtlas`/`expandNode`, `buildFocusGraph`/`intentBrief`,
  `diffGraphs`, `graphToSource`, `semanticDiagnostics`, `sha256`/`sha256hex`). A conformance
  test statically fails CI if any module reachable from `/core` ever imports a `node:` builtin,
  so the single-source-of-truth boundary cannot silently regress. Only `cli.mjs` and
  `drift.mjs` (the Node entry points) touch the filesystem. The `./core` subpath now ships
  TypeScript types (`core.d.ts`), and `index.d.ts` gained the scan / Fable / scan-query /
  Intent Lens / Intent IR declarations, so the TypeScript consumers (OpenThunder, Repo
  Mastery, SkillsTech) get full types on the shared surface , proven by a TS-consumer
  typecheck in `pack:smoke`. The universal surface is also engine-safe: `hash.mjs` uses a pure
  UTF-8 encoder instead of the `TextEncoder` global, so it runs on Hermes / React Native (the
  conformance test now fails CI if any `/core` module references `TextEncoder`, `Buffer`, or
  another non-guaranteed global, and asserts hashing works with `TextEncoder` deleted).
- **Outcome Truth , guardrails + attribution honesty on outcome contracts.** An `outcome_contract`
  now takes a `guardrails` block (what must NOT regress while the target improves) and an
  `attribution` (directly-measured / correlated / experiment / human / ai / unknown). Two new Fable
  rules: `IL-OC-005` (a target with no guardrail is gameable , Goodhart's law) and `IL-OC-006` (no
  attribution , a metric moving after release is correlation, not proof this feature caused it).
  This closes the "technical success is mistaken for outcome success" gap: an outcome is only
  trustworthy with a guardrail and honest attribution.
- **Change Lens , what a branch/PR changed by meaning (`thunder changes`).** `thunder changes
  <base>..<head>` git-diffs the `.intent` files, semantic-diffs each (reusing `diffGraphs`), and
  reports the behavior-level changes: guarantees / never-rules / invariants / decisions added or
  removed, verification removed, and , crucially , a claim that **lost its verification** is
  flagged as *weakened*. The verdict is `review` when a promise or its proof was removed or
  weakened (or an approval invalidated), else `changed` / `no-semantic-change`; exit non-zero on
  `review` gates a PR. Returns the touched node ids to seed a Focus Graph. `changeReport` is pure
  and exported from `/core` (the CLI supplies the git-diffed graphs).
- **Global `invariant` , system-wide laws (first-class).** `invariant <Name>` declares a law that
  must hold across every feature and service, not just one mission (tenant isolation, financial
  consistency, "every mutation is authorized"). Fields: `statement`, `scope`, `applies_to`,
  `severity`, `because`, `verify`. Compiles to a canonical `Invariant` node in `intent-graph-v1`
  (additive: 40 -> 41 node types), `constrained_by` the mission, with a `verified_by` edge when a
  `verify` is attached; it round-trips through graph -> source. A new Fable rule
  `invariant-without-verification` warns when a global law has nothing proving it (that is exactly
  where a locally-valid change silently breaks the whole system). Invariants count toward
  comprehension C2 (Structured). Example: `examples/TenantIsolation.intent`.
- **Code generation , deterministic TypeScript from intent (`thunder gen`).** `toTypeScript(ast)`
  (`intent-codegen-v1`, no AI) generates what the intent fully determines , typed input/output
  interfaces, and the **decision logic**, which is real and behaviorally identical to the runtime
  evaluator (proven by a property test over the input space) , and leaves honest `TODO` markers
  for business logic, annotated with the guarantees and never-rules the code must uphold. Powered
  by a new `exprToJs` that translates the `when` grammar to correct JS (input-aware, so a bare
  token becomes a string literal). **Now also generates C# and Java** (`--target csharp|java`):
  typed records + the same first-hit decision logic, translated per language (C# `==` + `.Contains`;
  Java `Objects.equals`, so string equality is value-correct, not reference `==`) via a
  dialect-aware `exprToCode`. `thunder gen <file> [--target typescript|csharp|java] [--out <dir>]`. Pure
  / browser-safe and exported from `/core`, so the **playground now has a "Code" tab** , change
  the intent, watch the code change. Completes the round-trip with `thunder lift` (code -> intent).
- **Fix: non-mission root files no longer render as `# null`.** A standalone `event` / `api` /
  `service` / `capability` file has no `mission`, so the graph titled its root node `null` and the
  docs rendered `# null` (visible in the playground's BillingService / API / event examples). A
  new `subjectName(ast)` derives the title from the primary construct, so these render under their
  real name everywhere (graph, docs, generated code).
- **Comprehension Contract , the C0..C7 understanding level (`thunder comprehension`).** The
  measurable backbone of the Software Understanding System: `comprehensionLevel(ast)` scores how
  well-understood a mission is, deterministically, from C0 (Unknown) through C4 (Verified) which
  IL determines on its own, up to C5 (Observed), C6 (Teachable), and C7 (Governed) which a sibling
  lifts by attaching evidence (`--observed` = OpenThunder/runtime, `--learning` = Skills Tech Talk,
  `--governed` = Guardian + Workspace/Ledger). The ladder is cumulative (a gap caps the level) and
  honest (a level is never claimed on evidence IL does not have; each missing rung names its owner).
  `thunder comprehension <file|dir>` reports the level + the next rung; `intent-comprehension-v1` is
  the shared contract every product reads. Pure / browser-safe, exported from `/core`, typed.
- **Intent Lens , Intent Scope + Focus Graph (`thunder focus`).** A Focus Graph is a
  deterministic subgraph of the Intent Atlas around a selected scope (a mission, a feature
  query, or `--nodes a,b`), with every node tagged by WHY it is in focus (selected / governing
  / dependency / dependent / implementation / verification / risk / contextual) and bounded by
  `--depth`. `makeScope` builds the typed Intent Scope; `buildFocusGraph` the subgraph;
  `intentBrief` a deterministic what/who/guarantees/prohibitions/risks/unknowns brief whose
  confidence is the weakest in scope (honesty). `thunder focus <mission|query|--nodes>
  [--depth N] [--json]`. Built over the existing Atlas (not a fork); pure and browser-safe so
  Studio / OpenThunder / RepoMastery / Skills Tech Talk consume one focused representation.
- **Focused scanner queries (`thunder risks | gaps | unverified | coverage | unknowns |
  contradictions`).** Part 3 of the Intent Scanner: one deterministic question each over the
  shared Intent IR + Fable findings (`scan-queries.mjs`, `intent-scan-view-v1`), so a person
  can ask "what is unverified?" or "what is the verification coverage?" without reading the
  whole scan report. `coverage` exits non-zero below 100%; `risks` gates on blocker/error.
  Pure views, exported from the barrel.
- **IR fix: never-rules now carry their verification.** `buildIntentGraph` was emitting
  `verified_by` edges for guarantees but not for attached never-rules, so the shared Intent IR
  under-counted never-rule verification (and coverage read wrong). Never-rules with a `verify`
  now emit `verified_by` edges + a `verify-declared` status, and `graphToSource` round-trips
  them. Every downstream consumer (OpenThunder, RepoMastery) sees never-verification faithfully.
- **Code actions + autocorrect (`thunder code-actions` / `apply-fix`).** `getCodeActions`
  surfaces the available quick-fixes, safety-graded (`safe` autocorrects and `reviewable`
  diagnostic fixes); `autocorrectSource` applies only meaning-preserving header fixes
  (`goals` -> `goal`, `nevers` -> `never`, stray trailing colons), never a valid keyword
  in another context (a decision's `inputs` sub-block is deliberately left alone).
  `thunder code-actions <file>` lists them; `thunder apply-fix <file> [--write]` applies the
  safe ones and reports the reviewable ones for a human. Both pure and browser-safe.
- **Per-audience docs (`thunder docs --lens`).** `thunder docs <file>` renders a mission as
  Markdown; with `--lens <lens>` it produces an audience-specific doc that weaves that
  lens's ThunderLens notes inline next to the input, output, guarantee, or never they
  annotate, and states up front that notes are documentation, not verification. `--out`
  writes the file; otherwise it prints. `renderLensDoc` is pure and browser-safe.
- **Intent AI event sink (`intent-ai-events-v1`).** `thunder ai approve` / `reject` now
  persist their integration event to an append-only JSON-Lines log at
  `.intent/ai-events.jsonl`, so a project keeps a durable audit trail of every AI action.
  `thunder ai events [dir] [--subject <id>]` reads it back (who did what, and the status
  move). Pure sink module (`recordEvent`, `parseEventLog`, `serializeEventLog`, `timeline`),
  exported from the barrel; rejects unknown event types; append-only (never mutates).
- **ThunderLens notes CLI (`intent-notes-v1`).** `thunder notes <file>` lists the compiled
  `note <lens>:` blocks grouped by lens, each with its target (mission / input / output /
  guarantee / never) and source line; `--lens <lens>` filters to one audience and `--json`
  emits the report. Notes explain meaning for a reader and are never verification. Reuses
  the parser's `ast.notes` (no new parsing).
- **Intent Ledger (`intent-ledger-v1`).** `thunder ledger <file.json>` / `verifyLedger`, `record*`,
  `explain` keep the append-only, hash-chained (tamper-evident) record of a project's MEANING and
  history: why a mission was built, who approved it, what was assumed, which inferred intent a human
  corrected, which risks were accepted, what was verified, which lessons went stale. Each entry hashes
  over the previous, so history cannot be quietly rewritten , `verifyLedger` locates any break to the
  entry. Deterministic (caller supplies timestamps). `thunder ledger <file> --subject <id>` explains
  one mission's provenance; exit non-zero on a broken chain. Browser-safe.
- **Intent Simulator (`intent-simulate-v1`).** `thunder impact <base> <proposed>` / `simulateChange`
  estimates a change's impact BEFORE implementation: the deterministic BLAST RADIUS (transitive
  reach over the intent graph, by node type), the risk it would introduce, contradictions, and
  release risk , keeping deterministic dependency impact, rule-derived risk, AI-predicted (null in
  deterministic mode), and unknown impact SEPARATE and honest. Browser-safe.
- **Intent Guardian (`intent-guardian-v1`).** `thunder guardian <before> <after>` / `guardianReport`
  detects drift a change introduced: what changed (semantic diff by mission identity, rename-safe),
  what intent it affects, the risk it INTRODUCED (findings new in after), what must be reverified
  (changed contract elements + invalidated approvals), and which missions' learning is now stale.
  `needs-attention` only on newly-introduced blocking risk; exit non-zero gates a PR. Browser-safe.
- **Intent Scanner + Fable (`intent-scan-v1` / `intent-fable-v1`).** `thunder scan [dir]` runs the
  deterministic pipeline , parse -> Intent IR -> Fable findings -> risk themes , and prints an
  executive/risk summary + a highest-impact remediation sequence; `--json` for the machine report,
  `--ir <path>` to emit the shared Intent IR. Fable is the rule authority OVER the diagnostics
  catalog (risk category + detection strategy + remediation + suppression policy); every finding is
  fully explained (never "AI detected a possible issue"). `scanProject`, `universalPack`,
  `fableRuleFor`, `toFinding` exported. Browser-safe.
- **Repo-wide health report.** `thunder report [dir]` / `buildReport(files)` aggregates every
  .intent file into an intent-health summary (`intent-report-v1`): diagnostics by severity +
  area, top codes, and coverage (guarantees verified, missions with tests, outcomes contracted).
- **SARIF code scanning.** `thunder check <path> --format sarif` emits a SARIF 2.1.0 log
  (`toSarif`), so diagnostics appear natively in GitHub/GitLab code scanning and SARIF-aware
  IDEs , with rule metadata, level mapping, and precise line regions where known.
- **Complete diagnostics reference.** Legacy core check codes (`missing-goal`,
  `guarantee-without-verification`, ...) are now documented and explainable via
  `CORE_DIAGNOSTICS` / `ALL_DIAGNOSTICS`, so `thunder explain <any-code>`, `thunder rules`, and
  `docs/diagnostics.md` cover everything the check pass emits (60 codes). A guard test keeps it
  complete. The canonical `DIAGNOSTIC_RULES` stays IL-* only.
- **Canonical proof envelope (`intent-proof-v1`).** The `.intent-proof.json` shape is now a
  published, versioned contract: `intentProofJsonSchema()` (JSON Schema), `validateProof()`
  (dependency-free structural check), `thunder proof --schema`, and a well-formedness gate in
  `thunder verify`. Browser-safe via `/core` so signers/renderers validate the envelope with
  no Node build.
- **Browser-safe `/core` subpath**, the committed `intent-graph.schema.json`, and the
  canonical 49-rule `IL-*` diagnostic catalog (60 codes documented including legacy core codes).

### Fixed

- Deduplicated `NODE_TYPES` (`Decision` listed twice); orphan-edge fixes (Question,
  transition metadata, capability/pattern/verification links) surfaced by fuzzing; a
  lifecycle transition to an undefined state no longer emits a dangling edge.

## 0.1.0

- Initial release: deterministic parse -> semantic diagnostics -> contract/architecture
  graph -> implementation plan -> proof, plus docs, Mermaid, test plan, the Mission Atlas
  index, IntentLift, and the approve/drift round-trip.
