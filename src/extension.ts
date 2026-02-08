import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import { BehaveDefinitionProvider } from "./stepDefinitionProvider";
import { getStepScanner, disposeStepScanner } from "./stepScanner";
import { BehaveReferenceProvider } from "./stepReferenceProvider";
import { BehaveStepUsageProvider } from "./stepUsageProvider";
import { getFeatureScanner, disposeFeatureScanner } from "./featureScanner";

type RunScenarioArgs = {
  filePath: string;
  scenarioName?: string;
  runAll: boolean;
  workspaceRoot: string;
};

type InterpreterInfo = {
  path: string | undefined;
  source: "python.defaultInterpreterPath" | "python.pythonPath" | "none";
};

class BehaveCodeLensProvider implements vscode.CodeLensProvider {
  private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const workspaceRoot = this.getWorkspaceRoot(document);

    for (let i = 0; i < document.lineCount; i += 1) {
      const line = document.lineAt(i);
      const featureMatch = line.text.match(/^\s*Feature:\s*(.+)$/);
      if (featureMatch) {
        const range = new vscode.Range(i, 0, i, line.text.length);
        const args: RunScenarioArgs = {
          filePath: document.uri.fsPath,
          runAll: true,
          workspaceRoot
        };
        lenses.push(
          new vscode.CodeLens(range, {
            title: "$(play) Run feature",
            command: "behaveRunner.runScenario",
            arguments: [args]
          })
        );
        lenses.push(
          new vscode.CodeLens(range, {
            title: "$(bug) Debug feature",
            command: "behaveRunner.debugScenario",
            arguments: [args]
          })
        );
        continue;
      }

      const scenarioMatch = line.text.match(
        /^\s*Scenario(?: Outline)?:\s*(.+)$/
      );
      if (!scenarioMatch) {
        continue;
      }

      const scenarioName = scenarioMatch[1].trim();
      if (!scenarioName) {
        continue;
      }

      const args: RunScenarioArgs = {
        filePath: document.uri.fsPath,
        scenarioName,
        runAll: false,
        workspaceRoot
      };

      const range = new vscode.Range(i, 0, i, line.text.length);
      lenses.push(
        new vscode.CodeLens(range, {
          title: "$(play) Run scenario",
          command: "behaveRunner.runScenario",
          arguments: [args]
        })
      );
      lenses.push(
        new vscode.CodeLens(range, {
          title: "$(bug) Debug scenario",
          command: "behaveRunner.debugScenario",
          arguments: [args]
        })
      );
    }

    return lenses;
  }

  private getWorkspaceRoot(document: vscode.TextDocument): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (workspaceFolder) {
      return workspaceFolder.uri.fsPath;
    }

    if (vscode.workspace.workspaceFolders?.length) {
      return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    return path.dirname(document.uri.fsPath);
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const codeLensProvider = new BehaveCodeLensProvider();
  const languageSelector: vscode.DocumentSelector = [
    { language: "behave", scheme: "file" },
    { pattern: "**/*.feature" }
  ];

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      languageSelector,
      codeLensProvider
    )
  );

  // Initialize the step scanner for Go to Definition
  const stepScanner = getStepScanner();
  await stepScanner.initialize();

  // Initialize the feature scanner for Find References
  const featureScanner = getFeatureScanner();
  await featureScanner.initialize();

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
        vscode.window.showErrorMessage(
          "Behave Runner: missing scenario information."
        );
        return;
      }

      const filePath = args.filePath.replace(/"/g, '\\"');
      const scenarioName = args.scenarioName
        ? args.scenarioName.replace(/"/g, '\\"')
        : "";
      const behaveCommand = args.runAll
        ? `behave "${filePath}"`
        : `behave "${filePath}" -n "${scenarioName}"`;

      const interpreter = getPythonInterpreterPath(
        args.filePath,
        args.workspaceRoot
      );
      const command = interpreter.path
        ? `"${interpreter.path}" -m behave "${filePath}" -n "${scenarioName}"`
        : behaveCommand;

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

  context.subscriptions.push(runScenarioCommand, debugScenarioCommand);
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

  const defaultInterpreter = pythonConfig.get<string>(
    "defaultInterpreterPath"
  );
  if (defaultInterpreter && defaultInterpreter.trim().length > 0) {
    const resolved = resolveInterpreterPath(defaultInterpreter, workspaceRoot);
    return {
      path: resolved ?? undefined,
      source: "python.defaultInterpreterPath"
    };
  }

  const legacyInterpreter = pythonConfig.get<string>("pythonPath");
  if (legacyInterpreter && legacyInterpreter.trim().length > 0) {
    const resolved = resolveInterpreterPath(legacyInterpreter, workspaceRoot);
    return {
      path: resolved ?? undefined,
      source: "python.pythonPath"
    };
  }

  return {
    path: undefined,
    source: "none"
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
  const config = vscode.workspace.getConfiguration(
    "behaveRunner",
    resourceUri
  );
  return config.get<boolean>("debug.justMyCode", true);
}
