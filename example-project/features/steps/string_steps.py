from behave import given, when, then


# =============================================================================
# Steps with special regex characters
# =============================================================================

@given("a file named {filename} exists")
def step_given_file(context, filename):
    context.filename = filename


@when("I search for pattern {pattern}")
def step_when_search(context, pattern):
    context.pattern = pattern


@then("the result contains {count:d} matches")
def step_then_matches(context, count):
    context.match_count = count


# =============================================================================
# Steps with quoted strings (double quotes)
# =============================================================================

@given('the message is "{message}"')
def step_given_message_double(context, message):
    context.message = message


@then('the output shows "{expected}"')
def step_then_output_double(context, expected):
    assert context.message == expected


# =============================================================================
# Steps with quoted strings (single quotes)
# =============================================================================

@given("the message is '{message}'")
def step_given_message_single(context, message):
    context.message = message


@then("the output shows '{expected}'")
def step_then_output_single(context, expected):
    assert context.message == expected


# =============================================================================
# Step with multiple decorators (matches both quote styles)
# When Ctrl+Click, VS Code will show both definitions
# =============================================================================

@given('the value is "{value}"')
@given("the value is '{value}'")
def step_given_value(context, value):
    context.value = value


@then('the value equals "{expected}"')
@then("the value equals '{expected}'")
def step_then_value_equals(context, expected):
    assert context.value == expected


# =============================================================================
# Steps with doc strings (triple quoted text blocks)
# =============================================================================

@given("a sample text loaded into the system")
def step_given_sample_text(context):
    context.text_content = context.text


@then("the system processes the text")
def step_then_process_text(context):
    assert context.text_content is not None
