import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import { BehaveDefinitionProvider } from "./stepDefinitionProvider";
import { getStepScanner, disposeStepScanner } from "./stepScanner";
import { BehaveReferenceProvider } from "./stepReferenceProvider";
import { BehaveStepUsageProvider } from "./stepUsageProvider";
import { getFeatureScanner, disposeFeatureScanner } from "./featureScanner";
import { StepCompletionProvider } from "./stepCompletionProvider";
import { StepDiagnosticsProvider } from "./stepDiagnosticsProvider";
import { BehaveCodeLensProvider } from "./codeLensProvider";
import { FeatureFormattingProvider } from "./featureFormattingProvider";
import { RunScenarioArgs, InterpreterInfo } from "./types";
import { logger } from "./logger";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Initialize logger first
  logger.initialize(context);
  logger.info("Behave Runner extension activating...");

  const codeLensProvider = new BehaveCodeLensProvider();
  const languageSelector: vscode.DocumentSelector = [
    { language: "behave", scheme: "file" },
    { pattern: "**/*.feature" },
  ];

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(languageSelector, codeLensProvider)
  );

  // Initialize the step scanner for Go to Definition
  logger.debug("Initializing step scanner...");
  const stepScanner = getStepScanner();
  await stepScanner.initialize();
  logger.info(`Step scanner initialized with ${stepScanner.getAllDefinitions().length} definitions`);

  // Initialize the feature scanner for Find References
  logger.debug("Initializing feature scanner...");
  const featureScanner = getFeatureScanner();
  await featureScanner.initialize();
  logger.info(`Feature scanner initialized with ${featureScanner.getAllSteps().length} steps`);

  // Register the Definition Provider for Go to Definition (Ctrl+Click)
  const definitionProvider = new BehaveDefinitionProvider();
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(languageSelector, definitionProvider)
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

  // Register the Formatting Provider for .feature files
  const formattingProvider = new FeatureFormattingProvider();
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      languageSelector,
      formattingProvider
    ),
    vscode.languages.registerDocumentRangeFormattingEditProvider(
      languageSelector,
      formattingProvider
    )
  );

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

  const runScenarioCommand = vscode.commands.registerCommand(
    "behaveRunner.runScenario",
    async (args: RunScenarioArgs) => {
      if (!args?.filePath) {
        vscode.window.showErrorMessage("Behave Runner: missing scenario information.");
        return;
      }

      const filePath = args.filePath.replace(/"/g, '\\"');
      const scenarioName = args.scenarioName ? args.scenarioName.replace(/"/g, '\\"') : "";
      const additionalArgs = getAdditionalArgs(args.filePath);
      const additionalArgsStr = additionalArgs.length > 0 ? " " + additionalArgs.join(" ") : "";

      const interpreter = getPythonInterpreterPath(args.filePath, args.workspaceRoot);
      let command: string;

      if (interpreter.path) {
        command = args.runAll
          ? `"${interpreter.path}" -m behave "${filePath}"${additionalArgsStr}`
          : `"${interpreter.path}" -m behave "${filePath}" -n "${scenarioName}"${additionalArgsStr}`;
      } else {
        command = args.runAll
          ? `behave "${filePath}"${additionalArgsStr}`
          : `behave "${filePath}" -n "${scenarioName}"${additionalArgsStr}`;
      }

      let terminal = vscode.window.activeTerminal;
      if (!terminal) {
        terminal = vscode.window.createTerminal();
      }
      terminal.show(true);
      terminal.sendText(command, true);
    }
  );

  const debugScenarioCommand = vscode.commands.registerCommand(
    "behaveRunner.debugScenario",
    async (args: RunScenarioArgs) => {
      if (!args?.filePath) {
        vscode.window.showErrorMessage("Behave Runner: missing scenario information.");
        return;
      }

      const scenarioName = args.scenarioName ?? "";
      if (!args.runAll && !scenarioName) {
        vscode.window.showErrorMessage("Behave Runner: missing scenario name for debug.");
        return;
      }

      const additionalArgs = getAdditionalArgs(args.filePath);
      const debugArgs = args.runAll
        ? [args.filePath, ...additionalArgs]
        : [args.filePath, "-n", scenarioName, ...additionalArgs];

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(
        vscode.Uri.file(args.filePath)
      );
      const justMyCode = getJustMyCodeSetting(args.filePath);
      const debugConfig: vscode.DebugConfiguration = {
        type: "python",
        request: "launch",
        name: args.runAll ? "Behave: Feature" : `Behave: Scenario ${scenarioName}`,
        module: "behave",
        args: debugArgs,
        cwd: args.workspaceRoot,
        console: "integratedTerminal",
        justMyCode,
      };

      const started = await vscode.debug.startDebugging(
        workspaceFolder ?? undefined,
        debugConfig
      );
      if (!started) {
        vscode.window.showErrorMessage("Behave Runner: failed to start debugger.");
      }
    }
  );

  context.subscriptions.push(runScenarioCommand, debugScenarioCommand);

  logger.info("Behave Runner extension activated successfully");
}

export function deactivate(): void {
  disposeStepScanner();
  disposeFeatureScanner();
}

function getPythonInterpreterPath(
  resourcePath: string,
  workspaceRoot: string
): InterpreterInfo {
  const resourceUri = vscode.Uri.file(resourcePath);
  const pythonConfig = vscode.workspace.getConfiguration("python", resourceUri);

  const defaultInterpreter = pythonConfig.get<string>("defaultInterpreterPath");
  if (defaultInterpreter && defaultInterpreter.trim().length > 0) {
    const resolved = resolveInterpreterPath(defaultInterpreter, workspaceRoot);
    return {
      path: resolved ?? undefined,
      source: "python.defaultInterpreterPath",
    };
  }

  const legacyInterpreter = pythonConfig.get<string>("pythonPath");
  if (legacyInterpreter && legacyInterpreter.trim().length > 0) {
    const resolved = resolveInterpreterPath(legacyInterpreter, workspaceRoot);
    return {
      path: resolved ?? undefined,
      source: "python.pythonPath",
    };
  }

  return {
    path: undefined,
    source: "none",
  };
}

function resolveInterpreterPath(
  interpreterPath: string,
  workspaceRoot: string
): string | null {
  const trimmed = interpreterPath.trim();
  if (path.isAbsolute(trimmed) && fs.existsSync(trimmed)) {
    return trimmed;
  }

  const venvCandidates = [".venv", "venv"];
  for (const venvFolder of venvCandidates) {
    const venvPython = path.join(workspaceRoot, venvFolder, "bin", "python");
    if (fs.existsSync(venvPython)) {
      return venvPython;
    }
  }

  return null;
}

function getJustMyCodeSetting(resourcePath: string): boolean {
  const resourceUri = vscode.Uri.file(resourcePath);
  const config = vscode.workspace.getConfiguration("behaveRunner", resourceUri);
  return config.get<boolean>("debug.justMyCode", true);
}

function getAdditionalArgs(resourcePath: string): string[] {
  const resourceUri = vscode.Uri.file(resourcePath);
  const config = vscode.workspace.getConfiguration("behaveRunner", resourceUri);
  return config.get<string[]>("additionalArgs", []);
}
