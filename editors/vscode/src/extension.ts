import { workspace, ExtensionContext } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  Executable,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

// Start the ThunderLang language server (`intent lsp`) and wire it to .intent files.
// The `intent` CLI (@skillstech/thunderlang) must be on PATH, or set thunderlang.serverCommand.
export function activate(_context: ExtensionContext): void {
  const command = workspace.getConfiguration("thunderlang").get<string>("serverCommand") || "intent";
  const server: Executable = { command, args: ["lsp"], transport: TransportKind.stdio };

  const serverOptions: ServerOptions = { run: server, debug: server };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "intent" }],
    synchronize: { fileEvents: workspace.createFileSystemWatcher("**/*.intent") },
  };

  client = new LanguageClient("thunderlang", "ThunderLang", serverOptions, clientOptions);
  void client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
