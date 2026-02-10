# Analysis Prompt for Behave Runner

Use this prompt when starting a new analysis session with a fresh context.

---

## Prompt Principal (Recomendado)

```
Analiza @ARCHITECTURE.md y el código de Behave Runner.

Busca:
- Código duplicado
- Bugs potenciales
- Mejoras de rendimiento
- Problemas de mantenibilidad

No quiero nuevos features. Empieza leyendo @ARCHITECTURE.md para contexto.

Repite el flujo de análisis e implementación hasta que no tengas nada que mejorar.
Tienes herramientas de análisis estático disponibles (eslint, knip, jscpd).
Si necesitas librerías que mejoren el código, puedes proponerlas.

Implementa todo y una vez termines actualiza @ANALYSIS_PROMPT.md y @ARCHITECTURE.md
```

---

## Prompt Extendido (Con instrucciones detalladas)

```
Analiza mi proyecto "Behave Runner" - una extensión de VS Code para desarrollo BDD con Python/Behave.

## Contexto

Lee primero @ARCHITECTURE.md para entender la arquitectura, patrones y optimizaciones existentes.

## Herramientas Disponibles

Tienes estas herramientas de análisis estático instaladas:
- **ESLint**: `npm run lint` (TypeScript rules estrictas)
- **knip**: `npx knip` (código muerto, exports no usados)
- **jscpd**: `npx jscpd src` (código duplicado)
- **TypeScript**: `npx tsc --noEmit` (verificación de tipos)

## Objetivo

Busca y corrige:
1. Código duplicado o simplificable
2. Bugs potenciales (race conditions, memory leaks, promesas sin manejar)
3. Mejoras de rendimiento (caching, índices, evitar operaciones costosas)
4. Problemas de mantenibilidad (código moderno con ??, ?., ??=)

## Restricciones

- NO nuevos features, solo mejorar código existente
- La extensión debe seguir funcionando igual
- Actualiza documentación al terminar

## Proceso

1. Lee @ARCHITECTURE.md para contexto
2. Ejecuta herramientas de análisis (eslint, knip, jscpd)
3. Revisa código fuente manualmente
4. Implementa correcciones
5. Verifica con `npm run lint && npx tsc --noEmit`
6. Repite hasta que no queden mejoras
7. Actualiza @ANALYSIS_PROMPT.md y @ARCHITECTURE.md
```

---

## Prompts Específicos

### Solo Verificación (Sin cambios)

```
Verifica el estado del código de Behave Runner sin hacer cambios.
Ejecuta: npm run lint, npx knip, npx tsc --noEmit
Reporta si hay algún problema pendiente.
```

### Solo Performance

```
Analiza el rendimiento de Behave Runner.
Lee @ARCHITECTURE.md para ver las optimizaciones existentes.
Busca: oportunidades de caching, hot paths, operaciones costosas.
```

### Solo Bugs

```
Busca posibles bugs en Behave Runner.
Lee @ARCHITECTURE.md para entender los edge cases conocidos.
Busca: race conditions, memory leaks, promesas sin manejar.
```

---

## Estado Actual del Proyecto

- **ESLint**: 0 errores, 0 warnings
- **TypeScript**: Compila sin errores (strict mode)
- **jscpd**: Sin código duplicado
- **knip**: Solo warnings de configuración (intencionales)
- **npm audit**: 0 vulnerabilidades

---

## After Analysis

Al completar el análisis, actualiza:
1. `ARCHITECTURE.md` - Sección "Recent Improvements" con nueva versión
2. `ANALYSIS_PROMPT.md` - Sección "Previous Analysis Results" con nueva session

---

## Previous Analysis Results

### Session 6 (2026-02-09) - Code Deduplication & Helper Extraction

#### Duplicate Code Fixed (via jscpd analysis)
| Issue | Solution | File(s) |
|-------|----------|---------|
| `ensureKeywordIndex()` duplicated in both scanners | Extracted `buildKeywordIndex()` helper in utils.ts | `utils.ts`, `stepScanner.ts`, `featureScanner.ts` |
| `areItemsEqual()` boilerplate duplicated | Extracted `arraysEqual()` helper in utils.ts | `utils.ts`, `stepScanner.ts`, `featureScanner.ts`, `baseScanner.ts` |

#### Code Quality Improvements
| Issue | Solution | File(s) |
|-------|----------|---------|
| Unnecessary type assertion `as StepKeyword \| null` | Removed redundant cast | `stepDefinitionProvider.ts` |
| Unused import `StepKeyword` | Removed after type assertion cleanup | `stepDefinitionProvider.ts` |

