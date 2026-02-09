import * as vscode from "vscode";
import * as path from "path";
import { getStepScanner } from "./stepScanner";
import { resolveEffectiveKeyword } from "./stepMatcher";
import { StepDefinition, StepKeyword } from "./types";
import { STEP_KEYWORD_PARTIAL_REGEX } from "./constants";

/**
 * Converts a Behave pattern to a VS Code snippet string.
 *
 * Transforms placeholders like:
 * - {name} -> ${1:name}
 * - {n:d} -> ${1:n}
 * - {count:f} -> ${1:count}
 *
 * @param pattern The Behave pattern string
 * @returns A VS Code snippet string
 */
function behavePatternToSnippet(pattern: string): string {
  let snippetIndex = 1;

  // Replace Behave placeholders {name} or {name:type} with VS Code snippet placeholders
  return pattern.replace(/\{(\w+)(?::\w)?\}/g, (_, name) => {
    return `\${${snippetIndex++}:${name}}`;
  });
}

/**
 * Extracts the step keyword and partial text from a line.
 *
 * @param line The current line text
 * @returns Object with keyword and partial text, or null if not a step line
 */
function parseCurrentLine(
  line: string
): { keyword: string; partialText: string; keywordEnd: number } | null {
  const match = line.match(STEP_KEYWORD_PARTIAL_REGEX);
  if (!match) {
    return null;
  }

  const fullMatch = match[0];
  const keyword = match[1];
  const partialText = match[2] || "";
  // Calculate where the keyword ends (including the space after it)
  const keywordEnd = fullMatch.length - partialText.length;

  return { keyword, partialText, keywordEnd };
}

/**
 * Filters step definitions based on keyword compatibility.
 *
 * @param definitions All step definitions
 * @param effectiveKeyword The effective keyword (given, when, then) or null
 * @returns Filtered definitions that match the keyword
 */
function filterByKeyword(
  definitions: StepDefinition[],
  effectiveKeyword: StepKeyword | null
): StepDefinition[] {
  if (!effectiveKeyword) {
    // If we can't determine the keyword, show all definitions
    return definitions;
  }

  return definitions.filter(
    (def) => def.keyword === "step" || def.keyword === effectiveKeyword
  );
}

/**
 * Provides step completion suggestions in .feature files.
 */
export class StepCompletionProvider implements vscode.CompletionItemProvider {
  /**
   * Provides completion items for steps in .feature files.
   */
  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.CompletionItem[] | null {
    const line = document.lineAt(position.line).text;
    const parsed = parseCurrentLine(line);

    if (!parsed) {
      return null;
    }

    const { keyword, partialText, keywordEnd } = parsed;

    // Resolve the effective keyword for And/But
    let effectiveKeyword: StepKeyword | null = null;
    const lowerKeyword = keyword.toLowerCase();

    if (lowerKeyword === "given" || lowerKeyword === "when" || lowerKeyword === "then") {
      effectiveKeyword = lowerKeyword as StepKeyword;
    } else if (lowerKeyword === "and" || lowerKeyword === "but" || lowerKeyword === "*") {
      // Resolve parent keyword by scanning backwards
      const lines = document.getText().split("\n");
      effectiveKeyword = resolveEffectiveKeyword(lines, position.line);
    }

    // Get all step definitions
    const scanner = getStepScanner();
    const allDefinitions = scanner.getAllDefinitions();

    // Filter by keyword
    const filteredDefinitions = filterByKeyword(allDefinitions, effectiveKeyword);

    // Filter by partial text match (case-insensitive)
    const lowerPartial = partialText.toLowerCase().trim();
    const matchingDefinitions = lowerPartial
      ? filteredDefinitions.filter((def) =>
          def.pattern.toLowerCase().includes(lowerPartial)
        )
      : filteredDefinitions;

    // Sort results: prioritize patterns that start with the partial text
    const sortedDefinitions = [...matchingDefinitions].sort((a, b) => {
      const aLower = a.pattern.toLowerCase();
      const bLower = b.pattern.toLowerCase();
      const aStartsWith = aLower.startsWith(lowerPartial);
      const bStartsWith = bLower.startsWith(lowerPartial);

      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      return aLower.localeCompare(bLower);
    });

    // Deduplicate by pattern (same pattern might be defined multiple times)
    const seenPatterns = new Set<string>();
    const uniqueDefinitions: StepDefinition[] = [];

    for (const def of sortedDefinitions) {
      if (!seenPatterns.has(def.pattern)) {
        seenPatterns.add(def.pattern);
        uniqueDefinitions.push(def);
      }
    }

    // Create completion items
    const items: vscode.CompletionItem[] = [];

    for (let i = 0; i < uniqueDefinitions.length; i++) {
      const def = uniqueDefinitions[i];
      const snippetText = behavePatternToSnippet(def.pattern);

      const item = new vscode.CompletionItem(
        def.pattern,
        vscode.CompletionItemKind.Snippet
      );

      item.insertText = new vscode.SnippetString(snippetText);
      item.detail = `${def.keyword} step`;

      // Get relative path for documentation
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      const relativePath = workspaceFolder
        ? path.relative(workspaceFolder.uri.fsPath, def.filePath)
        : path.basename(def.filePath);

      item.documentation = new vscode.MarkdownString(
        `Defined in \`${relativePath}:${def.line + 1}\``
      );

      // Set sort order to maintain our custom sorting
      item.sortText = String(i).padStart(5, "0");

      // Replace from the end of the keyword (after the space)
      const range = new vscode.Range(
        position.line,
        keywordEnd,
        position.line,
        line.length
      );
      item.range = range;

      items.push(item);
    }

    return items;
  }
}
