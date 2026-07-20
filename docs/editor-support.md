# Editor Support (Language Server)

ThunderLang ships a **Language Server**, so any editor that speaks the Language Server
Protocol (VS Code, Neovim, Helix, Sublime LSP, Emacs eglot, ...) gets live ThunderLang
intelligence: diagnostics as you type, keyword and type completions, and hover docs for
semantic types and note lenses. It wraps the same deterministic compiler the CLI uses,
no AI, no network.

## Start it

```
thunder lsp
```

That runs the server over stdio (LSP `Content-Length`-framed JSON-RPC on stdin/stdout).
You do not run it directly; your editor launches it and talks to it.

## What it provides

- **Diagnostics** (`textDocument/publishDiagnostics`) on open and on every change: the full
  semantic pass (missing goals, unverified guarantees, undefined lifecycle states,
  purpose-limitation gaps, and the rest of the `IL-*` catalog), each anchored to the
  relevant line and carrying its code and the "why".
- **Completion** (`textDocument/completion`): block keywords and semantic types, with
  snippet insert text.
- **Hover** (`textDocument/hover`): markdown docs for semantic types and ThunderLens notes.

## Wire it up

### Neovim (built-in LSP)

```lua
vim.api.nvim_create_autocmd("FileType", {
  pattern = "intent",
  callback = function()
    vim.lsp.start({
      name = "thunderlang",
      cmd = { "intent", "lsp" },
      root_dir = vim.fs.dirname(vim.fs.find({ ".git" }, { upward = true })[1]),
    })
  end,
})
-- map the .thunder extension to the `intent` filetype
vim.filetype.add({ extension = { intent = "intent" } })
```

### VS Code

A ready-to-build extension lives in the repo at `editors/vscode/`. It contributes the
`intent` language + the grammar and starts the language server:

```bash
cd editors/vscode
npm install
npm run compile              # syncs the grammar, type-checks, emits out/extension.js
npx @vscode/vsce package     # -> thunderlang-vscode-<version>.vsix, install via "Install from VSIX"
```

The extension runs `thunder lsp` (configurable via `thunderlang.serverCommand`), so install
the CLI too (`npm install -g @skillstech/thunderlang`).

### Any LSP client

Point it at the command `thunder lsp` (stdio transport) for documents with the `.thunder`
extension. The server advertises its capabilities in the `initialize` response.

## Syntax highlighting

The Language Server provides semantics (diagnostics, completion, hover). For coloring,
the package ships a **TextMate grammar** at `syntaxes/intent.tmLanguage.json` (scope
`source.thunder`), the format VS Code, GitHub Linguist, and most editors use. It colors
comments, strings, block keywords, typed fields (`name: Type`), semantic/entity types,
expression operators, and numbers.

Point your editor's grammar registration at that file for `.thunder` files. In a VS Code
extension, reference it in `package.json`:

```json
"contributes": {
  "languages": [{ "id": "intent", "extensions": [".thunder"] }],
  "grammars": [{
    "language": "intent",
    "scopeName": "source.thunder",
    "path": "./syntaxes/intent.tmLanguage.json"
  }]
}
```

## The library

`startLspServer({ readable, writable })` is exported from `@skillstech/thunderlang` if you
want to embed the server (for example over a different transport or in a test). It is the
same server the `thunder lsp` command runs.
