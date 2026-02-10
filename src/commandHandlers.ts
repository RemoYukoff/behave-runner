/**
 * Command handlers for Behave Runner commands.
 */

import * as vscode from "vscode";
import { RunScenarioArgs } from "./types";
import { getPythonInterpreterPath, getJustMyCodeSetting } from "./pythonUtils";

/**
 * Escape a string for safe use in shell commands.
 * Handles quotes, backslashes, and other special characters.
 *
 * @param str The string to escape
 * @returns The escaped string safe for shell use within double quotes
 */
function escapeShellArg(str: string): string {
  // Escape backslashes first, then double quotes, dollar signs, and backticks
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

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

  // Validate scenarioName is present when not running all
  if (!args.runAll && !args.scenarioName) {
    vscode.window.showErrorMessage("Behave Runner: missing scenario name for run.");
    return;
  }

  const filePath = escapeShellArg(args.filePath);
  const scenarioName = args.scenarioName ? escapeShellArg(args.scenarioName) : "";
  const behaveCommand = args.runAll
    ? `behave "${filePath}"`
    : `behave "${filePath}" -n "${scenarioName}"`;

  const interpreter = getPythonInterpreterPath(args.filePath, args.workspaceRoot);
  const interpreterPath = interpreter.path ? escapeShellArg(interpreter.path) : null;
  const command = interpreterPath
    ? args.runAll
      ? `"${interpreterPath}" -m behave "${filePath}"`
      : `"${interpreterPath}" -m behave "${filePath}" -n "${scenarioName}"`
    : behaveCommand;

  const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal();
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
