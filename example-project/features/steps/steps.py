from behave import given, when, then, step


# =============================================================================
# Basic integer steps (type :d)
# =============================================================================

@given("the first number is {number:d}")
def step_given_first_number(context, number):
    context.first_number = number


@when("I add {number:d}")
def step_when_add(context, number):
    context.result = context.first_number + number


@then("the result is {number:d}")
def step_then_result(context, number):
    assert context.result == number, (
        f"Expected {number}, got {context.result}"
    )


# =============================================================================
# Float steps (type :f)
# =============================================================================

@given("the price is {price:f}")
def step_given_price(context, price):
    context.price = price


@when("I apply a discount of {percent:f} percent")
def step_when_discount(context, percent):
    context.price = context.price * (1 - percent / 100)


@then("the final price is {expected:f}")
def step_then_final_price(context, expected):
    assert abs(context.price - expected) < 0.01, (
        f"Expected {expected}, got {context.price}"
    )


# =============================================================================
# Word steps (type :w)
# =============================================================================

@given("a user named {name:w}")
def step_given_user(context, name):
    context.user = {"name": name}


@when("the user changes their name to {new_name:w}")
def step_when_change_name(context, new_name):
    context.user["name"] = new_name


@then("the user name is {expected_name:w}")
def step_then_user_name(context, expected_name):
    assert context.user["name"] == expected_name


# =============================================================================
# Untyped placeholders (default: matches any string)
# =============================================================================

@given("a product called {product}")
def step_given_product(context, product):
    context.product = {"name": product}


@when("I set the description to {description}")
def step_when_description(context, description):
    context.product["description"] = description


@then("the product description is {expected}")
def step_then_description(context, expected):
    assert context.product["description"] == expected


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
# Multiple placeholders in one step
# =============================================================================

@given("a rectangle with width {width:d} and height {height:d}")
def step_given_rectangle(context, width, height):
    context.rectangle = {"width": width, "height": height}


@when("I calculate the area")
def step_when_calculate_area(context):
    context.area = context.rectangle["width"] * context.rectangle["height"]


@then("the area is {expected:d}")
def step_then_area(context, expected):
    assert context.area == expected


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
# And/But continuation steps (use existing definitions)
# These don't need new Python definitions - they reuse Given/When/Then
# =============================================================================
