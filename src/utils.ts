/**
 * Utility functions shared across the extension.
 */

/**
 * Check if a specific line is inside a doc string block (""" or ```).
 * Scans from the beginning of the document up to (but not including) the target line.
 *
 * @param lines Array of document lines
 * @param targetLine The line number to check (0-based)
 * @returns true if the target line is inside a doc string block
 */
export function isInsideDocString(lines: string[], targetLine: number): boolean {
  let insideDocString = false;
  let docStringDelimiter: string | null = null;

  for (let i = 0; i < targetLine; i++) {
    const line = lines[i].trim();

    if (!insideDocString) {
      // Check if this line starts a doc string
      if (line.startsWith('"""') || line.startsWith("```")) {
        docStringDelimiter = line.substring(0, 3);
        // Check if it also ends on the same line
        if (line.length > 3 && line.endsWith(docStringDelimiter)) {
          // Single line doc string, still outside
          continue;
        }
        insideDocString = true;
      }
    } else {
      // Check if this line ends the doc string
      if (docStringDelimiter && line.endsWith(docStringDelimiter)) {
        insideDocString = false;
        docStringDelimiter = null;
      }
    }
  }

  return insideDocString;
}

/**
 * Helper class for tracking doc string state during line-by-line iteration.
 * Use this when you need to iterate through lines and skip doc string content.
 */
export class DocStringTracker {
  private insideDocString = false;
  private docStringDelimiter: string | null = null;

  /**
   * Process a line and update the doc string state.
   *
   * @param lineText The trimmed line text to process
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
   * Reset the tracker state for reuse.
   */
  public reset(): void {
    this.insideDocString = false;
    this.docStringDelimiter = null;
  }
}
