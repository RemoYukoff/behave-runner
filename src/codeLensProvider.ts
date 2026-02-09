import * as path from "path";
import * as vscode from "vscode";
import { RunScenarioArgs } from "./types";

/**
 * Provides CodeLens for running and debugging Behave features and scenarios.
 * Adds "Run" and "Debug" buttons above Feature and Scenario definitions.
 */
export class BehaveCodeLensProvider implements vscode.CodeLensProvider {
  private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  /**
   * Provide CodeLens for a document.
   */
  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
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
          workspaceRoot,
        };
        lenses.push(
          new vscode.CodeLens(range, {
            title: "$(play) Run feature",
            command: "behaveRunner.runScenario",
            arguments: [args],
          })
        );
        lenses.push(
          new vscode.CodeLens(range, {
            title: "$(bug) Debug feature",
            command: "behaveRunner.debugScenario",
            arguments: [args],
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
        workspaceRoot,
      };

      const range = new vscode.Range(i, 0, i, line.text.length);
      lenses.push(
        new vscode.CodeLens(range, {
          title: "$(play) Run scenario",
          command: "behaveRunner.runScenario",
          arguments: [args],
        })
      );
      lenses.push(
        new vscode.CodeLens(range, {
          title: "$(bug) Debug scenario",
          command: "behaveRunner.debugScenario",
          arguments: [args],
        })
      );
    }

    return lenses;
  }

  /**
   * Get the workspace root for a document.
   */
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
