# Getting Started

Ten minutes from install to running, testing, and gating intent. Everything here is
deterministic and runs with no AI.

## 1. Install

```bash
npm install -g @skillstech/intentlang
intent help
```

## 2. Scaffold a mission

```bash
intent init Eligibility
```

That writes `Eligibility.intent`, a real starter with a goal, a guarantee, a `never`
rule, an executable `decision`, and in-file `test` cases. It is valid and runnable out of
the box.

## 3. Run it (no code, no AI)

A decision is a program. Give it inputs and it decides:

```bash
intent run Eligibility.intent --inputs '{"age":20}'
#   decision Example: Allowed  [rule: adult]
```

The trace shows which rule fired. Change the input and the result changes,
deterministically, before any implementation exists.

## 4. Test it, in the same file

The `test` blocks assert behavior through the same runtime:

```bash
intent test Eligibility.intent
#   intent test Eligibility.intent: 2/2 passed
```

The `.intent` file is now self-verifying. No test framework, no code.

## 5. Format it

```bash
intent fmt Eligibility.intent --write
```

Canonical whitespace, comments preserved. Use `intent fmt . --check` in CI to keep a
whole tree consistent.

## 6. Check it

```bash
intent check Eligibility.intent
```

Diagnostics for one file, or gate a whole repo at once:

```bash
intent check .        # recurses every .intent, exits non-zero on any error
```

Add it to CI with the GitHub Action:

```yaml
- uses: SkillsTechTalk/intent-language@main
  with:
    paths: ./intent
```

## 7. Edit with intelligence

Install the [editor support](/docs/editor-support): the Language Server (`intent lsp`)
gives live diagnostics, completion, and hover in VS Code, Neovim, and any LSP editor,
plus syntax highlighting via the shipped grammar.

## 8. Go further

- **Executable intent** in depth: the [Intent Runtime](/docs/intent-runtime) and
  [first-class tests](/docs/intent-tests).
- **Interop**: [export](/docs/export-adapters) to DMN/BPMN/JSON-Schema/OpenAPI and
  [import](/docs/import-adapters) back.
- **The whole language**: the [syntax overview](/docs/syntax-overview) and the
  [specification](/docs/spec).
- **The model everyone builds on**: [Intent for every role](/docs/intent-graph).
- **Already have a codebase?** [Adopt IntentLang on it](/docs/adopting-intentlang): lift,
  review, check, gate, and keep in sync , one mission at a time.

The whole loop, author, run, test, format, gate, in one deterministic toolchain. That is
what beyond prompt engineering looks like in practice.
