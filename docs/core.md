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

**Status (v0).** There are six compilation targets: **Python 3.10+** (the default), **TypeScript**, **C#**, **Java**,
**Go**, and **Rust** (see "Compile to …" below for each), plus the **Thunder engine**, which runs a program directly.
Every Core test program gives the same output, errors included, on all of them; a target is listed only once it does.
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

Outside a project, a single file works too: `thunder run hello.thunder`.

`thunder init <Name>` (also written `thunder new --mission <Name>`) still creates an intent **mission** file.
Missions describe what a feature must do. Core programs are code that runs. Thunder tells them apart by a fixed
rule, never by guessing: a file inside a folder with `thunder.toml` (or run with `--core`) is Core; otherwise a file
whose first line starts a mission (`mission Checkout`, `service Billing`, …) is a mission, and any other file is
Core. A file that could be either, like `use csv` alone, stays a mission; add `--core` for it. `--mission` always
reads a file as a mission. See [The Thunder language](/docs/language).

`thunder.toml`:

```toml
[project]
name = "my-program"
version = "0.1.0"

[build]
target = "python"          # or "typescript", or "go"
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
| `Use csv as csv` | use a Python module (see "Libraries") |
| `Use "date-fns" from npm as dates` | use an npm package, when compiling to TypeScript (see "Libraries") |

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

### Records and calls written as blocks

A record with many fields is easier to read as a block: end the line with `:` and give one `field: value` per line.

```thunder
A Trade has:
  Symbol is text
  Quantity is whole number
  Buy price is money
  Sell price is money

Set first trade to a Trade:
  symbol: "ACME"
  quantity: 10
  buy price: $20.00
  sell price: $40.00
```

It is the same program as `Set first trade to a Trade with symbol "ACME" and quantity 10 and …`. It works wherever a
record ends the line: `Set … to a Trade:`, `Give a Trade:`, `Add a Trade to trades:`, `Expect a Trade to fail with
"…":`, and as the last value of a call (`say calculate profit with a Trade:`).

A function can be called the same way, with its inputs by name, in any order. An input with a default may be left out:

```thunder
To taxed price:
  Receive price and rate (7% if not given)
  Give price + price * rate

Set total to taxed price:
  price: $100
  rate: 20%
```

Names work only for a function whose inputs are known in the program (or in the project's `src/`). Each line must be
`name: value`; a name given twice, a field the record does not have, an input the function does not receive, or a
missing input that has no default is reported with its line and, when it is close, the name you probably meant
(TC113 to TC117, and TC206).

### Tests

```thunder
Test "members spending at least 100 get 20% off":
  Expect calculate discount with 150 and true to be 30
  Expect counts at "c" otherwise 0 to be 0
```

`thunder test` runs every `Test` block in the project and reports `PASS` or `FAIL` with the Thunder line.

## Screens: build an app

A `Screen` says what a person sees and what each button does. `thunder run` shows the first screen as an outline;
`thunder build --target react` writes it as a React app.

```thunder
An Item has:
  Name is text
  Price is number

Screen Shop:
  Remember cart as a list of Item, starting at []
  Remember name as text, starting at ""
  Remember price starting at 0
  Show a heading "Shop"
  Show a text box "Name" for name
  Show a number box "Price" for price
  Show a button "Add" (off when name is empty):
    When pressed:
      When price is at most 0:
        Stop with "The price must be more than 0"
      Add an Item with name name and price price to cart
      Set name to ""
  Show Cart:
    items: cart

Screen Cart:
  Receive items as a list of Item, title as text ("Your cart" if not given)
  Show a heading: title
  When items is empty:
    Show "Your cart is empty"
  Otherwise:
    Show a list with each item in items:
      Show a row:
        Show item's name
        Show item's price
  Show a button "Back" that opens Shop
