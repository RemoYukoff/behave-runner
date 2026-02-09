import * as vscode from "vscode";
import { findStepUsageLocations } from "./decoratorParser";

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
    _token: vscode.CancellationToken
  ): Promise<vscode.Location[] | null> {
    return findStepUsageLocations(document, position);
  }

  /**
   * Provide references for a step function.
   * Called when user uses "Find All References" on a step function.
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
