from behave import given, when, then

from debug_output import emit


# =============================================================================
# Word steps (type :w)
# =============================================================================

@given("a user named {name:w}")
def step_given_user(context, name):
    emit("step_given_user", name=name)
    context.user = {"name": name}


@when("the user changes their name to {new_name:w}")
def step_when_change_name(context, new_name):
    emit("step_when_change_name", new_name=new_name)
    context.user["name"] = new_name


@then("the user name is {expected_name:w}")
def step_then_user_name(context, expected_name):
    emit("step_then_user_name", expected_name=expected_name)
    assert context.user["name"] == expected_name
