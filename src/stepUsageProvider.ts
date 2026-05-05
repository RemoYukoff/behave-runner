import { isPythonFunctionDefinitionLine } from "@behave-runner/core";
import type { LanguageClient } from "vscode-languageclient/node";
import * as vscode from "vscode";
import { requestFeatureStepLocationsFromLsp } from "./language/requestFeatureStepLocations";

/**
 * Provides "Go to Definition" from Behave step implementations in Python
 * to usages in `.feature` files (via the language server).
 */
export class BehaveStepUsageProvider implements vscode.DefinitionProvider {
  constructor(private readonly languageClient: LanguageClient) {}

  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Location[] | null> {
    const line = document.lineAt(position.line);
    if (!isPythonFunctionDefinitionLine(line.text)) {
      return null;
    }
    return requestFeatureStepLocationsFromLsp(
      this.languageClient,
      document,
      position.line
    );
  }
}
