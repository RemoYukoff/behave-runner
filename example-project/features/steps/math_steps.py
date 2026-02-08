from behave import given, when, then


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
# Multiple placeholders in one step (rectangle area)
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
