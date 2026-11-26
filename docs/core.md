# Thunder Core: write a program in Thunder and run it

Thunder Core is the part of Thunder you **write**. You write instructions in plain words, Thunder checks
them, compiles them to Python, and runs them. The generated Python is ordinary code you can read and keep.

```text
  main.thunder ──thunder check──▶ problems, in words, with a line and a code (TC1xx–TC4xx)
       │
       └──thunder build──▶ generated/python/main.py + thunder_runtime.py ──python──▶ output
                                                                         │
                                       a failure names the Thunder line ◀┘ (TC5xx)
```

**Status (v0).** There are two compilation targets: **Python 3.10+** (the default) and **TypeScript** (see
"Compile to TypeScript"). Java, C#, Go, and Rust are planned. They will not be listed as available until they pass
the same tests.
The rules below in "What a value means" are the rules every future target must keep.

## Start

You need Node.js 18+ (for the `thunder` command) and Python 3.10+ (to run what it builds).

```sh
npm install -g @skillstech/thunderlang   # 1.1.0 or later has Thunder Core
thunder doctor              # is everything ready? (Node.js, Python, PATH)
thunder new my-program      # thunder.toml, src/main.thunder, tests/
thunder run my-program      # check, build, and run it
```

`thunder new my-program --run` does both. Inside the folder, the commands need no name:

```sh
cd my-program
thunder run                 # check, build, and run src/main.thunder
thunder test                # run every Test block
thunder check               # only check; nothing is written
thunder build               # write the Python to generated/python/
thunder format --write      # tidy indentation and spacing
```

Outside a project, add `--core` to work with a single file: `thunder run --core hello.thunder`.

`thunder init <Name>` (also written `thunder new --mission <Name>`) still creates an intent **mission** file.
Missions describe what a feature must do. Core programs are code that runs. A `.thunder` file counts as Core
only when it is inside a folder with `thunder.toml`, or when you pass `--core`. Thunder never guesses.

`thunder.toml`:

```toml
[project]
name = "my-program"
version = "0.1.0"

[build]
target = "python"          # the only target in v0
source = "src"
tests = "tests"
output = "generated/python"
entry = "main.thunder"
```

`thunder run` and `thunder test` need Python 3.10 or newer. Set `THUNDER_PYTHON` to choose which one.

## A first program

```thunder
# Lines starting with # are comments.
say "Hello, world!"

Set name to "Ada"
say "Nice to meet you, {name}."
```

Each line starts with an action. A line that ends with `:` opens a block. The lines that belong to it are
indented by two spaces.

## Statements

| Write | Meaning |
| --- | --- |
| `say <value>` (or `print`) | show a value |
| `Set total to 0` | give a name a value (names may be several words: `tax rate`) |
| `Set order's price to $5` · `Set counts at word to 1` | change a field of a record, or an entry in a map or list |
| `Keep tax rate at 7%` | a value that never changes |
| `Increase total by 5` · `Decrease n by 1` | change a number or money |
| `Add order to orders` · `Remove item from cart` | change a list (`Add 5 to total` also works for numbers) |
| `Sort scores` · `Reverse scores` | change a list in place |
| `When <condition>:` (or `If`) … `Otherwise when …:` … `Otherwise:` | choose |
| `For each order in orders:` | go through a list, a map, or text |
| `For each word and seen in counts sorted by value descending:` | go through a map's keys and values |
| `For each n from 1 to 10:` | count, including both ends |
| `Repeat while <condition>:` · `Repeat until <condition>:` · `Repeat 3 times:` | repeat |
| `Stop with "message"` | stop the program with a message (TC507) |
| `<statement>` then `If this fails:` | handle a failure of the statement just above; `{error}` is the message in words |
| `Use csv as csv` | use a Python module (see "Python libraries") |

### Functions

```thunder
To calculate discount:
  Receive total and member
  When member is true and total is at least 100:
    Give 20% of total
  Otherwise:
    Give 0

say calculate discount with 150 and true
```

`Receive` comes first: one line (`Receive total and member`) or one line per input. You can name the kind of
each input: `Receive total as money, member as yes/no`, or `Receive member as yes or no`.

