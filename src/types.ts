/**
 * Supported Behave step keywords
 */
export type StepKeyword = "given" | "when" | "then" | "step";

/**
 * Represents a step definition found in a Python file
 */
export interface StepDefinition {
  /** The keyword used in the decorator (@given, @when, @then, @step) */
  keyword: StepKeyword;
  /** The original pattern string from the decorator */
  pattern: string;
  /** The compiled regex for matching steps */
  regex: RegExp;
  /** Absolute path to the Python file containing this definition */
  filePath: string;
  /** Line number where the decorator starts (0-based) */
  line: number;
  /** Character position where the decorator starts (0-based) */
  character: number;
}

/**
 * Represents a step extracted from a .feature file
 */
export interface StepInfo {
  /** The keyword used in the feature file (Given, When, Then, And, But, *) */
  keyword: string;
  /** The step text without the keyword */
  text: string;
  /** The effective keyword after resolving And/But */
  effectiveKeyword: StepKeyword | null;
}

/**
 * Represents a step found in a .feature file with its location
 */
export interface FeatureStep {
  /** The step text without the keyword (e.g., 'the message is "Hello"') */
  text: string;
  /** The keyword used in the feature file (Given, When, Then, And, But) */
  keyword: string;
  /** The effective keyword after resolving And/But */
  effectiveKeyword: StepKeyword | null;
  /** Absolute path to the .feature file */
  filePath: string;
  /** Line number where the step appears (0-based) */
  line: number;
  /** Character position where the step text starts (0-based) */
  character: number;
}

/**
 * Arguments passed to run/debug scenario commands
 */
export interface RunScenarioArgs {
  /** Absolute path to the .feature file */
  filePath: string;
  /** Name of the scenario to run (undefined for running all) */
  scenarioName?: string;
  /** Whether to run all scenarios in the feature file */
  runAll: boolean;
  /** Absolute path to the workspace root */
  workspaceRoot: string;
}

/**
 * Information about the Python interpreter configuration
 */
export interface InterpreterInfo {
  /** Path to the Python interpreter, or undefined if not found */
  path: string | undefined;
  /** Source of the interpreter configuration */
  source: "python.defaultInterpreterPath" | "python.pythonPath" | "none";
}
