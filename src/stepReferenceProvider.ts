import * as vscode from "vscode";
import { findStepUsageLocations } from "./decoratorParser";

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
    return findStepUsageLocations(document, position);
  }
}
