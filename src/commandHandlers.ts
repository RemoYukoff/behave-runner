/**
 * Command handlers for Behave Runner commands.
 */

import * as vscode from "vscode";
import { RunScenarioArgs } from "./types";
import { getPythonInterpreterPath, getJustMyCodeSetting } from "./pythonUtils";

/**
 * Handle the "Run Scenario" command.
 * Executes behave in the terminal for the specified scenario or feature.
 *
 * @param args Arguments containing file path, scenario name, and workspace root
 */
export async function runScenarioHandler(args: RunScenarioArgs): Promise<void> {
  if (!args?.filePath) {
    vscode.window.showErrorMessage("Behave Runner: missing scenario information.");
    return;
  }

  const filePath = args.filePath.replace(/"/g, '\\"');
  const scenarioName = args.scenarioName ? args.scenarioName.replace(/"/g, '\\"') : "";
  const behaveCommand = args.runAll
    ? `behave "${filePath}"`
    : `behave "${filePath}" -n "${scenarioName}"`;

  const interpreter = getPythonInterpreterPath(args.filePath, args.workspaceRoot);
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

/**
 * Handle the "Debug Scenario" command.
 * Starts a debug session for the specified scenario or feature.
 *
 * @param args Arguments containing file path, scenario name, and workspace root
 */
export async function debugScenarioHandler(args: RunScenarioArgs): Promise<void> {
  if (!args?.filePath) {
    vscode.window.showErrorMessage("Behave Runner: missing scenario information.");
    return;
  }

  const scenarioName = args.scenarioName ?? "";
  if (!args.runAll && !scenarioName) {
    vscode.window.showErrorMessage("Behave Runner: missing scenario name for debug.");
    return;
  }

  const debugArgs = args.runAll ? [args.filePath] : [args.filePath, "-n", scenarioName];

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
