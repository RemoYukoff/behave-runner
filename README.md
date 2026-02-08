# Behave Runner

A VS Code extension for running and navigating Behave (Python BDD) scenarios.

## Features

### Run & Debug Scenarios

Run or debug Behave scenarios directly from your `.feature` files using CodeLens.

- **Run Scenario**: Click the play button above any `Scenario` or `Scenario Outline`
- **Debug Scenario**: Click the bug button to start a debugging session
- **Run Feature**: Run all scenarios in a feature file

### Go to Step Definition

**Ctrl+Click** (Cmd+Click on Mac) on any step to navigate to its Python definition.

### Syntax Highlighting

Full syntax highlighting for `.feature` files.

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `behaveRunner.debug.justMyCode` | Only debug user code (skip library code) | `true` |

## Requirements

- Python with Behave installed (`pip install behave`)
