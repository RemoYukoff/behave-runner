/**
 * Centralized constants for Behave step decorator patterns.
 * These regex patterns are used across multiple modules to parse Python step definitions.
 */

// ==================== Configuration Constants ====================

/**
 * Number of files to scan in parallel during batch operations.
 */
export const SCAN_BATCH_SIZE = 10;

/**
 * Maximum number of rescan retries for a single file.
 * Prevents infinite recursion if a file is modified continuously.
 */
export const MAX_RESCAN_RETRIES = 3;

/**
 * Debounce delay in milliseconds for file watcher events.
 */
export const FILE_WATCHER_DEBOUNCE_MS = 300;

/**
 * Debounce delay in milliseconds for diagnostics updates on document changes.
 */
export const DIAGNOSTICS_DEBOUNCE_MS = 300;

/**
 * Number of lines between abort checks in diagnostics updates.
 * Allows early exit if the document changed during processing.
 */
export const DIAGNOSTICS_ABORT_CHECK_INTERVAL = 50;

/**
 * Padding length for sortText in completion items (supports up to 99999 items).
 */
export const SORT_TEXT_PAD_LENGTH = 5;

/**
 * Maximum number of entries in the regex cache (LRU eviction).
 */
export const REGEX_CACHE_MAX_SIZE = 500;

/**
 * Maximum number of cached line entries per file in BehaveDefinitionProvider.
 * Limits memory usage when navigating large feature files.
 */
export const DEFINITION_LINE_CACHE_MAX_SIZE = 100;

/**
 * Maximum number of files to cache in BehaveDefinitionProvider.
 * Prevents unbounded memory growth when navigating many feature files.
 */
export const DEFINITION_FILE_CACHE_MAX_SIZE = 50;

// ==================== Decorator Regex Patterns ====================

/**
 * All decorator regex patterns with indent capture, for iteration.
 * Groups: 1=indent, 2=keyword, 3=pattern
 * 
 * Supports:
 * - @given/@when/@then/@step with double or single quotes
 * - Optional u/r prefix for strings
 * - re.compile() wrapped patterns
 */
export const DECORATOR_REGEXES_WITH_INDENT = [
  // Double quotes: @given("pattern")
  /^(\s*)@(given|when|then|step)\s*\(\s*(?:u?r?)?"((?:[^"\\]|\\.)*)"\s*\)/i,
  // Single quotes: @given('pattern')
  /^(\s*)@(given|when|then|step)\s*\(\s*(?:u?r?)?'((?:[^'\\]|\\.)*)'\s*\)/i,
  // re.compile() with double quotes: @given(re.compile(r"pattern"))
  /^(\s*)@(given|when|then|step)\s*\(\s*re\.compile\s*\(\s*r?"((?:[^"\\]|\\.)*)"/i,
  // re.compile() with single quotes: @given(re.compile(r'pattern'))
  /^(\s*)@(given|when|then|step)\s*\(\s*re\.compile\s*\(\s*r?'((?:[^'\\]|\\.)*)'/i,
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
 * Regex pattern for Behave placeholder syntax: {name} or {name:type}.
 * Groups: 1=name, 2=type (optional)
 * 
 * Note: This is a non-global regex for single matches. For replace operations,
 * use createPlaceholderRegex() which creates a fresh global regex.
 */
export const BEHAVE_PLACEHOLDER_REGEX = /\{(\w+)(?::(\w))?\}/;

/**
 * Creates a fresh global regex for Behave placeholder matching.
 * Use this instead of a shared global regex to avoid lastIndex state issues.
 * 
 * @returns A new global RegExp for matching {name} or {name:type} placeholders
 */
export function createPlaceholderRegex(): RegExp {
  return /\{(\w+)(?::(\w))?\}/g;
}

// ==================== Behave Pattern Constants ====================

/**
 * Behave type placeholders and their regex equivalents.
 * See: https://behave.readthedocs.io/en/stable/parse.html
 */
export const BEHAVE_TYPE_PATTERNS: Record<string, string> = {
  d: "-?\\d+", // integer
  f: "-?\\d+\\.?\\d*", // float
  w: "\\w+", // word
  W: "\\W+", // non-word
  s: "\\s+", // whitespace
  S: "\\S+", // non-whitespace
} as const;

/**
 * Default pattern for untyped placeholders like {name}.
 */
export const DEFAULT_PLACEHOLDER_PATTERN = ".+";

/**
 * Pattern to match Scenario Outline placeholders like <name>.
 */
export const OUTLINE_PLACEHOLDER_PATTERN = "<[^>]+>";

// ==================== Default Glob Patterns ====================

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
