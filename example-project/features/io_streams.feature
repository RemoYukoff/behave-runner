Feature: Logging and stderr demos
  Examples for Behave Runner live output: Python logging and stderr from hooks
  (`environment.py`) and from steps. Intended to be run with Behave flags such as
  `--no-logcapture` and `--no-capture-stderr` so lines appear as they are emitted.

  Scenario: Step writes to stderr and to loggers
    Given demo logging and stderr are configured for the example project
    When I write one line to stderr from a step
    And I log at INFO and WARNING from a step
    Then the io streams demo step finished

  Scenario: Second scenario for hook output between scenarios
    Given demo logging and stderr are configured for the example project
    Then the io streams demo step finished
