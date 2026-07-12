# Editor Support (Language Server)

IntentLang ships a **Language Server**, so any editor that speaks the Language Server
Protocol (VS Code, Neovim, Helix, Sublime LSP, Emacs eglot, ...) gets live IntentLang
intelligence: diagnostics as you type, keyword and type completions, and hover docs for
semantic types and note lenses. It wraps the same deterministic compiler the CLI uses,
no AI, no network.

## Start it

```
intent lsp
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
- **Hover** (`textDocument/hover`): markdown docs for semantic types and IntentLens notes.

## Wire it up

### Neovim (built-in LSP)

```lua
vim.api.nvim_create_autocmd("FileType", {
  pattern = "intent",
  callback = function()
    vim.lsp.start({
      name = "intentlang",
      cmd = { "intent", "lsp" },
      root_dir = vim.fs.dirname(vim.fs.find({ ".git" }, { upward = true })[1]),
    })
  end,
})
-- map the .intent extension to the `intent` filetype
vim.filetype.add({ extension = { intent = "intent" } })
```

### VS Code

A thin extension registers the `.intent` language and starts the server with
`vscode-languageclient`:

```ts
import { LanguageClient, TransportKind } from "vscode-languageclient/node";

const client = new LanguageClient(
  "intentlang",
  "IntentLang",
  { command: "intent", args: ["lsp"], transport: TransportKind.stdio },
  { documentSelector: [{ scheme: "file", language: "intent" }] },
);
client.start();
```

### Any LSP client

Point it at the command `intent lsp` (stdio transport) for documents with the `.intent`
extension. The server advertises its capabilities in the `initialize` response.

## The library

`startLspServer({ readable, writable })` is exported from `@skillstech/intentlang` if you
want to embed the server (for example over a different transport or in a test). It is the
same server the `intent lsp` command runs.
