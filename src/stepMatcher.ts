import { StepDefinition, StepKeyword } from "./types";
import {
  STEP_KEYWORD_REGEX,
  DIRECT_KEYWORD_REGEX,
  CONTINUATION_KEYWORD_REGEX,
  EMPTY_OR_COMMENT_REGEX,
  REGEX_SPECIAL_CHARS,
  BEHAVE_PLACEHOLDER_REGEX,
} from "./constants";

/**
 * Behave type placeholders and their regex equivalents
 * See: https://behave.readthedocs.io/en/stable/parse.html
 */
const BEHAVE_TYPE_PATTERNS: Record<string, string> = {
  d: "-?\\d+", // integer
  f: "-?\\d+\\.?\\d*", // float
  w: "\\w+", // word
  W: "\\W+", // non-word
  s: "\\s+", // whitespace
  S: "\\S+", // non-whitespace
};

/**
 * Default pattern for untyped placeholders like {name}
 */
const DEFAULT_PLACEHOLDER_PATTERN = ".+";

/**
 * Pattern to match Scenario Outline placeholders like <name>
 */
const OUTLINE_PLACEHOLDER_PATTERN = "<[^>]+>";

/**
 * Converts a Behave pattern string to a RegExp.
 *
 * Behave supports patterns like:
 * - {name} -> matches any non-empty string
 * - {name:d} -> matches integers
 * - {name:f} -> matches floats
 * - {name:w} -> matches words
 *
 * The generated regex also accepts Scenario Outline placeholders (<name>)
 * in place of any typed value.
 *
 * @param pattern The Behave pattern string (e.g., "the number is {n:d}")
 * @returns A RegExp that matches step text (including Scenario Outline placeholders)
 */
export function behavePatternToRegex(pattern: string): RegExp {
  // Escape regex special characters except for our placeholders
  let regexStr = pattern.replace(REGEX_SPECIAL_CHARS, (char) => {
    // Don't escape curly braces yet, we'll handle them specially
    if (char === "{" || char === "}") {
      return char;
    }
    return "\\" + char;
  });

  // Replace Behave placeholders with regex groups that accept:
  // 1. The expected value type (e.g., \d+ for integers)
  // 2. OR a Scenario Outline placeholder (<name>)
  // Pattern: {name} or {name:type}
  regexStr = regexStr.replace(BEHAVE_PLACEHOLDER_REGEX, (_, _name, type) => {
    const typePattern = type && BEHAVE_TYPE_PATTERNS[type]
      ? BEHAVE_TYPE_PATTERNS[type]
      : DEFAULT_PLACEHOLDER_PATTERN;

    // Non-capturing group with alternation: (typePattern|<placeholder>)
    return `(?:${typePattern}|${OUTLINE_PLACEHOLDER_PATTERN})`;
  });

  // Handle optional text in Behave patterns: (?:optional)?
  // This is already valid regex, so we leave it as-is

  return new RegExp(`^${regexStr}$`, "i");
}

/**
 * Checks if a step text matches a step definition.
 *
 * @param stepText The step text from the .feature file (without keyword)
 * @param definition The step definition to match against
 * @returns true if the step text matches the definition's pattern
 */
export function matchesStepDefinition(
  stepText: string,
  definition: StepDefinition
): boolean {
  return definition.regex.test(stepText.trim());
}

/**
 * Finds all matching step definitions for a given step text.
 * Supports Scenario Outline placeholders like <name> automatically
 * (the regex already accepts them as alternatives).
 *
 * @param stepText The step text from the .feature file (without keyword)
 * @param keyword The effective keyword (given, when, then) or null for any
 * @param definitions All available step definitions
 * @returns Array of matching step definitions
 */
export function findMatchingDefinitions(
  stepText: string,
  keyword: StepKeyword | null,
  definitions: StepDefinition[]
): StepDefinition[] {
  const trimmedText = stepText.trim();

  return definitions.filter((def) => {
    // Filter by keyword first (fast operation)
    // @step decorator matches any keyword
    if (keyword && def.keyword !== "step" && def.keyword !== keyword) {
      return false;
    }

    // Single regex match - works for both normal steps and Scenario Outline
    // because the regex accepts <placeholder> as an alternative to typed values
    return def.regex.test(trimmedText);
  });
}

/**
 * Extracts step information from a line in a .feature file.
 *
 * @param line The line text
 * @param previousKeyword The keyword from the previous step (for And/But resolution)
 * @returns StepInfo if the line is a step, null otherwise
 */
export function parseStepLine(
  line: string,
  previousKeyword: StepKeyword | null
): { keyword: string; text: string; effectiveKeyword: StepKeyword | null } | null {
  const stepMatch = line.match(STEP_KEYWORD_REGEX);

  if (!stepMatch) {
    return null;
  }

  const keyword = stepMatch[1];
  const text = stepMatch[2];

  let effectiveKeyword: StepKeyword | null = null;

  switch (keyword.toLowerCase()) {
    case "given":
      effectiveKeyword = "given";
      break;
    case "when":
      effectiveKeyword = "when";
      break;
    case "then":
      effectiveKeyword = "then";
      break;
    case "and":
    case "but":
    case "*":
      // Inherit from previous step
      effectiveKeyword = previousKeyword;
      break;
  }

  return { keyword, text, effectiveKeyword };
}

/**
 * Determines the effective keyword for a step at a given line,
 * by scanning backwards through the document to find the parent keyword.
 *
 * @param lines Array of document lines
 * @param targetLine The line number of the step (0-based)
 * @returns The effective keyword or null
 */
export function resolveEffectiveKeyword(
  lines: string[],
  targetLine: number
): StepKeyword | null {
  // First check if the current line has a direct keyword (Given/When/Then)
  const currentLine = lines[targetLine];
  const directMatch = currentLine.match(DIRECT_KEYWORD_REGEX);
  if (directMatch) {
    return directMatch[1].toLowerCase() as StepKeyword;
  }

  // If current line is And/But/*, search backwards for parent keyword
  const isAndButStar = currentLine.match(CONTINUATION_KEYWORD_REGEX);
  if (!isAndButStar) {
    // Not a step line
    return null;
  }

  // Search backwards from the previous line
  for (let i = targetLine - 1; i >= 0; i--) {
    const line = lines[i];
    
    // Found a direct keyword - this is the parent
    const parentMatch = line.match(DIRECT_KEYWORD_REGEX);
    if (parentMatch) {
      return parentMatch[1].toLowerCase() as StepKeyword;
    }

    // Skip And/But/* lines, continue searching
    const andButMatch = line.match(CONTINUATION_KEYWORD_REGEX);
    if (andButMatch) {
      continue;
    }

    // If we hit a non-step line (like Scenario:, Feature:, empty line, etc.)
    // we stop searching - no parent keyword found
    const isEmptyOrComment = line.match(EMPTY_OR_COMMENT_REGEX);
    if (!isEmptyOrComment) {
      // Hit a structural line like Scenario:, break the search
      break;
    }
  }

  return null;
}