An input can have a default, used when a call leaves it out:

```thunder
To taxed price:
  Receive price and rate (7% if not given)
  Give price + price * rate

say taxed price with 100          # 107
say taxed price with 100 and 20%  # 120
```

A default is a fixed value: a number, money, a percent, text, yes/no, `nothing`, or a kept value. Inputs with a
default come after the inputs without one. A list or a map cannot be a default. In Python such a default is made once
and shared by every call, a classic surprise; give `nothing`, and Set the list inside the function.

A long condition can continue on the next line. Indent it further and start it with `and` or `or`:

```thunder
  When member is yes
    and total is at least 100:
    Give 20% of total
```
`Give` returns a value. `Give back` means the same. Call a function with `<name> with <value> and <value>`.

### Records and rules

```thunder
A Customer has:
  Name is text
  Balance is money
  Never allow a negative balance

Set ada to a Customer with name "Ada" and balance $10
Set ada's balance to ada's balance - $500
If this fails:
  say "Not allowed: {error}"
```

A `Never allow` rule is checked on every change. A change that breaks the rule fails, and the old value stays.

### Tests

```thunder
Test "members spending at least 100 get 20% off":
  Expect calculate discount with 150 and true to be 30
  Expect counts at "c" otherwise 0 to be 0
```

`thunder test` runs every `Test` block in the project and reports `PASS` or `FAIL` with the Thunder line.

## Values

| Kind | Written | Notes |
| --- | --- | --- |
| whole number | `42` | |
| number | `3.5` | an exact decimal, never a binary float |
| money | `$1.50` | exact decimal amount |
| percent | `7%`, `20% of total` | |
| text | `"Total: {total}"` | `{…}` puts a value into text |
| yes/no | `true` / `false` (also `yes` / `no`) | the kind is written `yes/no` or `yes or no` |
| nothing | `nothing` | the absence of a value; test with `is nothing` |
| list | `[1, 2, 3]`, `an empty list` | positions start at **1**: `xs at 1` is the first item |
| map | `an empty map` | `counts at word`; `counts at word otherwise 0` gives a default |
| date | | |
| record | `a Customer with name "Ada" and balance $10` | |

Kinds can be named where needed: `number`, `whole number`, `text`, `yes/no`, `money`, `date`, `list of …`,
`map of … to …`, `optional …`, or a record name. Convert with `as`: `"42" as whole number`,
`row's amount as money`, `rows as list`.

### Expressions

- Arithmetic: `+ - * /` and `mod`, or in words: `plus`, `minus`, `times`, `divided by`.
- Comparisons: `is`, `is not`, `is at least`, `is at most`, `is more than`, `is less than`, `is between 1 and 10`,
  `is in`, `contains`, `does not contain`, `is empty`, `is positive`, `is negative`, `is zero`, `is nothing`.
- Logic: `and`, `or`, `not`.
- Built-ins written `the <op> of <value>`: `sum` (`total`), `average`, `count`, `smallest`, `largest`, `length`,
  `first`, `last`, `words`, `lines`, `lowercase`, `uppercase`, `trimmed`, `keys`, `values`.
- From a list of records: `prices from orders`, `orders where paid is true`, `orders sorted by price descending`.
- `round x` and `round x to 2 places`; `read file "orders.csv"`.

### Text, lists, and JSON

| Write | Gives | Example |
| --- | --- | --- |
| `names joined with ", "` | text | `["Ada", "Grace"]` → `"Ada, Grace"` (every item must be text) |
| `line split at ","` | list of text | `"a,,b"` → `["a", "", "b"]` (empty parts are kept) |
| `the parts of text` | list of text | `"  the cat.  sat "` → `["the", "cat.", "sat"]` (split at spaces; punctuation kept) |
| `date replacing "-" with "/"` | text | `"2026-11-25"` → `"2026/11/25"` (every match) |
| `name starts with "Dr"`, `file ends with ".csv"` | yes/no | |
| `scores sorted`, `scores sorted descending` | list | the values themselves, smallest first |
| `the absolute value of x` | number or money | `-2.5` → `2.5`; `-$4.10` → `$4.10` |
| `the largest of [a, b]`, `the smallest of [a, b]` | the item | |
| `the JSON data in text` | lists, maps, text, yes/no, nothing, numbers | numbers are exact: `0.1` read from JSON plus `0.2` is `0.3` |
| `the JSON text of value` | text | written like Python's `json.dumps`, with numbers as they are held (`2.50` stays `2.50`) |

