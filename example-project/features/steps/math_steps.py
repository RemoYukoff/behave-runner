from behave import given, when, then

from debug_output import emit


# =============================================================================
# Basic integer steps (type :d)
# =============================================================================

@given("the first number is {number:d}")
def step_given_first_number(context, number):
    emit("step_given_first_number", number=number)
    context.first_number = number


@when("I add {number:d}")
def step_when_add(context, number):
    emit("step_when_add", number=number)
    context.result = context.first_number + number


@then("the result is {number:d}")
def step_then_result(context, number):
    emit("step_then_result", number=number)
    assert context.result == number, (
        f"Expected {number}, got {context.result}"
    )


# =============================================================================
# Float steps (type :f)
# =============================================================================

@given("the price is {price:f}")
def step_given_price(context, price):
    emit("step_given_price", price=price)
    context.price = price


@when("I apply a discount of {percent:f} percent")
def step_when_discount(context, percent):
    emit("step_when_discount", percent=percent)
    context.price = context.price * (1 - percent / 100)


@then("the final price is {expected:f}")
def step_then_final_price(context, expected):
    emit("step_then_final_price", expected=expected)
    assert abs(context.price - expected) < 0.01, (
        f"Expected {expected}, got {context.price}"
    )


# =============================================================================
# Multiple placeholders in one step (rectangle area)
# =============================================================================

@given("a rectangle with width {width:d} and height {height:d}")
def step_given_rectangle(context, width, height):
    emit("step_given_rectangle", width=width, height=height)
    context.rectangle = {"width": width, "height": height}


@when("I calculate the area")
def step_when_calculate_area(context):
    emit("step_when_calculate_area")
    context.area = context.rectangle["width"] * context.rectangle["height"]


@then("the area is {expected:d}")
def step_then_area(context, expected):
    emit("step_then_area", expected=expected)
    assert context.area == expected
