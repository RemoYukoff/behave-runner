import * as vscode from "vscode";
import * as path from "path";
import { getStepScanner } from "./services";
import { resolveEffectiveKeyword } from "./stepMatcher";
import { StepDefinition, StepKeyword } from "./types";
import { STEP_KEYWORD_PARTIAL_REGEX, BEHAVE_PLACEHOLDER_REGEX_GLOBAL, SORT_TEXT_PAD_LENGTH } from "./constants";

/**
 * Clone a CompletionItem with a new range and optional sortText.
 * Avoids creating full copies for each property when only range/sortText changes.
 */
function cloneCompletionItemWithRange(
  item: vscode.CompletionItem,
  range: vscode.Range,
  sortText?: string
): vscode.CompletionItem {
  const newItem = new vscode.CompletionItem(item.label, item.kind);
  newItem.insertText = item.insertText;
  newItem.detail = item.detail;
  newItem.documentation = item.documentation;
  newItem.sortText = sortText ?? item.sortText;
  newItem.range = range;
  return newItem;
}

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

  // Reset lastIndex before use since we're reusing the global regex
  BEHAVE_PLACEHOLDER_REGEX_GLOBAL.lastIndex = 0;

  // Replace Behave placeholders {name} or {name:type} with VS Code snippet placeholders
  return pattern.replace(BEHAVE_PLACEHOLDER_REGEX_GLOBAL, (_, name) => {
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
  const partialText = match[2] ?? "";
  // Calculate where the keyword ends (including the space after it)
  const keywordEnd = fullMatch.length - partialText.length;

  return { keyword, partialText, keywordEnd };
}

/**
 * Cache entry for pre-computed completion items by keyword.
 */
interface CompletionCache {
  /** Scanner version when cache was created */
  version: number;
  /** Pre-computed items by effective keyword (null = all keywords) */
  byKeyword: Map<StepKeyword | "all", vscode.CompletionItem[]>;
}

/**
 * Provides step completion suggestions in .feature files.
 * Caches completion items by scanner version and keyword for performance.
 */
export class StepCompletionProvider implements vscode.CompletionItemProvider {
  /** Cached completion items */
  private cache: CompletionCache | null = null;

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
      // Resolve parent keyword by scanning backwards using document.lineAt()
      effectiveKeyword = resolveEffectiveKeyword(document, position.line);
    }

    // Get cached items for this keyword
    const cacheKey: StepKeyword | "all" = effectiveKeyword ?? "all";
    const cachedItems = this.getCachedItems(document, cacheKey);

    // Create the replacement range once
    const range = new vscode.Range(position.line, keywordEnd, position.line, line.length);

    // Filter by partial text match (case-insensitive)
    const lowerPartial = partialText.toLowerCase().trim();

    if (lowerPartial) {
      // Filter matching items
      let items = cachedItems.filter((item) =>
        item.label.toString().toLowerCase().includes(lowerPartial)
      );

      // Re-sort to prioritize patterns that start with the partial text
      items.sort((a, b) => {
        const aLabel = a.label.toString().toLowerCase();
        const bLabel = b.label.toString().toLowerCase();
        const aStartsWith = aLabel.startsWith(lowerPartial);
        const bStartsWith = bLabel.startsWith(lowerPartial);

        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        return aLabel.localeCompare(bLabel);
      });

      // Clone items with updated sort text and range
      return items.map((item, i) =>
        cloneCompletionItemWithRange(item, range, String(i).padStart(SORT_TEXT_PAD_LENGTH, "0"))
      );
    }

    // No filtering needed - set range on cached items directly
    // VS Code handles the range property being set on shared items
    for (const item of cachedItems) {
      item.range = range;
    }
    return cachedItems;
  }

  /**
   * Get cached completion items for a keyword, rebuilding cache if needed.
   */
  private getCachedItems(
    document: vscode.TextDocument,
    cacheKey: StepKeyword | "all"
  ): vscode.CompletionItem[] {
    const scanner = getStepScanner();
    const currentVersion = scanner.getVersion();

    // Invalidate cache if version changed
    if (this.cache?.version !== currentVersion) {
      this.cache = {
        version: currentVersion,
        byKeyword: new Map(),
      };
    }

    // Check if we have cached items for this keyword
    const cached = this.cache.byKeyword.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Build items for this keyword using indexed lookup
    const effectiveKeyword = cacheKey === "all" ? null : cacheKey;
    const filteredDefinitions = scanner.getDefinitionsByKeyword(effectiveKeyword);

    // Sort alphabetically
    const sortedDefinitions = [...filteredDefinitions].sort((a, b) =>
      a.pattern.toLowerCase().localeCompare(b.pattern.toLowerCase())
    );

    // Deduplicate by pattern
    const seenPatterns = new Set<string>();
    const uniqueDefinitions: StepDefinition[] = [];

    for (const def of sortedDefinitions) {
      if (!seenPatterns.has(def.pattern)) {
        seenPatterns.add(def.pattern);
        uniqueDefinitions.push(def);
      }
    }

    // Create completion items (without range - will be set per-invocation)
    const items: vscode.CompletionItem[] = [];
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

    for (let i = 0; i < uniqueDefinitions.length; i++) {
      const def = uniqueDefinitions[i];
      const snippetText = behavePatternToSnippet(def.pattern);

      const item = new vscode.CompletionItem(
        def.pattern,
        vscode.CompletionItemKind.Snippet
      );

      item.insertText = new vscode.SnippetString(snippetText);
      item.detail = `${def.keyword} step`;

      const relativePath = workspaceFolder
        ? path.relative(workspaceFolder.uri.fsPath, def.filePath)
        : path.basename(def.filePath);

      item.documentation = new vscode.MarkdownString(
        `Defined in \`${relativePath}:${def.line + 1}\``
      );

      item.sortText = String(i).padStart(SORT_TEXT_PAD_LENGTH, "0");

      items.push(item);
    }

    this.cache.byKeyword.set(cacheKey, items);
    return items;
  }
}
