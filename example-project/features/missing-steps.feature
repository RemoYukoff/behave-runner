Feature: Missing Steps Test
  This feature contains steps that don't have Python definitions.
  They should show warnings in the editor.

  Scenario: Steps that exist
    Given the first number is 5
    When I add 3
    Then the result is 8

  Scenario: Steps that don't exist
    Given a customer with email "test@example.com"
    When the customer subscribes to the newsletter
    Then the customer should receive a welcome email
    And the subscription count should be 1

  Scenario: Mix of existing and missing steps
    Given a user named Alice
    When the user logs in with password "secret123"
    Then the user name is Alice
    And the user should see the dashboard
    But the login attempt should be logged

  Scenario Outline: Missing step with examples
    Given a product called <product>
    When I add <quantity> items to the cart
    Then the cart total should be <total>

    Examples:
      | product | quantity | total  |
      | Laptop  | 1        | 999.99 |
      | Mouse   | 2        | 49.98  |
