# The Thunder language: one map

Thunder™ is one language that people use in three ways. This page shows how they fit together, how the compiler
tells them apart, and where each one is specified. The same rule (members who spend at least 100 get 20% off)
appears in all three.

```text
   existing code                    you write                         you write
   (17 languages)                   a program                         a specification
        │                               │                                  │
        ▼                               ▼                                  ▼
 ┌──────────────┐              ┌────────────────┐                 ┌────────────────┐
 │ Thunder Text │  --as-core   │  Thunder Core  │                 │    Mission     │
 │  read code   │ ───────────▶ │  code that runs│                 │ what must hold │
 └──────────────┘  (Python)    └────────────────┘                 └────────────────┘
   thunder read                  thunder run / build               thunder check / test
   explains, never runs          Python, TypeScript, C#,           checks rules and examples,
                                 Java, Go, Rust                    compiles decisions
```

| | Thunder Text | Thunder Core | Mission |
| --- | --- | --- | --- |
| What it is | Existing code, read in Thunder's words | A program written in Thunder | A specification of what software must do |
| Who writes it | Nobody: the compiler reads it from your code | You | You (or an AI, for you to approve) |
| Runs? | No; it explains | Yes | Its decisions and examples are checked and compiled |
| File | none (it is printed) | `.thunder` | `.thunder` |
| Commands | `thunder read`, `thunder write` | `thunder new`, `run`, `test`, `build` | `thunder init`, `check`, `test` |
| Specified in | [Specification V1](/docs/spec) | [Thunder Core](/docs/core) | [Syntax overview](/docs/syntax-overview), [spec v0.2](/docs/spec-v0-2) |

## The same rule, three ways

**Thunder Text: reading code you already have.** `thunder read discount.py --as-core` reads this Python:

```python
def calculate_discount(total, member):
    if member and total >= 100:
        return total * 0.2
    return 0
```

and prints it as Thunder Core you can edit and run, with every assumption said out loud:

```text
To calculate discount:
  Receive total and member
  When member is true and total is at least 100:
    Give total * 0.2
  Give 0

  assumes: calculate_discount, line 2: member is read as yes/no (Python would also accept other values here)
```

**Thunder Core: a program.** The same rule written in Thunder, with tests, compiled to any of six languages:

```thunder
To calculate discount:
  Receive total and member
  When member is true and total is at least 100:
    Give 20% of total
  Otherwise:
    Give 0

Test "members spending at least 100 get 20% off":
  Expect calculate discount with 100 and true to be 20
  Expect calculate discount with 150 and false to be 0
```

**Mission: what must hold.** The rule as a decision the compiler checks against its examples, before or alongside
any code:

```intent
mission Discount
goal
  Members who spend at least 100 get 20% off.

decision MemberDiscount
  inputs
    total
    member
  rule member big order
    when member and total >= 100
    return Discount
  default
    return NoDiscount

test MemberDiscount
  case member at 100
    given total 100, member true
    expect Discount
```

Core is written in sentences (`To …:`, `Set … to …`, `When …:`) with capitals where English has them. Missions
are written in lowercase keyword blocks (`mission`, `decision`, `rule`, `test`). Apart from a bare `use <name>` line,
the two never start the same way.

## Which one to use

- **You have code and want to understand or change it:** Thunder Text. Nothing to learn first; `thunder read`.
- **You are writing new logic:** Thunder Core. It runs, it has tests, and it compiles to the language your team uses.
- **You want rules that every implementation, human- or AI-written, must keep:** a mission. Its decisions compile
  to six languages, and `thunder check` and Thunder review hold its `never` and `guarantee` lines against changes.

## How the compiler tells a `.thunder` file's kind

A fixed rule, in this order, never a guess:

1. Inside a folder with `thunder.toml` (a Thunder Core project), or with `--core`: **Core**. With `--mission`:
   **mission**.
2. Otherwise the first line that is not blank or a comment decides. A mission always starts with one of the
   mission keywords in lowercase, with at most a name after it: `mission Checkout`, `service Billing`,
   `event InvoiceCreated`, `use product`. Such a file is a **mission**.
3. Any other first line (`say "Hello"`, `Set total to 0`, `To greet:`, `A Trade has:`, `Screen Today:`,
   `Use csv as csv`) cannot start a mission, so the file is **Core**.
4. A file that could be either (an empty file, or `use csv` alone) stays a **mission**, as before. Add `--core` to
   run it as a program.

When a mission check finds no mission in a file, the message says how to read the file as a program instead.

## What comes next

The road to 2.0 brings these together in one stable specification (grammar, meaning, diagnostics, and a
compatibility promise), so that a program written for 2.0 keeps working in every 2.x release.
