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
npx --yes --package=https://thunderlang.dev/downloads/skillstech-thunderlang-0.5.1.tgz thunder human RefundReview.thunder-human
```

For repeated use, install that same package:

```sh
npm install -g https://thunderlang.dev/downloads/skillstech-thunderlang-0.5.1.tgz
thunder human RefundReview.thunder-human
thunder human RefundReview.thunder-human --format source > RefundReview.thunder
thunder test RefundReview.thunder
```

This direct download contains the new command. Older npm registry releases do not.

## Read the rule

```text
contract RefundReview
purpose Approve eligible refunds up to 100 USD.

decision RefundPolicy(amount, withinWindow)
  when amount >= 0 and amount <= 100 and withinWindow == true -> Approve
  otherwise -> Review

examples RefundPolicy
  | case | amount | withinWindow | expect |
  | exactly at the limit | 100 | true | Approve |
  | above the limit | 101 | true | Review |
```

Rules run in order. The first matching rule wins; `otherwise` handles the rest.
Each row names one concrete example and the outcome it requires. Purpose is an
author's statement, not something inferred or proved by the compiler. Currency
in the purpose is descriptive; this subset does not enforce units.

## Check the real code

Passing contract examples does not mean your application passes. Follow the
[OpenThunder refund walkthrough](https://openthunder.dev/docs/refund-contract.html)
to call an independent refund service, introduce an application-only bug, and
see the exact failing input and result.

The [full Playground](/playground), [language reference](/docs/spec), and
[existing examples](/examples) remain available. The simpler notation currently
covers decisions and example tables; it does not replace the full language.
