# ThunderLang for AI agents (MCP)

AI writes code faster than a human can review it. ThunderLang closes that gap deterministically, and it plugs straight into your coding agent over the Model Context Protocol (MCP). The compiler ships an MCP server that exposes the whole verify-real-code loop as tools an agent can call, so the agent can prove its own change against your intent before it ships. No AI runs inside the check; the answer is a deterministic PASS or BLOCK.

## Install in one line

The server is the `mcp` subcommand of the CLI, spoken over stdio. Point any MCP client at it.

Claude Code:

```bash
claude mcp add thunderlang -- npx -y @skillstech/thunderlang mcp
```

Cursor (add to `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` for all projects):

```json
{
  "mcpServers": {
    "thunderlang": {
      "command": "npx",
      "args": ["-y", "@skillstech/thunderlang", "mcp"]
    }
  }
}
```

Any other MCP client: run `npx -y @skillstech/thunderlang mcp` (or `thunder mcp` if the package is installed) as a stdio server. If you already have the package installed globally, use `thunder` in place of `npx -y @skillstech/thunderlang`.

## The tools

The gate is the one to reach for first; the rest support and record the loop.

| Tool | What it does |
| --- | --- |
| `intent_verify_diff` | THE gate. Given the intent and a proposed code change, returns PASS or BLOCK. Blocks on regressions (a guarantee that held before and breaks after) and guardrail hits (a new line that leaks a protected secret). Call it on your own change before shipping. |
| `intent_drift` | Standing guard: does the code, as it is today, still satisfy the intent? No diff needed. |
| `intent_prove` | Emit the durable `intent-proof-v1` artifact: per-claim verdicts plus a freshness tuple. Call it after the gate passes to record what was proven. |
| `intent_conform` | Grade cross-target conformance: the same test cases against every target implementation. |
| `intent_lift` | Bootstrap a humble intent draft from code you already have. |
| `intent_draft` | Turn a structured brief into a rigorous intent draft plus a human review checklist. |
| `intent_check` | Run semantic diagnostics on intent source. |
| `intent_run` | Evaluate a decision against concrete inputs, with a first-hit trace. |
| `intent_test` | Run the in-file test blocks; the spec proves itself. |
| `intent_graph` | Build the canonical Intent Graph (intent-graph-v1). |
| `intent_explain` | Explain any diagnostic code. |

## How an agent drives the loop

1. **Bootstrap.** On an existing codebase, call `intent_lift` to recover a candidate intent, then have a human approve it. Or use `intent_draft` to turn a request into a draft to approve. The draft is never treated as verified.
2. **Gate every change.** Before the agent ships a diff, it calls `intent_verify_diff` with the approved intent, the code `before`, and the code `after`. On BLOCK, the agent does not ship: it reads the failing guarantee or guardrail and fixes the code, then re-checks.
3. **Record the proof.** After PASS, `intent_prove` writes the proof artifact so the result is durable and its freshness is tracked.
4. **Stand guard.** `intent_drift` re-checks the living code against the intent between changes.

The point: an agent that refuses to ship its own change on BLOCK is proof you can watch, not a promise you have to trust. For the same loop from the command line and in CI, see [Verifying AI code changes](/docs/verifying-ai-changes) and [Testing and verification](/docs/testing-and-verification).
