/**
 * Supported Behave step keywords as a const object.
 * Use these constants instead of string literals for type safety.
 */
export const STEP_KEYWORDS = {
  GIVEN: "given",
  WHEN: "when",
  THEN: "then",
  STEP: "step",
} as const;

/**
 * Type representing a valid step keyword.
 * Derived from STEP_KEYWORDS for type safety.
 */
export type StepKeyword = (typeof STEP_KEYWORDS)[keyof typeof STEP_KEYWORDS];

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

/**
 * Base interface for file scanners.
 * Provides common lifecycle and scanning operations.
 */
export interface IScanner {
  /** Initialize the scanner and start watching for file changes */
  initialize(): Promise<void>;
  /** Force a rescan of all files */
  rescan(): Promise<void>;
  /** Dispose of resources */
  dispose(): void;
}

/**
 * Interface for scanning Python step definitions.
 */
export interface IStepScanner extends IScanner {
  /** Get all step definitions from the cache */
  getAllDefinitions(): StepDefinition[];
  /** Get step definitions from a specific file */
  getDefinitionsForFile(filePath: string): StepDefinition[];
}

/**
 * Interface for scanning feature file steps.
 */
export interface IFeatureScanner extends IScanner {
  /** Get all feature steps from the cache */
  getAllSteps(): FeatureStep[];
  /** Find all feature steps that match a given pattern */
  findMatchingSteps(pattern: string, keyword?: StepKeyword): FeatureStep[];
}