Each one checks the kinds it works on. When a kind is known in advance, the checker reports the problem before
running: `[1, 2] joined with ", "` is an error. When it is not, the program stops while running with a message in
words, for example `"joined with" joins text, but item 1 is the number 1`. Invalid JSON stops with TC509. Money has
no JSON form of its own: write its amount.

`the words of` splits text at spaces and removes punctuation at either end of each word, so `"dog."` is
`dog`. An apostrophe inside a word stays (`don't`).

These words belong to Thunder and cannot be part of a name: `is are and or not to at of with from where by in as
than the a an plus minus times divided mod true false yes no nothing otherwise sorted descending ascending
equals contains between joined split replacing starts ends`. A yes/no function therefore cannot be called `is adult`. Write `check adult`.

## What a value means (the same in every target)

1. **Division is exact.** `7 / 2` is `3.5`, never `3`. `0.1 + 0.2` is `0.3`.
2. **Money is exact.** Money adds to money and multiplies or divides by plain numbers. `$5 + 1` is an error
   (write `$1`). `$2 * $3` is an error. An average of money keeps every digit; round it to show cents.
3. **Rounding** is half up: `round 2.5` is `3`, and `round $2.345 to 2 places` is `$2.35`.
4. **Positions start at 1.**
5. **Nothing is not zero, not empty, and not false.** Using `nothing` where a value is needed is an error.
   The checker reports it when it can tell in advance (TC305). Otherwise the program reports it while
   running (TC502).
6. **Yes/no is explicit.** Write `member is true`. Each language treats other values as true or false
   differently, so Thunder does not. When a value's kind is not known in advance (an input, a value from Python),
   a condition, `and`, `or`, `not`, or a comparison with `true`/`false` checks it while running: `1` or `"yes"` stops
   with "This needs a yes/no value, but it is the number 1", never quietly counted as true or false.
7. **A Python float is the exact number it is written as.** A float that reaches Thunder (an input, a field of a
   Python object) becomes the exact decimal `19.99`, never `19.989999999999998`, before any arithmetic or comparison.
8. **Nothing is silently changed.** If code cannot do what it says, it fails with a message in words. Thunder
   never substitutes a different behavior.

## Problems and failures

The checker reports problems before anything runs, each with a line and a stable code:

```text
main.thunder, line 1: I don't know what "xs" is.
  Set it first (Set … to …), receive it, or check the spelling.  [TC201]
```

While running, a failure names the Thunder line, and the lines that led to it:

```text
main.thunder, line 3 (reached from line 6): You divided by zero.  [TC501]
```

| Codes | Meaning |
| --- | --- |
| TC1xx | the line does not fit the grammar (indentation, missing words) |
| TC2xx | names: unknown names, fields, records |
| TC3xx | kinds of values that cannot do what the line asks |
| TC4xx | where a statement is allowed (functions, records, `Use`, and tests at the left edge) |
| TC405 | a Python module (`Use`) in a program compiled to a language other than Python |
| TC501 | divided by zero |
| TC502 | nothing used where a value was needed |
| TC503 | a missing map entry or list position |
| TC506 | values of different kinds mixed while running |
| TC507 | `Stop with` |
| TC508 | Python code used through `Use` failed (`Python code used by this line failed: …`) |

## Python libraries

`Use <module> as <name>` gives a program the Python ecosystem. Thunder uses those libraries. It does not
rebuild them.

```thunder
Use csv as csv
Set rows to csv.DictReader(the lines of text) as list
For each row in rows:
  say "{row's name}: {row's amount as money}"
```

