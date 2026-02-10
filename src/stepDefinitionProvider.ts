import * as vscode from "vscode";
import { getStepScanner } from "./services";
import {
  findMatchingDefinitions,
  parseStepLine,
  resolveEffectiveKeyword,
} from "./stepMatcher";
import { isLineInsideDocStringDocument, escapeRegex, LRUCache, normalizePath } from "./utils";
import { DEFINITION_LINE_CACHE_MAX_SIZE, DEFINITION_FILE_CACHE_MAX_SIZE } from "./constants";

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
 * Uses LRU eviction to limit memory usage per file.
 */
type FileCache = LRUCache<number, LineCacheEntry>;

/**
 * Provides "Go to Definition" functionality for Behave steps.
 * Allows Ctrl+Click on steps in .feature files to navigate to their Python definitions.
 *
 * Caches results per line to avoid redundant computation on repeated hover.
 */
export class BehaveDefinitionProvider implements vscode.DefinitionProvider {
  /**
   * Two-level cache: filePath -> lineNumber -> CacheEntry
   * Uses LRU eviction at both levels to prevent unbounded memory growth:
   * - Outer cache limits number of files cached
   * - Inner cache limits number of lines per file
   */
  private cache = new LRUCache<string, FileCache>(DEFINITION_FILE_CACHE_MAX_SIZE);

  /**
   * Track the last known scanner version to invalidate cache when Python files change.
   * Using version instead of count ensures cache invalidation even when a step is
   * renamed (same count, different content).
   */
  private lastScannerVersion = 0;

  /**
   * Provide the definition location for a step at the given position.
   */
  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.LocationLink[] | null> {
    // Early exit if operation was cancelled
    if (token.isCancellationRequested) {
      return null;
    }

    const filePath = document.uri.fsPath;
    const lineNumber = position.line;
    const cached = this.getCachedEntry(filePath, lineNumber);

    // Check if we have a valid cache entry
    const scanner = getStepScanner();
    const currentScannerVersion = scanner.getVersion();

    if (cached) {
      // Invalidate if document changed or Python definitions changed
      const isValid =
        cached.documentVersion === document.version &&
        this.lastScannerVersion === currentScannerVersion;

      if (isValid) {
        // Check if cursor is within the step text range
        if (cached.originRange?.contains(position)) {
          return cached.locationLinks;
        }
        // Cursor is not in the step range (e.g., on keyword)
        return null;
      }
    }

    // Check cancellation before expensive computation
    if (token.isCancellationRequested) {
      return null;
    }

    // Update scanner version tracker
    this.lastScannerVersion = currentScannerVersion;

    // Compute the result
    const result = await this.computeDefinition(document, position);

    // Don't cache if cancelled
    if (token.isCancellationRequested) {
      return null;
    }

    // Cache the result
    this.setCachedEntry(filePath, lineNumber, {
      documentVersion: document.version,
      locationLinks: result.locationLinks,
      originRange: result.originRange,
    });

    // Check if cursor is within the step text range
    if (result.originRange?.contains(position)) {
      return result.locationLinks;
    }

    return null;
  }

  /**
   * Get a cached entry for a specific file and line.
   * Normalizes the file path for cross-platform consistency.
   */
  private getCachedEntry(filePath: string, line: number): LineCacheEntry | undefined {
    const normalizedPath = normalizePath(filePath);
    const fileCache = this.cache.get(normalizedPath);
    return fileCache?.get(line);
  }

  /**
   * Set a cached entry for a specific file and line.
   * Normalizes the file path for cross-platform consistency.
   */
  private setCachedEntry(filePath: string, line: number, entry: LineCacheEntry): void {
    const normalizedPath = normalizePath(filePath);
    let fileCache = this.cache.get(normalizedPath);
    if (!fileCache) {
      fileCache = new LRUCache<number, LineCacheEntry>(DEFINITION_LINE_CACHE_MAX_SIZE);
      this.cache.set(normalizedPath, fileCache);
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

    // Check if we're inside a doc string block - if so, ignore
    // Uses document.lineAt() instead of splitting entire document
    if (isLineInsideDocStringDocument(document, position.line)) {
      return { locationLinks: null, originRange: null };
    }

    // Resolve effective keyword using document.lineAt() for efficiency
    const effectiveKeyword = resolveEffectiveKeyword(document, position.line);

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

    // Get step definitions filtered by keyword (uses indexed lookup)
    const scanner = getStepScanner();
    let definitions = scanner.getDefinitionsByKeyword(stepInfo.effectiveKeyword);

    if (definitions.length === 0) {
      // Scanner might not be initialized yet, try to initialize
      await scanner.initialize();
      definitions = scanner.getDefinitionsByKeyword(stepInfo.effectiveKeyword);
      if (definitions.length === 0) {
        return { locationLinks: null, originRange };
      }
    }

    // Find matching definitions (already filtered by keyword)
    const matchingDefs = findMatchingDefinitions(stepInfo.text, definitions);

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
    const escapedKeyword = escapeRegex(keyword);

    // Find the keyword position (match includes all whitespace after keyword)
    const keywordMatch = lineText.match(
      new RegExp(`^\\s*${escapedKeyword}\\s+`, "i")
    );

    if (!keywordMatch) {
      return null;
    }

    // Start after the full match (keyword + all trailing whitespace)
    const startChar = keywordMatch[0].length;

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
   * Clear the entire cache. Call this on extension deactivation.
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear the cache for a specific file. Call this when a document closes.
   * Normalizes the file path for cross-platform consistency.
   *
   * @param filePath The file path to clear from cache
   */
  public clearCacheForFile(filePath: string): void {
    this.cache.delete(normalizePath(filePath));
  }
}
