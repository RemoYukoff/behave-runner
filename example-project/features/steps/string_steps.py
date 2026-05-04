from behave import given, when, then

from debug_output import emit


# =============================================================================
# Steps with special regex characters
# =============================================================================

@given("a file named {filename} exists")
def step_given_file(context, filename):
    emit("step_given_file", filename=filename)
    context.filename = filename


@when("I search for pattern {pattern}")
def step_when_search(context, pattern):
    emit("step_when_search", pattern=pattern)
    context.pattern = pattern


@then("the result contains {count:d} matches")
def step_then_matches(context, count):
    emit("step_then_matches", count=count)
    context.match_count = count


# =============================================================================
# Steps with quoted strings (double quotes)
# =============================================================================

@given('the message is "{message}"')
def step_given_message_double(context, message):
    emit("step_given_message_double", message=message)
    context.message = message


@then('the output shows "{expected}"')
def step_then_output_double(context, expected):
    emit("step_then_output_double", expected=expected)
    assert context.message == expected


# =============================================================================
# Steps with quoted strings (single quotes)
# =============================================================================

@given("the message is '{message}'")
def step_given_message_single(context, message):
    emit("step_given_message_single", message=message)
    context.message = message


@then("the output shows '{expected}'")
def step_then_output_single(context, expected):
    emit("step_then_output_single", expected=expected)
    assert context.message == expected


# =============================================================================
# Step with multiple decorators (matches both quote styles)
# When Ctrl+Click, VS Code will show both definitions
# =============================================================================

@given('the value is "{value}"')
@given("the value is '{value}'")
def step_given_value(context, value):
    emit("step_given_value", value=value)
    context.value = value


@then('the value equals "{expected}"')
@then("the value equals '{expected}'")
def step_then_value_equals(context, expected):
    emit("step_then_value_equals", expected=expected)
    assert context.value == expected
