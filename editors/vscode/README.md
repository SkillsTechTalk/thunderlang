# ThunderLang for VS Code

AI can write the code. You should still be able to read its rules. ThunderLang writes a
program's decisions and business rules (refunds, access, pricing, eligibility) in a form
people can read, and its compiler checks every change, including AI changes, against
them. See [thunderlang.dev](https://thunderlang.dev).

This extension lets you read and edit those rules in VS Code (`.thunder`, `.tl`,
`.intent` files). Everything runs on your machine:

- **Syntax highlighting** via a TextMate grammar (`source.thunder`).
- **Diagnostics, completion, and hover** via the ThunderLang Language Server, the same
  deterministic compiler the CLI uses. No AI involved.
- **Editing basics**: `#` line comments, bracket pairing, and indentation hints for
  block keywords (ThunderLang is indentation-structured).

## Requirements

The extension is a thin client. It needs the ThunderLang compiler, which ships the
language server (`thunder lsp`). Install it globally:

```bash
npm install -g @skillstech/thunderlang
```

## How the server is found

When a ThunderLang file is opened, the extension resolves the server in this order:

1. The `thunderlang.serverPath` setting, if set.
2. A workspace-local install: `node_modules/.bin/thunder`, the
   `@skillstech/thunderlang` package inside `node_modules`, or a compiler checkout at
   `compiler/src/cli.mjs` (as in the ThunderLang repo itself). Scripts are launched
   with `node <script> lsp`.
3. `thunder` from your PATH, run as `thunder lsp`.

If no server can be started, the extension shows an error explaining how to install
the compiler or configure the setting.

### The `thunderlang.serverPath` setting

- Empty (the default): auto-detect as described above, falling back to `thunder` on
  PATH.
- A command name or executable path (for example `/usr/local/bin/thunder`): invoked
  as `<command> lsp`.
- A path ending in `.js`, `.mjs`, or `.cjs` (for example
  `/path/to/thunderlang/compiler/src/cli.mjs`): invoked as `node <path> lsp`.

## Develop

```bash
cd editors/vscode
npm install
npm run compile   # type-checks and emits out/extension.js
```

Open `editors/vscode` in VS Code and press F5 ("Run Extension") to start an Extension
Development Host with the extension loaded. Open any `.thunder` file, for example one
from the repo's `examples/` directory.

## Package

```bash
npx vsce package
```

This produces `thunderlang-0.5.4.vsix`, which you can install locally via the
Extensions view: "..." menu, then "Install from VSIX".

## Publish (maintainers only)

Releases publish automatically. When a new version in `package.json` lands on `main`, the
[Release workflow](../../.github/workflows/release.yml) publishes it to the Marketplace under the
`openthunder` publisher through trusted publishing (no stored token). Keep the version in step with
`compiler/package.json`.

To publish by hand instead: `npx vsce package` (Node 20 or newer), then upload the `.vsix` at
marketplace.visualstudio.com/manage/publishers/openthunder.
