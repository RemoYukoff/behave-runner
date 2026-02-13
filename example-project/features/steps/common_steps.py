from behave import given, step


# =============================================================================
# @step decorator (matches any keyword: Given/When/Then)
# =============================================================================

@step("I wait for {seconds:d} seconds")
def step_wait(context, seconds):
    import time
    time.sleep(seconds)


@step("the system is ready")
def step_system_ready(context):
    context.system_ready = True


# =============================================================================
# Dual registration test: same pattern with @given and @step
# This tests that Ctrl+Click shows both options when multiple definitions match.
# Behave stores steps under keys: {"given":..., "when":..., "then":..., "step":...}
# and first looks under the specific keyword, then falls back to "step".
# =============================================================================

@given("a logged in user")
def step_given_logged_in_user(context):
    """Step registered under 'given' keyword."""
    context.user_logged_in = True
    context.login_source = "given"


@step("a logged in user")
def step_any_logged_in_user(context):
    """Step registered under 'step' keyword (matches any: Given/When/Then)."""
    context.user_logged_in = True
    context.login_source = "step"