```

A screen has three parts, in this order:

| Line | Meaning |
| --- | --- |
| `Receive items as a list of Item, title as text ("Your cart" if not given)` | what the screen that shows it gives it (its inputs), as in a function |
| `Remember coupon as text, starting at ""` | a value the screen keeps while it is shown, and where it starts |
| `Show …` and `When … :` | what it shows, from top to bottom |

What a screen can show:

| Line | Shows |
| --- | --- |
| `Show "Your cart is empty"`, `Show "Total: {total}"`, `Show item's name` | text (any value, written as in `{…}`) |
| `Show a heading "Shop"`, `Show a heading: title` | a heading |
| `Show a list with each item in items:` | the lines under it, once for each item |
| `Show a row:` | the lines under it, side by side |
| `Show a text box "Coupon code" for coupon` | a box that changes a remembered text |
| `Show a number box "Price" for price` | a box that changes a remembered number |
| `Show a button "Add" (off when name is empty):` then `When pressed:` and steps | a button and what it does |
| `Show a button "Back" that opens Shop` | a button that opens another screen |
| `Show Cart:` then `items: cart` (one `input: value` line each) | another screen, inside this one, with its inputs |
| `When … :`, `Otherwise when … :`, `Otherwise:` | some lines only when a condition is yes |

What happens, exactly:

- **A press changes everything or nothing.** The steps under `When pressed:` are ordinary Thunder steps (`Set`,
  `Increase`, `Add … to`, `When`, `For each`, calls, `Stop with`). They run on copies of the screen's remembered
  values. If every step works, the screen keeps the new values. If a step fails (or `Stop with` stops it), nothing is
  kept and the screen says why, under what it shows: `The price must be more than 0`.
- **Typing** sets the box's value. A number box keeps a number: text that is not one (or a decimal in a whole-number
  box) leaves the value as it was, and the screen says why.
- **An off button** does nothing when pressed.
- **Opening** a screen (`that opens Shop`, or the step `Open Shop` after other steps) shows it in place of this one.
  Its remembered values start again. A screen that is opened is given no inputs, so its inputs need defaults (TC214).
- **Inputs can't be changed** by the screen that receives them, and neither can the items of a list it shows (TC213):
  remember a copy and change that.
- **Each shown screen remembers its own values,** by its place: two `Card` screens in a list each have their own. A
  screen that stops being shown (its `When` became no) forgets its values.
- **The first screen is where the app starts,** so it needs no inputs.
- `Say`, `Give`, and `Expect` can't run when a button is pressed (TC407): a screen shows things instead.

`thunder run` prints the first screen as it first appears:

```text
Screen "Shop"
  Heading: Shop
  Text box "Name": ""
  Number box "Price": 0
  Button "Add" (off)
  Screen "Cart"
    Heading: Your cart
    Your cart is empty
    Button "Back"
```

### Build it as a React app

`thunder build --target react` writes `generated/react/`: `<program>.tsx` (one function component per screen, each
`Remember` a `useState`, each `When pressed` a function), `main.tsx`, `index.html`, `thunder_runtime.mjs` (the
Thunder engine's value and screen code, so the app means exactly what the engine means), `thunder.css` (calm defaults,
light and dark), `package.json`, and `tsconfig.json`. Run it with `cd generated/react && npm install && npm run dev`
(Vite), and check its types with `npm run typecheck`. Every line ends with its Thunder line, `// thunder:N` or
`{/* thunder:N */}`. A screen that can't be shown says why, with the line, as `thunder run` does.

The React app and the Thunder engine are checked against each other: for every screen program in the tests, React's
server-rendered HTML is read back and must be the engine's screen, and the same presses and typing must give the same
screen after every step (`compiler/test/core-react.test.mjs`). Screens build only for React: building a program with
screens for another target is refused with TC406, as is a React build of a program with no screen.

## The Thunder style (`thunder format`)

There is one way to write Thunder, and `thunder format` writes it. It should read well in plain text: in a terminal, a
diff, or on paper, with no colors.

- **Two spaces per level.** No tabs, no trailing spaces, at most one blank line in a row.
- **Short stays short.** A record built on one line keeps that line while it has 1 to 3 fields and fits in 100 columns.
  With 4 or more fields, or past 100 columns, it becomes a block of `field: value` lines.
- **Long conditions wrap before `and` / `or`**, one part per line, indented two spaces:

  ```thunder
  When member is yes
    and total is at least 100
    and day is "Friday":
    Give 20% of total
  ```

