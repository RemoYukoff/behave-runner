import * as vscode from "vscode";
import { getStepScanner } from "./services";
import {
  findMatchingDefinitions,
  parseStepLine,
  resolveEffectiveKeyword,
} from "./stepMatcher";
import { StepKeyword } from "./types";
import { isInsideDocString } from "./utils";
import { REGEX_SPECIAL_CHARS } from "./constants";

/**
 * Cache entry for a line's definition lookup result.
 */
interface LineCacheEntry {
  /** Document version when this entry was created */
  documentVersion: number;
  /** The computed LocationLinks (null if no match) */
  locationLinks: vscode.LocationLink[] | null;
  /** The range that triggers this definition (for position check) */
  originRange: vscode.Range | null;
}

/**
 * Cache for a single file, mapping line numbers to cache entries.
 */
type FileCache = Map<number, LineCacheEntry>;

/**
 * Provides "Go to Definition" functionality for Behave steps.
 * Allows Ctrl+Click on steps in .feature files to navigate to their Python definitions.
 *
 * Caches results per line to avoid redundant computation on repeated hover.
 */
export class BehaveDefinitionProvider implements vscode.DefinitionProvider {
  /**
   * Two-level cache: filePath -> lineNumber -> CacheEntry
   * This structure allows efficient per-file operations and avoids string concatenation.
   */
  private cache = new Map<string, FileCache>();

  /**
   * Track the last known definitions count to invalidate cache when Python files change.
   */
  private lastDefinitionsCount = 0;

  /**
   * Provide the definition location for a step at the given position.
   */
  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.LocationLink[] | null> {
    const filePath = document.uri.fsPath;
    const lineNumber = position.line;
    const cached = this.getCachedEntry(filePath, lineNumber);

    // Check if we have a valid cache entry
    const scanner = getStepScanner();
    const currentDefinitionsCount = scanner.getAllDefinitions().length;

    if (cached) {
      // Invalidate if document changed or Python definitions changed
      const isValid =
        cached.documentVersion === document.version &&
        this.lastDefinitionsCount === currentDefinitionsCount;

      if (isValid) {
        // Check if cursor is within the step text range
        if (cached.originRange && cached.originRange.contains(position)) {
          return cached.locationLinks;
        }
        // Cursor is not in the step range (e.g., on keyword)
        return null;
      }
    }

    // Update definitions count tracker
    this.lastDefinitionsCount = currentDefinitionsCount;

    // Compute the result
    const result = await this.computeDefinition(document, position);

    // Cache the result
    this.setCachedEntry(filePath, lineNumber, {
      documentVersion: document.version,
      locationLinks: result.locationLinks,
      originRange: result.originRange,
    });

    // Check if cursor is within the step text range
    if (result.originRange && result.originRange.contains(position)) {
      return result.locationLinks;
    }

    return null;
  }

  /**
   * Get a cached entry for a specific file and line.
   */
  private getCachedEntry(filePath: string, line: number): LineCacheEntry | undefined {
    const fileCache = this.cache.get(filePath);
    return fileCache?.get(line);
  }

  /**
   * Set a cached entry for a specific file and line.
   */
  private setCachedEntry(filePath: string, line: number, entry: LineCacheEntry): void {
    let fileCache = this.cache.get(filePath);
    if (!fileCache) {
      fileCache = new Map();
      this.cache.set(filePath, fileCache);
    }
    fileCache.set(line, entry);
  }

  /**
   * Compute the definition for a step at the given position.
   */
  private async computeDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<{ locationLinks: vscode.LocationLink[] | null; originRange: vscode.Range | null }> {
    const line = document.lineAt(position.line);
    const lineText = line.text;

    // Parse the step from the current line
    const lines = document.getText().split("\n");

    // Check if we're inside a doc string block - if so, ignore
    if (isInsideDocString(lines, position.line)) {
      return { locationLinks: null, originRange: null };
    }

    const effectiveKeyword = resolveEffectiveKeyword(lines, position.line);

    const stepInfo = parseStepLine(lineText, effectiveKeyword);
    if (!stepInfo) {
      // Not a step line
      return { locationLinks: null, originRange: null };
    }

    // Calculate the origin selection range (the step text to underline)
    const originRange = this.getStepTextRange(line, stepInfo.keyword);
    if (!originRange) {
      return { locationLinks: null, originRange: null };
    }

    // Get all step definitions from the scanner
    const scanner = getStepScanner();
    let allDefinitions = scanner.getAllDefinitions();

    if (allDefinitions.length === 0) {
      // Scanner might not be initialized yet, try to initialize
      await scanner.initialize();
      allDefinitions = scanner.getAllDefinitions();
      if (allDefinitions.length === 0) {
        return { locationLinks: null, originRange };
      }
    }

    // Find matching definitions
    const matchingDefs = findMatchingDefinitions(
      stepInfo.text,
      stepInfo.effectiveKeyword as StepKeyword | null,
      allDefinitions
    );

    if (matchingDefs.length === 0) {
      return { locationLinks: null, originRange };
    }

    // Return LocationLinks for all matches
    const locationLinks: vscode.LocationLink[] = matchingDefs.map((def) => {
      const targetUri = vscode.Uri.file(def.filePath);
      const targetPos = new vscode.Position(def.line, def.character);

      // Target range: the decorator line
      const targetRange = new vscode.Range(targetPos, targetPos);

      return {
        // The range in the .feature file that gets underlined
        originSelectionRange: originRange,
        // The target file
        targetUri,
        // The full range in the target (used for preview)
        targetRange,
        // The exact position to navigate to
        targetSelectionRange: targetRange,
      };
    });

    return { locationLinks, originRange };
  }

  /**
   * Calculate the range of the step text (without the keyword).
   * Example: "    Given the first number is 1"
   *          Returns range for "the first number is 1"
   */
  private getStepTextRange(
    line: vscode.TextLine,
    keyword: string
  ): vscode.Range | null {
    const lineText = line.text;

    // Escape special regex characters in keyword (e.g., * becomes \*)
    const escapedKeyword = keyword.replace(REGEX_SPECIAL_CHARS, "\\$&");

    // Find the keyword position
    const keywordMatch = lineText.match(
      new RegExp(`^(\\s*)(${escapedKeyword})\\s+`, "i")
    );

    if (!keywordMatch) {
      return null;
    }

    const indent = keywordMatch[1].length;
    const keywordLength = keywordMatch[2].length;

    // Start after keyword and space
    const startChar = indent + keywordLength + 1;

    // End at the end of the line (trimmed)
    const endChar = lineText.trimEnd().length;

    if (startChar >= endChar) {
      return null;
    }

    return new vscode.Range(
      new vscode.Position(line.lineNumber, startChar),
      new vscode.Position(line.lineNumber, endChar)
    );
  }

  /**
   * Clear the cache. Call this when documents close or on extension deactivation.
   */
  public clearCache(): void {
    this.cache.clear();
  }
}
