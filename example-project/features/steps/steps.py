from behave import given, when, then


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
