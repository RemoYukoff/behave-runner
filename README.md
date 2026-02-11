# Behave Runner

A VS Code extension for running, debugging, and navigating Behave (Python BDD) scenarios.

## Features

### Run & Debug Scenarios

Run or debug Behave scenarios directly from your `.feature` files using CodeLens.

- **Run Scenario**: Click the play button above any `Scenario` or `Scenario Outline`
- **Debug Scenario**: Click the bug button to start a debugging session
- **Run Feature**: Run all scenarios in a feature file

### Go to Step Definition

**Ctrl+Click** (Cmd+Click on Mac) on any step in a `.feature` file to navigate to its Python definition.

Supports all Behave patterns:
- Typed placeholders: `{name:d}`, `{value:f}`, `{word:w}`
- Untyped placeholders: `{name}`
- Scenario Outline placeholders: `<variable>`

### Find Step Usages

**Ctrl+Click** (Cmd+Click on Mac) on a step function in Python to see all `.feature` files where that step is used. This works on any function decorated with `@given`, `@when`, `@then`, or `@step`.

### Step Autocomplete

Start typing a step after `Given`, `When`, `Then`, `And`, or `But` and get autocomplete suggestions based on your existing Python step definitions.

- Filters suggestions by keyword (`Given` shows `@given` + `@step` definitions)
- Converts Behave placeholders to VS Code snippets for easy tab completion
- Resolves `And`/`But` to their parent keyword for accurate filtering

### Undefined Step Diagnostics

Get real-time warnings for steps in `.feature` files that don't have a matching Python definition. Undefined steps are highlighted with a yellow underline.

### Document Formatting

Format your `.feature` files with proper Gherkin indentation and table alignment.

- **Format Document**: Use `Shift+Alt+F` (or `Shift+Option+F` on Mac) to format the entire file
- **Format Selection**: Select a range and format just that section
- Proper indentation for `Feature`, `Scenario`, steps, and tables
- Automatic table column alignment
- Tag and doc string formatting
- Supports `Rule` keyword with nested indentation

### Syntax Highlighting

Full syntax highlighting for `.feature` files including keywords, strings, comments, tags, and data tables.

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `behaveRunner.debug.justMyCode` | Only debug user code (skip library code) | `true` |
| `behaveRunner.stepDefinitions.patterns` | Glob patterns for Python step definition files | `["**/steps/**/*.py", "**/*_steps.py", "**/step_*.py", "**/steps.py"]` |
| `behaveRunner.featureFiles.patterns` | Glob patterns for Gherkin feature files | `["**/*.feature"]` |

## Requirements

- Python with Behave installed (`pip install behave`)
