import * as vscode from "vscode";
import { findStepUsageLocations } from "./decoratorParser";

/**
 * Provides "Go to Definition" for Behave step functions in Python files.
 * When Ctrl+Click on a decorated step function, shows all .feature file
 * locations where that step is used.
 */
export class BehaveStepUsageProvider implements vscode.DefinitionProvider {
  /**
   * Provide definitions (usages in .feature files) for a step function.
   */
  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Location[] | null> {
    return findStepUsageLocations(document, position);
  }
}
