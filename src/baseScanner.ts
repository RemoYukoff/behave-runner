/**
 * Abstract base class for file scanners.
 * Provides common functionality for scanning, caching, and file watching.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import { minimatch } from "minimatch";
import { IScanner } from "./types";
import { logger } from "./logger";
import { SCAN_BATCH_SIZE, MAX_RESCAN_RETRIES } from "./constants";
import { arraysEqual, normalizePath } from "./utils";

/**
 * Abstract base class for file scanners.
 * Handles common functionality like file watching, caching, and configuration.
 *
 * @template TItem The type of items stored per file (e.g., StepDefinition, FeatureStep)
 */
export abstract class BaseScanner<TItem> implements IScanner {
  /** Map of file path to parsed items */
  protected items: Map<string, TItem[]> = new Map();

  /** Flattened cache of all items (invalidated on changes) */
  protected flatCache: TItem[] | null = null;

  /** File system watcher */
  protected fileWatcher: vscode.FileSystemWatcher | null = null;

  /** Set of files currently being scanned (prevents concurrent scans) */
  protected scanning: Set<string> = new Set();

  /** Set of files that need to be re-scanned after current scan completes */
  protected pendingRescan: Set<string> = new Set();

  /** Cached configuration patterns */
  protected cachedPatterns: string[] | null = null;

  /** Configuration change listener */
  protected configListener: vscode.Disposable | null = null;

  /** Whether the scanner has been initialized */
  protected initialized = false;

  /** Whether a full rescan is in progress (prevents concurrent rescans) */
  protected isRescanning = false;

  /** Whether a rescan was requested while one is in progress */
  protected rescanPending = false;

  /**
   * Initialize the scanner and start watching for file changes.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.setupConfigListener();
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
    if (this.configListener) {
      this.configListener.dispose();
      this.configListener = null;
    }
    this.items.clear();
    this.flatCache = null;
    this.cachedPatterns = null;
    this.initialized = false;
  }

  /**
   * Force a rescan of all files.
   * Protected against concurrent rescans - if called while a rescan is in progress,
   * it will schedule another rescan to run after the current one completes.
   * 
   * Uses a do-while loop instead of recursion to avoid stack overflow and
   * race conditions between setting isRescanning=false and checking rescanPending.
   */
  public async rescan(): Promise<void> {
    // If already rescanning, mark that another rescan is needed
    if (this.isRescanning) {
      this.rescanPending = true;
      return;
    }

    // Process rescans in a loop to handle pending requests without recursion
    do {
      this.isRescanning = true;
      this.rescanPending = false; // Reset BEFORE scanning to catch new requests
      try {
        this.items.clear();
        this.flatCache = null;
        this.pendingRescan.clear();
        this.invalidateAdditionalCaches();
        await this.scanAllFiles();
      } finally {
        this.isRescanning = false;
      }
    } while (this.rescanPending);
  }

  /**
   * Get all items from the cache.
   * Results are cached and invalidated when items change.
   */
  public getAllItems(): TItem[] {
    return (this.flatCache ??= Array.from(this.items.values()).flat());
  }

  /**
   * Get the file glob pattern for the file watcher.
   * @returns Glob pattern string (e.g., "**\/*.py" or "**\/*.feature")
   */
  protected abstract getWatcherPattern(): string;

  /**
   * Get the configuration key for patterns.
   * @returns Configuration key (e.g., "stepDefinitions.patterns")
   */
  protected abstract getConfigKey(): string;

  /**
   * Get the default patterns if not configured.
   * @returns Array of default glob patterns
   */
  protected abstract getDefaultPatterns(): readonly string[];

  /**
   * Parse the content of a file to extract items.
   * @param filePath Absolute path to the file
   * @param content File content as string
   * @returns Array of parsed items
   */
  protected abstract parseFileContent(filePath: string, content: string): TItem[];

  /**
   * Get a descriptive name for logging (e.g., "step file", "feature file").
   */
  protected abstract getFileTypeName(): string;

  /**
   * Hook for subclasses to invalidate additional caches during rescan.
   * Called by rescan() before scanning files.
   */
  protected invalidateAdditionalCaches(): void {
    // Override in subclasses if needed
  }

  /**
   * Hook for subclasses to perform actions after items change.
   * Called after successful file scan or deletion.
   */
  protected onItemsChanged(): void {
    // Override in subclasses if needed
  }

  /**
   * Get patterns from configuration with caching.
   */
  protected getPatterns(): string[] {
    if (this.cachedPatterns === null) {
      const config = vscode.workspace.getConfiguration("behaveRunner");
      this.cachedPatterns = config.get<string[]>(
        this.getConfigKey(),
        [...this.getDefaultPatterns()]
      );
    }
    return this.cachedPatterns;
  }

