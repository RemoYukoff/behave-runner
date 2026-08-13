from behave import given, then, when

from debug_output import emit


@given("the scenario name select demo is ready")
def step_scenario_name_demo_ready(context):
    emit("scenario_name_select_ready")
    context.executed_scenario = None


@when('I mark scenario "{scenario_name}" as executed')
def step_mark_scenario_executed(context, scenario_name):
    emit("scenario_name_select_executed", scenario_name=scenario_name)
    context.executed_scenario = scenario_name


@then("the scenario name select demo finished")
def step_scenario_name_demo_finished(context):
    emit("scenario_name_select_finished", scenario_name=context.executed_scenario)
    assert context.executed_scenario, "expected a scenario name to be recorded"
