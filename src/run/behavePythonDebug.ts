import * as vscode from "vscode";
import type { BehaveJob } from "./behaveJobTypes";

export function getJustMyCodeForResource(resourcePath: string): boolean {
  const resourceUri = vscode.Uri.file(resourcePath);
  return vscode.workspace
    .getConfiguration("behaveRunner", resourceUri)
    .get<boolean>("debug.justMyCode", true);
}

/** User-supplied behave CLI tokens from `behaveRunner.behave.extraArgs`. */
export function getBehaveExtraArgsForResource(resourcePath: string): string[] {
  const resourceUri = vscode.Uri.file(resourcePath);
  const raw = vscode.workspace
    .getConfiguration("behaveRunner", resourceUri)
    .get<unknown>("behave.extraArgs", []);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === "string");
}

export type PythonBehaveDebugLaunch = {
  workspaceRoot: string;
  workspaceFolder: vscode.WorkspaceFolder | undefined;
  config: vscode.DebugConfiguration;
};

/**
 * Single builder for Python debug sessions that launch Behave (module behave).
 * Keeps naming aligned across CodeLens/command and hierarchy debug runs.
 */
export function buildPythonBehaveDebugLaunch(
  job: BehaveJob,
  workspaceRoot: string,
  justMyCode: boolean
): PythonBehaveDebugLaunch {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(job.fsPath)
  );
  const extraArgs = getBehaveExtraArgsForResource(job.fsPath);
  const debugArgs =
    job.kind === "feature"
      ? [...extraArgs, job.fsPath]
      : [...extraArgs, job.fsPath, "-n", job.scenarioName];

  const config: vscode.DebugConfiguration = {
    type: "python",
    request: "launch",
    name:
      job.kind === "feature"
        ? "Behave: Feature"
        : `Behave: Scenario ${job.scenarioName}`,
    module: "behave",
    args: debugArgs,
    cwd: workspaceRoot,
    console: "integratedTerminal",
    justMyCode,
    pythonArgs: ["-u"],
    env: { PYTHONUNBUFFERED: "1" }
  };

  return { workspaceRoot, workspaceFolder: workspaceFolder ?? undefined, config };
}

/** Command-line debug from keybindings (`behaveRunner.debugScenario`). */
export function buildPythonBehaveDebugLaunchFromCliArgs(args: {
  filePath: string;
  scenarioName: string;
  runAll: boolean;
  workspaceRoot: string;
  justMyCode: boolean;
}): PythonBehaveDebugLaunch {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(args.filePath)
  );
  const extraArgs = getBehaveExtraArgsForResource(args.filePath);
  const debugArgs = args.runAll
    ? [...extraArgs, args.filePath]
    : [...extraArgs, args.filePath, "-n", args.scenarioName];

  const config: vscode.DebugConfiguration = {
    type: "python",
    request: "launch",
    name: args.runAll
      ? "Behave: Feature"
      : `Behave: Scenario ${args.scenarioName}`,
    module: "behave",
    args: debugArgs,
    cwd: args.workspaceRoot,
    console: "integratedTerminal",
    justMyCode: args.justMyCode,
    pythonArgs: ["-u"],
    env: { PYTHONUNBUFFERED: "1" }
  };

  return {
    workspaceRoot: args.workspaceRoot,
    workspaceFolder: workspaceFolder ?? undefined,
    config
  };
}