Code reached through `Use` is Python. Thunder's rules (exact money, positions from 1) apply to Thunder values,
not inside the library. A failure inside the library is reported against the Thunder line that called it (TC508).

## Run without Python: the Thunder engine

```sh
thunder run --engine thunder          # run the program on the Thunder engine: no Python needed
thunder test --engine thunder         # run every Test block the same way
```

The Thunder engine runs the same checked program the Python compiler uses, so a program means the same thing on
both: the same output, the same errors (code, words, line, and "reached from"), and the same exit status. Every
program in Thunder's Core tests runs on both engines, and the results must match, or the tests fail.

- **Python stays the default** and the production backend: `thunder run` and `thunder build` still compile to
  Python, and the generated Python runs without Thunder.
- **A program that uses a Python module is refused** on the Thunder engine, with the module and the line, before
  anything runs. Thunder never imitates a library: `Use csv as csv` means Python's `csv`, so that program runs with
  Python.
- Calls can go as deep as on Python (about a thousand), and a program that goes deeper stops at the same call with
  the same message.

## Compile to TypeScript

The same program, compiled to TypeScript and run on Node:

```sh
thunder build --target typescript     # generated/typescript/: one .ts per file, the runtime, its types, tsconfig.json
thunder run --target typescript       # run the compiled TypeScript
thunder test --target typescript      # run every Test block as TypeScript
```

Or set it for the project in `thunder.toml`: `target = "typescript"` under `[build]` (output goes to
`generated/typescript` unless `output` says otherwise).

- **The same meaning.** Every Core test program runs three ways: compiled to Python, on the Thunder engine, and
  compiled to TypeScript. The output, every error (its code, its words, its line, and "reached from"), and the exit
  status must be the same, or the tests fail. The runtime written next to the TypeScript (`thunder_runtime.mjs`) is
  the Thunder engine's own value code, so exact numbers, money rounded half up, positions from 1, and yes/no checks
  are not reimplemented a third time.
- **Readable, typed, erasable.** Plain exported functions, records, and kept values; every line ends with
  `// thunder:N`. The code uses only types Node can strip, and `tsc --strict` accepts it (`tsc -p generated/typescript`).
  Values whose kind Thunder checks while running are typed `any`.
- **How it runs.** Node 23.6 and newer run TypeScript directly; Node 22.6 needs `--experimental-strip-types`, which
  Thunder adds. On an older Node, Thunder removes the types with the `typescript` package if it can find it (in the
  project or next to Thunder); otherwise it says what to install. `thunder build` needs neither.
- **No Python modules.** A program that uses `Use csv as csv` is refused for this target before anything is written
  (TC405): Python modules exist only for Python, and Thunder never swaps in a different library. npm libraries are not
  available from Thunder yet.

## Compile to Java

The same program, compiled to Java (17 or newer) and run on the JVM:

```sh
thunder build --target java     # generated/java/: app/<Class>.java per file, app/RunTests.java, the runtime in thunder/
thunder run --target java       # compile with javac and run
thunder test --target java      # run every Test block as Java
```

Or set it for the project in `thunder.toml`: `target = "java"` under `[build]`.

- **The same meaning.** Every Core test program runs four ways: compiled to Python, on the Thunder engine, compiled to
  TypeScript, and compiled to Java. The output, every error (its code, its words, its line, and "reached from"), and
  the exit status must be the same, or the tests fail. The Java runtime (`thunder/ThunderRuntime.java`, JDK only)
  follows the Thunder engine's value code line for line: exact decimals as Python's `Decimal`, money rounded half up,
  positions from 1, strict yes/no, and the same messages.
- **Readable.** One class per Thunder file (`main.thunder` is `app.Main`), with a static method per function, records,
  and kept values; every line ends with `// thunder:N`. Calls go as deep as on Python: the program runs on a thread
  with a deep stack, and a program that goes deeper stops at the same call with the same message.
- **How it runs.** Thunder finds the JDK through `THUNDER_JAVA_HOME`, `JAVA_HOME`, or the PATH; without one it says what
  to install. `thunder build` needs no JDK. The built program runs without Thunder: `javac` the files in `app/` and
  `thunder/`, then `java -cp classes app.Main`.