- **Space between ideas.** One blank line around every function (`To`), record (`A … has`), and `Test` block. A comment
  right above one stays with it.
- **One spelling for each thing.** `When`, `Otherwise`, `Set`, `Give`, `Receive`: Thunder keeps a small vocabulary on
  purpose, so every program reads the same way.

Formatting never changes what a program means: a block is the same program as the one-line form, and a wrapped
condition is joined back into one line when it is read. Comments stay where they are, a program already in the Thunder
style is left exactly as it is, and formatting twice gives the same text as formatting once. The tests format every
Core program the examples, these docs, and the Core tests use, and check each gives the same program and the same
output.

```sh
thunder format              # print the formatted program
thunder format --write      # save it
thunder format --check      # exit 1 if a file is not in the Thunder style (for CI)
```

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

## Either/or data: one of several alternatives

Some values are one of a few things: a payment is successful, declined, or pending, and each has its own details.
Write the alternatives once, one per line, each with its fields:

```thunder
A Payment is one of:
  Successful with amount as money
  Declined with reason as text
  Pending

To describe:
  Receive payment as Payment
  Depending on payment:
    Successful:
      Give "paid {payment's amount}"
    Declined:
      Give "declined: {payment's reason}"
    Pending:
      Give "waiting"

say describe with a successful Payment with amount $5     # paid $5.00
say describe with a pending Payment                       # waiting
```

- **Build one** by naming the alternative: `a successful Payment with amount $5`, `a pending Payment`. Each
  alternative needs its own fields and no others.
- **Depending on** has one case per alternative. One left out is a problem at the `Depending on` line, naming what is
  missing (TC215), so adding an alternative later shows every place that must handle it. `Otherwise:` covers the
  alternatives not listed, when that is what you mean.
- **A field only some alternatives have** is read where Thunder knows which one it is: inside its case, or under
  `If payment is successful:`. Anywhere else it is a problem that says how to check first (TC216).
- **Ask which it is** with `payment is successful` or `payment is not successful`. `payment's which` is its
  alternative as text (`"successful"`); it can be read, never changed.
- **Recursive data.** An alternative can hold the same data type, so lists and trees are written directly:

  ```thunder
  A Tree is one of:
    Leaf
    Branch with left as Tree and value as number and right as Tree

  To total:
    Receive tree as Tree
    Depending on tree:
      Leaf:
        Give 0
      Branch:
        Give (total with tree's left) + tree's value + (total with tree's right)
  ```

- **Every target.** Underneath, a data type is a record with `which` and each alternative's fields, so Python, the
  Thunder engine, TypeScript, C#, Java, Go, and Rust run it the same way. `say payment` shows that record:
  `Payment(which: successful, amount: $5.00, reason: nothing)`.

## Saved data: stored lists

A stored list keeps its items between runs. Declare it once, at the left edge, with the record it holds:

```thunder
A Habit has:
  Name is text
  Streak is whole number

Store habits as a list of Habit

To start habit:
  Receive name
  Add a Habit with name name and streak 0 to habits

When the count of habits is 0:
  Start habit with "walk"
Set walk to habits at 1
Set walk's streak to walk's streak + 1
say "walk streak {walk's streak}"     # 1, then 2, then 3 on the next runs
```

- **It is a list.** Everything a list does works on it: `where`, `sorted by`, `the count of`, `Add … to`, `Remove … from`,
  changing a record's field. Every function can see it, like a kept value; only its items change, never the name.
- **When it is saved.** It is filled from its file when the program starts and saved when the program finishes. A
  program that stops with a problem saves nothing, so the file is never left half changed.
