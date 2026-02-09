import * as vscode from "vscode";
import {
  DECORATOR_PATTERNS,
  FUNCTION_DEF_REGEX,
  EMPTY_OR_COMMENT_REGEX,
  PYTHON_DECORATOR_REGEX,
} from "./constants";
import { getFeatureScanner } from "./services";
import { StepKeyword } from "./types";

/**
 * Represents a parsed step decorator.
 */
export interface DecoratorInfo {
  /** The keyword used in the decorator (given, when, then, step) */
  keyword: string;
  /** The pattern string from the decorator */
  pattern: string;
}

/**
 * Check if a line contains a Python function definition.
 *
 * @param lineText The line text to check
 * @returns true if the line contains a function definition
 */
export function isFunctionDefinition(lineText: string): boolean {
  return FUNCTION_DEF_REGEX.test(lineText);
}

/**
 * Extract decorator information from a line of Python code.
 * Returns the keyword and pattern if the line contains a step decorator.
 *
 * @param lineText The line text to parse
 * @returns DecoratorInfo if the line contains a step decorator, null otherwise
 */
export function extractDecoratorInfo(lineText: string): DecoratorInfo | null {
  for (const regex of DECORATOR_PATTERNS) {
    const match = lineText.match(regex);
    if (match) {
      return {
        keyword: match[1].toLowerCase(),
        pattern: match[2],
      };
    }
  }
  return null;
}

/**
 * Find step decorators above a function definition.
 * Scans upward from the function line to find @given/@when/@then/@step decorators.
 *
 * @param document The VS Code text document
 * @param functionLine The line number of the function definition (0-based)
 * @returns Array of decorator info objects found above the function
 */
export function findDecoratorsAbove(
  document: vscode.TextDocument,
  functionLine: number
): DecoratorInfo[] {
  const decorators: DecoratorInfo[] = [];

  // Scan backwards from the line above the function
  for (let i = functionLine - 1; i >= 0; i--) {
    const lineText = document.lineAt(i).text;

    // Skip empty lines and comments between decorators
    if (EMPTY_OR_COMMENT_REGEX.test(lineText)) {
      continue;
    }

    // Check if it's a step decorator
    const decoratorInfo = extractDecoratorInfo(lineText);
    if (decoratorInfo) {
      decorators.push(decoratorInfo);
      continue;
    }

    // If we hit any other line (another decorator, code, etc.), stop searching
    // But allow other decorators (non-step) to be skipped
    if (PYTHON_DECORATOR_REGEX.test(lineText)) {
      // It's a decorator but not a step decorator, continue looking
      continue;
    }

    // Hit something else (previous function, class, etc.), stop
    break;
  }

  return decorators;
}

/**
 * Find all feature file locations where a step function is used.
 * This is shared logic used by both ReferenceProvider and DefinitionProvider.
 *
 * @param document The VS Code text document (Python file)
 * @param position The cursor position
 * @returns Array of Location objects pointing to .feature files, or null if not on a step function
 */
export function findStepUsageLocations(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.Location[] | null {
  const line = document.lineAt(position.line);

  // Check if cursor is on a function definition
  if (!isFunctionDefinition(line.text)) {
    return null;
  }

  // Look backwards to find step decorators above the function
  const decorators = findDecoratorsAbove(document, position.line);

  if (decorators.length === 0) {
    return null;
  }

  const featureScanner = getFeatureScanner();
  const locations: vscode.Location[] = [];

  // Find matching steps for each decorator pattern
  for (const { keyword, pattern } of decorators) {
    const matchingSteps = featureScanner.findMatchingSteps(
      pattern,
      keyword as StepKeyword
    );

    for (const step of matchingSteps) {
      const uri = vscode.Uri.file(step.filePath);
      const range = new vscode.Range(
        step.line,
        step.character,
        step.line,
        step.character + step.text.length
      );
      locations.push(new vscode.Location(uri, range));
    }
  }

  if (locations.length === 0) {
    return null;
  }

  return locations;
}
