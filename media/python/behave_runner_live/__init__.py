# Bundled formatter for the Behave Runner VS Code extension.
# Emits one JSON object per line (NDJSON) on stdout for live step updates.
# Requires behave>=1.2.6 (Formatter API).

from __future__ import annotations

import json
import sys
import traceback
from typing import Any, Dict, Optional

from behave.formatter.base import Formatter


def _emit(obj: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _step_location(step: Any) -> str:
    loc = getattr(step, "location", None)
    if not loc:
        return ""
    filename = getattr(loc, "filename", "") or ""
    line = getattr(loc, "line", "") or ""
    return f"{filename}:{line}"


def _step_status(step: Any) -> str:
    """Return Behave's step status name (lowercase). Includes ``undefined`` when no step definition matches."""
    st = getattr(step, "status", None)
    if st is None:
        return "unknown"
    name = getattr(st, "name", None)
    if isinstance(name, str):
        return name.lower()
    return str(st).lower()


def _step_error_text(step: Any) -> Optional[str]:
    """Error message plus Python traceback when Behave captured an exception on the step."""
    parts: list[str] = []
    msg = getattr(step, "error_message", None)
    if msg:
        t = str(msg).strip()
        if t:
            parts.append(t)
    exc = getattr(step, "exception", None)
    if exc is not None:
        tb = getattr(exc, "__traceback__", None)
        if tb is not None:
            try:
                tb_text = "".join(
                    traceback.format_exception(type(exc), exc, tb)
                ).rstrip()
                if tb_text and tb_text not in "\n".join(parts):
                    parts.append(tb_text)
            except Exception:
                pass
        else:
            es = str(exc).strip()
            if es and all(es not in p for p in parts):
                parts.append(es)
    if not parts:
        return None
    return "\n\n".join(parts)


class BehaveRunnerLiveFormatter(Formatter):
    """NDJSON stream on stdout; use as second formatter (stdout) alongside JSON file."""

    name = "behave_runner_live"
    description = "Live NDJSON stream for Behave Runner (VS Code)."

    def __init__(self, stream_opener, config):
        super().__init__(stream_opener, config)
        self._feature_name: Optional[str] = None
        self._scenario_name: Optional[str] = None

    def feature(self, feature):
        self._feature_name = getattr(feature, "name", None) or ""

    def scenario(self, scenario):
        name = getattr(scenario, "name", None) or ""
        self._scenario_name = name
        loc = getattr(scenario, "location", None)
        location = ""
        if loc:
            fn = getattr(loc, "filename", "") or ""
            line = getattr(loc, "line", "") or ""
            location = f"{fn}:{line}"
        _emit(
            {
                "event": "scenario_started",
                "feature": self._feature_name,
                "scenario": name,
                "location": location,
            }
        )

    def background(self, background):
        # Background model precedes scenarios; keep output tied to following scenario(s).
        pass

    def result(self, step):
        try:
            keyword = getattr(step, "keyword", "") or ""
            step_name = getattr(step, "name", "") or ""
            _emit(
                {
                    "event": "step_finished",
                    "feature": self._feature_name,
                    "scenario": self._scenario_name,
                    "location": _step_location(step),
                    "keyword": keyword,
                    "step": step_name,
                    "status": _step_status(step),
                    "error": _step_error_text(step),
                }
            )
        except Exception as exc:  # noqa: BLE001 — keep Behave run alive
            _emit({"event": "formatter_error", "message": str(exc)})
