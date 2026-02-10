import * as vscode from "vscode";
import { getStepScanner } from "./services";
import { findMatchingDefinitions, parseStepLine } from "./stepMatcher";
import { StepKeyword } from "./types";
import { debounce, DebouncedFunction, DocStringTracker, isFeatureDocument, getStepTextStartPosition, LRUCache } from "./utils";
import { STRUCTURAL_KEYWORD_REGEX, DIAGNOSTICS_DEBOUNCE_MS, DIAGNOSTICS_ABORT_CHECK_INTERVAL } from "./constants";

/**
 * Maximum number of debounced update functions to cache.
 * This prevents unbounded memory growth if user opens many feature files.
 */
const MAX_DEBOUNCE_CACHE_SIZE = 50;

/**
 * Type alias for the debounced update function.
 */
type DebouncedUpdateFn = DebouncedFunction<(doc: vscode.TextDocument) => void>;

/**
 * Provides diagnostics for undefined steps in .feature files.
 */
export class StepDiagnosticsProvider implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];
  /** 
   * Debounced update function per document URI to avoid excessive updates during typing.
   * Uses LRU cache with eviction callback to cancel pending timers and prevent memory leaks.
   */
  private debouncedUpdates: LRUCache<string, DebouncedUpdateFn>;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection("behave");

    // Initialize LRU cache with eviction callback to cancel pending debounced calls
    this.debouncedUpdates = new LRUCache<string, DebouncedUpdateFn>(
      MAX_DEBOUNCE_CACHE_SIZE,
      (_key, debouncedFn) => debouncedFn.cancel()
    );

    // Update diagnostics when documents change (debounced to avoid lag during typing)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (isFeatureDocument(event.document)) {
          this.getDebouncedUpdate(event.document.uri.toString())(event.document);
        }
      })
    );

    // Update diagnostics when documents open
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (isFeatureDocument(document)) {
          this.updateDiagnostics(document);
        }
      })
    );

    // Clear diagnostics and debounced updates when documents close
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.diagnosticCollection.delete(document.uri);
        this.debouncedUpdates.delete(document.uri.toString());
      })
    );

    // Initial scan of open documents
    this.refreshAll();
  }

  /**
   * Update diagnostics for a document.
   * Includes periodic abort checks to exit early if the document changed during processing.
   */
  public updateDiagnostics(document: vscode.TextDocument): void {
    const diagnostics: vscode.Diagnostic[] = [];
    const scanner = getStepScanner();
    const initialVersion = document.version;
    const documentUri = document.uri.toString();

    let previousKeyword: StepKeyword | null = null;
    const docStringTracker = new DocStringTracker();

    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      // Periodic abort check: exit early if document changed or closed
      if (lineIndex > 0 && lineIndex % DIAGNOSTICS_ABORT_CHECK_INTERVAL === 0) {
        const currentDoc = vscode.workspace.textDocuments.find(
          (d) => d.uri.toString() === documentUri
        );
        if (currentDoc?.version !== initialVersion) {
          // Document changed or closed, abort processing
          return;
        }
      }

      const line = document.lineAt(lineIndex);
      const lineText = line.text;

      // Skip lines inside doc string blocks
      if (docStringTracker.processLine(lineText)) {
        continue;
      }

      // Parse the step line
      const stepInfo = parseStepLine(lineText, previousKeyword);
      if (!stepInfo) {
        // Check for structural keywords that reset the context
        if (STRUCTURAL_KEYWORD_REGEX.test(lineText)) {
          previousKeyword = null;
        }
        continue;
      }

      // Update previous keyword for And/But resolution
      if (stepInfo.effectiveKeyword) {
        previousKeyword = stepInfo.effectiveKeyword;
      }

      // Get definitions filtered by keyword (uses indexed lookup)
      const definitions = scanner.getDefinitionsByKeyword(stepInfo.effectiveKeyword);

      // Find matching definitions
      const matches = findMatchingDefinitions(stepInfo.text, definitions);

      if (matches.length === 0) {
        // No matching definition found - create a diagnostic
        const startChar = getStepTextStartPosition(lineText);

        const range = new vscode.Range(
          lineIndex,
          startChar,
          lineIndex,
          lineText.trimEnd().length
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

    // Final check: only set diagnostics if document is still open and unchanged
    const finalDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === documentUri
    );
    if (finalDoc?.version === initialVersion) {
      this.diagnosticCollection.set(document.uri, diagnostics);
    }
  }

  /**
   * Refresh diagnostics for all open .feature files.
   * Call this when step definitions change.
   */
  public refreshAll(): void {
    vscode.workspace.textDocuments.forEach((document) => {
      if (isFeatureDocument(document)) {
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
    this.debouncedUpdates.clear();
  }

  /**
   * Get or create a debounced update function for a specific document.
   * Each document gets its own debounced function to avoid interference.
   */
  private getDebouncedUpdate(uriString: string): (doc: vscode.TextDocument) => void {
    let debouncedFn = this.debouncedUpdates.get(uriString);
    if (!debouncedFn) {
      debouncedFn = debounce(
        (doc: vscode.TextDocument) => this.updateDiagnostics(doc),
        DIAGNOSTICS_DEBOUNCE_MS
      );
      this.debouncedUpdates.set(uriString, debouncedFn);
    }
    return debouncedFn;
  }
}
