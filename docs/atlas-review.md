# Atlas review for AI changes

Before an agent changes code, give it a contract and an evidence gap it can address. After the change, run the same contract cases and inspect what moved.

The [Evidence review page](/review) runs the compiler locally in your browser. Open `.thunder`, `.tl`, or `.intent` files, inspect claims and cases, edit a contract, and download a review brief. Contract contents are not uploaded. The page starts with real agent permission, spending, and research workflow examples. “Break budget boundary” changes `<=` to `<`; the exact-budget case fails.

## Review a repository

Using the compiler in this checkout:

```sh
node compiler/src/cli.mjs atlas ./examples --review
node compiler/src/cli.mjs atlas ./examples --review --json
node compiler/src/cli.mjs atlas ./examples --agent-brief > agent-brief.md
```

After installing a release containing the review Atlas, the equivalent command is `thunder atlas ./contracts --review`. These additions are currently local development features; older published compilers do not support them.

The `intent-review-atlas-v1` report includes repository-relative paths, source hashes, the compiler version, diagnostics, executed cases, claim-to-test bindings, snapshot comparisons, and a prioritized review queue. It is deterministic for the same inputs and has no timestamp. The agent brief is bounded to 20 files by default; JSON contains the full queue. Repository-derived names and case labels are quoted as data.

| Status | Meaning |
| --- | --- |
| Cases checked | Cases ran successfully, declared claims resolved to passing named cases, and no identity or imported snapshot gaps remain |
| Needs evidence | Cases or claim bindings are missing, identities collide, or an imported snapshot is incomplete or stale |
| Failed cases | The contract has a failed case or claim |
| Invalid contract | Compiler diagnostics prevent relying on the contract |

Passing cases cover their declared inputs. They do not certify the requirement, application code, all possible inputs, or deployment readiness. A contract without claims can be “cases checked”; the claim count stays zero.

## Bring OpenThunder evidence into Atlas

Export from the repository whose contracts you are reviewing:

```sh
openthunder intent prove --repo . --json > openthunder-evidence.json
thunder atlas . --review --openthunder openthunder-evidence.json --json
```

You can also open those contracts in the browser and choose **Import OpenThunder report**. The updated OpenThunder exporter emits `openthunder-intent-evidence-v1` with scope `declared-intent`; Atlas also accepts the earlier unversioned `intent prove` envelope. Individual `intent-proof-v1` artifacts are not that envelope.

A snapshot matches only when both its exact source hash and compiler version match the local evaluation. File paths join first; if a browser omits directories, a source hash must be unique on both sides. Atlas never joins by basename alone. Duplicate file paths or mission identities require review. Any source edit, including a comment, invalidates the corresponding source hash.

“Matched” describes source and compiler identity, not authenticity or implementation correctness. Imported statuses never promote local claim verdicts. A compiler version change requires regenerating evidence with the matching compiler. OpenThunder's installed 0.4.2 dependency therefore appears stale against the local 0.5.0 compiler; release the compiler and update OpenThunder's dependency before expecting matching reports in normal installations.

Even with matching identity, missing checks, unavailable strict claim bindings, or case results inconsistent with local execution remain unavailable. A matching snapshot reporting a failed check stays flagged for review.

## Give an agent the same view

The `intent_atlas` MCP tool accepts:

```json
{
  "files": [{ "path": "contracts/Policy.thunder", "source": "mission Policy\n" }],
  "strict": true
}
```

The result includes `atlas`, `brief`, `ok`, and `exitCode`. An optional `evidence` field accepts the OpenThunder envelope. The tool accepts up to 100 files and 1 MB of source characters. It executes contract cases in the compiler, never shell commands supplied by a repository. Configure the server with `thunder mcp`; see [MCP setup](/docs/mcp).

## CI policy

```sh
thunder atlas ./contracts --review --strict --json
```

Exit **1** means compiler errors, evaluated failures, or a matching OpenThunder snapshot reporting failed checks. Exit **2** in strict mode means no contracts or incomplete evidence: every file needs cases, all declared claims must resolve, and identity or imported snapshot gaps must be addressed. Exit **0** means the requested contract checks passed. Without strict mode, missing evidence is reported but does not fail the command. An OpenThunder report is optional in either mode. Invalid inputs or unreadable reports fail the command.

The original `thunder atlas --search` and `--expand` graph navigation remains available separately from review mode.

## Put the policies in the host

- `examples/AgentToolAuthorization.thunder` tests scoped reads, approved writes, denied writes, and an approval that cannot expand scope. Enforce the decision at the tool host before execution.
- `examples/AgentSpendBudget.thunder` tests cost admission at and around the budget boundary. The host still needs integer validation, atomic reservations across concurrent calls, and actual-cost reconciliation.
- `examples/ResearchAgentRun.thunder` illustrates a broader workflow where passing control-loop cases coexist with unresolved citation and allowlist checks.

Keep application tests next to the contract and review changes to expected outcomes. Atlas makes the remaining work visible; OpenThunder provides the repository workflow to carry it out.
