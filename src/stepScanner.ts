import * as vscode from "vscode";
import * as fs from "fs";
import { StepDefinition, StepKeyword } from "./types";
import { behavePatternToRegex } from "./stepMatcher";
import { DECORATOR_REGEXES_WITH_INDENT } from "./constants";

/**
 * Scans Python files in the workspace for Behave step definitions.
 * Provides caching and file watching for performance.
 */
export class StepScanner {
  private definitions: Map<string, StepDefinition[]> = new Map();
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
    this.definitions.clear();
    this.initialized = false;
  }

  /**
   * Get all step definitions from the cache.
   */
  public getAllDefinitions(): StepDefinition[] {
    const allDefs: StepDefinition[] = [];
    for (const defs of this.definitions.values()) {
      allDefs.push(...defs);
    }
    return allDefs;
  }

  /**
   * Get step definitions from a specific file.
   */
  public getDefinitionsForFile(filePath: string): StepDefinition[] {
    return this.definitions.get(filePath) || [];
  }

  /**
   * Force a rescan of all files.
   */
  public async rescan(): Promise<void> {
    this.definitions.clear();
    await this.scanAllFiles();
  }

  /**
   * Get step definition patterns from configuration.
   */
  private getPatterns(): string[] {
    const config = vscode.workspace.getConfiguration("behaveRunner");
    return config.get<string[]>("stepDefinitions.patterns", [
      "**/steps/**/*.py",
      "**/*_steps.py",
      "**/step_*.py",
      "**/steps.py",
    ]);
  }

  /**
   * Scan all Python files in the workspace that might contain step definitions.
   */
  private async scanAllFiles(): Promise<void> {
    const patterns = this.getPatterns();

    for (const pattern of patterns) {
      const files = await vscode.workspace.findFiles(
        pattern,
        "**/node_modules/**"
      );

      for (const file of files) {
        await this.scanFile(file.fsPath);
      }
    }
  }

  /**
   * Scan a single Python file for step definitions.
   */
  private async scanFile(filePath: string): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const definitions = this.parseFileContent(filePath, content);
      this.definitions.set(filePath, definitions);
    } catch (error) {
      // File might have been deleted or is inaccessible
      this.definitions.delete(filePath);
    }
  }

  /**
   * Parse the content of a Python file to extract step definitions.
   */
  private parseFileContent(filePath: string, content: string): StepDefinition[] {
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
        } catch {
          // Invalid pattern, skip this definition
          console.warn(
            `Invalid step pattern in ${filePath}:${lineIndex + 1}: ${pattern}`
          );
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

  /**
   * Set up file system watcher to keep cache in sync.
   */
  private setupFileWatcher(): void {
    // Watch for Python files in steps directories
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      "**/*.py",
      false,
      false,
      false
    );

    this.fileWatcher.onDidCreate(async (uri) => {
      if (this.isStepFile(uri.fsPath)) {
        await this.scanFile(uri.fsPath);
      }
    });

    this.fileWatcher.onDidChange(async (uri) => {
      if (this.isStepFile(uri.fsPath)) {
        await this.scanFile(uri.fsPath);
      }
    });

    this.fileWatcher.onDidDelete((uri) => {
      this.definitions.delete(uri.fsPath);
    });
  }

  /**
   * Check if a file path matches the configured step definition patterns.
   */
  private isStepFile(filePath: string): boolean {
    // If file was already scanned, it's a step file
    if (this.definitions.has(filePath)) {
      return true;
    }

    // Check against configured patterns using simple string matching
    const patterns = this.getPatterns();
    const lowerPath = filePath.toLowerCase().replace(/\\/g, "/");

    for (const pattern of patterns) {
      // Convert glob pattern to simple checks
      const lowerPattern = pattern.toLowerCase();

      if (lowerPattern.includes("**/steps/**")) {
        if (lowerPath.includes("/steps/")) {
          return true;
        }
      } else if (lowerPattern.endsWith("_steps.py")) {
        if (lowerPath.endsWith("_steps.py")) {
          return true;
        }
      } else if (lowerPattern.includes("step_")) {
        if (lowerPath.includes("step_") && lowerPath.endsWith(".py")) {
          return true;
        }
      } else if (lowerPattern.endsWith("steps.py")) {
        if (lowerPath.endsWith("steps.py")) {
          return true;
        }
      } else if (lowerPattern.endsWith(".py")) {
        // Generic pattern - check if it's a Python file
        if (lowerPath.endsWith(".py")) {
          return true;
        }
      }
    }

    return false;
  }
}

// Singleton instance
let scannerInstance: StepScanner | null = null;

/**
 * Get the singleton StepScanner instance.
 */
export function getStepScanner(): StepScanner {
  if (!scannerInstance) {
    scannerInstance = new StepScanner();
  }
  return scannerInstance;
}

/**
 * Dispose the singleton StepScanner instance.
 */
export function disposeStepScanner(): void {
  if (scannerInstance) {
    scannerInstance.dispose();
    scannerInstance = null;
  }
}
