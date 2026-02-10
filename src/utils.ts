/**
 * Utility functions shared across the extension.
 */

import { LineAccessor } from "./types";
import { REGEX_SPECIAL_CHARS, STEP_KEYWORD_REGEX } from "./constants";

/**
 * Simple LRU (Least Recently Used) cache implementation.
 * Uses Map's insertion order to track recency.
 *
 * @template K The key type
 * @template V The value type
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /**
   * Get a value from the cache.
   * Moves the key to most-recently-used position if found.
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  /**
   * Set a value in the cache.
   * Evicts least-recently-used entries if over capacity.
   */
  set(key: K, value: V): void {
    // Delete first to update insertion order if key exists
    this.cache.delete(key);
    this.cache.set(key, value);

    // Evict oldest entries if over capacity
    while (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  /**
   * Check if a key exists in the cache.
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of entries in the cache.
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Escapes special regex characters in a string.
 *
 * @param str The string to escape
 * @param exceptChars Optional characters to NOT escape (e.g., "{}" for Behave patterns)
 * @returns The escaped string safe for use in RegExp
 */
export function escapeRegex(str: string, exceptChars?: string): string {
  return str.replace(REGEX_SPECIAL_CHARS, (char) => {
    if (exceptChars?.includes(char)) {
      return char;
    }
    return "\\" + char;
  });
}

/**
 * Creates a debounced version of a function.
 * The function will only be called after the specified delay has passed
 * since the last invocation.
 *
 * @param fn The function to debounce
 * @param delayMs The delay in milliseconds
 * @returns A debounced version of the function
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
}

/**
 * Helper class for tracking doc string state during line-by-line iteration.
 * Use this when you need to iterate through lines and skip doc string content.
 *
 * Supports both Python docstrings (""") and Gherkin doc strings (```).
 */
export class DocStringTracker {
  private insideDocString = false;
  private docStringDelimiter: string | null = null;

  /**
   * Process a line and update the doc string state.
   *
   * @param lineText The line text to process (will be trimmed internally)
   * @returns true if currently inside a doc string (line should be skipped)
   */
  public processLine(lineText: string): boolean {
    const trimmedLine = lineText.trim();

    if (!this.insideDocString) {
      // Check if this line starts a doc string
      if (trimmedLine.startsWith('"""') || trimmedLine.startsWith("```")) {
        this.docStringDelimiter = trimmedLine.substring(0, 3);
        // Check if it also ends on the same line
        if (trimmedLine.length > 3 && trimmedLine.endsWith(this.docStringDelimiter)) {
          // Single line doc string, skip just this line
          return true;
        }
        this.insideDocString = true;
        return true;
      }
      return false;
    } else {
      // Inside doc string - check if this line ends it
      if (this.docStringDelimiter && trimmedLine.endsWith(this.docStringDelimiter)) {
        this.insideDocString = false;
        this.docStringDelimiter = null;
      }
      // Skip all lines inside doc strings
      return true;
    }
  }

  /**
   * Check if the tracker is currently inside a doc string.
   */
  public isInside(): boolean {
    return this.insideDocString;
  }

  /**
   * Reset the tracker state for reuse.
   */
  public reset(): void {
    this.insideDocString = false;
    this.docStringDelimiter = null;
  }

  /**
   * Check if a specific line is inside a doc string block.
   * Unified implementation that works with any line source.
   *
   * @param getLine Function that returns line text for a given index
   * @param lineCount Total number of lines available
   * @param targetLine The line number to check (0-based)
   * @returns true if the target line is inside a doc string block
   */
  public static isLineInside(
    getLine: (index: number) => string,
    lineCount: number,
    targetLine: number
  ): boolean {
    const tracker = new DocStringTracker();
    const limit = Math.min(targetLine, lineCount);
    for (let i = 0; i < limit; i++) {
      tracker.processLine(getLine(i));
    }
    return tracker.isInside();
  }

}

/**
 * Check if a VS Code document is a Gherkin feature file.
 * Checks both the language ID and file extension for compatibility.
 *
 * @param document The VS Code text document to check
 * @returns true if the document is a .feature file
 */
export function isFeatureDocument(document: { languageId: string; fileName: string }): boolean {
  return document.languageId === "behave" || document.fileName.endsWith(".feature");
}

/**
 * Check if a specific line is inside a doc string block using document line access.
 * More efficient than splitting the entire document text.
 *
 * @param document A document-like object with lineAt() method
 * @param targetLine The line number to check (0-based)
 * @returns true if the target line is inside a doc string block
 */
export function isLineInsideDocStringDocument(
  document: LineAccessor,
  targetLine: number
): boolean {
  return DocStringTracker.isLineInside(
    (i) => document.lineAt(i).text,
    document.lineCount,
    targetLine
  );
}

/**
 * Calculate the character position where step text starts in a line.
 * This is the position after the keyword and space.
 *
 * @param lineText The full line text
 * @returns The character position where step text starts, or 0 if not a step line
 */
export function getStepTextStartPosition(lineText: string): number {
  const stepMatch = lineText.match(STEP_KEYWORD_REGEX);
  if (!stepMatch) {
    return 0;
  }
  // Groups: 0=full match, 1=keyword, 2=step text
  // startChar = full match length - step text length
  return stepMatch[0].length - stepMatch[2].length;
}

/**
 * Build a keyword index from an array of items.
 * Groups items by a key extracted using the provided function.
 *
 * @param items The items to index
 * @param getKey Function to extract the key from each item (null/undefined keys are skipped)
 * @returns Map of keys to arrays of items
 */
export function buildKeywordIndex<T, K>(
  items: T[],
  getKey: (item: T) => K | null | undefined
): Map<K, T[]> {
  const index = new Map<K, T[]>();
  for (const item of items) {
    const key = getKey(item);
    if (key !== null && key !== undefined) {
      const existing = index.get(key);
      if (existing) {
        existing.push(item);
      } else {
        index.set(key, [item]);
      }
    }
  }
  return index;
}

/**
 * Compare two arrays for equality using a custom comparison function.
 * Handles undefined oldItems as equivalent to an empty array.
 *
 * @param oldItems The old array (may be undefined)
 * @param newItems The new array
 * @param isEqual Function to compare two items for equality
 * @returns true if arrays are equal, false otherwise
 */
export function arraysEqual<T>(
  oldItems: T[] | undefined,
  newItems: T[],
  isEqual: (a: T, b: T) => boolean
): boolean {
  if (!oldItems) {
    return newItems.length === 0;
  }
  if (oldItems.length !== newItems.length) {
    return false;
  }
  return oldItems.every((old, i) => isEqual(old, newItems[i]));
}
