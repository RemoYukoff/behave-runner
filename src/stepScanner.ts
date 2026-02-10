import * as vscode from "vscode";
import { StepDefinition, StepKeyword, IStepScanner, ScannerChangeHandler } from "./types";
import { BaseScanner } from "./baseScanner";
import { behavePatternToRegex } from "./stepMatcher";
import {
  DECORATOR_REGEXES_WITH_INDENT,
  DEFAULT_STEP_DEFINITION_PATTERNS,
} from "./constants";
import { logger } from "./logger";
import { buildKeywordIndex, arraysEqual } from "./utils";

/**
 * Scans Python files in the workspace for Behave step definitions.
 * Provides caching and file watching for performance.
 */
export class StepScanner extends BaseScanner<StepDefinition> implements IStepScanner {
  /** Version number that increments on any change (for cache invalidation) */
  private version = 0;

  /** Cached index of definitions by keyword for faster lookups */
  private keywordIndex: Map<StepKeyword, StepDefinition[]> | null = null;

  /** Event emitter for notifying subscribers when definitions change */
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  /**
   * Event fired when step definitions change.
   * Subscribe to this instead of creating separate file watchers.
   */
  public readonly onDidChange = (handler: ScannerChangeHandler): { dispose(): void } => {
    return this.changeEmitter.event(handler);
  };

  /**
   * Get all step definitions from the cache.
   * Results are cached and invalidated when definitions change.
   */
  public getAllDefinitions(): StepDefinition[] {
    return this.getAllItems();
  }

  /**
   * Get step definitions filtered by keyword.
   * Uses pre-built index for O(1) lookup instead of O(n) filtering.
   *
   * @param keyword The keyword to filter by, or null for all definitions
   * @returns Definitions matching the keyword (including "step" which matches all)
   */
  public getDefinitionsByKeyword(keyword: StepKeyword | null): StepDefinition[] {
    if (!keyword) {
      return this.getAllDefinitions();
    }

    this.ensureKeywordIndex();

    // Get definitions for the specific keyword
    const specificDefs = this.keywordIndex!.get(keyword) ?? [];
    // Get "step" definitions which match any keyword
    const stepDefs = this.keywordIndex!.get("step") ?? [];

    // Combine and return (step definitions are included for all keywords)
    if (stepDefs.length === 0) {
      return specificDefs;
    }
    if (specificDefs.length === 0) {
      return stepDefs;
    }
    return [...specificDefs, ...stepDefs];
  }

  /**
   * Get step definitions from a specific file.
   */
  public getDefinitionsForFile(filePath: string): StepDefinition[] {
    return this.items.get(filePath) ?? [];
  }

  /**
   * Get the current cache version.
   * Increments whenever definitions change, useful for cache invalidation.
   */
  public getVersion(): number {
    return this.version;
  }

  /**
   * Force a rescan of all files.
   * Note: version is incremented via onItemsChanged() during super.rescan(),
   * so we don't need to increment it again here.
   */
  public override async rescan(): Promise<void> {
    await super.rescan();
    // version is already incremented by onItemsChanged() calls during scan
  }

  /**
   * Ensure the keyword index is built.
   */
  private ensureKeywordIndex(): void {
    this.keywordIndex ??= buildKeywordIndex(
      this.getAllDefinitions(),
      (def) => def.keyword
    );
  }

  // ==================== BaseScanner Implementation ====================

  protected getWatcherPattern(): string {
    return "**/*.py";
  }

  protected getConfigKey(): string {
    return "stepDefinitions.patterns";
  }

  protected getDefaultPatterns(): readonly string[] {
    return DEFAULT_STEP_DEFINITION_PATTERNS;
  }

  protected getFileTypeName(): string {
    return "step file";
  }

  protected override onItemsChanged(): void {
    this.version++;
    this.keywordIndex = null; // Invalidate keyword index
    this.changeEmitter.fire(); // Notify subscribers
  }

  /**
   * Dispose of resources including the change emitter.
   */
  public override dispose(): void {
    super.dispose();
    this.changeEmitter.dispose();
  }

  protected override invalidateAdditionalCaches(): void {
    this.keywordIndex = null;
  }

  /**
   * Compare step definitions for equality without using JSON.stringify.
   * Skips regex comparison since it's derived from pattern.
   */
  protected override areItemsEqual(
    oldItems: StepDefinition[] | undefined,
    newItems: StepDefinition[]
  ): boolean {
    return arraysEqual(oldItems, newItems, (a, b) =>
      a.keyword === b.keyword &&
      a.pattern === b.pattern &&
      a.line === b.line &&
      a.character === b.character
    );
  }

  /**
   * Parse the content of a Python file to extract step definitions.
   */
  protected parseFileContent(filePath: string, content: string): StepDefinition[] {
    const definitions: StepDefinition[] = [];
    const lines = content.split("\n");

    // Process each line looking for decorators
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Try all decorator patterns
      let match: { keyword: string; pattern: string; character: number } | null = null;
      for (const regex of DECORATOR_REGEXES_WITH_INDENT) {
        match = this.matchDecorator(line, regex);
        if (match) {
          break;
        }
      }

      if (match) {
        const { keyword, pattern, character } = match;
        try {
          const regex = behavePatternToRegex(pattern);
          definitions.push({
            keyword: keyword.toLowerCase() as StepKeyword,
            pattern,
            regex,
            filePath,
            line: lineIndex,
            character,
          });
        } catch (error) {
          // Invalid pattern, skip this definition
          logger.warn(`Invalid step pattern in ${filePath}:${lineIndex + 1}: ${pattern}`, error);
        }
      }
    }

    return definitions;
  }

  /**
   * Match a decorator pattern in a line.
   * Groups: 1=indent, 2=keyword, 3=pattern
   */
  private matchDecorator(
    line: string,
    regex: RegExp
  ): { keyword: string; pattern: string; character: number } | null {
    const match = line.match(regex);
    if (!match) {
      return null;
    }

    const indent = match[1];
    const keyword = match[2];
    const pattern = match[3];

    return {
      keyword,
      pattern,
      character: indent.length,
    };
  }
}
