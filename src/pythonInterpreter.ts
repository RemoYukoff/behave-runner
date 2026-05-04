import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";

export type InterpreterInfo = {
  path: string | undefined;
  source: "python.defaultInterpreterPath" | "python.pythonPath" | "none";
};

export function getPythonInterpreterPath(
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

export function resolveInterpreterPath(
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