  /**
   * Set up listener for configuration changes.
   */
  protected setupConfigListener(): void {
    this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`behaveRunner.${this.getConfigKey()}`)) {
        this.cachedPatterns = null;
        // Fire-and-forget: rescan runs in background, errors are logged internally
        void this.rescan();
      }
    });
  }

  /**
   * Scan all files in the workspace matching the configured patterns.
   * Files are scanned in parallel batches for better performance.
   */
  protected async scanAllFiles(): Promise<void> {
    const patterns = this.getPatterns();

    // Gather all files from all patterns in parallel
    const fileArrays = await Promise.all(
      patterns.map((pattern) =>
        vscode.workspace.findFiles(pattern, "**/node_modules/**")
      )
    );

    // Flatten and deduplicate by file path
    const seenPaths = new Set<string>();
    const allFiles: vscode.Uri[] = [];
    for (const files of fileArrays) {
      for (const file of files) {
        if (!seenPaths.has(file.fsPath)) {
          seenPaths.add(file.fsPath);
          allFiles.push(file);
        }
      }
    }

    // Scan files in parallel batches for better performance
    for (let i = 0; i < allFiles.length; i += SCAN_BATCH_SIZE) {
      const batch = allFiles.slice(i, i + SCAN_BATCH_SIZE);
      await Promise.all(batch.map((file) => this.scanFile(file.fsPath)));
    }
  }

  /**
   * Scan a single file for items.
   * Protected against concurrent scans of the same file.
   * If the file changes during a scan, it will be re-scanned after completion.
   *
   * @param filePath The file path to scan
   * @param retryCount Current retry count (internal use for recursion limit)
   */
  protected async scanFile(filePath: string, retryCount = 0): Promise<void> {
    // If already scanning this file, mark it for re-scan when done
    if (this.scanning.has(filePath)) {
      this.pendingRescan.add(filePath);
      return;
    }
    this.scanning.add(filePath);

    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const parsedItems = this.parseFileContent(filePath, content);

      // Only invalidate cache if items actually changed
      const oldItems = this.items.get(filePath);
      if (!this.areItemsEqual(oldItems, parsedItems)) {
        this.items.set(filePath, parsedItems);
        this.flatCache = null;
        this.onItemsChanged();
      }
    } catch (error) {
      // Use warn level to make scan failures visible for debugging
      // Common causes: file deleted during scan, permission issues, encoding errors
      logger.warn(`Failed to scan ${this.getFileTypeName()}: ${filePath}`, error);
      if (this.items.delete(filePath)) {
        this.flatCache = null;
        this.onItemsChanged();
      }
    } finally {
      this.scanning.delete(filePath);

      // If this file was modified during scanning, re-scan it now (with retry limit)
      if (this.pendingRescan.has(filePath)) {
        this.pendingRescan.delete(filePath);
        if (retryCount < MAX_RESCAN_RETRIES) {
          await this.scanFile(filePath, retryCount + 1);
        } else {
          logger.warn(
            `Max rescan retries (${MAX_RESCAN_RETRIES}) reached for ${this.getFileTypeName()}: ${filePath}`
          );
        }
      }
    }
  }

  /**
   * Compare two item arrays for equality.
   * Uses JSON serialization for deep comparison.
   *
   * WARNING: Subclasses should override this method if items contain
   * non-serializable values (like RegExp, functions, circular references).
   */
  protected areItemsEqual(oldItems: TItem[] | undefined, newItems: TItem[]): boolean {
    return arraysEqual(oldItems, newItems, (a, b) => {
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch {
        // If serialization fails, assume items are different to trigger update
        return false;
      }
    });
  }

  /**
   * Set up file system watcher to keep cache in sync.
   */
  protected setupFileWatcher(): void {
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      this.getWatcherPattern(),
      false,
      false,
      false
    );

    // Shared handler for create and change events
    const handleFileChange = async (uri: vscode.Uri): Promise<void> => {
      if (this.matchesPatterns(uri.fsPath)) {
        await this.scanFile(uri.fsPath);
      }
    };

    this.fileWatcher.onDidCreate(handleFileChange);
    this.fileWatcher.onDidChange(handleFileChange);

    this.fileWatcher.onDidDelete((uri) => {
      if (this.items.delete(uri.fsPath)) {
        this.flatCache = null;
        this.onItemsChanged();
      }
    });
  }

  /**
   * Check if a file path matches the configured patterns.
   * Uses minimatch for proper glob pattern matching.
   *
   * Note: This always checks against current patterns, even for cached files.
   * This ensures pattern changes are respected on file updates.
   */
  protected matchesPatterns(filePath: string): boolean {
    const normalizedPath = normalizePath(filePath);
    const patterns = this.getPatterns();

    return patterns.some((pattern) =>
      minimatch(normalizedPath, pattern, { nocase: true, matchBase: true })
    );
  }
}
