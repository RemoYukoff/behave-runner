from behave import given, when, then


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
