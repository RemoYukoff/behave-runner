/**
 * Centralized constants for Behave step decorator patterns.
 * These regex patterns are used across multiple modules to parse Python step definitions.
 */

// ============================================================================
// Decorator Patterns
// Groups: 1=indent, 2=keyword, 3=pattern
// ============================================================================

/**
 * Regex patterns to match Behave step decorators in Python files.
 * Supports: @given("..."), @when('...'), @then(u"..."), @step(r'...'), etc.
 * Groups: 1=indent, 2=keyword, 3=pattern
 */
export const DECORATOR_REGEXES = [
  // @given("pattern"), @when(u"pattern"), @then(r"pattern")
  /^(\s*)@(given|when|then|step)\s*\(\s*(?:u?r?)?"((?:[^"\\]|\\.)*)"\s*\)/i,
  // @given('pattern'), @when(u'pattern'), @then(r'pattern')
  /^(\s*)@(given|when|then|step)\s*\(\s*(?:u?r?)?'((?:[^'\\]|\\.)*)'\s*\)/i,
] as const;

// ============================================================================
// Python Patterns
// ============================================================================

/**
 * Regex to match a Python function definition.
 * Group: 1=function name
 */
export const FUNCTION_DEF_REGEX = /^\s*def\s+(\w+)\s*\(/;

/**
 * Regex to match any Python decorator.
 */
export const PYTHON_DECORATOR_REGEX = /^\s*@\w+/;

// ============================================================================
// Gherkin Step Keywords
// ============================================================================

/**
 * Regex to match Gherkin step keywords in feature files.
 * Groups: 1=keyword, 2=step text
 */
export const STEP_KEYWORD_REGEX = /^\s*(Given|When|Then|And|But|\*)\s+(.+)$/i;

/**
 * Regex to match Gherkin step keywords for autocompletion (allows partial/empty text).
 * Groups: 1=keyword, 2=partial text (may be empty)
 */
export const STEP_KEYWORD_PARTIAL_REGEX = /^\s*(Given|When|Then|And|But|\*)\s*(.*)/i;

/**
 * Regex to match direct Gherkin step keywords (Given/When/Then only).
 * Groups: 1=keyword
 */
export const DIRECT_KEYWORD_REGEX = /^\s*(Given|When|Then)\s+/i;

/**
 * Regex to match continuation keywords (And/But/*).
 * Groups: 1=keyword
 */
export const CONTINUATION_KEYWORD_REGEX = /^\s*(And|But|\*)\s+/i;

// ============================================================================
// Gherkin Structural Keywords
// ============================================================================

/**
 * Regex to match empty lines or comment lines.
 */
export const EMPTY_OR_COMMENT_REGEX = /^\s*(#.*)?$/;

/**
 * Regex to match Gherkin structural keywords that reset step context.
 */
export const STRUCTURAL_KEYWORD_REGEX =
  /^\s*(Feature|Scenario|Scenario Outline|Background|Examples):/i;

/**
 * Regex to match Feature line and capture feature name.
 * Groups: 1=feature name
 */
export const FEATURE_LINE_REGEX = /^\s*Feature:\s*(.+)$/;

/**
 * Regex to match Scenario or Scenario Outline line and capture scenario name.
 * Groups: 1=scenario name
 */
export const SCENARIO_LINE_REGEX = /^\s*Scenario(?: Outline)?:\s*(.+)$/;

// ============================================================================
// Behave Pattern Matching - Compiled Regex
// ============================================================================

/**
 * Regex to match Behave placeholder syntax: {name} or {name:type}.
 * Groups: 1=name, 2=type (optional)
 */
export const BEHAVE_PLACEHOLDER_REGEX = /\{(\w+)(?::(\w))?\}/g;

/**
 * Regex to match special characters that need escaping in regex patterns.
 * Used when converting user input to a regex-safe string.
 */
export const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

// ============================================================================
// Behave Pattern Matching - Regex Fragments (for dynamic regex construction)
// These are string patterns used to build regex in behavePatternToRegex().
// They cannot be precompiled because they are inserted into larger patterns.
// ============================================================================

/**
 * Behave type placeholders and their regex equivalents.
 * Used when converting {name:type} placeholders to regex patterns.
 * See: https://behave.readthedocs.io/en/stable/parse.html
 */
export const BEHAVE_TYPE_FRAGMENTS: Readonly<Record<string, string>> = {
  d: "-?\\d+", // integer
  f: "-?\\d+\\.?\\d*", // float
  w: "\\w+", // word
  W: "\\W+", // non-word
  s: "\\s+", // whitespace
  S: "\\S+", // non-whitespace
} as const;

/**
 * Default regex fragment for untyped placeholders like {name}.
 */
export const DEFAULT_PLACEHOLDER_FRAGMENT = ".+";

/**
 * Regex fragment for Scenario Outline placeholders like <name>.
 */
export const OUTLINE_PLACEHOLDER_FRAGMENT = "<[^>]+>";

// ============================================================================
// Gherkin Formatting Patterns
// These patterns are used by the formatting provider to identify line types.
// Groups: 1=leading whitespace (for all patterns)
// ============================================================================

/**
 * Regex to match Feature keyword line.
 */
export const FORMAT_FEATURE_REGEX = /^(\s*)Feature:/i;

/**
 * Regex to match Rule keyword line.
 */
export const FORMAT_RULE_REGEX = /^(\s*)Rule:/i;

/**
 * Regex to match Background keyword line.
 */
export const FORMAT_BACKGROUND_REGEX = /^(\s*)Background:/i;

/**
 * Regex to match Scenario or Scenario Outline keyword line.
 */
export const FORMAT_SCENARIO_REGEX = /^(\s*)Scenario(?: Outline)?:/i;

/**
 * Regex to match Examples keyword line.
 */
export const FORMAT_EXAMPLES_REGEX = /^(\s*)Examples:/i;

/**
 * Regex to match step keywords with leading whitespace.
 * Groups: 1=whitespace, 2=keyword
 */
export const FORMAT_STEP_REGEX = /^(\s*)(Given|When|Then|And|But|\*)\s+/i;

/**
 * Regex to match tag lines.
 */
export const FORMAT_TAG_REGEX = /^(\s*)@/;

/**
 * Regex to match table rows (lines starting with |).
 */
export const FORMAT_TABLE_REGEX = /^(\s*)\|/;

/**
 * Regex to match doc string delimiters (triple quotes).
 */
export const FORMAT_DOC_STRING_REGEX = /^(\s*)(""")/;

/**
 * Regex to match comment lines.
 */
export const FORMAT_COMMENT_REGEX = /^(\s*)#/;

/**
 * Regex to match empty or whitespace-only lines.
 */
export const FORMAT_EMPTY_REGEX = /^\s*$/;
