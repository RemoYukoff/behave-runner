import * as vscode from "vscode";
import {
  createBehaveRunSinks,
  setBehaveRunnerContext
} from "./behaveRunnerContext";
import {
  buildPythonBehaveDebugLaunchFromCliArgs,
  getJustMyCodeForResource
} from "./run/behavePythonDebug";
import {
  cancelActiveBehaveRun,
  logBehaveRunCancel
} from "./run/behaveRunCancellation";
import { registerBehaveOutputChannel } from "./run/behaveRunOutput";
import { registerBehaveRunWorkspacePersistence } from "./run/behaveRunLastRun";
import { rerunLastBehaveRun } from "./run/behaveRunRerun";
import { registerBehaveCodeLens } from "./behaveCodeLens";
import { registerBehaveHierarchyStore } from "./behaveHierarchyModel";
import {
  createBehaveLanguageClient,
  reportBehaveLanguageServerStartInitiated,
  reportBehaveLanguageServerStartResult,
  reportBehaveLanguageServerStopped
} from "./language/behaveLanguageClient";
import { registerBehaveLanguageFeatures } from "./language/registerBehaveLanguageFeatures";
import { registerLiveRunWebview, revealLiveRunPanel } from "./liveRunWebview";

/** Arguments for `behaveRunner.debugScenario` (e.g. keybindings). */
type RunScenarioArgs = {
  filePath: string;
  scenarioName?: string;
  runAll: boolean;
  workspaceRoot: string;
};

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
      reportBehaveLanguageServerStopped();
      void behaveLanguageClient.dispose();
    })
  );
  reportBehaveLanguageServerStartInitiated();
  void behaveLanguageClient
    .start()
    .then(
      () => {
        reportBehaveLanguageServerStartResult(true);
      },
      (err: unknown) => {
        reportBehaveLanguageServerStartResult(false);
        console.error("Behave Runner: language server failed to start:", err);
        void vscode.window.showErrorMessage(
          `Behave Runner: language server failed to start. Step navigation and diagnostics may be unavailable. (${err instanceof Error ? err.message : String(err)})`
        );
      }
    );

  registerLiveRunWebview(context);

  const behaveStore = registerBehaveHierarchyStore(context);

  const runSinks = createBehaveRunSinks();
  setBehaveRunnerContext({
    extensionUri: context.extensionUri,
    extensionPath: context.extensionPath ?? "",
    hierarchyStore: behaveStore,
    runSinks
  });
  context.subscriptions.push({
    dispose: () => setBehaveRunnerContext(undefined)
  });

  registerBehaveRunWorkspacePersistence(context);
  registerBehaveOutputChannel(context);

  registerBehaveLanguageFeatures(context, {
    languageClient: behaveLanguageClient
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("behaveRunner.cancelRun", () => {
      logBehaveRunCancel("command behaveRunner.cancelRun");
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
  setBehaveRunnerContext(undefined);
}
