import * as vscode from "vscode";
import { registerBehaveCodeLens } from "./behaveCodeLens";
import { registerBehaveHierarchyStore } from "./behaveHierarchyModel";
import { registerLiveRunWebview, revealLiveRunPanel } from "./liveRunWebview";
import {
  cancelActiveBehaveRun,
  registerBehaveOutputChannel,
  registerBehaveRunWorkspacePersistence,
  rerunLastBehaveRun,
  setBehaveHierarchyStoreRef,
  setBehaveRunnerExtensionPath
} from "./testController";
import type { RunScenarioArgs } from "./types";
import { BehaveDefinitionProvider } from "./stepDefinitionProvider";
import { getStepScanner, disposeStepScanner } from "./stepScanner";
import { BehaveReferenceProvider } from "./stepReferenceProvider";
import { BehaveStepUsageProvider } from "./stepUsageProvider";
import { getFeatureScanner, disposeFeatureScanner } from "./featureScanner";
import { StepCompletionProvider } from "./stepCompletionProvider";
import { StepDiagnosticsProvider } from "./stepDiagnosticsProvider";

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
  const languageSelector: vscode.DocumentSelector = [
    { language: "behave", scheme: "file" },
    { pattern: "**/*.feature" }
  ];

  const stepScanner = getStepScanner();
  try {
    await stepScanner.initialize();
  } catch (e) {
    console.error("Behave Runner: step scanner init failed:", e);
  }

  const featureScanner = getFeatureScanner();
  try {
    await featureScanner.initialize();
  } catch (e) {
    console.error("Behave Runner: feature scanner init failed:", e);
  }

  // Register the Definition Provider for Go to Definition (Ctrl+Click)
  const definitionProvider = new BehaveDefinitionProvider();
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      languageSelector,
      definitionProvider
    )
  );

  // Register the Reference Provider for Find References (from Python step decorators)
  const referenceProvider = new BehaveReferenceProvider();
  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(
      { language: "python", scheme: "file" },
      referenceProvider
    )
  );

  // Register the Definition Provider for Ctrl+Click on step functions (shows usages in .feature files)
  const stepUsageProvider = new BehaveStepUsageProvider();
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: "python", scheme: "file" },
      stepUsageProvider
    )
  );

  // Register the Completion Provider for step autocomplete in .feature files
  const completionProvider = new StepCompletionProvider();
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      languageSelector,
      completionProvider,
      " " // trigger after space
    )
  );

  // Register the Diagnostics Provider for undefined steps
  const diagnosticsProvider = new StepDiagnosticsProvider();
  context.subscriptions.push(diagnosticsProvider);

  // Refresh diagnostics when Python step files change
  const pythonWatcher = vscode.workspace.createFileSystemWatcher("**/*.py");
  pythonWatcher.onDidChange(() => diagnosticsProvider.refreshAll());
  pythonWatcher.onDidCreate(() => diagnosticsProvider.refreshAll());
  pythonWatcher.onDidDelete(() => diagnosticsProvider.refreshAll());
  context.subscriptions.push(pythonWatcher);

  // Clear definition cache when documents close to prevent memory leaks
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(() => {
      definitionProvider.clearCache();
    })
  );

  registerLiveRunWebview(context);
  setBehaveRunnerExtensionPath(context.extensionPath ?? "");
  registerBehaveRunWorkspacePersistence(context);
  registerBehaveOutputChannel(context);
  context.subscriptions.push(
    vscode.commands.registerCommand("behaveRunner.cancelRun", () => {
      cancelActiveBehaveRun();
    }),
    vscode.commands.registerCommand("behaveRunner.rerunLastRun", () => {
      void rerunLastBehaveRun();
    })
  );
  const behaveStore = registerBehaveHierarchyStore(context);
  setBehaveHierarchyStoreRef(behaveStore);
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

      const debugArgs = args.runAll
        ? [args.filePath]
        : [args.filePath, "-n", scenarioName];

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(
        vscode.Uri.file(args.filePath)
      );
      const justMyCode = getJustMyCodeSetting(args.filePath);
      const debugConfig: vscode.DebugConfiguration = {
        type: "python",
        request: "launch",
        name: args.runAll
          ? "Behave: Feature"
          : `Behave: Scenario ${scenarioName}`,
        module: "behave",
        args: debugArgs,
        cwd: args.workspaceRoot,
        console: "integratedTerminal",
        justMyCode
      };

      const started = await vscode.debug.startDebugging(
        workspaceFolder ?? undefined,
        debugConfig
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
  disposeStepScanner();
  disposeFeatureScanner();
}

function getJustMyCodeSetting(resourcePath: string): boolean {
  const resourceUri = vscode.Uri.file(resourcePath);
  const config = vscode.workspace.getConfiguration(
    "behaveRunner",
    resourceUri
  );
  return config.get<boolean>("debug.justMyCode", true);
}
