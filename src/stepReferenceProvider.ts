import * as vscode from "vscode";
import { getFeatureScanner } from "./featureScanner";
import { StepKeyword } from "./types";
import { isFunctionDefinition, findDecoratorsAbove } from "./decoratorParser";

/**
 * Provides references for Behave step functions in Python files.
 * Allows Ctrl+Click on a decorated step function to find
 * all feature file steps that use that pattern.
 */
export class BehaveReferenceProvider implements vscode.ReferenceProvider {
  /**
   * Provide references for a step function.
   */
  public async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.ReferenceContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.Location[] | null> {
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
}
