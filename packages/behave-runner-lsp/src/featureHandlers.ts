import {
  findMatchingDefinitions,
  parseStepLine,
  parseStepLinePrefixForCompletion,
  resolveEffectiveKeyword,
  type StepDefinition,
  type StepKeyword,
} from "@behave-runner/core";
import type {
  CompletionItem,
  Diagnostic,
  Position,
  Range,
} from "vscode-languageserver";
import {
  CompletionItemKind,
  DiagnosticSeverity,
  InsertTextFormat,
  Location,
  Range as RangeConstructor,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import * as path from "path";

function behavePatternToSnippet(pattern: string): string {
  let snippetIndex = 1;
  return pattern.replace(/\{(\w+)(?::\w)?\}/g, (_, name: string) => {
    return `\${${snippetIndex++}:${name}}`;
  });
}

function filterDefinitionsByKeyword(
  definitions: StepDefinition[],
  effectiveKeyword: StepKeyword | null
): StepDefinition[] {
  if (!effectiveKeyword) {
    return definitions;
  }
  return definitions.filter(
    (def) => def.keyword === "step" || def.keyword === effectiveKeyword
  );
}

function getStepTextRange(
  lineText: string,
  line: number,
  stepKeyword: string
): Range | null {
  const keywordMatch = lineText.match(
    new RegExp(`^(\\s*)(${stepKeyword})\\s+`, "i")
  );
  if (!keywordMatch) {
    return null;
  }
  const indent = keywordMatch[1].length;
  const keywordLength = keywordMatch[2].length;
  const startChar = indent + keywordLength + 1;
  const endChar = lineText.trimEnd().length;
  if (startChar >= endChar) {
    return null;
  }
  return RangeConstructor.create(line, startChar, line, endChar);
}

export function computeFeatureDiagnostics(
  document: TextDocument,
  allDefinitions: StepDefinition[]
): Diagnostic[] {
  const text = document.getText();
  const lines = text.split("\n");
  const diagnostics: Diagnostic[] = [];
  let previousKeyword: StepKeyword | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineText = lines[lineIndex];
    const stepInfo = parseStepLine(lineText, previousKeyword);
    if (!stepInfo) {
      if (lineText.match(/^\s*(Scenario|Feature|Background|Examples)/i)) {
        previousKeyword = null;
      }
      continue;
    }

    if (stepInfo.effectiveKeyword) {
      previousKeyword = stepInfo.effectiveKeyword;
    }

    const matches = findMatchingDefinitions(
      stepInfo.text,
      stepInfo.effectiveKeyword,
      allDefinitions
    );

    if (matches.length === 0) {
      const stepMatch = lineText.match(/^\s*(Given|When|Then|And|But)\s+/i);
      const startChar = stepMatch ? stepMatch[0].length : 0;
      diagnostics.push({
        range: RangeConstructor.create(
          lineIndex,
          startChar,
          lineIndex,
          lineText.length
        ),
        message: `Undefined step: "${stepInfo.text}"`,
        severity: DiagnosticSeverity.Warning,
        source: "Behave Runner",
        code: "undefined-step",
      });
    }
  }

  return diagnostics;
}

export function computeCompletions(
  document: TextDocument,
  position: Position,
  workspaceFolderPath: string | undefined,
  allDefinitions: StepDefinition[]
): CompletionItem[] {
  const line = document
    .getText(
      RangeConstructor.create(position.line, 0, position.line + 1, 0)
    )
    .replace(/\r?\n$/, "");
  const docLines = document.getText().split("\n");
  const parsed = parseStepLinePrefixForCompletion(
    line,
    docLines,
    position.line
  );
  if (!parsed) {
    return [];
  }

  const { partialText, keywordEnd, effectiveKeyword } = parsed;

  const filtered = filterDefinitionsByKeyword(
    allDefinitions,
    effectiveKeyword
  );
  const lowerPartial = partialText.toLowerCase().trim();
  const matching = lowerPartial
    ? filtered.filter((def) =>
        def.pattern.toLowerCase().includes(lowerPartial)
      )
    : filtered;

  const sorted = [...matching].sort((a, b) => {
    const aLower = a.pattern.toLowerCase();
    const bLower = b.pattern.toLowerCase();
    const aStarts = aLower.startsWith(lowerPartial);
    const bStarts = bLower.startsWith(lowerPartial);
    if (aStarts && !bStarts) {
      return -1;
    }
    if (!aStarts && bStarts) {
      return 1;
    }
    return aLower.localeCompare(bLower);
  });

  const seenPatterns = new Set<string>();
  const unique: StepDefinition[] = [];
  for (const def of sorted) {
    if (!seenPatterns.has(def.pattern)) {
      seenPatterns.add(def.pattern);
      unique.push(def);
    }
  }

  const items: CompletionItem[] = [];
  for (let i = 0; i < unique.length; i++) {
    const def = unique[i];
    const snippetText = behavePatternToSnippet(def.pattern);
    const relativePath = workspaceFolderPath
      ? path.relative(workspaceFolderPath, def.filePath)
      : path.basename(def.filePath);

    items.push({
      label: def.pattern,
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      detail: `${def.keyword} step`,
      documentation: {
        kind: "markdown",
        value: `Defined in \`${relativePath}:${def.line + 1}\``,
      },
      sortText: String(i).padStart(5, "0"),
      textEdit: {
        range: RangeConstructor.create(
          position.line,
          keywordEnd,
          position.line,
          line.length
        ),
        newText: snippetText,
      },
    });
  }

  return items;
}

export function computeDefinitions(
  document: TextDocument,
  position: Position,
  allDefinitions: StepDefinition[]
): Location[] | null {
  const lines = document.getText().split("\n");
  const lineText = lines[position.line] ?? "";
  const effectiveKeyword = resolveEffectiveKeyword(lines, position.line);
  const stepInfo = parseStepLine(lineText, effectiveKeyword);
  if (!stepInfo) {
    return null;
  }

  const originRange = getStepTextRange(
    lineText,
    position.line,
    stepInfo.keyword
  );
  if (!originRange || !positionInRange(position, originRange)) {
    return null;
  }

  const matchingDefs = findMatchingDefinitions(
    stepInfo.text,
    stepInfo.effectiveKeyword as StepKeyword | null,
    allDefinitions
  );
  if (matchingDefs.length === 0) {
    return null;
  }

  return matchingDefs.map((def) =>
    Location.create(
      URI.file(def.filePath).toString(),
      RangeConstructor.create(
        def.line,
        def.character,
        def.line,
        def.character
      )
    )
  );
}

function positionInRange(position: Position, range: Range): boolean {
  if (position.line < range.start.line || position.line > range.end.line) {
    return false;
  }
  if (position.line === range.start.line && position.character < range.start.character) {
    return false;
  }
  if (position.line === range.end.line && position.character > range.end.character) {
    return false;
  }
  return true;
}
