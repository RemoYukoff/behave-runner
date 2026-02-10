# Architecture Notes

This document contains architectural decisions, design rationale, and notes for future code reviews.

## Table of Contents

- [Design Decisions](#design-decisions)
- [Known Trade-offs](#known-trade-offs)
- [Review Notes (Feb 2026)](#review-notes-feb-2026)

---

## Design Decisions

### Service Registry Pattern (`services.ts`)

The extension uses a simple service registry instead of a full DI container. This provides:

- **Testability**: Services can be mocked by replacing the registry during tests
- **Singleton management**: Ensures single instances of scanners across the extension
- **Lifecycle control**: Clean initialization and disposal

**Why not a DI library?** VS Code extensions benefit from minimal dependencies. The service registry is ~50 lines and sufficient for our needs.

### Logger as Singleton vs Service

Currently, the logger is a singleton (`export const logger = new Logger()`), while scanners use the service registry. This inconsistency was considered acceptable because:

1. Logger is truly stateless after initialization
2. Adding it to the registry would add boilerplate without clear testing benefits
3. Most tests can spy on logger methods directly

**Future consideration**: If testing becomes problematic, migrate logger to the service registry.

### LRU Cache for Regex and Debounce Functions

The `FeatureScanner` uses an LRU cache for compiled regex patterns. While `behavePatternToRegex()` is fast, the cache provides:

1. Consistent O(1) lookup for repeated patterns
2. Memory bounds via max size limit
3. Automatic cleanup of least-used patterns

**Note**: Benchmarking showed negligible performance difference for small projects (<100 patterns). The cache remains for consistency and future-proofing larger projects.

### Keyword Resolution Duplication

The logic for resolving "effective keywords" (And/But → Given/When/Then) appears in multiple places:

- `stepMatcher.ts`: `parseStepLine()` and `resolveEffectiveKeyword()`
- `featureScanner.ts`: in `parseFileContent()`
- `stepCompletionProvider.ts`: in `provideCompletionItems()`
- `stepDiagnosticsProvider.ts`: in `updateDiagnostics()`

This duplication exists because each context has slightly different needs:

1. `featureScanner` maintains state across an entire file scan
2. `resolveEffectiveKeyword` scans backwards from a single line (for on-demand lookups)
3. Providers may need immediate resolution without full file context

**Future consideration**: Create a `KeywordResolver` class that encapsulates state and can be used in all contexts. This would reduce duplication but add complexity.

---

## Known Trade-offs

### File Watcher Pattern Matching

The `BaseScanner` uses broad file watchers (`**/*.py`, `**/*.feature`) and then filters by configured patterns using `minimatch`. This is because VS Code's `createFileSystemWatcher` doesn't support multiple patterns efficiently.

**Trade-off**: More events fired than necessary, but filtering is fast and keeps code simple.

### Batch Scanning

Files are scanned in sequential batches (`SCAN_BATCH_SIZE = 10`). True parallel scanning could be faster but:

1. File system I/O is often the bottleneck, not CPU
2. Too many concurrent reads can slow down the system
3. Sequential batches provide predictable memory usage

**Future consideration**: Use `p-limit` or similar for controlled parallelism if performance becomes an issue with very large projects.

### CancellationToken Usage

CancellationTokens are checked at method entry points but not inside loops or during scanning. This is intentional:

1. Most operations complete in <100ms
2. Adding checks inside loops adds overhead
3. VS Code is generally tolerant of slightly delayed cancellation

---

## Review Notes (Feb 2026)

The following items were analyzed and either fixed or documented:

### Fixed Issues

1. **Mutation of cached items in `StepCompletionProvider`** - Now clones items before modifying `range` property to prevent race conditions with concurrent completion requests.

2. **Race condition in `BaseScanner.rescan()`** - Changed from recursive calls to a do-while loop that resets `rescanPending` before scanning, eliminating the window for race conditions.

3. **CancellationToken support** - Added early-exit checks in `BehaveDefinitionProvider`, `BehaveStepLocationProvider`, and `StepCompletionProvider`.

4. **Validation in command handlers** - Added `validateRunScenarioArgs()` that validates all required fields including `workspaceRoot`.

5. **Log level for scan failures** - Changed from `debug` to `warn` to make issues visible during development.

6. **Unbounded debounce map** - Replaced `Map` with `LRUCache` in `StepDiagnosticsProvider` to prevent memory growth.

7. **Global regex state** - Replaced `BEHAVE_PLACEHOLDER_REGEX_GLOBAL` with `createPlaceholderRegex()` factory to avoid `lastIndex` state bugs.

### Items Kept As-Is

1. **Logger singleton** - Kept as singleton (see [Logger as Singleton vs Service](#logger-as-singleton-vs-service)).

2. **Keyword resolution duplication** - Kept separate implementations (see [Keyword Resolution Duplication](#keyword-resolution-duplication)).

3. **Regex cache in FeatureScanner** - Kept despite minimal performance impact for consistency.

4. **No interfaces for providers** - The VS Code provider interfaces are sufficient. Custom interfaces would add boilerplate without clear benefits since we don't mock these in tests.

### Potential Future Improvements

1. **Parallel batch scanning** with controlled concurrency
2. **Unified `KeywordResolver` class** to reduce code duplication
3. **Integration tests** for end-to-end provider testing
4. **Telemetry/metrics** for performance monitoring in production

---

## Review Notes (Feb 2026 - Second Pass)

Additional improvements implemented during code review:

### Fixed Issues

1. **LRU cache for `BehaveDefinitionProvider` line cache** - The per-file line cache now uses `LRUCache` with a max size of 100 entries per file (`DEFINITION_LINE_CACHE_MAX_SIZE`). This prevents unbounded memory growth when navigating large feature files. Previously mitigated by document close cleanup, now also bounded per-file.

2. **Periodic abort checks in `updateDiagnostics`** - Added early exit checks every 50 lines (`DIAGNOSTICS_ABORT_CHECK_INTERVAL`) that abort processing if the document changed or closed during diagnostics computation. This improves responsiveness when rapidly switching between documents.

3. **Centralized path normalization** - Added `normalizePath()` function in `utils.ts` for cross-platform path comparison. Replaces inline `replace(/\\/g, "/")` calls for consistency.

### Analysis Results (No Changes Needed)

1. **DocStringTracker.isLineInside() off-by-one** - Analyzed and confirmed correct. The function checks if the target line is *inside* a docstring block, not if it *is* a delimiter. The `limit = Math.min(targetLine, lineCount)` correctly excludes the target line from processing.

2. **StepCompletionProvider cache multi-workspace paths** - The completion item `documentation` property uses the document's workspace for relative paths. In multi-workspace scenarios, paths may be relative to the wrong root. Impact is cosmetic (only affects documentation display), so left as-is.

---

## Review Notes (Feb 2026 - Third Pass)

Additional architecture improvements implemented:

### Fixed Issues

1. **Memory leak in `BehaveDefinitionProvider.cache`** - The outer file cache (`Map<string, FileCache>`) was unbounded and could grow indefinitely. Now uses `LRUCache` with `DEFINITION_FILE_CACHE_MAX_SIZE = 50` to limit the number of cached files, preventing memory leaks when navigating many feature files.

2. **`LogLevel` not exported** - The `LogLevel` enum was private, making `logger.setMinLevel()` unusable from external code. Now exported for external configuration.

3. **Duplicate file watcher for diagnostics refresh** - Extension.ts created a separate `FileSystemWatcher` for Python files to refresh diagnostics, duplicating the watcher already in `StepScanner`. Replaced with `StepScanner.onDidChange` event subscription, eliminating redundant file system monitoring.

4. **CancellationToken in `BehaveCodeLensProvider`** - Added `CancellationToken` parameter and periodic cancellation checks (every 100 lines) for consistency with other providers.

### Design Improvements

1. **Event-driven scanner notifications** - Added `onDidChange` event to `IStepScanner` interface and implemented in `StepScanner`. This allows consumers to subscribe to definition changes without creating duplicate file watchers. The event fires after `onItemsChanged()` updates the version and invalidates caches.

### Items Analyzed (No Changes Needed)

1. **Naming inconsistency (`Behave*` vs `Step*` providers)** - Some providers use `Behave` prefix, others use `Step`. Left as-is since renaming would be disruptive for minimal benefit.

2. **`BehaveStepLocationProvider` without cache** - Unlike `BehaveDefinitionProvider`, this provider doesn't cache results. Left as-is since "Find References" is invoked less frequently than "Go to Definition".

---

## Review Notes (Feb 2026 - Fourth Pass)

Additional robustness improvements implemented:

### Fixed Issues

1. **`LRUCache.get` ambiguous undefined handling** - The `get()` method now uses `has()` to properly distinguish between "key not found" and "value is undefined". Previously, storing `undefined` as a value would not update LRU order.

2. **`StepScanner` error logging without details** - The catch block in `parseFileContent()` now includes the original error in the log message for easier debugging of invalid patterns.

3. **`FeatureScanner` incorrect type in `keywordIndex`** - Changed type from `Map<StepKeyword | "null", ...>` to `Map<StepKeyword, ...>` since `buildKeywordIndex()` never stores null keys.

4. **Path normalization inconsistency in `BehaveDefinitionProvider`** - Added `normalizePath()` calls in `getCachedEntry()`, `setCachedEntry()`, and `clearCacheForFile()` to prevent duplicate cache entries on Windows where paths may use different separators.

5. **`debounce` function without cleanup** - Added `cancel()` method to debounced functions. The `debouncedRefreshDiagnostics` in `extension.ts` now cancels pending calls on deactivation via subscriptions.

6. **`BaseScanner.scanFile` unbounded recursion** - Added `MAX_RESCAN_RETRIES` constant (default: 3) to limit recursion when a file is modified continuously during scanning. Logs a warning when the limit is reached.

7. **`StepDiagnosticsProvider.updateDiagnostics` stale diagnostics** - Added final version check before setting diagnostics to ensure the document hasn't changed or closed during processing.

---

## Review Notes (Feb 2026 - Fifth Pass)

Additional fixes for memory leaks and improved path resolution:

### Fixed Issues

1. **Memory leak in `StepDiagnosticsProvider` debounced functions** - When entries were evicted from the `debouncedUpdates` LRU cache, the debounced functions' pending timers were not cancelled. Added `onEvict` callback to `LRUCache` that cancels evicted debounced functions, preventing orphaned timers and memory leaks.

2. **Relative interpreter path not resolved in `pythonUtils`** - The `resolveInterpreterPath` function only checked absolute paths and predefined venv locations. If `python.defaultInterpreterPath` was set to a relative path like `./custom-env/bin/python`, it was not resolved against the workspace root. Now checks relative paths before falling back to venv candidates.

3. **`DecoratorInfo` interface not exported** - The interface was defined locally in `decoratorParser.ts`, limiting type safety for consumers. Moved to `types.ts` and exported for external use.
