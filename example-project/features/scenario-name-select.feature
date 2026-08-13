Feature: Scenario name select test cases
  Manual test cases for Behave Runner **Run** / **Debug** on a single scenario.
  Behave `-n` treats the name as a regular expression; titles with regex
  metacharacters (e.g. `+`, `.`, `()`) must still run when using CodeLens Run.

  # =========================================================================
  # Regex metacharacters in scenario titles (Behave -n / --name)
  # =========================================================================

  Scenario: Run A+ tier checkout
    Given the scenario name select demo is ready
    When I mark scenario "Run A+ tier checkout" as executed
    Then the scenario name select demo finished

  Scenario: Price check (100% off)
    Given the scenario name select demo is ready
    When I mark scenario "Price check (100% off)" as executed
    Then the scenario name select demo finished

  Scenario: File config.json v2.0
    Given the scenario name select demo is ready
    When I mark scenario "File config.json v2.0" as executed
    Then the scenario name select demo finished
