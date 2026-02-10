# Behave Runner - Architecture Documentation

## Project Overview

**Behave Runner** is a VS Code extension for BDD development with Python/Behave.

### Features

| Feature | Description |
|---------|-------------|
| **Run & Debug** | CodeLens buttons above Feature/Scenario lines |
| **Go to Definition** | Ctrl+Click on steps in `.feature` → Python definition |
| **Find Step Usages** | Ctrl+Click on Python step function → `.feature` usages |
| **Step Autocomplete** | Suggestions based on existing step definitions |
| **Diagnostics** | Warnings for undefined steps |
| **Syntax Highlighting** | Full grammar for `.feature` files |

### Tech Stack

- **Language**: TypeScript
- **Target**: VS Code Extension API
- **Dependencies**: `minimatch` (glob pattern matching)

---

## Architecture

```
src/
├── extension.ts              # Entry point, provider registration
├── services.ts               # Dependency injection container
├── types.ts                  # Shared interfaces and types
├── constants.ts              # Centralized regex patterns + config constants
│
├── Scanners (Cache + File Watching)
│   ├── baseScanner.ts        # Abstract base class for scanners
│   ├── stepScanner.ts        # Scans Python step definitions (with keyword index)
│   └── featureScanner.ts     # Scans feature file steps (with LRU regex cache + keyword index)
│
├── Providers (VS Code APIs)
│   ├── codeLensProvider.ts         # Run/Debug buttons
│   ├── stepDefinitionProvider.ts   # Go to Definition (.feature → .py)
│   ├── stepLocationProvider.ts     # Go to Definition (.py → .feature)
│   ├── stepCompletionProvider.ts   # Autocomplete (with completion cache)
│   └── stepDiagnosticsProvider.ts  # Undefined step warnings
│
├── Core Logic
│   ├── stepMatcher.ts        # Behave pattern → regex, step matching
│   └── decoratorParser.ts    # Python decorator parsing
│
└── Utils
    ├── utils.ts              # debounce, DocStringTracker, escapeRegex, LRUCache
    ├── pythonUtils.ts        # Python interpreter detection
    ├── commandHandlers.ts    # Run/Debug command handlers (with escapeShellArg)
    └── logger.ts             # Output channel logging
```

---

## Key Design Patterns

### 1. Scanner Architecture (`BaseScanner<T>`)

Both scanners inherit from `BaseScanner<T>`:

```typescript
abstract class BaseScanner<TItem> implements IScanner {
  // Common functionality
  - File watching with minimatch pattern matching
  - Batch parallel scanning (configurable batch size)
  - Flat cache with smart invalidation (only on actual changes)
  - Configuration caching with change listener
  - Concurrency protection (pendingRescan for race conditions)
  - Rescan protection (prevents concurrent full rescans)
  
  // Abstract methods for subclasses
  - getWatcherPattern(): string
  - getConfigKey(): string
  - getDefaultPatterns(): readonly string[]
  - parseFileContent(path, content): TItem[]
  
  // Hooks for subclasses
  - invalidateAdditionalCaches(): void
  - onItemsChanged(): void
  - areItemsEqual(old, new): boolean  // For smart cache invalidation
}
```

### 2. Service Container (`services.ts`)

Simple dependency injection for testability:

```typescript
interface Services {
  stepScanner: IStepScanner;
  featureScanner: IFeatureScanner;
}

// Usage
const scanner = getStepScanner();
```

### 3. Centralized Constants (`constants.ts`)

All regex patterns and configuration constants in one place:

**Configuration Constants:**
- `SCAN_BATCH_SIZE` - Files scanned in parallel (default: 10)
- `FILE_WATCHER_DEBOUNCE_MS` - Debounce delay for file watchers (default: 300ms)
- `DIAGNOSTICS_DEBOUNCE_MS` - Debounce delay for diagnostics updates (default: 300ms)
- `REGEX_CACHE_MAX_SIZE` - LRU cache limit (default: 500)
- `SORT_TEXT_PAD_LENGTH` - Padding for completion item sort order (default: 5)

**Regex Patterns:**
- `DECORATOR_REGEXES_WITH_INDENT` - Python step decorators (single source of truth)
- `STEP_KEYWORD_REGEX` - Gherkin keywords
- `BEHAVE_PLACEHOLDER_REGEX` - `{name}`, `{n:d}` patterns (no global flag)
- `BEHAVE_PLACEHOLDER_REGEX_GLOBAL` - Global version for String.replace() (reset lastIndex before use)
- `DEFAULT_*_PATTERNS` - Default glob patterns

