# The Thunder Programming Language: specification V1

> **Status:** V1, 2026-11-23. Replaces the [mission specification draft v0.2](/docs/spec-v0-2).
> The machine-readable form of this specification is `thunder-visual-v1`, exported by the Thunder compiler
> (`THUNDER_VISUAL`, `visualFor`, `thunderText` from `@skillstech/thunderlang/core`). Where this page and that data
> disagree, the data is right and this page has a bug. Each element below is marked **works today**, **some
> languages**, or **planned**, and nothing marked planned is claimed to work.

## 0. Human-native programming

> We are no longer writing code for the computer. We are writing code for humans.

**Thunder is a human-native programming language.** People work with the meaning of software (what it does,
what it decides, how it can fail), and machines handle most of the implementation. Thunder shows that meaning as
pictures, and the same meaning as plain, precise words, whatever language the software is written in.

| Level | What it is | Read by |
| --- | --- | --- |
| **Thunder** | Pictures of what software does: cards, steps, maps | Anyone who needs to understand the software |
| **Thunder Text** | The same meaning in plain, precise words | Anyone who wants the detail |
| The meaning | The one reading both views are made from: actions, rules, steps, failures, evidence | Tools (the Thunder compiler, OpenThunder) |
| High-level languages | Java, Python, TypeScript, C#, SQL | Developers |
| Machine code | Instructions for one kind of processor | Compilers and specialists |
| Bits | 0 and 1 | Hardware |

The top two levels are human-native, and both are views of the meaning beneath them. Everything below them still exists and still runs, and AI now writes much of
it. Thunder does not replace the code; it lets people read it, question it, and change it.

| Paradigm | The question it answers |
| --- | --- |
| Object-oriented programming | How are objects and their behavior organized? |
| Functional programming | How is a computation built from functions? |
| Intent-oriented programming | What should the software do, and how do we check that it does? |
| **Human-native programming** | How can a person understand, direct, and change software, whatever language it is written in? |

Intent-oriented programming, ThunderLang's earlier focus, stays the method underneath: state what software should
do, and check that it does. Human-native programming is the larger aim it serves.

**What it is not.** It is not natural-language programming: Thunder does not turn ambiguous English into code; it
reads real code exactly, with no AI, and the same code always gives the same Thunder. It is not no-code: the
software stays real code in a real language, and that code stays the source of truth.

### Names

