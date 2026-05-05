"""Steps that write to Python logging and stderr (live panel / capture demos)."""

from __future__ import annotations

import logging
import sys

from behave import given, then, when

from debug_output import emit

_steps_log = logging.getLogger("example.steps")
_other_log = logging.getLogger("example.vendor.module")


@given("demo logging and stderr are configured for the example project")
def step_io_demo_ready(context):
    emit("io_streams_ready")
    _steps_log.debug("steps: DEBUG (usually hidden when level is INFO)")
    _steps_log.info("steps: INFO from example.steps")


@when("I write one line to stderr from a step")
def step_write_stderr(context):
    emit("io_streams_stderr")
    print("[step stderr] When-step message on stderr", file=sys.stderr, flush=True)


@when("I log at INFO and WARNING from a step")
def step_log_levels(context):
    emit("io_streams_log_levels")
    _steps_log.info("steps: INFO inside When")
    _steps_log.warning("steps: WARNING inside When")
    _other_log.info("vendor.module: INFO from a second logger")


@then("the io streams demo step finished")
def step_io_demo_done(context):
    emit("io_streams_done")
    _steps_log.info("steps: INFO from Then (demo finished)")