- **Where.** `data/habits.json`, next to the program (the project's folder). It is plain JSON, one object per
  record, each field written by its kind: whole numbers as numbers, numbers and money as exact text (`"1.50"`),
  dates as `"2026-11-27"`, yes/no as `true`/`false`, nothing as `null`. A file Thunder cannot read is reported at the
  `Store` line with the item and field (TC509), nothing runs, and the file is left as it was.
- **Tests** start with an empty store and never save, so `thunder test` never touches your data.
- **Targets.** Python, compiled TypeScript, and the Thunder engine read and write the same file, byte for byte, so
  a program can move between them. Other targets refuse a stored list for now (TC410). In the browser playground a
  stored list lives only while the page is open.
- **What can be stored.** Records whose fields are whole numbers, numbers, money, text, yes/no, dates, or `optional`
  ones of those.

## Drafts with holes

Not sure yet what goes somewhere? Leave a hole: `?`, or `?number`, `?money`, `?Habit` with the kind written right
after it. A program with holes is a draft. Thunder checks everything around the holes, then says what each one
needs and what you already have that fits. It never chooses for you.

```thunder
To line total:
  Receive price as money and quantity as whole number
  Give ?money
```

```
main.thunder, line 3: This is a hole: it needs money, and Thunder won't choose it for you. Fill it in before the program can run.
  Here, money could come from: price (input).  [TC120]
thunder check: a draft with 1 hole to fill in, and nothing else to fix.
```

- **What it needs.** The kind you write after `?`; without one, the kind expected where the hole stands (a
  function's input, a record's field); otherwise any value.
- **What fits.** Inputs, values set earlier, kept values, stored lists, and functions that give that kind, by name.
  Only what really is that kind: a whole number can stand for a number, not the other way round, and money is not
  a number.
- **Nothing else breaks.** A hole has its kind, so the rest of the line is checked as if it were filled in.
- **A draft never runs.** `thunder run`, `thunder test`, and `thunder build` stop and say how many holes are left.
  A problem next to a hole is still a problem, and the summary counts the two apart.
- **For tools.** `compileCore` gives `holes` (each TC120 diagnostic, with `hole: { col, needs, written, available }`)
  and `draft` (true when holes are the only problems); `thunder check --json` includes the same `hole` data.

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
| TC113–TC117 | a record or a call written as a block: a line that is not `name: value`, a name given twice, an unknown or missing input, or no record or call to give the lines to |
| TC2xx | names: unknown names, fields, records |
| TC3xx | kinds of values that cannot do what the line asks |
| TC4xx | where a statement is allowed (functions, records, `Use`, and tests at the left edge) |
| TC405 | a Python module (`Use`) in a program compiled to a language other than Python |
| TC408 | an npm package (`Use "…" from npm`) in a program compiled to a language other than TypeScript |
| TC409 | a .NET library (`Use "…" from .NET` or `from NuGet`) in a program compiled to a language other than C# |
| TC410 | a stored list (`Store … as a list of …`) in a program compiled to a language other than Python or TypeScript (the Thunder engine runs it too) |
| TC120 | a hole (`?`, `?number`) in a draft: the program does not run until it is filled in (see *Drafts with holes*) |
| TC118, TC119 | a line in a `Screen` that a screen can't show, or `Receive` / `Remember` below what it shows |
| TC215 | `Depending on` leaves out an alternative of the data type, and has no `Otherwise` |
| TC216 | a field only some alternatives have, read where the alternative is not known |
| TC217 | an alternative the data type does not have, or a value built without saying which alternative it is |
| TC212–TC214 | screens: an unknown screen, an input changed by the screen that receives it, an input missing or unknown |
| TC406, TC407 | screens built for a target other than React (or React with no screen), and a step that can't run on a press |
| TC501 | divided by zero |
| TC502 | nothing used where a value was needed |
| TC503 | a missing map entry or list position |
| TC506 | values of different kinds mixed while running |
| TC507 | `Stop with` |
| TC508 | library code used through `Use` failed (`Python code used by this line failed: …`, or `JavaScript code …`) |

## Libraries

Thunder uses the libraries of the language it compiles to. It does not rebuild them, and it never swaps one library
for another: a program that uses a library is built only for the language that library belongs to.

| Library | Written | Built for |
| --- | --- | --- |
| Python module | `Use csv as csv` (or `Use csv from Python as csv`) | Python, the default target (TC405 elsewhere) |
| npm package | `Use "date-fns" from npm as dates` | TypeScript, `--target typescript` (TC408 elsewhere) |
| .NET type | `Use "System.IO.Path" from .NET as paths` | C#, `--target csharp` (TC409 elsewhere) |
| NuGet package | `Use "<type>" from NuGet "<package>" version "<v>" as <name>` | C#, `--target csharp` (TC409 elsewhere) |

Maven, Go modules, and crates are not available from Thunder yet.

### Python libraries

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

### npm packages

Install the package in the project the usual way (`npm install date-fns`), then name it in quotes and give it a name
to use in Thunder:

```thunder
Use "date-fns" from npm as dates

Set start to date "2026-11-27"
Say dates.format(dates.addDays(start, 3), "yyyy-MM-dd")    # 2026-11-30
Say dates.isWeekend(start)                                 # no
```

Run it with `thunder run --target typescript`, or set `target = "typescript"` under `[build]` in `thunder.toml`.
Scoped packages (`"@scope/name"`), paths inside a package (`"lodash/fp"`), and Node's built-ins (`"node:path"`) work
the same way.

- **What crosses the boundary.** Going in: whole numbers and decimals become JavaScript numbers, money becomes its
  amount, text, yes/no, and `nothing` (null) stay as they are, lists become arrays, records and maps with text keys
  become plain objects, and dates become a `Date` at local midnight. Coming back: a JavaScript number becomes the
  exact decimal it is written as (`0.07` stays `0.07`, so `0.07 + 0.01` is exactly `0.08`), arrays become lists, and
  plain objects become maps. Anything else (a `Date`, a class instance) stays a library value you can hand back to
  the package.
- **A package that is one function** (`module.exports = function …`) is called as `.default`:
  `Use "is-odd" from npm as odd`, then `odd.default(3)`.
- **One step after another.** Thunder Core does not wait for promises. A function that gives back a promise is
  refused in words (TC508); use the package's function that answers straight away.
- **Failures** inside the package are reported against the Thunder line that called it: `JavaScript code used by
  this line failed: RangeError: …` (TC508). A name the package does not have is TC508 too.
- **Types.** Package values are typed `any` in the generated TypeScript, and `npm_packages.d.ts` declares each
  package, so `tsc --strict` passes even for a package that ships no types.


### .NET types and NuGet packages

A type from .NET itself needs nothing installed; a type from a NuGet package names the package and its exact version,
so every build gets the same code:

```thunder
Use "System.IO.Path" from .NET as paths
Use "Humanizer.NumberToWordsExtension" from NuGet "Humanizer.Core" version "2.14.1" as words

Say paths.Combine("reports", "trades.csv")    # reports/trades.csv
Say words.ToWords(1234)                       # one thousand two hundred and thirty-four
```

Run it with `thunder run --target csharp`, or set `target = "csharp"` under `[build]` in `thunder.toml`. The package is
added to the generated project, and `dotnet` downloads it on the first build.

- **What you call.** A public static method or property of the type, by its .NET name: `paths.Combine(…)`,
  `math.PI`. Extension methods are static methods of their class (`Humanizer.NumberToWordsExtension`).
- **Which overload.** The one whose parameters every value fits, preferring the closest fit: a whole number fits
  `int` before `long` before `decimal` before `double`; a decimal number fits `decimal` before `double`. No fit is
  TC508, listing what the method takes.
- **What crosses the boundary.** Going in: numbers as above, money as its amount, text as `string`, yes/no as `bool`,
  `nothing` as `null`, lists as arrays or lists of the parameter's type, dates as `DateTime` at midnight. Coming
  back: whole numbers from any integer type, the exact decimal from `decimal`, and from `double` the decimal it prints
  as (`Math.Sqrt(2)` is `1.4142135623730951`); arrays and lists become lists. Anything else stays a library value you
  can hand back.
- **Culture.** A program that uses .NET libraries runs with the `en-US` culture on every machine, so words and dates
  a library writes are the same everywhere.
- **Failures** inside .NET are reported against the Thunder line that called it, with the real cause:
  `.NET code used by this line failed: …` (TC508). Every other target refuses a .NET library (TC409).

## Step through a run: the Time Machine

Record a run, then step forward and back through it, one statement at a time, with the real values:

```sh
thunder run shop --record run.json     # runs it on the Thunder engine and saves every step
thunder replay run.json                # Enter or n: next · b: back · j 7: jump · q: quit
thunder replay run.json --step 3       # one step
thunder replay run.json --json         # the whole recording, as data
```

```text
⏱ Step 3 of 6 · src/main.thunder, line 10 · in the program
  Set fee to delivery fee with total
  Calls "delivery fee" (steps 4–5), then:
  fee: → $0.00

⏱ Step 4 of 6 · src/main.thunder, line 3 · inside "delivery fee"
  When total is at least $20:
  → yes
```

Each step shows the line, which values changed (before → after, as the program would print them), what it printed,
what a function gave back, and for a choice which way it went ("yes", or "no, so the Otherwise steps"). A recording is
made on the Thunder engine, so programs that use a Python module (`Use`) cannot be recorded. It replays what happened:
going back shows an earlier moment and never undoes anything the program did. A recording stops growing after 20,000
steps (and says so); the program still runs to the end. The format is `thunder-time-machine-v1`.

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
  (TC405): Python modules exist only for Python, and Thunder never swaps in a different library.
- **npm packages.** `Use "date-fns" from npm as dates` works on this target only; see "Libraries".

## Compile to C#

The same program, compiled to C# and run on .NET (8 or newer):

```sh
thunder build --target csharp     # generated/csharp/: one .cs per file, ThunderRuntime.cs, Program.cs, ThunderProgram.csproj
thunder run --target csharp       # build it with dotnet and run it
thunder test --target csharp      # run every Test block as C#
```

Or set it for the project in `thunder.toml`: `target = "csharp"` under `[build]`. The output is an ordinary console
project: `dotnet run --project generated/csharp` runs it without Thunder (`-- test` runs the tests).

- **The same meaning.** Every Core test program also runs compiled to C#, and the output, every error (its code, its
  words, its line, and "reached from"), and the exit status must be the same as on Python, the Thunder engine, and
  TypeScript, or the tests fail. `ThunderRuntime.cs` (base class library only) is a line-by-line port of the engine's
  value code: exact decimals on `BigInteger` (not .NET's 28-digit `decimal`), money rounded half up, positions from 1,
  strict yes/no, and the same words for every error.
- **Readable.** One static class per Thunder file, a static method per function (an input with a default gets an
  overload), records with their Never rules, and every line ends with `// thunder:N`. Values whose kind Thunder checks
  while running are `object`.
- **How it runs.** `thunder run` and `thunder test` build with the .NET SDK (`dotnet build`) and run the result. Without
  the SDK, Thunder says what to install (exit 2); `thunder build` still writes the C#. Programs run on a thread with a
  deep stack, so calls nest as deep as they can in Python.
- **No Python modules.** A program that uses `Use csv as csv` is refused for this target before anything is written
  (TC405).
- **.NET types and NuGet packages.** `Use "System.IO.Path" from .NET as paths` works on this target only; see "Libraries".


## Compile to Rust

The same program, compiled to Rust:

```sh
thunder build --target rust     # generated/rust/: one .rs per file, main.rs, thunder_runtime.rs, Cargo.toml
thunder run --target rust       # build it with cargo (offline) and run it
thunder test --target rust      # run every Test block as Rust
```

Or set it for the project in `thunder.toml`: `target = "rust"` under `[build]` (output goes to `generated/rust`
unless `output` says otherwise). The output is an ordinary Cargo project: `cargo run --offline --manifest-path
generated/rust/Cargo.toml` runs it without Thunder (`-- --tests` runs the tests).

- **The same meaning.** Every Core test program runs on Python, the Thunder engine, compiled TypeScript, and compiled
  Rust; the output, every error (its code, its words, its line, and "reached from"), and the exit status must be the
  same, or the tests fail. `thunder_runtime.rs` is a line-by-line port of the Thunder engine's value code: exact
  decimals of any size, money rounded half up, positions from 1, strict yes/no, the same text for every value and
  every error.
- **No dependencies.** The runtime uses only Rust's standard library (its exact numbers are written in it), so the
  program builds offline. Calls can go as deep as on Python (about a thousand): the program runs on a thread with a
  deep stack and stops at the same call, with the same message, when it goes deeper.
- **Readable.** Plain functions that take and give `Value`s, records with their Never rules, kept values, and tests;
  every line ends with `// thunder:N`. An error is carried up to the nearest Thunder call, which notes the line.
- **How it runs.** `thunder run` and `thunder test` need the Rust toolchain (`rustc` and `cargo`, from
  https://rustup.rs); without it Thunder says what to install. `thunder build` needs neither.
- **No Python modules.** A program that uses `Use csv as csv` is refused for this target before anything is written
  (TC405). Crates are not available from Thunder yet.


## Compile to Go

The same program, compiled to Go and built with the go toolchain:

```sh
thunder build --target go     # generated/go/: one .go per file, go.mod, and the runtime in thunder/
thunder run --target go       # build and run the compiled Go
thunder test --target go      # run every Test block as Go
```

Or set it for the project in `thunder.toml`: `target = "go"` under `[build]` (output goes to `generated/go` unless
`output` says otherwise). The output is an ordinary Go module: `cd generated/go && go run .` runs the program without
Thunder, and `go run -tags thundertests .` runs its tests.

- **The same meaning.** Every Core test program runs four ways: compiled to Python, on the Thunder engine, compiled to
  TypeScript, and compiled to Go. The output, every error (its code, its words, its line, and "reached from"), and the
  exit status must be the same, or the tests fail. The runtime (`thunder/thunder_runtime.go`) is a port of the Thunder
  engine's value code: exact decimals (`math/big`), money rounded half up, positions from 1, strict yes/no, and the
  same messages.
- **Readable Go, standard library only.** Plain functions in one `main` package, records, and kept values; every
  statement ends with `// thunder:N`. Values whose kind Thunder checks while running have the type `T.V`. A Thunder
  error is a Go panic that each function's frame annotates on the way out, so the error names the Thunder line and
  the calls that reached it. Nothing is downloaded: the module has no dependencies.
- **How it runs.** Go 1.21 or newer (`go` on the PATH, or `THUNDER_GO`). `thunder build --target go` works without it.
- **No Python modules.** A program that uses `Use csv as csv` is refused for this target before anything is written
  (TC405). Go packages are not available from Thunder yet.


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

## Use Thunder Core from your own code

`@skillstech/thunderlang/program` is the public, browser-safe library entry (no Node needed):

```js
import { compileCore, runInProcess, toPython, screenApp, screenOutline } from "@skillstech/thunderlang/program";

const result = compileCore('say "Hello"\n', { file: "main.thunder" });
if (result.ok) {
  runInProcess({ entry: result, cwd: "." }).stdout; // "Hello\n"
  toPython(result.program, result.info, { source: "main.thunder" }); // the generated Python
}
```

It also has `toTypeScript`, `toCSharp`, `toJava`, `toGo` (with `goNamespaces`), `toRust`, `toReact`, `recordedRun` (the
Time Machine), `testInProcess`, and `pythonToCore`. Files a program reads come only from the `readText` you pass.

**Every example in a file, as data.** `examplesOf(source)` reads a file's examples (Core `Test` / `Expect` lines, and a
mission's `test` cases and scenarios) so a tool never has to parse Thunder text. Each example has its line, the
function or decision it checks, its inputs as written, and the expected answer. It reads them even while another part
of the file does not compile, which is when a reviewing tool needs them most:

```js
import { examplesOf } from "@skillstech/thunderlang/program";

examplesOf('Test "members get 20% off":\n  Expect calculate discount with 150 and yes to be 30\n').examples[0];
// { kind: "expect", block: "members get 20% off", line: 2,
//   subject: { kind: "function", name: "calculate discount" },
//   inputs: [{ name: null, text: "150" }, { name: null, text: "yes" }],
//   expected: { mode: "equals", comparison: "is", text: "30" }, raw: "Expect calculate discount with 150 and yes to be 30",
//   fromText: true }
```

`fromText: true` means the line was read from its text: here the function is not in the file, as in a project's
`tests/` files, which call functions from `src/`. The shape is `thunder-examples-v1`. The example syntax it reads stays stable; a change to it is announced first.

## Examples

`examples/core/` holds the demo programs: `hello`, `discount`, `savings`, `word-count`, `csv-summary`, and
`trading-journal`. Run them with `thunder run examples/core/<file>.thunder`, and test them with
`thunder test examples/core`.