| Name | Means |
| --- | --- |
| **Thunder** | The language. Also called **ThunderLang** (website, package, repository), the way Go is also called Golang. |
| **Thunder Text** | Thunder in words. |
| **Thunder compiler** | The open-source compiler (`thunder`) that reads code into Thunder, checks rules, and generates code. Runs in the browser, the terminal, and VS Code. |
| **OpenThunder** | **The IDE for Thunder.** Where you use Thunder on a whole application: read it, find your way in the Atlas, change it, and check every change. |
| **Thundered Python** (C#, Java, …) | Existing code shown in Thunder. |
| **Read in Thunder** | The action that shows code in Thunder, and OpenThunder's front door (App > File > Action > Rule > Original). |

### The bar

A 12-year-old can explain what a simple program does using Thunder. An architect can use the same Thunder to check
whether that program is right. Both, without hiding complexity and without presenting a guess as a fact.

This is a design goal. It has not been measured with a study yet; it is the test every addition to the language
must pass on paper first.

## 1. Principles

1. **Meaning before syntax.** Show what the software does, not brackets, types, and keywords.
2. **Read before write.** Thunder works on the code people already have. Nobody rewrites anything to start.
3. **One meaning, two views.** The picture and Thunder Text are two views of the same reading, produced from the
   same data. Switching between them loses nothing.
4. **Truth before simplicity.** What Thunder cannot read is shown as *Not read yet*, dashed, with the original code.
   Thunder never draws a guess to make a picture look complete.
5. **People stay in charge.** AI can write most of the code. People read what it does and decide what it should do,
   and every change is checked before it ships.

## 2. One meaning, two views

```
                 original code  (Python, TypeScript, Go, … SQL)
                        │  read exactly by the Thunder compiler, no AI
                        ▼
                 the meaning  (read-v1 items: actions, decisions, functions, steps, failures, tests)
              ┌─────────┴──────────┐
     visualFor(item)          thunderText(item)
              ▼                    ▼
        Thunder (picture)     Thunder Text (words)
```

| Form | Role | What a person does with it |
| --- | --- | --- |
| **Thunder** | Main | Reads, explores, asks a rule questions, proposes a change |
| **Thunder Text** | Detail | Reads closely, reviews, stores, diffs |
| **Original code** | Evidence | Checks exactly which lines Thunder read (View original, always one click away) |

The picture and the text are not translated from each other. Both are rendered from the same meaning, so they
cannot disagree. An AI coding agent can change the original code, and both views update from the new reading.

## 3. Reading levels and places

Reading software in Thunder has two separate questions: **how deep** you are reading (the level) and **where** you
are (the place). Every Thunder view offers the same five levels, in this order, with these names.

```
   Big Picture  →  Flow  →  Details  →  Text  →  Original
   what it is      how it    exactly     the same   the code
   and can do      goes      what, and   in words   that proves it
                             how sure
   └──────── pictures ────────┘          words      evidence
```

| Level | The question it answers | What it shows |
| --- | --- | --- |
| **Big Picture** | What is it, and what can it do? | The Things, what each knows and can do, its doors (actions), its rules, and its data. For one action or rule: what you give it, what you get back, and what it uses. |
| **Flow** | How does it go? | One action or rule as a path: questions with Yes and No, repeats, the Stops, what happens if something goes wrong, and what always happens at the end. |
| **Details** | Exactly what happens, and how sure is Thunder? | A fact sheet: every way it can end (each Stop with the message people see, and what it gives back) with the answers that lead there, what it changes, what goes in and where it is used, what it relies on, a rule's answers in words and its exact limits (found by running it), and what the code cannot tell you. Every fact links to its line. |
| **Text** | What does it say, in words? | Thunder Text: the same meaning in structured words, for reading closely, reviewing a change, and keeping a copy. |
| **Original** | Which code says so? | The exact lines in the original language that Thunder read. The evidence, one click away. |

The compiler defines what each level shows: `LEVELS` (the names and questions) and `readLevel(model, level, focus)`
(the content for the whole app, one Thing, or one action or rule), both in `/core`. A product decides where to put
the levels and how to move between them; it does not decide what a level contains. Flow and Details are about one
action or rule; asked for them without one, `readLevel` gives the list to choose from.

### Places

**Places** are where you are: the App, an Area, a File, a Thing, an Action, or a Rule. **Read in Thunder** walks
them from the whole app down to one rule (OpenThunder ADR 0035); the Thunder Atlas (ADR 0033) adds **Area** between
App and File for large apps. At every place, all five levels apply.

| Level | What you see | Example | Atlas |
| --- | --- | --- | --- |
| App | The app's folders or areas, with counts of actions and rules | `billing-service` | Z0 |
| Area | A feature area, service, package, or folder (Atlas; optional in Read in Thunder) | `Refunds` | Z1 |
| File | What you can do here: the file's actions and functions | `refunds.py` | Z2 |
| **Action** | A door into the app (an endpoint or a screen) and what its handler does | `POST /refunds` | Z3 |
| **Rule** | One decision as a Thunder card, or a function's steps | "When do we approve a refund?" | Z3 |
| Original | The exact lines in the original language | lines 12 to 16 | Z4 |

## 4. Elements

Every element shows where it came from (section 8). Levels are the zoom levels in section 3.

| Element | Zoom | Picture | Thunder Text | Status |
| --- | --- | --- | --- | --- |
| **App** | 0 | A map of its folders or areas, with counts of actions, decisions, functions, and what could not be read yet | `App <name>` | works today (`thunder repo`) |
| **Area** | 1 | A region of the map: a folder, package, or service | `Area <name>` | works today |
| **File** | 2 | What you can do here: its actions and functions, in order | `File <path>` | works today |
| **Data shape** | 2 | A table card: fields, their kinds, allowed values | `A <Name> has` then one field per line | planned |
| **Action** | 3 | A steps card with a route badge (`POST /refunds`): a door into the app and what its handler does | `When someone calls POST /refunds` | works today for endpoints; screens planned |
| **Thunder card** | 4 | One decision: its question, the facts it reads, each rule, the outcome otherwise, examples you can ask | Thunder Text contract (section 6) | works today |
| **Steps card** | 4 | What a function does, as steps with one level of nesting | `What <name> does` then `- <step>` lines | works today |
| **Not-read-yet card** | 4 | Dashed card with the original code | `` - `code` (code, not explained) `` | works today |
| **Failure** | 4 | A chip marked ✕ | `Can fail with <Name>` | works today |
| **Test** | 4 | A chip marked ⚑; green or red only once it has run | `Test: <name>` | works today |
| **Trigger** | 3 | A steps card with a "when" badge: a database trigger, message handler, or schedule | `When <event>, it` then steps | planned |
| **Original code** | 5 | The exact lines, highlighted | (the code itself) | works today |

**Author's note.** When code has a docstring or doc comment, Thunder shows its first paragraph, verbatim, as an
**Author's note**, kept apart from what the code does. The author describes what they meant, while Thunder's reading
shows what the code actually does, and a reader should see both. In a Thunder Text contract it becomes the `Why:` line.

## 5. Steps

A function that is not a decision is read as **steps**: what it works out, checks, calls, and returns. Shape comes
first and color second. Every step has a mark, so color is never the only signal.

| Kind | Mark | Label | Color role | Example in Thunder Text |
| --- | --- | --- | --- | --- |
| check | ✓ | Check | comparison | `Checks that the amount is at least 0` |
| branch | ◇ | If | question | `If the order is refunded` |
| loop | ↻ | For each | structure | `For each item in the cart` |
| set | = | Works out | fact | `Works out actives: the items in rules where active` |
| call | → | Calls | outcome | `Calls Stripe` · `Writes to the database (commit)` |
| return | ⇥ | Gives back | outcome | `Returns whether any item in actives matches` |
| fail | ✕ | Fails | failure | `Fails with AlreadyRefunded: "This order was already refunded"` |
| try | ⛉ | Tries | structure | `Tries the next steps and handles any error` |
| *restates* | · | Code | unread, dashed | the original code, quoted |
| *other* | · | Not read yet | unread, dashed | the original code, quoted |

**A step that would only restate the code shows the code instead.** "Works out actives" or "Returns the result of
any" tells a reader nothing the code did not, so Thunder marks such steps `restates`, shows the original code dashed,
and does not count them as read. A function is drawn as a steps card when at least half its steps explain something.
Otherwise it is a not-read-yet card.

### Every detail, one level down (works today)

Thunder's words are short on purpose: "Calls save" is easier to read than the call. Nothing is lost by being short,
because every step also carries its **meaning tree** (`expr`, schema `thunder-expr-v1`): a small, language-neutral
tree of exactly what the statement says.

| The code has | The tree keeps |
| --- | --- |
| a call | what is called (the whole path: `this.repo.save`) and every argument, named or not |
| an assignment | the whole target (with its index or key), the operator, the value, a declared type |
| a condition | every operand, every comparison, every `and` / `or`, every negation |
| a value | its exact value (`0x1F` is 31, `"a\tb"` has a tab), text with values in it part by part |
| an object, list, or JSX | every key and item; every tag, attribute, and child |
| a function written inside | its parameters (and types); its body is the step's own children |
| a return or a failure | the value; the error's type and its message |

The tree is read from the code, never guessed: what Thunder cannot read exactly is kept as `{ kind: 'code', text }`.
Three places show it:

- **Details** gives each step its tree (`expr`) and what the short words leave out (`detail`): `Calls save` has the
  detail `with: order, { validate: false }`, shown as **Calls save — with: order, { validate: false }**. A step whose
  words already say everything has no detail.
- **Thunder Text** stays short by default. The full form (`modelText(model, id, { full: true })`, or Text with
  `{ full: true }`) adds every detail after the words on the same line, so nothing in the code is out of reach.
- **The faithfulness gate** counts a condition's negations and comparisons from its tree, so a TypeScript non-null
  `x!` is not mistaken for a negation, and an operator inside a string is never counted.

**Code → Thunder → code.** For TypeScript, JavaScript, Python, and Go, each step's tree can be written back as code
(`renderStatement`), read again, and compared (`stepRoundTrip`). Where a condition or value is made only of names,
values, and operators, the original code and the code written back are also run on the same generated inputs and
must give the same answers. `scripts/accuracy.mjs` reports the share of steps whose round trip is exact, and how many
of the code's names a reader can see in the short words and in Details ([accuracy](./accuracy.md)).

## 6. Thunder cards and the Thunder Text contract

A **decision** is a function that chooses between fixed answers. It is drawn as a **Thunder card** and written in
Thunder Text as a contract (`.thunder-plain`, schema `thunder-plain-v1`):

```text
Refund approval
Why: Let support resolve small refunds without waiting for a manager.

We need
  the amount, in dollars
  whether it is on time or late

When do we approve a refund?
  Approve when all of these are true:
    it is on time
    the amount is at most $100
  Otherwise, Review.

Examples
  $100, on time   gives Approve   (exactly at the limit)
  $101, on time   gives Review    (above the limit)
  $50, late       gives Review    (outside the refund window)
```

| Part | Meaning |
| --- | --- |
| Title, then `Why:` | What the rule is and why it exists (from the docstring when read from code) |
| `We need` | The facts the rule reads: a number (`in dollars` for money), or a yes/no (`whether it is A or B`) |
| The question | What the rule decides |
| `<Outcome> when …` | One rule. `all of these are true:` or `any of these is true:` joins conditions; the first matching rule wins |
| Comparisons | `at least`, `at most`, `under`, `over`, `exactly` |
| `Otherwise, <Outcome>.` | The answer when no rule matches |
| `Examples` | Inputs and the answer the rule must give. Code has none, so a person adds them. The card answers each one, and the compiler checks them. |

## 7. Colors and lines

Each kind of word keeps one hue everywhere it appears: in the picture, in Thunder Text, and in the legend.

| Role | Color | Used for |
| --- | --- | --- |
| structure | violet | `when`, `otherwise`, `all of these`, `for each` |
| question | blue | A decision's question, branches |
| fact | yellow | Facts a rule reads, values a step works out, routes |
| comparison | pink | `at least`, `at most`, checks |
| amount | orange | Amounts and numbers |
| outcome | cyan | Outcomes, what a function gives back |
| name | lime | Example names |
| failure | orange, always with ✕ and "Fails" | Ways a function fails |
| **pass** | **green** | **Only** a check that ran and passed |
| **fail** | **red** | **Only** a check that ran and failed |
| unread | grey, dashed | Not established |

**Solid lines** mean established: read exactly, or confirmed by a person. **Dashed lines** mean not established: not
read, partly read, an AI summary, or not yet run.

## 8. Where each piece came from

Every element carries one provenance chip. The words are shared with OpenThunder (ADR 0035). Chips are neutral grey
with a solid or dashed outline, and never borrow a word role's color, so yellow always means a fact.

| Chip | Line | Meaning |
| --- | --- | --- |
| **From code** | solid | Read exactly by the Thunder compiler, with no AI |
| **Confirmed** | solid | A person confirmed this is what the software should do |
| **Author's note** | solid | The author's own words (docstring or doc comment), verbatim. A statement, not a reading |
| **AI summary** | dashed | Written by AI to explain. Never evidence; always shown above the exact reading it summarizes |
| **Not read yet** | dashed | Thunder could not read this yet; the original code is shown instead |

The AI summary layer belongs to OpenThunder. This specification defines only how a summary looks and where it sits.

## 9. Languages

| Language | Reading | Actions (endpoints) | Decisions | Author's note | Data shapes (planned) |
| --- | --- | --- | --- | --- | --- |
| Python | works today | FastAPI `@router.post`, Flask `@app.route` | a `def` that returns fixed answers | docstring | `@dataclass`, pydantic, `Enum` |
| TypeScript | works today | NestJS `@Get`/`@Post`, Express `router.post(…)` | a function that returns fixed answers | JSDoc | `interface`, `type`, `enum` |
| JavaScript | works today | Express `app.get(…)`, `router.post(…)` | a function that returns fixed answers | JSDoc | classes |
| Go | works today | not yet (net/http, Gin planned) | a `func` that returns fixed answers | `//` comment above | `struct` |
| Rust | works today | not yet (Actix, Axum planned) | a `fn` with `match`/`if` | `///` | `struct`, `enum` |
| C# | works today | `[HttpGet]`/`[HttpPost]` | a method that returns fixed answers | `/// <summary>` | `class`, `record`, `enum` |
| Java | works today | Spring `@GetMapping` | a method that returns fixed answers | Javadoc | `class`, `record`, `enum` |
| Kotlin | works today | Spring annotations | a `fun` with `when`/`if` | KDoc | `data class`, `enum class` |
| PHP | works today | Symfony `#[Route]` | a function that returns fixed answers | PHPDoc | `class`, `enum` |
| Ruby | works today | Sinatra `get`/`post` blocks (Rails routes planned) | a `def` that returns fixed answers | `#` comment above | `class`, `Struct` |
| **SQL** | **planned** | (reached through the app) | `CHECK` constraints, `CASE`, `IF` in procedures | `--` comment, `COMMENT ON` | `CREATE TABLE`, `CREATE VIEW` |

### SQL

Thunder reads `.sql` files (PostgreSQL first; MySQL, SQLite, and SQL Server where their syntax agrees).

- **Tables** are Data, or Things when they enforce rules: each column with its kind in words ("a number, given
  automatically, the id"; "words, always set"), its default ("0 at first", "the moment it is saved"), and what it
  points to ("a customer (by its id)").
- **`CREATE TYPE … AS ENUM`** is a set of Choices.
- **`CHECK` and `UNIQUE`** are rules the table enforces: "Is total at least 0?" with the Stop on No, "Refused by the
  database: The order needs total is at least 0".
- **Views** are steps: finds, adds the matching rows, keeps only, groups, sorts, takes the first N, gives back the
  named columns. Table aliases read as their tables ("the order's status").
- **Functions and procedures** are steps: their inputs, `IF`/`ELSIF`/`ELSE` as questions, `RAISE` as Stops with
  their message, `INSERT`/`UPDATE`/`DELETE` as what they record, `SELECT … INTO` as what they find, `RETURN`.
- **Triggers** say when the database runs them: "After an order is added or changed, runs log order change".
- Planned: **SQL inside app code** (`db.execute("SELECT …")`) read in place, as a step; `CASE` expressions as cards.

## 10. Rules every Thunder view follows

A view that breaks one of these is wrong, however good it looks.

1. Show the picture first, Thunder Text second, and the original code one click away.
2. Never draw a guess. What Thunder cannot read is shown as *Not read yet*, dashed, with the original code.
3. Green and red mean only a check that ran and passed or failed.
4. Every element shows where it came from: From code, Confirmed, Author's note, AI summary, or Not read yet.
5. An AI summary is labeled, dashed, and always sits above the exact reading it summarizes, never instead of it.
6. An Author's note is shown verbatim as the author's statement, separate from what the code does.
7. Say the action that is really possible: **Propose rule change** until a change is written back and checked; never
   **Update code**.
8. Use the reader's words: plain names, no syntax. A step that would only restate the code shows the code instead.

## 11. Using the grammar in a tool

Every Thunder view renders from the same data instead of deciding shapes, colors, and wording for itself.

```js
import { readCode, visualFor, visualForStep, thunderText, THUNDER_VISUAL } from '@skillstech/thunderlang/core';

const { items } = readCode(source, { language: 'python' });
for (const item of items) {
  const v = visualFor(item);     // { element: 'action', shape: 'steps-card', line: 'solid', title, badge, provenance, doc }
  const text = thunderText(item); // the same meaning as Thunder Text
  for (const step of item.steps ?? []) visualForStep(step); // { mark: '◇', label: 'If', color: 'question', show: 'words' }
}
THUNDER_VISUAL.colors.pass.hex;   // '#34D399', for checks that passed and nothing else
```

## 12. What comes next

In the order OpenThunder needs them for Read in Thunder:

1. **Actions everywhere:** routes on every handler, including routes registered in another file
   (`r.Post("/orders", h.CreateOrder)`), Go and Rust frameworks, Rails routes, and screens.
2. **Data shapes:** records, classes, enums, ORM models (Pydantic, dataclasses, SQLAlchemy, TypeORM, Entity Framework,
   Go structs, Java records), and SQL tables, using the same table and column names as OpenThunder's architecture map
   so a step's query links to its table.
3. **State machines:** states and transitions drawn as one element.
4. **Other human languages in code:** keep identifiers such as French names as they are, instead of splitting them as
   English words, with a slot for a gloss.
5. **Events and services:** publish/subscribe, queues, and named external calls (Stripe, HTTP, database, email) as
   step kinds.
6. **A file's purpose:** the module docstring as the file's Author's note.
7. **SQL:** reading as described in section 9, starting with PostgreSQL and migrations.
8. **Thunder write beyond decisions:** today a change to a number, comparison, text value, or answer in a decision is
   written back and checked; other changes are proposals.

Thunder versions its grammar (`thunder-visual-v1`), its reading (`read-v1`, `thunder-steps-v1`), and its contracts
(`thunder-plain-v1`) separately. A new version adds; it does not silently change what an existing element means.
