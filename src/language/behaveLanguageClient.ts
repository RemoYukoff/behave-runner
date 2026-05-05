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
      command: "node",
      args: [serverModule],
      transport: TransportKind.stdio,
    },
    debug: {
      command: "node",
      args: ["--nolazy", "--inspect=6009", serverModule],
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
