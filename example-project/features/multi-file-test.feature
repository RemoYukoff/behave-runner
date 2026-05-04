Feature: Multi-File Step Reference Test
  This feature file tests that Find Step References works across multiple files.
  All steps here should also be found when Ctrl+Click on the step function in steps.py.

  # =========================================================================
  # Reuse integer steps from sample.feature
  # =========================================================================

  Scenario: Reused integer steps
    Given the first number is 100
    When I add 50
    Then the result is 150

  Scenario Outline: Reused integer steps in outline
    Given the first number is <start>
    When I add <increment>
    Then the result is <total>

    Examples:
      | start | increment | total |
      | 20    | 30        | 50    |
      | 1000  | 1         | 1001  |

  # =========================================================================
  # Reuse float steps
  # =========================================================================

  Scenario: Reused float steps
    Given the price is 200.00
    When I apply a discount of 25.0 percent
    Then the final price is 150.0

  # =========================================================================
  # Reuse word steps
  # =========================================================================

  Scenario: Reused word steps
    Given a user named Maria
    When the user changes their name to Carlos
    Then the user name is Carlos

  # =========================================================================
  # Reuse @step decorator steps
  # =========================================================================

  Scenario: Reused step decorator
    Given the system is ready
    When I wait for 2 seconds
    Then the system is ready

  # =========================================================================
  # Reuse steps with And/But (tests keyword resolution across files)
  # =========================================================================

  Scenario: And/But with reused steps
    Given the first number is 7
    And the price is 99.99
    And a user named MultiFileUser
    When I add 3
    And I wait for 1 seconds
    Then the result is 10
    And the user name is MultiFileUser
    But the system is ready

  # =========================================================================
  # Reuse multiple placeholder steps
  # =========================================================================

  Scenario: Reused multiple placeholder steps
    Given a rectangle with width 12 and height 8
    When I calculate the area
    Then the area is 96

  # =========================================================================
  # Reuse quoted string steps
  # =========================================================================

  Scenario: Reused quoted string steps (double quotes)
    Given the message is "Multi-file test message"
    Then the output shows "Multi-file test message"

  Scenario: Reused quoted string steps (single quotes)
    Given the message is 'Another multi-file test'
    Then the output shows 'Another multi-file test'

  # =========================================================================
  # Reuse steps with special characters
  # =========================================================================

  Scenario: Reused special character steps
    Given a file named config.json exists
    When I search for pattern \{.*\}
    Then the result contains 42 matches

  # =========================================================================
  # Unique scenarios for this file (to test file isolation)
  # =========================================================================

  Scenario: Additional test case
    Given the first number is 999
    When I add 1
    Then the result is 1000
