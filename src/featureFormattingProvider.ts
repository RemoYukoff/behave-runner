import * as vscode from "vscode";
import {
  FORMAT_FEATURE_REGEX,
  FORMAT_RULE_REGEX,
  FORMAT_BACKGROUND_REGEX,
  FORMAT_SCENARIO_REGEX,
  FORMAT_EXAMPLES_REGEX,
  FORMAT_STEP_REGEX,
  FORMAT_TAG_REGEX,
  FORMAT_TABLE_REGEX,
  FORMAT_DOC_STRING_REGEX,
  FORMAT_COMMENT_REGEX,
  FORMAT_EMPTY_REGEX,
} from "./constants";

/**
 * Formatting provider for Gherkin .feature files.
 * Handles proper indentation and alignment of Gherkin syntax elements.
 */
export class FeatureFormattingProvider
  implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider
{
  // Standard indentation levels (in spaces)
  private static readonly INDENT = {
    FEATURE: 0,
    RULE: 2,
    SCENARIO: 2, // or 4 if under Rule
    STEP: 4, // or 6 if under Rule
    TABLE: 6, // or 8 if under Rule
    EXAMPLES: 4, // or 6 if under Rule
    EXAMPLES_TABLE: 6, // or 8 if under Rule
  };

  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    _token: vscode.CancellationToken
  ): vscode.TextEdit[] {
    return this.formatLines(document, 0, document.lineCount - 1, options);
  }

  provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions,
    _token: vscode.CancellationToken
  ): vscode.TextEdit[] {
    return this.formatLines(document, range.start.line, range.end.line, options);
  }

  private formatLines(
    document: vscode.TextDocument,
    startLine: number,
    endLine: number,
    options: vscode.FormattingOptions
  ): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];
    const indentChar = options.insertSpaces ? " ".repeat(options.tabSize) : "\t";
    const baseIndent = options.insertSpaces ? options.tabSize : 1;

    let inDocString = false;
    let docStringIndent = 0;
    let inRule = false;
    let inExamples = false;

    // First pass: collect table sections for alignment
    const tableSections = this.collectTableSections(document, startLine, endLine);

    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const line = document.lineAt(lineNum);
      const text = line.text;

      // Handle doc strings (preserve content, just fix delimiter indentation)
      if (FORMAT_DOC_STRING_REGEX.test(text)) {
        if (inDocString) {
          // Closing delimiter
          const indent = this.getIndentString(
            inRule ? FeatureFormattingProvider.INDENT.STEP + 2 : FeatureFormattingProvider.INDENT.STEP,
            baseIndent,
            indentChar
          );
          const formatted = indent + text.trim();
          if (formatted !== text) {
            edits.push(vscode.TextEdit.replace(line.range, formatted));
          }
          inDocString = false;
        } else {
          // Opening delimiter
          docStringIndent = inRule
            ? FeatureFormattingProvider.INDENT.STEP + 2
            : FeatureFormattingProvider.INDENT.STEP;
          const indent = this.getIndentString(docStringIndent, baseIndent, indentChar);
          const formatted = indent + text.trim();
          if (formatted !== text) {
            edits.push(vscode.TextEdit.replace(line.range, formatted));
          }
          inDocString = true;
        }
        continue;
      }

      // Inside doc string - preserve content but normalize minimum indentation
      if (inDocString) {
        continue;
      }

      // Skip empty lines but trim whitespace
      if (FORMAT_EMPTY_REGEX.test(text)) {
        if (text !== "") {
          edits.push(vscode.TextEdit.replace(line.range, ""));
        }
        continue;
      }

      // Check if this line is part of a table section
      const tableSection = tableSections.find(
        (s) => lineNum >= s.startLine && lineNum <= s.endLine
      );

      if (tableSection) {
        const formattedTable = this.formatTableLine(
          text,
          tableSection,
          lineNum,
          inRule,
          inExamples,
          baseIndent,
          indentChar
        );
        if (formattedTable !== text) {
          edits.push(vscode.TextEdit.replace(line.range, formattedTable));
        }
        continue;
      }

      // Format based on keyword type
      let formatted: string;

      if (FORMAT_FEATURE_REGEX.test(text)) {
        formatted = this.formatKeywordLine(text, FeatureFormattingProvider.INDENT.FEATURE, baseIndent, indentChar);
        inRule = false;
        inExamples = false;
      } else if (FORMAT_RULE_REGEX.test(text)) {
        formatted = this.formatKeywordLine(text, FeatureFormattingProvider.INDENT.RULE, baseIndent, indentChar);
        inRule = true;
        inExamples = false;
      } else if (FORMAT_BACKGROUND_REGEX.test(text)) {
        const indent = inRule
          ? FeatureFormattingProvider.INDENT.SCENARIO + 2
          : FeatureFormattingProvider.INDENT.SCENARIO;
        formatted = this.formatKeywordLine(text, indent, baseIndent, indentChar);
        inExamples = false;
      } else if (FORMAT_SCENARIO_REGEX.test(text)) {
        const indent = inRule
          ? FeatureFormattingProvider.INDENT.SCENARIO + 2
          : FeatureFormattingProvider.INDENT.SCENARIO;
        formatted = this.formatKeywordLine(text, indent, baseIndent, indentChar);
        inExamples = false;
      } else if (FORMAT_EXAMPLES_REGEX.test(text)) {
        const indent = inRule
          ? FeatureFormattingProvider.INDENT.EXAMPLES + 2
          : FeatureFormattingProvider.INDENT.EXAMPLES;
        formatted = this.formatKeywordLine(text, indent, baseIndent, indentChar);
        inExamples = true;
      } else if (FORMAT_STEP_REGEX.test(text)) {
        const indent = inRule
          ? FeatureFormattingProvider.INDENT.STEP + 2
          : FeatureFormattingProvider.INDENT.STEP;
        formatted = this.formatStepLine(text, indent, baseIndent, indentChar);
        inExamples = false;
      } else if (FORMAT_TAG_REGEX.test(text)) {
        // Tags go at the same level as the element they precede
        // Look ahead to determine context
        const nextNonEmpty = this.findNextNonEmptyLine(document, lineNum + 1, endLine);
        let tagIndent = FeatureFormattingProvider.INDENT.FEATURE;
        if (nextNonEmpty) {
          if (FORMAT_FEATURE_REGEX.test(nextNonEmpty)) {
            tagIndent = FeatureFormattingProvider.INDENT.FEATURE;
          } else if (FORMAT_RULE_REGEX.test(nextNonEmpty)) {
            tagIndent = FeatureFormattingProvider.INDENT.RULE;
          } else if (
            FORMAT_SCENARIO_REGEX.test(nextNonEmpty) ||
            FORMAT_BACKGROUND_REGEX.test(nextNonEmpty)
          ) {
            tagIndent = inRule
              ? FeatureFormattingProvider.INDENT.SCENARIO + 2
              : FeatureFormattingProvider.INDENT.SCENARIO;
          } else if (FORMAT_EXAMPLES_REGEX.test(nextNonEmpty)) {
            tagIndent = inRule
              ? FeatureFormattingProvider.INDENT.EXAMPLES + 2
              : FeatureFormattingProvider.INDENT.EXAMPLES;
          }
        }
        formatted = this.formatTagLine(text, tagIndent, baseIndent, indentChar);
      } else if (FORMAT_COMMENT_REGEX.test(text)) {
        // Comments - preserve relative position but trim trailing whitespace
        formatted = text.trimEnd();
      } else {
        // Description text or other content - indent under parent
        const indent = inRule
          ? FeatureFormattingProvider.INDENT.SCENARIO
          : FeatureFormattingProvider.INDENT.RULE;
        formatted = this.getIndentString(indent, baseIndent, indentChar) + text.trim();
      }

      if (formatted !== text) {
        edits.push(vscode.TextEdit.replace(line.range, formatted));
      }
    }

    return edits;
  }

  private getIndentString(spaces: number, baseIndent: number, indentChar: string): string {
    if (indentChar === "\t") {
      return "\t".repeat(Math.floor(spaces / baseIndent));
    }
    return " ".repeat(spaces);
  }

  private formatKeywordLine(
    text: string,
    indentSpaces: number,
    baseIndent: number,
    indentChar: string
  ): string {
    const indent = this.getIndentString(indentSpaces, baseIndent, indentChar);
    return indent + text.trim();
  }

  private formatStepLine(
    text: string,
    indentSpaces: number,
    baseIndent: number,
    indentChar: string
  ): string {
    const indent = this.getIndentString(indentSpaces, baseIndent, indentChar);
    const trimmed = text.trim();
    // Normalize multiple spaces after keyword to single space
    const normalized = trimmed.replace(/^(Given|When|Then|And|But|\*)\s+/i, "$1 ");
    return indent + normalized;
  }

  private formatTagLine(
    text: string,
    indentSpaces: number,
    baseIndent: number,
    indentChar: string
  ): string {
    const indent = this.getIndentString(indentSpaces, baseIndent, indentChar);
    // Normalize spaces between tags
    const trimmed = text.trim();
    const normalized = trimmed.replace(/\s+@/g, " @");
    return indent + normalized;
  }

  private findNextNonEmptyLine(
    document: vscode.TextDocument,
    startLine: number,
    endLine: number
  ): string | null {
    for (let i = startLine; i <= Math.min(endLine, document.lineCount - 1); i++) {
      const text = document.lineAt(i).text;
      if (!FORMAT_EMPTY_REGEX.test(text)) {
        return text;
      }
    }
    return null;
  }

  // Table formatting helpers
  private collectTableSections(
    document: vscode.TextDocument,
    startLine: number,
    endLine: number
  ): TableSection[] {
    const sections: TableSection[] = [];
    let currentSection: TableSection | null = null;

    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const text = document.lineAt(lineNum).text;
      const isTableLine = FORMAT_TABLE_REGEX.test(text);

      if (isTableLine) {
        if (!currentSection) {
          currentSection = {
            startLine: lineNum,
            endLine: lineNum,
            columnWidths: [],
            rows: [],
          };
        }
        currentSection.endLine = lineNum;
        const cells = this.parseTableRow(text);
        currentSection.rows.push(cells);

        // Update column widths
        cells.forEach((cell, index) => {
          const width = cell.length;
          if (index >= currentSection!.columnWidths.length) {
            currentSection!.columnWidths.push(width);
          } else if (width > currentSection!.columnWidths[index]) {
            currentSection!.columnWidths[index] = width;
          }
        });
      } else if (currentSection) {
        sections.push(currentSection);
        currentSection = null;
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  private parseTableRow(text: string): string[] {
    const trimmed = text.trim();
    // Remove leading and trailing pipes
    const content = trimmed.replace(/^\||\|$/g, "");
    // Split by pipe and trim each cell
    return content.split("|").map((cell) => cell.trim());
  }

  private formatTableLine(
    text: string,
    section: TableSection,
    lineNum: number,
    inRule: boolean,
    inExamples: boolean,
    baseIndent: number,
    indentChar: string
  ): string {
    const rowIndex = lineNum - section.startLine;
    const cells = section.rows[rowIndex];

    // Determine table indent
    let tableIndent: number;
    if (inExamples) {
      tableIndent = inRule
        ? FeatureFormattingProvider.INDENT.EXAMPLES_TABLE + 2
        : FeatureFormattingProvider.INDENT.EXAMPLES_TABLE;
    } else {
      tableIndent = inRule
        ? FeatureFormattingProvider.INDENT.TABLE + 2
        : FeatureFormattingProvider.INDENT.TABLE;
    }

    const indent = this.getIndentString(tableIndent, baseIndent, indentChar);

    // Format each cell with proper padding
    const formattedCells = cells.map((cell, index) => {
      const width = section.columnWidths[index];
      return " " + cell.padEnd(width) + " ";
    });

    return indent + "|" + formattedCells.join("|") + "|";
  }
}

interface TableSection {
  startLine: number;
  endLine: number;
  columnWidths: number[];
  rows: string[][];
}
