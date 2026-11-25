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

**Status (v0).** There is one compilation target, **Python 3.10+**. Other targets are planned. They will
not be listed as available until they work.
The rules below in "What a value means" are the rules every future target must keep.

## Start

```sh
thunder new my-program      # thunder.toml, src/main.thunder, tests/
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

`the words of` splits text at spaces and removes punctuation at either end of each word, so `"dog."` is
`dog`. An apostrophe inside a word stays (`don't`).

These words belong to Thunder and cannot be part of a name: `is are and or not to at of with from where by in as
than the a an plus minus times divided mod true false yes no nothing otherwise sorted descending ascending
equals contains between`. A yes/no function therefore cannot be called `is adult`. Write `check adult`.

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
   differently, so Thunder does not.
7. **Nothing is silently changed.** If code cannot do what it says, it fails with a message in words. Thunder
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

## What the generated Python looks like

Every generated line ends with `# thunder:N`, the Thunder line it came from. `thunder_runtime.py` is written next
to it. It uses only the standard library and implements the rules in "What a value means". The generated program
runs without Thunder installed.

## Reading and writing are the same language

Thunder's reader turns existing code into Thunder Text. The goal is for that text to be Core you can edit and
compile again. [core-read-write.md](./core-read-write.md) measures how close the reader's output is today, and
lists the remaining differences.

## Examples

`examples/core/` holds the demo programs: `hello`, `discount`, `savings`, `word-count`, `csv-summary`, and
`trading-journal`. Run them with `thunder run examples/core/<file>.thunder`, and test them with
`thunder test examples/core`.
