# ThunderLang for VS Code

Syntax highlighting and language intelligence for ThunderLang `.intent` files:

- **Highlighting** via the TextMate grammar (`source.intent`).
- **Diagnostics, completion, and hover** via the ThunderLang Language Server (`intent lsp`),
  the same deterministic compiler the CLI uses. No AI.

## Requirements

The `intent` CLI must be available. Install it globally:

```bash
npm install -g @skillstech/thunderlang
```

Or set `thunderlang.serverCommand` to an absolute path / `npx` invocation if `intent` is
not on your PATH.

## Build / package locally

The grammar is synced from the compiler at build time, so there is a single source of
truth.

```bash
cd editors/vscode
npm install
npm run compile        # syncs the grammar + type-checks + emits out/extension.js
npx @vscode/vsce package   # produces thunderlang-vscode-<version>.vsix
```

Install the `.vsix` in VS Code: Extensions view -> "..." -> Install from VSIX.

## What it does

On opening a `.intent` file the extension starts `intent lsp` and connects over stdio.
You get live diagnostics as you type, keyword/type completions, and hover docs for
semantic types. It contributes the `intent` language id for the `.intent` extension and
the `source.intent` grammar.
