/**
 * Centralized constants for Behave step decorator patterns.
 * These regex patterns are used across multiple modules to parse Python step definitions.
 */

/**
 * Regex patterns to match Behave step decorators in Python files.
 * These patterns are used for simple matching (without capturing indent).
 * Groups: 1=keyword, 2=pattern
 */
export const DECORATOR_PATTERNS = [
  // @given("pattern"), @when("pattern"), @then("pattern"), @step("pattern")
  /^\s*@(given|when|then|step)\s*\(\s*(?:u?r?)?"((?:[^"\\]|\\.)*)"\s*\)/i,
  // @given('pattern'), @when('pattern'), @then('pattern'), @step('pattern')
  /^\s*@(given|when|then|step)\s*\(\s*(?:u?r?)?'((?:[^'\\]|\\.)*)'\s*\)/i,
  // @given(re.compile(r"..."))
  /^\s*@(given|when|then|step)\s*\(\s*re\.compile\s*\(\s*r?"((?:[^"\\]|\\.)*)"/i,
  // @given(re.compile(r'...'))
  /^\s*@(given|when|then|step)\s*\(\s*re\.compile\s*\(\s*r?'((?:[^'\\]|\\.)*)'/i,
] as const;

/**
 * Regex to match Behave step decorators with double quotes, capturing indent.
 * Groups: 1=indent, 2=keyword, 3=pattern
 * Used by StepScanner for line-by-line parsing with position tracking.
 */
export const DECORATOR_REGEX_DOUBLE =
  /^(\s*)@(given|when|then|step)\s*\(\s*(?:u?r?)?"((?:[^"\\]|\\.)*)"\s*\)/i;

/**
 * Regex to match Behave step decorators with single quotes, capturing indent.
 * Groups: 1=indent, 2=keyword, 3=pattern
 * Used by StepScanner for line-by-line parsing with position tracking.
 */
export const DECORATOR_REGEX_SINGLE =
  /^(\s*)@(given|when|then|step)\s*\(\s*(?:u?r?)?'((?:[^'\\]|\\.)*)'\s*\)/i;

/**
 * Regex for decorators with re.compile() and double quotes, capturing indent.
 * Groups: 1=indent, 2=keyword, 3=pattern
 */
export const DECORATOR_REGEX_COMPILE_DOUBLE =
  /^(\s*)@(given|when|then|step)\s*\(\s*re\.compile\s*\(\s*r?"((?:[^"\\]|\\.)*)"/i;

/**
 * Regex for decorators with re.compile() and single quotes, capturing indent.
 * Groups: 1=indent, 2=keyword, 3=pattern
 */
export const DECORATOR_REGEX_COMPILE_SINGLE =
  /^(\s*)@(given|when|then|step)\s*\(\s*re\.compile\s*\(\s*r?'((?:[^'\\]|\\.)*)'/i;

/**
 * All decorator regex patterns with indent capture, for iteration.
 */
export const DECORATOR_REGEXES_WITH_INDENT = [
  DECORATOR_REGEX_DOUBLE,
  DECORATOR_REGEX_SINGLE,
  DECORATOR_REGEX_COMPILE_DOUBLE,
  DECORATOR_REGEX_COMPILE_SINGLE,
] as const;

/**
 * Regex to match a Python function definition.
 * Group: 1=function name
 */
export const FUNCTION_DEF_REGEX = /^\s*def\s+(\w+)\s*\(/;

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

/**
 * Regex to match any Python decorator.
 */
export const PYTHON_DECORATOR_REGEX = /^\s*@\w+/;

/**
 * Regex to match special characters that need escaping in regex patterns.
 * Used when converting user input to a regex-safe string.
 */
export const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * Regex to match Behave placeholder syntax: {name} or {name:type}.
 * Groups: 1=name, 2=type (optional)
 */
export const BEHAVE_PLACEHOLDER_REGEX = /\{(\w+)(?::(\w))?\}/g;

/**
 * Default glob patterns for Python step definition files.
 * These match the defaults in package.json configuration.
 */
export const DEFAULT_STEP_DEFINITION_PATTERNS = [
  "**/steps/**/*.py",
  "**/*_steps.py",
  "**/step_*.py",
  "**/steps.py",
] as const;

/**
 * Default glob patterns for Gherkin feature files.
 * These match the defaults in package.json configuration.
 */
export const DEFAULT_FEATURE_FILE_PATTERNS = ["**/*.feature"] as const;
