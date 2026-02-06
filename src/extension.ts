import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";

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

export function activate(context: vscode.ExtensionContext): void {
  const codeLensProvider = new BehaveCodeLensProvider();
  const languageSelector: vscode.DocumentSelector = [
    { language: "cucumber", scheme: "file" },
    { pattern: "**/*.feature" }
  ];

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      languageSelector,
      codeLensProvider
    )
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

  context.subscriptions.push(runScenarioCommand);
}

export function deactivate(): void {
  return;
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

