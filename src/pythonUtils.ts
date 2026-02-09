/**
 * Utility functions for Python interpreter detection and configuration.
 */

import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import { InterpreterInfo } from "./types";

/**
 * Get the Python interpreter path for a given resource.
 * Checks VS Code Python extension configuration first,
 * then falls back to common virtual environment locations.
 *
 * @param resourcePath Path to the resource file
 * @param workspaceRoot Path to the workspace root
 * @returns InterpreterInfo with path and source
 */
export function getPythonInterpreterPath(
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

/**
 * Resolve an interpreter path, checking if it exists.
 * Falls back to checking common virtual environment locations.
 *
 * @param interpreterPath The configured interpreter path
 * @param workspaceRoot Path to the workspace root
 * @returns Resolved path or null if not found
 */
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

/**
 * Get the justMyCode debug setting for a resource.
 *
 * @param resourcePath Path to the resource file
 * @returns true if justMyCode is enabled (default), false otherwise
 */
export function getJustMyCodeSetting(resourcePath: string): boolean {
  const resourceUri = vscode.Uri.file(resourcePath);
  const config = vscode.workspace.getConfiguration("behaveRunner", resourceUri);
  return config.get<boolean>("debug.justMyCode", true);
}
