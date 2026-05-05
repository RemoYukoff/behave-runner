import time

from behave import step

from debug_output import emit


# =============================================================================
# @step decorator (matches any keyword: Given/When/Then)
# =============================================================================

@step("I wait for {seconds:d} seconds")
def step_wait(context, seconds):
    emit("step_wait", seconds=seconds)
    time.sleep(seconds)


@step("I simulate a slow step for {seconds:d} seconds")
def step_slow_spinner_demo(context, seconds):
    emit("step_slow_spinner_demo", seconds=seconds)
    time.sleep(seconds)


@step("the system is ready")
def step_system_ready(context):
    emit("step_system_ready")
    context.system_ready = True