### 4. Type Safety (`types.ts`)

Well-defined interfaces:
- `StepDefinition` - Python step with compiled regex
- `FeatureStep` - Step from .feature file
- `LineAccessor` - Document abstraction for efficiency
- `IStepScanner`, `IFeatureScanner` - Scanner contracts

---

## Performance Optimizations

| Optimization | Location | Description |
|--------------|----------|-------------|
| **Debouncing** | `extension.ts`, `stepDiagnosticsProvider.ts` | Configurable debounce on file changes and document edits |
| **Smart Cache Invalidation** | `BaseScanner` | Only invalidates when items actually change |
| **Keyword Index** | `StepScanner`, `FeatureScanner` | O(1) lookup by keyword instead of O(n) filter |
| **LRU Regex Cache** | `FeatureScanner` | Bounded cache prevents memory growth |
| **Completion Cache** | `StepCompletionProvider` | Caches items by scanner version + keyword |
| **Pending Rescan** | `BaseScanner` | Queues rescans during active scans |
| **Batch Scanning** | `BaseScanner` | Configurable parallel batch size |
| **Concurrency Lock** | `BaseScanner` | Prevents duplicate file scans |
| **Config Cache** | `BaseScanner` | Patterns cached until config changes |
| **document.lineAt()** | Providers | Avoids `getText().split()` |

---

## Configuration

Defined in `package.json`:

```json
{
  "behaveRunner.debug.justMyCode": true,
  "behaveRunner.stepDefinitions.patterns": [
    "**/steps/**/*.py",
    "**/*_steps.py",
    "**/step_*.py",
    "**/steps.py"
  ],
  "behaveRunner.featureFiles.patterns": [
    "**/*.feature"
  ]
}
```

---

## Key Files Reference

### Entry Point (`extension.ts`)

```typescript
activate(context):
  1. Initialize logger
  2. Initialize services (scanners)
  3. Register providers (CodeLens, Definition, Completion, Diagnostics)
  4. Set up file watchers with configurable debouncing
  5. Register commands

deactivate():
  1. Dispose services
  2. Dispose logger
```

### Step Matching (`stepMatcher.ts`)

```typescript
behavePatternToRegex(pattern):
  - Uses escapeRegex() helper for consistent escaping
  - Converts "{name}" → "(?:.+|<[^>]+>)"
  - Converts "{n:d}" → "(?:-?\d+|<[^>]+>)"
  - Handles Scenario Outline placeholders

findMatchingDefinitions(text, definitions):
  - Definitions pre-filtered by keyword (via getDefinitionsByKeyword)
  - Only tests regex match

resolveEffectiveKeyword(document, line):
  - Resolves And/But to parent Given/When/Then
  - Uses document.lineAt() for efficiency
```

### Decorator Parsing (`decoratorParser.ts`)

```typescript
extractDecoratorInfo(line):
  - Uses DECORATOR_REGEXES_WITH_INDENT (single source)
  - Matches @given/@when/@then/@step decorators
  - Supports string and re.compile() patterns

findDecoratorsAbove(document, functionLine):
  - Scans backwards from function definition
  - Collects all step decorators
```

### Utils (`utils.ts`)

```typescript
escapeRegex(str, exceptChars?):
  - Centralized regex escaping
  - Optional character exclusion for Behave patterns

DocStringTracker:
  - Unified implementation via isLineInside()
  - Works with both string arrays and LineAccessor

LRUCache<K, V>:
  - Generic LRU cache implementation
  - Used by FeatureScanner for regex caching

getStepTextStartPosition(lineText):
  - Calculates character position where step text starts
  - Used by diagnostics and feature scanner

buildKeywordIndex<T, K>(items, getKey):
  - Generic keyword index builder
  - Used by StepScanner and FeatureScanner

arraysEqual<T>(oldItems, newItems, isEqual):
  - Generic array comparison with custom equality
  - Used by scanners for smart cache invalidation
```

---

## Extension Points

To add new scanner types, extend `BaseScanner<T>`:

