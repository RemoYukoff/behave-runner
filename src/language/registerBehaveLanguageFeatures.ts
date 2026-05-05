import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";
import { BehaveReferenceProvider } from "../stepReferenceProvider";
import { BehaveStepUsageProvider } from "../stepUsageProvider";

/** Python ↔ `.feature` providers that delegate matching to the language server. */
export function registerBehaveLanguageFeatures(
  context: vscode.ExtensionContext,
  opts: { languageClient: LanguageClient }
): void {
  const { languageClient } = opts;

  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(
      { language: "python", scheme: "file" },
      new BehaveReferenceProvider(languageClient)
    )
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: "python", scheme: "file" },
      new BehaveStepUsageProvider(languageClient)
    )
  );
}
