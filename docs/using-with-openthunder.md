# Use ThunderLang with OpenThunder

Start with one business decision that is easy to get subtly wrong: a refund limit, a retry policy, a feature flag, or a state transition. You do not need to rewrite the application.

ThunderLang owns the language and the deterministic runtime. OpenThunder consumes that compiler and combines intent evidence with repository work. They have different jobs:

| Question | Where the evidence comes from |
| --- | --- |
| What rule did we agree on? | A reviewed `.thunder` file in your repository |
| Does the declared decision handle these inputs? | ThunderLang test cases |
| Does our application implement that rule? | Tests against your application, plus appropriate review |
| What changed, failed, or remains untested? | OpenThunder's repository checks and evidence |

## 1. Try a boundary before adopting a language

Open the [interactive rule on the homepage](/#contract-lab). Change `<=` to `<`. The $100 case fails because the rule excludes its own limit. Repair it, then download `RefundReview.thunder`.

Every result comes from the compiler running in your browser. The download contains the displayed rule and all five cases, including the broken rule if you download before repairing it.

## 2. Keep the contract next to the code

Save the file as `contracts/RefundReview.thunder` in your project. Review the rule and expected results as carefully as code. A passing test can still encode the wrong business requirement.

With the ThunderLang CLI installed:

```sh
thunder check contracts/RefundReview.thunder
thunder test contracts/RefundReview.thunder
thunder prove contracts/RefundReview.thunder
```

`check` examines syntax and supported semantic constraints. `test` executes declared cases. `prove` produces an evidence artifact; the command name does not mean the entire application is formally proven.

## 3. Inspect it from OpenThunder

From an OpenThunder checkout, using its CLI, or from an installation exposing the `openthunder` command:

```sh
openthunder intent prove --repo /path/to/your/project
openthunder intent prove --repo /path/to/your/project --json
```

The improved integration reports generated artifacts separately from executed cases. Failed cases include their target, case name, expected result, and actual result. JSON and text modes use the same failure policy.

**Release compatibility:** strict claim binding requires a compiler exporting `resolveObligations`. The local development compiler includes it. OpenThunder’s installed 0.4.2 compiler does not; OpenThunder can run their cases but leaves claim bindings declared and explains the limitation. These integration changes must be released before they are available in an existing installation.

## 4. Understand each status

- **Verified by named cases:** every verification reference resolves to a test target and all its declared cases pass. This covers those cases only.
- **Failed:** a referenced case failed.
- **Declared:** a check is named but has not been resolved or executed as claim evidence. An external test mentioned in prose does not become passing evidence.
- **Needs verification:** no verification is named.
- **Untested:** no cases exercised behavior. Successful parsing is not a test result.

References use a complete, case-sensitive target name: `verify RefundPolicy` or `verify test RefundPolicy`. `verify Refund` does not bind to `RefundPolicy`. If a claim names two checks, one passing check cannot stand in for both. Older fuzzy references such as `verify RefundPolicy test` must be rewritten as `verify test RefundPolicy`; otherwise they remain declared.

## 5. Connect the rule to the implementation

Add application tests for $99, $100, $101, negative amounts, and an expired refund window. Run those tests against the real refund implementation. Include input validation, currency precision, permissions, and failure handling appropriate to your application; this starter does not implement them.

For generated code, use the supported conformance tools to compare declared cases across available targets. This is distinct from testing an existing service. A pattern-based `verify-diff` scan can provide another signal, but it is not a general behavioral proof and can miss violations or flag safe changes.

## 6. Make the next change easier to review

The [Evidence review page](/review) accepts your contracts and the JSON output of `openthunder intent prove`. It reruns the contracts locally, compares source hashes and compiler versions, and exports an agent brief with failed cases and unresolved claims. See [Atlas review for AI changes](/docs/atlas-review) for CLI, MCP, CI, and release compatibility details. A matching imported snapshot describes declared intent; it does not turn application behavior into verified evidence.

Keep the contract, implementation tests, and result in the same change review. When the limit changes, reviewers can see the old and new rule, the newly relevant cases, and any checks that did not run. Never silently update an expected result just to make the test pass.

For CI, configure the command as a required check if you want failures to prevent merging. The default exit status describes evaluated failures. Use `openthunder intent prove --repo . --strict` to require cases in every discovered file and no unresolved claims; add `--json` for machine-readable results. Exit 1 means a check failed, and exit 2 means required evidence is unavailable or incomplete. Even strict success covers declared cases, not all possible behavior.

The useful unit of adoption is one repeatable rule with evidence, not an entire repository full of unreviewed generated intent.
