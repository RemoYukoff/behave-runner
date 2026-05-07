import {
  analyzeFeatureDocument,
  type AnalyzeFeatureDocumentResult,
  type StepDefinition,
} from "@behave-runner/core";
import type { TextDocument } from "vscode-languageserver-textdocument";

/** Per-URI map of analysis keyed by document version (invalidated on step-index rebuild). */
const cache = new Map<string, Map<number, AnalyzeFeatureDocumentResult>>();

export function clearFeatureAnalysisCache(): void {
  cache.clear();
}

export function evictFeatureAnalysisForUri(uri: string): void {
  cache.delete(uri);
}

export function getFeatureAnalysis(
  doc: TextDocument,
  definitions: StepDefinition[]
): AnalyzeFeatureDocumentResult {
  let byVersion = cache.get(doc.uri);
  if (!byVersion) {
    byVersion = new Map();
    cache.set(doc.uri, byVersion);
  }
  const hit = byVersion.get(doc.version);
  if (hit) {
    return hit;
  }
  const result = analyzeFeatureDocument(doc.getText(), definitions);
  byVersion.set(doc.version, result);
  return result;
}
