Feature: Go to Definition Test Cases
  Test cases to verify Go to Definition works correctly
  for all Behave step patterns and scenarios.

  # =========================================================================
  # Basic steps with integer type (:d)
  # =========================================================================

  Scenario: Basic integer steps
    Given the first number is 1
    When I add 2
    Then the result is 3

  Scenario: Add zero
    Given the first number is 5
    When I add 0
    Then the result is 5

  # =========================================================================
  # Scenario Outline with placeholders
  # =========================================================================

  Scenario Outline: Scenario Outline with integer placeholders
    Given the first number is <a>
    When I add <b>
    Then the result is <sum>

    Examples:
      | a | b | sum |
      | 1 | 2 | 3   |
      | 4 | 5 | 9   |

  # =========================================================================
  # Float type (:f)
  # =========================================================================

  Scenario: Float steps
    Given the price is 100.00
    When I apply a discount of 20.0 percent
    Then the final price is 80.0

  Scenario Outline: Scenario Outline with float placeholders
    Given the price is <price>
    When I apply a discount of <discount> percent
    Then the final price is <final>

    Examples:
      | price  | discount | final |
      | 100.00 | 10.0     | 90.0  |
      | 50.00  | 50.0     | 25.0  |

  # =========================================================================
  # Word type (:w)
  # =========================================================================

  Scenario: Word steps
    Given a user named John
    When the user changes their name to Jane
    Then the user name is Jane

  Scenario Outline: Scenario Outline with word placeholders
    Given a user named <original>
    When the user changes their name to <new>
    Then the user name is <new>

    Examples:
      | original | new   |
      | Alice    | Bob   |
      | Charlie  | David |

  # =========================================================================
  # Untyped placeholders (matches any string)
  # =========================================================================

  Scenario: Untyped placeholder steps
    Given a product called Super Widget
    When I set the description to A great product for everyone
    Then the product description is A great product for everyone

  Scenario Outline: Scenario Outline with untyped placeholders
    Given a product called <name>
    When I set the description to <desc>
    Then the product description is <desc>

    Examples:
      | name   | desc             |
      | Widget | A useful item    |
      | Gadget | High tech device |

  # =========================================================================
  # @step decorator (works with Given/When/Then)
  # =========================================================================

  Scenario: Step decorator with Given
    Given the system is ready
    And I wait for 1 seconds
    Then the result is 0

  Scenario: Step decorator with When
    Given the first number is 5
    When I wait for 1 seconds
    Then the result is 0

  Scenario: Step decorator with Then
    Given the first number is 5
    When I add 5
    Then the system is ready

  # =========================================================================
  # And/But keyword inheritance
  # =========================================================================

  Scenario: And inherits Given keyword
    Given the first number is 10
    And the price is 50.00
    When I add 5
    Then the result is 15

  Scenario: And inherits When keyword
    Given the first number is 10
    When I add 5
    And I wait for 1 seconds
    Then the result is 15

  Scenario: And inherits Then keyword
    Given the first number is 10
    When I add 5
    Then the result is 15
    And the system is ready

  Scenario: But keyword inheritance
    Given the first number is 10
    But the price is 25.00
    When I add 5
    But I wait for 1 seconds
    Then the result is 15

  Scenario: Multiple And/But in sequence
    Given the first number is 1
    And the price is 100.00
    And a user named TestUser
    When I add 2
    And I wait for 1 seconds
    Then the result is 3
    And the user name is TestUser
    But the system is ready

  # =========================================================================
  # Multiple placeholders in one step
  # =========================================================================

  Scenario: Multiple placeholders
    Given a rectangle with width 5 and height 10
    When I calculate the area
    Then the area is 50

  Scenario Outline: Scenario Outline with multiple placeholders
    Given a rectangle with width <w> and height <h>
    When I calculate the area
    Then the area is <area>

    Examples:
      | w | h | area |
      | 3 | 4 | 12   |
      | 7 | 8 | 56   |

  # =========================================================================
  # Steps with special characters (regex escaping)
  # =========================================================================

  Scenario: Steps with special characters
    Given a file named test.txt exists
    When I search for pattern .*\.py
    Then the result contains 5 matches

  Scenario Outline: Scenario Outline with special characters
    Given a file named <file> exists
    When I search for pattern <pattern>
    Then the result contains <count> matches

    Examples:
      | file     | pattern | count |
      | data.csv | ^header | 1     |
      | log.txt  | ERROR.* | 10    |

  # =========================================================================
  # Steps with quoted strings (double quotes)
  # =========================================================================

  Scenario: Quoted string steps with double quotes
    Given the message is "Hello, World!"
    Then the output shows "Hello, World!"

  # =========================================================================
  # Steps with quoted strings (single quotes)
  # =========================================================================

  Scenario: Quoted string steps with single quotes
    Given the message is 'Hello, World!'
    Then the output shows 'Hello, World!'

  # =========================================================================
  # Steps with multiple definitions (both quote styles)
  # Ctrl+Click should show both matching definitions
  # =========================================================================

  Scenario: Multiple definitions with double quotes
    Given the value is "test123"
    Then the value equals "test123"

  Scenario: Multiple definitions with single quotes
    Given the value is 'test456'
    Then the value equals 'test456'

  # =========================================================================
  # Star (*) keyword - acts like And/But, inherits parent keyword
  # =========================================================================

  Scenario: Star keyword inherits Given
    Given the first number is 5
    * the price is 100.00
    When I add 3
    Then the result is 8

  Scenario: Star keyword inherits When
    Given the first number is 10
    When I add 5
    * I wait for 1 seconds
    Then the result is 15

  Scenario: Star keyword inherits Then
    Given the first number is 10
    When I add 5
    Then the result is 15
    * the system is ready

  # =========================================================================
  # Doc Strings (triple quoted text blocks)
  # =========================================================================

  Scenario: Scenario with description
    This is a scenario description.
    It can span multiple lines and is used to provide
    additional context about what the scenario tests.

    Given the first number is 1
    When I add 2
    Then the result is 3

  Scenario: Step with doc string using triple double quotes
    Given a sample text loaded into the system
    """
      This is a multi-line text block.
      It can contain "quotes" and special characters.
      Used for passing large text to steps.
    """
    Then the system processes the text

  Scenario: Step with doc string containing code
    Given a sample text loaded into the system
    """
      def hello():
          print("Hello, World!")
      
      hello()
    """
    Then the system processes the text

  Scenario: Step with doc string containing code
    Given a sample text loaded into the system
    """json
      {
        "name": "test",
        "value": 123,
        "nested": {
          "key": "value"
        }
      }
    """
    Then the system processes the text

  Scenario: Doc string with step keywords should not trigger warnings
    # This test verifies that step keywords inside doc strings are ignored
    # and do not produce "undefined step" diagnostics
    Given a sample text loaded into the system
    """
      Given this looks like a step but it's just text
      When the parser sees this it should ignore it
      Then no warning should appear for these lines
      And neither for this one
      But this is also fine
      * even the star keyword should be ignored
    """
    Then the system processes the text

  Scenario: Doc string with step keywords
    Given a sample text loaded into the system
    """
      Given inside doc string
      When this should also be ignored
      Then no false positives here
    """
    Then the system processes the text
