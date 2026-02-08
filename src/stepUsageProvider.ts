import * as vscode from "vscode";
import { getFeatureScanner } from "./featureScanner";
import { StepKeyword } from "./types";

/**
 * Regex patterns to match Behave step decorators in Python files.
 */
const DECORATOR_PATTERNS = [
  // @given("pattern"), @when("pattern"), @then("pattern"), @step("pattern")
  /^\s*@(given|when|then|step)\s*\(\s*(?:u?r?)?"((?:[^"\\]|\\.)*)"\s*\)/i,
  // @given('pattern'), @when('pattern'), @then('pattern'), @step('pattern')
  /^\s*@(given|when|then|step)\s*\(\s*(?:u?r?)?'((?:[^'\\]|\\.)*)'\s*\)/i,
  // @given(re.compile(r"..."))
  /^\s*@(given|when|then|step)\s*\(\s*re\.compile\s*\(\s*r?"((?:[^"\\]|\\.)*)"/i,
  // @given(re.compile(r'...'))
  /^\s*@(given|when|then|step)\s*\(\s*re\.compile\s*\(\s*r?'((?:[^'\\]|\\.)*)'/i,
];

/**
 * Regex to match a Python function definition.
 */
const FUNCTION_DEF_REGEX = /^\s*def\s+(\w+)\s*\(/;

/**
 * Provides "Go to Definition" for Behave step functions in Python files.
 * When Ctrl+Click on a decorated step function, shows all .feature file
 * locations where that step is used.
 */
export class BehaveStepUsageProvider implements vscode.DefinitionProvider {
  /**
   * Provide definitions (usages in .feature files) for a step function.
   */
  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Location[] | null> {
    const line = document.lineAt(position.line);

    // Check if cursor is on a function definition
    if (!FUNCTION_DEF_REGEX.test(line.text)) {
      return null;
    }

    // Look backwards to find step decorators above the function
    const decorators = this.findDecoratorsAbove(document, position.line);

    if (decorators.length === 0) {
      return null;
    }

    const featureScanner = getFeatureScanner();
    const locations: vscode.Location[] = [];

    // Find matching steps for each decorator pattern
    for (const { keyword, pattern } of decorators) {
      const matchingSteps = featureScanner.findMatchingSteps(
        pattern,
        keyword as StepKeyword
      );

      for (const step of matchingSteps) {
        const uri = vscode.Uri.file(step.filePath);
        const range = new vscode.Range(
          step.line,
          step.character,
          step.line,
          step.character + step.text.length
        );
        locations.push(new vscode.Location(uri, range));
      }
    }

    if (locations.length === 0) {
      return null;
    }

    return locations;
  }

  /**
   * Find step decorators above a function definition.
   * Scans upward from the function line to find @given/@when/@then/@step decorators.
   */
  private findDecoratorsAbove(
    document: vscode.TextDocument,
    functionLine: number
  ): Array<{ keyword: string; pattern: string }> {
    const decorators: Array<{ keyword: string; pattern: string }> = [];

    // Scan backwards from the line above the function
    for (let i = functionLine - 1; i >= 0; i--) {
      const lineText = document.lineAt(i).text;

      // Skip empty lines and comments between decorators
      if (lineText.match(/^\s*(#.*)?$/)) {
        continue;
      }

      // Check if it's a step decorator
      const decoratorInfo = this.extractDecoratorInfo(lineText);
      if (decoratorInfo) {
        decorators.push(decoratorInfo);
        continue;
      }

      // If we hit any other line (another decorator, code, etc.), stop searching
      // But allow other decorators (non-step) to be skipped
      if (lineText.match(/^\s*@\w+/)) {
        // It's a decorator but not a step decorator, continue looking
        continue;
      }

      // Hit something else (previous function, class, etc.), stop
      break;
    }

    return decorators;
  }

  /**
   * Extract decorator information from a line of Python code.
   * Returns the keyword and pattern if the line contains a step decorator.
   */
  private extractDecoratorInfo(
    lineText: string
  ): { keyword: string; pattern: string } | null {
    for (const regex of DECORATOR_PATTERNS) {
      const match = lineText.match(regex);
      if (match) {
        return {
          keyword: match[1].toLowerCase(),
          pattern: match[2],
        };
      }
    }
    return null;
  }
}
