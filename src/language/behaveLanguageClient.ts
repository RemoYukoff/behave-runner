import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

export type BehaveLanguageServerHealth =
  | "stopped"
  | "starting"
  | "ready"
  | "failed";

let languageServerHealth: BehaveLanguageServerHealth = "stopped";

export function getBehaveLanguageServerHealth(): BehaveLanguageServerHealth {
  return languageServerHealth;
}

export function reportBehaveLanguageServerStartInitiated(): void {
  languageServerHealth = "starting";
}

export function reportBehaveLanguageServerStartResult(ok: boolean): void {
  languageServerHealth = ok ? "ready" : "failed";
}

export function reportBehaveLanguageServerStopped(): void {
  languageServerHealth = "stopped";
}

/** Run `server.js` with the editor's bundled Node-compatible runtime (no `node` on PATH). */
function languageServerExecutableEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
}

export function createBehaveLanguageClient(
  context: vscode.ExtensionContext
): LanguageClient {
  const serverModule = path.join(
    context.extensionPath,
    "node_modules",
    "@behave-runner",
    "lsp",
    "out",
    "server.js"
  );

  const serverOptions: ServerOptions = {
    run: {
      command: process.execPath,
      args: [serverModule],
      options: { env: languageServerExecutableEnv() },
      transport: TransportKind.stdio,
    },
    debug: {
      command: process.execPath,
      args: ["--nolazy", "--inspect=6009", serverModule],
      options: { env: languageServerExecutableEnv() },
      transport: TransportKind.stdio,
    },
  };

  const pyWatcher = vscode.workspace.createFileSystemWatcher("**/*.py");
  const featureWatcher = vscode.workspace.createFileSystemWatcher(
    "**/*.feature"
  );

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "behave" },
      { scheme: "file", pattern: "**/*.feature" },
    ],
    synchronize: {
      fileEvents: [pyWatcher, featureWatcher],
    },
    diagnosticCollectionName: "behave",
  };

  context.subscriptions.push(pyWatcher, featureWatcher);

  return new LanguageClient(
    "behaveRunnerLanguageServer",
    "Behave Language Server",
    serverOptions,
    clientOptions
  );
}
