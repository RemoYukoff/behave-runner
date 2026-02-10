import { FeatureStep, StepKeyword, IFeatureScanner } from "./types";
import { BaseScanner } from "./baseScanner";
import { behavePatternToRegex, parseStepLine } from "./stepMatcher";
import {
  STRUCTURAL_KEYWORD_REGEX,
  DEFAULT_FEATURE_FILE_PATTERNS,
  REGEX_CACHE_MAX_SIZE,
} from "./constants";
import { LRUCache, getStepTextStartPosition, buildKeywordIndex, arraysEqual } from "./utils";
import { logger } from "./logger";

/**
 * Scans .feature files in the workspace for steps.
 * Provides caching and file watching for performance.
 */
export class FeatureScanner extends BaseScanner<FeatureStep> implements IFeatureScanner {
  /** LRU cache of compiled regex patterns for step matching */
  private regexCache = new LRUCache<string, RegExp>(REGEX_CACHE_MAX_SIZE);

  /** Index of steps by effective keyword for O(1) lookup */
  private keywordIndex: Map<StepKeyword, FeatureStep[]> | null = null;

  /**
   * Dispose of resources.
   */
  public override dispose(): void {
    super.dispose();
    this.regexCache.clear();
    this.keywordIndex = null;
  }

  /**
   * Get all feature steps from the cache.
   * Results are cached and invalidated when steps change.
   */
  public getAllSteps(): FeatureStep[] {
    return this.getAllItems();
  }

  /**
   * Find all feature steps that match a given pattern.
   *
   * @param pattern The Behave pattern string (e.g., 'the message is "{message}"')
   * @param keyword Optional keyword to filter by (given, when, then, step)
   * @returns Array of matching FeatureStep objects
   */
  public findMatchingSteps(pattern: string, keyword?: StepKeyword): FeatureStep[] {
    // Use cached regex or compile and cache it
    let regex = this.regexCache.get(pattern);
    if (!regex) {
      try {
        regex = behavePatternToRegex(pattern);
        this.regexCache.set(pattern, regex);
      } catch (error) {
        // Invalid pattern - log and return empty array
        logger.warn(`Invalid step pattern for matching: ${pattern}`, error);
        return [];
      }
    }

    // Get steps filtered by keyword using the index
    const steps = this.getStepsByKeyword(keyword ?? null);

    return steps.filter((step) => regex.test(step.text.trim()));
  }

  /**
   * Get feature steps filtered by effective keyword.
   * Uses pre-built index for O(1) lookup instead of O(n) filtering.
   *
   * @param keyword The keyword to filter by, or null for all steps
   * @returns Steps matching the keyword
   */
  private getStepsByKeyword(keyword: StepKeyword | null): FeatureStep[] {
    // "step" keyword matches all steps
    if (!keyword || keyword === "step") {
      return this.getAllSteps();
    }

    this.ensureKeywordIndex();

    // Get steps for the specific keyword
    return this.keywordIndex!.get(keyword) ?? [];
  }

  /**
   * Ensure the keyword index is built.
   */
  private ensureKeywordIndex(): void {
    this.keywordIndex ??= buildKeywordIndex(
      this.getAllSteps(),
      (step) => step.effectiveKeyword
    );
  }

  // ==================== BaseScanner Implementation ====================

  protected getWatcherPattern(): string {
    return "**/*.feature";
  }

  protected getConfigKey(): string {
    return "featureFiles.patterns";
  }

  protected getDefaultPatterns(): readonly string[] {
    return DEFAULT_FEATURE_FILE_PATTERNS;
  }

  protected getFileTypeName(): string {
    return "feature file";
  }

  protected override invalidateAdditionalCaches(): void {
    this.regexCache.clear();
    this.keywordIndex = null;
  }

  protected override onItemsChanged(): void {
    this.keywordIndex = null; // Invalidate keyword index when steps change
  }

  /**
   * Compare feature steps for equality without using JSON.stringify.
   */
  protected override areItemsEqual(
    oldItems: FeatureStep[] | undefined,
    newItems: FeatureStep[]
  ): boolean {
    return arraysEqual(oldItems, newItems, (a, b) =>
      a.text === b.text &&
      a.keyword === b.keyword &&
      a.effectiveKeyword === b.effectiveKeyword &&
      a.line === b.line &&
      a.character === b.character
    );
  }

  /**
   * Parse the content of a .feature file to extract steps.
   */
  protected parseFileContent(filePath: string, content: string): FeatureStep[] {
    const steps: FeatureStep[] = [];
    const lines = content.split("\n");
    let previousKeyword: StepKeyword | null = null;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Check for Scenario/Feature which reset the keyword context
      if (STRUCTURAL_KEYWORD_REGEX.test(line)) {
        previousKeyword = null;
        continue;
      }

      const stepInfo = parseStepLine(line, previousKeyword);
      if (stepInfo) {
        // Calculate character position where the step text starts
        const character = getStepTextStartPosition(line);

        steps.push({
          text: stepInfo.text,
          keyword: stepInfo.keyword,
          effectiveKeyword: stepInfo.effectiveKeyword,
          filePath,
          line: lineIndex,
          character,
        });

        // Update previous keyword for And/But resolution
        if (stepInfo.effectiveKeyword) {
          previousKeyword = stepInfo.effectiveKeyword;
        }
      }
    }

    return steps;
  }
}
