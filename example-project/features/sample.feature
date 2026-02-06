Feature: Minimal example

  Scenario: Add two numbers
    Given the first number is 1
    When I add 2
    Then the result is 3

  Scenario: Add zero
    Given the first number is 5
    When I add 0
    Then the result is 5

  Scenario Outline: Add a number from examples
    Given the first number is <a>
    When I add <b>
    Then the result is <sum>

    Examples:
      | a | b | sum |
      | 1 | 2 | 3   |
      | 4 | 5 | 9   |
