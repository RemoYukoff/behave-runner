import { isPythonFunctionDefinitionLine } from "@behave-runner/core";
import type { LanguageClient } from "vscode-languageclient/node";
import * as vscode from "vscode";
import { requestFeatureStepLocationsFromLsp } from "./language/requestFeatureStepLocations";

/**
 * Provides references for Behave step functions in Python files.
 * Resolves usages in `.feature` files via the Behave language server.
 */
export class BehaveReferenceProvider implements vscode.ReferenceProvider {
  constructor(private readonly languageClient: LanguageClient) {}

  public async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.ReferenceContext,
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
