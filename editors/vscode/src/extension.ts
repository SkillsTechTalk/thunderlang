import * as fs from "fs";
import * as path from "path";
import { workspace, window, ExtensionContext } from "vscode";
import {
  Executable,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

interface ResolvedServer {
  server: Executable;
  origin: string;
}

function nodeScriptServer(script: string): Executable {
  return { command: "node", args: [script, "lsp"], transport: TransportKind.stdio };
}

function commandServer(command: string): Executable {
  return { command, args: ["lsp"], transport: TransportKind.stdio };
}

// Resolve the command that starts the ThunderLang language server (LSP over stdio).
// Order: the thunderlang.serverPath setting, then a workspace-local compiler install,
// then `thunder` from PATH.
function resolveServer(): ResolvedServer | { error: string } {
  const configured = workspace
    .getConfiguration("thunderlang")
    .get<string>("serverPath", "")
    .trim();
  if (configured) {
    if (/\.(mjs|cjs|js)$/.test(configured)) {
      if (!fs.existsSync(configured)) {
        return {
          error: `thunderlang.serverPath is set to "${configured}", but that file does not exist.`,
        };
      }
      return { server: nodeScriptServer(configured), origin: "the thunderlang.serverPath setting" };
    }
    return { server: commandServer(configured), origin: "the thunderlang.serverPath setting" };
  }

  for (const folder of workspace.workspaceFolders ?? []) {
    const root = folder.uri.fsPath;
    const localBin = path.join(
      root,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "thunder.cmd" : "thunder"
    );
    if (fs.existsSync(localBin)) {
      return { server: commandServer(localBin), origin: "the workspace-local thunder binary" };
    }
    const localScripts = [
      path.join(root, "node_modules", "@skillstech", "thunderlang", "src", "cli.mjs"),
      path.join(root, "compiler", "src", "cli.mjs"),
    ];
    for (const script of localScripts) {
      if (fs.existsSync(script)) {
        return { server: nodeScriptServer(script), origin: `the workspace compiler at ${script}` };
      }
    }
  }

  return { server: commandServer("thunder"), origin: "PATH" };
}

export async function activate(_context: ExtensionContext): Promise<void> {
  const resolved = resolveServer();
  if ("error" in resolved) {
    void window.showErrorMessage(`ThunderLang: ${resolved.error}`);
    return;
  }

  const serverOptions: ServerOptions = { run: resolved.server, debug: resolved.server };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "thunder" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.{thunder,tl,intent}"),
    },
  };

  client = new LanguageClient("thunderlang", "ThunderLang", serverOptions, clientOptions);
  try {
    await client.start();
  } catch {
    client = undefined;
    void window.showErrorMessage(
      `ThunderLang: could not start the language server ("${resolved.server.command} lsp", resolved from ${resolved.origin}). ` +
        "Install the compiler with `npm install -g @skillstech/thunderlang`, or point the thunderlang.serverPath setting at a thunder executable or the compiler's cli.mjs."
    );
  }
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
