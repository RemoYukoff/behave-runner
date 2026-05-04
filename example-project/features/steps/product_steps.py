from behave import given, when, then

from debug_output import emit


# =============================================================================
# Untyped placeholders (default: matches any string)
# =============================================================================

@given("a product called {product}")
def step_given_product(context, product):
    emit("step_given_product", product=product)
    context.product = {"name": product}


@when("I set the description to {description}")
def step_when_description(context, description):
    emit("step_when_description", description=description)
    context.product["description"] = description


@then("the product description is {expected}")
def step_then_description(context, expected):
    emit("step_then_description", expected=expected)
    assert context.product["description"] == expected