#### Build System Improvements
| Issue | Solution | File(s) |
|-------|----------|---------|
| `jscpd` listed as unused by knip | Added `duplicates` npm script | `package.json` |
| `knip` not in npm scripts | Added `unused` npm script | `package.json` |
| `ovsx` binary flagged as unlisted | Added knip config to ignore CI binary | `package.json` |

#### jscpd Results
- **Before**: 4 clones (38 lines, 1.3%)
- **After**: 1 clone (12 lines, 0.41%) - remaining clone is a valid pattern (two interface methods delegating to same implementation)

---

### Session 5 (2026-02-09) - ESLint Integration & Code Quality

#### Tools Added
- **ESLint** with `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`
- Added `lint` and `lint:fix` npm scripts

#### Bugs Fixed
| Issue | Solution | File |
|-------|----------|------|
| Floating promise in `setupConfigListener` | Added `void` operator to explicitly ignore fire-and-forget promise | `baseScanner.ts` |

#### Code Quality Improvements (via ESLint)
| Issue | Solution | File(s) |
|-------|----------|---------|
| Using `\|\|` instead of `??` for nullish values | Replaced with nullish coalescing operator | `stepScanner.ts`, `featureScanner.ts` |
| Using `&&` checks instead of optional chain | Replaced with `?.` operator | `stepDefinitionProvider.ts` |
| Assignment with null check instead of `??=` | Used nullish assignment operator | `baseScanner.ts`, `logger.ts`, `commandHandlers.ts` |
| Console statement without disable comment | Added `eslint-disable-next-line` for intentional dev console | `logger.ts` |

#### Dead Code Removed
| Issue | Solution | File |
|-------|----------|------|
| `isLineInsideDocString` method never used | Removed unused static method | `utils.ts` |

#### Maintainability Improvements
| Issue | Solution | File |
|-------|----------|------|
| Using `\|\|` instead of `??` for empty string | Replaced with `?? ""` for consistency | `stepCompletionProvider.ts` |

---

### Session 4 (2026-02-09) - Bug Fixes, Performance & Maintainability

#### Bugs Fixed
| Issue | Solution | File |
|-------|----------|------|
| `stepDiagnosticsProvider` range includes trailing whitespace | Use `trimEnd()` on line length calculation | `stepDiagnosticsProvider.ts` |
| `codeLensProvider` EventEmitter never disposed (memory leak) | Added `Disposable` interface and `dispose()` method, registered in subscriptions | `codeLensProvider.ts`, `extension.ts` |
| `runScenarioHandler` missing validation for `scenarioName` | Added validation when `runAll=false` (matches `debugScenarioHandler`) | `commandHandlers.ts` |

#### Performance Improvements
| Issue | Solution | File |
|-------|----------|------|
| `FeatureScanner.findMatchingSteps` filters all steps for keyword | Added keyword index for O(1) lookup (like `StepScanner`) | `featureScanner.ts` |

#### Maintainability Improvements
| Issue | Solution | File |
|-------|----------|------|
| `BEHAVE_TYPE_PATTERNS` defined locally in `stepMatcher.ts` | Moved to `constants.ts` with `DEFAULT_PLACEHOLDER_PATTERN` and `OUTLINE_PLACEHOLDER_PATTERN` | `constants.ts`, `stepMatcher.ts` |

---

### Session 3 (2026-02-09) - Bug Fixes, Security & Dead Code Removal

#### Bugs Fixed
| Issue | Solution | File |
|-------|----------|------|
| `getStepTextRange` wrong startChar with multiple spaces | Use `keywordMatch[0].length` instead of manual calculation | `stepDefinitionProvider.ts` |
| `resolveEffectiveKeyword` no negative line check | Added `targetLine < 0` validation | `stepMatcher.ts` |
| Command injection vulnerability | Added `escapeShellArg()` to escape `\`, `"`, `$`, backticks | `commandHandlers.ts` |

#### Performance Improvements
| Issue | Solution | File |
|-------|----------|------|
| `StepCompletionProvider` clones all items even without filter | Set range directly on cached items when no filter needed | `stepCompletionProvider.ts` |

#### Dead Code Removed (via knip analysis)
| Issue | Solution | File |
|-------|----------|------|
| `DECORATOR_REGEX_*` exported individually | Inlined into `DECORATOR_REGEXES_WITH_INDENT` array | `constants.ts` |
| `BEHAVE_PLACEHOLDER_REGEX` unused | Removed, only `_GLOBAL` version needed | `constants.ts` |
| `extractDecoratorInfo` exported | Made private (only used internally) | `decoratorParser.ts` |
| `resolveInterpreterPath` exported | Made private (only used internally) | `pythonUtils.ts` |
| `getServices`, `isInitialized` exported | Made private / removed | `services.ts` |
| `StepInfo` interface exported | Removed (unused) | `types.ts` |
| `DecoratorInfo` interface exported | Made private | `decoratorParser.ts` |
| `LogLevel` enum exported | Made private | `logger.ts` |
| `Services` interface exported | Made private | `services.ts` |

