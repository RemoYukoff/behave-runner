# Behave Runner

> Run and debug [Behave](https://behave.readthedocs.io/) scenarios in VS Code, jump between `.feature` files and Python steps, and get inline help while you write Gherkin.

[Install from the Marketplace](https://marketplace.visualstudio.com/items?itemName=remoyukoff.behave-runner) · [Source code](https://github.com/RemoYukoff/behave-runner)

## Features

- **Run & debug** — **Run** and **Debug** links appear above `Feature`, `Scenario`, and outline rows in `.feature` files.
- **Live run** — Open the bottom **Behave** panel → **Live run** to follow progress; full log text is under **Output → Behave Runner**.
- **Go to step code** — From a feature step, use **Go to Definition** (e.g. **Cmd+click** / **Ctrl+click**) to open the Python step.
- **Find usages** — From the Python step function, use **Go to Definition** or **Find All References** to see matching feature lines.
- **Autocomplete** — After `Given`, `When`, `Then`, `And`, `But`, and `*`, suggestions match your step definitions.
- **Missing steps** — Steps without a definition are highlighted so you can fix them quickly.
- **Look & format** — Clearer colors for keywords, tags, tables, and placeholders; **Format Document** cleans up `.feature` files.

Open the **Command Palette** and search **Behave** to cancel a run, rerun the last run, or focus the live view.

## Before you start

1. Install Behave in the Python environment you use for the project: `pip install behave`.
2. Choose that interpreter in VS Code (the [Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python) extension helps).
3. Open a **folder** that contains at least one `.feature` file so the extension activates.

## Configuration

In **Settings**, search **Behave Runner**, or edit `settings.json` directly.

| Setting | What it does | Default |
| :--- | :--- | :--- |
| `behaveRunner.debug.justMyCode` | When debugging, stay in your code and skip library internals | `true` |
| `behaveRunner.stepDefinitions.patterns` | Glob patterns for Python files that define steps | `**/steps/**/*.py`, `**/*_steps.py`, `**/step_*.py`, `**/steps.py` |
| `behaveRunner.featureFiles.patterns` | Glob patterns for Gherkin feature files | `**/*.feature` |

## Troubleshooting

- Restart VS Code if navigation or suggestions stop responding.
- If runs fail, confirm the selected Python environment has Behave installed.

*MIT License*