```typescript
class MyScanner extends BaseScanner<MyItem> {
  protected getWatcherPattern(): string { return "**/*.ext"; }
  protected getConfigKey(): string { return "myConfig.patterns"; }
  protected getDefaultPatterns(): readonly string[] { return ["**/*.ext"]; }
  protected getFileTypeName(): string { return "my file"; }
  protected parseFileContent(path: string, content: string): MyItem[] {
    // Parse logic
  }
  
  // Optional: Custom cache invalidation check
  protected areItemsEqual(old: MyItem[] | undefined, new: MyItem[]): boolean {
    // Custom comparison logic
  }
}
```

---

## Known Edge Cases

1. **Scenario Outline placeholders**: `<name>` accepted as valid values in regex
2. **Doc strings**: Steps inside `"""` or ``` blocks are skipped
3. **And/But keywords**: Resolved to parent Given/When/Then
4. **Multi-line decorators**: Currently not supported (rare in practice)

---

## Code Quality Checklist

When reviewing this codebase, verify:

- [ ] No `document.getText().split("\n")` - use `document.lineAt()` instead
- [ ] File watchers have debouncing if they trigger heavy operations
- [ ] Caches are invalidated only when data actually changes
- [ ] New patterns added to `constants.ts`, not inline
- [ ] Magic numbers use constants from `constants.ts`
- [ ] Scanners extend `BaseScanner` for consistency
- [ ] Configuration reads are cached (not called repeatedly)
- [ ] Async operations have concurrency protection
- [ ] Regex escaping uses `escapeRegex()` helper
- [ ] Global regex flags avoided in constants (create locally when needed)

---

## Recent Improvements (v2.5)

### Code Deduplication
- **buildKeywordIndex helper**: Extracted common keyword indexing logic to `utils.ts`
- **arraysEqual helper**: Extracted common array comparison logic to `utils.ts`
- **Reduced jscpd clones**: From 4 clones (1.3%) to 1 clone (0.41%)

### Code Quality
- **Removed type assertions**: Cleaned up unnecessary `as StepKeyword | null` casts
- **Removed unused imports**: Cleaned up imports after type assertion removal

### Build System
- **New npm scripts**: Added `duplicates` (jscpd) and `unused` (knip) for easier analysis
- **Knip configuration**: Added config to ignore CI binary (`ovsx`)

---

## Previous Improvements (v2.4)

### Development Tools
- **ESLint integration**: Added ESLint with TypeScript support for code quality
- **New npm scripts**: `lint` and `lint:fix` for running ESLint

### Bug Fixes
- **Floating promise**: Fixed unhandled promise in `BaseScanner.setupConfigListener()` with `void` operator

### Code Quality (via ESLint)
- **Nullish coalescing**: Replaced `||` with `??` for safer null/undefined checks
- **Optional chaining**: Replaced `&&` checks with `?.` operator for cleaner code
- **Nullish assignment**: Used `??=` for conditional assignments
- **Dead code removal**: Removed unused `isLineInsideDocString` method

---

## Previous Improvements (v2.3)

### Bug Fixes
- **Diagnostics range calculation**: Fixed `stepDiagnosticsProvider` including trailing whitespace in diagnostic range
- **Memory leak in CodeLensProvider**: Added `Disposable` interface to properly dispose `EventEmitter`
- **Missing validation in runScenarioHandler**: Added `scenarioName` validation when `runAll=false`

### Performance
- **Keyword index in FeatureScanner**: Added `keywordIndex` for O(1) lookup by keyword in `findMatchingSteps()` (matches `StepScanner` design)

### Maintainability
- **Centralized Behave patterns**: Moved `BEHAVE_TYPE_PATTERNS`, `DEFAULT_PLACEHOLDER_PATTERN`, and `OUTLINE_PLACEHOLDER_PATTERN` to `constants.ts`

---

## Previous Improvements (v2.2)

### Bug Fixes
- **Step text range calculation**: Fixed `getStepTextRange()` incorrect startChar when multiple spaces after keyword
- **Negative line validation**: Added check for `targetLine < 0` in `resolveEffectiveKeyword()`
- **Command injection**: Added `escapeShellArg()` to properly escape shell metacharacters (`\`, `"`, `$`, backticks)

### Performance
- **Completion item cloning**: Avoid cloning items when no filter text - set range directly on cached items

