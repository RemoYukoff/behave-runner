import {
  BEHAVE_FIND_FEATURE_STEP_LOCATIONS,
  type BehaveFindFeatureStepLocationsParams,
  collectBehaveStepDecoratorsAboveFunction,
  DEFAULT_STEP_DEFINITION_PATTERNS,
  DEFAULT_FEATURE_FILE_PATTERNS,
  isPythonFunctionDefinitionLine,
  type StepKeyword,
} from "@behave-runner/core";
import * as path from "path";
import {
  createConnection,
  DidChangeConfigurationNotification,
  Location,
  ProposedFeatures,
  Range,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import type { InitializeParams } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import {
  computeCompletions,
  computeDefinitions,
  computeFeatureDiagnostics,
} from "./featureHandlers";
import { FeatureStepIndex } from "./featureStepIndex";
import { StepDefinitionIndex } from "./stepIndex";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const stepIndex = new StepDefinitionIndex();
const featureStepIndex = new FeatureStepIndex();
let workspaceRoots: string[] = [];

function uriToFsPath(uri: string): string {
  return URI.parse(uri).fsPath;
}

function workspaceFolderForDoc(docUri: string): string | undefined {
  const fsPath = uriToFsPath(docUri);
  let best: string | undefined;
  let bestLen = 0;
  for (const root of workspaceRoots) {
    const sep = root.endsWith(path.sep) ? "" : path.sep;
    const prefix = root + sep;
    if (fsPath === root || fsPath.startsWith(prefix)) {
      if (root.length >= bestLen) {
        bestLen = root.length;
        best = root;
      }
    }
  }
  return best;
}

function publishDiagnostics(document: TextDocument): void {
  const uri = document.uri;
  const diags = computeFeatureDiagnostics(
    document,
    stepIndex.getDefinitions()
  );
  connection.sendDiagnostics({ uri, diagnostics: diags });
}

async function applyBehaveConfiguration(): Promise<void> {
  try {
    const configs = await connection.workspace.getConfiguration([
      { section: "behaveRunner" },
    ]);
    const cfg = configs?.[0] as
      | {
          stepDefinitions?: { patterns?: unknown };
          featureFiles?: { patterns?: unknown };
        }
      | undefined;

    const stepPatterns = cfg?.stepDefinitions?.patterns;
    if (
      Array.isArray(stepPatterns) &&
      stepPatterns.every((p: unknown) => typeof p === "string")
    ) {
      stepIndex.setPatterns(stepPatterns as string[]);
    } else {
      stepIndex.setPatterns(DEFAULT_STEP_DEFINITION_PATTERNS);
    }

    const featurePatterns = cfg?.featureFiles?.patterns;
    if (
      Array.isArray(featurePatterns) &&
      featurePatterns.every((p: unknown) => typeof p === "string")
    ) {
      featureStepIndex.setPatterns(featurePatterns as string[]);
    } else {
      featureStepIndex.setPatterns(DEFAULT_FEATURE_FILE_PATTERNS);
    }
  } catch {
    stepIndex.setPatterns(DEFAULT_STEP_DEFINITION_PATTERNS);
    featureStepIndex.setPatterns(DEFAULT_FEATURE_FILE_PATTERNS);
  }
}

async function rebuildStepAndFeatureIndexes(): Promise<void> {
  await Promise.all([stepIndex.rebuild(), featureStepIndex.rebuild()]);
}

async function refreshConfigurationAndIndexes(): Promise<void> {
  await applyBehaveConfiguration();
  await rebuildStepAndFeatureIndexes();
}

let stepDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let featureDebounceTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleStepIndexRebuild(): void {
  clearTimeout(stepDebounceTimer);
  stepDebounceTimer = setTimeout(() => {
    void stepIndex.rebuild().then(() => {
      for (const doc of documents.all()) {
        publishDiagnostics(doc);
      }
    });
  }, 200);
}

function scheduleFeatureIndexRebuild(): void {
  clearTimeout(featureDebounceTimer);
  featureDebounceTimer = setTimeout(() => {
    void featureStepIndex.rebuild().then(() => {
      for (const doc of documents.all()) {
        publishDiagnostics(doc);
      }
    });
  }, 200);
}

connection.onInitialize((params: InitializeParams) => {
  workspaceRoots =
    params.workspaceFolders?.map((f) => uriToFsPath(f.uri)) ??
    (params.rootUri ? [uriToFsPath(params.rootUri)] : []);
  stepIndex.setWorkspaceRoots(workspaceRoots);
  featureStepIndex.setWorkspaceRoots(workspaceRoots);

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [" "],
      },
      definitionProvider: true,
    },
  };
});

connection.onInitialized(async () => {
  try {
    await connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  } catch {
    // Client may not support dynamic registration
  }
  await refreshConfigurationAndIndexes();
  for (const doc of documents.all()) {
    publishDiagnostics(doc);
  }
});

connection.onDidChangeConfiguration(async () => {
  await refreshConfigurationAndIndexes();
  for (const doc of documents.all()) {
    publishDiagnostics(doc);
  }
});

// Note: do not use connection.workspace.onDidChangeWorkspaceFolders — the VS Code
// LanguageClient does not advertise clientCapabilities.workspace.workspaceFolders,
// so accessing that getter crashes the server at load time.

connection.onDidChangeWatchedFiles((params) => {
  let pyDirty = false;
  let featureDirty = false;
  for (const change of params.changes) {
    const fsPath = uriToFsPath(change.uri);
    if (fsPath.endsWith(".feature")) {
      featureDirty = true;
    } else if (fsPath.endsWith(".py")) {
      pyDirty = true;
    }
  }
  if (featureDirty) {
    scheduleFeatureIndexRebuild();
  }
  if (pyDirty) {
    scheduleStepIndexRebuild();
  }
});

connection.onRequest(
  BEHAVE_FIND_FEATURE_STEP_LOCATIONS,
  (params: BehaveFindFeatureStepLocationsParams): Location[] | null => {
    const lines = params.text.split(/\n/);
    const line = lines[params.functionLine];
    if (!line || !isPythonFunctionDefinitionLine(line)) {
      return null;
    }
    const decorators = collectBehaveStepDecoratorsAboveFunction(
      lines,
      params.functionLine
    );
    if (decorators.length === 0) {
      return null;
    }
    const locs: Location[] = [];
    for (const { keyword, pattern } of decorators) {
      for (const step of featureStepIndex.findMatchingSteps(
        pattern,
        keyword as StepKeyword
      )) {
        locs.push(
          Location.create(
            URI.file(step.filePath).toString(),
            Range.create(
              step.line,
              step.character,
              step.line,
              step.character + step.text.length
            )
          )
        );
      }
    }
    return locs.length > 0 ? locs : null;
  }
);

documents.onDidChangeContent((change) => {
  publishDiagnostics(change.document);
});

documents.onDidOpen((e) => {
  publishDiagnostics(e.document);
});

documents.onDidClose((e) => {
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) {
    return [];
  }
  return computeCompletions(
    doc,
    params.position,
    workspaceFolderForDoc(doc.uri),
    stepIndex.getDefinitions()
  );
});

connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) {
    return null;
  }
  return computeDefinitions(
    doc,
    params.position,
    stepIndex.getDefinitions()
  );
});

documents.listen(connection);
connection.listen();
