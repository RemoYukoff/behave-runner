import * as vscode from "vscode";
import {
  subscribeBehaveHierarchyChanges,
  type BehaveHierarchyStore
} from "./behaveHierarchyModel";
import { parseFeatureFile } from "@behave-runner/core";
import {
  getFeatureHierarchyNodeForPath,
  getScenarioNodeAtLine,
  getScenarioOutlineExpansionNodes
} from "./run/behaveHierarchyQueries";
import {
  runBehaveHierarchyDebugSelection,
  runBehaveHierarchySelection
} from "./run/behaveRunExecution";

function lineRange(
  doc: vscode.TextDocument,
  line0: number
): vscode.Range {
  const line = doc.lineAt(line0);
  return new vscode.Range(line0, 0, line0, line.text.length);
}

class BehaveCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    if (document.languageId !== "behave" && !document.fileName.endsWith(".feature")) {
      return [];
    }
    const text = document.getText();
    const parsed = parseFeatureFile(document.uri.fsPath, text);
    const fsPath = document.uri.fsPath;
    const lenses: vscode.CodeLens[] = [];

    const featureRange = lineRange(document, parsed.line);
    lenses.push(
      new vscode.CodeLens(featureRange, {
        title: "$(play) Run",
        command: "behaveRunner.editor.runFeature",
        arguments: [fsPath]
      }),
      new vscode.CodeLens(featureRange, {
        title: "$(debug-alt) Debug",
        command: "behaveRunner.editor.debugFeature",
        arguments: [fsPath]
      })
    );

    for (const sc of parsed.scenarios) {
      if (sc.isOutline && sc.outlineExpansions && sc.outlineExpansions.length > 0) {
        const outlineR = lineRange(document, sc.line);
        lenses.push(
          new vscode.CodeLens(outlineR, {
            title: "$(play) Run all",
            command: "behaveRunner.editor.runScenarioOutline",
            arguments: [fsPath, sc.line]
          }),
          new vscode.CodeLens(outlineR, {
            title: "$(debug-alt) Debug all",
            command: "behaveRunner.editor.debugScenarioOutline",
            arguments: [fsPath, sc.line]
          })
        );
        for (const ex of sc.outlineExpansions) {
          const er = lineRange(document, ex.line);
          lenses.push(
            new vscode.CodeLens(er, {
              title: "$(play) Run",
              command: "behaveRunner.editor.runScenario",
              arguments: [fsPath, ex.line]
            }),
            new vscode.CodeLens(er, {
              title: "$(debug-alt) Debug",
              command: "behaveRunner.editor.debugScenario",
              arguments: [fsPath, ex.line]
            })
          );
        }
      } else {
        const r = lineRange(document, sc.line);
        lenses.push(
          new vscode.CodeLens(r, {
            title: "$(play) Run",
            command: "behaveRunner.editor.runScenario",
            arguments: [fsPath, sc.line]
          }),
          new vscode.CodeLens(r, {
            title: "$(debug-alt) Debug",
            command: "behaveRunner.editor.debugScenario",
            arguments: [fsPath, sc.line]
          })
        );
      }
    }

    return lenses;
  }
}

export function registerBehaveCodeLens(
  context: vscode.ExtensionContext,
  store: BehaveHierarchyStore
): void {
  const selector: vscode.DocumentSelector = [
    { language: "behave", scheme: "file" },
    { pattern: "**/*.feature" }
  ];

  const codeLensProvider = new BehaveCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, codeLensProvider),
    subscribeBehaveHierarchyChanges(() => codeLensProvider.refresh())
  );

  const runFeature = async (fsPath: string): Promise<void> => {
    const node = await getFeatureHierarchyNodeForPath(store, fsPath);
    if (!node) {
      void vscode.window.showErrorMessage(
        "Behave Runner: could not resolve this feature file (open a workspace folder that contains it)."
      );
      return;
    }
    const cts = new vscode.CancellationTokenSource();
    try {
      await runBehaveHierarchySelection([node], cts.token);
    } finally {
      cts.dispose();
    }
  };

  const debugFeature = async (fsPath: string): Promise<void> => {
    const node = await getFeatureHierarchyNodeForPath(store, fsPath);
    if (!node) {
      void vscode.window.showErrorMessage(
        "Behave Runner: could not resolve this feature file (open a workspace folder that contains it)."
      );
      return;
    }
    const cts = new vscode.CancellationTokenSource();
    try {
      await runBehaveHierarchyDebugSelection([node], cts.token);
    } finally {
      cts.dispose();
    }
  };

  const runScenario = async (
    fsPath: string,
    scenarioLine: number
  ): Promise<void> => {
    const node = await getScenarioNodeAtLine(store, fsPath, scenarioLine);
    if (!node) {
      void vscode.window.showErrorMessage(
        "Behave Runner: could not resolve scenario at this line."
      );
      return;
    }
    const cts = new vscode.CancellationTokenSource();
    try {
      await runBehaveHierarchySelection([node], cts.token);
    } finally {
      cts.dispose();
    }
  };

  const debugScenario = async (
    fsPath: string,
    scenarioLine: number
  ): Promise<void> => {
    const node = await getScenarioNodeAtLine(store, fsPath, scenarioLine);
    if (!node) {
      void vscode.window.showErrorMessage(
        "Behave Runner: could not resolve scenario at this line."
      );
      return;
    }
    const cts = new vscode.CancellationTokenSource();
    try {
      await runBehaveHierarchyDebugSelection([node], cts.token);
    } finally {
      cts.dispose();
    }
  };

  const runScenarioOutline = async (
    fsPath: string,
    outlineHeaderLine: number
  ): Promise<void> => {
    const nodes = await getScenarioOutlineExpansionNodes(
      store,
      fsPath,
      outlineHeaderLine
    );
    if (nodes.length === 0) {
      void vscode.window.showErrorMessage(
        "Behave Runner: no example rows found for this Scenario Outline."
      );
      return;
    }
    const cts = new vscode.CancellationTokenSource();
    try {
      await runBehaveHierarchySelection(nodes, cts.token);
    } finally {
      cts.dispose();
    }
  };

  const debugScenarioOutline = async (
    fsPath: string,
    outlineHeaderLine: number
  ): Promise<void> => {
    const nodes = await getScenarioOutlineExpansionNodes(
      store,
      fsPath,
      outlineHeaderLine
    );
    if (nodes.length === 0) {
      void vscode.window.showErrorMessage(
        "Behave Runner: no example rows found for this Scenario Outline."
      );
      return;
    }
    const cts = new vscode.CancellationTokenSource();
    try {
      await runBehaveHierarchyDebugSelection(nodes, cts.token);
    } finally {
      cts.dispose();
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("behaveRunner.editor.runFeature", runFeature),
    vscode.commands.registerCommand(
      "behaveRunner.editor.debugFeature",
      debugFeature
    ),
    vscode.commands.registerCommand(
      "behaveRunner.editor.runScenario",
      runScenario
    ),
    vscode.commands.registerCommand(
      "behaveRunner.editor.debugScenario",
      debugScenario
    ),
    vscode.commands.registerCommand(
      "behaveRunner.editor.runScenarioOutline",
      runScenarioOutline
    ),
    vscode.commands.registerCommand(
      "behaveRunner.editor.debugScenarioOutline",
      debugScenarioOutline
    )
  );
}
