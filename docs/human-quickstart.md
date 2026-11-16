# Try the simpler language

Start with the [browser refund demo](/try). No installation or account is needed.
Edit a rule, run its five examples, and see exactly why the $100 boundary matters.

The experimental `.thunder-human` notation is a small authoring shorthand. It
compiles into the existing `.thunder` language, with the same parser, evaluator,
and code generators. Existing contracts and tools keep working.

## Run it locally

Use Node.js 20 or later. Download the source from the browser demo, then run the
versioned compiler distributed directly by this site:

```sh
npx --yes --package=https://thunderlang.dev/downloads/skillstech-thunderlang-0.5.2.tgz thunder human RefundReview.thunder-human
```

For repeated use, install that same package:

```sh
npm install -g https://thunderlang.dev/downloads/skillstech-thunderlang-0.5.2.tgz
thunder human RefundReview.thunder-human
thunder human RefundReview.thunder-human --format source > RefundReview.thunder
thunder test RefundReview.thunder
```

This direct download contains the new command. Older npm registry releases do not.

## Read the rule

```text
contract RefundReview
purpose Approve eligible refunds up to 100 USD.

decision RefundPolicy(amount: number, withinWindow: boolean)
  when amount >= 0 and amount <= 100 and withinWindow -> Approve
  otherwise -> Review

examples RefundPolicy
  case "below the limit": (amount: 99, withinWindow: true) -> Approve
  case "exactly at the limit": (amount: 100, withinWindow: true) -> Approve
  case "above the limit": (amount: 101, withinWindow: true) -> Review
  case "outside the refund window": (amount: 50, withinWindow: false) -> Review
  case "negative amount": (amount: -1, withinWindow: true) -> Review
```

Rules run in order. The first matching rule wins; `otherwise` handles the rest.
Each `case` names a concrete example and its expected outcome. Inputs are named, so their order does not matter. Long cases may wrap inside parentheses. The same `->` arrow is used in rules and examples. Tables are generated for reading; original pipe-table input still works. Purpose is an
author's statement, not something inferred or proved by the compiler. Currency
in the purpose is descriptive; this subset does not enforce units.

## Check the real code

Passing contract examples does not mean your application passes. Follow the
[OpenThunder refund walkthrough](https://openthunder.dev/docs/refund-contract.html)
to call an independent refund service, introduce an application-only bug, and
see the exact failing input and result.

The [full Playground](/playground), [language reference](/docs/spec), and
[existing examples](/examples) remain available. The simpler notation currently
covers decisions and named or table examples; it does not replace the full language.


## Input checks and compatibility

Optional `number`, `boolean`, and `string` annotations validate example literals
when the shorthand is compiled. `"false"` is a string, not a boolean; missing
inputs do not default to false. Unknown names, duplicate inputs and missing
expectations are errors with a source line. Untyped signatures remain valid.
Annotations do not add runtime validation to arbitrary application calls or
introduce money/currency types. The compiled source uses the existing runtime.

OpenThunder 0.5.4 reads `.thunder-human` directly. Its report shows **Contract
examples** and **Application examples** separately, including when application
code was not executed. Existing `.thunder`, `.tl`, and `.intent` files keep working.
