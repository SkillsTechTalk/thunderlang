# Thunder, ThunderLang, and Thundered code

**Thunder. Programming, made human.** Thunder is a visual language for reading and changing the rules in software. A product
manager and an engineer can open the same rule, point at the same condition, and agree on what
should change, whatever language the software is written in.

| Word | What it means | How you would say it |
| --- | --- | --- |
| **Human-native programming** | The paradigm: people work with the meaning of software while machines handle most of the implementation. Thunder is a human-native language | "Thunder is human-native: you read what the code means, not the code." |
| **Thunder** | The Thunder programming language: the visual language people read and change rules in | "I read the refund rule in Thunder." |
| **The Thunder Programming Language** | Thunder's full name. Specified in [Thunder V1](/docs/spec) | "The Thunder Programming Language, V1" |
| **ThunderLang** | Another name for Thunder, the way Go is also called Golang. Used for the website, the package, the repository, and search | "Search for ThunderLang", thunderlang.dev, `@skillstech/thunderlang` |
| **Thunder compiler** | The open-source compiler: checks rules, runs examples, generates code | `thunder test`, `thunder gen` |
| **Thunder Text** | The interim written form: a Thunder picture in readable, structured words, stored and reviewed like code | `RefundApproval.thunder-plain`, `thunder text` |
| **Thundered** | Existing code shown in Thunder | "This is our Python refund service, Thundered so Product can review it." |
| **Thundering** | Turning existing code into Thunder | "Thunder the billing folder and look for the $100 limit." |
| **Thunder read** | Reading code visually, in Thunder | "Thunder read shows exactly where $100 is decided." |
| **Thunder write** | Changing code visually: edit the Thunder picture and the original code is updated and checked | "Use Thunder write to change the limit to $75." (experimental: on [Read in Thunder](/read) and with `thunder write`) |
| **OpenThunder** | The IDE for Thunder: open your app, read it in Thunder, navigate it in the Atlas, change it, and verify every change | "Open the repo in OpenThunder and read the Thundered TypeScript." |
| `thunder` | The command-line tool | `thunder plain RefundApproval.thunder-plain` |

**Thunder is the language. [OpenThunder](https://openthunder.dev) is the IDE**, where you use it on your whole app. The
Thunder compiler is open source and also runs on its own in your browser and terminal.

## Ways to see your software in Thunder

Agreed with OpenThunder, from the big picture down:

| View | What you see |
| --- | --- |
| **Thunder Atlas** | The zoomable view: product, then areas, then parts, then a rule card, then the code |
| **Thunder Map** | How the code is built: packages, services, integrations, dependencies |
| **Thunder Code** | Any file or folder, every function read in Thunder; readable decisions become cards, the rest dashed cards with the original code |
| **Thunder Trace** | One user action, followed from start to data |
| **Thunder Brief** | The big picture and summary |
| **Thunder Focus** | Areas worth focusing on, each with its reason |
| **Thunder Learn / Practice** | Walk and memorize your app: challenges, flashcards, drills |
| **Thunder Review** | A pull request as before-and-after pictures (later) |

A **Thunder card** is the picture of one rule; it appears inside Thunder Code and Thunder Atlas.

In the product, the action is **Read in Thunder**. The result is labeled with its source:
**Thundered Python**, **Thundered C#**, **Thundered Java**, and **View original** stays one click away.

## What you can do with Thundered code today

Reading code and safely rewriting code are different problems. Every Thundered rule shows the
action you can actually take on it, and nothing is transformed silently.

| Level | What it means | Status |
| --- | --- | --- |
| **Thunder read** (Thundered read) | See existing code's routes, rules, and checks in Thunder. The original code stays the source of truth. | Available on [Read in Thunder](/read) and [the refund demo](/try) for TypeScript, JavaScript, Python, Go, Rust, C#, Java, Kotlin, PHP, and Ruby |
| **Thunder native** | Write the rule in Thunder; the Thunder compiler checks it and generates code. Thunder is the source of truth. | Available for decisions and examples (experimental `.thunder-plain` and `.thunder-human`) |
| **Thunder write** (Thundered edit) | Change a Thundered rule and get a checked patch to the original code | **Experimental.** [Thunder write](/docs/thunder-write) changes a number, comparison, text value, or answer in a decision, in all ten languages above, and checks it by reading the file again. On [Read in Thunder](/read), **Change a rule** edits the copy of the code on the page (with Undo and download); `thunder write --write` edits your file. Changes to a rule's shape are not supported; there the action is **Propose rule change**, never **Update code** |

Parts that Thunder cannot read stay visible as "not read", with the original source line. Thunder
never draws a guess to make a picture look complete.

## What the code does versus what the team wants

Thunder can read `amount <= 100` and show that exactly $100 is approved. It cannot tell from that
line whether the company *meant* $100 to be approved. That is the question Thunder puts in front of
a person: **"Here is what happens today. Is that what we want?"** Thundered code is labeled as read
from code until a person answers questions such as "is this amount money?" and "why does this rule
exist?", and adds examples. See [Human comprehension: design and limits](/docs/human-comprehension).

## Thunder Text, the interim written form

Thunder is drawn as a picture. **Thunder Text** is the same rule in readable, structured words: what
gets saved, versioned, reviewed in pull requests, and compiled. It sits between the picture and
Thunder source (`.thunder`). You never need to read it, but you can:

```text
Refund approval
Why: Let support resolve small refunds without waiting for a manager.

We need
  the amount, in dollars
  whether it is on time or late

When do we approve a refund?
  Approve when all of these are true:
    it is on time
    the amount is at least $0
    the amount is at most $100
  Otherwise, Review.

Examples
  $100, on time   gives Approve   (exactly at the limit)
  $50, late       gives Review    (outside the refund window)
```

Run it with `thunder text RefundApproval.thunder-plain` (`thunder plain` also works). The full example is
`examples/human/RefundApproval.thunder-plain`. This notation is experimental: one decision per
file; inputs are dollar amounts, numbers, or yes/no; dollars are checked in the text, but generated
code receives a plain number.
