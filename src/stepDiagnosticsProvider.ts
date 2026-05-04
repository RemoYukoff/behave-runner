import * as vscode from "vscode";
import { getStepScanner } from "./stepScanner";
import { findMatchingDefinitions, parseStepLine } from "./stepMatcher";
import { StepKeyword } from "./types";

/**
 * Provides diagnostics for undefined steps in .feature files.
 */
export class StepDiagnosticsProvider implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection("behave");

    // Update diagnostics when documents change
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (this.isFeatureFile(event.document)) {
          this.updateDiagnostics(event.document);
        }
      })
    );

    // Update diagnostics when documents open
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (this.isFeatureFile(document)) {
          this.updateDiagnostics(document);
        }
      })
    );

    // Clear diagnostics when documents close
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.diagnosticCollection.delete(document.uri);
      })
    );

    // Initial scan of open documents
    vscode.workspace.textDocuments.forEach((document) => {
      if (this.isFeatureFile(document)) {
        this.updateDiagnostics(document);
      }
    });
  }

  /**
   * Check if a document is a .feature file.
   */
  private isFeatureFile(document: vscode.TextDocument): boolean {
    return (
      document.languageId === "behave" ||
      document.fileName.endsWith(".feature")
    );
  }

  /**
   * Update diagnostics for a document.
   */
  public updateDiagnostics(document: vscode.TextDocument): void {
    const diagnostics: vscode.Diagnostic[] = [];
    const scanner = getStepScanner();
    const allDefinitions = scanner.getAllDefinitions();

    let previousKeyword: StepKeyword | null = null;

    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      const line = document.lineAt(lineIndex);
      const lineText = line.text;

      // Parse the step line
      const stepInfo = parseStepLine(lineText, previousKeyword);
      if (!stepInfo) {
        // Check for structural keywords that reset the context
        if (lineText.match(/^\s*(Scenario|Feature|Background|Examples)/i)) {
          previousKeyword = null;
        }
        continue;
      }

      // Update previous keyword for And/But resolution
      if (stepInfo.effectiveKeyword) {
        previousKeyword = stepInfo.effectiveKeyword;
      }

      // Find matching definitions
      const matches = findMatchingDefinitions(
        stepInfo.text,
        stepInfo.effectiveKeyword,
        allDefinitions
      );

      if (matches.length === 0) {
        // No matching definition found - create a diagnostic
        const stepMatch = lineText.match(/^\s*(Given|When|Then|And|But)\s+/i);
        const startChar = stepMatch ? stepMatch[0].length : 0;

        const range = new vscode.Range(
          lineIndex,
          startChar,
          lineIndex,
          lineText.length
        );

        const diagnostic = new vscode.Diagnostic(
          range,
          `Undefined step: "${stepInfo.text}"`,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = "Behave Runner";
        diagnostic.code = "undefined-step";

        diagnostics.push(diagnostic);
      }
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Refresh diagnostics for all open .feature files.
   * Call this when step definitions change.
   */
  public refreshAll(): void {
    vscode.workspace.textDocuments.forEach((document) => {
      if (this.isFeatureFile(document)) {
        this.updateDiagnostics(document);
      }
    });
  }

  /**
   * Dispose of resources.
   */
  public dispose(): void {
    this.diagnosticCollection.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
