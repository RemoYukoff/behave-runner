from behave import step


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