#### Duplicate Code Fixed (via jscpd analysis)
| Issue | Solution | File |
|-------|----------|------|
| `onDidCreate`/`onDidChange` identical handlers | Extracted shared `handleFileChange` function | `baseScanner.ts` |
| Constructor duplicates `refreshAll()` logic | Call `refreshAll()` instead of duplicating | `stepDiagnosticsProvider.ts` |

#### Maintainability Improvements
| Issue | Solution | File |
|-------|----------|------|
| `PLACEHOLDER_REGEX_GLOBAL` defined in 2 files | Centralized to `BEHAVE_PLACEHOLDER_REGEX_GLOBAL` in constants.ts | `constants.ts`, `stepMatcher.ts`, `stepCompletionProvider.ts` |

#### Tools Added
- **knip** - Detect unused exports, types, and dependencies
- **jscpd** - Detect copy-paste code

---

### Session 2 (2026-02-09) - Code Quality Improvements

#### Bugs Fixed
| Issue | Solution | File |
|-------|----------|------|
| Double version increment in `rescan()` | Removed duplicate `version++` (already done in `onItemsChanged`) | `stepScanner.ts` |
| No debounce on document changes | Added per-document debounced updates with `DIAGNOSTICS_DEBOUNCE_MS` | `stepDiagnosticsProvider.ts` |
| Error in `findMatchingSteps` with invalid patterns | Added try/catch with logging | `featureScanner.ts` |
| `JSON.stringify` with RegExp (broken serialization) | Implemented custom `areItemsEqual()` in subclasses | `stepScanner.ts`, `featureScanner.ts` |

#### Performance Improvements
| Issue | Solution | File |
|-------|----------|------|
| Regex recreated on each `behavePatternToRegex` call | Cached global regex at module level | `stepMatcher.ts` |
| Duplicate `filterByKeyword` function | Removed, now uses `getDefinitionsByKeyword()` directly | `stepCompletionProvider.ts` |
| CompletionItem cloned with repeated code | Extracted `cloneCompletionItemWithRange()` helper | `stepCompletionProvider.ts` |

#### Maintainability Improvements
| Issue | Solution | File |
|-------|----------|------|
| Magic number `5` for padStart | Added `SORT_TEXT_PAD_LENGTH` constant | `constants.ts` |
| LRUCache not reusable | Moved to `utils.ts` as generic `LRUCache<K, V>` | `utils.ts`, `featureScanner.ts` |
| startChar calculation duplicated | Extracted `getStepTextStartPosition()` helper | `utils.ts`, multiple providers |
| Missing `DIAGNOSTICS_DEBOUNCE_MS` | Added constant for diagnostics debounce | `constants.ts` |

---

### Session 1 (2026-02-09) - Initial Architecture Improvements

#### Bugs Fixed
| Issue | Solution | File |
|-------|----------|------|
| Race condition in scanFile | Added `pendingRescan` Set to queue re-scans | `baseScanner.ts` |
| Configuration rescan without await | Added `isRescanning` and `rescanPending` flags | `baseScanner.ts` |
| matchesPatterns incorrect shortcut | Removed shortcut that bypassed pattern check | `baseScanner.ts` |
| BEHAVE_PLACEHOLDER_REGEX global flag | Removed `g` flag, create locally when needed | `constants.ts` |

#### Performance Improvements
| Issue | Solution | File |
|-------|----------|------|
| flatCache invalidated unnecessarily | Added `areItemsEqual()` comparison | `baseScanner.ts` |
| findMatchingDefinitions O(n) | Added keyword index with `getDefinitionsByKeyword()` | `stepScanner.ts` |
| regexCache unbounded | Implemented LRU cache with `REGEX_CACHE_MAX_SIZE` | `featureScanner.ts` |
| StepCompletionProvider no cache | Added cache by scanner version + keyword | `stepCompletionProvider.ts` |

#### Maintainability Improvements
| Issue | Solution | File |
|-------|----------|------|
| Duplicate decorator regex patterns | Unified to single `DECORATOR_REGEXES_WITH_INDENT` | `constants.ts`, `decoratorParser.ts` |
| Magic numbers | Added config constants: `SCAN_BATCH_SIZE`, etc. | `constants.ts` |
| Inconsistent regex escaping | Added `escapeRegex()` helper | `utils.ts` |
| Duplicate DocString tracking | Unified via `DocStringTracker.isLineInside()` | `utils.ts` |
| Coupling in decoratorParser | Moved `findStepUsageLocations` to `stepLocationProvider.ts` | Multiple |

---

### Verification

All changes verified with:
- No linter errors
- TypeScript compilation successful
- Architecture documentation updated
