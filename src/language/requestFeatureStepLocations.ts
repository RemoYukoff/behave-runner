import {
  BEHAVE_FIND_FEATURE_STEP_LOCATIONS,
  type BehaveFindFeatureStepLocationsParams,
} from "@behave-runner/core";
import type { LanguageClient } from "vscode-languageclient/node";
import * as vscode from "vscode";

type LspLocation = {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
};

export async function requestFeatureStepLocationsFromLsp(
  client: LanguageClient,
  document: vscode.TextDocument,
  functionLine: number
): Promise<vscode.Location[] | null> {
  await client.start();
  const params: BehaveFindFeatureStepLocationsParams = {
    functionLine,
    text: document.getText(),
  };
  const raw = await client.sendRequest<LspLocation[] | null>(
    BEHAVE_FIND_FEATURE_STEP_LOCATIONS,
    params
  );
  if (!raw?.length) {
    return null;
  }
  return raw.map(
    (l) =>
      new vscode.Location(
        vscode.Uri.parse(l.uri),
        new vscode.Range(
          l.range.start.line,
          l.range.start.character,
          l.range.end.line,
          l.range.end.character
        )
      )
  );
}
