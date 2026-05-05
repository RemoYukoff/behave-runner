import * as vscode from "vscode";
import {
  buildPythonBehaveDebugLaunchFromCliArgs,
  cancelActiveBehaveRun,
  getJustMyCodeForResource,
  registerBehaveOutputChannel,
  registerBehaveRunWorkspacePersistence,
  rerunLastBehaveRun,
  setBehaveRunnerServices
} from "./behaveRun";
import { registerBehaveCodeLens } from "./behaveCodeLens";
import { registerBehaveHierarchyStore } from "./behaveHierarchyModel";
import { createBehaveLanguageClient } from "./language/behaveLanguageClient";
import { registerBehaveLanguageFeatures } from "./language/registerBehaveLanguageFeatures";
import { registerLiveRunWebview, revealLiveRunPanel } from "./liveRunWebview";
import type { RunScenarioArgs } from "./types";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    await activateBehaveRunner(context);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Behave Runner: activate failed:", e);
    void vscode.window.showErrorMessage(
      `Behave Runner failed to activate: ${msg}`
    );
  }
}

async function activateBehaveRunner(
  context: vscode.ExtensionContext
): Promise<void> {
  const behaveLanguageClient = createBehaveLanguageClient(context);
  context.subscriptions.push(
    new vscode.Disposable(() => {
      void behaveLanguageClient.dispose();
    })
  );
  void behaveLanguageClient.start().catch((err) => {
    console.error("Behave Runner: language server failed to start:", err);
  });

  registerLiveRunWebview(context);

  const behaveStore = registerBehaveHierarchyStore(context);

  setBehaveRunnerServices({
    extensionUri: context.extensionUri,
    extensionPath: context.extensionPath ?? "",
    hierarchyStore: behaveStore
  });
  context.subscriptions.push({
    dispose: () => setBehaveRunnerServices(undefined)
  });

  registerBehaveRunWorkspacePersistence(context);
  registerBehaveOutputChannel(context);

  registerBehaveLanguageFeatures(context, {
    languageClient: behaveLanguageClient
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("behaveRunner.cancelRun", () => {
      cancelActiveBehaveRun();
    }),
    vscode.commands.registerCommand("behaveRunner.rerunLastRun", () => {
      void rerunLastBehaveRun();
    })
  );

  registerBehaveCodeLens(context, behaveStore);

  const debugScenarioCommand = vscode.commands.registerCommand(
    "behaveRunner.debugScenario",
    async (args: RunScenarioArgs) => {
      if (!args?.filePath) {
        vscode.window.showErrorMessage(
          "Behave Runner: missing scenario information."
        );
        return;
      }

      const scenarioName = args.scenarioName ?? "";
      if (!args.runAll && !scenarioName) {
        vscode.window.showErrorMessage(
          "Behave Runner: missing scenario name for debug."
        );
        return;
      }

      await revealLiveRunPanel();

      const justMyCode = getJustMyCodeForResource(args.filePath);
      const { workspaceFolder, config } = buildPythonBehaveDebugLaunchFromCliArgs({
        filePath: args.filePath,
        scenarioName,
        runAll: args.runAll,
        workspaceRoot: args.workspaceRoot,
        justMyCode
      });

      const started = await vscode.debug.startDebugging(
        workspaceFolder ?? undefined,
        config
      );
      if (!started) {
        vscode.window.showErrorMessage(
          "Behave Runner: failed to start debugger."
        );
      }
    }
  );

  context.subscriptions.push(debugScenarioCommand);
}

export function deactivate(): void {
  setBehaveRunnerServices(undefined);
}