- **No Python modules.** A program that uses `Use csv as csv` is refused for this target too (TC405). Maven libraries
  are not available from Thunder yet; Thunder never swaps in a different library.

C#, Go, and Rust are planned. Each will be listed as available only once it passes the same tests.

## What the generated Python looks like

Every generated line ends with `# thunder:N`, the Thunder line it came from. `thunder_runtime.py` is written next
to it. It uses only the standard library and implements the rules in "What a value means". The generated program
runs without Thunder installed.

## Reading and writing are the same language: read Python as Core

```sh
thunder read shop.py --as-core          # the same code as Thunder Core you can edit, compile, and run
thunder read shop.py --as-core --json   # plus, per function: exact or not, each line not translated and why
```

```text
  shop.py ──reader──▶ meaning tree ──--as-core──▶ Thunder Core ──compile──▶ Python ──run next to shop.py──▶ same?
```

The Core is printed from the reader's **meaning tree**, never from its English sentences, so each line means what
the code means:

```python
def total_paid(orders):            To total paid:
    total = 0                        Receive orders
    for o in orders:                 Set total to 0
        if o.paid:                   For each o in orders:
            total += o.price           When o's paid is true:
    return total                         Increase total by o's price
                                     Give total
```

**Never a guess.** A line Core cannot say with the same meaning is not rewritten into something close. It is
marked, and it becomes a line that stops if it runs:

```text
To with_tax:
  Receive orders
  # Not translated (line 11): Python round() rounds halves to even; Thunder rounds half up
  Stop with "Line 11 of the Python was not translated: return round(total_paid(orders) * (1 + TAX), 2)"
```

A function with such a line is **not safe to edit**. `--as-core` says so on stderr, and `--json` gives
`exact: false` with each line and its reason. Today it refuses these, among others:
- `split(sep, maxsplit)`, `replace(a, b, count)`, `startswith((…))` with a tuple, and `max(…, key=…)`.
- `round()`: it rounds halves to even.
- `//`: floor division.
- `try`/`except` that names its error kinds.
- List positions it cannot tell from map keys.
- Bytes.
- Tuples outside `in`.
- Decorators.
- A function passed as a value: in Core, writing a function's name calls it.
- Special methods (`__len__`, `__eq__`, `__repr__`, …), inner functions, and methods of nested classes.

**Methods.** A method of a class becomes a Core function that receives the object first. Core has functions and
records, not methods:

```python
class Account:                          To Account withdraw:
    def withdraw(self, amount):           Receive self and amount
        if not self.can_withdraw(amount):    When not ((Account can withdraw with self and amount) is true):
            raise ValueError("insufficient")   Stop with "insufficient"
        self.balance -= amount             Set self's balance to self's balance - amount
```

`self.can_withdraw(x)` is printed as `Account`'s own `can withdraw`. That is written down as an assumption: Python
picks the method when it runs, so a subclass could replace it. A static method is printed as a plain function.
`__init__` is printed as `<Class> set up`. A `self.other()` that this class does not define (it may come from a
parent class) is not translated.

**Assumptions are written down, never hidden.** Python `if member:` is printed as `member is true`. The compiled
Core checks that `member` really is yes/no when it runs (rule 6 above). `xs[0]` is printed as `xs at 1`, and the
output notes that it reads `xs` as a list.

**The output always compiles.** A function whose printed Core would not compile is shown as comments under one
`Stop with` line, and it is reported as not translated.

**Checked by running.** [core-read-write.md](./core-read-write.md) prints 20 small Python functions as Core,
compiles each one, and runs it next to the original on sample inputs. It compares the value given back, what was
printed, and any error. The page also measures how far the reader's English (Thunder Text) is from Core.
Python is the only source language for `--as-core` so far.

## Examples

`examples/core/` holds the demo programs: `hello`, `discount`, `savings`, `word-count`, `csv-summary`, and
`trading-journal`. Run them with `thunder run examples/core/<file>.thunder`, and test them with
`thunder test examples/core`.
