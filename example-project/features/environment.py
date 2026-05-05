"""Hooks that emit logging + stderr so Behave Runner can exercise capture flags."""

from __future__ import annotations

import logging
import sys

_hooks_log = logging.getLogger("example.hooks")


def before_all(context):
    kwargs = {
        "level": logging.INFO,
        "format": "%(levelname)s %(name)s: %(message)s",
    }
    if sys.version_info >= (3, 8):
        kwargs["force"] = True
    logging.basicConfig(**kwargs)
    _hooks_log.info("before_all: logging configured for example-project")
    print("[hooks stderr] before_all", file=sys.stderr, flush=True)


def before_feature(context, feature):
    name = getattr(feature, "name", "") or "(feature)"
    _hooks_log.info("before_feature: %s", name)
    print(f"[hooks stderr] before_feature: {name}", file=sys.stderr, flush=True)


def before_scenario(context, scenario):
    name = getattr(scenario, "name", "") or "(scenario)"
    _hooks_log.info("before_scenario: %s", name)
    print(f"[hooks stderr] before_scenario: {name}", file=sys.stderr, flush=True)


def after_scenario(context, scenario):
    name = getattr(scenario, "name", "") or "(scenario)"
    status = getattr(scenario, "status", None)
    status_name = getattr(status, "name", status) if status is not None else "?"
    _hooks_log.info("after_scenario: %s (%s)", name, status_name)
    print(f"[hooks stderr] after_scenario: {name}", file=sys.stderr, flush=True)


def after_feature(context, feature):
    name = getattr(feature, "name", "") or "(feature)"
    _hooks_log.info("after_feature: %s", name)
    print(f"[hooks stderr] after_feature: {name}", file=sys.stderr, flush=True)


def after_all(context):
    _hooks_log.info("after_all")
    print("[hooks stderr] after_all", file=sys.stderr, flush=True)
