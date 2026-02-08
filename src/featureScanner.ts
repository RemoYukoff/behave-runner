import * as vscode from "vscode";
import * as fs from "fs";
import { FeatureStep, StepKeyword } from "./types";
import { behavePatternToRegex, parseStepLine } from "./stepMatcher";

/**
 * Scans .feature files in the workspace for steps.
 * Provides caching and file watching for performance.
 */
export class FeatureScanner {
  private steps: Map<string, FeatureStep[]> = new Map();
  private regexCache: Map<string, RegExp> = new Map();
  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private initialized = false;

  /**
   * Initialize the scanner and start watching for file changes.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.scanAllFiles();
    this.setupFileWatcher();
    this.initialized = true;
  }

  /**
   * Dispose of resources.
   */
  public dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }
    this.steps.clear();
    this.regexCache.clear();
    this.initialized = false;
  }

  /**
   * Get all feature steps from the cache.
   */
  public getAllSteps(): FeatureStep[] {
    const allSteps: FeatureStep[] = [];
    for (const steps of this.steps.values()) {
      allSteps.push(...steps);
    }
    return allSteps;
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
      regex = behavePatternToRegex(pattern);
      this.regexCache.set(pattern, regex);
    }

    const allSteps = this.getAllSteps();

    return allSteps.filter((step) => {
      // If keyword is specified and not "step", filter by effective keyword
      if (keyword && keyword !== "step") {
        if (step.effectiveKeyword !== keyword) {
          return false;
        }
      }

      return regex.test(step.text.trim());
    });
  }

  /**
   * Force a rescan of all files.
   */
  public async rescan(): Promise<void> {
    this.steps.clear();
    await this.scanAllFiles();
  }

  /**
   * Scan all .feature files in the workspace.
   */
  private async scanAllFiles(): Promise<void> {
    const files = await vscode.workspace.findFiles(
      "**/*.feature",
      "**/node_modules/**"
    );

    for (const file of files) {
      await this.scanFile(file.fsPath);
    }
  }

  /**
   * Scan a single .feature file for steps.
   */
  private async scanFile(filePath: string): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const steps = this.parseFileContent(filePath, content);
      this.steps.set(filePath, steps);
    } catch (error) {
      // File might have been deleted or is inaccessible
      this.steps.delete(filePath);
    }
  }

  /**
   * Parse the content of a .feature file to extract steps.
   */
  private parseFileContent(filePath: string, content: string): FeatureStep[] {
    const steps: FeatureStep[] = [];
    const lines = content.split("\n");
    let previousKeyword: StepKeyword | null = null;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Check for Scenario/Feature which reset the keyword context
      if (line.match(/^\s*(Feature|Scenario|Scenario Outline|Background|Examples):/i)) {
        previousKeyword = null;
        continue;
      }

      const stepInfo = parseStepLine(line, previousKeyword);
      if (stepInfo) {
        // Calculate character position where the step text starts
        const keywordMatch = line.match(/^\s*(Given|When|Then|And|But)\s+/i);
        const character = keywordMatch ? keywordMatch[0].length : 0;

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

  /**
   * Set up file system watcher to keep cache in sync.
   */
  private setupFileWatcher(): void {
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      "**/*.feature",
      false,
      false,
      false
    );

    this.fileWatcher.onDidCreate(async (uri) => {
      await this.scanFile(uri.fsPath);
    });

    this.fileWatcher.onDidChange(async (uri) => {
      await this.scanFile(uri.fsPath);
    });

    this.fileWatcher.onDidDelete((uri) => {
      this.steps.delete(uri.fsPath);
    });
  }
}

// Singleton instance
let scannerInstance: FeatureScanner | null = null;

/**
 * Get the singleton FeatureScanner instance.
 */
export function getFeatureScanner(): FeatureScanner {
  if (!scannerInstance) {
    scannerInstance = new FeatureScanner();
  }
  return scannerInstance;
}

/**
 * Dispose the singleton FeatureScanner instance.
 */
export function disposeFeatureScanner(): void {
  if (scannerInstance) {
    scannerInstance.dispose();
    scannerInstance = null;
  }
}
