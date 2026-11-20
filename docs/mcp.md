# ThunderLang for AI agents (MCP)

AI writes code faster than a human can review it. ThunderLang closes that gap deterministically, and it plugs straight into your coding agent over the Model Context Protocol (MCP). The compiler ships an MCP server that exposes the whole verify-real-code loop as tools an agent can call, so the agent can prove its own change against your intent before it ships. No AI runs inside the check; the answer is a deterministic PASS or BLOCK.

## Install in one line

The server is the `mcp` subcommand of the CLI, spoken over stdio. Point any MCP client at it.

Claude Code:

```bash
claude mcp add thunderlang -- npx -y @skillstech/thunderlang mcp
```

Codex (OpenAI's coding agent: the Codex CLI, the Codex IDE extension, and Codex in the ChatGPT desktop app share one configuration):

```bash
codex mcp add thunderlang -- npx -y @skillstech/thunderlang mcp
```

Or add it by hand to `~/.codex/config.toml` (or `.codex/config.toml` in a trusted project):

```toml
[mcp_servers.thunderlang]
command = "npx"
args = ["-y", "@skillstech/thunderlang", "mcp"]
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

### ChatGPT and other remote clients

ChatGPT connects to MCP servers over HTTPS, not stdio. ThunderLang hosts a public endpoint:

```text
https://thunderlang.dev/api/mcp
```

In ChatGPT, turn on developer mode (Settings, then Apps and Connectors, then Advanced), create a connector, and paste that URL. It needs no sign-in. Codex can use the same URL instead of a local process:

```toml
[mcp_servers.thunderlang]
url = "https://thunderlang.dev/api/mcp"
```

The hosted endpoint serves only tools that are pure functions of what you send: it never reads files, git, or anything else on the server, so `intent_prove` and `intent_read_repo` (which read your local repository) are local-only. Send one file or module at a time (256 KB per request). Code you send is processed to answer the call and is not stored.

## Tell your agent when to use it

Paste this into `CLAUDE.md` (Claude Code) or `AGENTS.md` (Codex and most other agents):

```markdown
## ThunderLang

- Business rules live in `*.thunder` files. Read the relevant one before changing the code that implements it.
- To understand unfamiliar code, call `intent_read` with the file and the language the reader knows.
- Before finishing a change to code a `.thunder` file covers, call `intent_verify_diff` with the intent, the code before, and the code after. On BLOCK, fix the code; never edit the intent to make the check pass.
- New rules: write them with `intent_human` (plain-language contract plus examples) and get a person to approve them.
```

## The tools

The gate is the one to reach for first; the rest support and record the loop.

| Tool | What it does |
| --- | --- |
| `intent_verify_diff` | THE gate. Given the intent and a proposed code change, returns PASS or BLOCK. Blocks on regressions (a guarantee that held before and breaks after) and guardrail hits (a new line that leaks a protected secret). Call it on your own change before shipping. |
| `intent_drift` | Standing guard: does the code, as it is today, still satisfy the intent? No diff needed. |
| `intent_prove` | (Local only.) Emit the durable `intent-proof-v1` artifact: per-claim verdicts plus a freshness tuple. Call it after the gate passes to record what was proven. |
| `intent_conform` | Grade cross-target conformance: the same test cases against every target implementation. |
| `intent_lift` | Bootstrap a humble intent draft from code you already have. |
| `intent_draft` | Turn a structured brief into a rigorous intent draft plus a human review checklist. |
| `intent_check` | Run semantic diagnostics on intent source. |
| `intent_run` | Evaluate a decision against concrete inputs, with a first-hit trace. |
| `intent_test` | Run the in-file test blocks; the spec proves itself. |
| `intent_graph` | Build the canonical Intent Graph (intent-graph-v1). |
| `intent_explain` | Explain any diagnostic code. |
| `intent_read` | Read code you don't know. Recovers the decision rules in TypeScript, JavaScript, Python, Go, Rust, C#, Java, Kotlin, PHP, or Ruby as ThunderLang and plain English, with search, kind filters, and an optional rewrite in a language you know. Anything it cannot read is listed, never guessed. |
| `intent_read_repo` | (Local only.) Read a whole repository into one searchable index: routes, decisions, checks, errors, and tests with file and line. Filter by text, kind, language, folder, an answer the code gives or fails with, or an input a rule uses. |
| `intent_promote` | Turn a decision recovered from code into a readable contract with starter examples at every rule and threshold. The examples record what the code does today, so a person confirms each answer before relying on it. |
| `intent_translate` | Generate the decisions in ThunderLang source as readable, typed TypeScript, Python, Go, Rust, C#, or Java. |
| `intent_human` | Check a contract written in the readable notation: run every example and return pass or fail per case. |

## How an agent drives the loop

1. **Bootstrap.** On an existing codebase, call `intent_lift` to recover a candidate intent, then have a human approve it. Or use `intent_draft` to turn a request into a draft to approve. The draft is never treated as verified.
2. **Gate every change.** Before the agent ships a diff, it calls `intent_verify_diff` with the approved intent, the code `before`, and the code `after`. On BLOCK, the agent does not ship: it reads the failing guarantee or guardrail and fixes the code, then re-checks.
3. **Record the proof.** After PASS, `intent_prove` writes the proof artifact so the result is durable and its freshness is tracked.
4. **Stand guard.** `intent_drift` re-checks the living code against the intent between changes.

The point: an agent that refuses to ship its own change on BLOCK is proof you can watch, not a promise you have to trust. For the same loop from the command line and in CI, see [Verifying AI code changes](/docs/verifying-ai-changes) and [Testing and verification](/docs/testing-and-verification).

`intent_read`, `intent_translate`, `intent_human`, and the hosted endpoint are new in ThunderLang 0.5. With an older installed package, use the hosted URL or update with `npx -y @skillstech/thunderlang@latest mcp`.
