import * as vscode from "vscode";
import { isFunctionDefinition, findDecoratorsAbove } from "./decoratorParser";
import { getFeatureScanner } from "./services";
import { StepKeyword } from "./types";

/**
 * Provides both "Go to Definition" and "Find References" for Behave step functions in Python files.
 * When Ctrl+Click on a decorated step function, shows all .feature file locations where that step is used.
 *
 * Implements both interfaces to avoid code duplication since both operations
 * return the same result: locations in .feature files where the step pattern is used.
 */
export class BehaveStepLocationProvider
  implements vscode.DefinitionProvider, vscode.ReferenceProvider
{
  /**
   * Provide definitions (usages in .feature files) for a step function.
   * Called when user Ctrl+Clicks on a step function.
   */
  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[] | null> {
    if (token.isCancellationRequested) {
      return null;
    }
    return this.findStepUsageLocations(document, position);
  }

  /**
   * Provide references for a step function.
   * Called when user uses "Find All References" on a step function.
   */
  public async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[] | null> {
    if (token.isCancellationRequested) {
      return null;
    }
    return this.findStepUsageLocations(document, position);
  }

  /**
   * Find all feature file locations where a step function is used.
   *
   * @param document The VS Code text document (Python file)
   * @param position The cursor position
   * @returns Array of Location objects pointing to .feature files, or null if not on a step function
   */
  private findStepUsageLocations(
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
}
