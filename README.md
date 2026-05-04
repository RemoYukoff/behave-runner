# Behave Runner

A VS Code extension for running, debugging, and navigating Behave (Python BDD) scenarios.

## Features

### Run & Debug Scenarios

Use the **Testing** view and the **gutter** next to `Feature:` / `Scenario:` lines in `.feature` files.

- **Left-click** the gutter icon → run with the selected **Run** profile (Behave in Test Results).
- **Right-click** the gutter icon → context menu with **Run**, **Debug**, **Reveal in Test Explorer**, etc.
- Expand tests in the Testing sidebar to run or debug a whole feature or a single scenario.
- **Test Results** output is grouped under each feature, scenario, and step (not a flat Behave log). Set `behaveRunner.run.showBehaveRawOutput` to `true` if you need the full Behave stream.

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
