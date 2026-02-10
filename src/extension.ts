import * as vscode from "vscode";
import { BehaveDefinitionProvider } from "./stepDefinitionProvider";
import { BehaveStepLocationProvider } from "./stepLocationProvider";
import { StepCompletionProvider } from "./stepCompletionProvider";
import { StepDiagnosticsProvider } from "./stepDiagnosticsProvider";
import { BehaveCodeLensProvider } from "./codeLensProvider";
import { runScenarioHandler, debugScenarioHandler } from "./commandHandlers";
import { initializeServices, disposeServices, getStepScanner } from "./services";
import { logger } from "./logger";
import { debounce } from "./utils";
import { DIAGNOSTICS_DEBOUNCE_MS } from "./constants";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Initialize logger
  logger.initialize();
  logger.info("Behave Runner activating...");

  // Initialize all services
  const services = initializeServices();
  await services.stepScanner.initialize();
  await services.featureScanner.initialize();

  logger.info("Scanners initialized");

  const codeLensProvider = new BehaveCodeLensProvider();
  const languageSelector: vscode.DocumentSelector = [
    { language: "behave", scheme: "file" },
    { pattern: "**/*.feature" },
  ];

  context.subscriptions.push(
    codeLensProvider,
    vscode.languages.registerCodeLensProvider(languageSelector, codeLensProvider)
  );

  // Register the Definition Provider for Go to Definition (Ctrl+Click)
  const definitionProvider = new BehaveDefinitionProvider();
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(languageSelector, definitionProvider)
  );

  // Register the Step Location Provider for Python files
  // Handles both "Go to Definition" and "Find References" for step functions
  const stepLocationProvider = new BehaveStepLocationProvider();
  const pythonSelector: vscode.DocumentSelector = { language: "python", scheme: "file" };
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(pythonSelector, stepLocationProvider),
    vscode.languages.registerReferenceProvider(pythonSelector, stepLocationProvider)
  );

  // Register the Completion Provider for step autocomplete in .feature files
  const completionProvider = new StepCompletionProvider();
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      languageSelector,
      completionProvider,
      " " // trigger after space
    )
  );

  // Register the Diagnostics Provider for undefined steps
  const diagnosticsProvider = new StepDiagnosticsProvider();
  context.subscriptions.push(diagnosticsProvider);

  // Refresh diagnostics when step definitions change (uses StepScanner's event instead of duplicate watcher)
  const debouncedRefreshDiagnostics = debounce(
    () => diagnosticsProvider.refreshAll(),
    DIAGNOSTICS_DEBOUNCE_MS
  );
  const stepScanner = getStepScanner();
  context.subscriptions.push(
    stepScanner.onDidChange(debouncedRefreshDiagnostics),
    // Cancel pending debounced calls on deactivation
    { dispose: () => debouncedRefreshDiagnostics.cancel() }
  );

  // Clear definition cache for closed documents to prevent memory leaks
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      definitionProvider.clearCacheForFile(document.uri.fsPath);
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("behaveRunner.runScenario", runScenarioHandler),
    vscode.commands.registerCommand("behaveRunner.debugScenario", debugScenarioHandler)
  );

  logger.info("Behave Runner activated successfully");
}

export function deactivate(): void {
  logger.info("Behave Runner deactivating...");
  disposeServices();
  logger.dispose();
}
