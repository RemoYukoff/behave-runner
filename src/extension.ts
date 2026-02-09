import * as vscode from "vscode";
import { BehaveDefinitionProvider } from "./stepDefinitionProvider";
import { BehaveReferenceProvider } from "./stepReferenceProvider";
import { BehaveStepUsageProvider } from "./stepUsageProvider";
import { StepCompletionProvider } from "./stepCompletionProvider";
import { StepDiagnosticsProvider } from "./stepDiagnosticsProvider";
import { BehaveCodeLensProvider } from "./codeLensProvider";
import { runScenarioHandler, debugScenarioHandler } from "./commandHandlers";
import { initializeServices, disposeServices } from "./services";
import { logger } from "./logger";

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
    vscode.languages.registerCodeLensProvider(languageSelector, codeLensProvider)
  );

  // Register the Definition Provider for Go to Definition (Ctrl+Click)
  const definitionProvider = new BehaveDefinitionProvider();
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(languageSelector, definitionProvider)
  );

  // Register the Reference Provider for Find References (from Python step decorators)
  const referenceProvider = new BehaveReferenceProvider();
  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(
      { language: "python", scheme: "file" },
      referenceProvider
    )
  );

  // Register the Definition Provider for Ctrl+Click on step functions (shows usages in .feature files)
  const stepUsageProvider = new BehaveStepUsageProvider();
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: "python", scheme: "file" },
      stepUsageProvider
    )
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

  // Refresh diagnostics when Python step files change
  const pythonWatcher = vscode.workspace.createFileSystemWatcher("**/*.py");
  context.subscriptions.push(
    pythonWatcher,
    pythonWatcher.onDidChange(() => diagnosticsProvider.refreshAll()),
    pythonWatcher.onDidCreate(() => diagnosticsProvider.refreshAll()),
    pythonWatcher.onDidDelete(() => diagnosticsProvider.refreshAll())
  );

  // Clear definition cache when documents close to prevent memory leaks
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(() => {
      definitionProvider.clearCache();
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
