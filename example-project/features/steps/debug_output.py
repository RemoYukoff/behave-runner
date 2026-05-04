"""Emit one line per step to stdout (terminal / live run panel)."""


def emit(step_id: str, **fields) -> None:
    if not fields:
        print(f"[example-project] {step_id}", flush=True)
        return
    tail = " ".join(f"{k}={fields[k]!r}" for k in sorted(fields))
    print(f"[example-project] {step_id} | {tail}", flush=True)
