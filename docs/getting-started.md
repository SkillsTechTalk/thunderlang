# Getting Started

Five minutes from install to blocking a bad AI change on your own code. Everything here is
deterministic and runs with no AI.

## Install

```bash
npm install -g @skillstech/thunderlang
thunder help
```

No install needed to try it: prefix any command with `npx -y @skillstech/thunderlang` (for
example `npx -y @skillstech/thunderlang help`).

## Gate your first AI change

This is why ThunderLang exists: prove that an AI-written change still upholds what your code is
supposed to do, before it merges. You can run this on code you already have.

**1. Bootstrap a contract from your code** (14 languages supported):

```bash
npx -y @skillstech/thunderlang lift src/resetPassword.ts --out intent/
```

`lift` writes a humble draft and tells you, honestly, what a human still has to decide:

```text
[warning] INTENT_LIFT_NEEDS_HUMAN_REVIEW: This intent was inferred from code. A human must review goal, why, never rules, and verification.
[warning] INTENT_LIFT_SECURITY_REVIEW_NEEDED: Sensitive field names detected. Mark them Secret/Token/PII and add never-log rules.
```

Review the draft, add the rules that matter (for a reset flow, `never log the new password`), and
save it as `intent/ResetPassword.thunder`.

**2. Approve the reviewed intent** as the contract (the drift baseline):

```bash
npx -y @skillstech/thunderlang approve intent/ResetPassword.thunder --by "you"
```

**3. An AI proposes a change. Gate it before you ship:**

```bash
npx -y @skillstech/thunderlang verify-diff intent/ResetPassword.thunder \
  --before src/resetPassword.ts --after ai-change.ts
```

If the AI's change adds a line that logs the new password, the gate refuses it:

```text
thunder verify-diff ResetPassword.thunder vs ai-change.ts: BLOCK (1 blocking, 1 regression(s))
  [VIOLATION] Added code may violate never-rule "log the new password": console.log("resetting password", { email, newPassword });  (line 2)
```

Exit code is 1. That non-zero exit is the whole point: drop `verify-diff` into CI or an agent loop
and a change that breaks the contract cannot merge. No AI ran; the verdict is deterministic. To wire
the same gate directly into your coding agent, see [ThunderLang for AI agents (MCP)](/docs/mcp).

## Author intent from scratch

The gate is most powerful over intent you wrote deliberately. The rest of the toolchain builds that
intent up and proves it, all deterministically.

Scaffold a real starter mission:

```bash
thunder init Eligibility
```

That writes `Eligibility.thunder` with a goal, a guarantee, a `never` rule, an executable
`decision`, and in-file `test` cases. It is valid and runnable out of the box.

## Run it (no code, no AI)

A decision is a program. Give it inputs and it decides:

```bash
thunder run Eligibility.thunder --inputs '{"age":20}'
#   decision Example: Allowed  [rule: adult]
```

The trace shows which rule fired. Change the input and the result changes, deterministically, before
any implementation exists.

## Test it, in the same file

The `test` blocks assert behavior through the same runtime:

```bash
thunder test Eligibility.thunder
#   thunder test Eligibility.thunder: 2/2 passed
```

The `.thunder` file is now self-verifying. No test framework, no code.

## Format and check

```bash
thunder fmt Eligibility.thunder --write   # canonical whitespace, comments preserved
thunder check .                           # recurses every .thunder, exits non-zero on any error
```

Gate a whole repo in CI with the GitHub Action:

```yaml
- uses: SkillsTechTalk/thunderlang@main
  with:
    paths: ./intent
```

## Edit with intelligence

Install the [editor support](/docs/editor-support): the Language Server (`thunder lsp`) gives live
diagnostics, completion, and hover in VS Code, Neovim, and any LSP editor, plus syntax highlighting
via the shipped grammar.

## Go further

- **Gate AI changes** in depth, plus CI recipes: [Verifying AI code changes](/docs/verifying-ai-changes).
- **Drive the loop from your agent**: [ThunderLang for AI agents (MCP)](/docs/mcp).
- **Executable intent**: the [Intent Runtime](/docs/intent-runtime) and [first-class tests](/docs/intent-tests).
- **Interop**: [export](/docs/export-adapters) to DMN/BPMN/JSON-Schema/OpenAPI and [import](/docs/import-adapters) back.
- **The whole language**: the [syntax overview](/docs/syntax-overview) and the [specification](/docs/spec).
- **Already have a codebase?** [Adopt ThunderLang on it](/docs/adopting-thunderlang): lift, review, check, gate, and keep in sync, one mission at a time.

The whole loop, author, run, test, gate, in one deterministic toolchain. That is what beyond prompt
engineering looks like in practice.