### Dead Code Removal (via knip)
- Removed unused exports: `DECORATOR_REGEX_*` (inlined), `BEHAVE_PLACEHOLDER_REGEX`, `extractDecoratorInfo`, `resolveInterpreterPath`, `getServices`, `isInitialized`
- Removed unused types: `StepInfo`, made private: `DecoratorInfo`, `LogLevel`, `Services`

### Duplicate Code Fixed (via jscpd)
- **File watcher handlers**: Extracted shared `handleFileChange` function in `baseScanner.ts`
- **Diagnostics init**: Call `refreshAll()` instead of duplicating iteration logic

### Maintainability
- **Centralized global regex**: `BEHAVE_PLACEHOLDER_REGEX_GLOBAL` now in constants.ts (was duplicated in 2 files)
- **Analysis tools added**: `knip` (unused code), `jscpd` (duplicate detection)

---

## Previous Improvements (v2.1)

### Bug Fixes
- **Double version increment**: Fixed `StepScanner.rescan()` incrementing version twice
- **Diagnostics lag**: Added per-document debouncing to prevent lag during typing
- **Invalid pattern handling**: Added error handling in `FeatureScanner.findMatchingSteps()`
- **JSON.stringify with RegExp**: Implemented custom `areItemsEqual()` in scanner subclasses

### Performance
- **Removed duplicate filtering**: `StepCompletionProvider` uses `getDefinitionsByKeyword()` directly
- **Optimized CompletionItem cloning**: Extracted `cloneCompletionItemWithRange()` helper

### Maintainability
- **Generic LRUCache**: Moved to `utils.ts` as reusable `LRUCache<K, V>` class
- **Helper function**: `getStepTextStartPosition()` for step text position calculation
- **New constants**: `DIAGNOSTICS_DEBOUNCE_MS`, `SORT_TEXT_PAD_LENGTH`

---

## Previous Improvements (v2.0)

### Bug Fixes
- **Race condition in scanFile**: Added `pendingRescan` set to queue re-scans
- **Configuration rescan**: Protected against concurrent full rescans
- **Pattern matching**: Removed incorrect shortcut in `matchesPatterns()`
- **Regex state**: Removed global flag from `BEHAVE_PLACEHOLDER_REGEX`

### Performance
- **Smart cache invalidation**: Only invalidates when items actually change
- **Keyword index**: `StepScanner.getDefinitionsByKeyword()` for O(1) lookup
- **LRU regex cache**: `FeatureScanner` limits cache to 500 entries
- **Completion cache**: `StepCompletionProvider` caches by version + keyword

### Maintainability
- **Unified regex patterns**: Single `DECORATOR_REGEXES_WITH_INDENT` source
- **Configuration constants**: `SCAN_BATCH_SIZE`, `FILE_WATCHER_DEBOUNCE_MS`, `REGEX_CACHE_MAX_SIZE`
- **Helper function**: `escapeRegex()` for consistent regex escaping
- **Unified DocString tracking**: Single `isLineInside()` implementation
- **Reduced coupling**: `findStepUsageLocations` moved to `stepLocationProvider.ts`

---

## File Statistics (Current)

| File | Lines | Purpose |
|------|-------|---------|
| `baseScanner.ts` | 332 | Scanner base class with smart caching |
| `utils.ts` | 296 | Utility functions + LRUCache + helper functions |
| `stepDefinitionProvider.ts` | 248 | Go to Definition with optional chaining |
| `stepCompletionProvider.ts` | 237 | Autocomplete with caching + nullish coalescing |
| `stepScanner.ts` | 202 | Python step scanning with keyword index |
| `featureScanner.ts` | 179 | Feature file scanning with LRU cache + keyword index |
| `stepMatcher.ts` | 173 | Pattern matching |
| `constants.ts` | 170 | Regex + config constants + Behave type patterns |
| `stepDiagnosticsProvider.ts` | 152 | Diagnostics with debouncing |
| `logger.ts` | 149 | Output channel logging |
| `types.ts` | 122 | Type definitions |
| `codeLensProvider.ts` | 107 | CodeLens provider with Disposable |
| `commandHandlers.ts` | 104 | Run/Debug handlers with escapeShellArg + validation |
| `extension.ts` | 98 | Entry point |
| `stepLocationProvider.ts` | 94 | Python → Feature navigation |
| `decoratorParser.ts` | 93 | Python decorator parsing |
| `services.ts` | 92 | Dependency injection container |
| `pythonUtils.ts` | 92 | Python interpreter detection |
| **Total** | **2940** | |
