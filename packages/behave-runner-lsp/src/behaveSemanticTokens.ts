import {
  computeFeatureSemanticTokenSpans,
  type AnalyzeFeatureDocumentResult,
  type FeatureSemanticTokenKind,
  type FeatureSemanticTokenSpan,
} from "@behave-runner/core";
import { SemanticTokensBuilder } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

/**
 * Custom semantic token types (order = legend indices). Declared in package.json
 * `contributes.semanticTokenTypes` with `superType` for theme fallback.
 */
const TOKEN_TYPES = [
  "behaveComment",
  "behaveStructuralKeyword",
  "behaveStepKeyword",
  "behaveTitle",
  "behaveStepText",
  "behaveDocstring",
  "behaveTable",
  "behavePlaceholder",
  "behaveTag",
] as const;

const KIND_TO_TYPE_INDEX = new Map<FeatureSemanticTokenKind, number>([
  ["comment", 0],
  ["structuralKeyword", 1],
  ["stepKeyword", 2],
  ["title", 3],
  ["stepText", 4],
  ["docstring", 5],
  ["table", 6],
  ["placeholder", 7],
  ["tag", 8],
]);

export const BEHAVE_SEMANTIC_TOKEN_LEGEND = {
  tokenTypes: [...TOKEN_TYPES],
  tokenModifiers: [] as string[],
};

function compareSpans(
  a: { line: number; start: number; length: number },
  b: { line: number; start: number; length: number }
): number {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  if (a.start !== b.start) {
    return a.start - b.start;
  }
  return b.length - a.length;
}

function encodeSemanticSpans(
  spans: FeatureSemanticTokenSpan[]
): ReturnType<SemanticTokensBuilder["build"]> {
  const sorted = [...spans].sort(compareSpans);
  const builder = new SemanticTokensBuilder();
  for (const s of sorted) {
    const tokenType = KIND_TO_TYPE_INDEX.get(s.kind);
    if (tokenType === undefined) {
      continue;
    }
    builder.push(s.line, s.start, s.length, tokenType, 0);
  }
  return builder.build();
}

export function buildBehaveSemanticTokensFromAnalysis(
  analysis: AnalyzeFeatureDocumentResult
): ReturnType<SemanticTokensBuilder["build"]> {
  return encodeSemanticSpans(analysis.semanticSpans);
}

export function buildBehaveSemanticTokensInRangeFromAnalysis(
  analysis: AnalyzeFeatureDocumentResult,
  startLine: number,
  endLine: number
): ReturnType<SemanticTokensBuilder["build"]> {
  const filtered = analysis.semanticSpans.filter(
    (s) => s.line >= startLine && s.line <= endLine
  );
  return encodeSemanticSpans(filtered);
}

export function buildBehaveSemanticTokens(doc: TextDocument): ReturnType<
  SemanticTokensBuilder["build"]
> {
  return encodeSemanticSpans(computeFeatureSemanticTokenSpans(doc.getText()));
}

export function buildBehaveSemanticTokensInRange(
  doc: TextDocument,
  startLine: number,
  endLine: number
): ReturnType<SemanticTokensBuilder["build"]> {
  const spans = computeFeatureSemanticTokenSpans(doc.getText()).filter(
    (s) => s.line >= startLine && s.line <= endLine
  );
  return encodeSemanticSpans(spans);
}
